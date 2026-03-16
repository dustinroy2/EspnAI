"""
The Dugout — Data Layer v3
Fetch and cache only. No logic. Claude reasons, we fetch.

Data sources:
  - MLB Stats API (free, official)
  - The Odds API (betting lines, ROY odds, win totals)
  - Open-Meteo (weather, no SSL issues)
  - GNews API (player news, personal life sentiment)
  - WBC via MLB Stats API (sportId=51)
"""

import json, os, time, warnings, requests
from datetime import datetime, timedelta

warnings.filterwarnings("ignore", message=".*OpenSSL.*")
warnings.filterwarnings("ignore", message=".*LibreSSL.*")

BASE_DIR  = os.path.dirname(__file__)
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

MLB_API   = "https://statsapi.mlb.com/api/v1"
ODDS_API  = "https://api.the-odds-api.com/v4"
METEO_API = "https://api.open-meteo.com/v1/forecast"
GNEWS_API = "https://gnews.io/api/v4/search"

# Load .env for API keys
def load_env():
    env = {}
    path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()

# ─── Cache ────────────────────────────────────────────────────────────────────

def cached(name, max_age_min=60):
    path = os.path.join(CACHE_DIR, f"{name}.json")
    if os.path.exists(path):
        if (time.time() - os.path.getmtime(path)) / 60 < max_age_min:
            with open(path) as f:
                return json.load(f)
    return None

def cache_write(name, data):
    with open(os.path.join(CACHE_DIR, f"{name}.json"), "w") as f:
        json.dump(data, f)
    return data

def mlb(endpoint, params=None):
    try:
        r = requests.get(f"{MLB_API}/{endpoint}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  MLB API [{endpoint}]: {e}")
        return None

# ─── Transactions ─────────────────────────────────────────────────────────────

def get_transactions(days_back=1):
    c = cached("transactions", 15)
    if c: return c
    start = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    end   = datetime.now().strftime("%Y-%m-%d")
    data  = mlb("transactions", {"startDate": start, "endDate": end})
    rows  = []
    for t in (data or {}).get("transactions", []):
        rows.append({
            "id":          t.get("id"),
            "date":        t.get("date"),
            "type":        t.get("typeDesc", ""),
            "description": t.get("description", ""),
            "player":      t.get("player", {}).get("fullName", ""),
            "team":        t.get("toTeam", {}).get("name", "") or t.get("team", {}).get("name", ""),
        })
    return cache_write("transactions", rows)

def get_injury_report():
    txns = get_transactions(days_back=7)
    return [t for t in txns if "Injured List" in t.get("type", "")
                             or "IL" in t.get("description", "")]

# ─── AAA Stats ────────────────────────────────────────────────────────────────

def get_aaa_hitters():
    c = cached("aaa_hitters", 360)
    if c: return c
    season = 2026 if datetime.now().month >= 4 else 2025
    data   = mlb("stats", {
        "stats": "season", "group": "hitting", "gameType": "R",
        "season": season, "playerPool": "all", "sportId": 11,
        "limit": 150, "sortStat": "ops", "order": "desc",
    })
    rows = []
    for group in (data or {}).get("stats", []):
        for s in group.get("splits", []):
            stat = s.get("stat", {})
            if int(stat.get("atBats", 0)) < 40: continue
            rows.append({
                "name":    s.get("player", {}).get("fullName", ""),
                "mlbTeam": s.get("team", {}).get("parentOrgName", ""),
                "ab":      int(stat.get("atBats", 0)),
                "avg":     float(stat.get("avg", 0)),
                "ops":     float(stat.get("ops", 0)),
                "hr":      int(stat.get("homeRuns", 0)),
                "sb":      int(stat.get("stolenBases", 0)),
            })
    rows.sort(key=lambda x: x["ops"], reverse=True)
    return cache_write("aaa_hitters", rows)

def get_aaa_pitchers():
    c = cached("aaa_pitchers", 360)
    if c: return c
    season = 2026 if datetime.now().month >= 4 else 2025
    data   = mlb("stats", {
        "stats": "season", "group": "pitching", "gameType": "R",
        "season": season, "playerPool": "all", "sportId": 11,
        "limit": 150, "sortStat": "era", "order": "asc",
    })
    rows = []
    for group in (data or {}).get("stats", []):
        for s in group.get("splits", []):
            stat = s.get("stat", {})
            if float(stat.get("inningsPitched", 0)) < 15: continue
            rows.append({
                "name":    s.get("player", {}).get("fullName", ""),
                "mlbTeam": s.get("team", {}).get("parentOrgName", ""),
                "ip":      float(stat.get("inningsPitched", 0)),
                "era":     float(stat.get("era", 99)),
                "whip":    float(stat.get("whip", 99)),
                "k9":      float(stat.get("strikeoutsPer9Inn", 0)),
                "saves":   int(stat.get("saves", 0)),
            })
    rows.sort(key=lambda x: x["era"])
    return cache_write("aaa_pitchers", rows)

# ─── Schedule ─────────────────────────────────────────────────────────────────

def get_todays_schedule():
    c = cached("schedule_today", 30)
    if c: return c
    today = datetime.now().strftime("%Y-%m-%d")
    data  = mlb("schedule", {"date": today, "sportId": 1})
    games = []
    for date in (data or {}).get("dates", []):
        for g in date.get("games", []):
            games.append({
                "home":   g["teams"]["home"]["team"]["name"],
                "away":   g["teams"]["away"]["team"]["name"],
                "time":   g.get("gameDate", ""),
                "status": g["status"]["detailedState"],
                "venue":  g.get("venue", {}).get("name", ""),
            })
    return cache_write("schedule_today", games)

def get_two_start_pitchers():
    c = cached("two_starters", 360)
    if c: return c
    today  = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    data   = mlb("schedule", {
        "startDate": monday.strftime("%Y-%m-%d"),
        "endDate":   sunday.strftime("%Y-%m-%d"),
        "sportId": 1, "gameType": "R,S",
        "hydrate": "probablePitcher",
    })
    counts = {}
    for date_entry in (data or {}).get("dates", []):
        game_date = date_entry.get("date")
        for game in date_entry.get("games", []):
            for side in ["home", "away"]:
                probable = game["teams"][side].get("probablePitcher", {})
                name     = probable.get("fullName")
                if not name: continue
                if name not in counts:
                    counts[name] = {"name": name, "team": game["teams"][side]["team"]["name"],
                                    "starts": [], "count": 0}
                counts[name]["starts"].append(game_date)
                counts[name]["count"] += 1
    result = sorted([p for p in counts.values() if p["count"] >= 2],
                    key=lambda x: x["count"], reverse=True)
    return cache_write("two_starters", result)

def get_weekly_game_counts():
    c = cached("weekly_games", 360)
    if c: return c
    today = datetime.now()
    end   = today + timedelta(days=7)
    data  = mlb("schedule", {
        "startDate": today.strftime("%Y-%m-%d"),
        "endDate":   end.strftime("%Y-%m-%d"),
        "sportId": 1, "gameType": "R,S",
    })
    counts = {}
    for date_entry in (data or {}).get("dates", []):
        for game in date_entry.get("games", []):
            for side in ["home", "away"]:
                team = game["teams"][side]["team"]["name"]
                counts[team] = counts.get(team, 0) + 1
    result = [{"team": t, "games": g}
              for t, g in sorted(counts.items(), key=lambda x: x[1], reverse=True)]
    return cache_write("weekly_games", result)

def get_batting_orders():
    c = cached("batting_orders", 30)
    if c: return c
    today = datetime.now().strftime("%Y-%m-%d")
    data  = mlb("schedule", {"date": today, "sportId": 1, "hydrate": "lineups"})
    lineups = {}
    for date_entry in (data or {}).get("dates", []):
        for game in date_entry.get("games", []):
            for side in ["home", "away"]:
                team    = game["teams"][side]["team"]["name"]
                players = game.get("lineups", {}).get(f"{side}Players", [])
                if players:
                    lineups[team] = [{"name": p.get("fullName", ""), "order": i+1}
                                     for i, p in enumerate(players)]
    return cache_write("batting_orders", lineups)

# ─── NEW: Betting Odds (The Odds API) ────────────────────────────────────────

# Get free API key at: https://the-odds-api.com (500 requests/month free)
# Add to .env: ODDS_API_KEY=your_key_here

def get_mlb_win_totals():
    """
    Team win total over/unders from sportsbooks.
    Critical for projecting save opportunities, run environment, counting stats.
    A closer on a 92-win team has 2x the save opps of a closer on a 72-win team.
    """
    c = cached("win_totals", 1440)  # cache 24 hours
    if c: return c

    key = ENV.get("ODDS_API_KEY")
    if not key:
        print("  No ODDS_API_KEY in .env — skipping win totals")
        return []

    try:
        r = requests.get(f"{ODDS_API}/sports/baseball_mlb/events", params={
            "apiKey": key,
            "markets": "totals",
        }, timeout=8)
        # Win totals are season-long futures, use outrights endpoint
        r2 = requests.get(f"{ODDS_API}/sports/baseball_mlb/odds", params={
            "apiKey":   key,
            "regions":  "us",
            "markets":  "totals",
            "oddsFormat": "american",
        }, timeout=8)
        data = r2.json() if r2.status_code == 200 else []
        return cache_write("win_totals", data if isinstance(data, list) else [])
    except Exception as e:
        print(f"  Odds API error: {e}")
        return []

def get_roy_odds():
    """
    Rookie of the Year betting odds.
    Oddsmakers aggregate scout reports + spring training into one probability.
    A prospect with 15/1 ROY odds = market believes MLB debut + contribution by midseason.
    """
    c = cached("roy_odds", 1440)
    if c: return c

    key = ENV.get("ODDS_API_KEY")
    if not key:
        return []

    try:
        r = requests.get(f"{ODDS_API}/sports/baseball_mlb/odds", params={
            "apiKey":   key,
            "regions":  "us",
            "markets":  "pitcher_rookie_of_the_year,batter_rookie_of_the_year",
            "oddsFormat": "american",
        }, timeout=8)
        data = r.json() if r.status_code == 200 else []
        # Parse into clean format
        players = []
        for event in (data if isinstance(data, list) else []):
            for bookmaker in event.get("bookmakers", [])[:1]:  # just use first book
                for market in bookmaker.get("markets", []):
                    for outcome in market.get("outcomes", []):
                        players.append({
                            "name":   outcome.get("name", ""),
                            "odds":   outcome.get("price", 0),
                            "market": market.get("key", ""),
                        })
        players.sort(key=lambda x: x["odds"])
        return cache_write("roy_odds", players)
    except Exception as e:
        print(f"  ROY odds error: {e}")
        return []

def get_player_props(player_name):
    """
    Individual player season props (HR total, K total, AVG).
    When prop line > fantasy consensus ADP implies → draft arbitrage.
    """
    c = cached(f"props_{player_name.replace(' ','_')}", 1440)
    if c: return c

    key = ENV.get("ODDS_API_KEY")
    if not key:
        return {}

    try:
        r = requests.get(f"{ODDS_API}/sports/baseball_mlb/odds", params={
            "apiKey":   key,
            "regions":  "us",
            "markets":  "batter_home_runs,batter_hits,pitcher_strikeouts",
            "oddsFormat": "american",
        }, timeout=8)
        # This is a simplified version — full prop parsing requires event IDs
        return cache_write(f"props_{player_name.replace(' ','_')}", {})
    except Exception as e:
        return {}

# ─── NEW: Weather via Open-Meteo (no SSL issues) ─────────────────────────────

# Ballpark coordinates + park factors
BALLPARKS = {
    "Wrigley Field":     {"lat": 41.9484, "lon": -87.6553, "team": "Chicago Cubs",
                          "out_effect": "HR +40%", "in_effect": "pitcher park"},
    "Fenway Park":       {"lat": 42.3467, "lon": -71.0972, "team": "Boston Red Sox"},
    "Coors Field":       {"lat": 39.7559, "lon": -104.994, "team": "Colorado Rockies",
                          "altitude_note": "All stats inflated +15%"},
    "Oracle Park":       {"lat": 37.7786, "lon": -122.389, "team": "San Francisco Giants",
                          "wind_note": "Bay wind suppresses HR"},
    "Yankee Stadium":    {"lat": 40.8296, "lon": -73.9262, "team": "New York Yankees"},
    "Camden Yards":      {"lat": 39.2838, "lon": -76.6216, "team": "Baltimore Orioles"},
    "loanDepot park":    {"lat": 25.7781, "lon": -80.2197, "team": "Miami Marlins",
                          "humidity_note": "High humidity = ball carries further"},
}

def get_weather_flags():
    """
    Weather conditions affecting today's games.
    Uses Open-Meteo — free, no key, no SSL issues on Python 3.9.
    """
    c = cached("weather", 60)
    if c: return c

    today_games = get_todays_schedule()
    playing_teams = {g["home"] for g in today_games} | {g["away"] for g in today_games}
    flags = []

    for park, info in BALLPARKS.items():
        if info["team"] not in playing_teams:
            continue
        try:
            r = requests.get(METEO_API, params={
                "latitude":       info["lat"],
                "longitude":      info["lon"],
                "current_weather": True,
                "hourly":         "temperature_2m,precipitation_probability,windspeed_10m,winddirection_10m",
                "temperature_unit": "fahrenheit",
                "windspeed_unit": "mph",
                "forecast_days":  1,
                "timezone":       "auto",
            }, timeout=8)

            if r.status_code != 200:
                continue

            w       = r.json()
            current = w.get("current_weather", {})
            temp_f  = current.get("temperature", 70)
            wind_mph= current.get("windspeed", 0)
            wind_deg= current.get("winddirection", 0)

            # Get hourly precip probability for game time (~7pm local)
            hourly      = w.get("hourly", {})
            precip_prob = max(hourly.get("precipitation_probability", [0])[:20], default=0)

            alerts = []

            # Wrigley wind direction analysis
            if park == "Wrigley Field":
                # Wind blowing toward Lake Michigan (NE, E) = ball carries OUT
                if 45 <= wind_deg <= 135 and wind_mph > 10:
                    alerts.append(f"💨 Wind OUT {wind_mph:.0f}mph — HR rates +40%. Stack Cubs/opponent hitters.")
                elif 225 <= wind_deg <= 315 and wind_mph > 10:
                    alerts.append(f"💨 Wind IN {wind_mph:.0f}mph — pitcher's park today. Fade Cubs hitters.")

            # Cold weather suppresses hitting
            if temp_f < 45:
                alerts.append(f"🥶 {temp_f:.0f}°F — cold suppresses hitting. Pitchers get +0.3 ERA edge.")
            elif temp_f < 55:
                alerts.append(f"🌡️ Cool ({temp_f:.0f}°F) — slight pitcher advantage.")

            # Rain risk
            if precip_prob > 60:
                alerts.append(f"🌧️ {precip_prob}% rain probability — SP start uncertain. Stream carefully.")
            elif precip_prob > 40:
                alerts.append(f"⛅ {precip_prob}% rain chance — monitor before lineup lock.")

            # Humidity boost (Miami, Houston dome excluded)
            if park == "loanDepot park" and temp_f > 75:
                alerts.append(f"💧 High humidity ({temp_f:.0f}°F) — ball carries further, HR rates elevated.")

            if alerts or info.get("altitude_note"):
                entry = {
                    "park":   park,
                    "team":   info["team"],
                    "temp_f": round(temp_f),
                    "wind":   f"{wind_mph:.0f}mph",
                    "alerts": alerts,
                }
                if info.get("altitude_note"):
                    entry["note"] = info["altitude_note"]
                flags.append(entry)

        except Exception as e:
            pass  # weather never blocks

    return cache_write("weather", flags)

# ─── NEW: Player News + Personal Life Sentiment ───────────────────────────────

# Negative personal events that affect draft value:
# DUI, domestic incident, divorce, suspension, substance, legal trouble
# Positive: marriage, new child, return home, contract extension

NEGATIVE_KEYWORDS = [
    "arrested", "dui", "dwi", "domestic", "assault", "suspended", "suspension",
    "divorce", "lawsuit", "charged", "indicted", "substance", "alcohol",
    "altercation", "incident", "violated", "violation", "investigation",
]
POSITIVE_KEYWORDS = [
    "married", "engagement", "baby", "father", "extension signed", "contract year",
    "returned home", "hometown", "comeback", "healthy", "surgery successful",
    "cleared", "activated",
]

def get_player_news(player_name):
    """
    Fetch recent news articles about a player.
    Scores sentiment for personal life issues that affect draft value.
    Uses GNews API (free tier: 100 req/day).
    Add to .env: GNEWS_API_KEY=your_key_here
    Get free key at: https://gnews.io
    """
    cache_key = f"news_{player_name.replace(' ','_')}"
    c = cached(cache_key, 360)
    if c: return c

    key = ENV.get("GNEWS_API_KEY")
    if not key:
        return {"player": player_name, "articles": [], "sentiment": "neutral", "flags": []}

    try:
        r = requests.get(GNEWS_API, params={
            "q":       f'"{player_name}" baseball',
            "lang":    "en",
            "country": "us",
            "max":     5,
            "token":   key,
        }, timeout=8)

        articles = []
        flags    = []
        sentiment = "neutral"
        draft_modifier = 0  # -1 to -3 negative, +1 positive

        if r.status_code == 200:
            for art in r.json().get("articles", []):
                title = art.get("title", "").lower()
                desc  = art.get("description", "").lower()
                text  = title + " " + desc

                neg_hits = [kw for kw in NEGATIVE_KEYWORDS if kw in text]
                pos_hits = [kw for kw in POSITIVE_KEYWORDS if kw in text]

                severity = 0
                if any(kw in text for kw in ["domestic", "assault", "arrested", "indicted"]):
                    severity = -3
                    sentiment = "RED_FLAG"
                elif any(kw in text for kw in ["dui", "dwi", "suspended", "violation"]):
                    severity = -2
                    sentiment = "CONCERN"
                elif neg_hits:
                    severity = -1
                    sentiment = "MONITOR"
                elif pos_hits:
                    severity = 1
                    if sentiment == "neutral":
                        sentiment = "POSITIVE"

                draft_modifier += severity

                articles.append({
                    "title":     art.get("title", ""),
                    "url":       art.get("url", ""),
                    "date":      art.get("publishedAt", ""),
                    "flags":     neg_hits + pos_hits,
                    "severity":  severity,
                })

        result = {
            "player":          player_name,
            "articles":        articles,
            "sentiment":       sentiment,
            "draft_modifier":  max(-3, min(1, draft_modifier)),
            "flags":           list(set([f for a in articles for f in a["flags"]])),
        }
        return cache_write(cache_key, result)
    except Exception as e:
        return {"player": player_name, "articles": [], "sentiment": "neutral", "flags": []}

# ─── NEW: World Baseball Classic ─────────────────────────────────────────────

def get_wbc_stats():
    """
    WBC performance data via MLB Stats API (sportId=51 for WBC).
    Cross-reference with:
    - Historians note: position players translate ~70%, pitchers ~40%
    - Pitch count fatigue: pitchers with 80+ WBC IP → flag for April dead arm
    - Team winners get confidence boost for 6-8 weeks (The Historian)
    """
    c = cached("wbc_stats", 720)
    if c: return c

    # WBC 2026 — sportId=51, season=2026
    hitter_data = mlb("stats", {
        "stats":      "season",
        "group":      "hitting",
        "gameType":   "S",  # international
        "season":     2026,
        "playerPool": "all",
        "sportId":    51,   # WBC
        "limit":      100,
        "sortStat":   "ops",
        "order":      "desc",
    })

    pitcher_data = mlb("stats", {
        "stats":      "season",
        "group":      "pitching",
        "gameType":   "S",
        "season":     2026,
        "playerPool": "all",
        "sportId":    51,
        "limit":      100,
        "sortStat":   "era",
        "order":      "asc",
    })

    hitters  = []
    pitchers = []

    for group in (hitter_data or {}).get("stats", []):
        for s in group.get("splits", []):
            stat = s.get("stat", {})
            ab   = int(stat.get("atBats", 0))
            if ab < 5: continue
            hitters.append({
                "name":    s.get("player", {}).get("fullName", ""),
                "country": s.get("team", {}).get("name", ""),
                "ab":      ab,
                "avg":     float(stat.get("avg", 0)),
                "ops":     float(stat.get("ops", 0)),
                "hr":      int(stat.get("homeRuns", 0)),
                "sb":      int(stat.get("stolenBases", 0)),
                # Historian: 70% translation rate for hitters
                "translated_ops": round(float(stat.get("ops", 0)) * 0.70, 3),
            })

    for group in (pitcher_data or {}).get("stats", []):
        for s in group.get("splits", []):
            stat = s.get("stat", {})
            ip   = float(stat.get("inningsPitched", 0))
            if ip < 2: continue
            era  = float(stat.get("era", 99))
            pitchers.append({
                "name":    s.get("player", {}).get("fullName", ""),
                "country": s.get("team", {}).get("name", ""),
                "ip":      ip,
                "era":     era,
                "whip":    float(stat.get("whip", 99)),
                "k9":      float(stat.get("strikeoutsPer9Inn", 0)),
                # Historian: 40% translation, flag dead arm if 80+ IP
                "translated_era":  round(era * (1/0.40) if era > 0 else 99, 2),
                "fatigue_flag":    ip >= 15,  # heavy WBC workload = April dead arm risk
            })

    hitters.sort(key=lambda x: x["ops"], reverse=True)
    pitchers.sort(key=lambda x: x["era"])

    result = {
        "hitters":  hitters,
        "pitchers": pitchers,
        "note":     "Historian: hitters translate 70%, pitchers 40%. WBC winner gets 6-8wk confidence boost.",
        "fetched":  datetime.now().isoformat(),
    }
    return cache_write("wbc_stats", result)

def get_wbc_fatigue_flags():
    """
    Pitchers who overworked in WBC → flag for April dead arm.
    The Talent Scout: Yu Darvish 2023 is the case study.
    """
    wbc = get_wbc_stats()
    return [p for p in wbc.get("pitchers", []) if p.get("fatigue_flag")]

# ─── NEW: Service Time Calculator ────────────────────────────────────────────

# The Bookkeeper: service time manipulation is the most predictable event
# in baseball. Teams delay callups ~2 weeks to save a year of team control.
# After April 14, a player has accrued enough time that teams stop delaying.

SERVICE_TIME_TARGETS_2026 = [
    # Prospects teams are likely holding down to manipulate service time
    # Update this list as spring training progresses
    # Format: name, mlb_team, eta, reason
    {"name": "Jackson Holliday",   "team": "Baltimore Orioles",    "eta": "April 14", "reason": "Service time — 2nd year"},
    {"name": "Jackson Chourio",    "team": "Milwaukee Brewers",    "eta": "April 14", "reason": "Service time — 2nd year"},
    {"name": "Paul Skenes",        "team": "Pittsburgh Pirates",   "eta": "Opening Day", "reason": "Ace, no delay expected"},
    {"name": "Junior Caminero",    "team": "Tampa Bay Rays",       "eta": "April 14", "reason": "Service time — 2nd year"},
]

def get_service_time_callups():
    """
    Players being held in AAA for service time reasons.
    The magic date is ~April 14 — after this, teams have no incentive to delay.
    These are automatic waiver wire adds on that date.
    """
    today     = datetime.now()
    april_14  = datetime(today.year, 4, 14)
    days_away = (april_14 - today).days

    result = []
    for p in SERVICE_TIME_TARGETS_2026:
        result.append({
            **p,
            "days_until_eta": max(0, days_away) if p["eta"] == "April 14" else 0,
            "alert": days_away <= 7 and p["eta"] == "April 14",
        })
    return result


# ─── Statcast Expected Stats (Baseball Savant — no key needed) ───────────────
#
# Two signals that matter for fantasy:
#   xBA  = expected batting average based on exit velo + launch angle
#   xERA = expected ERA based on quality of contact allowed
#
# BA >> xBA  → batter is OVERPERFORMING, regression risk (sell high)
# xBA >> BA  → batter is UNDERPERFORMING, breakout candidate (buy low)
# ERA >> xERA → pitcher has been UNLUCKY, buy-low target
# xERA >> ERA → pitcher has been LUCKY, regression risk
#
# Endpoint: https://baseballsavant.mlb.com/leaderboard/expected_statistics
# Returns CSV, free, no API key.

SAVANT_URL = "https://baseballsavant.mlb.com/leaderboard/expected_statistics"

def get_statcast_batting(year=2025, min_pa="q"):
    """
    Batters: xBA, xSLG, xwOBA vs actual BA, SLG, wOBA.
    Positive ba_diff  = BA > xBA  = overperforming → regression risk.
    Negative ba_diff  = xBA > BA  = underperforming → breakout candidate.
    """
    cache_key = f"statcast_batting_{year}"
    c = cached(cache_key, 360)
    if c: return c

    try:
        r = requests.get(SAVANT_URL, params={
            "type": "batter", "year": year,
            "position": "", "team": "", "min": min_pa, "csv": "true",
        }, timeout=15, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
        r.raise_for_status()

        import csv, io
        rows = []
        reader = csv.DictReader(io.StringIO(r.text))
        for row in reader:
            try:
                ba    = float(row.get("ba",    0) or 0)
                xba   = float(row.get("xba",   0) or 0)
                woba  = float(row.get("woba",  0) or 0)
                xwoba = float(row.get("xwoba", 0) or 0)
                slg   = float(row.get("slg",   0) or 0)
                xslg  = float(row.get("xslg",  0) or 0)
                if ba == 0 and xba == 0: continue
                first = row.get("first_name", "").strip()
                last  = row.get("last_name",  "").strip()
                rows.append({
                    "name":       f"{first} {last}".strip(),
                    "pa":         int(row.get("pa", 0) or 0),
                    "ba":         ba,
                    "xba":        xba,
                    "ba_diff":    round(ba - xba, 3),   # + = overperforming
                    "slg":        slg,
                    "xslg":       xslg,
                    "slg_diff":   round(slg - xslg, 3),
                    "woba":       woba,
                    "xwoba":      xwoba,
                    "woba_diff":  round(woba - xwoba, 3),
                    "barrel_pct": float(row.get("barrel_batted_rate", 0) or 0),
                    "hard_hit":   float(row.get("hard_hit_percent", 0) or 0),
                    "exit_velo":  float(row.get("exit_velocity_avg", 0) or 0),
                })
            except (ValueError, TypeError):
                continue
        rows.sort(key=lambda x: x["xwoba"], reverse=True)
        return cache_write(cache_key, rows)
    except Exception as e:
        print(f"  Statcast batting [{year}]: {e}")
        return []

def get_statcast_pitching(year=2025, min_pa="q"):
    """
    Pitchers: xERA vs ERA — find unlucky arms (buy low) and lucky arms (avoid).
    Positive era_diff  = ERA > xERA  = pitcher unlucky → buy low.
    Negative era_diff  = ERA < xERA  = pitcher lucky   → regression risk.
    """
    cache_key = f"statcast_pitching_{year}"
    c = cached(cache_key, 360)
    if c: return c

    try:
        r = requests.get(SAVANT_URL, params={
            "type": "pitcher", "year": year,
            "position": "", "team": "", "min": min_pa, "csv": "true",
        }, timeout=15, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
        r.raise_for_status()

        import csv, io
        rows = []
        reader = csv.DictReader(io.StringIO(r.text))
        for row in reader:
            try:
                era   = float(row.get("era",   99) or 99)
                xera  = float(row.get("xera",  99) or 99)
                woba  = float(row.get("woba",  0)  or 0)
                xwoba = float(row.get("xwoba", 0)  or 0)
                if era == 99 and xera == 99: continue
                first = row.get("first_name", "").strip()
                last  = row.get("last_name",  "").strip()
                rows.append({
                    "name":       f"{first} {last}".strip(),
                    "pa":         int(row.get("pa", 0) or 0),
                    "era":        era,
                    "xera":       xera,
                    "era_diff":   round(era - xera, 2),  # + = unlucky (buy low)
                    "woba":       woba,
                    "xwoba":      xwoba,
                    "woba_diff":  round(woba - xwoba, 3),
                    "barrel_pct": float(row.get("barrel_batted_rate", 0) or 0),
                    "hard_hit":   float(row.get("hard_hit_percent", 0) or 0),
                    "exit_velo":  float(row.get("exit_velocity_avg", 0) or 0),
                    "whiff_pct":  float(row.get("whiff_percent", 0) or 0),
                })
            except (ValueError, TypeError):
                continue
        rows.sort(key=lambda x: x["xera"])
        return cache_write(cache_key, rows)
    except Exception as e:
        print(f"  Statcast pitching [{year}]: {e}")
        return []

def get_statcast_signals(year=2025):
    """
    Pre-computed actionable signals: sell-highs, buy-lows, lucky/unlucky arms.
    Thresholds tuned for fantasy relevance (not just statistical significance).
    """
    batting  = get_statcast_batting(year)
    pitching = get_statcast_pitching(year)

    return {
        # Batters BA significantly above xBA → regression coming
        "regression_risks": sorted(
            [b for b in batting if b["ba_diff"] >= 0.025 and b["pa"] >= 100],
            key=lambda x: -x["ba_diff"]
        )[:12],

        # Batters xBA significantly above BA → breakout / buy low
        "breakout_candidates": sorted(
            [b for b in batting if b["ba_diff"] <= -0.025 and b["pa"] >= 100],
            key=lambda x: x["ba_diff"]
        )[:12],

        # Pitchers ERA significantly above xERA → unlucky, buy low
        "unlucky_pitchers": sorted(
            [p for p in pitching if p["era_diff"] >= 0.50 and p["pa"] >= 80],
            key=lambda x: -x["era_diff"]
        )[:10],

        # Pitchers ERA significantly below xERA → lucky, regression risk
        "lucky_pitchers": sorted(
            [p for p in pitching if p["era_diff"] <= -0.50 and p["pa"] >= 80],
            key=lambda x: x["era_diff"]
        )[:10],

        "year": year,
        "batter_count":  len(batting),
        "pitcher_count": len(pitching),
    }


if __name__ == "__main__":
    print("Testing data layer v3...")
    print(f"Transactions:      {len(get_transactions())} results")
    print(f"AAA hitters:       {len(get_aaa_hitters())} results")
    print(f"Two-starters:      {len(get_two_start_pitchers())} this week")
    print(f"Weekly games:      {len(get_weekly_game_counts())} teams")
    print(f"Weather:           {len(get_weather_flags())} flags")
    print(f"ROY odds:          {len(get_roy_odds())} players")
    print(f"WBC stats:         {len(get_wbc_stats().get('hitters',[]))} hitters")
    print(f"WBC fatigue flags: {len(get_wbc_fatigue_flags())} pitchers flagged")
    print(f"Service time:      {len(get_service_time_callups())} targets")
    sigs = get_statcast_signals()
    print(f"Statcast batting:  {sigs['batter_count']} batters loaded")
    print(f"Statcast pitching: {sigs['pitcher_count']} pitchers loaded")
    print(f"  Regression risks:    {len(sigs['regression_risks'])}")
    print(f"  Breakout candidates: {len(sigs['breakout_candidates'])}")
    print(f"  Unlucky arms:        {len(sigs['unlucky_pitchers'])}")
    print(f"  Lucky arms:          {len(sigs['lucky_pitchers'])}")
    print("Done.")

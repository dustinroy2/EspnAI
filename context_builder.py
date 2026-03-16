"""
The Dugout — Context Builder v2
Assembles the full intelligence brief for Claude.
Incorporates: betting odds, WBC, personal news, service time,
weather, two-starters, game counts, category gaps, storylines.

The mathematician: Claude already knows baseball. Feed it better
data and get exponentially better decisions.
"""

import json
from datetime import datetime
from data_layer import (
    get_transactions, get_aaa_hitters, get_aaa_pitchers,
    get_todays_schedule, get_injury_report,
    get_two_start_pitchers, get_batting_orders,
    get_weekly_game_counts, get_weather_flags,
    get_roy_odds, get_mlb_win_totals,
    get_player_news, get_wbc_stats, get_wbc_fatigue_flags,
    get_service_time_callups,
)

# ─── League Context ────────────────────────────────────────────────────────────

LEAGUE_CONTEXT = """
LEAGUE: FIELD OF DREAMS FANTASY BASEBALL (12-team H2H Each Category)
SCORING: Batting — R, HR, RBI, SB, AVG, OPS | Pitching — K, QS, W, SV, ERA, WHIP
ROSTER: C, 1B, 2B, 3B, SS, 3×OF, 2×UTIL, 2×P, 3×SP, 2×RP + 6 bench + 3 IL
TRANSACTIONS: 7 per matchup | Trade deadline: Aug 3 2026
KEY STRATEGY:
- SB is scarcest — prioritize heavily in draft
- QS rewards workhorses who pitch deep, not just K machines
- OPS rewards OBP + power, not sluggers alone
- SV: stream closers, only roster elite ones with job security
- ERA/WHIP ratio cats — one bad start craters a week
- Two-start pitchers = highest single weekly ROI
- Category gap analysis: focus on battlegrounds, concede unwinnable
"""

# ─── Category Gap Analysis ────────────────────────────────────────────────────

def analyze_gaps(my_stats, opp_stats, days_remaining=4):
    cats = {
        "batting":  [("r","R"),("hr","HR"),("rbi","RBI"),("sb","SB"),("avg","AVG"),("ops","OPS")],
        "pitching": [("k","K"),("qs","QS"),("w","W"),("sv","SV"),("era","ERA"),("whip","WHIP")],
    }
    result = {"BATTLEGROUND": [], "LOCKED_WIN": [], "CONCEDE": []}

    for group, pairs in cats.items():
        for key, label in pairs:
            mine = float(my_stats.get(key, 0) or 0)
            opp  = float(opp_stats.get(key, 0) or 0)
            if key in ["era", "whip"]:
                winning = mine < opp
                gap_pct = abs(opp - mine) / max(opp, 0.01)
            else:
                winning = mine > opp
                gap_pct = abs(mine - opp) / max(mine, 0.01)

            if winning and gap_pct > 0.25:
                status = "LOCKED_WIN"
            elif not winning and gap_pct > 0.35 and days_remaining < 3:
                status = "CONCEDE"
            else:
                status = "BATTLEGROUND"

            result[status].append({
                "category": label, "mine": mine,
                "opponent": opp,   "winning": winning,
            })
    return result

# ─── Enrichment Functions ─────────────────────────────────────────────────────

def enrich_with_game_counts(roster):
    counts = {item["team"]: item["games"] for item in get_weekly_game_counts()}
    for player in roster:
        player["games_this_week"] = counts.get(player.get("proTeam", ""), "?")
    return roster

def enrich_with_win_totals(roster):
    """Attach bookmaker win total to each player's team — affects counting stat ceiling."""
    win_totals = get_mlb_win_totals()
    # win_totals is raw odds data — Claude will interpret it
    return {"roster": roster, "win_totals_raw": win_totals[:5] if win_totals else []}

def build_storylines(roster):
    stories = []
    recent_txns = {t["player"]: t["description"] for t in get_transactions(days_back=30)}
    wbc_fatigue = {p["name"] for p in get_wbc_fatigue_flags()}
    service_time = {p["name"]: p for p in get_service_time_callups()}

    for player in roster:
        name    = player.get("name", "")
        signals = []

        if name in recent_txns:
            signals.append(f"Recent move: {recent_txns[name][:80]}")

        status = player.get("injuryStatus", "ACTIVE")
        if status and status not in ["ACTIVE", "ACTIVE_WITH_QUALIFIER"]:
            signals.append(f"Injury: {status}")

        games = player.get("games_this_week", "?")
        if isinstance(games, int):
            if games >= 7:
                signals.append(f"🔥 {games} games this week — max volume")
            elif games <= 4:
                signals.append(f"⚠️ Only {games} games — consider benching")

        if name in wbc_fatigue:
            signals.append("⚠️ WBC overwork — April dead arm risk. Monitor velocity.")

        if name in service_time:
            st = service_time[name]
            signals.append(f"📅 Service time target — ETA {st['eta']} ({st['reason']})")

        if signals:
            stories.append({"player": name, "signals": signals})
    return stories

def build_two_start_summary(roster):
    two_starters     = get_two_start_pitchers()
    two_start_names  = {p["name"]: p for p in two_starters}
    roster_names     = {p.get("name", "") for p in roster}
    on_roster, on_wire = [], []
    for name, data in two_start_names.items():
        entry = {"name": name, "team": data["team"], "starts": data["starts"]}
        (on_roster if name in roster_names else on_wire).append(entry)
    return {"on_your_roster": on_roster, "available_on_wire": on_wire[:10]}

def build_waiver_brief(free_agents, gap_analysis):
    battleground_cats = {g["category"] for g in gap_analysis.get("BATTLEGROUND", [])}
    for fa in free_agents:
        pos = fa.get("position", "")
        relevant = []
        if "SB" in battleground_cats and pos in ["CF","SS","2B","LF"]: relevant.append("SB")
        if "SV" in battleground_cats and pos == "RP":                   relevant.append("SV")
        if "QS" in battleground_cats and pos == "SP":                   relevant.append("QS")
        if "HR" in battleground_cats and pos in ["1B","OF","DH"]:       relevant.append("HR")
        fa["battleground_relevance"] = relevant
    free_agents.sort(key=lambda x: len(x.get("battleground_relevance", [])), reverse=True)
    return free_agents

def build_news_flags(roster):
    """
    Check top players for personal news / character issues.
    The Psychologist: domestic incidents, DUIs, divorce = draft value penalty.
    Only check top roster players to conserve API calls.
    """
    flags = []
    for player in roster[:8]:  # top 8 roster players
        name = player.get("name", "")
        if not name:
            continue
        news = get_player_news(name)
        if news.get("sentiment") not in ["neutral", None]:
            flags.append({
                "player":         name,
                "sentiment":      news["sentiment"],
                "draft_modifier": news.get("draft_modifier", 0),
                "flags":          news.get("flags", []),
                "top_headline":   news["articles"][0]["title"] if news.get("articles") else "",
            })
    return flags

def build_wbc_brief():
    """
    WBC performance context.
    Historian: hitters 70% translation, pitchers 40%.
    Winners get 6-8 week confidence boost.
    """
    wbc    = get_wbc_stats()
    return {
        "top_hitters":  wbc.get("hitters", [])[:8],
        "top_pitchers": wbc.get("pitchers", [])[:5],
        "fatigue_flags":get_wbc_fatigue_flags(),
        "note":         wbc.get("note", ""),
    }

def build_odds_brief():
    """Betting market intelligence for draft and waiver decisions."""
    roy    = get_roy_odds()
    return {
        "roy_odds":    roy[:10],
        "note": "Bookmaker: ROY odds aggregate scout reports + spring training. "
                "Use for late-round draft targets and early waiver wire adds.",
    }

# ─── Master Brief ─────────────────────────────────────────────────────────────

def build_full_brief(team_data, my_stats=None, opp_stats=None, days_remaining=4):
    roster      = team_data.get("team", {}).get("roster", [])
    free_agents = team_data.get("freeAgents", [])
    matchup     = team_data.get("matchup", {})
    standings   = team_data.get("standings", [])
    team_name   = team_data.get("team", {}).get("teamName", "My Team")
    wins        = team_data.get("team", {}).get("wins", 0)
    losses      = team_data.get("team", {}).get("losses", 0)

    roster  = enrich_with_game_counts(roster)
    gaps    = analyze_gaps(my_stats or {}, opp_stats or {}, days_remaining)

    return {
        "league_context":       LEAGUE_CONTEXT,
        "team":                 {"name": team_name, "record": f"{wins}W-{losses}L"},
        "roster":               roster,
        "category_gaps":        gaps,
        "two_start_pitchers":   build_two_start_summary(roster),
        "player_storylines":    build_storylines(roster),
        "news_flags":           build_news_flags(roster),
        "waiver_wire":          build_waiver_brief(free_agents, gaps)[:15],
        "weather_flags":        get_weather_flags(),
        "batting_orders_today": get_batting_orders(),
        "injury_report":        get_injury_report()[:10],
        "aaa_trending_hitters": [p for p in get_aaa_hitters() if p.get("ops",0) > 0.900][:8],
        "aaa_trending_arms":    [p for p in get_aaa_pitchers() if p.get("era",99) < 3.00][:5],
        "wbc":                  build_wbc_brief(),
        "betting_odds":         build_odds_brief(),
        "service_time_targets": get_service_time_callups(),
        "current_matchup":      matchup,
        "standings":            standings,
    }

# ─── Claude Prompt ────────────────────────────────────────────────────────────

def build_claude_prompt(brief):
    gaps = brief["category_gaps"]
    return f"""You are the lead analyst for The Dugout — a sophisticated MLB fantasy baseball assistant.
Your brain contains: quant analyst, traditional scout, sports bettor, bookkeeper,
sports psychologist, historian, meteorologist, and arbitrage finder.

{brief['league_context']}

TEAM: {brief['team']['name']} ({brief['team']['record']})

ROSTER (with weekly game counts):
{json.dumps(brief['roster'], indent=2)}

CATEGORY GAPS THIS WEEK:
- BATTLEGROUND — focus all decisions here: {[c['category'] for c in gaps.get('BATTLEGROUND',[])]}
- LOCKED WINS — maintain only: {[c['category'] for c in gaps.get('LOCKED_WIN',[])]}
- CONCEDE — don't waste transactions: {[c['category'] for c in gaps.get('CONCEDE',[])]}

TWO-START PITCHERS THIS WEEK (highest ROI):
On roster: {json.dumps(brief['two_start_pitchers']['on_your_roster'])}
Available: {json.dumps(brief['two_start_pitchers']['available_on_wire'])}

PLAYER FLAGS & STORYLINES:
{json.dumps(brief['player_storylines'])}

PERSONAL NEWS FLAGS (affects trust/start decisions):
{json.dumps(brief['news_flags'])}

WAIVER WIRE (ranked by your category needs):
{json.dumps(brief['waiver_wire'])}

WEATHER TODAY:
{json.dumps(brief['weather_flags'])}

WBC PERFORMANCE (translate: hitters 70%, pitchers 40%):
Top hitters: {json.dumps(brief['wbc']['top_hitters'][:5])}
Fatigue flags: {json.dumps(brief['wbc']['fatigue_flags'])}

BETTING MARKET INTELLIGENCE:
{json.dumps(brief['betting_odds'])}

SERVICE TIME TARGETS (automatic adds on April 14):
{json.dumps(brief['service_time_targets'])}

AAA TRENDING:
Hitters: {json.dumps(brief['aaa_trending_hitters'])}
Arms: {json.dumps(brief['aaa_trending_arms'])}

INJURY REPORT: {json.dumps(brief['injury_report'])}

CURRENT MATCHUP: {json.dumps(brief['current_matchup'])}

Using ALL of the above, return ONLY valid JSON — no markdown, no backticks:
{{
  "start": [{{"player": "Name", "reason": "specific — cite game count, matchup, stats"}}],
  "sit":   [{{"player": "Name", "reason": "specific reason"}}],
  "pickup":[{{"player": "Name", "position": "SP", "reason": "which category + why now", "drop": "who or null"}}],
  "drop":  [{{"player": "Name", "reason": "specific"}}],
  "two_start_alert": [{{"player": "Name", "team": "T", "starts": ["d1","d2"], "on_roster": true}}],
  "weather_alert": "one sentence if weather affects today's decisions, else null",
  "wbc_alert": "one sentence if any WBC performer or fatigue flag affects decisions, else null",
  "service_time_alert": "one sentence about upcoming service time callups to target, else null",
  "news_alert": "one sentence if any personal news affects a start/drop decision, else null",
  "matchup": {{"opponent": "name", "edge": "your specific edge", "projection": "Win/Loss/Toss-up"}},
  "summary": "2-3 sentences: record, top priority, single most important insight from all data"
}}"""


if __name__ == "__main__":
    print("Testing context builder v2...")
    brief = build_full_brief({
        "team": {"teamName": "We're the Millers", "wins": 0, "losses": 0, "roster": []},
        "freeAgents": [], "matchup": {}, "standings": [],
    })
    print(f"WBC hitters:       {len(brief['wbc']['top_hitters'])}")
    print(f"WBC fatigue flags: {len(brief['wbc']['fatigue_flags'])}")
    print(f"Service time:      {len(brief['service_time_targets'])}")
    print(f"ROY odds:          {len(brief['betting_odds']['roy_odds'])}")
    print(f"Weather flags:     {len(brief['weather_flags'])}")
    print("Brief built.")

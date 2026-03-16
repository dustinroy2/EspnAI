"""
The Dugout — ESPN Fantasy Baseball Assistant
v0.4 — Firefox cookie extraction (no login window needed)
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import urllib.request
import urllib.error
from context_builder import build_full_brief, build_claude_prompt

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

@app.route("/")
def home():
    return app.send_static_file("index.html")

BASE_DIR     = os.path.dirname(__file__)
COOKIES_FILE = os.path.join(BASE_DIR, ".espn_cookies.json")
CACHE_FILE   = os.path.join(BASE_DIR, ".analysis_cache.json")
ENV_FILE     = os.path.join(BASE_DIR, ".env")

# ─── API Key ───────────────────────────────────────────────────────────────────

def load_api_key():
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("ANTHROPIC_API_KEY")

def save_api_key(key):
    with open(ENV_FILE, "w") as f:
        f.write(f"ANTHROPIC_API_KEY={key}\n")

# ─── Cookie Storage ────────────────────────────────────────────────────────────

def save_cookies(espn_s2, swid):
    with open(COOKIES_FILE, "w") as f:
        json.dump({"espn_s2": espn_s2, "swid": swid}, f)

def load_cookies():
    if os.path.exists(COOKIES_FILE):
        with open(COOKIES_FILE) as f:
            return json.load(f)
    return None

def clear_cookies():
    if os.path.exists(COOKIES_FILE):
        os.remove(COOKIES_FILE)

# ─── Analysis Cache ────────────────────────────────────────────────────────────

def save_cache(data):
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return None

# ─── Firefox Cookie Extraction ─────────────────────────────────────────────────

def extract_espn_cookies_from_firefox():
    """
    Read ESPN cookies directly from your Firefox profile.
    No login window — just make sure you're logged into ESPN in Firefox.
    """
    import browser_cookie3
    cookies = browser_cookie3.firefox(domain_name=".espn.com")
    cookie_map = {c.name: c.value for c in cookies}
    espn_s2 = cookie_map.get("espn_s2")
    swid = cookie_map.get("SWID")
    if not espn_s2 or not swid:
        raise Exception(
            "ESPN cookies not found in Firefox. "
            "Make sure you're logged into ESPN at espn.com in Firefox, then try again."
        )
    return espn_s2, swid

# ─── ESPN Data Layer ───────────────────────────────────────────────────────────

def get_owner(t):
    if hasattr(t, 'owners') and t.owners:
        return t.owners[0]
    if hasattr(t, 'owner'):
        return t.owner
    return t.team_name

def serialize_team(team):
    roster = []
    for player in team.roster:
        roster.append({
            "name": player.name,
            "position": player.position,
            "proTeam": player.proTeam,
            "injuryStatus": player.injuryStatus,
            "stats": player.stats if hasattr(player, "stats") else {}
        })
    return {
        "teamName": team.team_name,
        "owner": get_owner(team),
        "wins": team.wins,
        "losses": team.losses,
        "standing": team.standing,
        "roster": roster,
    }

def serialize_matchup(matchup):
    if not matchup:
        return None
    return {
        "homeTeam": matchup.home_team.team_name,
        "awayTeam": matchup.away_team.team_name,
        "homeScore": matchup.home_score,
        "awayScore": matchup.away_score,
    }

# ─── Claude API ────────────────────────────────────────────────────────────────

def call_claude(prompt, api_key):
    payload = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        return result["content"][0]["text"]



# ─── API Routes ───────────────────────────────────────────────────────────────

@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "hasSavedCookies":    load_cookies() is not None,
        "hasApiKey":          load_api_key() is not None,
        "hasCachedAnalysis":  load_cache() is not None,
    })

@app.route("/api/apikey", methods=["POST"])
def set_api_key():
    key = request.json.get("key", "").strip()
    if not key.startswith("sk-ant-"):
        return jsonify({"error": "Invalid API key format"}), 400
    save_api_key(key)
    return jsonify({"success": True})

@app.route("/api/cookies/clear", methods=["POST"])
def delete_cookies():
    clear_cookies()
    return jsonify({"success": True})

@app.route("/api/login", methods=["POST"])
def espn_login():
    """Grab ESPN cookies from the user's Firefox browser."""
    try:
        espn_s2, swid = extract_espn_cookies_from_firefox()
        save_cookies(espn_s2, swid)
        print("✅ ESPN cookies grabbed from Firefox")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/connect", methods=["POST"])
def connect():
    data      = request.json
    league_id = data.get("leagueId")
    year      = data.get("year", 2026)
    team_name = data.get("teamName", "").lower()

    saved = load_cookies()
    if not saved:
        return jsonify({"error": "Not logged in. Click 'Connect Firefox' first."}), 400
    if not league_id:
        return jsonify({"error": "League ID is required."}), 400

    try:
        from espn_api.baseball import League
        league = League(
            league_id=int(league_id), year=int(year),
            espn_s2=saved["espn_s2"], swid=saved["swid"]
        )
    except Exception as e:
        return jsonify({"error": f"Failed to connect to ESPN: {str(e)}"}), 500

    my_team = None
    for team in league.teams:
        if team_name and team_name in team.team_name.lower():
            my_team = team
            break
    if not my_team:
        my_team = league.teams[0]

    standings = [
        {"name": t.team_name, "owner": get_owner(t), "wins": t.wins, "losses": t.losses, "standing": t.standing}
        for t in sorted(league.teams, key=lambda x: x.standing)
    ]

    matchup_data = None
    try:
        for bs in league.box_scores(league.current_week):
            if bs.home_team == my_team or bs.away_team == my_team:
                matchup_data = serialize_matchup(bs)
                break
    except:
        pass

    free_agents = []
    try:
        for p in league.free_agents(size=20):
            free_agents.append({
                "name": p.name, "position": p.position,
                "proTeam": p.proTeam, "injuryStatus": p.injuryStatus
            })
    except:
        pass

    return jsonify({
        "team":        serialize_team(my_team),
        "standings":   standings,
        "matchup":     matchup_data,
        "freeAgents":  free_agents,
        "leagueName":  getattr(league.settings, "name", "My League"),
        "currentWeek": getattr(league, "current_week", None),
    })


@app.route("/api/analyze", methods=["POST"])
def analyze():
    api_key = load_api_key()
    if not api_key:
        return jsonify({"error": "No API key configured."}), 400

    team_data = request.json.get("teamData")
    if not team_data:
        return jsonify({"error": "No team data provided."}), 400

    try:
        brief  = build_full_brief(team_data)
        prompt = build_claude_prompt(brief)
        raw    = call_claude(prompt, api_key)
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        decisions = json.loads(clean)
        save_cache(decisions)
        return jsonify({"decisions": decisions})
    except urllib.error.HTTPError as e:
        return jsonify({"error": f"Claude API error: {e.code}"}), 500
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse AI response. Try again."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/cache", methods=["GET"])
def get_cache():
    return jsonify({"decisions": load_cache()})



@app.route("/api/wire", methods=["GET"])
def get_wire():
    """Return scalper alert log for the Wire tab."""
    log_file = os.path.join(BASE_DIR, ".scalper_log.json")
    if os.path.exists(log_file):
        with open(log_file) as f:
            alerts = json.load(f)
    else:
        alerts = []
    return jsonify({"alerts": alerts})

@app.route("/api/farm", methods=["GET"])
def get_farm():
    """Return AAA stats and recent transactions for the Farm tab."""
    from data_layer import get_aaa_hitters, get_aaa_pitchers, get_transactions
    return jsonify({
        "aaa_hitters":   get_aaa_hitters(),
        "aaa_pitchers":  get_aaa_pitchers(),
        "transactions":  get_transactions(days_back=3),
    })

@app.route("/api/two-starters", methods=["GET"])
def get_two_starters():
    """Return two-start pitchers this week."""
    from data_layer import get_two_start_pitchers
    return jsonify({"pitchers": get_two_start_pitchers()})

@app.route("/api/statcast", methods=["GET"])
def get_statcast():
    """
    Statcast xBA/xERA signals from Baseball Savant.
    Returns regression risks, breakout candidates, unlucky/lucky pitchers.
    No API key needed — Baseball Savant is free.

    Query params:
      year=2025  (use 2025 until 2026 has enough PA data)
    """
    from data_layer import get_statcast_signals, get_statcast_batting, get_statcast_pitching
    year = request.args.get("year", 2025, type=int)
    try:
        signals = get_statcast_signals(year)
        return jsonify({
            "signals":  signals,
            "year":     year,
            "source":   "Baseball Savant / Expected Statistics",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Draft Room Endpoints ──────────────────────────────────────────────────────

_draft_session = {}

@app.route("/api/draft/init", methods=["POST"])
def draft_init():
    data      = request.json or {}
    league_id = data.get("leagueId", 904188626)
    year      = data.get("year", 2026)
    team_name = data.get("teamName", "We're the Millers")

    saved = load_cookies()
    if not saved:
        return jsonify({"error": "Not logged in. Go to Hub and click Connect Firefox first."}), 400
    try:
        from espn_api.baseball import League
        league = League(league_id=int(league_id), year=int(year),
                        espn_s2=saved["espn_s2"], swid=saved["swid"])
        _draft_session["league"]    = league
        _draft_session["league_id"] = league_id
        _draft_session["year"]      = year
        _draft_session["teamName"]  = team_name
        return jsonify({"success": True, "league": getattr(league.settings, "name", "League")})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/draft/state", methods=["GET"])
def draft_state():
    league = _draft_session.get("league")
    if not league:
        saved = load_cookies()
        if not saved:
            return jsonify({"error": "Not connected — go to Hub and login first."})
        try:
            from espn_api.baseball import League
            league = League(league_id=_draft_session.get("league_id", 904188626),
                            year=_draft_session.get("year", 2026),
                            espn_s2=saved["espn_s2"], swid=saved["swid"])
            _draft_session["league"] = league
        except Exception as e:
            return jsonify({"error": str(e)})

    try:
        draft      = league.draft or []
        picks_made = len(draft)
        num_teams  = len(league.teams)
        num_rounds = 23
        total_picks = num_teams * num_rounds

        round_num   = (picks_made // num_teams) + 1
        pick_in_rnd = (picks_made % num_teams) + 1
        team_idx    = (num_teams - pick_in_rnd) if round_num % 2 == 0 else (pick_in_rnd - 1)

        teams_sorted = sorted(league.teams,
            key=lambda t: t.draft_projected_rank if hasattr(t, "draft_projected_rank") else t.standing)

        on_clock_team = teams_sorted[team_idx] if team_idx < len(teams_sorted) else None
        on_clock_name = on_clock_team.team_name if on_clock_team else "—"

        my_team_name = _draft_session.get("teamName", "We're the Millers")
        my_team = next((t for t in league.teams if my_team_name.lower() in t.team_name.lower()),
                       league.teams[0])

        my_picks = []
        for pick in draft:
            if hasattr(pick, "team") and pick.team and pick.team.team_name == my_team.team_name:
                my_picks.append({
                    "playerName": getattr(pick, "playerName", str(pick)),
                    "roundNum":   getattr(pick, "round_num", "?"),
                    "pickNum":    getattr(pick, "round_pick", "?"),
                })

        upcoming = []
        for i in range(picks_made, min(picks_made + 20, total_picks)):
            rnd  = (i // num_teams) + 1
            pos  = i % num_teams
            tidx = (num_teams - 1 - pos) if rnd % 2 == 0 else pos
            t    = teams_sorted[tidx] if tidx < len(teams_sorted) else None
            existing = getattr(draft[i], "playerName", None) if i < len(draft) else None
            upcoming.append({
                "overallPick": i + 1,
                "roundNum":    rnd,
                "teamName":    t.team_name if t else "?",
                "isMine":      (t.team_name == my_team.team_name) if t else False,
                "isCurrent":   (i == picks_made),
                "isDone":      (i < picks_made),
                "playerName":  existing,
            })

        available = []
        try:
            for p in league.free_agents(size=200):
                available.append({
                    "name":         p.name,
                    "position":     p.position,
                    "proTeam":      p.proTeam,
                    "injuryStatus": p.injuryStatus,
                })
        except Exception:
            pass

        return jsonify({
            "onClock":     on_clock_name,
            "isMyTurn":    on_clock_name == my_team.team_name,
            "round":       round_num,
            "overallPick": picks_made + 1,
            "picksMade":   picks_made,
            "numTeams":    num_teams,
            "myTeam":      my_team.team_name,
            "myPicks":     my_picks,
            "upcoming":    upcoming,
            "available":   available,
        })
    except Exception as e:
        return jsonify({"error": str(e)})


@app.route("/api/draft/projections/status", methods=["GET"])
def draft_proj_status():
    import time as _time
    from draft_engine import PROJ_CACHE
    if os.path.exists(PROJ_CACHE):
        age_hours = (_time.time() - os.path.getmtime(PROJ_CACHE)) / 3600
        if age_hours < 168:  # 7 days — projections don't change meaningfully day-to-day
            with open(PROJ_CACHE) as f:
                proj = json.load(f)
            return jsonify({"fresh": True, "player_count": len(proj), "age_hours": round(age_hours, 1)})
    return jsonify({"fresh": False, "player_count": 0})


@app.route("/api/draft/projections", methods=["GET"])
def draft_projections_get():
    """Return the full cached projection map {playerName: {R,HR,RBI,...}}"""
    from draft_engine import PROJ_CACHE
    if os.path.exists(PROJ_CACHE):
        with open(PROJ_CACHE) as f:
            proj = json.load(f)
        # Normalise — cache may be a list or a name-keyed dict
        if isinstance(proj, list):
            proj = {p["name"]: p for p in proj if p.get("name")}
        return jsonify({"projections": proj, "player_count": len(proj)})
    return jsonify({"projections": {}, "player_count": 0})


@app.route("/api/draft/projections", methods=["POST"])
def draft_projections():
    api_key = load_api_key()
    if not api_key:
        return jsonify({"error": "No API key — configure it in Hub first."}), 400

    players = request.json.get("players", [])
    if not players:
        return jsonify({"error": "No players provided."}), 400

    from draft_engine import generate_projections_prompt, PROJ_CACHE

    BATCH    = 25
    all_proj = {}

    for i in range(0, len(players), BATCH):
        batch  = players[i:i+BATCH]
        prompt = generate_projections_prompt(batch)
        try:
            raw   = call_claude(prompt, api_key)
            clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            proj  = json.loads(clean)
            if isinstance(proj, list):
                for p in proj:
                    if p.get("name"):
                        all_proj[p["name"]] = p
            elif isinstance(proj, dict):
                # Could be name-keyed or index-keyed — normalise
                for k, v in proj.items():
                    if isinstance(v, dict) and v.get("name"):
                        all_proj[v["name"]] = v
                    elif isinstance(v, dict):
                        all_proj[k] = v
        except Exception as e:
            print(f"  Projection batch {i//BATCH+1} error: {e}")
            continue

    os.makedirs(os.path.dirname(PROJ_CACHE), exist_ok=True)
    with open(PROJ_CACHE, "w") as f:
        json.dump(all_proj, f)

    return jsonify({"success": True, "player_count": len(all_proj)})


@app.route("/api/draft/on-clock", methods=["POST"])
def draft_on_clock():
    api_key = load_api_key()
    if not api_key:
        return jsonify({"error": "No API key."}), 400

    data  = request.json or {}
    picks = data.get("currentPicks", [])
    avail = data.get("available", [])
    rnd   = data.get("roundNum", 1)
    slots = data.get("slotsRemaining", 23)

    from draft_engine import (score_roster, build_optimal_team, get_gap_analysis,
                               score_player, PROJ_CACHE)

    projections = {}
    if os.path.exists(PROJ_CACHE):
        with open(PROJ_CACHE) as f:
            projections = json.load(f)

    try:
        roster_score = score_roster(picks, projections, {})
        optimal      = build_optimal_team(avail, projections, slots)
        gaps         = get_gap_analysis(roster_score.scores, optimal.scores, avail, projections, rnd)

        scored = []
        for p in avail[:60]:
            try:
                ps = score_player(p, projections, {"round": rnd, "gaps": gaps})
                scored.append({
                    "name":      ps.name,
                    "sgp":       round(ps.sgp, 2),
                    "health":    ps.health,
                    "adp_value": round(ps.adp_value, 1),
                    "position":  p.get("position", "?"),
                    "proTeam":   p.get("proTeam", "?"),
                })
            except Exception:
                continue
        scored.sort(key=lambda x: x["sgp"], reverse=True)

        return jsonify({
            "rosterScore": roster_score.scores,
            "overall":     roster_score.overall,
            "gaps":        [{"cat": g.cat, "urgency": g.urgency, "note": g.note} for g in gaps],
            "topPicks":    scored[:20],
            "optimal":     [p.get("name", "") for p in (optimal.players or [])[:5]],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/draft/mock-results", methods=["POST"])
def draft_mock_results():
    """
    Fetch completed mock draft picks from an ESPN practice draft.
    Pass the mock draft league ID (from the ESPN URL) and your team ID.
    """
    saved = load_cookies()
    if not saved:
        return jsonify({"error": "Not logged in."}), 400

    import urllib.request as _ur

    data = request.json or {}
    mock_league_id = data.get("leagueId")
    team_id = data.get("teamId", 19)
    swid = saved["swid"]

    if not mock_league_id:
        return jsonify({"error": "Mock draft league ID required."}), 400

    try:
        year = _draft_session.get("year", 2026)
        base = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/{year}/segments/0/leagues/{mock_league_id}"
        headers = {
            "Cookie": f"espn_s2={saved['espn_s2']}; SWID={swid}",
            "Accept": "application/json",
        }

        # Get draft picks
        req = _ur.Request(f"{base}?view=mDraftDetail", headers=headers)
        with _ur.urlopen(req) as resp:
            draft_data = json.loads(resp.read())

        dd = draft_data.get("draftDetail", {})
        picks = dd.get("picks", [])

        # Find the user's team if not specified
        if not team_id:
            req2 = _ur.Request(f"{base}?view=mTeam", headers=headers)
            with _ur.urlopen(req2) as resp2:
                team_data = json.loads(resp2.read())
            for t in team_data.get("teams", []):
                owners = t.get("owners", [])
                if swid in str(owners):
                    team_id = t["id"]
                    break

        # Get player names from rosters
        req3 = _ur.Request(f"{base}?view=mRoster", headers=headers)
        with _ur.urlopen(req3) as resp3:
            roster_data = json.loads(resp3.read())

        id_to_name = {}
        id_to_pos = {}
        POS_MAP = {1:"SP",2:"C",3:"1B",4:"2B",5:"3B",6:"SS",7:"LF",8:"CF",9:"RF",10:"DH",11:"RP"}
        for team in roster_data.get("teams", []):
            for entry in team.get("roster", {}).get("entries", []):
                pid = entry.get("playerId")
                pinfo = entry.get("playerPoolEntry", {}).get("player", {})
                id_to_name[pid] = pinfo.get("fullName", f"Player #{pid}")
                id_to_pos[pid] = POS_MAP.get(pinfo.get("defaultPositionId", 0), "?")

        # Also try to get names from the draft picks for unfilled rosters
        # (in-progress drafts may not have full roster data)
        if not id_to_name:
            # Fetch player info for all picked player IDs
            picked_ids = [p["playerId"] for p in picks if p.get("playerId", -1) > 0]
            # We'll resolve names below from the available player pool
            pass

        # Build results
        your_picks = []
        all_picks = []
        for p in sorted(picks, key=lambda x: x.get("overallPickNumber", 0)):
            pid = p.get("playerId", -1)
            if pid <= 0:
                continue
            name = id_to_name.get(pid, f"Player #{pid}")
            pos = id_to_pos.get(pid, "?")
            pick_data = {
                "round": p.get("roundId"),
                "overall": p.get("overallPickNumber"),
                "teamId": p.get("teamId"),
                "name": name,
                "pos": pos,
                "isMine": p.get("teamId") == team_id,
            }
            all_picks.append(pick_data)
            if p.get("teamId") == team_id:
                your_picks.append(pick_data)

        # Get draft settings
        ds = draft_data.get("settings", {}).get("draftSettings", {})

        return jsonify({
            "mockLeagueId": mock_league_id,
            "teamId": team_id,
            "draftType": ds.get("type", "SNAKE"),
            "inProgress": dd.get("inProgress", False),
            "drafted": dd.get("drafted", False),
            "totalPicks": len([p for p in picks if p.get("playerId", -1) > 0]),
            "yourPicks": your_picks,
            "allPicks": all_picks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/draft/espn-adp", methods=["GET"])
def draft_espn_adp():
    """Fetch real ESPN ADP + rankings for top 300 players."""
    saved = load_cookies()
    if not saved:
        return jsonify({"error": "Not logged in."}), 400

    import urllib.request as _ur
    import urllib.error as _ue

    try:
        league_id = _draft_session.get("league_id", 904188626)
        year = _draft_session.get("year", 2026)
        base = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/{year}/segments/0/leagues/{league_id}"
        url = f"{base}?view=kona_player_info&scoringPeriodId=0"

        all_players = []
        for offset in range(0, 300, 50):
            filter_header = json.dumps({
                "players": {
                    "filterStatus": {"value": ["FREEAGENT", "WAIVERS", "ONTEAM"]},
                    "filterSlotIds": {"value": []},
                    "filterRanksForScoringPeriodIds": {"value": [0]},
                    "filterRanksForRankTypes": {"value": ["STANDARD"]},
                    "sortDraftRanks": {"sortPriority": 1, "sortAsc": True, "value": "STANDARD"},
                    "limit": 50,
                    "offset": offset,
                    "filterStatsForTopScoringPeriodIds": {"value": 1}
                }
            })
            req = _ur.Request(url, headers={
                "Cookie": f"espn_s2={saved['espn_s2']}; SWID={saved['swid']}",
                "Accept": "application/json",
                "x-fantasy-filter": filter_header,
            })
            with _ur.urlopen(req) as resp:
                data = json.loads(resp.read())

            for p in data.get("players", []):
                info = p.get("player", {})
                ownership = info.get("ownership", {})
                ranks = info.get("draftRanksByRankType", {})
                std_rank = ranks.get("STANDARD", {}).get("rank", 999)

                # Map ESPN slot IDs to position names
                slots = info.get("eligibleSlots", [])
                pos = info.get("defaultPositionId", 0)
                POS_MAP = {1:"SP",2:"C",3:"1B",4:"2B",5:"3B",6:"SS",7:"LF",8:"CF",9:"RF",10:"DH",11:"RP"}
                pos_name = POS_MAP.get(pos, "UTIL")

                all_players.append({
                    "id": p.get("id"),
                    "name": info.get("fullName", "?"),
                    "espnADP": round(ownership.get("averageDraftPosition", 999), 1),
                    "espnRank": std_rank,
                    "pos": pos_name,
                    "proTeam": info.get("proTeam", "?"),
                    "percentOwned": round(ownership.get("percentOwned", 0), 1),
                })

        return jsonify({"players": all_players, "count": len(all_players)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/draft/board", methods=["GET"])
def draft_board_get():
    """Load saved draft board state."""
    path = os.path.join(BASE_DIR, ".cache", "draft_board.json")
    if os.path.exists(path):
        with open(path) as f:
            return jsonify(json.load(f))
    return jsonify({"picks": [], "rounds": {}, "notes": {}})

@app.route("/api/draft/board", methods=["POST"])
def draft_board_save():
    """Save draft board state — picks, round targets, notes."""
    os.makedirs(os.path.join(BASE_DIR, ".cache"), exist_ok=True)
    path = os.path.join(BASE_DIR, ".cache", "draft_board.json")
    with open(path, "w") as f:
        json.dump(request.json, f)
    return jsonify({"success": True})


if __name__ == "__main__":
    print("🏟️  The Dugout — http://localhost:5050")
    print(f"{'✅' if load_cookies()  else '⚠️ '} ESPN cookies: {'found' if load_cookies()  else 'not found — click Connect Firefox in app'}")
    print(f"{'✅' if load_api_key() else '⚠️ '} Anthropic key: {'found' if load_api_key() else 'not found — run setup.py'}")
    app.run(debug=True, port=5050)

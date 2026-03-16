"""
The Dugout — Draft Engine
=========================
Pure math. No ESPN calls. No Claude calls.
Consumes: projections (from one cached Sonnet call) + live data layer signals.
Produces: category scores 0-100, optimal team sim, gap analysis with notes.

Public API:
    score_roster(picks, projections, context) -> RosterScore
    build_optimal_team(available, projections, slots_remaining) -> OptimalTeam
    get_gap_analysis(my_scores, optimal_scores, available, projections, round_num) -> list[GapNote]
    score_player(player, projections, context) -> PlayerScore
    generate_projections_prompt(player_list) -> str   # fed to Sonnet once/day
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import TypedDict
import json
import os
import time

# ─── League constants ─────────────────────────────────────────────────────────

CATS_BAT = ["R", "HR", "RBI", "SB", "AVG", "OPS"]
CATS_PIT = ["K", "QS", "W", "SV", "ERA", "WHIP"]
CATS     = CATS_BAT + CATS_PIT
NUM_TEAMS = 12
NUM_ROUNDS = 23

# Lower is better for ERA/WHIP — affects scoring direction
LOWER_IS_BETTER = {"ERA", "WHIP"}

# Projection cache file — written by the daily Sonnet call
BASE_DIR      = os.path.dirname(__file__)
PROJ_CACHE    = os.path.join(BASE_DIR, ".cache", "projections_2026.json")
ENGINE_CACHE  = os.path.join(BASE_DIR, ".cache", "engine_cache.json")

# ─── Type definitions ─────────────────────────────────────────────────────────

class PlayerProj(TypedDict):
    name:    str
    team:    str
    pos:     str
    adp:     float
    R:   float; HR:  float; RBI: float; SB:  float
    AVG: float; OPS: float; K:   float; QS:  float
    W:   float; SV:  float; ERA: float; WHIP: float
    health_pct:   int    # 0-100
    age:          int
    confidence:   int    # 0-100 — how confident the projection is

@dataclass
class RosterScore:
    scores:  dict[str, int]          # cat -> 0-100
    overall: int                     # average across all cats
    picks:   int                     # how many players on roster

@dataclass
class OptimalTeam:
    players:    list[PlayerProj]     # best available picks for remaining slots
    scores:     dict[str, int]       # projected final category scores
    overall:    int
    ceiling:    int                  # best possible overall if optimal from here

@dataclass
class GapNote:
    cat:       str
    my_score:  int
    opt_score: int
    gap:       int
    note:      str       # ← the money — "fixable rounds 8-10", "LOCKED", etc
    urgency:   str       # NOW | SOON | WAIT | LOCK | PUNT

@dataclass
class PlayerScore:
    name:        str
    sgp:         float           # Standings Gain Points estimate
    health:      int             # 0-100
    adp_value:   float           # our_rank - adp (positive = undervalued)
    category_fit: dict[str, int] # cat -> contribution score 0-3
    signals:     list[str]       # human-readable war room signals
    verdict:     str             # one sentence
    overall:     int             # 0-100

# ─── Projection cache ─────────────────────────────────────────────────────────

def load_projections() -> dict[str, PlayerProj]:
    """Load today's projections from cache. Returns {} if stale or missing."""
    if not os.path.exists(PROJ_CACHE):
        return {}
    age_hours = (time.time() - os.path.getmtime(PROJ_CACHE)) / 3600
    if age_hours > 20:
        return {}
    try:
        with open(PROJ_CACHE) as f:
            data = json.load(f)
        return {p["name"]: p for p in data}
    except Exception:
        return {}

def save_projections(players: list[PlayerProj]) -> None:
    os.makedirs(os.path.dirname(PROJ_CACHE), exist_ok=True)
    with open(PROJ_CACHE, "w") as f:
        json.dump(players, f, indent=2)

def projections_are_fresh() -> bool:
    return bool(load_projections())

# ─── Sonnet prompt builder ─────────────────────────────────────────────────────

def generate_projections_prompt(player_list: list[dict]) -> str:
    """
    Build the one prompt fed to claude-sonnet-4-20250514 once per day.
    Returns a string ready to send as the user message.
    The system prompt should instruct: respond only with valid JSON array.
    """
    names = [f"{p['name']} ({p.get('pos','?')}, {p.get('team','?')})" for p in player_list]
    names_block = "\n".join(f"{i+1}. {n}" for i, n in enumerate(names))

    return f"""You are a 2026 MLB fantasy baseball projection system.
League scoring: H2H each category — R, HR, RBI, SB, AVG, OPS (batting) and K, QS, W, SV, ERA, WHIP (pitching).

Generate 2026 season projections for each player below. Apply:
- Age curves (peak 27-29, decline after 32 for hitters, 34 for pitchers)
- Park factors (Coors +15% HR, Fenway +8% HR, etc.)
- Role/lineup context (leadoff vs cleanup, rotation spot, closer vs setup)
- Spring training signals and injury history
- Service time delays where applicable

Return ONLY a valid JSON array. No preamble, no markdown, no backticks.
Each object must have exactly these keys:
  name, team, pos, adp, R, HR, RBI, SB, AVG, OPS, K, QS, W, SV, ERA, WHIP,
  health_pct, age, confidence

Use 0 for stats that don't apply (e.g. ERA=0 for hitters).
health_pct: 0-100 (100 = full season, healthy)
confidence: 0-100 (100 = very high confidence in projection)

Players:
{names_block}
"""

# ─── Category scoring ─────────────────────────────────────────────────────────

# Expected per-player contribution for a championship-level roster
# These are calibrated for a 12-team H2H league — the "100" baseline
CHAMP_THRESHOLDS: dict[str, float] = {
    "R":    95,   "HR":   28,   "RBI":  90,  "SB":   20,
    "AVG":  0.272,"OPS":  0.835,"K":    185, "QS":   14,
    "W":    13,   "SV":   22,   "ERA":  3.55,"WHIP": 1.18,
}

def _cat_score_single(cat: str, value: float, picks: int) -> int:
    """Score one category value against the championship threshold. Returns 0-100."""
    if picks == 0:
        return 0
    thresh = CHAMP_THRESHOLDS.get(cat, 1)
    if thresh == 0:
        return 0
    if cat in LOWER_IS_BETTER:
        # For ERA/WHIP, lower = better. 0 means no pitchers drafted yet.
        if value == 0:
            return 0
        ratio = thresh / value          # >1 means we beat threshold
    else:
        ratio = value / thresh
    return min(100, max(0, int(ratio * 100)))

# Full roster championship totals — calibrated for 12-team H2H, 23-man roster
# Batting: ~10 starters + 4 bench producing counting stats
# Pitching: 5 SP + 2 RP producing K/QS/W/SV
ROSTER_TOTALS: dict[str, float] = {
    "R":    1100, "HR":   290, "RBI":  1000, "SB":  200,
    "K":    900,  "QS":   90,  "W":    100,  "SV":   38,
}

def score_roster(
    picks: list[PlayerProj],
    projections: dict[str, PlayerProj],
) -> RosterScore:
    """
    Score a roster across all 12 categories vs full-season championship totals.
    Counting stats scored against expected full-23-man totals.
    Rate stats (AVG/OPS/ERA/WHIP) scored as per-player averages.
    Returns per-category scores 0-100 and overall average.
    """
    if not picks:
        return RosterScore(scores={c: 0 for c in CATS}, overall=0, picks=0)

    totals: dict[str, float] = {c: 0.0 for c in CATS}
    bat_count = 0
    pit_count = 0

    for pick in picks:
        proj = projections.get(pick.get("name", ""), pick)
        is_pit = _is_pitcher(proj)
        if is_pit:
            pit_count += 1
        else:
            bat_count += 1
        for cat in CATS:
            val = proj.get(cat, 0) or 0
            if cat in LOWER_IS_BETTER and val == 0:
                continue
            totals[cat] += float(val)

    scores: dict[str, int] = {}
    for cat in CATS:
        if cat in ("ERA", "WHIP"):
            if pit_count == 0:
                scores[cat] = 0
            else:
                avg_val = totals[cat] / pit_count
                scores[cat] = _cat_score_single(cat, avg_val, len(picks))
        elif cat in ("AVG", "OPS"):
            if bat_count == 0:
                scores[cat] = 0
            else:
                avg_val = totals[cat] / bat_count
                scores[cat] = _cat_score_single(cat, avg_val, len(picks))
        else:
            # Counting stats: score against full-roster championship total
            champ_total = ROSTER_TOTALS.get(cat, CHAMP_THRESHOLDS.get(cat, 1) * NUM_ROUNDS)
            ratio = totals[cat] / max(champ_total, 1)
            scores[cat] = min(100, max(0, int(ratio * 100)))

    overall = sum(scores.values()) // len(CATS) if scores else 0
    return RosterScore(scores=scores, overall=overall, picks=len(picks))

def _is_pitcher(player: dict) -> bool:
    pos = (player.get("pos") or player.get("position") or "").upper()
    return pos in ("SP", "RP", "P")

# ─── Optimal team simulation ──────────────────────────────────────────────────

def build_optimal_team(
    available: list[dict],
    projections: dict[str, PlayerProj],
    current_picks: list[dict],
    slots_remaining: int,
) -> OptimalTeam:
    """
    Greedy sim: from available players, pick the best remaining roster
    that maximises overall category score. Returns projected final team.
    """
    if slots_remaining <= 0 or not available:
        rs = score_roster(current_picks, projections)
        return OptimalTeam(players=[], scores=rs.scores, overall=rs.overall, ceiling=rs.overall)

    # Score each available player by their marginal contribution
    scored = []
    for p in available:
        proj = projections.get(p.get("name", ""), p)
        marginal = _marginal_value(proj, current_picks, projections)
        scored.append((marginal, p))

    scored.sort(key=lambda x: x[0], reverse=True)
    optimal_adds = [p for _, p in scored[:slots_remaining]]

    final_roster = current_picks + optimal_adds
    rs = score_roster(final_roster, projections)

    # Ceiling = score if we could pick optimally from full pool
    ceiling = min(100, rs.overall + max(0, 15 - slots_remaining))

    return OptimalTeam(
        players=optimal_adds,
        scores=rs.scores,
        overall=rs.overall,
        ceiling=ceiling,
    )

def _marginal_value(
    player: dict,
    current_picks: list[dict],
    projections: dict[str, PlayerProj],
) -> float:
    """How much does adding this player improve the overall team score?"""
    before = score_roster(current_picks, projections).overall
    after  = score_roster(current_picks + [player], projections).overall
    return float(after - before)

# ─── Gap analysis ─────────────────────────────────────────────────────────────

def get_gap_analysis(
    my_scores:     dict[str, int],
    optimal_scores: dict[str, int],
    available:     list[dict],
    projections:   dict[str, PlayerProj],
    round_num:     int,
    picks_remaining: int,
) -> list[GapNote]:
    """
    For each category, compute the gap and produce a contextual note.
    This is where the scout language lives — not in a Claude prompt.
    """
    notes = []
    for cat in CATS:
        my  = my_scores.get(cat, 0)
        opt = optimal_scores.get(cat, 0)
        gap = opt - my

        note, urgency = _build_gap_note(
            cat, my, opt, gap, available, projections, round_num, picks_remaining
        )
        notes.append(GapNote(
            cat=cat, my_score=my, opt_score=opt,
            gap=gap, note=note, urgency=urgency
        ))

    return sorted(notes, key=lambda n: n.gap, reverse=True)

def _elite_sources_remaining(cat: str, available: list[dict], projections: dict) -> int:
    """Count elite (top-tier) sources for a category still on the board."""
    count = 0
    thresh = CHAMP_THRESHOLDS.get(cat, 0)
    for p in available:
        proj = projections.get(p.get("name", ""), p)
        val = float(proj.get(cat, 0) or 0)
        if cat in LOWER_IS_BETTER:
            if val > 0 and val < thresh * 0.85:
                count += 1
        else:
            if val > thresh * 1.15:
                count += 1
    return count

def _fixable_rounds(cat: str, available: list[dict], projections: dict, round_num: int) -> str:
    """Estimate which rounds still have viable contributors for this category."""
    viable = []
    for p in available:
        proj    = projections.get(p.get("name", ""), p)
        adp     = float(proj.get("adp") or p.get("adp", 999))
        val     = float(proj.get(cat, 0) or 0)
        thresh  = CHAMP_THRESHOLDS.get(cat, 1)
        if cat in LOWER_IS_BETTER:
            is_ok = val > 0 and val < thresh * 1.05
        else:
            is_ok = val > thresh * 0.7
        if is_ok:
            rnd = max(round_num, int(adp / NUM_TEAMS) + 1)
            viable.append(rnd)

    if not viable:
        return ""
    viable.sort()
    lo = viable[0]
    hi = viable[min(4, len(viable)-1)]
    if lo == hi:
        return f"rounds {lo}+"
    return f"rounds {lo}–{hi}"

def _build_gap_note(
    cat: str, my: int, opt: int, gap: int,
    available: list[dict], projections: dict,
    round_num: int, picks_remaining: int,
) -> tuple[str, str]:
    """Return (note_text, urgency_code)."""

    elite_left = _elite_sources_remaining(cat, available, projections)

    # LOCKED — already strong, don't spend picks here
    if my >= 78:
        return f"← LOCKED · stop spending picks", "LOCK"

    # PUNT — too expensive to fix, not worth it
    if gap > 45 and elite_left == 0 and picks_remaining < 8:
        return f"← PUNT CANDIDATE · costs too much to fix now", "PUNT"

    # NOW OR NEVER — last elite source available
    if elite_left == 1 and gap > 20:
        return f"← NOW OR NEVER · last elite {cat} source on board", "NOW"

    # Critical gap with sources still available
    if gap > 35 and elite_left >= 2:
        fixable = _fixable_rounds(cat, available, projections, round_num)
        if fixable:
            return f"← CRITICAL · {elite_left} elite sources left · {fixable}", "NOW"
        return f"← CRITICAL · address this round if possible", "NOW"

    # Fixable in upcoming rounds
    if gap > 20:
        fixable = _fixable_rounds(cat, available, projections, round_num)
        if fixable:
            return f"← fixable {fixable}", "SOON"
        return f"← address soon · {elite_left} sources remaining", "SOON"

    # Streaming solution for pitching categories
    if cat in ("SV", "W") and gap > 15:
        return f"← STREAMING SOLUTION · don't draft, stream weekly", "WAIT"

    # Good shape — slight room to improve
    if gap > 10:
        return f"← WAIT · {elite_left} options still available", "WAIT"

    # On track
    return f"← on track", "WAIT"

# ─── Per-player War Room scoring ──────────────────────────────────────────────

def score_player(
    player:      dict,
    projections: dict[str, PlayerProj],
    context:     dict,
) -> PlayerScore:
    """
    Full War Room score for a single player.
    context keys: injury_report, service_time, weather_flags, wbc_fatigue,
                  current_picks, pick_num, round_num
    """
    name = player.get("name", player.get("n", ""))
    proj = projections.get(name, {})

    health    = _dr_field_score(name, proj, context.get("injury_report", []))
    svc_flag  = _bookkeeper_flag(name, context.get("service_time", []))
    adp_val   = _arbitrage_score(proj, context.get("pick_num", 1))
    cat_fit   = _category_fit(proj, context.get("current_picks", []), projections)
    wbc_flag  = name in {p.get("name","") for p in context.get("wbc_fatigue", [])}
    signals   = _build_signals(proj, health, svc_flag, adp_val, wbc_flag, cat_fit)
    sgp       = _calc_sgp(proj, context.get("current_picks", []), projections)
    verdict   = _build_verdict(name, sgp, health, adp_val, svc_flag, cat_fit, context)
    overall   = int((sgp * 8 + health * 0.2 + min(50, adp_val * 2)) // 1)
    overall   = max(0, min(100, overall))

    return PlayerScore(
        name=name, sgp=sgp, health=health,
        adp_value=adp_val, category_fit=cat_fit,
        signals=signals, verdict=verdict, overall=overall,
    )

def _dr_field_score(name: str, proj: dict, injury_report: list) -> int:
    """Health score 0-100 from Dr. Field."""
    base = int(proj.get("health_pct", 90) or 90)
    # Check live injury report
    for txn in injury_report:
        if name.lower() in txn.get("player", "").lower():
            desc = txn.get("description", "").lower()
            if "60-day" in desc or "season" in desc:
                return max(0, base - 60)
            if "10-day" in desc or "15-day" in desc:
                return max(0, base - 25)
            return max(0, base - 15)
    return base

def _bookkeeper_flag(name: str, service_time: list) -> bool:
    """True if player has a service time delay this season."""
    for p in service_time:
        if name.lower() in p.get("name", "").lower():
            return True
    return False

def _arbitrage_score(proj: dict, pick_num: int) -> float:
    """Positive = undervalued (ADP higher than our pick), negative = reach."""
    adp = float(proj.get("adp", pick_num) or pick_num)
    return round(adp - pick_num, 1)

def _category_fit(
    proj:          dict,
    current_picks: list,
    projections:   dict,
) -> dict[str, int]:
    """How much does this player contribute to each category? 0-3 scale."""
    fit = {}
    thresh = CHAMP_THRESHOLDS
    for cat in CATS:
        val = float(proj.get(cat, 0) or 0)
        if not val:
            fit[cat] = 0
            continue
        t = thresh.get(cat, 1)
        if cat in LOWER_IS_BETTER:
            if val == 0:
                fit[cat] = 0
            elif val < t * 0.80:
                fit[cat] = 3
            elif val < t * 0.92:
                fit[cat] = 2
            elif val < t:
                fit[cat] = 1
            else:
                fit[cat] = 0
        else:
            if val >= t * 1.25:
                fit[cat] = 3
            elif val >= t * 1.0:
                fit[cat] = 2
            elif val >= t * 0.75:
                fit[cat] = 1
            else:
                fit[cat] = 0
    return fit

def _calc_sgp(proj: dict, current_picks: list, projections: dict) -> float:
    """
    Standings Gain Points — absolute value this player adds to a typical roster.
    Uses a fixed 8-pick baseline so SGP is comparable across players regardless
    of the caller's current team.
    """
    base_picks = current_picks[:8] if len(current_picks) >= 8 else current_picks
    before = score_roster(base_picks, projections).overall
    after  = score_roster(base_picks + [proj], projections).overall
    return round(float(after - before) * 0.8, 1)

def _build_signals(
    proj: dict, health: int, svc: bool,
    adp_val: float, wbc: bool, cat_fit: dict,
) -> list[str]:
    signals = []
    if health < 75:
        signals.append(f"🏥 Dr. Field: {health}% health — discount projected stats")
    if health >= 97:
        signals.append("✅ Iron man — full season projection, no health haircut")
    if svc:
        signals.append("⏰ Bookkeeper: service time — misses ~2 weeks")
    if adp_val >= 8:
        signals.append(f"⚡ Arbitrage: {adp_val} picks of free value vs ADP")
    if adp_val <= -10:
        signals.append(f"⚠️ Reach: drafting {abs(adp_val)} picks ahead of market")
    if wbc:
        signals.append("🌐 Historian: WBC overwork — April dead arm risk")
    age = int(proj.get("age", 28) or 28)
    if age >= 33 and not _is_pitcher(proj):
        signals.append(f"📉 Age {age}: apply decline curve, conservative projection")
    if age in range(25, 29):
        signals.append(f"📈 Age {age}: peak window — full upside projection")
    top_cats = [c for c, v in cat_fit.items() if v >= 3]
    if top_cats:
        signals.append(f"🏆 Elite: {', '.join(top_cats[:3])}")
    return signals

def _build_verdict(
    name: str, sgp: float, health: int, adp_val: float,
    svc: bool, cat_fit: dict, context: dict,
) -> str:
    round_num = context.get("round_num", 1)
    strong = [c for c, v in cat_fit.items() if v >= 2]
    weak   = [c for c, v in cat_fit.items() if v == 0 and c in CATS_BAT[:4]]

    parts = []
    if adp_val >= 8:
        parts.append(f"Value pick — {adp_val} picks below ADP.")
    if strong:
        parts.append(f"Contributes {', '.join(strong[:3])}.")
    if health < 80:
        parts.append(f"Health risk at {health}% — apply discount.")
    if svc:
        parts.append("Misses ~2 weeks (service time).")
    if weak and round_num <= 5:
        parts.append(f"Weak in {', '.join(weak[:2])} — pair accordingly.")

    return " ".join(parts) if parts else f"Solid pick at this range."

# ─── Entry point for testing ──────────────────────────────────────────────────

if __name__ == "__main__":
    print("Draft Engine v1 — self test")
    print(f"Categories: {CATS}")
    print(f"Thresholds: {CHAMP_THRESHOLDS}")

    # Test with mock data
    mock_proj: PlayerProj = {
        "name":"José Ramírez","team":"CLE","pos":"3B","adp":5.0,
        "R":94,"HR":32,"RBI":96,"SB":28,"AVG":0.279,"OPS":0.865,
        "K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,
        "health_pct":99,"age":32,"confidence":88,
    }
    projections = {"José Ramírez": mock_proj}
    picks: list = []

    rs = score_roster([mock_proj], projections)
    print(f"\nRamírez solo roster scores: {rs.scores}")
    print(f"Overall: {rs.overall}/100")

    ps = score_player(mock_proj, projections, {
        "injury_report":[], "service_time":[], "weather_flags":[],
        "wbc_fatigue":[], "current_picks":[], "pick_num":5, "round_num":1,
    })
    print(f"\nPlayerScore — SGP: {ps.sgp}, Health: {ps.health}, ADP value: {ps.adp_value}")
    print(f"Signals: {ps.signals}")
    print(f"Verdict: {ps.verdict}")
    print("\nAll good.")

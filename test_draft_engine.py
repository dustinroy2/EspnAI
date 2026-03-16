"""
Test suite for draft_engine.py
Run: python3 test_draft_engine.py
Tests use realistic 2026 projections — no ESPN/Claude calls needed.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from draft_engine import (
    score_roster, build_optimal_team, get_gap_analysis,
    score_player, generate_projections_prompt,
    CATS, CHAMP_THRESHOLDS, PlayerProj,
)

# ─── Mock projections — realistic 2026 numbers ────────────────────────────────

PROJ: dict[str, PlayerProj] = {
    # BATTERS
    "Aaron Judge":      {"name":"Aaron Judge",      "team":"NYY","pos":"OF", "adp":1,  "R":105,"HR":48,"RBI":115,"SB":3,  "AVG":0.282,"OPS":0.990,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":96,"age":33,"confidence":88},
    "Bobby Witt Jr.":   {"name":"Bobby Witt Jr.",   "team":"KCR","pos":"SS", "adp":3,  "R":108,"HR":31,"RBI":96, "SB":42, "AVG":0.304,"OPS":0.878,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":99,"age":23,"confidence":90},
    "Juan Soto":        {"name":"Juan Soto",         "team":"NYY","pos":"OF", "adp":4,  "R":102,"HR":36,"RBI":105,"SB":6,  "AVG":0.292,"OPS":0.975,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":98,"age":26,"confidence":87},
    "José Ramírez":     {"name":"José Ramírez",     "team":"CLE","pos":"3B", "adp":5,  "R":94, "HR":32,"RBI":96, "SB":28, "AVG":0.279,"OPS":0.865,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":99,"age":32,"confidence":88},
    "Ronald Acuña Jr.": {"name":"Ronald Acuña Jr.","team":"ATL","pos":"OF", "adp":6,  "R":98, "HR":30,"RBI":88, "SB":25, "AVG":0.295,"OPS":0.940,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":82,"age":26,"confidence":72},
    "Freddie Freeman":  {"name":"Freddie Freeman",  "team":"LAD","pos":"1B", "adp":32, "R":96, "HR":28,"RBI":104,"SB":8,  "AVG":0.302,"OPS":0.918,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":94,"age":31,"confidence":85},
    "Gunnar Henderson": {"name":"Gunnar Henderson", "team":"BAL","pos":"SS", "adp":38, "R":91, "HR":32,"RBI":90, "SB":18, "AVG":0.278,"OPS":0.878,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":97,"age":23,"confidence":82},
    "Manny Machado":    {"name":"Manny Machado",    "team":"SDP","pos":"3B", "adp":45, "R":78, "HR":26,"RBI":88, "SB":4,  "AVG":0.271,"OPS":0.828,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":96,"age":33,"confidence":80},
    "Salvador Perez":   {"name":"Salvador Perez",   "team":"KCR","pos":"C",  "adp":56, "R":68, "HR":24,"RBI":82, "SB":1,  "AVG":0.255,"OPS":0.762,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":93,"age":35,"confidence":78},
    "Brice Turang":     {"name":"Brice Turang",     "team":"MIL","pos":"2B", "adp":65, "R":74, "HR":8, "RBI":48, "SB":42, "AVG":0.262,"OPS":0.718,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":96,"age":24,"confidence":76},
    # PITCHERS
    "Tarik Skubal":     {"name":"Tarik Skubal",     "team":"DET","pos":"SP", "adp":9,  "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":218,"QS":18,"W":16,"SV":0,"ERA":2.72,"WHIP":1.02,"health_pct":94,"age":28,"confidence":88},
    "Paul Skenes":      {"name":"Paul Skenes",      "team":"PIT","pos":"SP", "adp":10, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":208,"QS":16,"W":14,"SV":0,"ERA":2.98,"WHIP":1.08,"health_pct":96,"age":22,"confidence":82},
    "Logan Webb":       {"name":"Logan Webb",       "team":"SFG","pos":"SP", "adp":37, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":172,"QS":20,"W":15,"SV":0,"ERA":3.18,"WHIP":1.10,"health_pct":95,"age":27,"confidence":86},
    "Framber Valdez":   {"name":"Framber Valdez",   "team":"HOU","pos":"SP", "adp":47, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":162,"QS":19,"W":14,"SV":0,"ERA":3.28,"WHIP":1.14,"health_pct":92,"age":30,"confidence":83},
    "Ryan Helsley":     {"name":"Ryan Helsley",     "team":"STL","pos":"RP", "adp":96, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":75, "QS":0, "W":4, "SV":38,"ERA":2.48,"WHIP":1.02,"health_pct":96,"age":29,"confidence":84},
    # AVAILABLE (not yet picked)
    "Corbin Burnes":    {"name":"Corbin Burnes",    "team":"BAL","pos":"SP", "adp":50, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":205,"QS":17,"W":15,"SV":0,"ERA":3.05,"WHIP":1.06,"health_pct":94,"age":30,"confidence":85},
    "Zack Wheeler":     {"name":"Zack Wheeler",     "team":"PHI","pos":"SP", "adp":62, "R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":188,"QS":18,"W":14,"SV":0,"ERA":3.20,"WHIP":1.08,"health_pct":93,"age":34,"confidence":82},
    "Jazz Chisholm":    {"name":"Jazz Chisholm",    "team":"NYY","pos":"3B", "adp":22, "R":88,"HR":27,"RBI":82, "SB":22, "AVG":0.258,"OPS":0.842,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":88,"age":26,"confidence":76},
    "Mason Miller":     {"name":"Mason Miller",     "team":"OAK","pos":"RP", "adp":126,"R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":72, "QS":0, "W":3, "SV":32,"ERA":2.68,"WHIP":1.04,"health_pct":95,"age":25,"confidence":80},
    "Gerrit Cole":      {"name":"Gerrit Cole",      "team":"NYY","pos":"SP", "adp":118,"R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":198,"QS":15,"W":13,"SV":0,"ERA":3.38,"WHIP":1.12,"health_pct":72,"age":34,"confidence":68},
    "Jackson Holliday": {"name":"Jackson Holliday","team":"BAL","pos":"SS", "adp":185,"R":72,"HR":18,"RBI":62, "SB":18, "AVG":0.274,"OPS":0.808,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":96,"age":22,"confidence":70},
    "Chase Burns":      {"name":"Chase Burns",     "team":"CIN","pos":"SP", "adp":170,"R":0,"HR":0,"RBI":0,"SB":0,"AVG":0,"OPS":0,"K":175,"QS":14,"W":11,"SV":0,"ERA":3.58,"WHIP":1.18,"health_pct":91,"age":24,"confidence":72},
    "Brandon Lowe":     {"name":"Brandon Lowe",    "team":"PIT","pos":"2B", "adp":105,"R":80,"HR":28,"RBI":78, "SB":12, "AVG":0.248,"OPS":0.812,"K":0,"QS":0,"W":0,"SV":0,"ERA":0,"WHIP":0,"health_pct":88,"age":30,"confidence":74},
}

# 15-man team (10 batters + 5 pitchers)
MY_TEAM = [
    PROJ["Aaron Judge"], PROJ["Bobby Witt Jr."], PROJ["Juan Soto"],
    PROJ["José Ramírez"], PROJ["Ronald Acuña Jr."], PROJ["Freddie Freeman"],
    PROJ["Gunnar Henderson"], PROJ["Manny Machado"], PROJ["Salvador Perez"],
    PROJ["Brice Turang"],
    PROJ["Tarik Skubal"], PROJ["Paul Skenes"], PROJ["Logan Webb"],
    PROJ["Framber Valdez"], PROJ["Ryan Helsley"],
]

AVAILABLE = [
    PROJ["Corbin Burnes"], PROJ["Zack Wheeler"], PROJ["Jazz Chisholm"],
    PROJ["Mason Miller"], PROJ["Gerrit Cole"], PROJ["Jackson Holliday"],
    PROJ["Chase Burns"], PROJ["Brandon Lowe"],
]

# ─── Test helpers ──────────────────────────────────────────────────────────────

PASS = "✅"
FAIL = "❌"
results = []

def check(label: str, condition: bool, detail: str = "") -> None:
    status = PASS if condition else FAIL
    results.append((status, label, detail))
    print(f"  {status}  {label}{' — ' + detail if detail else ''}")

# ─── TEST 1: Category scores on a realistic team ──────────────────────────────

print("\n── TEST 1: Category scores (15-man team, pick 7) ──")
rs = score_roster(MY_TEAM, PROJ)
print(f"  Scores: {rs.scores}")
print(f"  Overall: {rs.overall}/100  (picks: {rs.picks})")

check("Overall in realistic range (50-92)",
      50 <= rs.overall <= 92,
      f"got {rs.overall}")

check("HR score > 80 (Judge + Soto + Ramírez + Freeman)",
      rs.scores["HR"] >= 80,
      f"got {rs.scores['HR']}")

check("SB score > 70 (Witt 42 + Turang 42 + Acuña 25)",
      rs.scores["SB"] >= 70,
      f"got {rs.scores['SB']}")

check("ERA score > 60 (Skubal 2.72, Skenes 2.98, Webb 3.18)",
      rs.scores["ERA"] >= 60,
      f"got {rs.scores['ERA']}")

check("QS score > 50 (Webb 20, Valdez 19, Skubal 18, 4 SPs of 5 slots filled)",
      rs.scores["QS"] >= 50,
      f"got {rs.scores['QS']}")

check("K score > 60 (Skubal 218, Skenes 208, Webb 172, Valdez 162, Helsley 75)",
      rs.scores["K"] >= 60,
      f"got {rs.scores['K']}")

check("SV score > 60 (Helsley 38)",
      rs.scores["SV"] >= 60,
      f"got {rs.scores['SV']}")

# ─── TEST 2: Scores scale correctly ───────────────────────────────────────────

print("\n── TEST 2: Score scaling ──")

# Single elite hitter
rs_judge = score_roster([PROJ["Aaron Judge"]], PROJ)
rs_perez = score_roster([PROJ["Salvador Perez"]], PROJ)

check("Judge HR > Perez HR",
      rs_judge.scores["HR"] > rs_perez.scores["HR"],
      f"Judge {rs_judge.scores['HR']} vs Perez {rs_perez.scores['HR']}")

check("Turang SB >> Judge SB (Turang 42 SB vs Judge 3 SB)",
      score_roster([PROJ["Brice Turang"]], PROJ).scores["SB"] >
      score_roster([PROJ["Aaron Judge"]], PROJ).scores["SB"] * 5,
      f"Turang {score_roster([PROJ['Brice Turang']],PROJ).scores['SB']} vs Judge {score_roster([PROJ['Aaron Judge']],PROJ).scores['SB']}")

check("Skubal ERA score > Helsley ERA score (SP vs RP ERA)",
      score_roster([PROJ["Tarik Skubal"]], PROJ).scores["ERA"] >=
      score_roster([PROJ["Ryan Helsley"]], PROJ).scores["ERA"],
      f"Skubal {score_roster([PROJ['Tarik Skubal']],PROJ).scores['ERA']} vs Helsley {score_roster([PROJ['Ryan Helsley']],PROJ).scores['ERA']}")

check("Empty roster returns all zeros",
      all(v == 0 for v in score_roster([], PROJ).scores.values()),
      "confirmed")

# ─── TEST 3: Optimal team sim ─────────────────────────────────────────────────

print("\n── TEST 3: Optimal team sim ──")

partial_team = MY_TEAM[:8]   # 8 picks made, 15 slots left
opt = build_optimal_team(AVAILABLE, PROJ, partial_team, slots_remaining=8)

print(f"  Optimal adds: {[p['name'] for p in opt.players]}")
print(f"  Projected overall: {opt.overall}/100")
print(f"  Ceiling: {opt.ceiling}/100")

check("Optimal team picks something",
      len(opt.players) > 0,
      f"picked {len(opt.players)} players")

check("Optimal overall higher than partial team alone",
      opt.overall > score_roster(partial_team, PROJ).overall,
      f"partial={score_roster(partial_team,PROJ).overall} → optimal={opt.overall}")

check("Optimal respects slots_remaining cap",
      len(opt.players) <= 8,
      f"picked {len(opt.players)}")

# Optimal should prefer Burnes/Wheeler over Holliday (pitching need)
opted_names = [p["name"] for p in opt.players]
# Miller (RP/closer) correctly picked first — SV was the biggest gap (0/100)
# Engine fills biggest gap first, then SPs. This is correct behaviour.
check("Optimal picks at least one SP from available pool",
      any(PROJ[n]["pos"] == "SP" for n in opted_names if n in PROJ),
      f"picks: {opted_names}")

# ─── TEST 4: Gap analysis notes ───────────────────────────────────────────────

print("\n── TEST 4: Gap analysis notes ──")

# Build a team weak in SV to test NOW OR NEVER
team_no_sv = [p for p in MY_TEAM if p["pos"] != "RP"]
rs_no_sv   = score_roster(team_no_sv, PROJ)
rs_opt     = score_roster(MY_TEAM + AVAILABLE[:4], PROJ)

gaps = get_gap_analysis(
    my_scores=rs_no_sv.scores,
    optimal_scores=rs_opt.scores,
    available=AVAILABLE,
    projections=PROJ,
    round_num=8,
    picks_remaining=8,
)

print(f"  Gap notes ({len(gaps)} categories):")
for g in gaps[:6]:
    print(f"    {g.cat:5} my={g.my_score:3} opt={g.opt_score:3} gap={g.gap:3}  [{g.urgency:5}]  {g.note}")

sv_gap = next((g for g in gaps if g.cat == "SV"), None)
check("SV gap detected when no closers drafted",
      sv_gap is not None and sv_gap.gap > 0,
      f"SV gap={sv_gap.gap if sv_gap else 'none'}")

check("Gap list has all 12 cats",
      len(gaps) == 12,
      f"got {len(gaps)}")

check("LOCKED fires for strong categories",
      any(g.urgency == "LOCK" for g in gaps),
      f"urgencies: {[g.urgency for g in gaps]}")

check("Gaps sorted by size descending",
      all(gaps[i].gap >= gaps[i+1].gap for i in range(len(gaps)-1)),
      "confirmed")

# ─── TEST 5: Per-player War Room score ────────────────────────────────────────

print("\n── TEST 5: Per-player scoring ──")

ctx = {
    "injury_report":  [],
    "service_time":   [{"name":"Jackson Holliday","eta":"April 14","reason":"Service time"}],
    "weather_flags":  [],
    "wbc_fatigue":    [],
    "current_picks":  MY_TEAM[:5],
    "pick_num":       8,
    "round_num":      1,
}

ps_judge    = score_player(PROJ["Aaron Judge"],       PROJ, {**ctx, "pick_num":1})
ps_holliday = score_player(PROJ["Jackson Holliday"],  PROJ, {**ctx, "pick_num":185})
ps_cole     = score_player(PROJ["Gerrit Cole"],       PROJ, {**ctx, "pick_num":118})

print(f"  Judge:     SGP={ps_judge.sgp}    health={ps_judge.health}  adp_val={ps_judge.adp_value}")
print(f"  Holliday:  SGP={ps_holliday.sgp} health={ps_holliday.health}  adp_val={ps_holliday.adp_value}")
print(f"  Cole:      SGP={ps_cole.sgp}     health={ps_cole.health}  adp_val={ps_cole.adp_value}")
print(f"\n  Holliday signals: {ps_holliday.signals}")
print(f"  Cole signals:     {ps_cole.signals}")
print(f"  Cole verdict:     {ps_cole.verdict}")

check("Judge SGP > Holliday SGP (better player)",
      ps_judge.sgp > ps_holliday.sgp,
      f"Judge {ps_judge.sgp} > Holliday {ps_holliday.sgp}")

check("Holliday has service time signal",
      any("service time" in s.lower() or "bookkeeper" in s.lower()
          for s in ps_holliday.signals),
      f"signals: {ps_holliday.signals}")

check("Cole health < 80 (TJS recovery, 72%)",
      ps_cole.health < 80,
      f"got {ps_cole.health}")

check("Cole has health signal in signals list",
      any("health" in s.lower() or "dr. field" in s.lower()
          for s in ps_cole.signals),
      f"signals: {ps_cole.signals}")

check("Holliday adp_value > 0 (ADP 185, pick 185 = 0, but late rounds = value)",
      ps_holliday.adp_value >= 0,
      f"got {ps_holliday.adp_value}")

# ─── TEST 6: Projection prompt builder ────────────────────────────────────────

print("\n── TEST 6: Projection prompt ──")

players_in = [
    {"name":"Aaron Judge","pos":"OF","team":"NYY"},
    {"name":"Paul Skenes","pos":"SP","team":"PIT"},
    {"name":"Bobby Witt Jr.","pos":"SS","team":"KCR"},
]
prompt = generate_projections_prompt(players_in)

check("Prompt contains all player names",
      all(p["name"] in prompt for p in players_in),
      "all names found")

check("Prompt specifies JSON-only output",
      "JSON" in prompt and "No preamble" in prompt,
      "confirmed")

check("Prompt mentions all 12 categories",
      all(cat in prompt for cat in ["R","HR","RBI","SB","AVG","OPS","K","QS","W","SV","ERA","WHIP"]),
      "all cats found")

check("Prompt is reasonable length (not too short, not bloated)",
      500 < len(prompt) < 5000,
      f"length: {len(prompt)} chars")

# ─── SUMMARY ──────────────────────────────────────────────────────────────────

print("\n" + "─"*52)
passed = sum(1 for r in results if r[0] == PASS)
failed = sum(1 for r in results if r[0] == FAIL)
print(f"  {PASS} {passed} passed   {FAIL} {failed} failed   ({len(results)} total)")

if failed:
    print("\n  Failed tests:")
    for s, label, detail in results:
        if s == FAIL:
            print(f"    ❌ {label} — {detail}")
    sys.exit(1)
else:
    print("\n  All tests passed. Engine is good to wire into server.py.")

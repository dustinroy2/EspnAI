# The Dugout — Project Plan & Memory
*Updated: March 2026 | v4.0*

---

## The App
Local ESPN Fantasy Baseball AI assistant running on Dustin's Mac.
Thinks like a war room of 9 expert roles. Monitors MLB 24/7.
Vision: personal tool → validate → small paid beta → real product.

**Start server:** `python3 server.py` → localhost:5050

---

## League (never changes)
**FIELD OF DREAMS FANTASY BASEBALL**
- League ID: 904188626 | 12 teams | H2H Each Category
- **Batting:** R, HR, RBI, SB, AVG, OPS
- **Pitching:** K, QS, W, SV, ERA, WHIP
- Roster: C, 1B, 2B, 3B, SS, 3×OF, 2×UTIL, 2×P, 3×SP, 2×RP + 6 bench + 3 IL
- 7 transactions/matchup | Trade deadline: Aug 3 2026
- Snake draft — **not yet scheduled** | 12 teams | 23 rounds
- **Dustin's team: We're the Millers** (American division)

---

## File Map

```
EspnAI/
├── server.py              ← Flask backend v0.5 — all API endpoints
├── index.html             ← Main app (My Team / Wire / Farm tabs)
├── draft_board.html       ← Pre-draft planner (walkthrough + matrix)
├── draft_v6.html          ← Live draft board (polls ESPN every 5s)
├── draft_engine.py        ← Category scoring, optimal sim, gap analysis
├── data_layer.py          ← All data fetching + caching
├── context_builder.py     ← War room brief builder for Claude
├── war_room_experts.py    ← Expert knowledge bases
├── setup.py               ← One-time Anthropic key setup
├── test_foundation.py     ← 9-test validation suite
├── test_draft_engine.py   ← 28-test engine validation suite
├── DUGOUT.md              ← Coding rules & standards
├── FIELDAI_PROJECT.md     ← This file
├── .env                   ← API keys (never commit)
└── .cache/                ← Auto-generated data cache
    └── projections_2026.json  ← Daily Sonnet projections (cached 20hr)
```

### Archive (keep but not active)
- `draft_v5.html` — superseded by v6
- `draft.html` — original prototype

---

## Current Build Status

### ✅ Foundation (validated)
| Test | Status |
|------|--------|
| macOS notifications | ✅ |
| MLB transactions | ✅ |
| AAA stats | ✅ |
| Schedule + game counts | ✅ |
| Weather (Open-Meteo) | ✅ |
| WBC stats | ⚠️ 2026 sportId TBD |
| Betting odds | ⚠️ Needs ODDS_API_KEY |
| Service time targets | ✅ |
| Player news sentiment | ⚠️ Needs GNEWS_API_KEY |

### ✅ Live App Features
- ESPN connect via Firefox cookies
- Roster, standings, matchup display
- Decision Center (Start/Sit/Pickup/Drop/Matchup)
- Analysis caching
- Wire tab (scalper alert feed)
- Farm System tab (AAA leaderboard)
- Two-start pitcher banner

### ✅ Draft System Built
- **draft_board.html** — pre-draft planner
  - Walkthrough mode: one round at a time, full player pool, ADP warnings
  - Board matrix: tiers as rows, rounds as columns, drawer to pick
  - Roster panel + baseball field diagram
  - Category bars 0-100 updating live
- **draft_v6.html** — live draft board
  - Polls ESPN every 5s
  - Card grid with team colors, ADP badges, injury flags
  - Inspector panel with War Room data
  - OTC strip showing pick order
- **draft_engine.py** — 28 tests passing ✅
  - `score_roster()` — category scores 0-100
  - `build_optimal_team()` — greedy optimal sim
  - `get_gap_analysis()` — contextual gap notes
  - `score_player()` — full War Room player score
  - `generate_projections_prompt()` — daily Sonnet call builder

### ✅ Server Endpoints (server.py v0.5)

**In-season:**
- `GET  /api/status`
- `POST /api/login`
- `POST /api/connect`
- `POST /api/analyze`
- `GET  /api/cache`
- `GET  /api/wire`
- `GET  /api/farm`
- `GET  /api/two-starters`

**Draft:**
- `POST /api/draft/init`
- `GET  /api/draft/state`
- `GET  /api/draft/projections/status`
- `POST /api/draft/projections`  ← daily Sonnet call, ~$0.27
- `POST /api/draft/on-clock`     ← engine call, pure math, <1s

---

## Draft Engine Architecture

### Category scoring
- 0-100 against championship thresholds calibrated for 12-team H2H
- Counting stats vs full-roster totals (not per-player)
- Rate stats (AVG/OPS/ERA/WHIP) as per-player averages

### Championship baselines
```python
ROSTER_TOTALS = {
    "R":1100, "HR":290, "RBI":1000, "SB":200,
    "K":900,  "QS":90,  "W":100,   "SV":38,
}
CHAMP_THRESHOLDS = {  # rate stats, per player
    "AVG":0.272, "OPS":0.835, "ERA":3.55, "WHIP":1.18,
}
```

### Gap note language
- `← LOCKED` — score ≥78, stop spending picks
- `← NOW OR NEVER` — last elite source on board
- `← CRITICAL` — big gap, sources still available
- `← fixable rounds 8-10` — can wait, viable options coming
- `← STREAMING SOLUTION` — don't draft, stream weekly
- `← PUNT CANDIDATE` — too expensive to fix

### War Room experts → code
| Expert | Data source | Signal |
|--------|-------------|--------|
| Dr. Field | `get_injury_report()` | Health score 0-100 |
| Bookkeeper | `get_service_time_callups()` | Delay flag |
| Arbitrage Finder | ADP vs pick_num | Value gap |
| Historian | `get_wbc_stats()` | WBC fatigue flag |
| Meteorologist | `get_weather_flags()` | Park/weather |
| Network Analyst | `get_transactions()` | Recent moves |

---

## Draft Day Workflow

```
Morning:
1. python3 server.py              ← start server
2. Open localhost:5050/draft_board.html
3. Click "Generate Projections"   ← one Sonnet call, ~$0.27, cached all day

Draft:
4. Open localhost:5050/draft_v6.html (or v7 when built)
5. Board polls ESPN every 5s automatically
6. On-clock endpoint fires on the pick before yours
7. Pick
```

---

## Priority Build Queue

### 🔴 NEXT — draft_v7.html (on-clock takeover screen)
Full screen when your pick is up:
- OTC strip + compact roster top bar
- 4-column player comparison
- Category scores 0-100 with gap notes
- Top 4 picks from `/api/draft/on-clock`
- Pre-fetches on previous pick

### 🟡 After v7
- Wire `draft_board.html` projections button to `/api/draft/projections`
- Mock draft history importer (ESPN mock lobby)
- Wishlist builder (round targets + fallback tiers)
- War Room inspector ⚡ ANALYZE button (per-player Claude verdicts)

### 🟢 Later
- Real ADP slip detection vs live ESPN ADP
- Opponent roster tracker
- Post-draft in-season integration

---

## .env keys needed
```
ANTHROPIC_API_KEY=...     ✅ done
ODDS_API_KEY=...          ⚠️  the-odds-api.com (500 req/month free)
GNEWS_API_KEY=...         ⚠️  gnews.io (100 req/day free)
```

---

## Cost Model
| Call | When | Cost |
|------|------|------|
| Projections (Sonnet) | Once/day | ~$0.27 |
| On-clock verdicts (engine) | Per your pick | $0.00 |
| Inspector analyze (Sonnet) | On demand | ~$0.02 each |
| **Full draft day** | | **~$0.30** |

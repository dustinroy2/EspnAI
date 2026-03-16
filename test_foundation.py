"""
The Dugout — Foundation Test v3
Tests all data sources before building on top of them.
Run: python3 test_foundation.py
"""

import subprocess, sys, os
sys.path.insert(0, os.path.dirname(__file__))

def test_notification():
    print("1. macOS notification...")
    script = 'display notification "Foundation test ✅" with title "⚾ THE DUGOUT" sound name "Glass"'
    r = subprocess.run(["osascript", "-e", script], capture_output=True)
    print(f"   {'✅' if r.returncode == 0 else '❌'} Notification")
    print()

def test_transactions():
    print("2. MLB transactions...")
    from data_layer import get_transactions
    t = get_transactions(days_back=3)
    print(f"   ✅ {len(t)} transactions")
    if t: print(f"   Sample: {t[0]['description'][:70]}")
    print()

def test_aaa():
    print("3. AAA stats...")
    from data_layer import get_aaa_hitters, get_aaa_pitchers
    h = get_aaa_hitters()
    p = get_aaa_pitchers()
    print(f"   ✅ {len(h)} hitters | {len(p)} pitchers")
    if h: print(f"   Top hitter: {h[0]['name']} — {h[0]['ops']:.3f} OPS")
    if p: print(f"   Top arm:    {p[0]['name']} — {p[0]['era']:.2f} ERA")
    print()

def test_schedule():
    print("4. Schedule & game counts...")
    from data_layer import get_todays_schedule, get_weekly_game_counts, get_two_start_pitchers
    games   = get_todays_schedule()
    counts  = get_weekly_game_counts()
    starters= get_two_start_pitchers()
    print(f"   ✅ {len(games)} games today | {len(counts)} teams counted")
    print(f"   ✅ {len(starters)} two-start pitchers this week")
    if counts: print(f"   Most games: {counts[0]['team']} ({counts[0]['games']})")
    if starters: print(f"   Two-starter: {starters[0]['name']} — {starters[0]['starts']}")
    print()

def test_weather():
    print("5. Weather (Open-Meteo)...")
    from data_layer import get_weather_flags
    flags = get_weather_flags()
    print(f"   ✅ {len(flags)} weather flags")
    for f in flags:
        for a in f.get("alerts", []):
            print(f"   {f['park']}: {a}")
    print()

def test_wbc():
    print("6. World Baseball Classic...")
    from data_layer import get_wbc_stats, get_wbc_fatigue_flags
    wbc     = get_wbc_stats()
    fatigue = get_wbc_fatigue_flags()
    hitters = wbc.get("hitters", [])
    pitchers= wbc.get("pitchers", [])
    print(f"   ✅ {len(hitters)} WBC hitters | {len(pitchers)} WBC pitchers")
    print(f"   ⚠️  {len(fatigue)} pitchers flagged for April dead arm")
    if hitters: print(f"   Top WBC hitter: {hitters[0]['name']} ({hitters[0]['country']}) — {hitters[0]['ops']:.3f} OPS → {hitters[0]['translated_ops']:.3f} translated")
    print()

def test_odds():
    print("7. Betting odds (ROY)...")
    from data_layer import get_roy_odds
    odds = get_roy_odds()
    if odds:
        print(f"   ✅ {len(odds)} ROY candidates from bookmakers")
        print(f"   Favorite: {odds[0]['name']} ({odds[0]['odds']})")
    else:
        print("   ⚠️  No ODDS_API_KEY in .env — add one at the-odds-api.com (free tier)")
    print()

def test_service_time():
    print("8. Service time targets...")
    from data_layer import get_service_time_callups
    targets = get_service_time_callups()
    print(f"   ✅ {len(targets)} service time targets")
    for t in targets:
        alert = "🚨 IMMINENT" if t.get("alert") else f"📅 {t['days_until_eta']}d away"
        print(f"   {alert}: {t['name']} ({t['team']}) — ETA {t['eta']}")
    print()

def test_news():
    print("9. Player news sentiment...")
    from data_layer import get_player_news
    # Test with a known active player
    news = get_player_news("Freddie Freeman")
    print(f"   Freddie Freeman sentiment: {news['sentiment']}")
    if news.get("articles"):
        print(f"   Headlines found: {len(news['articles'])}")
        print(f"   Top: {news['articles'][0]['title'][:70]}")
    else:
        print("   ⚠️  No GNEWS_API_KEY in .env — add one at gnews.io (free tier: 100 req/day)")
    print()

if __name__ == "__main__":
    print("=" * 55)
    print("  THE DUGOUT — Foundation Test v3")
    print("=" * 55)
    print()
    test_notification()
    test_transactions()
    test_aaa()
    test_schedule()
    test_weather()
    test_wbc()
    test_odds()
    test_service_time()
    test_news()
    print("Done. Add API keys to .env for full coverage.")
    print("  ODDS_API_KEY  → the-odds-api.com (500 req/month free)")
    print("  GNEWS_API_KEY → gnews.io (100 req/day free)")

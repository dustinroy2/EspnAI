/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */
const S = {
  connected: false,
  teamData: null,
  projections: {},
  projCount: 0,
  draftStarted: false,
  draftState: null,
  draftPoll: null,
  timerInterval: null,
  timerSec: 0,
  lastPickCount: -1,
  overlayShown: false,
  engineData: null,
  currentPage: 'hub',
  prepSort: { col: 'aiRank', dir: 1 },
  liveSort: { col: 'sgp', dir: -1 },
  prepFilter: 'ALL',
  liveFilter: 'ALL',
};

const POSITIONS = ['ALL','C','1B','2B','SS','3B','OF','SP','RP'];
const CATS_BAT = ['R','HR','RBI','SB','AVG','OPS'];
const CATS_PIT = ['K','QS','W','SV','ERA','WHIP'];
const ALL_CATS = [...CATS_BAT, ...CATS_PIT];
const ROSTER_SLOTS = [
  {pos:'C',sec:'Batting'},{pos:'1B'},{pos:'2B'},{pos:'3B'},{pos:'SS'},
  {pos:'OF',sec:null},{pos:'OF'},{pos:'OF'},{pos:'UTIL'},{pos:'UTIL'},
  {pos:'SP',sec:'Pitching'},{pos:'SP'},{pos:'SP'},{pos:'RP'},{pos:'RP'},{pos:'P'},{pos:'P'},
  {pos:'BE',sec:'Bench'},{pos:'BE'},{pos:'BE'},{pos:'BE'},{pos:'BE'},{pos:'BE'},
];

/* ═══════════════════════════════════════════════════════
   API
   ═══════════════════════════════════════════════════════ */
async function api(path, opts = {}) {
  try {
    const r = await fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? {'Content-Type':'application/json'} : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return await r.json();
  } catch (e) { console.error('API error:', path, e); return { error: e.message }; }
}

/* ═══════════════════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════════════════ */
function showPage(id) {
  S.currentPage = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${id}"]`).forEach(n => n.classList.add('active'));

  if (id === 'hub') refreshHub();
  if (id === 'prep') refreshPrep();
  if (id === 'live') refreshLive();
  if (id === 'warroom') refreshWarRoom();
  if (id === 'intel') refreshIntel();
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', () => showPage(el.dataset.page));
});

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

/* ═══════════════════════════════════════════════════════
   HUB
   ═══════════════════════════════════════════════════════ */
async function refreshHub() {
  const status = await api('status');
  const projStatus = await api('draft/projections/status');

  // ESPN card
  const sc1 = document.getElementById('sc-espn');
  if (status.hasSavedCookies) {
    sc1.className = 'status-card ok';
    sc1.innerHTML = '<div class="label">ESPN Connection</div><div class="value" style="color:var(--green)">Connected</div><div class="meta">via Firefox cookies</div>';
    document.getElementById('btn-espn-clear').style.display = '';
  } else {
    sc1.className = 'status-card warn';
    sc1.innerHTML = '<div class="label">ESPN Connection</div><div class="value" style="color:var(--yellow)">Not connected</div><div class="meta">Click Connect Firefox</div>';
  }

  // API card
  const sc2 = document.getElementById('sc-api');
  if (status.hasApiKey) {
    sc2.className = 'status-card ok';
    sc2.innerHTML = '<div class="label">Claude API</div><div class="value" style="color:var(--green)">Active</div><div class="meta">Key configured</div>';
  } else {
    sc2.className = 'status-card err';
    sc2.innerHTML = '<div class="label">Claude API</div><div class="value" style="color:var(--espn-red)">Missing</div><div class="meta">Run setup.py</div>';
  }

  // Projections card
  const sc3 = document.getElementById('sc-proj');
  if (projStatus.fresh) {
    sc3.className = 'status-card ok';
    sc3.innerHTML = `<div class="label">Projections</div><div class="value">${projStatus.player_count} players</div><div class="meta">${projStatus.age_hours}h ago</div>`;
    S.projCount = projStatus.player_count;
  } else {
    sc3.className = 'status-card warn';
    sc3.innerHTML = '<div class="label">Projections</div><div class="value" style="color:var(--yellow)">None</div><div class="meta">Generate in Draft Prep</div>';
  }

  // Overall tag
  const allGood = status.hasSavedCookies && status.hasApiKey && projStatus.fresh;
  const tag = document.getElementById('hub-status-tag');
  tag.textContent = allGood ? 'All Systems Go' : 'Setup needed';
  tag.className = 'topbar-tag ' + (allGood ? 'tag-green' : 'tag-yellow');

  // Footer
  updateFooter(status.hasSavedCookies);
}

function updateFooter(connected) {
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');
  const tm = document.getElementById('conn-team');
  dot.className = 'status-dot ' + (connected ? 'on' : 'off');
  lbl.textContent = connected ? 'ESPN Connected' : 'Not connected';
  if (S.teamData) tm.textContent = S.teamData.team?.teamName + ' · Pick 9';
  else tm.textContent = connected ? 'Ready' : '—';
}

// ESPN Login
document.getElementById('btn-espn-login').addEventListener('click', async () => {
  toast('Extracting ESPN cookies from Firefox...');
  const r = await api('login', { method: 'POST' });
  if (r.success) { toast('ESPN connected!'); refreshHub(); }
  else toast('Error: ' + (r.error || 'Failed'));
});
document.getElementById('btn-espn-clear').addEventListener('click', async () => {
  await api('cookies/clear', { method: 'POST' });
  S.connected = false; S.teamData = null; toast('Disconnected'); refreshHub();
});

// Connect to league
document.getElementById('btn-connect').addEventListener('click', async () => {
  const leagueId = document.getElementById('input-league-id').value;
  const year = document.getElementById('input-year').value;
  const teamName = document.getElementById('input-team-name').value;
  toast('Connecting to ESPN league...');
  const r = await api('connect', { method: 'POST', body: { leagueId, year, teamName } });
  if (r.error) { toast('Error: ' + r.error); return; }
  S.connected = true; S.teamData = r;
  toast('Connected to ' + (r.leagueName || 'league'));
  renderLeagueInfo(r);
  refreshHub();
});

function renderLeagueInfo(data) {
  const el = document.getElementById('hub-league-info');
  el.className = '';
  el.innerHTML = `
    <div class="settings-row"><div class="settings-label">League</div><div class="settings-value">${data.leagueName || '—'}</div></div>
    <div class="settings-row"><div class="settings-label">Your Team</div><div class="settings-value">${data.team?.teamName || '—'}</div></div>
    <div class="settings-row"><div class="settings-label">Record</div><div class="settings-value">${data.team?.wins ?? 0}W–${data.team?.losses ?? 0}L</div></div>
    <div class="settings-row"><div class="settings-label">Standing</div><div class="settings-value">#${data.team?.standing || '—'}</div></div>
    <div class="settings-row"><div class="settings-label">Roster Size</div><div class="settings-value">${data.team?.roster?.length || 0} players</div></div>
    <div class="settings-row"><div class="settings-label">Week</div><div class="settings-value">${data.currentWeek || 'Pre-season'}</div></div>
  `;
}

/* ═══════════════════════════════════════════════════════
   PROJECTIONS (shared)
   ═══════════════════════════════════════════════════════ */
async function loadProjections() {
  const r = await api('draft/projections');
  if (r.projections) {
    S.projections = r.projections;
    S.projCount = r.player_count;
  }
  return S.projections;
}

function projFor(name) {
  if (!name) return null;
  if (S.projections[name]) return S.projections[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(S.projections)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════
   CATEGORY BARS
   ═══════════════════════════════════════════════════════ */
function renderCatBars(container, cats, scores) {
  container.innerHTML = cats.map(c => {
    const v = scores?.[c] ?? 0;
    const color = v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--espn-red)';
    return `<div>
      <div class="cat-bar-label">${c} <span class="score">${Math.round(v)}</span></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.min(v,100)}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   FILTER PILLS (reusable)
   ═══════════════════════════════════════════════════════ */
function renderFilterPills(container, current, onChange) {
  container.innerHTML = POSITIONS.map(p =>
    `<div class="filter-pill${p===current?' active':''}" data-pos="${p}">${p}</div>`
  ).join('');
  container.querySelectorAll('.filter-pill').forEach(el => {
    el.addEventListener('click', () => { onChange(el.dataset.pos); });
  });
}

/* ═══════════════════════════════════════════════════════
   DRAFT PREP — Round-by-round walkthrough
   ═══════════════════════════════════════════════════════ */
const PREP = {
  round: 1,
  picks: [],           // [{name, pos, team, round, overall, ...proj}]
  pickOrder: [],       // [{round, overall}] for all 23 rounds
  draftedNames: new Set(),
  statcastData: null,
  wishlist: { batters: [], pitchers: [] },
  wishTab: 'batters',
  claudeMockDone: false,
  claudeMockTeam: null,
  espnADP: {},         // name -> {espnADP, espnRank, pos}
  espnADPLoaded: false,
  myMockPicks: {},     // name -> [round numbers from my mock drafts]
  lastMockBoard: [],   // full board from last imported mock
};

// ── Persistence ──
function savePrepState() {
  try {
    const state = {
      picks: PREP.picks,
      draftedNames: [...PREP.draftedNames],
      wishlist: PREP.wishlist,
      myMockPicks: PREP.myMockPicks,
      lastMockBoard: PREP.lastMockBoard,
      round: PREP.round,
      claudeMockDone: PREP.claudeMockDone,
      claudeMockTeam: PREP.claudeMockTeam,
    };
    localStorage.setItem('dugout_prep', JSON.stringify(state));
  } catch(e) { console.warn('Save failed:', e); }
}

function loadPrepState() {
  try {
    const raw = localStorage.getItem('dugout_prep');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state.picks) PREP.picks = state.picks;
    if (state.draftedNames) PREP.draftedNames = new Set(state.draftedNames);
    if (state.wishlist) PREP.wishlist = state.wishlist;
    if (state.myMockPicks) PREP.myMockPicks = state.myMockPicks;
    if (state.lastMockBoard) PREP.lastMockBoard = state.lastMockBoard;
    if (state.round) PREP.round = state.round;
    if (state.claudeMockDone) PREP.claudeMockDone = state.claudeMockDone;
    if (state.claudeMockTeam) PREP.claudeMockTeam = state.claudeMockTeam;
    console.log('Loaded saved state:', PREP.picks.filter(Boolean).length, 'picks,', Object.keys(PREP.myMockPicks).length, 'mock players,', PREP.wishlist.batters.length + PREP.wishlist.pitchers.length, 'wishlist');
  } catch(e) { console.warn('Load failed:', e); }
}

// Load on startup
loadPrepState();

const PICK_POS = 9;
const NUM_TEAMS_DRAFT = 12;
const NUM_ROUNDS_DRAFT = 23;

// Calculate snake draft pick order for position 9
function calcPickOrder() {
  PREP.pickOrder = [];
  for (let r = 1; r <= NUM_ROUNDS_DRAFT; r++) {
    const overall = r % 2 === 1
      ? (r - 1) * NUM_TEAMS_DRAFT + PICK_POS
      : (r - 1) * NUM_TEAMS_DRAFT + (NUM_TEAMS_DRAFT - PICK_POS + 1);
    PREP.pickOrder.push({ round: r, overall });
  }
}
calcPickOrder();

// Tier assignment based on ADP
function getTier(adp) {
  if (adp <= 12) return { name: 'Elite', color: 'var(--espn-red)' };
  if (adp <= 36) return { name: 'Near Elite', color: 'var(--blue)' };
  if (adp <= 72) return { name: 'Solid', color: 'var(--green)' };
  if (adp <= 120) return { name: 'Mid Value', color: 'var(--yellow)' };
  if (adp <= 180) return { name: 'Sleeper', color: 'var(--text-secondary)' };
  return { name: 'Late', color: 'var(--text-tertiary)' };
}

// Players likely available at a given overall pick (based on ADP)
function getAvailableAtPick(allPlayers, overallPick) {
  return allPlayers.filter(p => {
    if (PREP.draftedNames.has(p.name)) return false;
    // A player with ADP X is likely available at pick X (with margin)
    // Players picked before this overall pick are gone
    const adp = p.adp || 999;
    // ADP represents average draft position — players with ADP < overallPick-5 are likely gone
    // We show players whose ADP is within a reasonable window
    return adp >= overallPick - 8; // slightly aggressive — show players that might slip
  });
}

// Get round-specific strategy advice
function getRoundAdvice(round, scores, gapCats) {
  const overall = PREP.pickOrder[round - 1]?.overall || 0;
  const nextOverall = PREP.pickOrder[round]?.overall || 0;
  const gapToNext = nextOverall - overall;
  const picks = PREP.picks.filter(Boolean);
  const numPicks = picks.length;
  const hasSP = picks.some(p => isPitcherProj(p) && (p.SV||0) <= 5);
  const hasRP = picks.some(p => isPitcherProj(p) && (p.SV||0) > 5);
  const hasC = picks.some(p => (p.pos||'').toUpperCase() === 'C');
  const numSP = picks.filter(p => isPitcherProj(p) && (p.SV||0) <= 5).length;
  const numRP = picks.filter(p => isPitcherProj(p) && (p.SV||0) > 5).length;
  const numBats = numPicks - numSP - numRP;
  const sbTotal = picks.reduce((s,p) => s + (p.SB||0), 0);
  const criticalGaps = gapCats.filter(g => g.cls === 'critical');

  let advice = '';

  if (round === 1) {
    advice = `PICK 9 STRATEGY: Target a 5-category power+speed hitter. In H2H cats, SB is the scarcest category — once elite speed is gone, it's gone forever. If Jose Ramirez (25 SB + elite counting stats), Trea Turner, or a similar power+speed combo falls here, take them over a pure slugger. Avoid SP in Round 1 — you can stream pitchers with your 7 weekly transactions.`;
  } else if (round === 2) {
    const r1 = PREP.picks[0];
    const r1SB = r1 ? (r1.SB || 0) : 0;
    advice = `Pick ${overall} (${gapToNext} picks until R3). `;
    if (r1SB < 15) {
      advice += `Your R1 pick has only ${r1SB} SB — you NEED speed here. Target a SS/OF with 20+ SB who also contributes R/AVG. Elly De La Cruz, Trea Turner, Gunnar Henderson type.`;
    } else {
      advice += `Nice SB start with ${r1?.name}. Now pair with a different position — elite 1B/3B or a cornerstone bat. Leave R1-R2 with two multi-category hitters.`;
    }
  } else if (round === 3) {
    advice = `Pick ${overall}. PRO TIP: Leave R1-R4 with 2 power+speed hitters, 1 ace SP, and 1 top closer. `;
    if (sbTotal < 30) advice += `SB still low (${sbTotal} total) — speed gets scarce fast. `;
    if (!hasSP) advice += `No SP yet — this is a good spot for your first ace (Skubal, Crochet, Sale tier). `;
    if (hasSP) advice += `You have an SP already — grab another elite bat. `;
    advice += `${gapToNext > 12 ? 'Long gap (' + gapToNext + ' picks) — draft for need, not BPA.' : 'Quick turn — BPA is fine.'}`;
  } else if (round === 4) {
    advice = `Pick ${overall}. Checkpoint: `;
    if (!hasSP) advice += `URGENT — no SP through 3 rounds. Grab an ace NOW. `;
    if (numBats < 2) advice += `Too pitcher-heavy early — you need hitter depth. `;
    if (numBats >= 3 && !hasSP) advice += `3 bats and no SP — perfect time for your first ace. `;
    if (!hasRP && hasSP) advice += `Consider an elite closer here — closers are "the currency of fantasy baseball." One bankable closer keeps you competitive in SV every week without Sunday night FAAB scrambles.`;
  } else if (round <= 6) {
    advice = `Pick ${overall}. `;
    if (numSP === 0) advice += `NO SP YET — this is getting dangerous. Aces are disappearing. `;
    if (numSP === 1) advice += `One SP is okay — you can wait until R7-9 for your second. Target hitters now. `;
    if (!hasRP && round >= 5) advice += `No closer — grab one soon. After R8, you're streaming closers all season. `;
    if (criticalGaps.length > 0) advice += `Gaps in ${criticalGaps.map(g=>g.cat).join(', ')} need attention. `;
    if (sbTotal < 40 && numPicks >= 4) advice += `SB at ${sbTotal} projected is below competitive. Late-round SB sources: Justin Crawford (PHI), Chandler Simpson (TB), Daylen Lile (WSH). `;
  } else if (round <= 9) {
    advice = `MID-ROUNDS. `;
    if (numSP < 2) advice += `Only ${numSP} SP — go hard on pitching now. Target 2-3 SPs in R7-R10 (Joe Ryan, Kyle Bradish, Tyler Glasnow tier). `;
    if (!hasRP) advice += `LAST CALL for elite closers — after this the saves tier drops hard. `;
    if (!hasC && round >= 8) advice += `No catcher yet — grab Drake Baldwin, Cal Raleigh, or Adley Rutschman, or commit to punting C. `;
    if (numBats >= 7 && numSP < 2) advice += `Heavy on bats (${numBats}) — flip to pitching mode. `;
    const dhCount = picks.filter(p => (p.pos||'') === 'DH' && !isPitcherProj(p)).length;
    if (dhCount >= 2) advice += `You have ${dhCount} DH-only players — prefer players with real position eligibility (SS/OF/1B) for roster flexibility. `;
  } else if (round <= 14) {
    advice = `DEPTH ROUNDS. `;
    if (numSP < 3) advice += `Still only ${numSP} SP — pick up mid-tier arms (Aaron Nola, Shota Imanaga, Jesus Luzardo). `;
    if (numSP >= 5) advice += `${numSP} SPs is plenty — remember you can stream with 7 weekly transactions. Focus on hitter upside. `;
    if (criticalGaps.length > 0) advice += `Still weak in ${criticalGaps.map(g=>g.cat).join(', ')}. Target category specialists. `;
    advice += `Look for: position-eligible bats with one elite category, closers in new roles, players returning from injury at discount.`;
  } else {
    advice = `LATE ROUNDS — swing for upside. `;
    advice += `30% of your roster will be replaced by June via waivers. These picks are lottery tickets. Target: `;
    advice += `prospects (Chase Burns, Bubba Chandler), injury comebacks (Tyler Glasnow, Spencer Strider), `;
    advice += `SB specialists (Justin Crawford, Daylen Lile), and closers who might win the job in April. `;
    if (sbTotal < 80) advice += `SB is still your weakest cat — grab any late speed you can find.`;
  }
  return advice;
}

// ── LIVE WARNINGS — scarcity alerts, last chance picks, category projections ──
function getLiveWarnings(round, scores) {
  const warnings = [];
  const picks = PREP.picks.filter(Boolean);
  const numPicks = picks.length;
  const overall = PREP.pickOrder[round - 1]?.overall || 0;
  const nextOverall = PREP.pickOrder[round]?.overall || 0;
  const allPlayers = getPrepPlayers();
  const available = allPlayers.filter(p => !PREP.draftedNames.has(p.name));

  // Count elite sources remaining for key categories
  const sbSources = available.filter(p => !isPitcherProj(p) && (p.SB || 0) >= 20);
  const svSources = available.filter(p => isPitcherProj(p) && (p.SV || 0) >= 25);
  const qsSources = available.filter(p => isPitcherProj(p) && (p.QS || 0) >= 15);
  const cSources = available.filter(p => (p.pos||'').toUpperCase() === 'C' && (p.espnADP||999) < 200);

  // SB scarcity
  if (sbSources.length <= 5 && sbSources.length > 0 && (scores.SB || 0) < 60) {
    warnings.push({ type: 'critical', text: `RUNNING OUT: Only ${sbSources.length} players with 20+ SB left: ${sbSources.slice(0,3).map(p=>p.name).join(', ')}` });
  }
  if (sbSources.length <= 2 && (scores.SB || 0) < 50) {
    warnings.push({ type: 'critical', text: `LAST CHANCE FOR SB — ${sbSources.length === 0 ? 'NO elite SB sources remain!' : sbSources.map(p=>p.name).join(' or ') + ' — grab one NOW or punt SB all season'}` });
  }

  // Saves scarcity
  if (svSources.length <= 3 && svSources.length > 0 && !picks.some(p => isPitcherProj(p) && (p.SV||0) > 5)) {
    warnings.push({ type: 'warn', text: `SAVES DRYING UP: Only ${svSources.length} elite closers left: ${svSources.slice(0,3).map(p=>p.name).join(', ')}` });
  }

  // QS scarcity
  if (qsSources.length <= 4 && !picks.some(p => isPitcherProj(p) && (p.QS||0) >= 15)) {
    warnings.push({ type: 'warn', text: `ACE SPs running out: ${qsSources.length} workhorses (15+ QS) left on the board` });
  }

  // Catcher scarcity
  if (round >= 8 && !picks.some(p => (p.pos||'').toUpperCase() === 'C') && cSources.length <= 3) {
    warnings.push({ type: 'warn', text: `Only ${cSources.length} draftable catchers remain — decide now: draft one or punt C` });
  }

  // "Will be gone" alerts — players on wishlist whose ADP is before your next pick
  const wishAll = [...PREP.wishlist.batters, ...PREP.wishlist.pitchers];
  for (const w of wishAll) {
    const espn = PREP.espnADP[w.name] || {};
    const adp = espn.espnADP || 999;
    if (adp > overall && adp < nextOverall && !PREP.draftedNames.has(w.name)) {
      warnings.push({ type: 'critical', text: `LAST CHANCE: ${w.name} (ADP ${adp}) will be gone before your next pick at ${nextOverall}` });
    }
  }

  // Category trajectory
  if (numPicks >= 4) {
    const weakest = ALL_CATS.map(c => ({ cat: c, score: scores[c] || 0 })).sort((a,b) => a.score - b.score)[0];
    if (weakest.score < 40 && weakest.score > 0) {
      warnings.push({ type: 'info', text: `WEAKEST: ${weakest.cat} at ${weakest.score}/100 — at this pace you'll lose ${weakest.cat} most weeks` });
    }
  }

  // Position needs
  if (numPicks >= 6) {
    const hasOF = picks.filter(p => ['OF','LF','CF','RF'].includes((p.pos||'').toUpperCase())).length;
    if (hasOF < 2) warnings.push({ type: 'info', text: `Only ${hasOF} outfielders — you need 3 OF starters` });
    const hasSS = picks.some(p => (p.pos||'').toUpperCase() === 'SS');
    if (!hasSS) warnings.push({ type: 'info', text: `No shortstop yet — premium position, consider soon` });
  }

  return warnings;
}

let prepLoaded = false;
async function refreshPrep() {
  if (!prepLoaded || Object.keys(S.projections).length === 0) {
    await loadProjections();
    _prepPlayersCache = null; // force re-rank with fresh projections
    prepLoaded = true;
  }
  // Load statcast data for war room signals
  if (!PREP.statcastData) {
    try { PREP.statcastData = await api('statcast?year=2025'); } catch(e) {}
  }
  // Load ESPN ADP
  if (!PREP.espnADPLoaded) {
    try {
      const adpData = await api('draft/espn-adp');
      if (adpData.players) {
        for (const p of adpData.players) {
          PREP.espnADP[p.name] = { espnADP: p.espnADP, espnRank: p.espnRank, pos: p.pos };
        }
        PREP.espnADPLoaded = true;
        toast(`Loaded ESPN ADP for ${adpData.count} players`);
        // Update projections with real ESPN ADP and positions
        for (const [name, proj] of Object.entries(S.projections)) {
          const espn = PREP.espnADP[name];
          if (espn) {
            proj.espnADP = espn.espnADP;
            proj.espnRank = espn.espnRank;
            // Fix position from ESPN if our projection has it wrong
            if (espn.pos && espn.pos !== 'UTIL') proj.pos = espn.pos;
          }
        }
        _prepPlayersCache = null; // force re-rank with new ADP
      }
    } catch(e) { console.warn('ESPN ADP load failed:', e); }
  }
  const tag = document.getElementById('prep-proj-tag');
  tag.textContent = S.projCount > 0 ? `${S.projCount} players projected` : 'No projections';
  tag.className = 'topbar-tag ' + (S.projCount > 0 ? 'tag-blue' : 'tag-yellow');

  // Restore UI state from saved data
  if (PREP.claudeMockDone) {
    document.getElementById('btn-claude-mock').textContent = "View Claude's Team";
  }
  if (Object.keys(PREP.myMockPicks).length > 0) {
    document.getElementById('btn-mock-analysis').style.display = '';
  }

  renderFilterPills(document.getElementById('prep-pos-filter'), S.prepFilter, pos => {
    S.prepFilter = pos; renderPrepRound();
  });
  renderPrepRound();
  renderMockDisplay();
  renderWishlist();
}

function renderPrepRound() {
  const round = PREP.round;
  const pickInfo = PREP.pickOrder[round - 1];
  const nextPickInfo = PREP.pickOrder[round] || null;

  // Round dots
  document.getElementById('round-dots').innerHTML = PREP.pickOrder.map((p, i) => {
    const r = i + 1;
    const picked = PREP.picks[i];
    let cls = 'round-dot';
    if (r === round) cls += ' active';
    else if (picked) cls += ' done';
    const label = picked ? picked.name.split(' ').pop().slice(0, 5) : '';
    const pk = PREP.pickOrder[i]?.overall || '';
    return `<div class="${cls}" data-round="${r}"><div class="rd-num">${r}</div><div class="rd-pick">Pk ${pk}</div><div class="rd-name">${label}</div></div>`;
  }).join('');
  document.querySelectorAll('.round-dot').forEach(el => {
    el.addEventListener('click', () => { PREP.round = parseInt(el.dataset.round); renderPrepRound(); });
  });

  // Round info
  const gapToNext = nextPickInfo ? nextPickInfo.overall - pickInfo.overall : 0;
  const gapText = nextPickInfo ? `${gapToNext} picks until your next turn (Pick ${nextPickInfo.overall})` : 'Last round!';
  document.getElementById('round-info').innerHTML = `
    <div class="ri-main">Round ${round} &middot; Pick ${pickInfo.overall}</div>
    <div class="ri-sub">${gapText}</div>
  `;

  // Category bars
  const scores = calcPrepScores();
  renderCatBars(document.getElementById('prep-cat-bars-bat'), CATS_BAT, scores);
  renderCatBars(document.getElementById('prep-cat-bars-pit'), CATS_PIT, scores);

  // Score context
  const numPicks = PREP.picks.filter(Boolean).length;
  const numBats = PREP.picks.filter(p => p && !isPitcherProj(p)).length;
  const numPits = PREP.picks.filter(p => p && isPitcherProj(p)).length;
  const overall = numPicks > 0 ? Math.round(Object.values(scores).reduce((a,b) => a+b, 0) / ALL_CATS.length) : 0;
  const ctx = document.getElementById('prep-score-context');
  if (numPicks === 0) {
    ctx.textContent = 'Draft players to see your category scores build up.';
  } else {
    let warning = '';
    if (numBats <= 3 && (scores.AVG > 85 || scores.OPS > 85)) {
      warning = ' — AVG/OPS look high but will drop as you add more hitters';
    }
    if (numPits === 0 && numPicks >= 3) {
      warning += ' — no pitchers yet, pitching cats are all 0';
    }
    ctx.innerHTML = `<strong>${numPicks}</strong> picks (${numBats} bat, ${numPits} pit) &middot; Overall: <strong>${overall}/100</strong>${warning}`;
  }

  // Gap analysis
  const gapCats = calcPrepGaps(scores);
  document.getElementById('prep-gaps').innerHTML = gapCats.map(g =>
    `<div class="gap-chip ${g.cls}">${g.cat} — ${g.label}</div>`
  ).join('');

  // Advice + Live Warnings
  const adviceText = getRoundAdvice(round, scores, gapCats);
  const warnings = getLiveWarnings(round, scores);
  const warningColors = { critical: 'var(--espn-red)', warn: 'var(--yellow)', info: 'var(--blue)' };
  const warningBgs = { critical: 'var(--red-bg)', warn: 'var(--yellow-bg)', info: 'var(--blue-bg)' };
  const warningIcons = { critical: '&#9888;', warn: '&#9888;', info: '&#8505;' };

  document.getElementById('prep-advice-text').innerHTML = `
    <div style="margin-bottom:${warnings.length > 0 ? '10px' : '0'}">${adviceText}</div>
    ${warnings.map(w => `
      <div style="background:${warningBgs[w.type]};color:${warningColors[w.type]};padding:6px 10px;border-radius:4px;margin-top:6px;font-size:11px;font-weight:600;display:flex;gap:6px;align-items:flex-start">
        <span>${warningIcons[w.type]}</span>${w.text}
      </div>
    `).join('')}
  `;

  // Roster
  renderPrepRoster();

  // Player table or board
  renderPrepTable();
  if (prepViewMode === 'board') renderBoardView();
  if (rosterViewMode === 'field') renderFieldView();
}

function renderPrepTable() {
  const search = document.getElementById('prep-search').value.toLowerCase();
  const hideDrafted = document.getElementById('prep-hide-drafted').checked;
  const pickInfo = PREP.pickOrder[PREP.round - 1];
  let allPlayers = getPrepPlayers();

  // Filter to players likely available at this pick
  let players = hideDrafted
    ? getAvailableAtPick(allPlayers, pickInfo.overall)
    : allPlayers.filter(p => !PREP.draftedNames.has(p.name));

  if (S.prepFilter !== 'ALL') players = players.filter(p => posMatch(p.pos, S.prepFilter));
  if (search) players = players.filter(p => p.name.toLowerCase().includes(search));

  // Sort by ADP by default for walkthrough (closest to this pick first)
  const { col, dir } = S.prepSort;
  players.sort((a, b) => ((a[col] ?? 999) - (b[col] ?? 999)) * dir);

  // War Room signals from statcast
  const scSignals = buildStatcastSignals();

  // Columns — show batting or pitching based on filter, but in ALL mode show both smartly
  const showPit = ['SP','RP'].includes(S.prepFilter);
  const BAT_COLS = ['R','HR','RBI','SB','AVG','OPS'];
  const PIT_COLS = ['K','QS','ERA','WHIP','W','SV'];
  const statCols = showPit ? PIT_COLS : BAT_COLS;
  const mixedMode = S.prepFilter === 'ALL'; // in ALL mode, pitchers show their stats instead of 0s

  // Column descriptions for legend
  const COL_TIPS = {
    AI: 'Claude AI Rank — based on SGP (value across all 12 cats), health, SB scarcity, and category breadth',
    R: 'Runs — projected season total', HR: 'Home Runs — projected season total',
    RBI: 'Runs Batted In — projected season total', SB: 'Stolen Bases — projected (scarcest category!)',
    AVG: 'Batting Average — projected season', OPS: 'On-Base + Slugging — projected season',
    K: 'Strikeouts — projected season total', QS: 'Quality Starts — 6+ IP, 3 or fewer ER',
    ERA: 'Earned Run Average — lower is better', WHIP: 'Walks + Hits per IP — lower is better',
    W: 'Wins — projected season total', SV: 'Saves — projected season total',
    ESPN: 'ESPN ADP — average draft position across all ESPN users\' real and mock drafts',
    Mock: 'Your Mock — rounds you drafted this player in your ESPN mock drafts',
  };

  document.getElementById('prep-thead').innerHTML = `<tr>
    <th class="r${S.prepSort.col==='aiRank'?' sorted':''}" data-psort="aiRank" style="width:40px;cursor:help" title="${COL_TIPS.AI}">AI <span style="font-size:8px;color:var(--text-tertiary)">&#9432;</span></th>
    <th>Player</th>
    <th>Pos</th>
    ${statCols.map(c => `<th class="r${S.prepSort.col===c?' sorted':''}" data-psort="${c}" style="cursor:help" title="${COL_TIPS[c] || c}">${c}</th>`).join('')}
    <th class="r${S.prepSort.col==='espnADP'?' sorted':''}" data-psort="espnADP" style="width:50px;cursor:help" title="${COL_TIPS.ESPN}">ESPN</th>
    <th class="r" style="width:36px;cursor:help" title="How many times you drafted this player across your mock drafts">Mck</th>
    <th style="width:70px"></th>
  </tr>`;

  document.getElementById('prep-tbody').innerHTML = players.slice(0, 80).map((p, i) => {
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    const playerADP = p.espnADP < 900 ? p.espnADP : (p.adp || 999);
    const adpDiff = playerADP - pickInfo.overall;
    let adpTag = '';
    // Negative adpDiff = player fell past their ADP (steal!)
    // Positive adpDiff = player usually goes later (don't waste this pick)
    // Only show WAIT if the player would likely survive to your NEXT pick
    const nextPick = PREP.pickOrder[PREP.round]?.overall || (pickInfo.overall + 20);
    const surviveToNext = playerADP > nextPick;
    if (adpDiff < -8) adpTag = `<span class="signal good" title="ESPN users usually draft this player ${Math.abs(Math.round(adpDiff))} picks earlier — they fell past their ADP, this is a steal!">STEAL ${Math.round(adpDiff)}</span>`;
    else if (adpDiff > 5 && surviveToNext) adpTag = `<span class="signal warn" title="ESPN ADP is ${playerADP} — they'll likely still be here at your next pick (${nextPick}), consider waiting">WAIT</span>`;
    else if (adpDiff <= 3 && adpDiff >= -8) adpTag = `<span class="signal" style="background:var(--green-bg);color:var(--green)" title="ESPN ADP ${playerADP} is right around this pick — draft window is now">IN RANGE</span>`;

    const healthTag = p.health < 80 ? `<span class="signal bad" title="Health projection: ${p.health}% of a full season — injury risk, discount their counting stats accordingly">${p.health}% HP</span>` : '';
    const scTag = scSignals[p.name] || '';
    const isDrafted = PREP.draftedNames.has(p.name);

    // AI rank vs ESPN ADP diff
    const compareADP = p.espnADP < 900 ? p.espnADP : (p.adp || 999);
    const rankDiff = Math.round(compareADP - p.aiRank);
    let rankDiffHtml = '';
    if (compareADP < 500 && Math.abs(rankDiff) >= 3) {
      if (rankDiff > 0) rankDiffHtml = `<span style="color:var(--green);font-size:9px;font-weight:600">&uarr;${rankDiff}</span>`;
      else rankDiffHtml = `<span style="color:var(--espn-red);font-size:9px;font-weight:600">&darr;${Math.abs(rankDiff)}</span>`;
    }

    const onWishlist = isOnWishlist(p.name);
    const mockCount = (PREP.myMockPicks[p.name] || []).length;
    let trClass = isDrafted ? 'drafted' : '';
    let trStyle = onWishlist && !isDrafted ? 'background:#fffbeb;' : '';

    return `<tr class="${trClass}" style="${trStyle}">
      <td class="r" style="font-weight:700;font-size:13px;color:var(--espn-red)">${p.aiRank} ${rankDiffHtml}</td>
      <td><div class="player-name-cell">
        <div class="player-avatar">${initials}</div>
        <div class="player-info">
          <div class="name">${p.name}</div>
          <div class="meta">${p.team} &middot; ${p.pos}${p.health < 100 ? ' &middot; ' + p.health + '% HP' : ''}</div>
          <div class="signals">${adpTag}${healthTag}${scTag}</div>
        </div>
      </div></td>
      <td><span class="pos-badge ${p.pos.toLowerCase()}">${p.pos}</span></td>
      ${(() => {
        const pIsPit = isPitcherProj(p);
        // In ALL/batter mode, if this is a pitcher, show pitching stats instead of 0s
        if (mixedMode && pIsPit && !showPit) {
          return PIT_COLS.map(c => {
            const v = p[c]; if (!v) return '<td class="r" style="color:var(--text-tertiary)">—</td>';
            const fmt = ['ERA','WHIP'].includes(c) ? Number(v).toFixed(2) : v;
            return `<td class="r" style="color:var(--blue);font-size:11px" title="${COL_TIPS[c] || c}">${fmt} <span style="font-size:8px;color:var(--text-tertiary)">${c}</span></td>`;
          }).join('');
        }
        // Normal mode — show the stat columns
        return statCols.map(c => {
          const v = p[c]; if (pIsPit && BAT_COLS.includes(c) && !v) return '<td class="r" style="color:var(--text-tertiary)">—</td>';
          const fmt = ['AVG','OPS','ERA','WHIP'].includes(c) ? Number(v).toFixed(3) : v;
          return `<td class="r">${fmt}</td>`;
        }).join('');
      })()}
      <td class="r" style="font-weight:600">${p.espnADP < 900 ? p.espnADP : '—'}</td>
      <td class="r" style="font-size:12px;font-weight:700;${mockCount > 0 ? 'color:var(--blue)' : 'color:var(--text-tertiary)'}">${mockCount > 0 ? mockCount + 'x' : '—'}</td>
      <td style="white-space:nowrap">${isDrafted
        ? '<span style="font-size:11px;color:var(--text-tertiary)">Picked</span>'
        : `<button class="btn-wish${isOnWishlist(p.name) ? ' active' : ''}" onclick="toggleWishlist('${p.name.replace(/'/g,"\\'")}','${p.pos}','${p.team}');event.stopPropagation()" title="Add to wishlist">&#9733;</button><button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--blue);padding:2px 4px" onclick="showWarRoom('${p.name.replace(/'/g,"\\'")}');event.stopPropagation()" title="War Room report">WR</button><button class="btn-draft" onclick="prepDraft('${p.name.replace(/'/g,"\\'")}')">Draft</button>`
      }</td>
    </tr>`;
  }).join('');

  // Sort handlers
  document.querySelectorAll('#prep-thead th[data-psort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.psort;
      if (S.prepSort.col === col) S.prepSort.dir *= -1;
      else { S.prepSort.col = col; S.prepSort.dir = ['ERA','WHIP','adp','aiRank'].includes(col) ? 1 : -1; }
      renderPrepTable();
    });
  });
}

let _prepPlayersCache = null;
let _prepPlayersCacheKey = '';

function getPrepPlayers() {
  // Cache based on projection count to avoid recomputing ranks every render
  const cacheKey = S.projCount + '-' + Object.keys(S.projections).length;
  if (_prepPlayersCache && _prepPlayersCacheKey === cacheKey) return _prepPlayersCache;

  const list = [];
  for (const [name, p] of Object.entries(S.projections)) {
    const espn = PREP.espnADP[p.name || name] || {};
    const myMocks = PREP.myMockPicks[p.name || name] || [];
    const player = { name: p.name || name, pos: p.pos || '?', team: p.team || '?',
      adp: p.adp || 999, espnADP: espn.espnADP || p.espnADP || 999, espnRank: espn.espnRank || 999,
      R: p.R||0, HR: p.HR||0, RBI: p.RBI||0, SB: p.SB||0,
      AVG: p.AVG||0, OPS: p.OPS||0, K: p.K||0, QS: p.QS||0, W: p.W||0,
      SV: p.SV||0, ERA: p.ERA||0, WHIP: p.WHIP||0, health: p.health_pct||100,
      age: p.age||28, confidence: p.confidence||50,
      myMocks: myMocks.length > 0 ? myMocks.join(',') : '' };
    // Compute AI score: SGP base + health adjustment + scarcity bonuses
    let aiScore = estimateSGP(player);
    // Health discount: lose up to 20% for injury-prone players
    aiScore *= (0.80 + 0.20 * (player.health / 100));
    // SB scarcity premium: SB is hardest cat to replace in H2H
    if (player.SB >= 25) aiScore += 4;
    else if (player.SB >= 15) aiScore += 2;
    // QS premium: workhorses are undervalued
    if (player.QS >= 15) aiScore += 3;
    // Multi-position / category breadth bonus
    const isPit = isPitcherProj(player);
    if (!isPit) {
      let catCount = 0;
      if (player.R >= 80) catCount++;
      if (player.HR >= 25) catCount++;
      if (player.RBI >= 80) catCount++;
      if (player.SB >= 12) catCount++;
      if (player.AVG >= 0.270) catCount++;
      if (player.OPS >= 0.830) catCount++;
      if (catCount >= 5) aiScore += 5;  // 5-category player premium
      else if (catCount >= 4) aiScore += 2;
    }
    player.aiScore = aiScore;
    list.push(player);
  }

  // Sort by aiScore descending and assign ranks
  list.sort((a, b) => b.aiScore - a.aiScore);
  list.forEach((p, i) => { p.aiRank = i + 1; });

  _prepPlayersCache = list;
  _prepPlayersCacheKey = cacheKey;
  return list;
}

function buildStatcastSignals() {
  const signals = {};
  if (!PREP.statcastData?.signals) return signals;
  const sc = PREP.statcastData.signals;
  (sc.regression_risks || []).forEach(p => {
    const n = p.last_name ? `${p.first_name} ${p.last_name}` : (p.name || '');
    if (n) signals[n] = '<span class="signal bad" title="Statcast: batting average is higher than expected (xBA) — likely to regress, be cautious">REGRESS</span>';
  });
  (sc.breakout_candidates || []).forEach(p => {
    const n = p.last_name ? `${p.first_name} ${p.last_name}` : (p.name || '');
    if (n) signals[n] = '<span class="signal good" title="Statcast: expected stats (xBA) are better than actual — unlucky so far, could break out">BREAKOUT</span>';
  });
  (sc.unlucky_pitchers || []).forEach(p => {
    const n = p.last_name ? `${p.first_name} ${p.last_name}` : (p.name || '');
    if (n) signals[n] = '<span class="signal good" title="Statcast: ERA is higher than expected (xERA) — been unlucky, buy low candidate">UNLUCKY</span>';
  });
  (sc.lucky_pitchers || []).forEach(p => {
    const n = p.last_name ? `${p.first_name} ${p.last_name}` : (p.name || '');
    if (n) signals[n] = '<span class="signal bad" title="Statcast: ERA is lower than expected (xERA) — been lucky, regression risk">LUCKY</span>';
  });
  return signals;
}

// Draft a player for this round
function prepDraft(name) {
  const proj = projFor(name);
  if (!proj) { toast('No projection data for ' + name); return; }
  const pickInfo = PREP.pickOrder[PREP.round - 1];
  PREP.picks[PREP.round - 1] = {
    name: proj.name || name,
    pos: proj.pos || '?',
    team: proj.team || '?',
    round: PREP.round,
    overall: pickInfo.overall,
    ...proj,
  };
  PREP.draftedNames.add(proj.name || name);
  savePrepState();

  // Auto-advance to next empty round
  for (let r = PREP.round + 1; r <= NUM_ROUNDS_DRAFT; r++) {
    if (!PREP.picks[r - 1]) { PREP.round = r; break; }
  }
  renderPrepRound();
  toast(`Drafted ${name} in Round ${pickInfo.overall <= 23 ? PREP.round - 1 : PREP.round - 1} (Pick ${pickInfo.overall})`);
}

// Undo last pick
function prepUndo() {
  // Find last filled round
  for (let r = NUM_ROUNDS_DRAFT; r >= 1; r--) {
    if (PREP.picks[r - 1]) {
      PREP.draftedNames.delete(PREP.picks[r - 1].name);
      PREP.picks[r - 1] = undefined;
      PREP.round = r;
      savePrepState();
      renderPrepRound();
      toast('Pick undone');
      return;
    }
  }
}

function prepClear() {
  if (!confirm('Clear all picks?')) return;
  PREP.picks = [];
  PREP.draftedNames.clear();
  PREP.round = 1;
  savePrepState();
  renderPrepRound();
  toast('All picks cleared');
}

function renderPrepRoster() {
  const slots = ROSTER_SLOTS;
  let html = '';
  let pickIdx = 0;
  const actualPicks = PREP.picks.filter(Boolean);
  document.getElementById('prep-roster-count').textContent = `${actualPicks.length}/23`;

  for (let r = 0; r < NUM_ROUNDS_DRAFT; r++) {
    const slot = slots[r] || { pos: 'BE', sec: r === 17 ? 'Bench' : null };
    if (slot.sec) html += `<div class="roster-section-label">${slot.sec}</div>`;
    const pick = PREP.picks[r];
    if (pick) {
      const tier = getTier(pick.adp || 999);
      html += `<div class="roster-slot" style="cursor:pointer" onclick="PREP.round=${r+1};renderPrepRound()">
        <span class="slot-pos">R${r+1}</span>
        <span class="slot-player">${pick.name}</span>
        <span class="slot-round" style="color:${tier.color}">${pick.pos}</span>
      </div>`;
    } else {
      const isActive = r + 1 === PREP.round;
      html += `<div class="roster-slot${isActive ? ' style="background:#fffbeb"' : ''}">
        <span class="slot-pos">R${r+1}</span>
        <span class="slot-player empty">Pick ${PREP.pickOrder[r]?.overall || '?'}</span>
      </div>`;
    }
  }
  document.getElementById('prep-roster-slots').innerHTML = html;

  // Show/hide buttons
  document.getElementById('btn-undo-pick').style.display = actualPicks.length > 0 ? '' : 'none';
  document.getElementById('btn-clear-picks').style.display = actualPicks.length > 1 ? '' : 'none';
}

// Category score calculation (mirrors draft_engine.py logic)
function calcPrepScores() {
  const picks = PREP.picks.filter(Boolean);
  if (picks.length === 0) return {};

  const ROSTER_TOTALS = { R:1100, HR:290, RBI:1000, SB:200, K:900, QS:90, W:100, SV:38 };
  const CHAMP = { AVG:0.272, OPS:0.835, ERA:3.55, WHIP:1.18 };

  const totals = {}; ALL_CATS.forEach(c => totals[c] = 0);
  let batCount = 0, pitCount = 0;

  for (const p of picks) {
    const isPit = ['SP','RP','P'].includes((p.pos||'').toUpperCase());
    if (isPit) pitCount++; else batCount++;
    for (const c of ALL_CATS) totals[c] += Number(p[c] || 0);
  }

  const scores = {};
  for (const c of ALL_CATS) {
    if (c === 'ERA' || c === 'WHIP') {
      if (pitCount === 0) { scores[c] = 0; continue; }
      const avg = totals[c] / pitCount;
      if (avg === 0) { scores[c] = 0; continue; }
      scores[c] = Math.min(100, Math.max(0, Math.round((CHAMP[c] / avg) * 100)));
    } else if (c === 'AVG' || c === 'OPS') {
      if (batCount === 0) { scores[c] = 0; continue; }
      const avg = totals[c] / batCount;
      scores[c] = Math.min(100, Math.max(0, Math.round((avg / CHAMP[c]) * 100)));
    } else {
      const champTotal = ROSTER_TOTALS[c] || 100;
      scores[c] = Math.min(100, Math.max(0, Math.round((totals[c] / champTotal) * 100)));
    }
  }
  return scores;
}

function calcPrepGaps(scores) {
  return ALL_CATS.map(c => {
    const v = scores[c] || 0;
    let cls, label;
    if (v >= 78) { cls = 'locked'; label = 'LOCKED'; }
    else if (v >= 50) { cls = 'ok'; label = 'on track'; }
    else if (v >= 25) { cls = 'soon'; label = 'target soon'; }
    else if (v > 0) { cls = 'critical'; label = 'CRITICAL'; }
    else { cls = 'ok'; label = 'empty'; }
    return { cat: c, score: v, cls, label };
  });
}

// AI Optimal Team Simulation
// Position detection that handles messy projection data
function isPitcherProj(p) {
  const pos = (p.pos || '').toUpperCase();
  if (pos === 'SP' || pos === 'RP' || pos === 'P') return true;
  // Detect pitchers by stats (projections may have wrong positions)
  if ((p.K || 0) >= 50 && (p.ERA || 0) > 0 && (p.R || 0) === 0) return true;
  return false;
}

function simulateOptimalDraft() {
  const allPlayers = getPrepPlayers().filter(p => p.adp < 400 && p.adp > 0);
  allPlayers.sort((a, b) => (a.adp || 999) - (b.adp || 999));

  const hitters = allPlayers.filter(p => !isPitcherProj(p));
  const pitchers = allPlayers.filter(p => isPitcherProj(p));
  const sps = pitchers.filter(p => (p.SV || 0) <= 5);
  const rps = pitchers.filter(p => (p.SV || 0) > 5);

  let hittersAvail = [...hitters];
  let spsAvail = [...sps];
  let rpsAvail = [...rps];
  const team = [];
  let totalPicksSoFar = 0;

  // Hard roster plan: exactly when to draft pitchers
  // 23 roster spots: 14-16 hitters, 5-7 pitchers (3-4 SP, 2 RP)
  // Realistic draft: hitters R1-R5, first SP R3-R5, first RP R6-R8
  const PLAN = {
    // round -> 'bat', 'sp', 'rp', or 'best' (pick best available within constraints)
    1: 'bat', 2: 'bat', 3: 'bat', 4: 'best', 5: 'best',
    6: 'best', 7: 'best', 8: 'best', 9: 'best', 10: 'best',
    11: 'best', 12: 'best', 13: 'best', 14: 'best', 15: 'best',
    16: 'best', 17: 'best', 18: 'best', 19: 'best', 20: 'best',
    21: 'best', 22: 'best', 23: 'best',
  };

  const MAX_SP = 4;
  const MAX_RP = 3;
  const MAX_PIT = 7;   // total pitchers
  const MIN_PIT = 5;   // must have at least this many
  const MIN_BAT = 14;  // must have at least this many hitters

  for (const pickInfo of PREP.pickOrder) {
    const otherPicksBetween = pickInfo.overall - totalPicksSoFar - 1;
    // Other teams take ~80% hitters, 15% SP, 5% RP
    const otherH = Math.round(otherPicksBetween * 0.78);
    const otherSP = Math.round(otherPicksBetween * 0.15);
    const otherRP = otherPicksBetween - otherH - otherSP;

    for (let i = 0; i < otherH && hittersAvail.length > 1; i++) hittersAvail.shift();
    for (let i = 0; i < otherSP && spsAvail.length > 1; i++) spsAvail.shift();
    for (let i = 0; i < otherRP && rpsAvail.length > 1; i++) rpsAvail.shift();
    totalPicksSoFar = pickInfo.overall;

    const teamSPs = team.filter(p => isPitcherProj(p) && (p.SV || 0) <= 5).length;
    const teamRPs = team.filter(p => isPitcherProj(p) && (p.SV || 0) > 5).length;
    const teamPits = teamSPs + teamRPs;
    const teamBats = team.length - teamPits;
    const roundsLeft = NUM_ROUNDS_DRAFT - team.length;

    // Determine what to draft this round
    let pool;
    const plan = PLAN[pickInfo.round] || 'best';

    // Hard constraints override the plan
    const mustBat = teamBats < MIN_BAT && (roundsLeft <= (MIN_BAT - teamBats));
    const mustPit = teamPits < MIN_PIT && (roundsLeft <= (MIN_PIT - teamPits));
    const noPit = teamPits >= MAX_PIT;
    const noSP = teamSPs >= MAX_SP;
    const noRP = teamRPs >= MAX_RP;

    if (plan === 'bat' || mustBat || noPit) {
      pool = hittersAvail.slice(0, 15);
    } else if (plan === 'sp' && !noSP) {
      pool = spsAvail.slice(0, 10);
    } else if (plan === 'rp' && !noRP) {
      pool = rpsAvail.slice(0, 8);
    } else {
      // 'best' — build candidate pool respecting caps
      pool = [...hittersAvail.slice(0, 12)];
      if (!noSP && !noPit) pool.push(...spsAvail.slice(0, 4));
      if (!noRP && !noPit) pool.push(...rpsAvail.slice(0, 3));

      // If we still need pitchers and are running out of rounds, force it
      if (mustPit) {
        pool = [];
        if (!noSP) pool.push(...spsAvail.slice(0, 8));
        if (!noRP) pool.push(...rpsAvail.slice(0, 5));
        if (pool.length === 0) pool = hittersAvail.slice(0, 10); // fallback
      }
    }

    // Score and pick best from pool
    let bestPick = null;
    let bestScore = -Infinity;

    for (const p of pool) {
      let score = estimateSGP(p);
      const isPit = isPitcherProj(p);

      // Reach penalty — don't pick someone way ahead of ADP
      const reach = pickInfo.overall - (p.adp || 999);
      if (reach < -25) score *= 0.5;
      else if (reach < -12) score *= 0.75;

      // Value bonus — player falling past their ADP
      if (reach > 8) score *= 1.1;

      // SB scarcity bonus for hitters
      if (!isPit && (p.SB || 0) >= 20) score *= 1.08;

      if (score > bestScore) { bestScore = score; bestPick = p; }
    }

    if (!bestPick) {
      if (hittersAvail.length > 0) bestPick = hittersAvail[0];
      else if (spsAvail.length > 0) bestPick = spsAvail[0];
      else if (rpsAvail.length > 0) bestPick = rpsAvail[0];
      else break;
    }

    // Remove from pools
    const isPit = isPitcherProj(bestPick);
    if (isPit && (bestPick.SV || 0) > 5) {
      rpsAvail = rpsAvail.filter(p => p.name !== bestPick.name);
    } else if (isPit) {
      spsAvail = spsAvail.filter(p => p.name !== bestPick.name);
    } else {
      hittersAvail = hittersAvail.filter(p => p.name !== bestPick.name);
    }

    team.push({ ...bestPick, round: pickInfo.round, overall: pickInfo.overall });
  }

  return team;
}

// ── Wishlist ──
function isOnWishlist(name) {
  return PREP.wishlist.batters.some(p => p.name === name) || PREP.wishlist.pitchers.some(p => p.name === name);
}

function toggleWishlist(name, pos, team) {
  const proj = projFor(name);
  const isPit = isPitcherProj(proj || { pos: pos || '?', K: 0, ERA: 0, R: 0 });
  const list = isPit ? 'pitchers' : 'batters';
  const idx = PREP.wishlist[list].findIndex(p => p.name === name);
  if (idx >= 0) {
    PREP.wishlist[list].splice(idx, 1);
  } else {
    const proj = projFor(name);
    PREP.wishlist[list].push({ name, pos: pos || proj?.pos || '?', team: team || proj?.team || '?', adp: proj?.adp || 999 });
  }
  savePrepState();
  renderWishlist();
  renderPrepTable(); // update star states
}

function switchWishTab(tab) {
  PREP.wishTab = tab;
  document.querySelectorAll('.wl-tab').forEach(t => t.classList.toggle('active', t.dataset.wltab === tab));
  renderWishlist();
}

function renderWishlist() {
  const items = PREP.wishlist[PREP.wishTab] || [];
  const el = document.getElementById('wishlist-items');
  if (items.length === 0) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);padding:8px 0;text-align:center">Click the &#9734; next to a player to add them</div>`;
    return;
  }
  el.innerHTML = items.map(p => {
    const drafted = PREP.draftedNames.has(p.name);
    return `<div class="wl-item${drafted ? ' style="opacity:0.4;text-decoration:line-through"' : ''}">
      <span class="wl-name">${p.name}</span>
      <span style="font-size:10px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span>
      ${!drafted ? `<button class="btn-draft" style="font-size:10px;padding:2px 6px" onclick="prepDraft('${p.name.replace(/'/g,"\\'")}')">Draft</button>` : ''}
      <button class="wl-remove" onclick="toggleWishlist('${p.name.replace(/'/g,"\\'")}','${p.pos}','${p.team}')">&times;</button>
    </div>`;
  }).join('');
}

// ── Pre-Draft Strategy Brief ──
function showStrategyBrief() {
  const allPlayers = getPrepPlayers();
  const sbElite = allPlayers.filter(p => !isPitcherProj(p) && (p.SB||0) >= 25).sort((a,b) => (a.espnADP||999) - (b.espnADP||999));
  const sbMid = allPlayers.filter(p => !isPitcherProj(p) && (p.SB||0) >= 15 && (p.SB||0) < 25).sort((a,b) => (a.espnADP||999) - (b.espnADP||999));
  const aceSP = allPlayers.filter(p => isPitcherProj(p) && (p.QS||0) >= 16).sort((a,b) => (a.espnADP||999) - (b.espnADP||999));
  const eliteRP = allPlayers.filter(p => isPitcherProj(p) && (p.SV||0) >= 25).sort((a,b) => (a.espnADP||999) - (b.espnADP||999));
  const catchers = allPlayers.filter(p => (p.pos||'').toUpperCase() === 'C').sort((a,b) => (a.espnADP||999) - (b.espnADP||999));

  // Players likely available at pick 9
  const atPick9 = allPlayers.filter(p => (p.espnADP||999) >= 5 && (p.espnADP||999) <= 15).sort((a,b) => a.aiRank - b.aiRank);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:780px">
      <div class="overlay-header" style="background:var(--espn-red)">
        <h3>Draft Strategy Brief — Pick 9/12 Snake, H2H Categories</h3>
      </div>
      <div class="overlay-body" style="padding:20px;max-height:80vh;overflow-y:auto">

        <div style="background:var(--bg);border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">THE GAME PLAN</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">
            <strong>Your edge from Pick 9:</strong> You get a tight R1/R2 turn (picks 9 & 16 = only 7 picks apart) then a long wait to R3 (pick 33 = 17 picks). This means your R1/R2 pair needs to be elite and complementary — don't double up on the same profile.<br><br>
            <strong>The formula:</strong> Leave Round 4 with <span style="color:var(--espn-red);font-weight:700">2 power+speed hitters</span>, <span style="color:var(--blue);font-weight:700">1 ace SP</span>, and <span style="color:var(--green);font-weight:700">1 top closer</span>.<br><br>
            <strong>Key principle:</strong> SB is the scarcest category in H2H. Once the top 8-10 speed guys are gone, there's no replacing them. You MUST address SB in rounds 1-3 or you'll lose that category every single week.<br><br>
            <strong>Pitching approach:</strong> You have 7 transactions per matchup — you CAN stream SPs. Draft 2-3 aces for the floor, but don't overdraft pitching. Your 7 weekly moves are a massive edge for pitching categories.<br><br>
            <strong>Expect 30% roster turnover by June.</strong> Late-round picks are lottery tickets, not core roster. Swing for upside.
          </div>
        </div>

        <div style="font-size:13px;font-weight:700;margin-bottom:8px">ROUND-BY-ROUND BLUEPRINT</div>
        <div style="display:grid;gap:6px;margin-bottom:16px">
          ${[
            { rds: 'R1-R2', plan: 'Two 5-category hitters. At least one with 20+ SB. Target power+speed combos — Jose Ramirez, Trea Turner, Gunnar Henderson, Elly De La Cruz type.', color: 'var(--espn-red)' },
            { rds: 'R3-R4', plan: 'Ace SP + elite bat or closer. If you have 2 elite bats, grab your ace (Skubal, Crochet, Sale, Cole Ragans). If only 1 bat, get another hitter and wait on SP to R5.', color: 'var(--blue)' },
            { rds: 'R5-R6', plan: 'Fill biggest gap. No SP? Get one now. No closer? Grab one — closers are "the currency of fantasy baseball." SB still under 40? Target speed.', color: 'var(--green)' },
            { rds: 'R7-R9', plan: 'Go hard on SP. Target 2-3 mid-tier starters. Catcher decision point — grab one or commit to punting. Start filling bench positions.', color: 'var(--yellow)' },
            { rds: 'R10-14', plan: 'Category specialists + depth. Second closer if available. Position eligibility matters — avoid DH-only players. Target players returning from injury at discount.', color: 'var(--text-secondary)' },
            { rds: 'R15-23', plan: 'Lottery tickets. Prospects (Chase Burns, Bubba Chandler), SB sleepers (Justin Crawford, Daylen Lile, Chandler Simpson), injury comebacks (Glasnow, Strider). These picks get replaced by June.', color: 'var(--text-tertiary)' },
          ].map(r => `
            <div style="display:flex;gap:10px;align-items:flex-start;padding:8px;border-left:3px solid ${r.color};background:var(--bg);border-radius:0 6px 6px 0">
              <div style="font-weight:700;color:${r.color};width:48px;flex-shrink:0;font-size:12px">${r.rds}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${r.plan}</div>
            </div>
          `).join('')}
        </div>

        <div style="font-size:13px;font-weight:700;margin-bottom:8px">YOUR PICK 9 TARGETS</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Players most likely available at pick 9 (ADP 5-15), ranked by AI</div>
        ${atPick9.slice(0,8).map(p => {
          const isPit = isPitcherProj(p);
          return `<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--espn-red);font-weight:700;width:30px">AI ${p.aiRank}</span>
              <span style="font-weight:600;flex:1">${p.name}</span>
              <span class="pos-badge ${p.pos?.toLowerCase()}">${p.pos}</span>
              <span style="color:var(--text-tertiary);font-size:11px">ADP ${p.espnADP < 900 ? p.espnADP : '?'}</span>
            </div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;padding-left:38px;font-variant-numeric:tabular-nums">
              ${isPit
                ? `${p.K||0} K · ${p.QS||0} QS · ${p.W||0} W · ${(p.ERA||0).toFixed(2)} ERA · ${(p.WHIP||0).toFixed(2)} WHIP`
                : `${p.R||0} R · ${p.HR||0} HR · ${p.RBI||0} RBI · <span style="color:${(p.SB||0)>=15?'var(--green)':'inherit'};font-weight:${(p.SB||0)>=15?'700':'400'}">${p.SB||0} SB</span> · ${(p.AVG||0).toFixed(3)} AVG · ${(p.OPS||0).toFixed(3)} OPS`}
            </div>
          </div>`;
        }).join('')}

        <div style="font-size:13px;font-weight:700;margin-top:16px;margin-bottom:8px">SB TARGETS BY TIER</div>
        <div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:6px">ELITE (25+ SB)</div>
        ${sbElite.slice(0,8).map(p => `
          <div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:11px;display:flex;gap:6px;align-items:baseline">
            <span style="font-weight:700;min-width:130px">${p.name}</span>
            <span class="pos-badge ${p.pos?.toLowerCase()}" style="font-size:9px">${p.pos}</span>
            <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${p.R||0}R · ${p.HR||0}HR · ${p.RBI||0}RBI · <span style="color:var(--green);font-weight:700">${p.SB}SB</span> · ${(p.AVG||0).toFixed(3)} · ${(p.OPS||0).toFixed(3)}</span>
            <span style="margin-left:auto;color:var(--text-tertiary);font-size:10px">ADP ${p.espnADP<900?p.espnADP:'?'}</span>
          </div>
        `).join('')}
        <div style="font-size:10px;font-weight:700;color:var(--yellow);margin-top:10px;margin-bottom:6px">MID (15-24 SB)</div>
        ${sbMid.slice(0,8).map(p => `
          <div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:11px;display:flex;gap:6px;align-items:baseline">
            <span style="font-weight:700;min-width:130px">${p.name}</span>
            <span class="pos-badge ${p.pos?.toLowerCase()}" style="font-size:9px">${p.pos}</span>
            <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${p.R||0}R · ${p.HR||0}HR · ${p.RBI||0}RBI · <span style="color:var(--yellow);font-weight:700">${p.SB}SB</span> · ${(p.AVG||0).toFixed(3)} · ${(p.OPS||0).toFixed(3)}</span>
            <span style="margin-left:auto;color:var(--text-tertiary);font-size:10px">ADP ${p.espnADP<900?p.espnADP:'?'}</span>
          </div>
        `).join('')}

        <div style="font-size:13px;font-weight:700;margin-top:16px;margin-bottom:8px">ACE SPs & ELITE CLOSERS</div>
        <div style="font-size:10px;font-weight:700;color:var(--blue);margin-bottom:6px">ACES (16+ QS)</div>
        ${aceSP.slice(0,8).map(p => `
          <div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:11px;display:flex;gap:6px;align-items:baseline">
            <span style="font-weight:700;min-width:130px">${p.name}</span>
            <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${p.K||0}K · <span style="color:var(--blue);font-weight:700">${p.QS||0}QS</span> · ${p.W||0}W · ${(p.ERA||0).toFixed(2)} ERA · ${(p.WHIP||0).toFixed(2)} WHIP</span>
            <span style="margin-left:auto;color:var(--text-tertiary);font-size:10px">ADP ${p.espnADP<900?p.espnADP:'?'}</span>
          </div>
        `).join('')}
        <div style="font-size:10px;font-weight:700;color:var(--espn-red);margin-top:10px;margin-bottom:6px">CLOSERS (25+ SV)</div>
        ${eliteRP.slice(0,8).map(p => `
          <div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:11px;display:flex;gap:6px;align-items:baseline">
            <span style="font-weight:700;min-width:130px">${p.name}</span>
            <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${p.K||0}K · <span style="color:var(--espn-red);font-weight:700">${p.SV||0}SV</span> · ${(p.ERA||0).toFixed(2)} ERA · ${(p.WHIP||0).toFixed(2)} WHIP</span>
            <span style="margin-left:auto;color:var(--text-tertiary);font-size:10px">ADP ${p.espnADP<900?p.espnADP:'?'}</span>
          </div>
        `).join('')}

        <div style="margin-top:20px;text-align:right">
          <button class="btn btn-secondary" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Mock Draft Analysis ──
function showMockAnalysis() {
  const entries = Object.entries(PREP.myMockPicks);
  if (entries.length === 0) { toast('Import a mock first'); return; }

  const sorted = [];
  entries.forEach(([name, rounds]) => rounds.forEach(r => sorted.push({ name, round: r })));
  sorted.sort((a, b) => a.round - b.round);

  const mockTeamPicks = sorted.map(p => {
    const proj = projFor(p.name);
    return proj ? { name: p.name, round: p.round, ...proj } : { name: p.name, round: p.round };
  }).filter(p => p.R !== undefined || p.K !== undefined);

  const savedPicks = [...PREP.picks];
  PREP.picks = mockTeamPicks;
  const scores = calcPrepScores();
  PREP.picks = savedPicks;
  const overall = mockTeamPicks.length > 0 ? Math.round(Object.values(scores).reduce((a,b) => a+b, 0) / ALL_CATS.length) : 0;

  // Position breakdown
  const posCounts = {};
  mockTeamPicks.forEach(p => {
    const pos = isPitcherProj(p) ? (p.SV > 5 ? 'RP' : 'SP') : (p.pos || '?');
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  });

  // Find weakest and strongest categories
  const catsSorted = ALL_CATS.map(c => ({ cat: c, score: scores[c] || 0 })).sort((a,b) => a.score - b.score);
  const weakest = catsSorted.filter(c => c.score < 60);
  const strongest = catsSorted.filter(c => c.score >= 80);

  // ── PICK-BY-PICK ANALYSIS ──
  const pickGrades = mockTeamPicks.map(p => {
    const proj = projFor(p.name);
    if (!proj) return { ...p, grade: '?', note: 'No projection data', color: 'var(--text-tertiary)' };
    const isPit = isPitcherProj(proj);
    const espn = PREP.espnADP[p.name] || {};
    const espnADP = espn.espnADP || proj.espnADP || proj.adp || 999;
    const pickNum = PREP.pickOrder[(p.round || 1) - 1]?.overall || p.round * 12;
    const adpDiff = espnADP - pickNum;

    let grade, note, color;

    // Value assessment
    if (adpDiff < -20) { grade = 'REACH'; note = `ESPN ADP ${espnADP} — drafted ${Math.abs(Math.round(adpDiff))} picks early. Could have waited.`; color = 'var(--espn-red)'; }
    else if (adpDiff < -8) { grade = 'EARLY'; note = `ESPN ADP ${espnADP} — slight reach but defensible if you need them.`; color = 'var(--yellow)'; }
    else if (adpDiff > 15) { grade = 'STEAL'; note = `ESPN ADP ${espnADP} — got them ${Math.round(adpDiff)} picks below market.`; color = 'var(--green)'; }
    else if (adpDiff > 5) { grade = 'VALUE'; note = `ESPN ADP ${espnADP} — nice value at this pick.`; color = 'var(--green)'; }
    else { grade = 'FAIR'; note = `ESPN ADP ${espnADP} — right on schedule.`; color = 'var(--text-secondary)'; }

    // Positional concerns
    if ((p.pos === 'DH' || p.pos === '?') && !isPit && p.round <= 8) {
      note += ' DH-only limits your roster flexibility — prefer players with position eligibility.';
      if (grade === 'FAIR') { grade = 'MEH'; color = 'var(--yellow)'; }
    }

    // Category fit
    if (!isPit && (proj.SB || 0) >= 20 && (scores.SB || 0) < 60) {
      note += ' Great SB source — your weakest category.';
    }
    if (!isPit && (proj.SB || 0) <= 3 && (scores.SB || 0) < 50) {
      note += ' Zero SB help — your team already lacks speed.';
    }

    return { ...p, grade, note, color, espnADP, isPit };
  });

  // ── SPECIFIC SWAP SUGGESTIONS ──
  const swaps = [];
  const allPlayers = getPrepPlayers();
  const draftedSet = new Set(mockTeamPicks.map(p => p.name));

  for (const pick of pickGrades) {
    if (pick.grade === 'REACH' || pick.grade === 'MEH') {
      const pickNum = PREP.pickOrder[(pick.round || 1) - 1]?.overall || pick.round * 12;
      // Find better options that were available at this pick
      const alternatives = allPlayers.filter(p =>
        !draftedSet.has(p.name) &&
        (p.espnADP || 999) >= pickNum - 5 &&
        (p.espnADP || 999) <= pickNum + 10 &&
        p.aiRank < (pick.aiRank || 999)
      ).sort((a, b) => a.aiRank - b.aiRank).slice(0, 2);

      if (alternatives.length > 0) {
        const alt = alternatives[0];
        let reason = `AI #${alt.aiRank} vs your pick's #${pick.aiRank || '?'}`;
        if (!isPitcherProj(alt) && (alt.SB || 0) >= 15 && (scores.SB || 0) < 60) reason += ', adds SB';
        swaps.push({
          round: pick.round,
          drop: pick.name,
          add: alt.name,
          addPos: alt.pos,
          reason,
        });
      }
    }
  }

  // ── SB FIX SUGGESTIONS — only players realistically available at our picks ──
  const sbFixes = [];
  if ((scores.SB || 0) < 60) {
    // For each of our pick positions, find SB sources that would actually be available
    // A player with ADP 1.4 is NOT available at pick 9
    const sbSources = allPlayers
      .filter(p => !draftedSet.has(p.name) && !isPitcherProj(p) && (p.SB || 0) >= 15)
      .filter(p => {
        const adp = p.espnADP || 999;
        // Player is "reachable" if their ADP is within 5 picks of any of our draft slots
        return PREP.pickOrder.some(pk => adp >= pk.overall - 5 && adp <= pk.overall + 15);
      })
      .sort((a, b) => (a.espnADP || 999) - (b.espnADP || 999))
      .slice(0, 8);

    sbSources.forEach(p => {
      const adp = p.espnADP || 999;
      // Find the best pick to grab this player
      const bestPick = PREP.pickOrder.find(pk => pk.overall >= adp - 5) || PREP.pickOrder[0];
      const targetRound = bestPick.round;
      const reachOrValue = adp > bestPick.overall ? 'STEAL' : (bestPick.overall - adp > 8 ? 'REACH' : 'IN RANGE');
      sbFixes.push({ name: p.name, pos: p.pos, sb: p.SB, espnADP: adp < 900 ? adp : '?', targetRound, pickNum: bestPick.overall, tag: reachOrValue,
        R: p.R||0, HR: p.HR||0, RBI: p.RBI||0, AVG: p.AVG||0, OPS: p.OPS||0 });
    });
  }

  // ── POSITIONAL ISSUES ──
  const posIssues = [];
  const dhCount = mockTeamPicks.filter(p => (p.pos === 'DH' || p.pos === '?') && !isPitcherProj(p)).length;
  if (dhCount >= 2) posIssues.push(`${dhCount} DH/UTIL-only players — you only have 2 UTIL slots. Players with real position eligibility give you more lineup flexibility. Consider swapping a DH for a player with 1B/OF/SS eligibility.`);
  const ofCount = mockTeamPicks.filter(p => ['OF','LF','CF','RF'].includes(p.pos)).length;
  if (ofCount < 3) posIssues.push(`Only ${ofCount} outfielders — you need 3 OF starters. You'll have to play DH/UTIL players there which limits your bench flexibility.`);
  if (!posCounts['C']) posIssues.push('No catcher — that\'s a zero in a roster slot every week. Either punt C and stream, or grab Drake Baldwin / Cal Raleigh by round 9.');
  const ssCount = mockTeamPicks.filter(p => p.pos === 'SS').length;
  if (ssCount === 0) posIssues.push('No shortstop — premium position, consider targeting one in rounds 2-4 next time.');
  if ((posCounts['SP'] || 0) >= 7) posIssues.push(`${posCounts['SP']} starting pitchers is heavy. In H2H you only start 3 SP + 2 P. Consider flipping 1-2 late SPs for hitters with SB/AVG upside.`);

  // ── RE-DRAFT STRATEGY ──
  const reDraft = [];
  if ((scores.SB || 0) < 60) reDraft.push('Prioritize SB in rounds 1-3 — target guys like Elly De La Cruz, Bobby Witt Jr., Ronald Acuna Jr., or Trea Turner who give you 25+ SB with full counting stat profiles.');
  if (dhCount >= 2) reDraft.push('Avoid DH-only players before round 10 — roster flexibility matters in H2H. A slightly worse player with SS or OF eligibility is often better than a pure DH.');
  if ((posCounts['SP'] || 0) >= 6) reDraft.push('Wait on pitching — you can stream SPs during the season (7 transactions/matchup). Draft 3-4 aces and fill the rest with hitters who contribute to scarce cats.');
  if (weakest.length > 0 && weakest[0].score < 50) reDraft.push(`Your biggest hole is ${weakest[0].cat} at ${weakest[0].score}/100. Specifically target ${weakest[0].cat} contributors starting in round ${weakest[0].cat === 'SB' ? '1-2' : '4-6'} of your next mock.`);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:780px">
      <div class="overlay-header" style="background:var(--blue)">
        <h3>Mock Draft Analysis</h3>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:0.7">Overall</div>
          <div style="font-size:28px;font-weight:700">${overall}/100</div>
        </div>
      </div>
      <div class="overlay-body" style="padding:20px;max-height:80vh;overflow-y:auto">

        <!-- Category Scores -->
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">CATEGORY SCORES</div>
        <div class="cat-bars" id="mock-analysis-bat"></div>
        <div class="cat-bars" style="margin-top:8px;margin-bottom:16px" id="mock-analysis-pit"></div>

        <!-- Biggest Hole -->
        ${weakest.length > 0 ? `
        <div style="background:var(--red-bg);border:1px solid #fca5a5;border-radius:8px;padding:14px;margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:var(--espn-red);margin-bottom:4px">BIGGEST HOLE: ${weakest[0].cat} (${weakest[0].score}/100)</div>
          <div style="font-size:12px;color:var(--text-secondary)">
            ${weakest[0].cat === 'SB' ? 'Stolen bases are the scarcest category in H2H — once the top SB guys are gone, there\'s no replacement. You need to draft speed in rounds 1-4 or you\'ll lose SB every week.' :
              weakest[0].cat === 'SV' ? 'Saves are volatile but important. Draft 1 elite closer by round 8, or plan to stream the hot closer each week.' :
              `${weakest[0].cat} is below competitive level. Target specific ${weakest[0].cat} contributors earlier.`}
          </div>
        </div>` : ''}

        <!-- Pick-by-Pick Grades -->
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">PICK-BY-PICK GRADES</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Positions: ${Object.entries(posCounts).map(([k,v]) => `${v} ${k}`).join(' · ')}</div>
        ${pickGrades.map(p => {
          const pos = p.isPit ? (p.SV > 5 ? 'RP' : 'SP') : (p.pos || '?');
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">
            <div style="width:28px;font-size:11px;color:var(--text-tertiary);font-weight:700;flex-shrink:0">R${p.round}</div>
            <div style="width:50px;font-size:10px;font-weight:700;color:${p.color};flex-shrink:0">${p.grade}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${p.name} <span class="pos-badge ${pos.toLowerCase()}" style="font-size:9px">${pos}</span></div>
              <div style="font-size:11px;color:var(--text-secondary)">${p.note}</div>
            </div>
          </div>`;
        }).join('')}

        <!-- Swap Suggestions -->
        ${swaps.length > 0 ? `
        <div style="font-size:12px;font-weight:700;margin-top:20px;margin-bottom:8px">SUGGESTED SWAPS</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Players you could have taken instead at the same pick</div>
        ${swaps.map(s => `
          <div style="background:var(--yellow-bg);border-radius:6px;padding:10px;margin-bottom:6px;font-size:12px">
            <span style="font-weight:700">R${s.round}:</span> Swap <span style="color:var(--espn-red);font-weight:600">${s.drop}</span> for <span style="color:var(--green);font-weight:600">${s.add}</span> <span class="pos-badge ${s.addPos?.toLowerCase()}" style="font-size:9px">${s.addPos}</span> — ${s.reason}
          </div>
        `).join('')}` : ''}

        <!-- SB Fix -->
        ${sbFixes.length > 0 ? `
        <div style="font-size:12px;font-weight:700;margin-top:20px;margin-bottom:8px">SB FIX — REALISTIC TARGETS FOR YOUR PICKS</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">SB sources actually available at your draft slots (pick 9, 16, 33, 40...)</div>
        ${sbFixes.map(p => `
          <div style="padding:6px 0;border-bottom:1px solid #f3f4f6">
            <div style="display:flex;align-items:center;gap:8px;font-size:12px">
              <span style="font-weight:700;color:var(--espn-red);width:24px">R${p.targetRound}</span>
              <span style="font-weight:600;flex:1">${p.name}</span>
              <span class="pos-badge ${p.pos?.toLowerCase()}" style="font-size:9px">${p.pos}</span>
              <span style="color:var(--green);font-weight:700">${p.sb} SB</span>
              <span style="font-size:10px;color:var(--text-tertiary)">ADP ${p.espnADP} · Pick ${p.pickNum}</span>
              <span class="signal ${p.tag==='STEAL'?'good':p.tag==='REACH'?'warn':''}" style="font-size:9px">${p.tag}</span>
            </div>
            <div style="font-size:10px;color:var(--text-secondary);padding-left:32px;font-variant-numeric:tabular-nums">
              ${p.R}R · ${p.HR}HR · ${p.RBI}RBI · ${(p.AVG||0).toFixed(3)} AVG · ${(p.OPS||0).toFixed(3)} OPS
            </div>
          </div>
        `).join('')}` : ''}

        <!-- Positional Issues -->
        ${posIssues.length > 0 ? `
        <div style="font-size:12px;font-weight:700;margin-top:20px;margin-bottom:8px">ROSTER ISSUES</div>
        ${posIssues.map(a => `<div style="font-size:12px;color:var(--text-secondary);padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:8px"><span style="color:var(--yellow);flex-shrink:0">&#9888;</span>${a}</div>`).join('')}` : ''}

        <!-- Re-Draft Strategy -->
        <div style="font-size:12px;font-weight:700;margin-top:20px;margin-bottom:8px">NEXT MOCK — DO THIS DIFFERENTLY</div>
        ${reDraft.map(a => `<div style="font-size:12px;color:var(--text-secondary);padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:8px"><span style="color:var(--blue);flex-shrink:0">&#10148;</span>${a}</div>`).join('')}

        <div style="margin-top:20px;text-align:right">
          <button class="btn btn-secondary" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  setTimeout(() => {
    const batEl = document.getElementById('mock-analysis-bat');
    const pitEl = document.getElementById('mock-analysis-pit');
    if (batEl) renderCatBars(batEl, CATS_BAT, scores);
    if (pitEl) renderCatBars(pitEl, CATS_PIT, scores);
  }, 50);
}

// ── Wishlist Detail View ──
function showWishlistDetail() {
  const allWL = [...PREP.wishlist.batters, ...PREP.wishlist.pitchers];
  if (allWL.length === 0) { toast('Add players to your wishlist first'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';

  const rows = allWL.map(p => {
    const proj = projFor(p.name);
    if (!proj) return null;
    const isPit = isPitcherProj(proj);
    const espn = PREP.espnADP[p.name] || {};
    const espnADP = espn.espnADP || proj.espnADP || proj.adp || 999;
    const aiPlayer = getPrepPlayers().find(pl => pl.name === p.name);
    const aiRank = aiPlayer?.aiRank || 999;
    const health = proj.health_pct || 90;
    const mockRounds = (PREP.myMockPicks[p.name] || []);

    // Recommend when to draft
    let draftWindow = '';
    let draftAdvice = '';
    if (espnADP < 900) {
      const targetRound = Math.ceil(espnADP / NUM_TEAMS_DRAFT);
      const safeRound = Math.max(1, targetRound - 1);
      // Find which of our picks is closest
      const ourPick = PREP.pickOrder.find(pk => pk.overall >= espnADP - 8);
      if (ourPick) {
        draftWindow = `R${safeRound}-R${targetRound}`;
        if (aiRank < espnADP - 10) {
          draftAdvice = `AI says grab early — undervalued. Target R${safeRound} (Pick ${ourPick.overall}).`;
        } else if (aiRank > espnADP + 10) {
          draftAdvice = `AI says wait — overvalued by ESPN. Could slip to R${targetRound + 1}+.`;
        } else {
          draftAdvice = `Draft in R${safeRound}-R${targetRound}. ADP ${espnADP} means they go around Pick ${Math.round(espnADP)}.`;
        }
      }
    }

    return { name: p.name, pos: p.pos || proj.pos, team: p.team || proj.team, espnADP, aiRank, health, isPit, proj, draftWindow, draftAdvice, mockRounds };
  }).filter(Boolean).sort((a, b) => a.aiRank - b.aiRank);

  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:750px">
      <div class="overlay-header" style="background:var(--yellow);color:var(--text)">
        <h3>Wishlist — War Room Analysis</h3>
        <div style="font-size:12px">${allWL.length} players</div>
        <button class="btn btn-sm" style="background:rgba(0,0,0,0.1);color:var(--text);border:none" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
      </div>
      <div class="overlay-body" style="padding:16px;max-height:75vh;overflow-y:auto">
        ${rows.map(p => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;${PREP.draftedNames.has(p.name)?'opacity:0.4':''}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span class="pos-badge ${p.isPit ? 'sp' : p.pos.toLowerCase()}">${p.pos}</span>
              <div style="flex:1">
                <div style="font-size:14px;font-weight:700">${p.name}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${p.team} · AI #${p.aiRank} · ESPN ADP ${p.espnADP < 900 ? p.espnADP : '?'} · ${p.health}% HP</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:10px;color:var(--text-tertiary)">Draft Window</div>
                <div style="font-size:16px;font-weight:700;color:var(--espn-red)">${p.draftWindow || '?'}</div>
              </div>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${p.draftAdvice}</div>
            ${p.mockRounds.length > 0 ? `<div style="font-size:11px;color:var(--blue)">Mocked in: ${p.mockRounds.map(r => 'R'+r).join(', ')}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:8px">
              <button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--blue)" onclick="this.closest('.overlay-backdrop').remove();showWarRoom('${p.name.replace(/'/g,"\\'")}')">Full War Room</button>
              <button class="btn-draft" onclick="prepDraft('${p.name.replace(/'/g,"\\'")}');this.closest('.overlay-backdrop').remove()">Draft</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── War Room Player Report ──
function showWarRoom(name) {
  const proj = projFor(name);
  if (!proj) { toast('No data for ' + name); return; }

  const isPit = isPitcherProj(proj);
  const espn = PREP.espnADP[name] || {};
  const scSignals = buildStatcastSignals();
  const scTag = scSignals[name] || '';
  const health = proj.health_pct || proj.health || 90;
  const age = proj.age || 27;
  const confidence = proj.confidence || 50;
  const espnADP = espn.espnADP || proj.espnADP || proj.adp || '?';
  const aiPlayer = getPrepPlayers().find(p => p.name === name);
  const aiRank = aiPlayer?.aiRank || '?';

  // Build signals
  const signals = [];
  // Health
  if (health >= 95) signals.push({icon:'✅', text:'Full season health — no injury discount needed', cls:'good'});
  else if (health >= 80) signals.push({icon:'⚠️', text:`Health: ${health}% — minor injury risk, small discount`, cls:''});
  else signals.push({icon:'🏥', text:`Health: ${health}% — significant injury risk, discount counting stats`, cls:'bad'});

  // Age
  if (age >= 33) signals.push({icon:'📉', text:`Age ${age} — decline phase, conservative projection`, cls:'bad'});
  else if (age >= 25 && age <= 29) signals.push({icon:'📈', text:`Age ${age} — peak window, full upside`, cls:'good'});
  else if (age <= 24) signals.push({icon:'🌟', text:`Age ${age} — young talent, high ceiling but volatile`, cls:''});

  // ADP value
  const adpDiff = espnADP - aiRank;
  if (adpDiff > 15) signals.push({icon:'⚡', text:`AI ranks ${Math.round(adpDiff)} spots higher than ESPN — undervalued by market`, cls:'good'});
  else if (adpDiff < -15) signals.push({icon:'⚠️', text:`AI ranks ${Math.abs(Math.round(adpDiff))} spots lower than ESPN — overvalued by market`, cls:'bad'});

  // Statcast
  if (scTag.includes('BREAKOUT')) signals.push({icon:'🔬', text:'Statcast: expected stats exceed actual — breakout candidate', cls:'good'});
  if (scTag.includes('REGRESS')) signals.push({icon:'🔬', text:'Statcast: actual stats exceed expected — regression risk', cls:'bad'});
  if (scTag.includes('UNLUCKY')) signals.push({icon:'🔬', text:'Statcast: ERA higher than xERA — been unlucky, buy low', cls:'good'});
  if (scTag.includes('LUCKY')) signals.push({icon:'🔬', text:'Statcast: ERA lower than xERA — been lucky, sell high', cls:'bad'});

  // Confidence
  if (confidence < 50) signals.push({icon:'📊', text:`Low confidence projection (${confidence}/100) — stat estimates are tier-based, not player-specific`, cls:''});

  // Category fit
  if (!isPit) {
    const cats = [];
    if ((proj.R||0) >= 90) cats.push('R');
    if ((proj.HR||0) >= 28) cats.push('HR');
    if ((proj.RBI||0) >= 85) cats.push('RBI');
    if ((proj.SB||0) >= 15) cats.push('SB');
    if ((proj.AVG||0) >= 0.270) cats.push('AVG');
    if ((proj.OPS||0) >= 0.830) cats.push('OPS');
    if (cats.length >= 5) signals.push({icon:'🏆', text:`${cats.length}-category contributor: ${cats.join(', ')}`, cls:'good'});
    else if (cats.length >= 3) signals.push({icon:'👍', text:`Contributes to: ${cats.join(', ')}`, cls:''});
    if ((proj.SB||0) >= 25) signals.push({icon:'💨', text:`Elite SB (${proj.SB}) — scarcest category in H2H, premium value`, cls:'good'});
  } else {
    const cats = [];
    if ((proj.K||0) >= 180) cats.push('K');
    if ((proj.QS||0) >= 15) cats.push('QS');
    if ((proj.ERA||0) > 0 && proj.ERA <= 3.30) cats.push('ERA');
    if ((proj.WHIP||0) > 0 && proj.WHIP <= 1.10) cats.push('WHIP');
    if ((proj.SV||0) >= 25) cats.push('SV');
    if (cats.length >= 3) signals.push({icon:'🏆', text:`Elite pitching: ${cats.join(', ')}`, cls:'good'});
    if ((proj.QS||0) >= 18) signals.push({icon:'🐴', text:`Workhorse — ${proj.QS} QS, high-volume innings eater`, cls:'good'});
  }

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:550px">
      <div class="overlay-header">
        <div>
          <h3>${name}</h3>
          <div style="font-size:12px;opacity:0.85">${proj.team || '?'} · ${proj.pos || '?'} · Age ${age}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:0.7">AI Rank</div>
          <div style="font-size:24px;font-weight:700">#${aiRank}</div>
        </div>
      </div>
      <div class="overlay-body" style="padding:20px">
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="flex:1;background:var(--bg);padding:10px;border-radius:6px;text-align:center">
            <div style="font-size:10px;color:var(--text-tertiary)">ESPN ADP</div>
            <div style="font-size:18px;font-weight:700">${espnADP}</div>
          </div>
          <div style="flex:1;background:var(--bg);padding:10px;border-radius:6px;text-align:center">
            <div style="font-size:10px;color:var(--text-tertiary)">Health</div>
            <div style="font-size:18px;font-weight:700;color:${health>=85?'var(--green)':health>=70?'var(--yellow)':'var(--espn-red)'}">${health}%</div>
          </div>
          <div style="flex:1;background:var(--bg);padding:10px;border-radius:6px;text-align:center">
            <div style="font-size:10px;color:var(--text-tertiary)">Confidence</div>
            <div style="font-size:18px;font-weight:700">${confidence}</div>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">PROJECTED STATS</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          ${isPit ? [
            ['K', proj.K], ['QS', proj.QS], ['W', proj.W], ['SV', proj.SV],
            ['ERA', (proj.ERA||0).toFixed(2)], ['WHIP', (proj.WHIP||0).toFixed(2)]
          ].map(([k,v]) => `<div style="background:var(--bg);padding:6px 10px;border-radius:4px;text-align:center;min-width:55px"><div style="font-size:10px;color:var(--text-tertiary)">${k}</div><div style="font-size:15px;font-weight:700">${v||0}</div></div>`).join('') : [
            ['R', proj.R], ['HR', proj.HR], ['RBI', proj.RBI], ['SB', proj.SB],
            ['AVG', (proj.AVG||0).toFixed(3)], ['OPS', (proj.OPS||0).toFixed(3)]
          ].map(([k,v]) => `<div style="background:var(--bg);padding:6px 10px;border-radius:4px;text-align:center;min-width:55px"><div style="font-size:10px;color:var(--text-tertiary)">${k}</div><div style="font-size:15px;font-weight:700">${v||0}</div></div>`).join('')}
        </div>
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">WAR ROOM SIGNALS</div>
        ${signals.map(s => `
          <div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
            <span style="flex-shrink:0">${s.icon}</span>
            <span style="color:${s.cls==='good'?'var(--green)':s.cls==='bad'?'var(--espn-red)':'var(--text-secondary)'}">${s.text}</span>
          </div>
        `).join('')}
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
          <button class="btn btn-primary" onclick="toggleWishlist('${name.replace(/'/g,"\\'")}','${proj.pos||''}','${proj.team||''}');this.closest('.overlay-backdrop').remove()">&#9733; ${isOnWishlist(name) ? 'Remove from' : 'Add to'} Wishlist</button>
          <button class="btn btn-primary" onclick="prepDraft('${name.replace(/'/g,"\\'")}');this.closest('.overlay-backdrop').remove()">Draft</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── ESPN Mock Draft Import (via link) ──
document.getElementById('btn-espn-mock').addEventListener('click', async () => {
  const url = prompt(
    'Paste your ESPN practice draft URL:\n\n' +
    'Example: https://fantasy.espn.com/baseball/draft?leagueId=1522205607&seasonId=2026&teamId=19&memberId=...'
  );
  if (!url) return;

  // Extract leagueId and teamId from URL
  const leagueMatch = url.match(/leagueId=(\d+)/);
  const teamMatch = url.match(/teamId=(\d+)/);
  if (!leagueMatch) { toast('Could not find leagueId in URL'); return; }

  const mockLeagueId = parseInt(leagueMatch[1]);
  const teamId = teamMatch ? parseInt(teamMatch[1]) : null;

  toast('Loading mock draft from ESPN...');
  const r = await api('draft/mock-results', {
    method: 'POST',
    body: { leagueId: mockLeagueId, teamId }
  });

  if (r.error) { toast('Error: ' + r.error); return; }

  if (r.totalPicks === 0) {
    toast(r.inProgress ? 'Mock draft is in progress — no picks made yet. Come back after it finishes!' : 'No picks found in this mock draft');
    return;
  }

  // Import your picks
  const yourPicks = r.yourPicks || [];
  for (const pick of yourPicks) {
    const matched = fuzzyMatchPlayer(pick.name) || pick.name;
    if (!PREP.myMockPicks[matched]) PREP.myMockPicks[matched] = [];
    PREP.myMockPicks[matched].push(pick.round);
  }

  toast(`Imported ${yourPicks.length} picks from ESPN mock draft!`);
  _prepPlayersCache = null;
  savePrepState();
  renderMockDisplay();
  renderPrepRound();

  // Also show all picks in a popup
  if (r.allPicks && r.allPicks.length > 0) {
    showMockBoardOverlay(r);
  }
});

function showMockBoardOverlay(mockData) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  const allPicks = mockData.allPicks || [];
  const maxRound = Math.min(5, Math.max(...allPicks.map(p => p.round || 0)));

  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:800px">
      <div class="overlay-header" style="background:var(--green)">
        <h3>ESPN Mock Draft Results</h3>
        <div style="font-size:12px;opacity:0.85">${mockData.totalPicks} picks · ${mockData.draftType}</div>
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border:none" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
      </div>
      <div class="overlay-body">
        <div class="card-title" style="margin-bottom:4px">Your Picks</div>
        <div style="margin-bottom:16px">
          ${(mockData.yourPicks || []).map(p => `
            <div class="opt-player" style="background:var(--green-bg);border-radius:4px;padding:6px 8px;margin:2px 0">
              <div class="opt-round" style="color:var(--green);font-weight:700">R${p.round}</div>
              <div class="opt-name" style="font-weight:700">${p.name}</div>
              <div class="opt-pos"><span class="pos-badge ${(p.pos||'').toLowerCase()}">${p.pos}</span></div>
              <div style="font-size:11px;color:var(--text-secondary)">Pk ${p.overall}</div>
            </div>
          `).join('')}
        </div>
        <div class="card-title" style="margin-bottom:8px">Full Board (first ${maxRound} rounds)</div>
        <div style="max-height:300px;overflow-y:auto">
          ${allPicks.filter(p => p.round <= maxRound).map(p => `
            <div class="opt-player" style="${p.isMine ? 'background:var(--green-bg);border-radius:4px;padding:4px 8px;margin:1px 0;font-weight:600' : ''}">
              <div class="opt-round" style="width:44px;${p.isMine ? 'color:var(--green)' : ''}">${p.overall}</div>
              <div style="width:36px;font-size:11px;color:var(--text-tertiary)">R${p.round}</div>
              <div style="width:20px;font-size:11px;${p.isMine ? 'color:var(--green);font-weight:700' : 'color:var(--text-tertiary)'}">${p.isMine ? '★' : ''}</div>
              <div class="opt-name">${p.name}</div>
              <div class="opt-pos"><span class="pos-badge ${(p.pos||'').toLowerCase()}">${p.pos}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── My Mock Draft Import (paste) ──
document.getElementById('btn-import-mock').addEventListener('click', () => {
  // Use a textarea overlay instead of prompt for pasting long email content
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:600px">
      <div class="overlay-header" style="background:var(--blue)">
        <h3>Import Mock Draft</h3>
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border:none" id="mock-import-close">Close</button>
      </div>
      <div class="overlay-body" style="padding:20px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          Paste your ESPN mock draft email, or just the player names. The parser handles all these formats:
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;background:var(--bg);padding:10px;border-radius:6px;font-family:monospace;white-space:pre-wrap">Round 1 (Pick 9): Bobby Witt Jr., SS
Round 2 (Pick 16): Kyle Tucker, OF

— or just —

Bobby Witt Jr.
Kyle Tucker
Gerrit Cole</div>
        <textarea id="mock-import-text" style="width:100%;height:200px;border:1px solid var(--border);border-radius:6px;padding:10px;font-size:13px;font-family:inherit;resize:vertical" placeholder="Paste your mock draft results here..."></textarea>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <span style="font-size:11px;color:var(--text-tertiary);flex:1;align-self:center" id="mock-import-status"></span>
          <button class="btn btn-secondary" id="mock-import-cancel">Cancel</button>
          <button class="btn btn-primary" id="mock-import-go">Import Picks</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('mock-import-close').onclick = () => overlay.remove();
  document.getElementById('mock-import-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('mock-import-go').onclick = async () => {
    const raw = document.getElementById('mock-import-text').value;
    if (!raw.trim()) { overlay.remove(); return; }
    // Ensure projections are loaded before parsing
    if (Object.keys(S.projections).length === 0) {
      document.getElementById('mock-import-status').textContent = 'Loading projections first...';
      await loadProjections();
    }
    console.log(`Parser running with ${Object.keys(S.projections).length} projections`);
    const parsed = parseMockDraftEmail(raw);
    console.log(`Parser returned ${Object.keys(parsed).length} picks, board has ${PREP.lastMockBoard.length} total`);
    // Merge into existing mock picks (don't reset — accumulate from multiple mocks)
    for (const [name, rounds] of Object.entries(parsed)) {
      if (!PREP.myMockPicks[name]) PREP.myMockPicks[name] = [];
      PREP.myMockPicks[name].push(...rounds);
    }
    const count = Object.keys(parsed).length;
    if (count === 0) {
      const debugLines = raw.split('\n').map(l=>l.trim()).filter(l=>l.length>3).slice(0,6);
      const projCount = Object.keys(S.projections).length;
      // Show char codes of first pick line to diagnose space issues
      const pickLine = debugLines.find(l => l.match(/^\d/)) || debugLines[1] || '';
      const codes = [...pickLine.slice(0,50)].map(c => c.charCodeAt(0));
      document.getElementById('mock-import-status').innerHTML =
        `<span style="color:var(--espn-red)">0 picks found.</span> Projections: ${projCount}` +
        `<br>Char codes of first pick line:<br><code style="font-size:9px">${codes.join(',')}</code>` +
        `<br><code style="font-size:9px;white-space:pre-wrap">${debugLines.slice(0,4).map(l=>`"${l.slice(0,70)}"`).join('\n')}</code>`;
      return;
    }
    toast(`Imported ${count} picks from mock draft`);
    _prepPlayersCache = null;
    savePrepState();
    document.getElementById('btn-mock-analysis').style.display = '';
    renderMockDisplay();
    renderPrepRound();
    overlay.remove();
    setTimeout(() => showMockAnalysis(), 300);
  };

  // Live preview as they type/paste
  document.getElementById('mock-import-text').addEventListener('input', () => {
    const raw = document.getElementById('mock-import-text').value;
    const saved = PREP.lastMockBoard;
    const parsed = parseMockDraftEmail(raw);
    PREP.lastMockBoard = saved; // don't overwrite saved board during preview
    const myCount = Object.keys(parsed).length;
    const allCount = PREP.lastMockBoard?.length || 0;
    document.getElementById('mock-import-status').textContent =
      myCount > 0 ? `Found ${myCount} of your picks` + (allCount > 0 ? ` (${allCount} total picks)` : '') : 'Paste your ESPN draft email...';
  });
});

function parseMockDraftEmail(raw) {
  const myPicks = {};
  const allPicks = [];

  // User might be "We're the Millers" or "Dustin's Daring Team" — match on first name
  const MY_TEAM = document.getElementById('input-team-name')?.value || "We're the Millers";
  const MY_FIRST = MY_TEAM.split(/['\u2019\s]/)[0].toLowerCase(); // "we" or "dustin"

  // Aggressive normalize: replace ALL unicode whitespace, curly quotes, zero-width chars
  const clean = raw
    .replace(/[\u00A0\u2000-\u200B\u2007\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Collapse runs of 5+ spaces to exactly 5 (preserve the multi-space signal)
  // But also handle the case where spaces are fully collapsed to single
  const lines = clean.split('\n').map(l => l.trim());

  // Build player name index sorted longest-first for greedy matching
  const playerNames = Object.keys(S.projections)
    .filter(n => n.length >= 4)
    .sort((a, b) => b.length - a.length);

  let currentRound = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Round header: "Round 1"
    const rm = line.match(/^Round\s+(\d+)/i);
    if (rm) { currentRound = parseInt(rm[1]); continue; }

    // Skip position lines, email junk
    if (line.match(/^(SP|RP|C|1B|2B|3B|SS|LF|CF|RF|DH),/i)) continue;
    if (line.match(/^(ESPN|Thank|Note|Now|Create|Follow|Twitter|Facebook|©|This email|Fantasy|Download|Free|Gmail|Reply|logo|app|Dustin Roy)/i)) continue;
    if (!currentRound) continue;

    // Must start with a pick number
    const nm = line.match(/^(\d{1,3})\s+/);
    if (!nm) continue;
    const overall = parseInt(nm[1]);
    if (overall < 1 || overall > 300) continue;

    const rest = line.slice(nm[0].length);

    let foundPlayer = null;
    let foundTeam = null;

    // Split on TAB character (char code 9) — this is what Gmail uses
    if (rest.includes('\t')) {
      const parts = rest.split('\t').map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 2) {
        foundTeam = parts.slice(0, -1).join(' ');
        foundPlayer = parts[parts.length - 1];
      }
    }

    // Fallback: split on 2+ whitespace
    if (!foundPlayer) {
      const parts = rest.split(/\s{2,}/).filter(p => p.length > 0);
      if (parts.length >= 2) {
        foundTeam = parts.slice(0, -1).join(' ');
        foundPlayer = parts[parts.length - 1];
      }
    }

    // Fallback: try matching known player names
    if (!foundPlayer && playerNames.length > 0) {
      for (const pn of playerNames) {
        const idx = rest.indexOf(pn);
        if (idx >= 0) {
          foundTeam = rest.slice(0, idx).trim();
          foundPlayer = pn;
          break;
        }
      }
    }

    if (!foundPlayer || foundPlayer.length < 3) continue;

    // Normalize player name to match projections (but don't require it)
    const matchedName = fuzzyMatchPlayer(foundPlayer) || foundPlayer;

    // Get position from next line
    let pos = '';
    const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    if (nextLine.match(/^(SP|RP|C|1B|2B|3B|SS|LF|CF|RF|DH),/i)) {
      pos = nextLine.split(',')[0].trim();
      i++;
    }

    // Is this my pick? Match on first name, full team name, or pick position 9
    const tl = (foundTeam || '').toLowerCase();
    const isMine = tl.includes(MY_FIRST + "'s")
      || tl.includes(MY_FIRST + "\u2019s")
      || tl === MY_TEAM.toLowerCase()
      || (MY_FIRST.length > 3 && tl.includes(MY_FIRST))
      || tl.includes("dustin");

    allPicks.push({ round: currentRound, overall, teamName: foundTeam, name: matchedName, pos, isMine });
    if (isMine) {
      if (!myPicks[matchedName]) myPicks[matchedName] = [];
      myPicks[matchedName].push(currentRound);
    }
  }

  PREP.lastMockBoard = allPicks;
  console.log(`Mock parser: ${allPicks.length} total, ${Object.keys(myPicks).length} mine (matching "${MY_FIRST}")`);
  if (allPicks.length === 0 && lines.length > 10) {
    console.log('Parser found 0 picks. First 8 lines:');
    lines.filter(l => l.length > 3).slice(0, 8).forEach(l => console.log(`  [${l.length}] "${l.slice(0,80)}"`));
  }
  return myPicks;
}

function fuzzyMatchPlayer(input) {
  if (!input || input.length < 3) return null;
  const lower = input.toLowerCase().trim();
  // Exact match first
  for (const name of Object.keys(S.projections)) {
    if (name.toLowerCase() === lower) return name;
  }
  // Partial match — input contains a full player name or vice versa
  for (const name of Object.keys(S.projections)) {
    const nl = name.toLowerCase();
    if (nl.includes(lower) || lower.includes(nl)) return name;
  }
  // Last name match (must be 4+ chars to avoid false positives)
  const inputLast = lower.split(' ').pop();
  if (inputLast.length >= 4) {
    for (const name of Object.keys(S.projections)) {
      if (name.toLowerCase().split(' ').pop() === inputLast) return name;
    }
  }
  return null; // no match
}

function renderMockDisplay() {
  const el = document.getElementById('mock-picks-display');
  const countLabel = document.getElementById('mock-count-label');
  const entries = Object.entries(PREP.myMockPicks);
  if (entries.length === 0) {
    el.innerHTML = 'No mocks imported';
    countLabel.textContent = '';
    return;
  }

  const totalPicks = Object.values(PREP.myMockPicks).flat().length;
  const uniquePlayers = entries.length;
  countLabel.textContent = `(${uniquePlayers} players)`;

  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" style="flex:1;font-size:10px" onclick="showMockAnalysis()">Mock Analysis</button>
      ${PREP.lastMockBoard?.length > 0 ? `<button class="btn btn-secondary btn-sm" style="flex:1;font-size:10px" onclick="showFullMockBoard()">Full Board</button>` : ''}
    </div>
  `;
}

function showFullMockBoard() {
  const board = PREP.lastMockBoard || [];
  if (!board.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.innerHTML = `
    <div class="overlay-card" style="max-width:800px">
      <div class="overlay-header" style="background:var(--green)">
        <h3>ESPN Mock Draft — Full Board</h3>
        <div style="font-size:12px;opacity:0.85">${board.length} picks · ${Math.ceil(board.length / NUM_TEAMS_DRAFT)} rounds</div>
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border:none" onclick="this.closest('.overlay-backdrop').remove()">Close</button>
      </div>
      <div class="overlay-body" style="padding:16px">
        <div style="max-height:70vh;overflow-y:auto">
          ${board.map(p => `
            <div class="opt-player" style="${p.isMine ? 'background:var(--green-bg);border-radius:4px;padding:4px 8px;margin:1px 0;font-weight:600' : 'padding:4px 0'}">
              <div style="width:30px;font-size:11px;color:var(--text-tertiary)">${p.overall}</div>
              <div style="width:24px;font-size:10px;color:var(--text-tertiary)">R${p.round}</div>
              <div style="width:12px;color:var(--green)">${p.isMine ? '★' : ''}</div>
              <div style="width:140px;font-size:11px;color:${p.isMine ? 'var(--green)' : 'var(--text-tertiary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.teamName}</div>
              <div class="opt-name" style="${p.isMine ? 'color:var(--green)' : ''}">${p.name}</div>
              ${p.pos ? `<div class="opt-pos"><span class="pos-badge ${p.pos.toLowerCase()}">${p.pos}</span></div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Claude's Mock Draft ──
document.getElementById('btn-claude-mock').addEventListener('click', () => {
  if (S.projCount === 0) { toast('Generate projections first'); return; }
  if (PREP.claudeMockDone) {
    // Already ran — offer to view or re-run
    if (!confirm("View Claude's existing mock? (Cancel to re-run)")) {
      PREP.claudeMockDone = false; // allow re-run
      _prepPlayersCache = null; // clear cache since SGP changed
    } else {
      showClaudeMock();
      return;
    }
  }
  if (!PREP.claudeMockDone && !confirm("Claude will auto-draft a full 23-round team from Pick 9. Run it?")) return;

  PREP.claudeMockTeam = simulateOptimalDraft();
  PREP.claudeMockDone = true;
  savePrepState();
  document.getElementById('btn-claude-mock').textContent = "View Claude's Team";
  showClaudeMock();
  toast("Claude's mock draft complete — 23 picks made");
});

function showClaudeMock() {
  const team = PREP.claudeMockTeam;
  if (!team) return;

  // Calc scores
  const savedPicks = [...PREP.picks];
  PREP.picks = team;
  const scores = calcPrepScores();
  PREP.picks = savedPicks;
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / ALL_CATS.length);

  // Build full board
  const fullBoard = simulateFullDraftBoard(team);

  renderCatBars(document.getElementById('opt-cat-bars-bat'), CATS_BAT, scores);
  renderCatBars(document.getElementById('opt-cat-bars-pit'), CATS_PIT, scores);
  document.getElementById('opt-overall').textContent = overall;

  // Count position breakdown
  const posCounts = {};
  team.forEach(p => {
    const pos = isPitcherProj(p) ? (p.SV > 5 ? 'RP' : 'SP') : (p.pos || '?');
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  });

  document.getElementById('opt-roster').innerHTML = `
    <div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary)">
      Positions: ${Object.entries(posCounts).map(([k,v]) => `${v} ${k}`).join(' · ')}
    </div>
    <div style="margin-bottom:16px">
      ${team.map(p => {
        const isPit = isPitcherProj(p);
        const displayPos = isPit ? (p.SV > 5 ? 'RP' : 'SP') : p.pos;
        return `<div class="opt-player">
          <div class="opt-round">R${p.round}</div>
          <div class="opt-name">${p.name}</div>
          <div class="opt-pos"><span class="pos-badge ${isPit ? 'sp' : (p.pos||'').toLowerCase()}">${displayPos}</span></div>
          <div class="opt-team">${p.team}</div>
          <div style="font-size:11px;color:var(--text-secondary)">Pk ${p.overall}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="card-title" style="margin-bottom:8px;margin-top:16px">Full Simulated Board (first 5 rounds)</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Based on ADP — Claude's picks highlighted in red</div>
    <div style="max-height:300px;overflow-y:auto">
      ${fullBoard.slice(0, 60).map(pick => {
        const isMine = pick.team === 'YOU';
        return `<div class="opt-player" style="${isMine ? 'background:var(--red-bg);border-radius:4px;padding:6px 8px;margin:2px 0;font-weight:600' : ''}">
          <div class="opt-round" style="width:44px;${isMine ? 'color:var(--espn-red)' : ''}">${pick.overall}</div>
          <div style="width:80px;font-size:11px;${isMine ? 'color:var(--espn-red);font-weight:700' : 'color:var(--text-tertiary)'}">${isMine ? '★ CLAUDE' : 'Team ' + pick.teamNum}</div>
          <div class="opt-name" style="${isMine ? 'color:var(--espn-red)' : ''}">${pick.playerName}</div>
          <div class="opt-pos"><span class="pos-badge ${(pick.pos||'').toLowerCase()}">${pick.pos}</span></div>
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('optimal-overlay').style.display = 'flex';
}

// Simulate the full 12-team draft board (all picks, not just ours)
function simulateFullDraftBoard(myTeam) {
  const allPlayers = getPrepPlayers().filter(p => p.adp < 400 && p.adp > 0);
  allPlayers.sort((a, b) => (a.adp || 999) - (b.adp || 999));
  const available = [...allPlayers];
  const myPickMap = {};
  myTeam.forEach(p => { myPickMap[p.overall] = p; });

  const board = [];
  const totalPicks = NUM_TEAMS_DRAFT * NUM_ROUNDS_DRAFT;

  for (let overall = 1; overall <= Math.min(totalPicks, 276); overall++) {
    const round = Math.ceil(overall / NUM_TEAMS_DRAFT);
    const posInRound = ((overall - 1) % NUM_TEAMS_DRAFT);
    const teamNum = round % 2 === 1 ? posInRound + 1 : NUM_TEAMS_DRAFT - posInRound;
    const isMine = teamNum === PICK_POS;

    if (isMine && myPickMap[overall]) {
      // Our pick from the optimal sim
      const p = myPickMap[overall];
      board.push({ overall, round, teamNum, team: 'YOU', playerName: p.name, pos: isPitcherProj(p) ? (p.SV > 5 ? 'RP' : 'SP') : p.pos });
      // Remove from available
      const idx = available.findIndex(a => a.name === p.name);
      if (idx >= 0) available.splice(idx, 1);
    } else {
      // Other team takes best available by ADP
      if (available.length > 0) {
        const taken = available.shift();
        board.push({ overall, round, teamNum, team: 'Team ' + teamNum, playerName: taken.name, pos: isPitcherProj(taken) ? (taken.SV > 5 ? 'RP' : 'SP') : taken.pos });
      }
    }
  }
  return board;
}

// (Claude's Mock Draft button handler is above)
document.getElementById('optimal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('optimal-overlay'))
    document.getElementById('optimal-overlay').style.display = 'none';
});

document.getElementById('btn-mock-analysis').addEventListener('click', () => showMockAnalysis());

// ── Field View ──
let rosterViewMode = 'list';
function setRosterView(mode) {
  rosterViewMode = mode;
  document.getElementById('prep-roster-list').style.display = mode === 'list' ? '' : 'none';
  document.getElementById('prep-roster-field').style.display = mode === 'field' ? '' : 'none';
  document.getElementById('btn-roster-list').style.background = mode === 'list' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-roster-list').style.color = mode === 'list' ? 'white' : 'var(--text)';
  document.getElementById('btn-roster-field').style.background = mode === 'field' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-roster-field').style.color = mode === 'field' ? 'white' : 'var(--text)';
  if (mode === 'field') renderFieldView();
}

function renderFieldView() {
  const picks = PREP.picks.filter(Boolean);
  const scores = calcPrepScores();
  const overall = picks.length > 0 ? Math.round(Object.values(scores).reduce((a,b)=>a+b,0) / ALL_CATS.length) : 0;

  // Assign picks to positions
  const assigned = { C:null, '1B':null, '2B':null, SS:null, '3B':null, LF:null, CF:null, RF:null, UT1:null, UT2:null };
  const sps = [], rps = [], bench = [];

  for (const p of picks) {
    if (!p) continue;
    const isPit = isPitcherProj(p);
    if (isPit && (p.SV||0) > 5 && rps.length < 2) { rps.push(p); continue; }
    if (isPit && sps.length < 5) { sps.push(p); continue; }

    const pos = (p.pos||'').toUpperCase();
    if (pos === 'C' && !assigned.C) { assigned.C = p; }
    else if (pos === '1B' && !assigned['1B']) { assigned['1B'] = p; }
    else if ((pos === '2B' || pos === '2B/SS') && !assigned['2B']) { assigned['2B'] = p; }
    else if ((pos === 'SS' || pos === '2B/SS') && !assigned.SS) { assigned.SS = p; }
    else if ((pos === '3B' || pos === '1B/3B') && !assigned['3B']) { assigned['3B'] = p; }
    else if (['LF','CF','RF','OF'].includes(pos)) {
      if (!assigned.LF) assigned.LF = p;
      else if (!assigned.CF) assigned.CF = p;
      else if (!assigned.RF) assigned.RF = p;
      else if (!assigned.UT1) assigned.UT1 = p;
      else if (!assigned.UT2) assigned.UT2 = p;
      else bench.push(p);
    }
    else if (!assigned.UT1) assigned.UT1 = p;
    else if (!assigned.UT2) assigned.UT2 = p;
    else bench.push(p);
  }

  function card(pos, player, x, y) {
    if (player) {
      const isPit = isPitcherProj(player);
      const stats = isPit
        ? `${player.K||0}K · ${(player.ERA||0).toFixed(2)}ERA`
        : `${player.HR||0}HR · ${player.SB||0}SB · .${Math.round((player.AVG||0)*1000)}`;
      const rd = picks.indexOf(player);
      return `<div class="fv-pos" style="left:${x};bottom:${y}">
        <div class="fv-card filled"><div class="fv-label">${pos}</div><div class="fv-name">${player.name?.split(' ').pop() || '?'}</div><div class="fv-stat">${stats}</div></div>
      </div>`;
    }
    return `<div class="fv-pos" style="left:${x};bottom:${y}"><div class="fv-card empty"><div class="fv-label">${pos}</div><div class="fv-name empty-n">Empty</div></div></div>`;
  }

  function bpSlot(label, player) {
    if (player) {
      const stat = (player.SV||0) > 5 ? `${player.SV}SV` : `${player.K||0}K`;
      return `<div class="fv-bp-slot"><span class="fv-bp-pos">${label}</span><span class="fv-bp-name">${player.name?.split(' ').pop()||'?'}</span><span style="margin-left:auto;font-size:7px;color:rgba(255,255,255,0.4)">${stat}</span></div>`;
    }
    return `<div class="fv-bp-slot"><span class="fv-bp-pos">${label}</span><span class="fv-bp-name empty">—</span></div>`;
  }

  const el = document.getElementById('prep-roster-field');
  el.innerHTML = `
    <div class="field-view">
      <div class="field-sky">
        <span class="field-sky-title">${picks.length}/23 Drafted</span>
        <span class="field-sky-score">Overall: ${overall}/100</span>
      </div>
      <div class="field-diamond">
        ${card('C', assigned.C, '50%', '8px')}
        ${card('1B', assigned['1B'], '72%', '90px')}
        ${card('2B', assigned['2B'], '62%', '145px')}
        ${card('SS', assigned.SS, '38%', '145px')}
        ${card('3B', assigned['3B'], '28%', '90px')}
        ${card('LF', assigned.LF, '16%', '195px')}
        ${card('CF', assigned.CF, '50%', '220px')}
        ${card('RF', assigned.RF, '84%', '195px')}
        ${card('UT', assigned.UT1, '12%', '50px')}
        ${card('UT', assigned.UT2, '88%', '50px')}

        <div class="fv-bullpen" style="left:4px;width:90px">
          <div class="fv-bp-title">Rotation</div>
          ${bpSlot('SP1', sps[0])}
          ${bpSlot('SP2', sps[1])}
          ${bpSlot('SP3', sps[2])}
          ${bpSlot('P', sps[3])}
          ${bpSlot('P', sps[4])}
        </div>
        <div class="fv-bullpen" style="right:4px;width:90px">
          <div class="fv-bp-title">Bullpen</div>
          ${bpSlot('RP1', rps[0])}
          ${bpSlot('RP2', rps[1])}
        </div>
      </div>
      <div class="fv-bench">
        <div class="fv-bench-title">Bench</div>
        ${[0,1,2,3,4,5].map(i => {
          const b = bench[i];
          return `<div class="fv-bench-slot">${b ? `<span style="font-weight:600">${b.name?.split(' ').pop()||'?'}</span>` : '<span class="empty">—</span>'}</div>`;
        }).join('')}
      </div>
      <div class="fv-cats">
        ${ALL_CATS.map(c => {
          const v = scores[c] || 0;
          const color = v >= 70 ? '#4ade80' : v >= 40 ? '#fbbf24' : '#ef4444';
          return `<div class="fv-cat"><span class="fv-cat-lbl">${c}</span><div class="fv-cat-bar"><div class="fv-cat-fill" style="width:${Math.min(v,100)}%;background:${color}"></div></div><span class="fv-cat-val" style="color:${color}">${Math.round(v)}</span></div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Board View ──
let prepViewMode = 'table';
function setPrepView(mode) {
  prepViewMode = mode;
  document.getElementById('prep-table-view').style.display = mode === 'table' ? '' : 'none';
  document.getElementById('prep-board-view').style.display = mode === 'board' ? '' : 'none';
  document.getElementById('btn-view-table').style.background = mode === 'table' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-view-table').style.color = mode === 'table' ? 'white' : 'var(--text)';
  document.getElementById('btn-view-board').style.background = mode === 'board' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-view-board').style.color = mode === 'board' ? 'white' : 'var(--text)';
  if (mode === 'board') renderBoardView();
}

let boardTab = 'position';

function renderBoardView(targetEl) {
  const el = targetEl || document.getElementById('prep-board-view');
  const allPlayers = getPrepPlayers();

  function isDrafted(name) { return PREP.draftedNames.has(name); }
  function tierClass(adp) {
    if (adp >= 900) return 'tier-unknown';
    if (adp <= 36) return 'tier-elite';
    if (adp <= 84) return 'tier-solid';
    if (adp <= 156) return 'tier-mid';
    return 'tier-late';
  }
  function playerTile(p) {
    const gone = isDrafted(p.name);
    const onWL = isOnWishlist(p.name);
    const isPit = isPitcherProj(p);
    const adp = p.espnADP < 900 ? p.espnADP : (p.adp || 999);
    const tier = tierClass(adp);
    const stats = isPit
      ? `${p.K||0}K · ${p.QS||0}QS · ${(p.ERA||0).toFixed(2)} ERA${(p.SV||0)>0?' · '+p.SV+'SV':' · '+(p.WHIP||0).toFixed(2)+' WH'}`
      : `${p.R||0}R · ${p.HR||0}HR · ${p.RBI||0}RBI · ${p.SB||0}SB · .${Math.round((p.AVG||0)*1000)}`;
    return `<div class="bp ${tier}${gone?' drafted':''}${onWL&&!gone?' wishlist':''}" onclick="${gone?'':`showWarRoom('${p.name.replace(/'/g,"\\'")}')`}">
      <div class="bp-name">${p.name}</div>
      <div class="bp-stats">${stats}</div>
      <div class="bp-adp">ADP ${adp < 900 ? adp : '?'} · AI #${p.aiRank||'?'}</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="board-tabs">
      <div class="board-tab${boardTab==='position'?' active':''}" onclick="boardTab='position';renderBoardView()">By Position</div>
      <div class="board-tab${boardTab==='category'?' active':''}" onclick="boardTab='category';renderBoardView()">By Category</div>
    </div>
    <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:6px;display:flex;gap:12px">
      <span><span style="display:inline-block;width:8px;height:8px;background:#fef2f2;border-left:3px solid #ef4444;margin-right:3px"></span>Elite (R1-3)</span>
      <span><span style="display:inline-block;width:8px;height:8px;background:#eff6ff;border-left:3px solid #3b82f6;margin-right:3px"></span>Solid (R4-7)</span>
      <span><span style="display:inline-block;width:8px;height:8px;background:#ecfdf5;border-left:3px solid #059669;margin-right:3px"></span>Mid (R8-13)</span>
      <span><span style="display:inline-block;width:8px;height:8px;background:#f9fafb;border-left:3px solid #9ca3af;margin-right:3px"></span>Late (R14+)</span>
      <span><span style="display:inline-block;width:8px;height:8px;background:#f3f4f6;border-left:3px dashed #d1d5db;margin-right:3px"></span>No ADP</span>
      <span><span style="display:inline-block;width:8px;height:8px;background:#fffef5;border-left:3px solid var(--yellow);margin-right:3px"></span>Wishlist</span>
    </div>
    ${boardTab === 'position' ? renderPositionBoard(allPlayers, isDrafted, playerTile) : renderCategoryBoard(allPlayers, isDrafted, playerTile)}
  `;
}

function renderPositionBoard(allPlayers, isDrafted, playerTile) {
  const POS_COLS = [
    { key: 'C', label: 'C', color: '#d97706', filter: p => (p.pos||'').toUpperCase() === 'C' },
    { key: '1B', label: '1B', color: '#2563eb', filter: p => (p.pos||'').toUpperCase() === '1B' },
    { key: '2B', label: '2B', color: '#059669', filter: p => ['2B','2B/SS'].includes((p.pos||'').toUpperCase()) },
    { key: 'SS', label: 'SS', color: '#7c3aed', filter: p => ['SS','2B/SS'].includes((p.pos||'').toUpperCase()) },
    { key: '3B', label: '3B', color: '#d00', filter: p => ['3B','1B/3B'].includes((p.pos||'').toUpperCase()) },
    { key: 'OF', label: 'OF', color: '#059669', filter: p => ['OF','LF','CF','RF'].includes((p.pos||'').toUpperCase()) },
    { key: 'SP', label: 'SP', color: '#2563eb', filter: p => isPitcherProj(p) && (p.SV||0) <= 5 },
    { key: 'RP', label: 'RP', color: '#d00', filter: p => isPitcherProj(p) && (p.SV||0) > 5 },
  ];

  return `<div class="board-cols" style="grid-template-columns:repeat(${POS_COLS.length}, 1fr);max-height:450px;overflow-y:auto">
    ${POS_COLS.map(col => {
      const players = allPlayers.filter(col.filter).sort((a,b) => (a.espnADP||999) - (b.espnADP||999));
      const avail = players.filter(p => !isDrafted(p.name)).length;
      return `<div class="board-col">
        <div class="board-col-header" style="color:${col.color};border-bottom-color:${col.color}">${col.label} <span class="board-col-count">${avail}</span></div>
        ${players.slice(0, 25).map(p => playerTile(p)).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function renderCategoryBoard(allPlayers, isDrafted, playerTile) {
  const hitters = allPlayers.filter(p => !isPitcherProj(p));
  const pitchers = allPlayers.filter(p => isPitcherProj(p));

  const CAT_COLS = [
    { label: 'SB Sources', color: '#059669',
      players: hitters.filter(p => (p.SB||0) >= 10).sort((a,b) => (b.SB||0) - (a.SB||0)) },
    { label: 'HR/RBI Power', color: '#7c3aed',
      players: hitters.filter(p => (p.HR||0) >= 20).sort((a,b) => (b.HR||0) + (b.RBI||0) - (a.HR||0) - (a.RBI||0)) },
    { label: 'AVG/OPS Contact', color: '#d97706',
      players: hitters.filter(p => (p.AVG||0) >= 0.260).sort((a,b) => (b.OPS||0) - (a.OPS||0)) },
    { label: 'Ace SPs', color: '#2563eb',
      players: pitchers.filter(p => (p.SV||0) <= 5 && (p.K||0) >= 80).sort((a,b) => (b.K||0) + (b.QS||0)*10 - (a.K||0) - (a.QS||0)*10) },
    { label: 'Save Sources', color: '#d00',
      players: pitchers.filter(p => (p.SV||0) >= 10).sort((a,b) => (b.SV||0) - (a.SV||0)) },
  ];

  return `<div class="board-cols" style="grid-template-columns:repeat(${CAT_COLS.length}, 1fr);max-height:450px;overflow-y:auto">
    ${CAT_COLS.map(col => {
      const avail = col.players.filter(p => !isDrafted(p.name)).length;
      return `<div class="board-col">
        <div class="board-col-header" style="color:${col.color};border-bottom-color:${col.color}">${col.label} <span class="board-col-count">${avail}</span></div>
        ${col.players.slice(0, 25).map(p => playerTile(p)).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

// Navigation
document.getElementById('btn-prev-round').addEventListener('click', () => {
  if (PREP.round > 1) { PREP.round--; renderPrepRound(); }
});
document.getElementById('btn-next-round').addEventListener('click', () => {
  if (PREP.round < NUM_ROUNDS_DRAFT) { PREP.round++; renderPrepRound(); }
});
document.getElementById('prep-search').addEventListener('input', () => {
  document.getElementById('prep-search-clear').style.display = document.getElementById('prep-search').value ? '' : 'none';
  renderPrepTable();
});
document.getElementById('prep-hide-drafted').addEventListener('change', () => renderPrepTable());
document.getElementById('btn-undo-pick').addEventListener('click', prepUndo);
document.getElementById('btn-clear-picks').addEventListener('click', prepClear);

// Generate projections
document.getElementById('btn-gen-proj').addEventListener('click', async () => {
  if (!confirm('Generate projections using Claude? This costs ~$0.27.')) return;
  toast('Generating projections... this takes ~30 seconds');
  document.getElementById('btn-gen-proj').disabled = true;

  let players = [];
  if (S.draftState?.available) {
    players = S.draftState.available.map(p => ({ name: p.name, position: p.position, proTeam: p.proTeam }));
  } else if (S.teamData?.freeAgents) {
    players = S.teamData.freeAgents.map(p => ({ name: p.name, position: p.position, proTeam: p.proTeam }));
  }
  if (players.length === 0) {
    toast('Connect to ESPN first to get player list');
    document.getElementById('btn-gen-proj').disabled = false;
    return;
  }

  const r = await api('draft/projections', { method: 'POST', body: { players } });
  document.getElementById('btn-gen-proj').disabled = false;
  if (r.success) {
    toast(`Projections generated for ${r.player_count} players`);
    await loadProjections();
    prepLoaded = true;
    renderPrepRound();
  } else toast('Error: ' + (r.error || 'Failed'));
});

/* ═══════════════════════════════════════════════════════
   DRAFT LIVE
   ═══════════════════════════════════════════════════════ */
async function refreshLive() {
  if (Object.keys(S.projections).length === 0) await loadProjections();
  renderFilterPills(document.getElementById('live-pos-filter'), S.liveFilter, pos => {
    S.liveFilter = pos; renderLiveTable();
  });
  renderRosterPanel();
  renderLiveCatBars({});
  // Default to board view and render it
  setLiveView('board');
  if (S.draftStarted && !S.draftPoll) startPolling();
}

document.getElementById('btn-start-draft').addEventListener('click', async () => {
  const leagueId = document.getElementById('input-league-id').value;
  const year = document.getElementById('input-year').value;
  const teamName = document.getElementById('input-team-name').value;
  toast('Initializing draft session...');
  const r = await api('draft/init', { method: 'POST', body: { leagueId, year: parseInt(year), teamName } });
  if (r.error) { toast('Error: ' + r.error); return; }
  S.draftStarted = true;
  toast('Draft session started — polling ESPN');
  document.getElementById('live-badge').style.display = '';
  document.getElementById('live-status-tag').textContent = 'LIVE';
  document.getElementById('live-status-tag').className = 'topbar-tag tag-red';
  document.getElementById('btn-start-draft').textContent = 'Polling...';
  document.getElementById('btn-start-draft').disabled = true;
  startPolling();
});

function startPolling() {
  if (S.draftPoll) clearInterval(S.draftPoll);
  pollDraft(); // immediate
  S.draftPoll = setInterval(pollDraft, 5000);
}

async function pollDraft() {
  const state = await api('draft/state');
  if (state.error) { console.warn('Poll error:', state.error); return; }
  S.draftState = state;

  // Detect new pick
  if (state.picksMade !== S.lastPickCount) {
    S.lastPickCount = state.picksMade;
    S.timerSec = 90;
    if (S.timerInterval) clearInterval(S.timerInterval);
    S.timerInterval = setInterval(() => {
      S.timerSec = Math.max(0, S.timerSec - 1);
      const m = Math.floor(S.timerSec / 60);
      const s = String(S.timerSec % 60).padStart(2, '0');
      document.getElementById('otc-timer').textContent = `${m}:${s}`;
      const ot = document.getElementById('overlay-timer');
      if (ot) ot.textContent = `${m}:${s}`;
    }, 1000);
  }

  renderOTCStrip(state);
  renderLiveTable();
  if (liveViewMode === 'board') renderLiveBoardView();
  renderRosterPanel(state.myPicks);
  if (state.isMyTurn && !S.overlayShown) triggerOnClock(state);
  if (!state.isMyTurn && S.overlayShown) closeOverlay();
}

function renderOTCStrip(state) {
  document.getElementById('otc-round').textContent = state.round || '—';
  const picks = state.upcoming || [];
  document.getElementById('otc-picks').innerHTML = picks.slice(0, 14).map(p => {
    let cls = 'otc-pick';
    if (p.isDone) cls += ' done';
    else if (p.isCurrent) cls += ' current';
    else if (p.isMine) cls += ' mine';
    const label = p.playerName || p.teamName || '—';
    return `<div class="${cls}"><div class="pick-num">${p.overallPick}</div><div class="pick-team">${truncate(label, 8)}</div></div>`;
  }).join('');
}

function renderLiveTable() {
  const state = S.draftState;
  if (!state) return;

  const available = state.available || [];
  const drafted = new Set((state.myPicks || []).map(p => p.playerName));
  const search = document.getElementById('live-search').value.toLowerCase();
  const hideDrafted = document.getElementById('live-hide-drafted').checked;

  let players = available.map(p => {
    const proj = projFor(p.name);
    const sgp = estimateSGP(proj);
    return { ...p, ...(proj || {}), name: p.name, sgp, isDrafted: false };
  });

  // Filter
  if (S.liveFilter !== 'ALL') players = players.filter(p => posMatch(p.position || p.pos, S.liveFilter));
  if (search) players = players.filter(p => p.name.toLowerCase().includes(search));

  // Sort
  const { col, dir } = S.liveSort;
  players.sort((a, b) => ((a[col] ?? 999) - (b[col] ?? 999)) * dir);

  const statCols = ['sgp','R','HR','SB','AVG','K','ERA'];

  document.getElementById('live-thead').innerHTML = `<tr>
    <th style="width:30px">#</th><th>Player</th><th>Pos</th>
    ${statCols.map(c => `<th class="r${S.liveSort.col===c?' sorted':''}" data-lsort="${c}">${c.toUpperCase()}</th>`).join('')}
  </tr>`;

  document.getElementById('live-tbody').innerHTML = players.slice(0, 100).map((p, i) => {
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    const pos = p.position || p.pos || '?';
    return `<tr>
      <td style="color:var(--text-tertiary)">${i + 1}</td>
      <td><div class="player-name-cell">
        <div class="player-avatar">${initials}</div>
        <div class="player-info"><div class="name">${p.name}</div><div class="meta">${p.proTeam || p.team || '?'}</div></div>
      </div></td>
      <td><span class="pos-badge ${pos.toLowerCase()}">${pos}</span></td>
      ${statCols.map(c => {
        let v = p[c]; if (v == null) return '<td class="r">—</td>';
        const fmt = ['AVG','ERA','WHIP','OPS'].includes(c) ? Number(v).toFixed(3) : ['sgp'].includes(c) ? Number(v).toFixed(1) : v;
        const hi = c === 'sgp' && v > 70 ? ' stat-hi' : '';
        return `<td class="r${hi}">${fmt}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  // Sort handlers
  document.querySelectorAll('#live-thead th[data-lsort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.lsort;
      if (S.liveSort.col === col) S.liveSort.dir *= -1;
      else { S.liveSort.col = col; S.liveSort.dir = ['ERA','WHIP','adp'].includes(col) ? 1 : -1; }
      renderLiveTable();
    });
  });
}

document.getElementById('live-search').addEventListener('input', () => renderLiveTable());
document.getElementById('live-hide-drafted').addEventListener('change', () => renderLiveTable());

// ── Live Board View ──
let liveViewMode = 'board'; // default to board for live draft
function setLiveView(mode) {
  liveViewMode = mode;
  document.getElementById('live-table-view').style.display = mode === 'table' ? '' : 'none';
  document.getElementById('live-board-view').style.display = mode === 'board' ? '' : 'none';
  document.getElementById('btn-live-table').style.background = mode === 'table' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-live-table').style.color = mode === 'table' ? 'white' : 'var(--text)';
  document.getElementById('btn-live-board').style.background = mode === 'board' ? 'var(--text)' : 'var(--bg)';
  document.getElementById('btn-live-board').style.color = mode === 'board' ? 'white' : 'var(--text)';
  if (mode === 'board') renderLiveBoardView();
}

function renderLiveBoardView() {
  // Sync drafted names from ESPN state
  const state = S.draftState;
  if (state?.available) {
    const allPlayers = getPrepPlayers();
    const availNames = new Set((state.available || []).map(p => p.name));
    // Mark players NOT in available list as drafted
    allPlayers.forEach(p => { if (!availNames.has(p.name) && !PREP.draftedNames.has(p.name)) PREP.draftedNames.add(p.name); });
  }
  renderBoardView(document.getElementById('live-board-view'));
  renderLiveWarnings(PREP.draftedNames);
}

function renderLiveWarnings(draftedNames) {
  const allPlayers = getPrepPlayers();
  const available = allPlayers.filter(p => !draftedNames.has(p.name));
  const state = S.draftState;
  const myPicks = state?.myPicks || [];

  // Calc scores from my picks
  const myRoster = myPicks.map(p => projFor(p.playerName) || {}).filter(p => p.R !== undefined || p.K !== undefined);
  const savedPicks = [...PREP.picks];
  PREP.picks = myRoster;
  const scores = calcPrepScores();
  PREP.picks = savedPicks;

  const warnings = [];

  // Scarcity alerts
  const sbLeft = available.filter(p => !isPitcherProj(p) && (p.SB||0) >= 20).length;
  const svLeft = available.filter(p => isPitcherProj(p) && (p.SV||0) >= 25).length;
  const aceLeft = available.filter(p => isPitcherProj(p) && (p.QS||0) >= 15).length;

  if (sbLeft <= 5 && sbLeft > 0) warnings.push({ type:'critical', text:`Only ${sbLeft} players with 20+ SB remain on the board` });
  if (sbLeft === 0) warnings.push({ type:'critical', text:'ALL elite SB sources are gone' });
  if (svLeft <= 3 && svLeft > 0 && !myRoster.some(p => (p.SV||0) > 5)) warnings.push({ type:'warn', text:`Only ${svLeft} elite closers left — grab one soon` });
  if (aceLeft <= 3 && aceLeft > 0 && !myRoster.some(p => (p.QS||0) >= 15)) warnings.push({ type:'warn', text:`Only ${aceLeft} ace SPs (15+ QS) remain` });

  // Wishlist alerts
  const wishAll = [...PREP.wishlist.batters, ...PREP.wishlist.pitchers];
  const nextPick = state ? (state.overallPick || 0) + 1 : 999;
  for (const w of wishAll) {
    if (draftedNames.has(w.name)) {
      warnings.push({ type:'info', text:`${w.name} was drafted — remove from wishlist` });
    }
  }

  // Category weakness
  if (myRoster.length >= 3) {
    const weakest = ALL_CATS.map(c => ({cat:c, score:scores[c]||0})).sort((a,b) => a.score - b.score)[0];
    if (weakest.score < 40 && weakest.score > 0) {
      warnings.push({ type:'info', text:`Your weakest category: ${weakest.cat} at ${weakest.score}/100` });
    }
  }

  const el = document.getElementById('live-warnings');
  if (warnings.length === 0) { el.innerHTML = ''; return; }

  const colors = { critical:'var(--espn-red)', warn:'var(--yellow)', info:'var(--blue)' };
  const bgs = { critical:'var(--red-bg)', warn:'var(--yellow-bg)', info:'var(--blue-bg)' };
  el.innerHTML = warnings.map(w =>
    `<div style="background:${bgs[w.type]};color:${colors[w.type]};padding:6px 12px;border-radius:4px;margin-bottom:4px;font-size:11px;font-weight:600;display:flex;gap:6px;align-items:center"><span>&#9888;</span>${w.text}</div>`
  ).join('');
}

function renderRosterPanel(picks) {
  const myPicks = picks || S.draftState?.myPicks || [];
  document.getElementById('roster-count').textContent = `${myPicks.length}/23`;

  let html = '';
  let pickIdx = 0;
  for (const slot of ROSTER_SLOTS) {
    if (slot.sec) html += `<div class="roster-section-label">${slot.sec}</div>`;
    const pick = myPicks[pickIdx];
    if (pick) {
      html += `<div class="roster-slot"><span class="slot-pos">${slot.pos}</span><span class="slot-player">${pick.playerName}</span><span class="slot-round">R${pick.roundNum}</span></div>`;
      pickIdx++;
    } else {
      html += `<div class="roster-slot"><span class="slot-pos">${slot.pos}</span><span class="slot-player empty">Empty</span></div>`;
    }
  }
  document.getElementById('roster-slots').innerHTML = html;
}

function renderLiveCatBars(scores) {
  const container = document.getElementById('live-cat-bars');
  container.innerHTML = ALL_CATS.map(c => {
    const v = scores?.[c] ?? 0;
    const color = v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--espn-red)';
    return `<div>
      <div class="cat-bar-label" style="font-size:10px">${c} <span class="score">${Math.round(v)}</span></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.min(v,100)}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   ON-CLOCK
   ═══════════════════════════════════════════════════════ */
async function triggerOnClock(state) {
  S.overlayShown = true;
  document.getElementById('overlay').style.display = 'flex';
  document.getElementById('overlay-subtitle').textContent =
    `Round ${state.round} · Pick ${state.overallPick}`;
  document.getElementById('overlay-recs').innerHTML = '<div class="empty-state"><span class="spinner"></span> War Room analyzing...</div>';
  document.getElementById('overlay-gaps').innerHTML = '';

  const r = await api('draft/on-clock', {
    method: 'POST',
    body: {
      currentPicks: state.myPicks?.map(p => ({ name: p.playerName })) || [],
      available: state.available || [],
      roundNum: state.round,
      slotsRemaining: 23 - (state.myPicks?.length || 0),
    }
  });

  if (r.error) {
    document.getElementById('overlay-recs').innerHTML = `<div class="empty-state">Engine error: ${r.error}</div>`;
    return;
  }

  S.engineData = r;
  renderLiveCatBars(r.rosterScore || {});

  // Top picks
  const tops = (r.topPicks || []).slice(0, 4);
  document.getElementById('overlay-recs').innerHTML = tops.map((p, i) => {
    const tags = [];
    if (p.health && p.health < 80) tags.push(`<span class="rec-tag critical">Health ${p.health}%</span>`);
    if (p.adp_value > 5) tags.push(`<span class="rec-tag good">Value +${p.adp_value}</span>`);
    return `<div class="rec-card${i === 0 ? ' top-pick' : ''}">
      <div class="rec-rank">${i === 0 ? '#1 PICK' : '#' + (i+1)}</div>
      <div class="rec-name">${p.name}</div>
      <div class="rec-meta">${p.proTeam || '?'} · ${p.position || '?'}</div>
      <div class="rec-sgp">${p.sgp}</div>
      <div style="font-size:10px;color:var(--text-secondary)">SGP Score</div>
      <div class="rec-tags">${tags.join('')}</div>
    </div>`;
  }).join('');

  // Gaps
  const gaps = r.gaps || [];
  document.getElementById('overlay-gaps').innerHTML = gaps.map(g => {
    const cls = g.urgency === 'NOW' || g.urgency === 'CRITICAL' ? 'critical'
      : g.urgency === 'LOCK' || g.urgency === 'LOCKED' ? 'locked'
      : g.urgency === 'SOON' ? 'soon' : 'ok';
    return `<div class="gap-chip ${cls}">${g.cat} — ${g.note || g.urgency}</div>`;
  }).join('');
}

function closeOverlay() {
  S.overlayShown = false;
  document.getElementById('overlay').style.display = 'none';
}
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('overlay')) closeOverlay();
});

/* ═══════════════════════════════════════════════════════
   MY TEAM
   ═══════════════════════════════════════════════════════ */
document.getElementById('btn-analyze').addEventListener('click', async () => {
  if (!S.teamData) { toast('Connect to ESPN first'); return; }
  toast('Running War Room analysis...');
  document.getElementById('btn-analyze').disabled = true;
  const r = await api('analyze', { method: 'POST', body: { teamData: S.teamData } });
  document.getElementById('btn-analyze').disabled = false;
  if (r.error) { toast('Error: ' + r.error); return; }
  toast('Analysis complete');
  renderTeamAnalysis(r.decisions);
});

function renderTeamAnalysis(decisions) {
  if (!decisions) return;
  const el = document.getElementById('team-content');
  let html = '';

  if (decisions.summary) {
    html += `<div class="card"><div class="card-title">Summary</div><p style="margin-top:8px;font-size:13px;color:var(--text-secondary)">${decisions.summary}</p></div>`;
  }
  if (decisions.start?.length) {
    html += `<div class="card"><div class="card-title" style="color:var(--green)">Start</div>${decisions.start.map(p =>
      `<div class="settings-row"><div class="settings-label" style="font-weight:600">${p.player}</div><div class="settings-value">${p.reason}</div></div>`
    ).join('')}</div>`;
  }
  if (decisions.sit?.length) {
    html += `<div class="card"><div class="card-title" style="color:var(--espn-red)">Sit</div>${decisions.sit.map(p =>
      `<div class="settings-row"><div class="settings-label" style="font-weight:600">${p.player}</div><div class="settings-value">${p.reason}</div></div>`
    ).join('')}</div>`;
  }
  if (decisions.pickup?.length) {
    html += `<div class="card"><div class="card-title" style="color:var(--blue)">Pickup</div>${decisions.pickup.map(p =>
      `<div class="settings-row"><div class="settings-label" style="font-weight:600">${p.player} (${p.position})</div><div class="settings-value">${p.reason}${p.drop ? ' — Drop: '+p.drop : ''}</div></div>`
    ).join('')}</div>`;
  }

  el.innerHTML = html || '<div class="empty-state">No analysis available</div>';
}

// Load cached analysis on tab visit
document.querySelectorAll('#team-tabs .tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('#team-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
  });
});

/* ═══════════════════════════════════════════════════════
   INTEL
   ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   WAR ROOM DAILY BRIEF
   ═══════════════════════════════════════════════════════ */
let wrData = null;

async function refreshWarRoom() {
  const el = document.getElementById('warroom-content');
  if (!wrData) {
    try {
      const resp = await fetch('/warroom_intel_2026.json');
      wrData = await resp.json();
    } catch(e) { wrData = { experts: { scout: {} } }; }
  }
  const sc = wrData.experts?.scout || {};
  const ts = wrData.generated || new Date().toISOString();
  const tsDisplay = new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  document.getElementById('wr-tag').textContent = `Updated ${tsDisplay}`;

  function renderItem(p, actionTag) {
    const cats = p.cats ? `<span style="font-size:9px;color:var(--green);font-weight:600">Helps: ${p.cats}</span>` : '';
    const risk = p.risk ? `<span style="font-size:9px;color:var(--espn-red)">Risk: ${p.risk}</span>` : '';
    return `<div class="wr-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><span class="wr-action ${actionTag}">${actionTag.toUpperCase()}</span><span class="wr-player">${p.name}</span></div>
        <span style="font-size:10px;color:var(--text-tertiary)">${p.pos||''} · ${p.team||''} · ADP ${p.adp||'?'}</span>
      </div>
      <div class="wr-metric">${p.take || p.signal || ''}</div>
      <div style="display:flex;gap:8px;margin-top:2px">${cats}${risk}</div>
      <div class="wr-why">Source: ${p.source || 'War Room Analysis'}</div>
    </div>`;
  }

  function renderCloser(c) {
    const vol = c.volatility === 'high' ? 'volatile' : c.volatility === 'low' ? 'safe' : 'watch';
    return `<div class="wr-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><span class="wr-action ${vol}">${c.volatility.toUpperCase()}</span><strong>${c.team}</strong>: ${c.closer}</div>
        <span style="font-size:10px;color:var(--text-tertiary)">Backup: ${c.backup}</span>
      </div>
      <div class="wr-metric">${c.status}</div>
    </div>`;
  }

  el.innerHTML = `
    <!-- Top Banner -->
    <div style="background:linear-gradient(135deg,#1a1a1a,#2d1f1f);color:white;border-radius:8px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.5px">War Room Daily Brief</div>
        <div style="font-size:11px;opacity:0.7;margin-top:2px">5 experts · ${(sc.buy_low_hitters||[]).length + (sc.sell_high_avoid||[]).length + (sc.buy_low_pitchers||[]).length + (sc.sprint_speed_sb||[]).length + (sc.injury_flags||[]).length + (sc.spring_training||[]).length} signals · ${(sc.closer_situations||[]).length} closer maps</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;opacity:0.5">Generated</div>
        <div style="font-size:13px;font-weight:600">${tsDisplay}</div>
        <div style="font-size:9px;opacity:0.5">${(wrData.sources||[]).join(' · ')}</div>
      </div>
    </div>

    <!-- Row 1: Scout + Contrarian -->
    <div class="wr-grid" style="margin-bottom:12px">
      <!-- THE SCOUT: Buy Low Hitters -->
      <div class="wr-card">
        <div class="wr-header" style="background:var(--green-bg)">
          <div class="wr-expert"><span class="wr-icon">🎯</span><div><div class="wr-name" style="color:var(--green)">THE SCOUT — Buy Low Hitters</div><div class="wr-source">Barrel Rate · xwOBA Delta · Bat Speed · Baseball Savant</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.buy_low_hitters||[]).map(p => renderItem(p, 'buy')).join('')}
        </div>
      </div>

      <!-- THE CONTRARIAN: Sell High / Avoid -->
      <div class="wr-card">
        <div class="wr-header" style="background:var(--red-bg)">
          <div class="wr-expert"><span class="wr-icon">⚠️</span><div><div class="wr-name" style="color:var(--espn-red)">THE CONTRARIAN — Sell High / Avoid</div><div class="wr-source">SIERA · xERA · BABIP · FanGraphs + Savant</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.sell_high_avoid||[]).map(p => renderItem(p, 'avoid')).join('')}
        </div>
      </div>
    </div>

    <!-- Row 2: Buy Low Pitchers + Sprint Speed -->
    <div class="wr-grid" style="margin-bottom:12px">
      <!-- THE SCOUT: Buy Low Pitchers -->
      <div class="wr-card">
        <div class="wr-header" style="background:var(--blue-bg)">
          <div class="wr-expert"><span class="wr-icon">🔬</span><div><div class="wr-name" style="color:var(--blue)">THE SCOUT — Buy Low Pitchers</div><div class="wr-source">Stuff+ · K-BB% · xERA · FanGraphs + Savant</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.buy_low_pitchers||[]).map(p => renderItem(p, 'buy')).join('')}
        </div>
      </div>

      <!-- SPEED SCOUT: SB Targets -->
      <div class="wr-card">
        <div class="wr-header" style="background:#ecfdf5">
          <div class="wr-expert"><span class="wr-icon">💨</span><div><div class="wr-name" style="color:var(--green)">THE SPEED SCOUT — SB Targets</div><div class="wr-source">Sprint Speed · SB Rate · Baseball Savant Sprint Speed</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.sprint_speed_sb||[]).map(p => renderItem(p, 'add')).join('')}
        </div>
      </div>
    </div>

    <!-- Row 3: Spring Training + Injury Flags -->
    <div class="wr-grid" style="margin-bottom:12px">
      <!-- THE SCOUT: Spring Training -->
      <div class="wr-card">
        <div class="wr-header" style="background:var(--yellow-bg)">
          <div class="wr-expert"><span class="wr-icon">🌱</span><div><div class="wr-name" style="color:var(--yellow)">THE SCOUT — Spring Training Intel</div><div class="wr-source">Velocity · Exit Velo · New Pitches · MLB.com + Baseball America</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.spring_training||[]).map(p => {
            const isWarn = (p.signal||'').includes('WARNING') || (p.name||'').includes('Estevez');
            return renderItem(p, isWarn ? 'avoid' : 'watch');
          }).join('')}
        </div>
      </div>

      <!-- THE HISTORIAN: Injury Flags -->
      <div class="wr-card">
        <div class="wr-header" style="background:var(--red-bg)">
          <div class="wr-expert"><span class="wr-icon">🏥</span><div><div class="wr-name" style="color:var(--espn-red)">THE HISTORIAN — Injury & Workload Flags</div><div class="wr-source">ESPN Injury DB · Transaction Log · Workload Tracking</div></div></div>
          <span class="wr-timestamp">${tsDisplay}</span>
        </div>
        <div class="wr-body">
          ${(sc.injury_flags||[]).map(p => `<div class="wr-item">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><span class="wr-action ${p.action?.includes('NOT') ? 'danger' : p.action?.includes('stash') || p.action?.includes('IL') ? 'stash' : 'avoid'}">${(p.action||'RISK').split('—')[0].trim()}</span><span class="wr-player">${p.name}</span></div>
              <span style="font-size:10px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span>
            </div>
            <div class="wr-metric">${p.injury} — ${p.timeline}</div>
            <div class="wr-why">${p.action} · Source: ${p.source}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Row 4: Closer Map (full width) -->
    <div class="wr-card" style="margin-bottom:12px">
      <div class="wr-header" style="background:#1a1a1a">
        <div class="wr-expert"><span class="wr-icon">🔒</span><div><div class="wr-name" style="color:white">THE CLOSER SPECIALIST — 2026 Saves Map</div><div class="wr-source" style="color:rgba(255,255,255,0.5)">ESPN Depth Charts · CloserMonkey · FanGraphs · CBS Sports</div></div></div>
        <span class="wr-timestamp" style="color:rgba(255,255,255,0.5)">${tsDisplay}</span>
      </div>
      <div class="wr-body" style="max-height:300px">
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px;padding:0 2px">
          <span class="wr-action safe">SAFE</span> = locked in closer &nbsp;
          <span class="wr-action volatile">VOLATILE</span> = committee or uncertain &nbsp;
          <span class="wr-action danger">DANGER</span> = closer at risk &nbsp;
          With 7 transactions/matchup, volatile bullpens are YOUR advantage — stream the hot closer each week.
        </div>
        ${(sc.closer_situations||[]).map(c => renderCloser(c)).join('')}
      </div>
    </div>

    <!-- Row 5: Quant Insights (full width) -->
    <div class="wr-card">
      <div class="wr-header" style="background:var(--bg)">
        <div class="wr-expert"><span class="wr-icon">📊</span><div><div class="wr-name">THE QUANT — Your Draft Edge</div><div class="wr-source">Draft Engine SGP · Positional Scarcity · Category Math</div></div></div>
        <span class="wr-timestamp">${tsDisplay}</span>
      </div>
      <div class="wr-body" style="max-height:none">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="background:var(--red-bg);padding:10px;border-radius:6px">
            <div style="font-size:11px;font-weight:700;color:var(--espn-red);margin-bottom:4px">SCARCEST: 2B</div>
            <div style="font-size:10px;color:var(--text-secondary)">Only 25 second basemen in top 300. After Marte & Chisholm, the drop-off is severe. Secure a top-200 2B or stream all year.</div>
          </div>
          <div style="background:var(--green-bg);padding:10px;border-radius:6px">
            <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px">DEEPEST: SS & OF</div>
            <div style="font-size:10px;color:var(--text-secondary)">SS has elite depth through round 3. OF pool is massive. You can punt both positions early and still find starters.</div>
          </div>
          <div style="background:var(--blue-bg);padding:10px;border-radius:6px">
            <div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:4px">YOUR EDGE: 7 TRANSACTIONS</div>
            <div style="font-size:10px;color:var(--text-secondary)">7 moves/matchup = streaming superpower. Don't overpay for closers or SPs. Draft 3 aces + stream the rest. Target volatile bullpens for free saves.</div>
          </div>
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div style="background:var(--bg);padding:8px;border-radius:4px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--espn-red)">SB</div>
            <div style="font-size:9px;color:var(--text-tertiary)">Scarcest cat in H2H. Must address R1-3. Once top speed is gone, it's gone forever.</div>
          </div>
          <div style="background:var(--bg);padding:8px;border-radius:4px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--blue)">QS</div>
            <div style="font-size:9px;color:var(--text-tertiary)">Rewards workhorses who pitch deep. Target 180+ IP arms with 14+ QS projection.</div>
          </div>
          <div style="background:var(--bg);padding:8px;border-radius:4px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--green)">OPS</div>
            <div style="font-size:9px;color:var(--text-tertiary)">Rewards OBP + power. Walks count. Patient sluggers > pure contact guys.</div>
          </div>
          <div style="background:var(--bg);padding:8px;border-radius:4px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--yellow)">SV</div>
            <div style="font-size:9px;color:var(--text-tertiary)">Stream with 7 transactions. 1 elite closer + volatile situations = SV covered.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   INTEL
   ═══════════════════════════════════════════════════════ */
let intelTab = 'statcast';
let intelCache = {};

async function refreshIntel() {
  document.getElementById('intel-tag').textContent = 'Loading...';
  renderIntelTab();
}

document.querySelectorAll('#intel-tabs .tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('#intel-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    intelTab = t.dataset.tab;
    renderIntelTab();
  });
});

async function renderIntelTab() {
  const el = document.getElementById('intel-content');
  el.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading...</div>';

  if (intelTab === 'statcast') {
    renderStatcastTab(el);
  } else if (intelTab === 'prospects') {
    renderProspectsTab(el);
  } else if (intelTab === 'hotwire') {
    renderHotWireTab(el);
  } else if (intelTab === 'twostarters') {
    if (!intelCache.twostarters) intelCache.twostarters = await api('two-starters');
    const pitchers = intelCache.twostarters?.pitchers || [];
    el.innerHTML = `<div class="card"><div class="card-title">Two-Start Pitchers This Week</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Highest single-week ROI in fantasy — a two-start pitcher gets double the K, QS, W exposure.</div>
      ${pitchers.length === 0 ? '<div class="empty-state">Season hasn\'t started — check back during the regular season.</div>' : pitchers.map(p =>
        `<div class="intel-item"><div><strong>${p.name}</strong> <span style="color:var(--text-secondary);font-size:11px">${p.team}</span></div>
        <div style="font-size:11px">${(p.starts||[]).join(', ')}</div></div>`
      ).join('')}
    </div>`;
  }
  document.getElementById('intel-tag').textContent = 'Updated just now';
  document.getElementById('intel-tag').className = 'topbar-tag tag-green';
}

// ── STATCAST TAB ──
async function renderStatcastTab(el) {
  // Try to load from API first
  if (!intelCache.statcast) intelCache.statcast = await api('statcast?year=2025');
  const data = intelCache.statcast;
  const signals = data?.signals || {};
  const hasData = (signals.regression_risks?.length > 0 && signals.regression_risks[0]?.name) ||
                  (signals.breakout_candidates?.length > 0 && signals.breakout_candidates[0]?.name);

  // Pre-season statcast intel based on 2025 final data + spring training
  const BUY_LOW_HITTERS = [
    { name: 'Andres Gimenez', team: 'CLE', pos: '2B', signal: '.210 BA vs .252 xBA — career .253 hitter with 30-steal upside', tag: 'buy', cats: 'SB, AVG' },
    { name: 'Salvador Perez', team: 'KC', pos: 'C', signal: '.525 SLG vs .608 xSLG — largest gap in baseball, power surge incoming', tag: 'buy', cats: 'HR, RBI' },
    { name: 'Ben Rice', team: 'NYY', pos: '1B', signal: '.499 SLG vs .557 xSLG — 8th biggest gap, breakout power candidate', tag: 'buy', cats: 'HR, RBI' },
    { name: 'Luis Robert Jr.', team: 'NYM', pos: 'CF', signal: 'New ballpark + 33 SB last year + age 28 peak. xwOBA suggests more power coming.', tag: 'buy', cats: 'SB, HR' },
    { name: 'Spencer Torkelson', team: 'DET', pos: '1B', signal: 'Exit velocity in top 15% — results haven\'t matched contact quality yet', tag: 'buy', cats: 'HR, RBI' },
  ];
  const SELL_HIGH = [
    { name: 'Andrew Abbott', team: 'CIN', pos: 'SP', signal: '2.87 ERA vs 4.31 SIERA — largest gap in MLB. 21% K rate, lowest GB rate in league at 31%.', tag: 'sell', cats: 'ERA risk' },
    { name: 'Harrison Bader', team: '?', pos: 'CF', signal: '.277 BA vs .220 xBA with 27.1% K rate — massive regression coming', tag: 'sell', cats: 'AVG risk' },
    { name: 'Trevor Rogers', team: 'BAL', pos: 'SP', signal: '.226 BABIP and 84% LOB% — both due for major correction', tag: 'sell', cats: 'ERA, WHIP' },
    { name: 'Gavin Williams', team: 'CLE', pos: 'SP', signal: '3.06 ERA but 4.30 xERA and 4.39 FIP — surface stats deceiving', tag: 'sell', cats: 'ERA risk' },
  ];
  const BUY_LOW_PITCHERS = [
    { name: 'Dylan Cease', team: 'TOR', pos: 'SP', signal: '4.55 ERA vs 3.46 xERA — full run better than his results. Elite K rate.', tag: 'buy', cats: 'K, ERA' },
    { name: 'Spencer Strider', team: 'ATL', pos: 'SP', signal: 'Returning from injury at discount ADP. Pre-injury stuff was elite. High risk/reward.', tag: 'buy', cats: 'K, QS' },
    { name: 'Tyler Glasnow', team: 'LAD', pos: 'SP', signal: 'ADP 120+ due to injury history — when healthy he\'s a top-20 SP. Late-round steal.', tag: 'buy', cats: 'K, ERA' },
  ];
  const SPRING_WATCH = [
    { name: 'Roki Sasaki', team: 'LAD', pos: 'SP', signal: 'First MLB season — watch spring velocity (expected 98-100mph). Could be ace if healthy.', tag: 'watch', cats: 'K, ERA' },
    { name: 'Chase Burns', team: 'CIN', pos: 'SP', signal: 'Top prospect arm — monitor spring for rotation spot confirmation and K rate.', tag: 'watch', cats: 'K, QS' },
    { name: 'Andrew Painter', team: 'PHI', pos: 'SP', signal: 'Penciled as 5th starter — elite arm delayed by injuries. High K upside if healthy.', tag: 'watch', cats: 'K, ERA' },
  ];

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;background:var(--bg);padding:12px;border-radius:6px">
      <strong>How to use Statcast:</strong> Expected stats (xBA, xERA, xSLG) strip away luck — they measure the QUALITY of contact, not the results. When actual stats are way better than expected, regression is coming. When expected stats are better than actual, the player is unlucky and due for a breakout. This is your edge in trades and waiver pickups.
    </div>

    <div class="intel-grid">
      <div class="intel-card">
        <div class="card-title" style="color:var(--green)">BUY LOW — Hitters</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px">xBA/xSLG exceeds actual — unlucky, due for breakout</div>
        ${BUY_LOW_HITTERS.map(p => `
          <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;width:100%;justify-content:space-between;align-items:center">
              <strong>${p.name}</strong>
              <div><span class="signal-tag buy">BUY</span> <span style="font-size:9px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-secondary)">${p.signal}</div>
            <div style="font-size:9px;color:var(--green);font-weight:600">Helps: ${p.cats}</div>
          </div>
        `).join('')}
      </div>

      <div class="intel-card">
        <div class="card-title" style="color:var(--espn-red)">SELL HIGH / AVOID</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px">Actual stats way above expected — regression incoming</div>
        ${SELL_HIGH.map(p => `
          <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;width:100%;justify-content:space-between;align-items:center">
              <strong>${p.name}</strong>
              <div><span class="signal-tag sell">SELL</span> <span style="font-size:9px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-secondary)">${p.signal}</div>
            <div style="font-size:9px;color:var(--espn-red);font-weight:600">Risk: ${p.cats}</div>
          </div>
        `).join('')}
      </div>

      <div class="intel-card">
        <div class="card-title" style="color:var(--blue)">BUY LOW — Pitchers</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px">xERA better than actual ERA — unlucky or injured at discount</div>
        ${BUY_LOW_PITCHERS.map(p => `
          <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;width:100%;justify-content:space-between;align-items:center">
              <strong>${p.name}</strong>
              <div><span class="signal-tag buy">BUY</span> <span style="font-size:9px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-secondary)">${p.signal}</div>
            <div style="font-size:9px;color:var(--blue);font-weight:600">Helps: ${p.cats}</div>
          </div>
        `).join('')}
      </div>

      <div class="intel-card">
        <div class="card-title" style="color:var(--yellow)">SPRING TRAINING WATCH</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px">Monitor velocity, rotation spots, and new pitch usage</div>
        ${SPRING_WATCH.map(p => `
          <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div style="display:flex;width:100%;justify-content:space-between;align-items:center">
              <strong>${p.name}</strong>
              <div><span class="signal-tag watch">WATCH</span> <span style="font-size:9px;color:var(--text-tertiary)">${p.pos} · ${p.team}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-secondary)">${p.signal}</div>
            <div style="font-size:9px;color:var(--yellow);font-weight:600">Upside: ${p.cats}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="font-size:10px;color:var(--text-tertiary);margin-top:12px">
      Source: Baseball Savant xStats, FanGraphs SIERA, Yahoo Regression Analysis · Once the 2026 season starts, this page will pull live Statcast data.
    </div>
  `;
}

// ── PROSPECT WATCH TAB ──
function renderProspectsTab(el) {
  const PROSPECTS = [
    { name: 'Konnor Griffin', team: 'PIT', pos: 'SS/OF', eta: 'Opening Day (TBD)', risk: 'Service time delay possible',
      signal: '#1 overall prospect. True 5-tool player — could slot top of lineup. If Pittsburgh promotes him, he\'s an instant top-50 fantasy asset.',
      cats: 'R, HR, SB, AVG', tag: 'add', adp: '92' },
    { name: 'Kevin McGonigle', team: 'DET', pos: 'SS', eta: 'Opening Day or mid-season', risk: 'Moderate — depends on spring',
      signal: '#2 on Top 100. Most MLB-ready prospect in minors. ROY candidate. Could be a 5-category SS from day one.',
      cats: 'R, HR, SB, AVG', tag: 'add', adp: '209' },
    { name: 'Jac Caglianone', team: 'KC', pos: '1B/DH', eta: 'Opening Day (expected)', risk: 'Low — has roster spot',
      signal: 'Expected everyday player from day one. Immediate power bat in KC lineup. Two-way potential adds intrigue.',
      cats: 'HR, RBI', tag: 'add', adp: '212' },
    { name: 'Andrew Painter', team: 'PHI', pos: 'SP', eta: 'Opening Day (5th starter)', risk: 'Injury history',
      signal: 'Penciled into rotation. Elite arm delayed by injuries. When healthy, top-25 SP ceiling with high K rate.',
      cats: 'K, QS, ERA', tag: 'add', adp: '?' },
    { name: 'Colt Emerson', team: 'SEA', pos: 'SS', eta: 'Mid-season', risk: 'Service time delay likely',
      signal: 'Turns 21 during season. 2023 1st-rounder. One of the best minor league hitters in 2025. Watch for June call-up.',
      cats: 'R, AVG, SB', tag: 'watch', adp: '?' },
    { name: 'Roman Anthony', team: 'BOS', pos: 'OF', eta: 'Opening Day', risk: 'Low — expected to start',
      signal: 'Top-5 prospect. Elite bat speed, advanced approach. Should be in Boston lineup from day one. 20 HR/15 SB upside.',
      cats: 'R, HR, SB, AVG', tag: 'add', adp: '62' },
    { name: 'Jackson Holliday', team: 'BAL', pos: '2B', eta: 'Opening Day', risk: 'Low — starting 2B',
      signal: 'After a rough 2025 debut, he retooled his approach. Spring reports positive. High-ceiling bat at a thin position.',
      cats: 'R, SB, AVG', tag: 'watch', adp: '110' },
  ];

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;background:var(--bg);padding:12px;border-radius:6px">
      <strong>Service time key date: April 14, 2026.</strong> After this date, teams have no incentive to delay call-ups. If a prospect isn't up by Opening Day, watch for mid-April promotions. Set your waiver claims BEFORE the call-up happens.
    </div>

    ${PROSPECTS.map(p => `
      <div class="card" style="margin-bottom:10px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div>
            <div style="font-size:14px;font-weight:700">${p.name} <span class="pos-badge ${p.pos.split('/')[0].toLowerCase()}" style="font-size:9px">${p.pos}</span></div>
            <div style="font-size:11px;color:var(--text-secondary)">${p.team} · ESPN ADP: ${p.adp}</div>
          </div>
          <div style="text-align:right">
            <span class="signal-tag ${p.tag}">${p.tag.toUpperCase()}</span>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">ETA: ${p.eta}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">${p.signal}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:10px;color:var(--green);font-weight:600">Helps: ${p.cats}</span>
          <span style="font-size:10px;color:${p.risk.startsWith('Low') ? 'var(--green)' : p.risk.startsWith('High') ? 'var(--espn-red)' : 'var(--yellow)'}">${p.risk}</span>
        </div>
      </div>
    `).join('')}
  `;
}

// ── HOT WIRE TAB ──
async function renderHotWireTab(el) {
  if (!intelCache.farm) intelCache.farm = await api('farm');
  const txns = intelCache.farm?.transactions || [];

  // Categorize transactions
  const callups = txns.filter(t => (t.description||'').toLowerCase().includes('recalled') || (t.description||'').toLowerCase().includes('selected'));
  const ilMoves = txns.filter(t => (t.description||'').toLowerCase().includes('injured') || (t.description||'').toLowerCase().includes('disabled'));
  const trades = txns.filter(t => (t.description||'').toLowerCase().includes('traded'));
  const other = txns.filter(t => !callups.includes(t) && !ilMoves.includes(t) && !trades.includes(t));

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;background:var(--bg);padding:12px;border-radius:6px">
      <strong>What to watch for:</strong> Closer changes (someone loses their job = someone else gains SV), call-ups (free adds before others notice), and IL stints (their handcuff becomes a starter). Check this daily during the season.
    </div>

    <div class="intel-grid">
      <div class="intel-card">
        <div class="card-title" style="color:var(--green)">CALL-UPS & PROMOTIONS</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px">Possible waiver adds — grab them before your league notices</div>
        ${callups.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No call-ups in the last 3 days. Check back during the season.</div>' :
          callups.slice(0, 10).map(t => `
            <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
              <div style="display:flex;width:100%;justify-content:space-between"><strong>${t.player || '?'}</strong><span class="signal-tag add">ADD?</span></div>
              <div style="font-size:11px;color:var(--text-secondary)">${(t.description||'').slice(0,100)}</div>
            </div>
          `).join('')}
      </div>

      <div class="intel-card">
        <div class="card-title" style="color:var(--espn-red)">INJURIES & IL</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px">Their loss = someone else's opportunity. Who fills the role?</div>
        ${ilMoves.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No recent IL moves.</div>' :
          ilMoves.slice(0, 10).map(t => `
            <div class="intel-item" style="flex-direction:column;align-items:flex-start;gap:2px">
              <div style="display:flex;width:100%;justify-content:space-between"><strong>${t.player || '?'}</strong><span class="signal-tag sell">IL</span></div>
              <div style="font-size:11px;color:var(--text-secondary)">${(t.description||'').slice(0,100)}</div>
            </div>
          `).join('')}
      </div>

      <div class="intel-card" style="grid-column:span 2">
        <div class="card-title">ALL RECENT MOVES (3 days)</div>
        ${txns.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No transactions. Season may not have started yet.</div>' :
          txns.slice(0, 20).map(t => `
            <div class="intel-item">
              <div><strong>${t.player || '?'}</strong></div>
              <div style="font-size:11px;color:var(--text-secondary);text-align:right;max-width:400px">${(t.description||'').slice(0,90)}</div>
            </div>
          `).join('')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function posMatch(pos, filter) {
  if (!pos) return false;
  const p = pos.toUpperCase();
  if (filter === 'OF') return ['OF','LF','CF','RF','LF/CF','CF/RF','LF/RF'].includes(p) || p.includes('OF');
  if (filter === 'SP') return p === 'SP';
  if (filter === 'RP') return p === 'RP';
  return p === filter || p.includes(filter);
}

function estimateSGP(proj) {
  if (!proj) return 0;
  const isPit = isPitcherProj(proj);
  let score = 0;

  if (!isPit) {
    // Hitter SGP — calibrated so elite 5-cat hitter scores ~75-85
    score += (proj.R || 0) / 11;       // 95R → 8.6
    score += (proj.HR || 0) / 2.8;     // 28HR → 10
    score += (proj.RBI || 0) / 10;     // 90RBI → 9
    score += (proj.SB || 0) / 2;       // 20SB → 10
    score += Math.max(0, ((proj.AVG || 0) - 0.240) * 400);  // .272 → 12.8
    score += Math.max(0, ((proj.OPS || 0) - 0.700) * 180);  // .835 → 24.3
  } else {
    // Pitcher SGP — calibrated so ace SP scores ~60-70, same ballpark as good (not elite) hitter
    // Pitchers are less valuable pick-for-pick because you roster fewer of them
    score += (proj.K || 0) / 14;       // 200K → 14.3
    score += (proj.QS || 0) * 1.2;     // 18QS → 21.6
    score += (proj.W || 0) * 0.8;      // 13W → 10.4
    score += (proj.SV || 0) * 0.7;     // 30SV → 21 (closers valued but not over hitters)
    if (proj.ERA && proj.ERA > 0) score += Math.max(0, (4.20 - proj.ERA) * 8);    // 3.00 → 9.6
    if (proj.WHIP && proj.WHIP > 0) score += Math.max(0, (1.35 - proj.WHIP) * 30); // 1.10 → 7.5
  }
  return Math.min(99, Math.max(0, score));
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
refreshHub();
</script>

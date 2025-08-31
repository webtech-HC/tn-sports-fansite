/* =======================
   TN Football Time — App
   ======================= */
const C = window.APP_CONFIG;
const $ = (sel) => document.querySelector(sel);
const state = {
  source: 'cfbd', // 'cfbd' | 'espn'
  game: null,
  pollHandle: null
};

function setLastRefresh() {
  const now = new Date();
  $('#lastRefresh').dateTime = now.toISOString();
  $('#lastRefresh').textContent = `Updated ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`;
}

// --- Accessibility toggle
$('#a11yToggle')?.addEventListener('click', (e) => {
  const on = document.documentElement.getAttribute('data-a11y') === 'on';
  document.documentElement.setAttribute('data-a11y', on ? 'off' : 'on');
  e.currentTarget.setAttribute('aria-pressed', String(!on));
});

// --- Source toggle
document.querySelectorAll('input[name="source"]').forEach(r => {
  r.addEventListener('change', (e) => {
    state.source = e.target.value;
    refreshAll();
  });
});

// --- Manual refresh
$('#refreshBtn')?.addEventListener('click', () => refreshAll());

// ===================================
// Data providers (CFBD + ESPN + WX)
// ===================================

// CFBD helper: fetch through proxy if configured
async function cfbdFetch(path, params = {}) {
  const url = new URL(`https://api.collegefootballdata.com${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const headers = {};
  let endpoint = url.toString();

  if (C.CFBD_PROXY_URL) {
    endpoint = C.CFBD_PROXY_URL + path + '?' + url.searchParams.toString();
  } else {
    headers['Authorization'] = `Bearer ${C.CFBD_API_KEY || ''}`;
  }

  const res = await fetch(endpoint, { headers });
  if (!res.ok) throw new Error(`CFBD ${res.status}`);
  return res.json();
}

// ESPN scoreboard (no key). dates=YYYYMMDD (single or range)
async function espnScoreboard(dateStr) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${dateStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

// ---- GAME + SCORE LOGIC ----
function formatYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}

async function getCurrentOrNextGame() {
  const year = new Date().getFullYear();
  if (state.source === 'espn') {
    const sb = await espnScoreboard(formatYYYYMMDD(new Date()));
    const events = sb.events || [];
    const tn = events.find(e =>
      (e?.name || '').toLowerCase().includes('tennessee') ||
      (e?.competitions?.[0]?.competitors || []).some(c => (c?.team?.location||'').toLowerCase()==='tennessee')
    );
    if (!tn) return null;
    return mapEspnEventToGame(tn);
  } else {
    // CFBD: grab all games this season for Tennessee, pick active or next
    const games = await cfbdFetch('/games', { year, team: C.TEAM_NAME, seasonType: 'regular' });
    const now = new Date();
    const withDates = games.map(g => ({...g, start: new Date(g.start_date)})).sort((a,b)=>a.start-b.start);
    // pick in-progress if points exist or status string shows "final" / TBD
    const live = withDates.find(g => g.home_points != null || g.away_points != null);
    const upcoming = withDates.find(g => g.start >= now) || withDates[withDates.length-1];
    return (live || upcoming) ? mapCfbdToGame(live || upcoming) : null;
  }
}

function mapCfbdToGame(g){
  return {
    id: g.id,
    home: g.home_team, away: g.away_team,
    homePts: g.home_points ?? '–',
    awayPts: g.away_points ?? '–',
    start: g.start_date,
    statusText: g.venue ? `${g.venue}` : '',
    quarters: (g.home_line_scores && g.away_line_scores) ? {
      home: g.home_line_scores, away: g.away_line_scores
    } : null
  };
}
function mapEspnEventToGame(e){
  const comp = e?.competitions?.[0];
  const teams = comp?.competitors || [];
  const home = teams.find(t => t.homeAway === 'home');
  const away = teams.find(t => t.homeAway === 'away');
  const status = comp?.status?.type || {};
  return {
    id: e.id,
    home: home?.team?.shortDisplayName || home?.team?.name,
    away: away?.team?.shortDisplayName || away?.team?.name,
    homePts: home?.score ?? '–',
    awayPts: away?.score ?? '–',
    start: comp?.date,
    statusText: status?.shortDetail || status?.description || '',
    quarters: null
  };
}

async function renderScore() {
  const g = await getCurrentOrNextGame();
  state.game = g;

  $('#homeTeam').textContent = g ? g.home : '—';
  $('#awayTeam').textContent = g ? g.away : '—';
  $('#homePts').textContent = g?.homePts ?? '–';
  $('#awayPts').textContent = g?.awayPts ?? '–';
  $('#gameStatus').textContent = g?.statusText || '—';

  if (g?.quarters) {
    const q = g.quarters;
    $('#quarterBreakdown').textContent =
      `Q: ${q.home.map((v,i)=>`H${i+1}:${v??0}`).join(' ')} | ${q.away.map((v,i)=>`A${i+1}:${v??0}`).join(' ')}`;
  } else {
    $('#quarterBreakdown').textContent = '';
  }
  setLastRefresh();
}

// ---- Rankings (simple: AP Top 25 w/ Tennessee row, via CFBD) ----
async function renderRankings(){
  try{
    const year = new Date().getFullYear();
    // If you prefer Coaches/CFP, change "AP Top 25"
    const data = await cfbdFetch('/rankings', { year, seasonType:'regular', week: '' });
    // Find latest poll snapshot
    const latest = data?.[data.length-1];
    const ap = latest?.polls?.find(p => p.poll === 'AP Top 25');
    if (!ap) { $('#rankings').textContent = '—'; return; }
    const tn = ap.ranks.find(r => r.school === 'Tennessee');
    $('#rankings').innerHTML = tn
      ? `<div><strong>AP:</strong> #${tn.rank} — ${tn.school}</div>`
      : `<div><strong>AP:</strong> Tennessee not ranked</div>`;
    setLastRefresh();
  }catch(e){
    $('#rankings').textContent = 'Rankings unavailable';
  }
}

// ---- Weather: NWS primary, Open-Meteo fallback ----
async function renderWeather(){
  try{
    const [lat, lon] = C.MAP_CENTER;
    // NWS points → forecastHourly
    const meta = await fetch(`https://api.weather.gov/points/${lat},${lon}`).then(r=>r.json()); // :contentReference[oaicite:6]{index=6}
    const hourlyUrl = meta?.properties?.forecastHourly;
    const hourly = await fetch(hourlyUrl).then(r=>r.json());
    const p0 = hourly?.properties?.periods?.[0];
    $('#weather').innerHTML = p0
      ? `<div><strong>${p0.shortForecast}</strong> · ${Math.round(p0.temperature)}°${p0.temperatureUnit} · Wind ${p0.windSpeed}</div>`
      : '—';
  }catch(err){
    // Open-Meteo fallback (no key) :contentReference[oaicite:7]{index=7}
    const [lat, lon] = C.MAP_CENTER;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const data = await fetch(url).then(r=>r.json());
    const t = data?.hourly?.temperature_2m?.[0];
    const w = data?.hourly?.wind_speed_10m?.[0];
    $('#weather').innerHTML = (t!=null)
      ? `<div><strong>Temp</strong> ${Math.round(t)}°F · Wind ${Math.round(w||0)} mph (Open-Meteo)</div>`
      : 'Weather unavailable';
  }
  setLastRefresh();
}

// ---- Map ----
function initMap(){
  const map = L.map('map').setView(C.MAP_CENTER, C.MAP_ZOOM);
  // OSM tiles + attribution (required). :contentReference[oaicite:8]{index=8}
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  // Marker near Neyland
  L.marker(C.MAP_CENTER).addTo(map).bindPopup('Neyland Stadium area');
}

// ---- Orchestration ----
async function refreshAll(){
  $('#refreshBtn').disabled = true;
  try{
    await Promise.all([renderScore(), renderRankings(), renderWeather()]);
  } finally {
    $('#refreshBtn').disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initMap();
  refreshAll();
  if (state.pollHandle) clearInterval(state.pollHandle);
  state.pollHandle = setInterval(refreshAll, C.POLL_MS);
});

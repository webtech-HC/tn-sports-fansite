/*  TN Gameday Hub — client script
    Uses JSON from /data: schedule.json, next.json, weather.json, specials.json, places.json, meta.json
*/

const PATH_SCHEDULE = 'data/schedule.json';
const PATH_NEXT     = 'data/next.json';
const PATH_WEATHER  = 'data/weather.json';
const PATH_SPECIALS = 'data/specials.json';
const PATH_PLACES   = 'data/places.json';
const PATH_META     = 'data/meta.json';

// ---------- tiny utils ----------
const $  = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];

const fmtDate = (d, opts = {}) =>
  new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric', ...opts }).format(d);

const fmtTime = (d, opts = {}) =>
  new Intl.DateTimeFormat(undefined, { hour:'numeric', minute:'2-digit', ...opts }).format(d);

const toISODateOnly = (d) => d.toISOString().slice(0,10);

async function getJSON(url){
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if(!res || !res.ok) return null;
  return res.json();
}

// ---------- signal light logic ----------
function setSignal(state){
  const dot = $('#signalDot');
  if(!dot) return;
  dot.classList.remove('signal-red','signal-yellow','signal-green');
  if(state === 'live') dot.classList.add('signal-green');
  else if(state === 'gameday') dot.classList.add('signal-yellow');
  else dot.classList.add('signal-red'); // default
}

/* decide state using next.json and current time
   - 'live'     : now within [kickoff - 10m, kickoff + 5h]
   - 'gameday'  : same local calendar day as kickoff but not live yet
   - 'final'    : if schedule row has a result string
   - 'idle'     : none of the above
*/
function computeState(kickoff, scheduleRow){
  const now = new Date();

  // final beats anything else
  if(scheduleRow && scheduleRow.result) return 'final';

  const start = new Date(kickoff);
  const early = new Date(start.getTime() - 10*60*1000);
  const late  = new Date(start.getTime() + 5*60*60*1000);

  if(now >= early && now <= late) return 'live';

  const sameDay =
    now.getFullYear() === start.getFullYear() &&
    now.getMonth()    === start.getMonth() &&
    now.getDate()     === start.getDate();
  if(sameDay) return 'gameday';

  return 'idle';
}

// ---------- countdown ----------
function startCountdown(kickoffISO){
  const target = new Date(kickoffISO);

  function tick(){
    const now = new Date();
    let diff = Math.max(0, (target - now));
    const d = Math.floor(diff / (1000*60*60*24)); diff -= d*(1000*60*60*24);
    const h = Math.floor(diff / (1000*60*60));    diff -= h*(1000*60*60);
    const m = Math.floor(diff / (1000*60));       diff -= m*(1000*60);
    const s = Math.floor(diff / 1000);

    $('#kickDays').textContent  = String(d).padStart(2,'0');
    $('#kickHours').textContent = String(h).padStart(2,'0');
    $('#kickMins').textContent  = String(m).padStart(2,'0');
    $('#kickSecs').textContent  = String(s).padStart(2,'0');

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- score box ----------
function renderScoreBox(team, row, state){
  const box = $('#scoreBody');
  if(!box) return;

  if(state === 'live'){
    box.innerHTML = `
      <p><strong>${team}</strong></p>
      <p>Game in progress… <em>live updates coming soon</em>.</p>
    `;
    return;
  }
  if(state === 'final' && row.result){
    box.innerHTML = `
      <p><strong>${team}</strong></p>
      <p>Final: <strong>${row.result}</strong></p>
    `;
    return;
  }
  if(state === 'gameday'){
    box.innerHTML = `
      <p><strong>${team}</strong></p>
      <p>It’s Gameday! Kickoff ${fmtTime(new Date(row.date))}.</p>
    `;
    return;
  }

  box.innerHTML = `
    <p><strong>${team}</strong></p>
    <p>No game in progress.</p>
  `;
}

// ---------- schedule ----------
function paintSchedule(list, showAll = false){
  const tbody = $('#scheduleRows');
  if(!tbody) return;

  const data = showAll ? list : list.slice(0,3);
  tbody.innerHTML = data.map(g => {
    const when = new Date(g.date);
    const ha = g.home === true ? 'H' : (g.home === false ? 'A' : '');
    const tv = g.tv || '';
    const res = g.result || '';
    return `<tr>
      <td>${fmtDate(when)}</td>
      <td>${g.opponent || ''}</td>
      <td>${ha}</td>
      <td>${tv}</td>
      <td>${res}</td>
    </tr>`;
  }).join('');
}

// ---------- specials (supports title/biz OR v2 fields) ----------
function normalizeSpecial(x){
  return {
    title: x.deal_title || x.title || 'Special',
    biz:   x.business_name || x.biz || '',
    area:  x.area || '',
    time:  x.time_window || x.time || '',
    link:  x.url || x.link || '#'
  };
}
function paintSpecials(items){
  const grid = $('#specialsGrid');
  if(!grid) return;
  grid.innerHTML = (items || []).slice(0,6).map(raw => {
    const s = normalizeSpecial(raw);
    const meta = [s.biz, s.area, s.time].filter(Boolean).join(' · ');
    return `<div class="tile">
      <strong>${s.title}</strong>
      <div class="meta">${meta}</div>
      <a href="${s.link}" target="_blank" rel="noopener">Details</a>
    </div>`;
  }).join('');
}

// ---------- places ----------
function paintPlaces(items){
  const grid = $('#placesGrid');
  if(!grid) return;
  grid.innerHTML = (items || []).slice(0,8).map(p => {
    const line = [p.area, p.type].filter(Boolean).join(' · ');
    const link = p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Website</a>` : '';
    return `<div class="tile">
      <strong>${p.name || 'Place'}</strong>
      <div class="meta">${line || 'Knoxville area'}</div>
      ${link}
    </div>`;
  }).join('');
}

// ---------- weather ----------
function paintWeather(rows){
  const ul = $('#wx');
  if(!ul) return;
  if(!rows || !rows.length){ ul.innerHTML = `<li><em>No data</em></li>`; return; }
  ul.innerHTML = rows.map(x=>{
    const d = new Date(x.date);
    const pr = (x.precip || x.precipPct || 0);
    const hi = Math.round(x.hi ?? x.high ?? 0);
    const lo = Math.round(x.lo ?? x.low ?? 0);
    const wd = new Intl.DateTimeFormat([], { weekday: 'short' }).format(d);
    return `<li><span style="width:3rem;display:inline-block">${wd}</span>
      <span>Hi ${hi}°</span> <span>Lo ${lo}°</span>
      <span>${pr}%</span></li>`;
  }).join('');
}

// ---------- meta (last updated) ----------
function paintUpdatedAt(meta){
  const el = $('#updatedAt'); if(!el || !meta) return;
  const ts = meta.lastUpdated ? new Date(meta.lastUpdated) : null;
  el.textContent = ts ? `${fmtDate(ts)} ${fmtTime(ts)}` : '—';
}

// ---------- map ----------
function initMap(){
  const node = $('#map');
  if(!node || !window.L) return;
  const map = L.map(node, { zoomControl:true, scrollWheelZoom:false }).setView([35.954, -83.925], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM contributors'
  }).addTo(map);
  return map;
}

// ---------- add-to-calendar (Google link) ----------
function openAddToCalendar(game){
  if(!game) return;
  const start = new Date(game.date);
  const end   = new Date(start.getTime() + 3*60*60*1000);
  const pad = (n)=> String(n).padStart(2,'0');
  const toCal = (d)=> `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const text = encodeURIComponent(`Tennessee vs ${game.opponent}`);
  const dates= `${toCal(start)}/${toCal(end)}`;
  const details = encodeURIComponent('Unofficial reminder from Gameday Hub');
  const location = encodeURIComponent(game.venue || 'Knoxville, TN');

  const href = `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
  window.open(href, '_blank', 'noopener');
}

// ---------- boot ----------
async function boot(){
  const [sched, next, wx, specials, places, meta] = await Promise.all([
    getJSON(PATH_SCHEDULE),
    getJSON(PATH_NEXT),
    getJSON(PATH_WEATHER),
    getJSON(PATH_SPECIALS),
    getJSON(PATH_PLACES),
    getJSON(PATH_META)
  ]);

  if(meta) paintUpdatedAt(meta);

  // schedule (render 3 by default + toggle)
  const list = Array.isArray(sched) ? sched : [];
  paintSchedule(list, false);
  $('#toggleScheduleBtn')?.addEventListener('click', (e)=>{
    const expanded = e.currentTarget.dataset.expanded === 'true';
    paintSchedule(list, !expanded);
    e.currentTarget.dataset.expanded = String(!expanded);
    e.currentTarget.textContent = expanded ? 'See full schedule' : 'Show fewer';
  });

  // find the next game row (by date equality) to extract opponent & venue
  let nextRow = null;
  let kickoffISO = next?.date || null;
  if(kickoffISO){
    const kickoffDay = toISODateOnly(new Date(kickoffISO));
    nextRow = list.find(g => toISODateOnly(new Date(g.date)) === kickoffDay) || null;
  }

  const opponent = nextRow?.opponent || 'Opponent';
  const homeAway = nextRow?.home === true ? 'Home' : (nextRow?.home === false ? 'Away' : '');
  const venue = nextRow?.venue || (homeAway === 'Home' ? 'Neyland Stadium' : '') || '—';

  // upcoming/current card text
  $('#nextTeams').textContent = `Tennessee vs ${opponent}`;
  $('#nextWhen').textContent  = kickoffISO ? `${fmtDate(new Date(kickoffISO))} • ${fmtTime(new Date(kickoffISO))}` : '—';
  $('#nextVenue').textContent = `Venue: ${venue}`;

  // countdown + add-to-calendar
  if(kickoffISO){
    startCountdown(kickoffISO);
    const add = ()=> openAddToCalendar({ date:kickoffISO, opponent, venue });
    $('#addToCalendarBtn')?.addEventListener('click', add);
    $('#addToCalendarBtn2')?.addEventListener('click', add);
  }

  // signal + score box
  const state = computeState(kickoffISO, nextRow);
  setSignal(state);
  renderScoreBox('Tennessee', nextRow || { date:kickoffISO }, state);

  // weather, specials, places
  if(wx) paintWeather(wx);
  if(specials) paintSpecials(specials);
  if(places) paintPlaces(places);

  // map
  initMap();
}

document.addEventListener('DOMContentLoaded', boot);

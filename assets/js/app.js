/* App: reads /data/*.json and paints UI
   - score dot: red / yellow / green
   - map + weather + schedule + specials
*/

const PATH_SCHEDULE = 'data/schedule.json';
const PATH_NEXT     = 'data/next.json';
const PATH_WEATHER  = 'data/weather.json';
const PATH_SPECIALS = 'data/specials.json';
const PATH_PLACES   = 'data/places.json';
const PATH_META     = 'data/meta.json';

// Helpers
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month:'short', day:'2-digit' });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
const fetchJSON = async (url) => (await fetch(url, { cache:'no-store' })).json();

function setScoreDot(state){
  const dot = $('#scoreDot');
  if (!dot) return;
  dot.setAttribute('data-state', state); // red | yellow | green
}

// ----- Score box + Upcoming -----
async function paintScoreAndUpcoming(){
  const next = await fetchJSON(PATH_NEXT).catch(() => null);
  const body = $('#scoreBody');
  const line = $('#nextLine');
  const venue = $('#venueLine');

  if (!next || !next.date){
    setScoreDot('red');
    body.innerHTML = `<div class="team">Tennessee</div><p>No scheduled game.</p>`;
    line.textContent = '—';
    venue.textContent = '';
    return;
  }

  const kickoff = new Date(next.date);                // assumed stored in UTC
  const end     = new Date(kickoff.getTime() + 4*60*60*1000); // 4h window
  const now     = new Date();

  // Default text
  const opp = next.opponent || 'Opponent';
  const homeAway = next.home ? 'Home' : 'Away';
  line.textContent = `${opp} — ${kickoff.toLocaleDateString()} • ${fmtTime(kickoff)} ${homeAway}`;
  venue.textContent = `Venue: ${next.venue || '—'}`;

  // Scorebox content
  const tn = 'Tennessee';
  const statusLine = () => {
    if (now >= kickoff && now <= end && !next.result) return 'Game in progress.';
    if (now.toDateString() === kickoff.toDateString() && now < kickoff) return `Game day. Kickoff at ${fmtTime(kickoff)}.`;
    if (next.result) return `Final: ${next.result}`;
    return 'No game in progress.';
  };

  body.innerHTML = `
    <div class="team">${tn}</div>
    <p>${statusLine()}</p>
  `;

  // Dot state
  if (now >= kickoff && now <= end && !next.result) {
    setScoreDot('green');
  } else if (now.toDateString() === kickoff.toDateString() && now < kickoff) {
    setScoreDot('yellow');
  } else {
    setScoreDot('red');
  }

  // Add-to-calendar hooks (ICS)
  const addIcs = () => {
    const start = kickoff.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const endIso= end.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const summary = `Tennessee vs ${opp}`;
    const description = 'Unofficial fan site event';
    const loc = next.venue || 'Knoxville, TN';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TN Fansite//EN',
      'BEGIN:VEVENT',
      `DTSTART:${start}`,
      `DTEND:${endIso}`,
      `SUMMARY:${summary}`,
      `LOCATION:${loc}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], {type:'text/calendar;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'tennessee-game.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  $('#btnIcs')?.addEventListener('click', addIcs, { once:true });
  $('#btnIcs2')?.addEventListener('click', addIcs, { once:true });
}

// ----- Schedule table -----
async function paintSchedule(){
  const rowsEl = $('#schedRows');
  const btn = $('#showMoreBtn');
  const data = await fetchJSON(PATH_SCHEDULE).catch(() => []);

  let shown = 0;
  const page = 3;

  function renderChunk(){
    const slice = data.slice(shown, shown + page);
    rowsEl.insertAdjacentHTML('beforeend', slice.map(r => {
      const date = r.date ? fmtDate(r.date) : '—';
      const opp  = r.opponent || '—';
      const ha   = r.home === true ? 'H' : (r.home === false ? 'A' : '—');
      const tv   = r.tv || '—';
      const res  = r.result || '—';
      return `<tr><td>${date}</td><td>${opp}</td><td>${ha}</td><td>${tv}</td><td>${res}</td></tr>`;
    }).join(''));
    shown += slice.length;
    if (shown >= data.length) btn.style.display = 'none';
  }

  btn.addEventListener('click', renderChunk);
  renderChunk();
}

// ----- Weather (rail) -----
async function paintWeather(){
  const ul = $('#wxList');
  const rows = await fetchJSON(PATH_WEATHER).catch(() => []);
  if (!rows?.length){ ul.innerHTML = '<li>—</li>'; return; }

  ul.innerHTML = rows.slice(0,3).map(d => {
    const day = new Date(d.date).toLocaleDateString(undefined,{ weekday:'short'});
    const hi  = Math.round(d.hi);
    const lo  = Math.round(d.lo);
    const pr  = Math.round(d.precip || 0);
    return `<li><span class="day">${day}</span><span>Hi ${hi}°</span><span>Lo ${lo}°</span><span>${pr}%</span></li>`;
  }).join('');
}

// ----- Specials -----
async function paintSpecials(){
  const grid = $('#specialsGrid');
  const list = await fetchJSON(PATH_SPECIALS).catch(() => []);
  if (!list?.length){ grid.innerHTML = '<div class="muted">No specials yet.</div>'; return; }

  grid.innerHTML = list.map(x => {
    const title = x.title || (x.deal_title ? `${x.deal_title} – Special` : 'Special');
    const meta  = [x.biz, x.area].filter(Boolean).join(' • ');
    const link  = x.link ? `<a href="${x.link}" target="_blank" rel="noopener">Details</a>` : '';
    return `<article class="special"><h4>${title}</h4><p class="muted">${meta}</p>${link}</article>`;
  }).join('');
}

// ----- Places list (simple bullets + map markers same data) -----
async function paintPlaces(){
  const ul = $('#placesList');
  const places = await fetchJSON(PATH_PLACES).catch(() => []);
  if (!places?.length){ ul.innerHTML = '<li class="muted">No places yet.</li>'; return; }

  ul.innerHTML = places.slice(0,8).map(p => `<li>${p.name || 'Place'}${p.area ? ` — ${p.area}`:''}</li>`).join('');

  // Add markers to the map if we have lat/lon
  if (window.__map) {
    places.slice(0, 20).forEach(p => {
      if (typeof p.lat === 'number' && typeof p.lon === 'number') {
        L.marker([p.lat, p.lon]).addTo(window.__map).bindPopup(p.name || 'Place');
      }
    });
  }
}

// ----- Map -----
function bootMap(){
  const el = $('#map');
  if (!el || typeof L === 'undefined') return;
  const center = [35.955, -83.929]; // Knoxville-ish
  const map = L.map(el, { scrollWheelZoom:false }).setView(center, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  window.__map = map;
}

// ----- Data updated stamp -----
async function paintMeta(){
  const meta = await fetchJSON(PATH_META).catch(() => null);
  const stampEls = $$('.meta');
  if (!meta?.updated) return;
  stampEls.forEach(el => {
    if (/Data updated/i.test(el.textContent)) el.textContent = `Data updated ${new Date(meta.updated).toLocaleString()}`;
  });
}

// ----- Countdown (header bar) -----
async function paintCountdown(){
  const next = await fetchJSON(PATH_NEXT).catch(() => null);
  if (!next?.date) return;
  const target = new Date(next.date).getTime();
  const el = $('#countdown');
  if (!el) return;

  function tick(){
    const now = Date.now();
    let t = Math.max(0, target - now);
    const d = Math.floor(t / 86400000); t -= d*86400000;
    const h = Math.floor(t / 3600000);  t -= h*3600000;
    const m = Math.floor(t / 60000);    t -= m*60000;
    const s = Math.floor(t / 1000);
    el.textContent = `${d}d • ${h}h • ${m}m • ${s}s`;
  }
  tick();
  setInterval(tick, 1000);
}

// ----- Boot -----
async function boot(){
  bootMap();

  await Promise.all([
    paintScoreAndUpcoming(),
    paintSchedule(),
    paintWeather(),
    paintSpecials(),
    paintPlaces(),
    paintMeta(),
    paintCountdown()
  ]);
}

document.addEventListener('DOMContentLoaded', boot);

/* -----------------------------------------------------------
   Client-side app for Tennessee fansite (GitHub Pages-safe)
   ----------------------------------------------------------- */

/* ---------- Path resolution (fix 404s under /tn-sports-fansite/) ---------- */
const BASE_HREF = document.querySelector('base')?.href || document.baseURI;
const DATA_BASE = new URL('data/', BASE_HREF);

const NEXT_JSON     = new URL('next.json',     DATA_BASE).href;
const SCHEDULE_JSON = new URL('schedule.json', DATA_BASE).href;
const WEATHER_JSON  = new URL('weather.json',  DATA_BASE).href;
const PLACES_JSON   = new URL('places.json',   DATA_BASE).href;
const SPECIALS_JSON = new URL('specials.json', DATA_BASE).href;
const META_JSON     = new URL('meta.json',     DATA_BASE).href;

const getJSON = async (url) => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json();
};

/* ---------- Helpers ---------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtDate = (dStr) => {
  try {
    const d = new Date(dStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return dStr; }
};
const fmtDateTime = (dStr) => {
  try {
    const d = new Date(dStr);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${date} • ${time}`;
  } catch { return dStr; }
};

const setSignal = (status) => {
  const el = $('#js-signal');
  el.classList.remove('red','yellow','green');
  el.classList.add(status);
};

/* ---------- UI builders ---------- */
function renderSchedule(rows = []) {
  const tb = $('#js-schedule tbody');
  tb.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.opponent || '—'}</td>
      <td>${r.home === true ? 'H' : r.home === false ? 'A' : '—'}</td>
      <td>${r.tv ?? '—'}</td>
      <td>${r.result ?? '—'}</td>
    `;
    tb.appendChild(tr);
  });
}

function renderWeather(list = []) {
  const ul = $('#js-weather');
  ul.innerHTML = '';
  list.slice(0, 3).forEach(w => {
    const li = document.createElement('li');
    li.textContent = `${new Date(w.date).toLocaleDateString(undefined, { weekday: 'short' })} — Hi ${Math.round(w.hi)}° Lo ${Math.round(w.lo)}°  ${w.precip ?? 0}%`;
    ul.appendChild(li);
  });
}

function renderSpecials(items = []) {
  const box = $('#js-specials');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = `<div class="muted">No specials yet.</div>`;
    return;
  }
  items.forEach(s => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <h4>${s.title}</h4>
      <div class="muted">${[s.biz, s.area, s.time_window].filter(Boolean).join(' • ')}</div>
      ${s.link ? `<div><a class="btn pill" href="${s.link}" target="_blank" rel="noopener">Details</a></div>` : ''}
    `;
    box.appendChild(el);
  });
}

/* ---------- Map ---------- */
let map;
function initMap() {
  if (map) return;
  // Knoxville default
  map = L.map('map', { scrollWheelZoom: false }).setView([35.9606, -83.9207], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}
function addPlaceMarkers(places = []) {
  if (!map) initMap();
  places.forEach(p => {
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      L.marker([p.lat, p.lng]).addTo(map)
        .bindPopup(`<strong>${p.name || 'Place'}</strong><br>${p.formatted_address || ''}`);
    }
  });
}

/* ---------- Next / Live logic ---------- */
function computeSignal(next) {
  // next: { date: ISO8601, opponent, home, tv, venue } or {}
  if (!next || !next.date) { setSignal('red'); return { text: 'No upcoming game found.', venue: '' }; }

  const now = new Date();
  const ko  = new Date(next.date);
  const end = new Date(ko.getTime() + 4 * 60 * 60 * 1000); // rough 4h window

  let text = `Opponent — ${fmtDateTime(next.date)} ${next.home ? 'Home' : 'Away'}`;
  if (now < ko && now.toDateString() === ko.toDateString()) {
    setSignal('yellow'); // game day, before kickoff
  } else if (now >= ko && now <= end) {
    setSignal('green'); // in progress window
    text = `Tennessee vs ${next.opponent || 'Opponent'} — In progress`;
    $('#js-live-text').textContent = 'Game in progress.';
  } else if (now < ko) {
    setSignal('red'); // not game day yet
  } else {
    setSignal('red'); // game over
  }

  return {
    text: `Tennessee vs ${next.opponent || 'Opponent'} — ${fmtDateTime(next.date)}`,
    venue: next.venue || ''
  };
}

/* ---------- Boot ---------- */
(async function boot(){
  try {
    const [meta, next, schedule, weather, places, specials] = await Promise.all([
      getJSON(META_JSON).catch(()=>({})),
      getJSON(NEXT_JSON).catch(()=>({})),
      getJSON(SCHEDULE_JSON).catch(()=>([])),
      getJSON(WEATHER_JSON).catch(()=>([])),
      getJSON(PLACES_JSON).catch(()=>([])),
      getJSON(SPECIALS_JSON).catch(()=>([]))
    ]);

    // Header: last updated
    if (meta?.lastUpdated) {
      $('#js-updated').textContent = `Data updated ${new Date(meta.lastUpdated).toLocaleString()}`;
    }

    // Next / Live
    const info = computeSignal(next);
    $('#js-next-line').textContent = info.text;
    $('#js-next-venue').textContent = info.venue ? `Venue: ${info.venue}` : '';

    // Add to calendar
    $('#js-add-cal').addEventListener('click', () => {
      if (!next?.date) return;
      const start = new Date(next.date);
      const end   = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      const title = encodeURIComponent(`Tennessee vs ${next.opponent || 'Opponent'}`);
      const details = encodeURIComponent('Added from TN Fansite');
      const location = encodeURIComponent(next.venue || 'Neyland Stadium');
      const s = start.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const e = end.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${s}/${e}&details=${details}&location=${location}`;
      window.open(url, '_blank', 'noopener');
    });

    // Schedule
    renderSchedule(Array.isArray(schedule) ? schedule : []);

    // Weather (3-day)
    renderWeather(Array.isArray(weather) ? weather : []);

    // Places (list + markers)
    const placesList = $('#js-places');
    placesList.innerHTML = '';
    (Array.isArray(places) ? places : []).forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.name || 'Place'} — ${p.formatted_address || ''}`;
      placesList.appendChild(li);
    });
    initMap();
    addPlaceMarkers(Array.isArray(places) ? places : []);

    // Specials
    renderSpecials(Array.isArray(specials) ? specials : []);

    // “Show more” on schedule (progressive reveal)
    const revealSize = 3;
    const allRows = $('#js-schedule tbody').querySelectorAll('tr');
    allRows.forEach((tr, i) => { tr.style.display = (i < revealSize ? '' : 'none'); });
    const more = $('#js-more');
    more.addEventListener('click', () => {
      const hidden = Array.from(allRows).filter(tr => tr.style.display === 'none');
      hidden.slice(0, revealSize).forEach(tr => tr.style.display = '');
      if (hidden.length <= revealSize) more.disabled = true, more.textContent = '—';
    });

    // Newsletter (fake)
    $('#js-news').addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Thanks! You are on the list.');
      e.target.reset();
    });

  } catch (err) {
    console.error('boot error', err);
    setSignal('red');
  }
})();

// assets/js/app.js
// ======= JSON-driven page logic (GitHub Pages-safe) =======

const PATH_SCHEDULE = 'data/schedule.json';
const PATH_SPECIALS = 'data/specials.json'; // your hand-curated deals
const PATH_WEATHER  = 'data/weather.json';  // produced by the Action
const PATH_META     = 'data/meta.json';     // produced by the Action
const PATH_PLACES   = 'data/places.json';   // produced by the Action (optional)

// Helpers
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const fmtDate = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const untilParts = (iso) => {
  if (!iso) return { d:0,h:0,m:0,s:0 };
  const now = new Date(), then = new Date(iso);
  const ms = Math.max(0, then - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { d, h, m, s };
};

async function fetchJSON(path, fallback = null) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn('Failed to fetch', path, e);
    return fallback;
  }
}

// Pick next upcoming game (>= now). If none, last game.
function pickNextGame(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const now = Date.now();
  const sorted = [...schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted.find(g => new Date(g.date).getTime() >= now) || sorted[sorted.length - 1] || null;
}

// ---------- Paint quick glance ----------
function paintQuick(game) {
  if (!game) return;
  $("#qOpp").textContent = game.opponent;
  $("#qDate").textContent = new Date(game.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $("#qTime").textContent = fmtTime(game.date);
  $("#qVenue").textContent = game.venue || (game.home ? "Knoxville, TN" : "Away");
}

// ---------- Countdown (hero mini + guide block) ----------
function tickCountdown(kickoffISO) {
  if (!kickoffISO) return;
  const { d, h, m, s } = untilParts(kickoffISO);
  $("#miniDays")  && ($("#miniDays").textContent = pad(d));
  $("#miniHours") && ($("#miniHours").textContent = pad(h));
  $("#miniMins")  && ($("#miniMins").textContent = pad(m));
  $("#cdD") && ($("#cdD").textContent = pad(d));
  $("#cdH") && ($("#cdH").textContent = pad(h));
  $("#cdM") && ($("#cdM").textContent = pad(m));
  $("#cdS") && ($("#cdS").textContent = pad(s));
}

// ---------- Render schedule ----------
function paintSchedule(schedule) {
  const tbody = $("#schBody");
  if (!tbody) return;
  tbody.innerHTML = (schedule || []).map(g => `
    <tr>
      <td>${fmtDate(g.date)} ${fmtTime(g.date)}</td>
      <td>${g.opponent}</td>
      <td>${g.home ? "Home" : "Away"}</td>
      <td>${g.tv || "TBD"}</td>
      <td>${g.result ?? ""}</td>
    </tr>
  }).join("");
}

// ---------- Render specials (supports two shapes) ----------
function normalizeSpecial(x){
  return {
    title: x.deal_title || x.title || 'Special',
    biz:   x.business_name || x.biz || '',
    area:  x.area || '',
    time:  x.time_window || x.time || '',
    link:  x.url || x.link || '#'
  };
}
function paintSpecials(list) {
  const grid = $("#specialsGrid");
  if (!grid) return;
  grid.innerHTML = (list || []).slice(0, 6).map(x => {
    const s = normalizeSpecial(x);
    const meta = [s.biz, s.area, s.time].filter(Boolean).join(' • ');
    return `
      <article class="sp">
        <h3>${s.title}</h3>
        <div class="meta">${meta}</div>
        <p><a href="${s.link}" target="_blank" rel="noopener">Details</a></p>
      </article>`;
  }).join("");
}

// ---------- Weather (from /data/weather.json) ----------
async function paintWeather() {
  const ul = document.querySelector('.wx');
  if (!ul) return;
  const rows = await fetchJSON(PATH_WEATHER, []);
  if (!rows || rows.length === 0) return;
  ul.innerHTML = rows.map(x => {
    const w = new Date(x.date).toLocaleDateString([], { weekday: 'short' });
    const hi = Math.round(x.hi), lo = Math.round(x.lo);
    const pr = (x.precip ?? 0) + '%';
    return `<li><b>${w}</b> <span>${hi}°/${lo}°</span> <em>${pr}</em></li>`;
  }).join('');
}

// ---------- "Data last updated" (from /data/meta.json) ----------
async function paintLastUpdated() {
  const el = $("#dataUpdated");
  if (!el) return;
  const meta = await fetchJSON(PATH_META, null);
  if (!meta?.lastUpdated) { el.textContent = 'Data updated — n/a'; return; }
  const dt = new Date(meta.lastUpdated).toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
  el.textContent = `Data updated — ${dt}`;
}

// ---------- Marquee ticker ----------
function mountTicker(nextGame) {
  const track = $("#tickerTrack");
  if (!track || !nextGame) return;

  function nowCountdownStr() {
    const { d, h, m } = untilParts(nextGame.date);
    return `${pad(d)}d ${pad(h)}h ${pad(m)}m`;
  }
  function buildChunk() {
    const parts = [
      `Kickoff vs ${nextGame.opponent}: ${fmtDate(nextGame.date)} ${fmtTime(nextGame.date)}`,
      `Countdown ${nowCountdownStr()}`,
      (nextGame.venue || (nextGame.home ? "Knoxville, TN" : "Away"))
    ];
    return parts.map(p => `<span class="ticker-item">${p}</span><span class="ticker-bullet">•</span>`).join('');
  }
  track.innerHTML = `<div class="ticker-row">${buildChunk()}</div><div class="ticker-row">${buildChunk()}</div>`;
  setInterval(() => {
    const rows = track.querySelectorAll('.ticker-row');
    rows.forEach(r => r.innerHTML = buildChunk());
  }, 60000);
}

// ---------- Add-to-Calendar (.ics) ----------
function toICSDate(iso) {
  const d = new Date(iso);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const YYYY = z.getUTCFullYear(), MM = pad(z.getUTCMonth() + 1), DD = pad(z.getUTCDate());
  const HH = pad(z.getUTCHours()), m = pad(z.getUTCMinutes()), s = pad(z.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${HH}${m}${s}Z`;
}
function icsBlobForGame(game) {
  const start = new Date(game.date);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // 3h default
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tennessee Gameday Hub//HC Web Labs//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${(crypto.randomUUID?.() || ('tenn-'+Date.now()))}@hcweblabs`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(start.toISOString())}`,
    `DTEND:${toICSDate(end.toISOString())}`,
    `SUMMARY:Tennessee vs ${game.opponent} (Unofficial Reminder)`,
    `DESCRIPTION:Unofficial fan reminder. Times/TV may change. Check official sources.`,
    `LOCATION:${(game.venue || (game.home ? 'Knoxville, TN' : 'Away')).replace(/\n/g,' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return new Blob([lines], { type: 'text/calendar' });
}
function wireAddToCal(game) {
  const linkHero = $("#addCalHero");
  const linkCard = $("#addCalCard");
  if (!game) return;
  const blob = icsBlobForGame(game);
  const url = URL.createObjectURL(blob);
  const fname = `tennessee-vs-${game.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  [linkHero, linkCard].forEach(a => {
    if (!a) return;
    a.href = url;
    a.download = fname;
    a.setAttribute('aria-label', `Add ${game.opponent} game to your calendar`);
  });
}

// ---------- Leaflet Map (from /data/places.json) ----------
async function paintLeafletMap() {
  const mapEl = $("#leafletMap");
  if (!mapEl) return;
  if (typeof L === 'undefined') { console.warn('Leaflet not loaded'); return; }

  // Init map (center Knoxville)
  const map = L.map('leafletMap', { scrollWheelZoom: false });
  const center = [35.9606, -83.9207];
  map.setView(center, 13);

  // Tiles + attribution (required by OSM)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Load places
  const places = await fetchJSON(PATH_PLACES, []);
  if (!places || !places.length) {
    $("#mapNote") && ($("#mapNote").textContent = 'No live places data yet — check back soon.');
    setTimeout(() => map.invalidateSize(), 50);
    return;
  }

  const markers = [];
  places.forEach(p => {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return;
    const m = L.marker([p.lat, p.lon]).addTo(map);
    const link = p.url ? `<br><a href="${p.url}" target="_blank" rel="noopener">Website</a>` : '';
    m.bindPopup(`<strong>${p.name}</strong><br>${p.address || p.area || ''}${link}`);
    markers.push(m);
  });

  const group = L.featureGroup(markers);
  try { map.fitBounds(group.getBounds().pad(0.2)); } catch {}
  setTimeout(() => map.invalidateSize(), 100);
}

// ---------- Init ----------
(async function init() {
  const [schedule, specials] = await Promise.all([
    fetchJSON(PATH_SCHEDULE, []),
    fetchJSON(PATH_SPECIALS, [])
  ]);

  paintSchedule(schedule);
  paintSpecials(specials);
  paintWeather();
  paintLastUpdated();

  const next = pickNextGame(schedule);
  paintQuick(next);
  tickCountdown(next?.date);
  setInterval(() => tickCountdown(next?.date), 1000);
  mountTicker(next);
  wireAddToCal(next);

  paintLeafletMap();
})();

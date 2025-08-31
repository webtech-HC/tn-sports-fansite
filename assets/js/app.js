/* app.js — Tennessee Fansite UI glue (browser-only)
   Assumes static JSON written by Actions:
   /data/next.json, /data/schedule.json, /data/weather.json, /data/places.json, /data/specials.json
*/

const PATH_NEXT     = '/data/next.json';
const PATH_SCHEDULE = '/data/schedule.json';
const PATH_WEATHER  = '/data/weather.json';
const PATH_PLACES   = '/data/places.json';
const PATH_SPECIALS = '/data/specials.json';

// Knoxville fallback
const KNOX = [35.9606, -83.9207];

/* ================ Helpers ================ */
const $ = (sel, root=document) => root.querySelector(sel);

function fmtDate(d){
  // Sat Sep 6, 3:30 PM
  return new Date(d).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}
function fmtDay(d){
  return new Date(d).toLocaleDateString([], { weekday:'short' });
}
function fmtHILO(n){
  return Math.round(n);
}
function setUpdated(){
  const t = new Date().toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
  $('#updatedAt')?.replaceChildren(t);
  $('#updatedAt2')?.replaceChildren(t);
}

/* ================ Countdown (optional basic) ================ */
function startCountdown(nextIso){
  const el = $('#kickoffClock');
  if(!el || !nextIso) return;
  function tick(){
    const now = new Date();
    const diff = new Date(nextIso) - now;
    if(diff <= 0){
      el.textContent = 'Kickoff in 0 days 0 hours 0 minutes';
      return;
    }
    const mins = Math.floor(diff/60000);
    const days = Math.floor(mins/1440);
    const hours = Math.floor((mins%1440)/60);
    const m = mins%60;
    el.textContent = `Kickoff in ${days}d ${hours}h ${m}m`;
  }
  tick();
  setInterval(tick, 60*1000);
}

/* ================ Live score signal ================ */
function setScoreSignal(nextIso){
  const dot = $('#scoreDot');
  const msg = $('#scoreMsg');
  if(!dot) return;

  if(!nextIso){
    dot.dataset.state = 'red';
    msg.textContent = 'No game info.';
    return;
  }

  const now = new Date();
  const start = new Date(nextIso);

  // crude end: kickoff + 5 hours, covers OT; refine later if live scoring added
  const end = new Date(start.getTime() + 5*60*60*1000);

  const isSameCalendarDay = start.toDateString() === now.toDateString();

  if(now >= start && now <= end){
    dot.dataset.state = 'green';
    msg.textContent = 'Game in progress.';
  } else if(isSameCalendarDay && now < start){
    dot.dataset.state = 'yellow';
    msg.textContent = 'Gameday — awaiting kickoff.';
  } else {
    dot.dataset.state = 'red';
    msg.textContent = 'No game in progress.';
  }
}

/* ================ Map ================ */
function initMap(){
  const mapEl = $('#map');
  if(!mapEl) return null;

  const map = L.map('map', { scrollWheelZoom:false }).setView(KNOX, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; OpenStreetMap contributors'
  }).addTo(map);
  return map;
}

/* ================ Data paint: Upcoming ================ */
async function paintUpcoming(){
  try{
    const next = await fetch(PATH_NEXT, {cache:'no-store'}).then(r => r.json()).catch(() => null);
    const el = $('#nextLine');
    const venueEl = $('#nextVenue');

    if(!next || !next.date || !next.opponent){
      el.textContent = 'No upcoming game found.';
      return null;
    }

    const when = fmtDate(next.date);
    const ha = next.home === true ? 'Home' : next.home === false ? 'Away' : '—';
    el.textContent = `Tennessee vs ${next.opponent} — ${when} (${ha})`;
    venueEl.textContent = next.venue ? `Venue: ${next.venue}` : '';

    // kickoff utilities
    startCountdown(next.date);
    setScoreSignal(next.date);

    // Add to calendar (basic .ics)
    const btn = $('#addToCalendar');
    if(btn){
      btn.onclick = () => {
        const dt = new Date(next.date);
        const dtEnd = new Date(dt.getTime() + 3*60*60*1000);
        const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HC Web Labs//TN Fansite//EN
BEGIN:VEVENT
UID:${dt.getTime()}@tn-fansite
DTSTAMP:${toICS(new Date())}
DTSTART:${toICS(dt)}
DTEND:${toICS(dtEnd)}
SUMMARY:Tennessee vs ${next.opponent}
LOCATION:${(next.venue||'').replace(/,/g,'\\,')}
DESCRIPTION:TN Gameday
END:VEVENT
END:VCALENDAR`;
        const blob = new Blob([ics], {type:'text/calendar'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `tennessee-${dt.toISOString().slice(0,10)}.ics`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      };
    }

    return next.date;
  }catch(e){
    console.error('upcoming error', e);
    return null;
  }
}
function toICS(d){
  // yyyymmddThhmmssZ
  return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}

/* ================ Data paint: Schedule ================ */
async function paintSchedule(){
  const tbody = $('#schedRows');
  const btn = $('#schedMore');
  if(!tbody) return;

  try{
    let rows = await fetch(PATH_SCHEDULE, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    // sort defensive
    rows = (rows||[]).slice().sort((a,b) => new Date(a.date) - new Date(b.date));

    // render with "show more" (initial 3)
    let shown = 3;
    const render = () => {
      tbody.innerHTML = rows.slice(0, shown).map(g => {
        const ha = g.home === true ? 'H' : g.home === false ? 'A' : '—';
        const tv = g.tv ?? 'TBD';
        const res = g.result ?? '—';
        return `<tr>
          <td>${new Date(g.date).toLocaleDateString([], {month:'short', day:'2-digit', year:'numeric'})}</td>
          <td>${escapeHtml(g.opponent || '—')}</td>
          <td>${ha}</td>
          <td>${escapeHtml(tv)}</td>
          <td>${escapeHtml(res)}</td>
        </tr>`;
      }).join('');
      if(btn){
        if(shown >= rows.length){ btn.style.display='none'; }
        else { btn.style.display='inline-flex'; btn.textContent = `Show ${Math.min(3, rows.length-shown)} more`; }
      }
    };
    render();

    btn?.addEventListener('click', () => { shown = Math.min(shown+3, rows.length); render(); });
  }catch(e){
    console.error('schedule error', e);
  }
}

/* ================ Data paint: Weather (rail) ================ */
async function paintWeather(){
  const list = $('#wxList');
  if(!list) return;

  try{
    const data = await fetch(PATH_WEATHER, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    const rows = (data||[]).slice(0,3).map(x => {
      const hi = fmtHILO(x.hi), lo = fmtHILO(x.lo), pr = Math.round(x.precip*10)/10;
      return `<li><span>${fmtDay(x.date)}</span><span>Hi ${hi}° Lo ${lo}° &nbsp; ${pr}%</span></li>`;
    }).join('');
    list.innerHTML = rows || `<li class="muted">No forecast.</li>`;
  }catch(e){
    console.error('weather error', e);
  }
}

/* ================ Data paint: Specials ================ */
async function paintSpecials(){
  const grid = $('#specialsGrid');
  if(!grid) return;

  try{
    const list = await fetch(PATH_SPECIALS, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    if(!list || !list.length){
      grid.innerHTML = `<div class="muted">No specials yet.</div>`;
      return;
    }
    grid.innerHTML = list.map(s => {
      const title = escapeHtml(s.title || `${s.biz||''} Special`);
      const biz = escapeHtml(s.biz || '');
      const area = escapeHtml(s.area || '');
      const when = escapeHtml(s.time || s.time_window || '');
      const link = s.link ? `<a href="${s.link}" target="_blank" rel="noopener">Details</a>` : '';
      return `<article class="card">
        <header><h3 class="tiny">${title}</h3></header>
        <div class="card-body">
          ${biz ? `<div class="small">${biz}${area? ' — '+area: ''}</div>` : ''}
          ${when ? `<div class="tiny muted">${when}</div>` : ''}
          <div class="mt-1">${link}</div>
        </div>
      </article>`;
    }).join('');
  }catch(e){
    console.error('specials error', e);
  }
}

/* ================ Data paint: Places (simple list) ================ */
async function paintPlaces(map){
  const ul = $('#placesList');
  const empty = $('#placesEmpty');
  if(!ul) return;

  try{
    const places = await fetch(PATH_PLACES, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    if(!places || !places.length){
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    ul.innerHTML = places.slice(0,8).map(p => {
      const n = escapeHtml(p.name||'Place');
      const a = escapeHtml(p.formatted_address || p.address || '');
      return `<li>${n}<div class="tiny muted">${a}</div></li>`;
    }).join('');

    // optional map markers
    if(map){
      places.slice(0,20).forEach(p => {
        if(typeof p.lat === 'number' && typeof p.lng === 'number'){
          L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<strong>${escapeHtml(p.name||'')}</strong>`);
        }
      });
    }
  }catch(e){
    console.error('places error', e);
  }
}

/* ================ Utilities ================ */
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ================ Boot ================ */
(async function boot(){
  setUpdated();

  const map = initMap();
  const nextIso = await paintUpcoming();
  await Promise.all([
    paintSchedule(),
    paintWeather(),
    paintSpecials(),
    paintPlaces(map),
  ]);

  // Re-stamp updated time each minute (optional)
  setInterval(setUpdated, 60*1000);
})();

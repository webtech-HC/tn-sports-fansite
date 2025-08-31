/* Fansite client (no bundler) — robust pathing for GitHub Pages subfolder */

/* ---------- paths ---------- */
const BASE = document.baseURI;                      // from <base href="/tn-sports-fansite/">
const url = (p) => new URL(p, BASE).toString();
const data = (name) => url(`data/${name}`);

/* ---------- el helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (d) => new Date(d);

/* ---------- live light ---------- */
function setLiveLight(status){
  const dot = $('#js-live-dot');
  dot.classList.remove('red','yellow','green');
  dot.classList.add(status);
}

/* ---------- meta + kickoff ---------- */
async function loadMeta(){
  try{
    const meta = await (await fetch(data('meta.json'), {cache:'no-store'})).json();
    $('#js-meta-updated').textContent = new Date(meta.lastUpdated).toLocaleString();
    return meta;
  }catch(e){
    $('#js-meta-updated').textContent = '—';
    return { team:'Tennessee', year:new Date().getFullYear() };
  }
}

/* ---------- next game ---------- */
async function loadNext(){
  try{
    const next = await (await fetch(data('next.json'), {cache:'no-store'})).json();
    // expected: { date, opponent, home, tv?, venue? } or {}
    if(!next || !next.date || !next.opponent){
      $('#js-next').innerHTML = `<p class="muted">No upcoming game found.</p><button class="btn small" disabled>Add to Calendar</button>`;
      setLiveLight('red');
      $('#js-kickoff-in').textContent = '—';
      return;
    }

    const dt = fmt(next.date);
    const now = new Date();

    // live state
    const minsToKick = Math.round((dt - now)/60000);
    if (minsToKick <= -240) setLiveLight('red');           // game finished fallback
    else if (minsToKick <= 0) setLiveLight('green');       // in progress / OT
    else if (minsToKick <= 720) setLiveLight('yellow');    // same day
    else setLiveLight('red');

    // countdown text
    const abs = Math.abs(minsToKick);
    const days = Math.floor(abs/1440), hrs = Math.floor((abs%1440)/60), mins = abs%60;
    $('#js-kickoff-in').textContent = (minsToKick>=0? 'in ' : '') + 
      `${days? days+'d ' : ''}${hrs? hrs+'h ' : ''}${mins}m`;

    // panel text
    const opp = next.opponent;
    const homeAway = next.home ? 'Home' : 'Away';
    const when = dt.toLocaleString(undefined, {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
    $('#js-next').innerHTML = `
      <p>Tennessee vs ${opp}</p>
      <p class="muted">${when} · ${homeAway}</p>
      <button class="btn small" id="js-add-to-calendar">Add to Calendar</button>
      <p class="micro muted">${next.venue ? ('Venue: ' + next.venue) : ''}</p>
    `;

    // calendar button
    $('#js-add-to-calendar').addEventListener('click', () => {
      const ics = [
        'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
        `DTSTART:${dt.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')}`,
        `DTEND:${new Date(dt.getTime()+3*3600e3).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')}`,
        `SUMMARY:Tennessee vs ${opp}`,
        `LOCATION:${next.venue || (next.home ? 'Neyland Stadium' : '')}`,
        'END:VEVENT','END:VCALENDAR'
      ].join('\r\n');
      const blob = new Blob([ics],{type:'text/calendar'});
      const a = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob), download:'tennessee.ics'});
      document.body.appendChild(a); a.click(); a.remove();
    });

  }catch(e){
    console.error('next.json error', e);
    setLiveLight('red');
  }
}

/* ---------- schedule ---------- */
async function loadSchedule(){
  let rows = [];
  try{
    const list = await (await fetch(data('schedule.json'), {cache:'no-store'})).json(); // array or []
    rows = Array.isArray(list) ? list : [];
  }catch(e){
    rows = [];
  }

  const TB = $('#js-schedule-body');
  TB.innerHTML = '';
  const render = (items) => {
    TB.insertAdjacentHTML('beforeend', items.map(g => {
      const dt = fmt(g.date);
      const ha = g.home ? 'H' : 'A';
      const res = g.result ?? '';
      return `<tr>
        <td>${dt.toLocaleDateString()}</td>
        <td>${g.opponent || '—'}</td>
        <td>${ha}</td>
        <td>${g.tv || '—'}</td>
        <td>${res}</td>
      </tr>`;
    }).join(''));
  };

  let shown = 0;
  const step = 3;
  const more = () => {
    render(rows.slice(shown, shown+step));
    shown += step;
    if (shown >= rows.length) $('#js-show-more').disabled = true;
  };
  $('#js-show-more').addEventListener('click', more);
  more(); // first render
}

/* ---------- weather (rail) ---------- */
async function loadWeather(){
  try{
    const w = await (await fetch(data('weather.json'), {cache:'no-store'})).json(); // [{date,hi,lo,precip}]
    const ul = $('#js-weather');
    ul.innerHTML = w.slice(0, 3).map(d => {
      const day = new Date(d.date).toLocaleDateString(undefined, {weekday:'short'});
      return `<li>${day} — Hi ${Math.round(d.hi)}° Lo ${Math.round(d.lo)}°  <span class="muted">${d.precip}%</span></li>`;
    }).join('');
  }catch(e){
    $('#js-weather').innerHTML = '<li class="muted">No forecast.</li>';
  }
}

/* ---------- map (rail) ---------- */
function initMap(){
  const el = $('#js-map');
  if(!el || !window.L) return;

  const map = L.map(el, {center:[35.954, -83.929], zoom: 13, zoomControl: false});
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);
}

/* ---------- specials ---------- */
async function loadSpecials(){
  try{
    const specials = await (await fetch(data('specials.json'), {cache:'no-store'})).json(); // []
    const host = $('#js-specials');
    if(!Array.isArray(specials) || specials.length === 0){
      host.innerHTML = '<p class="muted">No specials yet.</p>';
      return;
    }
    host.innerHTML = specials.map(s => `
      <div class="card small">
        <div class="card-b">
          <strong>${s.title}</strong>
          <div class="micro muted">${s.biz || ''} — ${s.area || ''} ${s.time ? ('• ' + s.time) : ''}</div>
          ${s.link ? `<a class="btn small" href="${s.link}" target="_blank" rel="noopener">Details</a>` : ''}
        </div>
      </div>
    `).join('');
  }catch(e){
    $('#js-specials').innerHTML = '<p class="muted">No specials yet.</p>';
  }
}

/* ---------- boot ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadMeta();
  await Promise.all([
    loadNext(),
    loadSchedule(),
    loadWeather(),
    loadSpecials()
  ]);
});

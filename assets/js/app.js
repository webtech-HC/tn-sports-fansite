/* eslint-disable no-console */
// Basic front-end data glue for TN Gameday Hub

const PATH_SCHEDULE = '/data/schedule.json';
const PATH_NEXT     = '/data/next.json';       // optional; derived from schedule if absent
const PATH_META     = '/data/meta.json';
const PATH_WEATHER  = '/data/weather.json';
const PATH_PLACES   = '/data/places.json';
const PATH_SPECIALS = '/data/specials.json';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

function fmtDate(d, withTime=false){
  const tz = window.__TZ__ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const o = withTime
    ? {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:tz}
    : {weekday:'short', month:'short', day:'numeric', timeZone:tz};
  return new Date(d).toLocaleString(undefined, o);
}
async function getJSON(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
  return r.json();
}

/* ---------- meta + updated clocks ---------- */
async function paintUpdated(){
  try{
    const meta = await getJSON(PATH_META);
    const ts = meta?.updated || meta?.ts || null;
    if(ts){
      $('#updatedMeta').textContent = fmtDate(ts, true);
      $('#updatedMetaInline').textContent = fmtDate(ts, true);
    }
  }catch(e){ console.warn('meta', e.message); }
}

/* ---------- schedule table + next game ---------- */
function normalizeGame(g){
  return {
    date: g.date || g.game_date || g.start,
    opponent: g.opponent || g.opp || g.away_team || g.home_team || 'Opponent',
    home: g.home ?? (g.location ? g.location.toLowerCase()==='home' : null),
    tv: g.tv || g.network || null,
    result: g.result ?? g.score ?? null,
    venue: g.venue || g.stadium || null,
  };
}

async function paintSchedule(){
  let list = [];
  try{
    list = (await getJSON(PATH_SCHEDULE)).map(normalizeGame);
  }catch(e){ console.warn('schedule', e.message); }

  // derive "next" if needed
  let next = null;
  try{
    next = normalizeGame(await getJSON(PATH_NEXT));
  }catch(e){
    const now = Date.now();
    next = list.find(x => new Date(x.date).getTime() >= now) || null;
  }

  // table (first N, expand on click)
  const tbody = $('#schedTbody');
  const renderRows = (rows) => rows.map(r => `
    <tr>
      <td>${fmtDate(r.date, true)}</td>
      <td>${r.opponent}</td>
      <td>${r.home === null ? '' : (r.home ? 'H' : 'A')}</td>
      <td>${r.tv ?? ''}</td>
      <td>${r.result ?? ''}</td>
    </tr>`).join('');

  const INITIAL = 3;
  let shown = INITIAL;
  tbody.innerHTML = renderRows(list.slice(0, shown));
  $('#showMore').onclick = () => {
    shown = Math.min(list.length, shown + 3);
    tbody.insertAdjacentHTML('beforeend', renderRows(list.slice(tbody.rows.length, shown)));
    if(shown >= list.length) $('#showMore').disabled = true;
  };

  // paint next/current
  if(next){
    const whenStr = fmtDate(next.date, true);
    $('#nextMatch').textContent = `Tennessee vs ${next.opponent}`;
    $('#nextWhen').textContent = whenStr;
    $('#nextVenue').textContent = next.venue ? `Venue: ${next.venue}` : '';

    // Add to calendar (ics)
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0','PRODID:-//Gameday Hub//TN//EN',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@tn-hub`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      `SUMMARY:Tennessee vs ${next.opponent}`,
      next.venue ? `LOCATION:${next.venue}` : '',
      `DTSTART:${new Date(next.date).toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      // assume ~3.5h game length
      `DTEND:${new Date(new Date(next.date).getTime()+3.5*60*60*1000).toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      'END:VEVENT','END:VCALENDAR'
    ].filter(Boolean).join('\n');
    const dl = (btn) => {
      const blob = new Blob([ics], {type:'text/calendar'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tennessee-game.ics'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    };
    $('#addToCalendar').onclick = () => dl();
    $('#addToCalendarTop').onclick = () => dl();

    // signal lamp + countdown
    paintSignal(next);
  }
}

function paintSignal(next){
  const lamp = $('#gameSignal');
  const kickoff = new Date(next.date).getTime();
  const gameMs = 3.5 * 60 * 60 * 1000;       // ~3.5h window
  const yellowWindowMs = 12 * 60 * 60 * 1000; // same day pregame

  const tick = () => {
    const now = Date.now();
    const diff = kickoff - now;

    // kickoff countdown text (top bar)
    const el = $('#kickoffClock');
    if(el){
      if(diff > 0){
        const hr = Math.floor(diff/3600000);
        const mn = Math.floor((diff%3600000)/60000);
        const sc = Math.floor((diff%60000)/1000);
        el.textContent = `Kickoff in ${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
      }else if(now < kickoff + gameMs){
        el.textContent = 'Kickoff: happening now';
      }else{
        el.textContent = 'Kickoff complete';
      }
    }

    lamp.classList.remove('red','yellow','green');
    if(now >= kickoff && now < kickoff + gameMs){
      lamp.classList.add('green');                 // in progress
      $('#scoreStatus').textContent = 'Game in progress.';
    }else if(diff > 0 && diff < yellowWindowMs){
      lamp.classList.add('yellow');                // game day, not started
      $('#scoreStatus').textContent = 'It’s gameday!';
    }else{
      lamp.classList.add('red');                   // not today / finished
      $('#scoreStatus').textContent = 'No game in progress.';
    }
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- weather (right rail) ---------- */
async function paintWeather(){
  try{
    const rows = await getJSON(PATH_WEATHER);
    const ul = $('#wxList'); if(!ul) return;
    ul.innerHTML = rows.slice(0,3).map(x => {
      const d = new Date(x.date);
      const wk = d.toLocaleDateString(undefined,{weekday:'short'});
      const hi = Math.round(x.hi), lo = Math.round(x.lo), pr = Math.round(x.precip);
      return `<li><strong style="width:2.2rem;display:inline-block">${wk}</strong>
              <span>Hi ${hi}° • Lo ${lo}°</span>
              <span class="muted" style="margin-left:auto">${pr}%</span></li>`;
    }).join('');
  }catch(e){ console.warn('weather', e.message); }
}

/* ---------- specials ---------- */
function normalizeSpecial(x){
  return {
    title: x.title || (x.deal_title ? x.deal_title + ' • Special' : 'Special'),
    biz: x.biz || x.business_name || '',
    area: x.area || '',
    link: x.link || x.url || '',
    note: x.note || ''
  };
}
async function paintSpecials(){
  const grid = $('#specialsGrid'); if(!grid) return;
  try{
    const list = (await getJSON(PATH_SPECIALS)).map(normalizeSpecial);
    grid.innerHTML = list.slice(0,12).map(s => `
      <div class="special">
        <h4 style="margin:.1rem 0 .2rem">${s.title}</h4>
        <div class="muted" style="font-size:.9rem">${[s.biz,s.area].filter(Boolean).join(' • ')}</div>
        ${s.link ? `<p style="margin:.4rem 0"><a href="${s.link}" target="_blank" rel="noopener">Details</a></p>` : ''}
        ${s.note ? `<p class="muted" style="margin:0">${s.note}</p>` : ''}
      </div>`).join('');
  }catch(e){
    grid.innerHTML = '<p class="muted">No specials yet.</p>';
  }
}

/* ---------- places (list only; map is separate) ---------- */
async function paintPlaces(){
  const grid = $('#placesGrid'); if(!grid) return;
  try{
    const list = await getJSON(PATH_PLACES);
    if(!list.length){ grid.innerHTML = '<p class="muted">We’ll add places soon—check back.</p>'; return; }
    grid.innerHTML = list.map(p => `
      <div class="place">
        <strong>${p.name ?? 'Place'}</strong>
        <div class="muted">${p.category ?? ''}</div>
        ${p.url ? `<div><a href="${p.url}" target="_blank" rel="noopener">Website</a></div>` : ''}
      </div>`).join('');
  }catch(e){ console.warn('places', e.message); }
}

/* ---------- map ---------- */
function initMap(){
  const el = $('#map'); if(!el || !window.L) return;
  const m = L.map(el, {scrollWheelZoom:false}).setView([35.955, -83.925], 13); // Knoxville
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap'
  }).addTo(m);
  // simple marker at Neyland
  L.marker([35.955, -83.925]).addTo(m).bindPopup('Neyland Stadium');
}

/* ---------- boot ---------- */
async function boot(){
  await Promise.all([
    paintUpdated(),
    paintSchedule(),
    paintWeather(),
    paintSpecials(),
    paintPlaces()
  ]);
  initMap();
}
document.addEventListener('DOMContentLoaded', boot);

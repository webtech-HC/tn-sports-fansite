// ======= Simple JSON-driven page logic (GitHub Pages-safe) =======

// Data paths (relative = works on GitHub Pages project sites)
const PATH_SCHEDULE = 'data/schedule.json';
const PATH_SPECIALS = 'data/specials.json';

// Helpers
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
const fmtDate = iso => new Date(iso).toLocaleDateString([], {month:'short', day:'numeric', weekday:'short'});
const fmtTime = iso => new Date(iso).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
const untilParts = (iso) => {
  const now = new Date(), then = new Date(iso);
  const ms = Math.max(0, then - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return {d,h,m,s};
};

async function fetchJSON(path, fallback = null){
  try{
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error(res.statusText);
    return await res.json();
  }catch(e){
    console.warn('Failed to fetch', path, e);
    return fallback;
  }
}

// Find the next upcoming game (>= now). If none, return the last game.
function pickNextGame(schedule){
  const now = Date.now();
  const sorted = [...schedule].sort((a,b)=> new Date(a.date) - new Date(b.date));
  const future = sorted.find(g => new Date(g.date).getTime() >= now);
  return future || sorted[sorted.length - 1] || null;
}

function paintQuick(game){
  if(!game) return;
  $("#qOpp").textContent  = game.opponent;
  $("#qDate").textContent = new Date(game.date).toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
  $("#qTime").textContent = fmtTime(game.date);
  $("#qVenue").textContent= game.venue || (game.home ? "Knoxville, TN" : "");
}

function tickCountdown(kickoffISO){
  if(!kickoffISO) return;
  const {d,h,m,s} = untilParts(kickoffISO);
  $("#miniDays").textContent  = pad(d);
  $("#miniHours").textContent = pad(h);
  $("#miniMins").textContent  = pad(m);
  $("#cdD").textContent = pad(d);
  $("#cdH").textContent = pad(h);
  $("#cdM").textContent = pad(m);
  $("#cdS").textContent = pad(s);
}

function paintSchedule(schedule){
  const tbody = $("#schBody");
  if(!tbody) return;
  const rows = schedule.map(g => `
    <tr>
      <td>${fmtDate(g.date)} ${fmtTime(g.date)}</td>
      <td>${g.opponent}</td>
      <td>${g.home ? "Home" : "Away"}</td>
      <td>${g.tv || "TBD"}</td>
      <td>${g.result ?? ""}</td>
    </tr>
  `).join("");
  tbody.innerHTML = rows;
}

function paintSpecials(list){
  const grid = $("#specialsGrid");
  if(!grid) return;
  grid.innerHTML = list.slice(0,6).map(x=> `
    <article class="sp">
      <h3>${x.title}</h3>
      <div class="meta">${x.biz} • ${x.area} • ${x.time}</div>
      <p><a href="${x.link}" target="_blank" rel="noopener">Details</a></p>
    </article>
  `).join("");
}

(async function init(){
  // Fallbacks (kept tiny)
  const FALLBACK_SCHEDULE = [
    {date:"2025-08-30T19:00:00-04:00", opponent:"Appalachian State", home:true, tv:"TBD", result:null, venue:"Knoxville, TN"},
    {date:"2025-09-06T20:00:00-04:00", opponent:"Chattanooga", home:true, tv:"TBD", result:null, venue:"Knoxville, TN"},
    {date:"2025-09-13T19:00:00-04:00", opponent:"at Oklahoma", home:false, tv:"TBD", result:null, venue:"Norman, OK"}
  ];
  const FALLBACK_SPECIALS = [
    {title:"Wings + Pitchers", biz:"Checkerboard Tavern", area:"The Strip", time:"4–7pm", link:"#"},
    {title:"Post-Game Pancakes", biz:"Old City Bakehouse", area:"Old City", time:"9:30pm–1am", link:"#"},
    {title:"Family Brunch", biz:"Market Square Café", area:"Downtown", time:"Sat–Sun", link:"#"},
    {title:"Pizza & Pitchers", biz:"Riverfront Pizza", area:"Downtown", time:"All day", link:"#"}
  ];

  const schedule = await fetchJSON(PATH_SCHEDULE, FALLBACK_SCHEDULE);
  const specials = await fetchJSON(PATH_SPECIALS, FALLBACK_SPECIALS);

  paintSchedule(schedule);
  paintSpecials(specials);

  const next = pickNextGame(schedule);
  paintQuick(next);
  tickCountdown(next?.date);
  setInterval(()=>tickCountdown(next?.date), 1000);
})();

(() => {
  const PATH_SCHEDULE = 'data/schedule.json';
  const PATH_NEXT     = 'data/next.json';
  const PATH_WEATHER  = 'data/weather.json';
  const PATH_PLACES   = 'data/places.json';
  const PATH_SPECIALS = 'data/specials.json';
  const PATH_META     = 'data/meta.json';

  const TZ = 'America/New_York';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const fmt = (d, opt) => new Date(d).toLocaleString('en-US', { timeZone: TZ, ...opt });

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }

  /* ---------- Upcoming + Countdown ---------- */
  async function paintUpcoming() {
    const data = await getJSON(PATH_NEXT);
    const elOpp = $('#opp');
    const elDT  = $('#dateTime');
    const elV   = $('#venue');
    const btn1  = $('#addToCalendar');
    const btn2  = $('#addToCalendar2');
    if (!data || !data.date) {
      if (elDT) elDT.textContent = 'TBD';
      return null;
    }

    const kickoffISO = data.date; // ISO canonical (UTC)
    const whenTxt = fmt(kickoffISO, { dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
    if (elOpp) elOpp.textContent = data.opponent || 'Opponent';
    if (elDT)  elDT.textContent  = whenTxt;
    if (elV)   elV.textContent   = data.venue || 'Knoxville, TN';

    const ics = makeICS({
      title: `Tennessee vs ${data.opponent || 'Opponent'}`,
      startISO: kickoffISO,
      durationMin: 210,
      location: data.venue || 'Knoxville, TN',
      description: 'Unofficial reminder from Gameday Hub',
    });
    const click = () => downloadICS(ics, 'tennessee-gameday.ics');
    btn1 && (btn1.onclick = click);
    btn2 && (btn2.onclick = click);

    startCountdown(kickoffISO);
    return kickoffISO;
  }

  function makeICS({ title, startISO, durationMin, location, description }) {
    const dt = new Date(startISO);
    const pad = n => `${n}`.padStart(2, '0');
    const toUTC = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const dtStart = toUTC(dt);
    const dtEnd   = toUTC(new Date(dt.getTime() + (durationMin||180)*60000));
    const esc = s => (s||'').replace(/([,;])/g, '\\$1');
    return [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gameday Hub//TN//EN',
      'BEGIN:VEVENT',
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${esc(title)}`,
      `LOCATION:${esc(location)}`,
      `DESCRIPTION:${esc(description)}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
  }

  function downloadICS(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function startCountdown(kickoffISO) {
    const el = $('#countdown');
    if (!el) return;
    const target = new Date(kickoffISO).getTime();
    const tick = () => {
      const now = Date.now();
      let diff = Math.max(0, target - now);
      const d = Math.floor(diff / 86400000); diff -= d*86400000;
      const h = Math.floor(diff / 3600000);  diff -= h*3600000;
      const m = Math.floor(diff / 60000);    diff -= m*60000;
      const s = Math.floor(diff / 1000);
      el.textContent = `Kickoff in ${d}d : ${String(h).padStart(2,'0')}h : ${String(m).padStart(2,'0')}m : ${String(s).padStart(2,'0')}s`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Schedule ---------- */
  async function paintSchedule() {
    const body = $('#scheduleBody');
    if (!body) return;
    const rows = await getJSON(PATH_SCHEDULE) || [];
    body.innerHTML = rows.map(x => {
      const ha = x.home === true ? 'H' : (x.home === false ? 'A' : '—');
      const tv = x.tv || '—';
      const res = x.result || '—';
      const dateTxt = x.date ? fmt(x.date, { month: 'short', day: '2-digit' }) : 'TBD';
      const opp = x.opponent || 'TBD';
      return `<tr><td>${dateTxt}</td><td>${opp}</td><td>${ha}</td><td>${tv}</td><td>${res}</td></tr>`;
    }).join('');
  }

  /* ---------- Weather ---------- */
  async function paintWeather() {
    const el = $('#wx');
    if (!el) return;
    const rows = await getJSON(PATH_WEATHER) || [];
    el.innerHTML = rows.map(x => {
      const day = x.date ? fmt(x.date, { weekday: 'short' }) : '—';
      const hi  = Number.isFinite(x.hi) ? Math.round(x.hi) : '—';
      const lo  = Number.isFinite(x.lo) ? Math.round(x.lo) : '—';
      const pr  = Number.isFinite(x.precip) ? `${Math.round(x.precip)}%` : '—';
      return `<li><b>${day}</b> <span>${hi}°</span> <span>${lo}°</span> <em>${pr}</em></li>`;
    }).join('');
  }

  /* ---------- Specials ---------- */
  function normalizeSpecial(x) {
    return {
      title: x.title || (x.deal_title ? x.deal_title + ' · Special' : 'Special'),
      s: x.biz || x.business_name || '',
      area: x.area || '',
      time: x.time_window || x.time || '',
      link: x.url || x.link || ''
    };
  }
  async function paintSpecials() {
    const grid = $('#specialsGrid');
    if (!grid) return;
    const list = await getJSON(PATH_SPECIALS) || [];
    grid.innerHTML = (list || []).slice(0, 6).map(o => {
      const s = normalizeSpecial(o);
      const meta = [s.s, s.area, s.time].filter(Boolean).join(' • ');
      const link = s.link ? `<a href="${s.link}" target="_blank" rel="noopener">Details</a>` : '';
      return `<article class="special">
        <h3>${s.title}</h3>
        <div class="meta">${meta}</div>
        ${link}
      </article>`;
    }).join('');
  }

  /* ---------- Map + Places ---------- */
  async function paintMap() {
    const el = $('#map');
    if (!el || !window.L) return;
    const KNOX = [35.9606, -83.9207];

    const map = L.map('map', { scrollWheelZoom: false }).setView(KNOX, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const places = await getJSON(PATH_PLACES) || [];
    places.forEach(p => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      const marker = L.marker([p.lat, p.lon]).addTo(map);
      const title = p.name || 'Place';
      const meta = [p.area, p.address].filter(Boolean).join('<br/>');
      const link = p.url ? `<br/><a href="${p.url}" target="_blank" rel="noopener">Website</a>` : '';
      marker.bindPopup(`<b>${title}</b><br/>${meta}${link}`);
    });
  }

  /* ---------- Data updated meta ---------- */
  async function paintMeta() {
    const el = $('#dataUpdated');
    if (!el) return;
    const meta = await getJSON(PATH_META);
    if (!meta?.lastUpdated) { el.textContent = '—'; return; }
    try {
      el.textContent = fmt(meta.lastUpdated, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      el.textContent = meta.lastUpdated;
    }
  }

  /* ---------- Boot ---------- */
  async function boot() {
    await Promise.all([
      paintUpcoming(),
      paintSchedule(),
      paintWeather(),
      paintSpecials(),
      paintMap(),
      paintMeta(),
    ]);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

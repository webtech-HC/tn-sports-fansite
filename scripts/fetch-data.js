/* Fetch & build JSON for the site.
   Providers:
   - CollegeFootballData (schedule/next)
   - Open-Meteo (3-day forecast for Knoxville)
   - Foursquare (sample nearby places)
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const SCHEMA_DIR = path.join(DATA_DIR, 'schemas'); // not required here, just convention

const CFBD_API_KEY = process.env.CFBD_API_KEY || '';
const FSQ_API_KEY  = process.env.FSQ_API_KEY  || '';

const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const KNOX = { lat: 35.9606, lon: -83.9207 };
const TZ = 'America/New_York';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const writeJSON = (file, data) =>
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n');

async function http(url, opt = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, opt);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/* ---------- Helpers to enforce success ---------- */
async function must(fn, label) {
  const out = await fn().catch(err => {
    console.error(`[${label}]`, err);
    throw err;
  });
  if (!out || (Array.isArray(out) && out.length === 0)) {
    throw new Error(`[${label}] returned no data`);
  }
  return out;
}

/* ---------- CFBD: schedule + next ---------- */
async function fetchScheduleCFBD() {
  const url = `https://api.collegefootballdata.com/games?year=${YEAR}&team=Tennessee&seasonType=regular`;
  const data = await http(url, { headers: { Authorization: `Bearer ${CFBD_API_KEY}` } });
  // Normalize minimal shape used by the site
  const rows = (data || []).map(g => ({
    date: g.start_date || g.startDate || g.start_time_tbd ? null : g.start_date, // some fields vary
    opponent: g.home_team === 'Tennessee' ? g.away_team : g.home_team,
    home: g.home_team === 'Tennessee' ? true : (g.away_team === 'Tennessee' ? false : null),
    tv: g.tv || null,
    result: g.home_points != null && g.away_points != null
      ? `${g.home_points}-${g.away_points}`
      : null,
    venue: g.venue || null,
  })).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  return rows;
}

function computeNext(rows) {
  const now = Date.now();
  const upcoming = rows.find(r => r.date && new Date(r.date).getTime() > now);
  if (!upcoming) return null;
  return {
    date: new Date(upcoming.date).toISOString(), // canonical
    opponent: upcoming.opponent || null,
    home: upcoming.home ?? null,
    tv: upcoming.tv ?? null,
    result: upcoming.result ?? null,
    venue: upcoming.venue || 'Neyland Stadium',
  };
}

/* ---------- Open-Meteo: 3-day ---------- */
async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${KNOX.lat}&longitude=${KNOX.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=${encodeURIComponent(TZ)}`;
  const wx = await http(url);
  const rows = (wx.daily?.time || []).slice(0, 3).map((_, i) => ({
    date: wx.daily.time?.[i] ?? null,
    hi: Number.isFinite(wx.daily.temperature_2m_max?.[i]) ? wx.daily.temperature_2m_max[i] : null,
    lo: Number.isFinite(wx.daily.temperature_2m_min?.[i]) ? wx.daily.temperature_2m_min[i] : null,
    precip: Number.isFinite(wx.daily.precipitation_probability_max?.[i]) ? wx.daily.precipitation_probability_max[i] : null,
  }));
  return rows;
}

/* ---------- Foursquare: sample places ---------- */
async function fetchFoursquare() {
  if (!FSQ_API_KEY) return [];
  const url = new URL('https://api.foursquare.com/v3/places/search');
  url.searchParams.set('ll', `${KNOX.lat},${KNOX.lon}`);
  url.searchParams.set('radius', '4000');
  url.searchParams.set('limit', '20');
  url.searchParams.set('categories', '13065,13032,13034'); // restaurants, bars, cafes
  url.searchParams.set('fields', 'fsq_id,name,location,geocodes,website,link');

  const data = await http(url.toString(), {
    headers: { Authorization: FSQ_API_KEY, accept: 'application/json' }
  });

  const rows = (data.results || []).map(it => ({
    name: it.name || null,
    area: it.location?.neighborhood?.[0] || it.location?.locality || null,
    address: it.location?.formatted_address || null,
    lat: Number(it.geocodes?.main?.latitude) || null,
    lon: Number(it.geocodes?.main?.longitude) || null,
    url: it.website || it.link || null
  })).filter(p => p.name);

  return rows;
}

/* ---------- Main ---------- */
(async () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const schedule = await must(fetchScheduleCFBD, 'CFBD');
  const next = computeNext(schedule);
  const weather = await must(fetchWeather, 'Open-Meteo');
  const places = await fetchFoursquare().catch(() => []);

  // Specials are community-provided; keep file if exists, otherwise seed empty array
  let specials = [];
  try {
    specials = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'specials.json'), 'utf8'));
    if (!Array.isArray(specials)) specials = [];
  } catch { specials = []; }

  // Write files
  writeJSON('schedule.json', schedule);
  writeJSON('next.json', next || {});
  writeJSON('weather.json', weather);
  writeJSON('places.json', places);

  // meta for "data updated"
  writeJSON('meta.json', {
    lastUpdated: new Date().toISOString(),
    providers: ['CollegeFootballData', 'Open-Meteo', 'Foursquare'],
    year: YEAR
  });

  console.log('DONE: ',
    `schedule=${schedule.length}`,
    `next=${next ? '1' : 'none'}`,
    `weather=${weather.length}`,
    `places=${places.length}`,
    `specials=${specials.length}`
  );
})().catch(e => { console.error(e); process.exitCode = 1; });

const fs   = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');

const TEAM = 'Tennessee';
const KNOX = { lat: 35.9606, lon: -83.9207 };

// ----------------- util -----------------
const writeJSON = (name, obj) =>
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

const toISO = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d.toISOString();
};

async function fetchJSON(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// ----------------- CFBD schedule -----------------
async function buildSchedule(year, team) {
  const url = `https://api.collegefootballdata.com/games?year=${year}&team=${encodeURIComponent(team)}&seasonType=regular`;

  const rows = await fetchJSON(url, {
    headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}` }
  });

  const mapped = rows.map(g => {
    const isHome   = g.home_team === team;
    const opponent = isHome ? g.away_team : g.home_team;
    const iso      = toISO(g.start_date || g.startDate); // CFBD uses start_date

    // result if final
    let result = null;
    const hp = g.home_points;
    const ap = g.away_points;
    if (Number.isFinite(hp) && Number.isFinite(ap)) {
      const forUs   = isHome ? hp : ap;
      const against = isHome ? ap : hp;
      result = `${forUs}-${against}`;
    }

    return {
      date: iso,                          // must be ISO to satisfy schema
      opponent,
      home: isHome,
      tv: g.tv || null,
      result,
      venue: g.venue || null
    };
  });

  // Keep ONLY games that have a real kickoff time (no placeholders)
  return mapped
    .filter(g => !!g.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeNext(schedule) {
  const now = Date.now();
  const upcoming = schedule
    .map(g => ({ ...g, t: Date.parse(g.date) }))
    .filter(g => Number.isFinite(g.t) && g.t > now)
    .sort((a, b) => a.t - b.t)[0];

  if (!upcoming) return {};
  const { date, opponent, home, tv, result, venue } = upcoming;
  return { date, opponent, home, tv: tv ?? null, result: result ?? null, venue: venue ?? null };
}

// ----------------- Open-Meteo (3-day) -----------------
async function buildWeather(lat = KNOX.lat, lon = KNOX.lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=` +
    `temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&timezone=UTC`;
  const j = await fetchJSON(url);
  const out = (j.daily?.time || []).map((d, i) => ({
    date: d, // YYYY-MM-DD (schema "date")
    hi: j.daily.temperature_2m_max?.[i] ?? null,
    lo: j.daily.temperature_2m_min?.[i] ?? null,
    precip: j.daily.precipitation_sum?.[i] ?? null
  }));
  return out;
}

// ----------------- Foursquare Places -----------------
const FSQ_HEADERS = () => ({
  Authorization: process.env.FSQ_API_KEY,
  accept: 'application/json'
});

async function fsqSearch({ query, lat = KNOX.lat, lon = KNOX.lon, radius = 6000, limit = 20 }) {
  const url =
    `https://api.foursquare.com/v3/places/search?` +
    `query=${encodeURIComponent(query)}&ll=${lat},${lon}&radius=${radius}&sort=POPULARITY&limit=${limit}`;

  const j = await fetchJSON(url, { headers: FSQ_HEADERS() });
  return Array.isArray(j.results) ? j.results : [];
}

// Best-at-gameday buckets to cover different scenes
const FSQ_QUERIES = [
  'sports bar', 'bar', 'bbq', 'wings', 'pizza', 'brewery',
  'brunch', 'breakfast', 'coffee'
];

function pickArea(loc = {}) {
  // Prefer neighborhood; fall back to cross street or locality; null is allowed per schema
  return (Array.isArray(loc.neighborhood) && loc.neighborhood[0]) ||
         loc.cross_street || loc.locality || null;
}

function fsqToPlace(p) {
  const loc = p.location || {};
  const main = p.geocodes?.main || {};
  const url = p.website || p.link || (p.fsq_id ? `https://foursquare.com/v/${p.fsq_id}` : null);

  // place.schema.json requires name; others may be null and still validate
  return {
    name: p.name,
    area: pickArea(loc),
    address: loc.formatted_address || [loc.address, loc.locality].filter(Boolean).join(', ') || null,
    lat: Number.isFinite(main.latitude) ? main.latitude : null,
    lon: Number.isFinite(main.longitude) ? main.longitude : null,
    url: url || null
  };
}

async function buildPlaces() {
  if (!process.env.FSQ_API_KEY) return [];
  const seen = new Set();
  const out = [];

  // Query in parallel, then merge deterministically (query order matters a bit)
  const results = await Promise.all(FSQ_QUERIES.map(q => fsqSearch({ query: q })));

  for (const list of results) {
    for (const r of list) {
      const id = r.fsq_id || `${r.name}|${r.location?.formatted_address || ''}`;
      if (seen.has(id)) continue;
      seen.add(id);

      // Skip obvious outliers far away (> 25km) if Foursquare returns them
      const dLat = (r.geocodes?.main?.latitude ?? KNOX.lat) - KNOX.lat;
      const dLon = (r.geocodes?.main?.longitude ?? KNOX.lon) - KNOX.lon;
      const approxKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111;
      if (approxKm > 25) continue;

      out.push(fsqToPlace(r));
      if (out.length >= 40) break; // cap
    }
    if (out.length >= 40) break;
  }

  return out;
}

// ----------------- main -----------------
(async () => {
  const YEAR = new Date().getUTCFullYear();

  const [schedule, weather, places] = await Promise.all([
    buildSchedule(YEAR, TEAM).catch(e => { console.error('schedule:', e.message); return []; }),
    buildWeather().catch(e => { console.error('weather:', e.message); return []; }),
    buildPlaces().catch(e => { console.error('places:', e.message); return []; }),
  ]);

  const next = computeNext(schedule);

  writeJSON('schedule.json', schedule);
  writeJSON('next.json', Object.keys(next).length ? next : {}); // {} if none upcoming
  writeJSON('weather.json', weather);
  writeJSON('places.json', places);

  writeJSON('meta.json', {
    lastUpdated: new Date().toISOString(),
    providers: { schedule: "CollegeFootballData", weather: "Open-Meteo", places: "Foursquare" },
    year: YEAR
  });

  console.log('done', {
    schedule: schedule.length,
    next: Object.keys(next).length ? next.date : 'none',
    weather: weather.length,
    places: places.length
  });
})().catch(e => { console.error(e); process.exitCode = 1; });

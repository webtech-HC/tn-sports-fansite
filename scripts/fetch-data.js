/**
 * Fetches live JSON and writes to /data/*.json
 * - next.json (single object)
 * - schedule.json (array)
 * - weather.json (3-day)
 * - places.json (list)
 *
 * Requires:
 *  - secrets.CFBD_API_KEY (CollegeFootballData)
 *  - secrets.FSQ_API_KEY  (Foursquare Places)
 */
const fs = require('fs');
const path = require('path');
const fetch = global.fetch;

const OUT = p => path.join(process.cwd(), 'data', p);
const writePretty = obj => JSON.stringify(obj, null, 2) + '\n';
async function writeIfChanged(file, data) {
  const next = writePretty(data);
  let current = '';
  try { current = fs.readFileSync(file, 'utf8'); } catch {}
  if (current !== next) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
    console.log('✍️  wrote', path.basename(file));
  } else {
    console.log('• unchanged', path.basename(file));
  }
}

const KNOX = { lat: 35.9606, lng: -83.9207, tz: 'America/New_York' };
const TEAM = 'Tennessee';

async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/* ---------------- Schedule / Next (CFBD) ---------------- */
async function fetchSchedule() {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY missing');
  const year = new Date().getFullYear();

  const url = `https://api.collegefootballdata.com/games?year=${year}&team=${encodeURIComponent(TEAM)}&seasonType=both`;
  const games = await getJSON(url, { headers: { Authorization: `Bearer ${key}` } });

  const mapped = games
    .filter(g => g.start_date) // sanity
    .map(g => {
      const isHome = g.home_team?.toLowerCase().includes('tennessee');
      const opponent = isHome ? g.away_team : g.home_team;
      const res = (Number.isFinite(g.home_points) && Number.isFinite(g.away_points))
        ? `${g.home_points}-${g.away_points}`
        : null;

      return {
        date: new Date(g.start_date).toISOString(),
        opponent,
        home: isHome,
        tv: g.tv || null,
        result: res,
        venue: g.venue || null,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const now = new Date();
  const next = mapped.find(g => new Date(g.date) > now) || mapped[mapped.length - 1] || null;

  await writeIfChanged(OUT('schedule.json'), mapped);
  await writeIfChanged(OUT('next.json'), next || {});
}

/* ---------------- Weather (Open-Meteo) ---------------- */
async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${KNOX.lat}&longitude=${KNOX.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean&timezone=${encodeURIComponent(KNOX.tz)}&forecast_days=3`;
  const j = await getJSON(url);
  const daily = (j.daily?.time || []).map((date, i) => ({
    date,
    hi: j.daily.temperature_2m_max[i],
    lo: j.daily.temperature_2m_min[i],
    precip: j.daily.precipitation_probability_mean[i],
  }));
  await writeIfChanged(OUT('weather.json'), daily);
}

/* ---------------- Nearby places (Foursquare Places) ---------------- */
async function fetchPlaces() {
  const key = process.env.FSQ_API_KEY;
  if (!key) {
    console.warn('FSQ_API_KEY missing — leaving places.json unchanged (or empty array)');
    try { fs.accessSync(OUT('places.json')); }
    catch { await writeIfChanged(OUT('places.json'), []); }
    return;
  }

  // Restaurants, Bars, Coffee (categories)
  const categories = ['13065','13032','13034']; // restaurant, bar, coffee-shop
  const url = `https://api.foursquare.com/v3/places/search?ll=${KNOX.lat},${KNOX.lng}&radius=4000&limit=20&categories=${categories.join(',')}`;

  const j = await getJSON(url, { headers: { Authorization: key, Accept: 'application/json' } });
  const items = (j.results || []).map(p => ({
    name: p.name,
    formatted_address: p.location?.formatted_address || '',
    lat: p.geocodes?.main?.latitude ?? null,
    lng: p.geocodes?.main?.longitude ?? null,
  })).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');

  await writeIfChanged(OUT('places.json'), items);
}

/* ---------------- Run all ---------------- */
(async () => {
  try {
    await Promise.allSettled([fetchSchedule(), fetchWeather(), fetchPlaces()]);
    console.log('Done.');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
})();

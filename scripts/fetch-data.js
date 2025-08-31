/* eslint-disable no-console */
/**
 * Fetch live data for the TN fansite and write JSON files in /data.
 *  - Schedule & next game: CollegeFootballData
 *  - Weather (3-day): Open-Meteo
 *  - Places (sample pins): Foursquare Places
 *
 * ENV required in CI:
 *   CFBD_API_KEY  – CollegeFootballData API key (Bearer)
 *   FSQ_API_KEY   – Foursquare Places API key (v3)
 *
 * Node 20+ (global fetch).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT  = path.join(ROOT, 'data');

const TEAM_NAME = 'Tennessee';
const TEAM_SLUG = 'Tennessee'; // CFBD team parameter

// Knoxville, TN (approx Neyland Stadium)
const KNOX = { lat: 35.955, lon: -83.925 };

// --- helpers ---------------------------------------------------------------

function writeJSON(file, data) {
  const dst = path.join(OUT, file);
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(dst, json, 'utf8');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function toISO(d) {
  return new Date(d).toISOString();
}

function toISODateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function pick(a, b) {
  return a ?? b ?? null;
}

// --- CFBD schedule ---------------------------------------------------------

async function fetchSchedule(year) {
  const base =
    'https://api.collegefootballdata.com/games?seasonType=regular';
  const url = `${base}&year=${encodeURIComponent(year)}&team=${encodeURIComponent(
    TEAM_SLUG
  )}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}` },
  }).catch(() => null);

  if (!res || !res.ok) {
    throw new Error(`CFBD schedule failed (${res && res.status})`);
  }
  const rows = await res.json();

  // Normalize to the UI shape
  const list = rows
    .map((g) => {
      const start =
        g.start_date || g.startDate || g.start_time_tbd || g.startTimeTBD
          ? g.start_date || g.startDate || g.start_time_tbd || g.startTimeTBD
          : g.start_date;

      const homeTeam = g.home_team || g.homeTeam;
      const awayTeam = g.away_team || g.awayTeam;

      // Is Tennessee home?
      const isHome = homeTeam && homeTeam.toLowerCase().includes('tennessee');

      // Opponent name
      const opponent = isHome ? awayTeam : homeTeam;

      // TV network (best effort across fields)
      const tv =
        g.tv || g.network || (g.broadcast && g.broadcast.network) || null;

      // Score & result
      const hp = pick(g.home_points, g.homePoints);
      const ap = pick(g.away_points, g.awayPoints);
      let result = null;
      if (typeof hp === 'number' && typeof ap === 'number') {
        result = isHome ? `${hp}-${ap}` : `${ap}-${hp}`;
      }

      // Venue
      const venue =
        g.venue || g.venue_name || (g.venue && g.venue.name) || null;

      // Date
      const dt =
        g.start_date || g.startDate || g.date || g.start_time || g.startTime;
      const when = dt ? new Date(dt) : null;

      return {
        date: when ? toISO(when) : null,
        opponent: opponent || null,
        home: isHome === true ? true : isHome === false ? false : null,
        tv: tv || null,
        result,
        venue,
      };
    })
    .filter((x) => x.date && x.opponent);

  // sort ascending by date
  list.sort((a, b) => new Date(a.date) - new Date(b.date));
  return list;
}

function computeNext(list) {
  const now = new Date();
  const upcoming = list.find((g) => new Date(g.date) > now && !g.result);
  if (!upcoming) {
    // if nothing upcoming, take the most recent (for countdown) or null
    const last = list[list.length - 1] || null;
    return last
      ? {
          date: last.date,
          home: last.home,
          tv: last.tv || null,
          result: last.result || null,
          venue: last.venue || null,
        }
      : null;
  }
  return {
    date: upcoming.date,
    home: upcoming.home,
    tv: upcoming.tv || null,
    result: null,
    venue: upcoming.venue || null,
  };
}

// --- Weather (Open-Meteo) --------------------------------------------------

async function fetchWeather({ lat, lon }) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=America/New_York&forecast_days=3`;

  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) throw new Error(`Open-Meteo failed`);

  const data = await res.json();
  const out = [];
  const days = data.daily || {};
  const n = Math.min(
    (days.time || []).length,
    (days.temperature_2m_max || []).length,
    (days.temperature_2m_min || []).length,
    (days.precipitation_probability_max || []).length
  );
  for (let i = 0; i < n; i += 1) {
    out.push({
      date: toISO(days.time[i]),
      hi: days.temperature_2m_max[i],
      lo: days.temperature_2m_min[i],
      precip: days.precipitation_probability_max[i],
    });
  }
  return out;
}

// --- Foursquare places (sample pins) ---------------------------------------

async function fetchPlaces({ lat, lon }) {
  const url =
    `https://api.foursquare.com/v3/places/search?` +
    `ll=${lat}%2C${lon}&radius=4000&limit=12&sort=DISTANCE&` +
    // preference for brunch/breakfast/bars near campus
    `categories=13065,13032,13003,13035`;

  const res = await fetch(url, {
    headers: { Authorization: process.env.FSQ_API_KEY },
  }).catch(() => null);

  if (!res || !res.ok) {
    console.warn(`Foursquare failed (${res && res.status}); writing empty list.`);
    return [];
  }

  const data = await res.json();
  const items = Array.isArray(data.results) ? data.results : [];

  return items.map((x) => {
    const loc = x.location || {};
    const area =
      (loc.neighborhood && loc.neighborhood[0]) ||
      loc.locality ||
      'Knoxville';
    const cat = (x.categories && x.categories[0] && x.categories[0].name) || '';
    return {
      name: x.name || 'Place',
      area,
      type: cat || null,
      url: (x.website && String(x.website)) || null,
      lat: x.geocodes && x.geocodes.main && x.geocodes.main.latitude,
      lon: x.geocodes && x.geocodes.main && x.geocodes.main.longitude,
    };
  });
}

// --- run -------------------------------------------------------------------

(async () => {
  try {
    ensureDir(OUT);

    const now = new Date();
    const year = now.getUTCFullYear();

    const [schedule, weather, places] = await Promise.all([
      fetchSchedule(year),
      fetchWeather(KNOX),
      fetchPlaces(KNOX),
    ]);

    const next = computeNext(schedule);

    // Specials are community-submitted; keep existing file if present
    const specialsPath = path.join(OUT, 'specials.json');
    if (!fs.existsSync(specialsPath)) writeJSON('specials.json', []);

    // Meta
    const meta = {
      lastUpdated: toISO(now),
      providers: { schedule: 'CollegeFootballData', weather: 'Open-Meteo', places: 'Foursquare' },
      team: TEAM_NAME,
      year,
    };

    // Write all outputs
    writeJSON('schedule.json', schedule);
    writeJSON('next.json', next || {});
    writeJSON('weather.json', weather);
    writeJSON('places.json', places);
    writeJSON('meta.json', meta);

    console.log('Done.');
    console.log({
      schedule: schedule.length,
      next: !!next,
      weather: weather.length,
      places: places.length,
    });
  } catch (err) {
    console.error('fetch-data.js error:', err.message || err);
    process.exitCode = 1;
  }
})();

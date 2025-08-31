/* eslint-disable no-console */
/**
 * Validate /data JSON files using AJV.
 * Uses inline schemas that match what the UI (app.js) consumes.
 * Requires: ajv, ajv-formats
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');

function readJSON(file) {
  const p = path.join(DATA, file);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ----- Schemas that mirror app.js expectations -----------------------------

const scheduleSchema = {
  $id: 'scheduleSchema',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['date', 'opponent'],
    properties: {
      date: { type: 'string', format: 'date-time' },
      opponent: { type: 'string', minLength: 1 },
      home: { type: ['boolean', 'null'] },
      tv: { type: ['string', 'null'] },
      result: { type: ['string', 'null'] },
      venue: { type: ['string', 'null'] },
    },
  },
};

const nextSchema = {
  $id: 'nextSchema',
  type: 'object',
  additionalProperties: false,
  required: ['date'],
  properties: {
    date: { type: 'string', format: 'date-time' },
    home: { type: ['boolean', 'null'] },
    tv: { type: ['string', 'null'] },
    result: { type: ['string', 'null'] },
    venue: { type: ['string', 'null'] },
  },
};

const weatherSchema = {
  $id: 'weatherSchema',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['date', 'hi', 'lo', 'precip'],
    properties: {
      date: { type: 'string', format: 'date-time' },
      hi: { type: 'number' },
      lo: { type: 'number' },
      precip: { type: 'number' },
    },
  },
};

const placesSchema = {
  $id: 'placesSchema',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
      area: { type: ['string', 'null'] },
      type: { type: ['string', 'null'] },
      url: { type: ['string', 'null'], format: 'uri' },
      lat: { type: ['number', 'null'] },
      lon: { type: ['number', 'null'] },
    },
  },
};

// specials are loose: allow either v1 {title, biz?, area?, time?, link?}
// or v2 {deal_title, business_name?, area?, time_window?, url?}
const specialsSchema = {
  $id: 'specialsSchema',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    anyOf: [
      {
        required: ['title'],
        properties: {
          title: { type: 'string' },
          biz: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          link: { type: ['string', 'null'], format: 'uri' },
        },
      },
      {
        required: ['deal_title'],
        properties: {
          deal_title: { type: 'string' },
          business_name: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
          time_window: { type: ['string', 'null'] },
          url: { type: ['string', 'null'], format: 'uri' },
        },
      },
    ],
  },
};

const metaSchema = {
  $id: 'metaSchema',
  type: 'object',
  additionalProperties: true,
  required: ['lastUpdated'],
  properties: {
    lastUpdated: { type: 'string', format: 'date-time' },
    providers: { type: 'object' },
    team: { type: 'string' },
    year: { type: 'number' },
  },
};

ajv.addSchema(scheduleSchema);
ajv.addSchema(nextSchema);
ajv.addSchema(weatherSchema);
ajv.addSchema(placesSchema);
ajv.addSchema(specialsSchema);
ajv.addSchema(metaSchema);

// ----- Validate all files ---------------------------------------------------

const files = [
  { file: 'schedule.json', schema: 'scheduleSchema' },
  { file: 'next.json', schema: 'nextSchema' },
  { file: 'weather.json', schema: 'weatherSchema' },
  { file: 'places.json', schema: 'placesSchema' },
  { file: 'specials.json', schema: 'specialsSchema' },
  { file: 'meta.json', schema: 'metaSchema' },
];

(async () => {
  let failed = 0;

  for (const { file, schema } of files) {
    try {
      const data = readJSON(file);
      const validate = ajv.getSchema(schema);
      const ok = validate(data);

      if (!ok) {
        failed += 1;
        console.error(`❌ ${file} failed validation.`);
        console.error(validate.errors);
      } else {
        console.log(`✅ ${file} valid.`);
      }
    } catch (err) {
      failed += 1;
      console.error(`❌ ${file} error:`, err.message || err);
    }
  }

  // Cross-check: next.date should match some schedule date (YYYY-MM-DD)
  try {
    const next = readJSON('next.json');
    const sched = readJSON('schedule.json');
    if (next && next.date && Array.isArray(sched)) {
      const d0 = toISODateOnly(new Date(next.date));
      const hit = sched.some((g) => toISODateOnly(new Date(g.date)) === d0);
      if (!hit) {
        failed += 1;
        console.error(
          `❌ cross-check: next.json date (${d0}) not found in schedule.json`
        );
      } else {
        console.log('🔗 cross-check ok: next.date matches schedule.');
      }
    }
  } catch (e) {
    failed += 1;
    console.error('❌ cross-check failed:', e.message || e);
  }

  if (failed) {
    console.error(`\nValidation failed with ${failed} error(s).`);
    process.exit(1);
  } else {
    console.log('\nAll data files valid.');
  }
})();

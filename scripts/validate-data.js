// scripts/validate-data.js
// Validate JSON in /data against /data/schemas using AJV

const path = require('node:path');
const fs = require('node:fs');

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const SCHEMA_DIR = path.join(DATA_DIR, 'schemas');

const MAP = [
  { file: 'schedule.json', schema: 'schedule.schema.json' },
  { file: 'weather.json',  schema: 'weather.schema.json'  },
  { file: 'places.json',   schema: 'places.schema.json'   },
  { file: 'specials.json', schema: 'specials.schema.json' },
  { file: 'meta.json',     schema: 'meta.schema.json'     },
  { file: 'next.json',     schema: 'next.schema.json'     },
];

function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

(async () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);

  // Preload referenced schemas (so $ref will resolve)
  const preload = [
    'game.schema.json',
    'place.schema.json',
    'special.schema.json'
  ];
  for (const name of preload) {
    const schema = readJSON(path.join(SCHEMA_DIR, name));
    ajv.addSchema(schema, schema.$id || name);
  }

  let failed = 0;

  for (const { file, schema } of MAP) {
    const schemaPath = path.join(SCHEMA_DIR, schema);
    const dataPath   = path.join(DATA_DIR, file);

    let schemaObj;
    try {
      schemaObj = readJSON(schemaPath);
    } catch (e) {
      failed++;
      console.error(`Schema load failed: ${schema} → ${e.message}`);
      continue;
    }

    let data;
    try {
      data = readJSON(dataPath);
    } catch (e) {
      failed++;
      console.error(`Data read failed: ${file} → ${e.message}`);
      continue;
    }

    const validate = ajv.compile(schemaObj);
    const ok = validate(data);
    if (!ok) {
      failed++;
      console.error(`❌ ${file} failed:`, validate.errors);
    } else {
      console.log(`✅ ${file} valid.`);
    }
  }

  if (failed) {
    console.error(`Validation failed (${failed} file${failed === 1 ? '' : 's'}).`);
    process.exit(1);
  } else {
    console.log('All data files valid.');
  }
})();

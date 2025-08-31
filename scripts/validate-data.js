/* Validate data files against JSON Schemas with AJV */
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const SCHEMA_DIR = path.join(DATA_DIR, 'schemas');

const MAP = [
  { file: 'schedule.json', schema: 'schedule.schema.json' },
  { file: 'weather.json',  schema: 'weather.schema.json'  },
  { file: 'specials.json', schema: 'specials.schema.json' },
  { file: 'places.json',   schema: 'places.schema.json'   },
  { file: 'next.json',     schema: 'next.schema.json'     },
  { file: 'meta.json',     schema: 'meta.schema.json'     },
];

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function pretty(errors = []) {
  return errors.map(e => `${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`).join('\n');
}

(async () => {
  // pre-add referenced schemas (by name)
  for (const entry of fs.readdirSync(SCHEMA_DIR)) {
    if (!entry.endsWith('.schema.json')) continue;
    try {
      const sch = readJSON(path.join(SCHEMA_DIR, entry));
      if (sch && sch.$id) ajv.addSchema(sch, sch.$id);
    } catch {}
  }

  let failed = false;

  for (const { file, schema } of MAP) {
    const schemaPath = path.join(SCHEMA_DIR, schema);
    const dataPath = path.join(DATA_DIR, file);

    if (!fs.existsSync(dataPath)) {
      console.error(`❌ Missing data file: ${file}`);
      failed = true;
      continue;
    }
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Missing schema file: ${schema}`);
      failed = true;
      continue;
    }

    const sch = readJSON(schemaPath);
    const validate = ajv.compile(sch);
    const data = readJSON(dataPath);
    const ok = validate(data);

    if (!ok) {
      console.error(`❌ ${file} failed:\n${pretty(validate.errors)}\n`);
      failed = true;
    } else {
      console.log(`✅ ${file} valid`);
    }
  }

  if (failed) {
    console.error('Validation failed.');
    process.exitCode = 1;
  } else {
    console.log('All data files valid.');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

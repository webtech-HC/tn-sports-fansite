
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const root = process.cwd();
const schemaDir = path.join(root, 'data', 'schemas');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const schemas = {
  next:      read(path.join(schemaDir, 'next.schema.json')),
  schedule:  read(path.join(schemaDir, 'schedule.schema.json')),
  weather:   read(path.join(schemaDir, 'weather.schema.json')),
  places:    read(path.join(schemaDir, 'places.schema.json')),
  specials:  read(path.join(schemaDir, 'specials.schema.json')),
};

Object.values(schemas).forEach(s => ajv.addSchema(s));

const checks = [
  { file: 'data/next.json',     schema: 'next.schema.json' },
  { file: 'data/schedule.json', schema: 'schedule.schema.json' },
  { file: 'data/weather.json',  schema: 'weather.schema.json' },
  { file: 'data/places.json',   schema: 'places.schema.json' },
  { file: 'data/specials.json', schema: 'specials.schema.json' },
];

let failed = false;

for (const { file, schema } of checks) {
  if (!fs.existsSync(file)) {
    console.warn(`[warn] ${file} missing — skipping`);
    continue;
  }
  const data = read(file);
  const validate = ajv.getSchema(schema);
  if (!validate(data)) {
    failed = true;
    console.error(`\n❌ Validation failed: ${file}`);
    console.error(validate.errors);
  } else {
    console.log(`✅ ${file} is valid.`);
  }
}

if (failed) {
  process.exitCode = 1;
  console.error('\nValidation errors found.');
} else {
  console.log('\nAll data files valid.');
}

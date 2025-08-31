// ===================== scripts/validate-data.js (Ajv 8) ====================
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');


const ROOT = process.cwd();
const dataDir = path.join(ROOT, 'data');
const schemaDir = path.join(dataDir, 'schemas');


const map = [
{ file: 'schedule.json', schema: 'schedule.schema.json' },
{ file: 'weather.json', schema: 'weather.schema.json' },
{ file: 'places.json', schema: 'places.schema.json' },
{ file: 'specials.json', schema: 'specials.schema.json' },
{ file: 'meta.json', schema: 'meta.schema.json' },
{ file: 'next.json', schema: 'next.schema.json' }
];


function readJSON(p){
return JSON.parse(fs.readFileSync(p, 'utf8'));
}


(async () => {
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);


// Preload referenced schemas
const preload = ['game.schema.json','place.schema.json','special.schema.json'];
preload.forEach(s => ajv.addSchema(readJSON(path.join(schemaDir, s))));


let failed = 0;
for(const { file, schema } of map){
const dataPath = path.join(dataDir, file);
const schemaPath = path.join(schemaDir, schema);
if(!fs.existsSync(dataPath)) { console.warn('SKIP (missing):', file); continue; }
const data = readJSON(dataPath);
const sch = readJSON(schemaPath);
const validate = ajv.compile(sch);
const ok = validate(data);
if(!ok){
failed++;
console.error(`\n✗ ${file} failed schema ${schema}`);
console.error(validate.errors);
} else {
console.log(`✓ ${file} valid against ${schema}`);
}
}


if(failed){
console.error(`\n${failed} file(s) failed validation.`);
process.exit(1);
} else {
console.log('\nAll data files valid.');
}
})();

// Sanity check: every sprite template row must be exactly 16 pixels wide.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../public/js/sprites.js', import.meta.url), 'utf8');
let bad = 0;
for (const m of src.matchAll(/'([.a-zA-Z]{10,})'/g)) {
  if (m[1].length !== 16 && m[1].length !== 8) { console.log('bad row', JSON.stringify(m[1]), m[1].length); bad++; }
}
console.log(bad ? `${bad} bad rows` : 'all sprite rows OK');
process.exit(bad ? 1 : 0);

#!/usr/bin/env node
// Map the agent desktop this command runs in to a Grok Office employee.
// Each Grok Bot agent has its own desktop/exec-daemon on the box; a Shell command run by
// that agent inherits DISPLAY=:N. Ask the agent to run, once:
//   node /workspace/grok-office/scripts/register-agent.mjs <employee-id>
// or set a mapping by hand:  node scripts/register-agent.mjs jeremy :4
//   node scripts/register-agent.mjs --list
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'agent-map.json');
const map = (() => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { displays: {} }; } })();
map.displays ||= {};
const [id, displayArg] = process.argv.slice(2);
if (!id || id === '--list') { console.log(JSON.stringify(map, null, 2)); process.exit(0); }
const display = displayArg || process.env.DISPLAY;
if (!/^:\d+$/.test(display || '')) { console.error('No DISPLAY like ":3" found; pass it explicitly.'); process.exit(1); }
if (id === '--remove') { delete map.displays[display]; }
else {
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) { console.error('invalid employee id'); process.exit(1); }
  for (const [d, v] of Object.entries(map.displays)) if (v === id && d !== display && displayArg == null) delete map.displays[d];
  map.displays[display] = id;
}
map.updatedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(FILE, JSON.stringify(map, null, 2) + '\n');
console.log(`mapped ${display} -> ${id}`, JSON.stringify(map.displays));

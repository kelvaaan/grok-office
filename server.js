#!/usr/bin/env node
// Grok Office (Orbit Group edition) — tiny zero-dependency server.
// Serves the static pixel office from ./public, exposes a status API and pushes
// live updates to browsers with Server-Sent Events. Binds to 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const ROSTER_FILE = process.env.ROSTER_FILE || path.join(ROOT, 'roster.json');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const OFFICE_CONFIG_FILE = process.env.OFFICE_CONFIG_FILE || path.join(ROOT, 'office-config.json');
const OFFICE_FILE = path.join(DATA_DIR, 'office.json');
const PORT = Number(process.env.PORT || 3200);
const HOST = process.env.HOST || '127.0.0.1';
const DESK_COUNT = 8; // desks drawn in the office (index 0..7)

const STATUSES = new Set(['idle', 'working', 'waiting', 'offline']);
const ACTIVITIES = new Set(['read', 'write', 'command']);
const MAX_MESSAGE = 500;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let officeName = 'Orbit Group'; // fallback only; the customizable name lives in office settings
let roster = []; // employees from roster.json
let state = { agents: {}, extras: [] }; // persisted

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[grok-office] could not read ${file}: ${err.message}`);
    return fallback;
  }
}

function normalizeEmployee(e) {
  if (!e || typeof e.id !== 'string') return null;
  const id = e.id.trim().toLowerCase();
  if (!ID_RE.test(id)) return null;
  return {
    id,
    name: String(e.name || id).slice(0, 40),
    role: String(e.role || '').slice(0, 80),
    desk: Number.isInteger(e.desk) ? e.desk : null,
    look: e.look && typeof e.look === 'object' ? e.look : null,
  };
}

function loadRoster() {
  const data = readJson(ROSTER_FILE, { employees: [] });
  officeName = (data.office && data.office.name) || 'Orbit Group';
  const seen = new Set();
  roster = [];
  for (const raw of data.employees || []) {
    const e = normalizeEmployee(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    roster.push(e);
  }
  // Drop auto-added extras that are now part of the roster.
  state.extras = state.extras.filter((x) => !seen.has(x.id));
}

function loadState() {
  const s = readJson(STATE_FILE, null);
  if (s && typeof s === 'object') {
    state.agents = s.agents && typeof s.agents === 'object' ? s.agents : {};
    state.extras = Array.isArray(s.extras) ? s.extras.map(normalizeEmployee).filter(Boolean) : [];
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STATE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error('[grok-office] failed to save state:', err.message);
    }
  }, 150);
}

function allEmployees() {
  return [...roster, ...state.extras];
}

// Resolve desks: explicit desk wins, everyone else gets the lowest free desk.
function withDesks(list) {
  const used = new Set();
  const out = list.map((e) => ({ ...e }));
  for (const e of out) {
    if (e.desk !== null && e.desk >= 0 && e.desk < DESK_COUNT && !used.has(e.desk)) used.add(e.desk);
    else e.desk = null;
  }
  for (const e of out) {
    if (e.desk !== null) continue;
    for (let d = 0; d < DESK_COUNT; d++) if (!used.has(d)) { e.desk = d; used.add(d); break; }
  }
  return out;
}

function publicAgent(e) {
  const s = state.agents[e.id] || {};
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    desk: e.desk,
    look: e.look,
    status: STATUSES.has(s.status) ? s.status : 'idle',
    activity: s.activity || null,
    message: s.message || '',
    updatedAt: s.updatedAt || null,
  };
}

function snapshot() {
  return {
    office: { name: office.name || officeName, desks: DESK_COUNT, settings: office },
    agents: withDesks(allEmployees()).map(publicAgent),
    serverTime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Office customization (walls, floors, accessories, branding)
// Defaults, allowed options and presets live in the committed office-config.json;
// the user's choices are persisted to data/office.json.
// ---------------------------------------------------------------------------
const officeConfig = readJson(OFFICE_CONFIG_FILE, null);
if (!officeConfig || !officeConfig.defaults || !officeConfig.options) {
  console.error(`[grok-office] ${OFFICE_CONFIG_FILE} is missing or invalid`);
  process.exit(1);
}
const OPT = officeConfig.options;
const ids = (list) => new Set((list || []).map((o) => o.id));
const ENUMS = {
  sign: ids(OPT.sign), lighting: ids(OPT.lighting), accent: ids(OPT.accent), monitors: ids(OPT.monitors),
  plantStyle: ids(OPT.plantStyle), rugColor: ids(OPT.rugColor), sofaColor: ids(OPT.sofaColor),
  preset: new Set([...ids(officeConfig.presets), 'custom']),
};
const WALL_ROOMS = ids(OPT.wallRooms), WALLS = ids(OPT.walls);
const FLOOR_ROOMS = ids(OPT.rooms), FLOORS = ids(OPT.floors);
const ACCESSORIES = ids(OPT.accessories);
const cleanText = (v) => String(v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
const clone = (o) => JSON.parse(JSON.stringify(o));

// Validate a (partial) settings object and merge it onto `base`. Returns {settings} or {errors}.
function mergeOffice(base, patch) {
  const errors = [];
  const out = clone(base);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { errors: ['body must be a JSON object'] };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'name') {
      const t = typeof v === 'string' ? cleanText(v) : '';
      if (!t || t.length > 32) errors.push('name must be 1-32 characters'); else out.name = t;
    } else if (ENUMS[k]) {
      if (!ENUMS[k].has(v)) errors.push(`${k} must be one of ${[...ENUMS[k]].join(', ')}`); else out[k] = v;
    } else if (k === 'walls' || k === 'floors') {
      const rooms = k === 'walls' ? WALL_ROOMS : FLOOR_ROOMS, allowed = k === 'walls' ? WALLS : FLOORS;
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${k} must be an object`); continue; }
      for (const [room, val] of Object.entries(v)) {
        if (!rooms.has(room)) errors.push(`${k}.${room}: unknown room (use ${[...rooms].join(', ')})`);
        else if (!allowed.has(val)) errors.push(`${k}.${room} must be one of ${[...allowed].join(', ')}`);
        else out[k][room] = val;
      }
    } else if (k === 'accessories') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push('accessories must be an object'); continue; }
      for (const [item, val] of Object.entries(v)) {
        if (!ACCESSORIES.has(item)) errors.push(`accessories.${item}: unknown item`);
        else if (typeof val !== 'boolean') errors.push(`accessories.${item} must be true or false`);
        else out.accessories[item] = val;
      }
    } else if (k === 'updatedAt') {
      // ignored (server-maintained)
    } else {
      errors.push(`unknown setting "${k}"`);
    }
  }
  return errors.length ? { errors } : { settings: out };
}

const OFFICE_DEFAULTS = (() => {
  const r = mergeOffice({ ...clone(officeConfig.defaults), walls: {}, floors: {}, accessories: {} }, officeConfig.defaults);
  if (r.errors) { console.error('[grok-office] office-config.json defaults are invalid:', r.errors.join('; ')); process.exit(1); }
  return r.settings;
})();

let office = clone(OFFICE_DEFAULTS);
function loadOffice() {
  const saved = readJson(OFFICE_FILE, null);
  if (!saved) return;
  // Merge key by key so one stale/invalid value doesn't throw away the rest.
  for (const [k, v] of Object.entries(saved)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of Object.entries(v)) {
        const r = mergeOffice(office, { [k]: { [kk]: vv } });
        if (r.settings) office = r.settings;
      }
    } else {
      const r = mergeOffice(office, { [k]: v });
      if (r.settings) office = r.settings;
    }
  }
}
function saveOffice() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = OFFICE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(office, null, 2));
    fs.renameSync(tmp, OFFICE_FILE);
  } catch (err) {
    console.error('[grok-office] failed to save office settings:', err.message);
  }
}
function officePayload() {
  return { settings: office, defaults: OFFICE_DEFAULTS, options: OPT, presets: officeConfig.presets || [] };
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
setInterval(() => {
  for (const res of clients) res.write(`: ping ${Date.now()}\n\n`);
}, 25000).unref();

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------
function applyUpdate(body) {
  if (!body || typeof body !== 'object') return { code: 400, error: 'body must be a JSON object' };
  const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
  if (!ID_RE.test(id)) return { code: 400, error: 'id must match ' + ID_RE };
  const status = body.status;
  if (!STATUSES.has(status)) return { code: 400, error: `status must be one of ${[...STATUSES].join(', ')}` };
  let activity = body.activity == null || body.activity === '' ? null : String(body.activity);
  if (activity && !ACTIVITIES.has(activity)) return { code: 400, error: `activity must be one of ${[...ACTIVITIES].join(', ')}` };
  if (status !== 'working') activity = null;
  const message = body.message == null ? '' : String(body.message).slice(0, MAX_MESSAGE);

  let created = false;
  if (!allEmployees().some((e) => e.id === id)) {
    if (!body.name) return { code: 404, error: `unknown employee "${id}" (include "name" to auto-add, or add them to roster.json)` };
    const extra = normalizeEmployee({ id, name: body.name, role: body.role || 'Teammate', look: body.look });
    state.extras.push(extra);
    created = true;
  }
  state.agents[id] = { status, activity, message, updatedAt: new Date().toISOString() };
  saveState();
  const agent = withDesks(allEmployees()).map(publicAgent).find((a) => a.id === id);
  if (created) broadcast('snapshot', snapshot());
  else broadcast('agent', agent);
  return { code: created ? 201 : 200, agent };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// Only answer requests addressed to a loopback host name (blocks DNS rebinding).
function hostAllowed(req) {
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || HOST !== '127.0.0.1';
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!hostAllowed(req)) return sendJson(res, 421, { error: 'misdirected request' });
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/agents' && req.method === 'GET') return sendJson(res, 200, snapshot());

    if (p === '/api/office' && req.method === 'GET') return sendJson(res, 200, officePayload());
    if ((p === '/api/office' && req.method === 'PUT') || (p === '/api/office/reset' && req.method === 'POST')) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return sendJson(res, 415, { error: 'Content-Type must be application/json' });
      }
      let body;
      try { body = JSON.parse((await readBody(req, 16 * 1024)) || '{}'); } catch { return sendJson(res, 400, { error: 'invalid JSON' }); }
      let next;
      if (p === '/api/office/reset') next = clone(OFFICE_DEFAULTS);
      else {
        // PUT merges a partial object; send {"replace": true, ...} to start from defaults.
        const { replace, ...patch } = body && typeof body === 'object' ? body : {};
        const r = mergeOffice(replace === true ? OFFICE_DEFAULTS : office, patch);
        if (r.errors) return sendJson(res, 400, { error: 'invalid settings', errors: r.errors });
        next = r.settings;
      }
      office = next;
      saveOffice();
      broadcast('office', office);
      return sendJson(res, 200, { ok: true, settings: office });
    }

    if (p === '/api/status' && req.method === 'POST') {
      // Requiring a JSON content type forces a CORS preflight for cross-origin
      // pages (which we never approve), so random websites cannot post here.
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return sendJson(res, 415, { error: 'Content-Type must be application/json' });
      }
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'invalid JSON' }); }
      if (Array.isArray(body)) {
        const results = body.map(applyUpdate);
        return sendJson(res, results.every((r) => r.code < 300) ? 200 : 207, { results });
      }
      const r = applyUpdate(body);
      return sendJson(res, r.code, r.error ? { error: r.error } : { ok: true, agent: r.agent });
    }

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (p === '/api/health') return sendJson(res, 200, { ok: true, clients: clients.size });
    if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
    return serveStatic(req, res, p);
  } catch (err) {
    console.error('[grok-office]', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
  }
});

// ---------------------------------------------------------------------------
loadState();
loadRoster();
loadOffice();

// Pick up roster.json edits without a restart.
fs.watchFile(ROSTER_FILE, { interval: 2000 }, () => {
  console.log('[grok-office] roster.json changed, reloading');
  loadRoster();
  saveState();
  broadcast('snapshot', snapshot());
});

server.listen(PORT, HOST, () => {
  console.log(`[grok-office] ${office.name} is open at http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/ (${allEmployees().length} employees)`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
    console.warn('[grok-office] WARNING: not bound to loopback; the status API has no authentication.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[grok-office] received ${sig}, saving state and exiting`);
    clearTimeout(saveTimer);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch {}
    process.exit(0);
  });
}

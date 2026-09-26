#!/usr/bin/env node
// Grok Office — tiny zero-dependency server.
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
let officeName = 'Grok HQ';
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
  officeName = (data.office && data.office.name) || 'Grok HQ';
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
    office: { name: officeName, desks: DESK_COUNT },
    agents: withDesks(allEmployees()).map(publicAgent),
    serverTime: new Date().toISOString(),
  };
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

// Pick up roster.json edits without a restart.
fs.watchFile(ROSTER_FILE, { interval: 2000 }, () => {
  console.log('[grok-office] roster.json changed, reloading');
  loadRoster();
  saveState();
  broadcast('snapshot', snapshot());
});

server.listen(PORT, HOST, () => {
  console.log(`[grok-office] ${officeName} is open at http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/ (${allEmployees().length} employees)`);
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

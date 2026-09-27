#!/usr/bin/env node
// Grok Office — Mac-side bridge: polls the secret status gist written by
// scripts/box-publisher.mjs and mirrors it into the local office via POST /api/status.
// No npm dependencies (Node 18+ global fetch).
//
// Two sources are combined, the newest heartbeat wins:
//   1. gist.githubusercontent.com raw URL (not rate limited; GitHub's cache can lag 1-5 min);
//   2. api.github.com/gists/<id> (always fresh; 60 req/h without a token, so the bridge
//      spreads its budget using the rate-limit headers, ~1 call/min). If GITHUB_TOKEN or
//      GH_TOKEN is set in the environment, the API is polled every POLL_SEC instead.
//
// Config: data/bridge.json {"gistId": "...", "user": "kelvaaan", "file": "grok-office-status.json"}
//         or env GIST_ID / GIST_USER / GIST_FILE.
// Env:    OFFICE_URL=http://127.0.0.1:3200  POLL_SEC=15  STALE_SEC=480  API_MIN_SEC=65
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'bridge.json');
const cfg = (() => { try { return JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { return {}; } })();
const GIST_ID = process.env.GIST_ID || cfg.gistId;
const GIST_USER = process.env.GIST_USER || cfg.user || 'kelvaaan';
const GIST_FILE = process.env.GIST_FILE || cfg.file || 'grok-office-status.json';
const OFFICE = (process.env.OFFICE_URL || `http://127.0.0.1:${process.env.PORT || 3200}`).replace(/\/$/, '');
const POLL = Number(process.env.POLL_SEC || 15) * 1000;
const STALE = Number(process.env.STALE_SEC || 480) * 1000;
const API_MIN = Number(process.env.API_MIN_SEC || 65) * 1000;
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const TIMEOUT = 15000;

const log = (...a) => console.log(new Date().toISOString(), '[bridge]', ...a);
if (!GIST_ID) { console.error('Set GIST_ID or create data/bridge.json with {"gistId": "..."}'); process.exit(1); }

async function fetchWithTimeout(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}

function parsePayload(text) {
  const j = JSON.parse(text);
  if (!j || j.v !== 1 || !Array.isArray(j.agents) || !j.heartbeatAt) throw new Error('unexpected payload');
  return j;
}

let best = null; // newest payload seen
let lastGoodFetch = 0;
function consider(p, source) {
  if (!best || Date.parse(p.heartbeatAt) > Date.parse(best.heartbeatAt)) {
    const lag = Math.round((Date.now() - Date.parse(p.heartbeatAt)) / 1000);
    if (!best || best.seq !== p.seq) log(`feed #${p.seq} via ${source} (heartbeat ${lag}s old)`);
    best = p;
  }
}

async function pollRaw() {
  const url = `https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw/${GIST_FILE}?t=${Date.now()}`;
  const r = await fetchWithTimeout(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error(`raw HTTP ${r.status}`);
  consider(parsePayload(await r.text()), 'raw');
  lastGoodFetch = Date.now();
}

let etag = null, nextApiAt = 0;
async function pollApi() {
  if (Date.now() < nextApiAt) return;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'grok-office-bridge' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (etag) headers['If-None-Match'] = etag;
  let r;
  try { r = await fetchWithTimeout(`https://api.github.com/gists/${GIST_ID}`, { headers }); }
  catch (e) { nextApiAt = Date.now() + (TOKEN ? POLL : API_MIN); throw e; }
  const remaining = Number(r.headers.get('x-ratelimit-remaining'));
  const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000;
  if (TOKEN) nextApiAt = Date.now() + POLL;
  else if (Number.isFinite(remaining) && Number.isFinite(reset)) {
    const left = Math.max(1, remaining - 3);
    nextApiAt = Date.now() + (remaining <= 3 ? Math.max(API_MIN, reset - Date.now() + 1000) : Math.max(API_MIN, (reset - Date.now()) / left));
  } else nextApiAt = Date.now() + API_MIN;
  if (r.status === 304) { lastGoodFetch = Date.now(); return; }
  if (!r.ok) throw new Error(`api HTTP ${r.status}`);
  etag = r.headers.get('etag');
  const j = await r.json();
  const f = j.files && j.files[GIST_FILE];
  if (!f || typeof f.content !== 'string') throw new Error('file missing in gist');
  consider(parsePayload(f.content), 'api');
  lastGoodFetch = Date.now();
}

const LABEL = { command: 'Running commands', read: 'Using tools', write: 'Editing files' };
function desiredFor(a, stale) {
  if (stale) return { status: 'offline', activity: null, message: 'Status feed stale' };
  if (a.unmapped) return { status: 'idle', activity: null, message: 'Not linked to an agent desktop yet' };
  if (a.status === 'working') return { status: 'working', activity: a.activity || 'read', message: LABEL[a.activity] || 'Working' };
  return { status: a.status, activity: null, message: '' };
}

async function sync() {
  if (!best) return;
  const stale = Date.now() - Date.parse(best.heartbeatAt) > STALE;
  let local;
  try {
    const r = await fetchWithTimeout(`${OFFICE}/api/agents`);
    local = new Map((await r.json()).agents.map((a) => [a.id, a]));
  } catch (e) { log('office not reachable:', e.message); return; }
  for (const a of best.agents) {
    const cur = local.get(a.id);
    if (!cur) continue; // only mirror employees that exist in the office roster
    const want = desiredFor(a, stale);
    if (cur.status === want.status && (cur.activity || null) === want.activity && (cur.message || '') === want.message) continue;
    try {
      const r = await fetchWithTimeout(`${OFFICE}/api/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, ...want }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      log(`${a.id}: ${cur.status} -> ${want.status}${want.activity ? '/' + want.activity : ''}${stale ? ' (feed stale)' : ''}`);
    } catch (e) { log(`post ${a.id} failed:`, e.message); }
  }
}

let errors = 0;
async function loop() {
  const results = await Promise.allSettled([pollRaw(), pollApi()]);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length) { errors++; if (errors === 1 || errors % 10 === 0) log(`fetch failed x${errors}:`, failed.map((f) => f.reason?.message).join('; ')); }
  else errors = 0;
  // If GitHub is unreachable for a long time, the stale check in sync() marks everyone offline.
  await sync().catch((e) => log('sync error', e.message));
  const delay = errors ? Math.min(60000, POLL * Math.min(4, errors)) : POLL;
  setTimeout(loop, delay);
}

log(`polling gist ${GIST_ID.slice(0, 6)}… every ${POLL / 1000}s -> ${OFFICE} (stale after ${STALE / 1000}s${TOKEN ? ', token auth' : ''})`);
loop();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log(`received ${sig}, exiting`); process.exit(0); });

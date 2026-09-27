#!/usr/bin/env node
// Grok Office — box-side activity publisher.
//
// Runs on the Linux box where the Grok Bot agents execute their tools. It watches
// each agent desktop's exec-daemon (the process that runs an agent's Shell / Read /
// computer-use tool calls) and derives working / idle per employee:
//
//   * I/O counters of the exec-daemon process (/proc/<pid>/io rchar+wchar) —
//     change on every tool call, and are completely flat while nobody uses that desktop;
//   * growth of the exec-daemon log (a Shell tool call appends an "approval gate" line;
//     only line *types* are counted, never their content).
//
// An employee is "working" if their desktop showed tool activity within ACTIVE_WINDOW_SEC
// (default 90 s), otherwise "idle". Activity hint: "command" if a Shell call happened in
// that window, else "read" (other tool use). No conversation content is read or published.
//
// The status (id, status, activity, updatedAt only) is written to a SECRET GitHub gist via
// the authenticated `gh` CLI when something changes (at most every MIN_PUBLISH_SEC) plus a
// heartbeat every HEARTBEAT_SEC. The Mac-side scripts/bridge-gist.mjs polls that gist.
//
// Config: data/publisher.json  { "gistId": "...", "file": "grok-office-status.json" }
//         data/agent-map.json  { "displays": { ":3": "sameer", ... } }   (see scripts/register-agent.mjs)
// Env:    ACTIVE_WINDOW_SEC=90 SAMPLE_SEC=5 MIN_PUBLISH_SEC=15 HEARTBEAT_SEC=120 DRY_RUN=1
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA, 'publisher.json');
const MAP_FILE = path.join(DATA, 'agent-map.json');
const ROSTER_FILE = process.env.ROSTER_FILE || path.join(ROOT, 'roster.json');
const ACTIVE_WINDOW = Number(process.env.ACTIVE_WINDOW_SEC || 90) * 1000;
const SAMPLE = Number(process.env.SAMPLE_SEC || 5) * 1000;
const MIN_PUBLISH = Number(process.env.MIN_PUBLISH_SEC || 15) * 1000;
const HEARTBEAT = Number(process.env.HEARTBEAT_SEC || 120) * 1000;
const DRY_RUN = process.env.DRY_RUN === '1';

const log = (...a) => console.log(new Date().toISOString(), '[publisher]', ...a);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// ---------------------------------------------------------------------------
// Discover exec-daemons: display :1 is the primary (port 1337), forks use port 14000+N.
function discoverDaemons() {
  const out = new Map();
  for (const pid of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    let cmd;
    try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { continue; }
    if (!cmd.some((c) => c.endsWith('/exec-daemon/index.js')) || !cmd.includes('serve')) continue;
    const port = Number(cmd[cmd.indexOf('--port') + 1]);
    let n = null;
    if (port === 1337) n = 1;
    else if (port > 14000 && port < 14200) n = port - 14000;
    if (!n) continue;
    const display = `:${n}`;
    const logFile = n === 1 ? '/tmp/exec-daemon.log' : `/tmp/sand-window-${n}/exec-daemon.log`;
    out.set(display, { pid: Number(pid), display, logFile });
  }
  return out;
}

function ioCounter(pid) {
  try {
    const txt = fs.readFileSync(`/proc/${pid}/io`, 'utf8');
    const get = (k) => Number((txt.match(new RegExp(`^${k}:\\s*(\\d+)`, 'm')) || [])[1] || 0);
    return get('rchar') + get('wchar');
  } catch { return null; }
}

// Classify newly appended log lines by type only (content is never stored or published).
function readLogGrowth(w) {
  let st;
  try { st = fs.statSync(w.logFile); } catch { return { command: 0, noise: 0, other: 0 }; }
  const res = { command: 0, noise: 0, other: 0 };
  if (w.logSize == null || st.size < w.logSize) { w.logSize = st.size; return res; }
  if (st.size === w.logSize) return res;
  const len = Math.min(st.size - w.logSize, 256 * 1024);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(w.logFile, 'r');
  try { fs.readSync(fd, buf, 0, len, st.size - len); } finally { fs.closeSync(fd); }
  w.logSize = st.size;
  for (const line of buf.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    if (line.includes('approval gate reached')) res.command++;
    else if (line.includes('skipped local approval') || /^\s+at /.test(line)) continue;
    else if (line.includes('Updated exec-daemon environment')) res.noise++;
    else res.other++;
  }
  return res;
}

// ---------------------------------------------------------------------------
const windows = new Map(); // display -> { pid, io, logSize, lastActive, lastCommand }
function sample(now) {
  const found = discoverDaemons();
  for (const [display, d] of found) {
    let w = windows.get(display);
    if (!w || w.pid !== d.pid) {
      w = { ...d, io: ioCounter(d.pid), logSize: null, lastActive: 0, lastCommand: 0 };
      readLogGrowth(w);
      windows.set(display, w);
      continue;
    }
    const io = ioCounter(d.pid);
    const g = readLogGrowth(w);
    const ioChanged = io !== null && w.io !== null && io !== w.io;
    w.io = io;
    // The primary exec-daemon periodically refreshes its environment, which also moves its
    // I/O counters; only trust an I/O change in an interval without such a refresh.
    const active = g.command > 0 || g.other > 0 || (ioChanged && g.noise === 0);
    if (active) w.lastActive = now;
    if (g.command > 0) w.lastCommand = now;
  }
  for (const display of [...windows.keys()]) if (!found.has(display)) windows.delete(display);
}

// ---------------------------------------------------------------------------
const agentState = new Map(); // id -> { status, activity, updatedAt }
function computeStatuses(now) {
  const map = readJson(MAP_FILE, { displays: {} }).displays || {};
  const roster = (readJson(ROSTER_FILE, { employees: [] }).employees || []).map((e) => e.id);
  const ids = new Set([...roster, ...Object.values(map)]);
  const out = [];
  for (const id of ids) {
    const displays = Object.entries(map).filter(([, v]) => v === id).map(([k]) => k);
    let lastActive = 0, lastCommand = 0;
    for (const d of displays) {
      const w = windows.get(d);
      if (w) { lastActive = Math.max(lastActive, w.lastActive); lastCommand = Math.max(lastCommand, w.lastCommand); }
    }
    const working = lastActive && now - lastActive < ACTIVE_WINDOW;
    const status = working ? 'working' : 'idle';
    const activity = working ? (lastCommand && now - lastCommand < ACTIVE_WINDOW ? 'command' : 'read') : null;
    const prev = agentState.get(id);
    if (!prev || prev.status !== status || prev.activity !== activity) {
      agentState.set(id, { status, activity, updatedAt: new Date(now).toISOString() });
      if (prev) log(`${id}: ${prev.status}${prev.activity ? '/' + prev.activity : ''} -> ${status}${activity ? '/' + activity : ''}`);
    }
    const s = agentState.get(id);
    out.push({ id, status: s.status, activity: s.activity, updatedAt: s.updatedAt, mapped: displays.length > 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
function ghPatch(gistId, file, content) {
  return new Promise((resolve, reject) => {
    const p = spawn('gh', ['api', '-X', 'PATCH', `/gists/${gistId}`, '--input', '-', '--jq', '.updated_at'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('gh timed out')); }, 30000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `gh exit ${code}`)); });
    p.stdin.end(JSON.stringify({ files: { [file]: { content } } }));
  });
}

let lastSig = null, lastPublish = 0, seq = 0, publishing = false, failures = 0;
async function tick() {
  const now = Date.now();
  sample(now);
  const agents = computeStatuses(now);
  const sig = JSON.stringify(agents.map((a) => [a.id, a.status, a.activity, a.mapped]));
  const changed = sig !== lastSig;
  const due = (changed && now - lastPublish >= MIN_PUBLISH) || now - lastPublish >= HEARTBEAT;
  if (!due || publishing) return;
  const cfg = readJson(CONFIG_FILE, null);
  if (!cfg || !cfg.gistId) { if (changed) log('no data/publisher.json gistId configured; status:', sig); lastSig = sig; return; }
  const payload = {
    v: 1,
    seq: ++seq,
    source: 'grok-office box publisher',
    heartbeatAt: new Date(now).toISOString(),
    activeWindowSec: ACTIVE_WINDOW / 1000,
    agents: agents.map(({ id, status, activity, updatedAt, mapped }) => ({ id, status, activity, updatedAt, ...(mapped ? {} : { unmapped: true }) })),
  };
  publishing = true;
  try {
    if (DRY_RUN) log('DRY_RUN would publish', JSON.stringify(payload));
    else await ghPatch(cfg.gistId, cfg.file || 'grok-office-status.json', JSON.stringify(payload, null, 1));
    if (changed) log('published', agents.map((a) => `${a.id}=${a.status}${a.activity ? '/' + a.activity : ''}`).join(' '));
    lastSig = sig;
    lastPublish = now;
    failures = 0;
  } catch (e) {
    failures++;
    log(`publish failed (${failures}):`, String(e.message).slice(0, 200));
    lastPublish = now - MIN_PUBLISH + Math.min(60000, 5000 * failures); // back off
  } finally {
    publishing = false;
  }
}

log(`starting: window ${ACTIVE_WINDOW / 1000}s, sample ${SAMPLE / 1000}s, heartbeat ${HEARTBEAT / 1000}s${DRY_RUN ? ' (dry run)' : ''}`);
sample(Date.now());
setInterval(() => tick().catch((e) => log('tick error', e.message)), SAMPLE);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log(`received ${sig}, exiting`); process.exit(0); });

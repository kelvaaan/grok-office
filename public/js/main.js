// Grok Office (Orbit Group edition) — client: simulation, rendering and UI.
import { T, W, H, COLS, ROWS, buildBackground, drawWallDecor, furniture, seats, spots, desks, walkable, ZONES, skyPhase, monitorRect, monitorCount, lights, applySettings, settings } from './office.js';
import { initCustomize } from './customize.js';
import { buildCharacter, resolveLook, icon } from './sprites.js';
import { drawText } from './font.js';

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
const scene = document.createElement('canvas');
scene.width = W; scene.height = H;
const sctx = scene.getContext('2d');
const params = new URLSearchParams(location.search);

const world = {
  agents: new Map(), // id -> agent data from server
  chars: new Map(), // id -> Char
  officeName: 'Orbit Group',
  date: new Date(),
  phase: 'day',
  selected: null,
  connected: false,
};
window.__grokOffice = world; // handy for debugging / tests

let background = buildBackground();

// ---------------------------------------------------------------------------
// Utilities
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const key = (x, y) => `${x},${y}`;

function timeNow() {
  const d = new Date();
  if (params.has('hour')) d.setHours(Number(params.get('hour')), d.getMinutes());
  return d;
}

// BFS on the walkability grid. Blocked tiles may be entered only as the goal.
function findPath(sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return [];
  const prev = new Map();
  const start = key(sx, sy);
  prev.set(start, null);
  const q = [[sx, sy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      const isGoal = nx === gx && ny === gy;
      if (!isGoal && !walkable(nx, ny)) continue;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      prev.set(k, [x, y]);
      if (isGoal) {
        const path = [];
        let cur = [nx, ny];
        while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reservations for seats / spots so characters don't stack
const reserved = new Map(); // key -> charId
function reserve(x, y, id) { reserved.set(key(x, y), id); }
function release(id) { for (const [k, v] of reserved) if (v === id) reserved.delete(k); }
function isFree(x, y, id) { const r = reserved.get(key(x, y)); return !r || r === id; }

// ---------------------------------------------------------------------------
// Characters
class Char {
  constructor(agent) {
    this.id = agent.id;
    this.look = resolveLook(agent.id, agent.look);
    this.frames = buildCharacter(this.look);
    this.x = 0; this.y = 0;
    this.path = [];
    this.dir = 'down';
    this.mode = 'stand';
    this.target = null; // {x,y,facing,seat?,spot?,kind}
    this.dwellUntil = 0;
    this.walkT = 0;
    this.bubbleUntil = 0;
    this.blinkAt = performance.now() + rand(1500, 5000);
    this.lastStatus = null;
    this.phaseOffset = Math.random() * 1000;
  }
  get agent() { return world.agents.get(this.id); }
  get tileX() { return Math.round(this.x); }
  get tileY() { return Math.round(this.y); }

  deskSeat() {
    const a = this.agent;
    if (a && a.desk != null) return seats.find((s) => s.kind === 'desk' && s.desk === a.desk);
    // hot-desker: any free meeting seat facing down
    return seats.find((s) => s.kind === 'meeting' && isFree(s.x, s.y, this.id)) || null;
  }

  placeAt(t) {
    this.x = t.x; this.y = t.y;
    this.path = [];
    this.arrive(t);
  }

  goTo(t, now) {
    release(this.id);
    reserve(t.x, t.y, this.id);
    this.target = t;
    // continue from the next tile if mid-step
    const sx = this.path.length ? this.path[0][0] : this.tileX;
    const sy = this.path.length ? this.path[0][1] : this.tileY;
    const p = findPath(sx, sy, t.x, t.y);
    if (p === null) { this.placeAt(t); return; }
    this.path = this.path.length ? [this.path[0], ...p] : p;
    if (!this.path.length) this.arrive(t, now);
    else this.mode = 'walk';
  }

  arrive(t, now = performance.now()) {
    this.target = t;
    reserve(t.x, t.y, this.id);
    this.path = [];
    this.mode = t.seat ? 'sit' : 'stand';
    this.dir = t.facing || 'down';
    const dwell = t.dwell || [6, 14];
    this.dwellUntil = now + rand(dwell[0], dwell[1]) * 1000;
  }

  plan(now, force = false) {
    const a = this.agent;
    if (!a) return;
    const atWork = a.status === 'working' || a.status === 'waiting' || a.status === 'offline';
    if (atWork) {
      const s = this.deskSeat();
      if (!s) return;
      if (this.target && this.target.seat === s && !force) return;
      this.goTo({ x: s.x, y: s.y, facing: s.facing, seat: s, offY: s.offY }, now);
      return;
    }
    // idle
    if (!force && this.target && this.target.seat && this.target.seat.kind === 'desk') force = true;
    if (!force && (this.mode === 'walk' || now < this.dwellUntil)) return;
    this.goTo(this.chooseIdleTarget(), now);
  }

  chooseIdleTarget() {
    const r = Math.random();
    if (r < 0.45) {
      const free = seats.filter((s) => s.kind !== 'desk' && s.kind !== 'meeting' && isFree(s.x, s.y, this.id));
      if (free.length) { const s = pick(free); return { x: s.x, y: s.y, facing: s.facing, seat: s, offY: s.offY, dwell: [10, 25] }; }
    }
    if (r < 0.8) {
      const free = spots.filter((s) => isFree(s.x, s.y, this.id) && walkable(s.x, s.y));
      if (free.length) { const s = pick(free); return { x: s.x, y: s.y, facing: s.facing, spot: s, dwell: s.dwell }; }
    }
    const zone = ZONES[pick(['lounge', 'lounge', 'kitchen', 'meeting', 'collab'])];
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand(zone.x0, zone.x1 + 1)), y = Math.floor(rand(zone.y0, zone.y1 + 1));
      if (walkable(x, y) && isFree(x, y, this.id)) return { x, y, facing: pick(['down', 'left', 'right', 'up']), dwell: [3, 7] };
    }
    return { x: 30, y: 19, facing: 'down', dwell: [3, 6] };
  }

  update(dt, now) {
    if (this.mode === 'walk' && this.path.length) {
      const [nx, ny] = this.path[0];
      const dx = nx - this.x, dy = ny - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = 3.4; // tiles per second
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
      else if (dy !== 0) this.dir = dy > 0 ? 'down' : 'up';
      const step = speed * dt;
      if (dist <= step) {
        this.x = nx; this.y = ny;
        this.path.shift();
        if (!this.path.length) this.arrive(this.target, now);
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      this.walkT += dt;
    } else {
      this.walkT = 0;
    }
    this.plan(now);
  }

  get seated() { return this.mode === 'sit' && this.target && this.target.seat; }
  get atDesk() { return this.seated && this.target.seat.kind === 'desk'; }

  spriteRect() {
    const offY = this.seated ? this.target.offY || 0 : 0;
    const px = Math.round(this.x * T), py = Math.round(this.y * T + T - 24 + offY);
    return { px, py };
  }

  sortY() {
    return this.y * T + T;
  }

  draw(g, now) {
    const a = this.agent;
    const { px, py } = this.spriteRect();
    const offline = a && a.status === 'offline';
    let img;
    if (this.seated) {
      if (this.target.facing === 'up') img = this.frames.sitUp;
      else if (offline) img = this.frames.sleep;
      else img = now > this.blinkAt ? this.frames.sitBlink : this.frames.sitDown;
    } else if (this.mode === 'walk') {
      const cycle = this.dir === 'left' || this.dir === 'right' ? [0, 1] : [0, 1, 0, 2];
      img = this.frames[this.dir][cycle[Math.floor(this.walkT * 7) % cycle.length]];
    } else {
      img = this.dir === 'down' && now > this.blinkAt ? this.frames.blinkDown : this.frames[this.dir][0];
    }
    if (now > this.blinkAt + 140) this.blinkAt = now + rand(2000, 6000);
    // shadow
    if (!this.seated) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(px + 4, py + 23, 8, 1);
      g.fillRect(px + 3, py + 22, 10, 1);
    }
    if (world.selected === this.id) {
      const pulse = Math.floor(now / 250) % 2;
      g.fillStyle = pulse ? '#ffe066' : '#ffb800';
      const by = this.seated ? py + 20 : py + 23;
      g.fillRect(px + 2, by, 12, 1); g.fillRect(px + 1, by - 1, 1, 1); g.fillRect(px + 14, by - 1, 1, 1);
    }
    g.save();
    if (offline) g.globalAlpha = 0.55;
    // idle "breathing" bob when standing still
    const bob = !this.seated && this.mode !== 'walk' && Math.floor((now + this.phaseOffset) / 600) % 2 ? 0 : 0;
    g.drawImage(img, px, py + bob);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Data sync
function upsertAgent(a, now = performance.now()) {
  const prev = world.agents.get(a.id);
  world.agents.set(a.id, a);
  let c = world.chars.get(a.id);
  if (!c) {
    c = new Char(a);
    world.chars.set(a.id, c);
    // initial placement without walking
    const atWork = a.status !== 'idle';
    if (atWork) {
      const s = c.deskSeat();
      if (s) c.placeAt({ x: s.x, y: s.y, facing: s.facing, seat: s, offY: s.offY });
    } else {
      c.placeAt(c.chooseIdleTarget());
    }
    c.lastStatus = a.status;
  } else if (!prev || prev.status !== a.status) {
    c.plan(now, true);
  } else if (JSON.stringify(prev.look) !== JSON.stringify(a.look)) {
    c.look = resolveLook(a.id, a.look);
    c.frames = buildCharacter(c.look);
  }
  if (!prev || prev.message !== a.message || prev.status !== a.status) c.bubbleUntil = now + 12000;
  c.lastStatus = a.status;
}

function applySnapshot(snap) {
  if (snap.office?.settings) setOfficeSettings(snap.office.settings, 'server');
  const ids = new Set(snap.agents.map((a) => a.id));
  for (const id of [...world.chars.keys()]) if (!ids.has(id)) { release(id); world.chars.delete(id); world.agents.delete(id); }
  for (const a of snap.agents) upsertAgent(a);
  renderRoster();
  renderPanel();
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('snapshot', (e) => { applySnapshot(JSON.parse(e.data)); setConn(true); });
  es.addEventListener('agent', (e) => { upsertAgent(JSON.parse(e.data)); renderRoster(); renderPanel(); });
  es.addEventListener('office', (e) => setOfficeSettings(JSON.parse(e.data), 'server'));
  es.onopen = () => setConn(true);
  es.onerror = () => setConn(false);
}
function setConn(ok) {
  world.connected = ok;
  const el = document.getElementById('conn');
  el.classList.toggle('ok', ok);
  el.title = ok ? 'Live: connected to server' : 'Reconnecting…';
}

// ---------------------------------------------------------------------------
// Office customization: rebuild the map, then keep every character's plan valid
let customize = null;
function setOfficeSettings(s, source = 'local') {
  if (source === 'server' && customize && customize.isDirty()) return; // local edits in flight win
  const S = applySettings(s);
  background = buildBackground();
  remapTargets();
  world.officeName = S.name;
  renderBrand(S);
  if (source === 'server' && customize) customize.sync(S);
}

// After a rebuild seats/spots are new objects and some may be gone (e.g. arcade
// toggled off). Re-attach characters to equivalent ones, or send them elsewhere.
function remapTargets(now = performance.now()) {
  for (const c of world.chars.values()) {
    const t = c.target;
    let ok = false;
    if (t && t.seat) {
      const ns = seats.find((s) => s.x === t.seat.x && s.y === t.seat.y && s.kind === t.seat.kind && s.desk === t.seat.desk);
      if (ns) { t.seat = ns; ok = true; }
    } else if (t && t.spot) {
      const ns = spots.find((s) => s.x === t.spot.x && s.y === t.spot.y && s.label === t.spot.label);
      if (ns) { t.spot = ns; ok = true; }
    } else if (t) {
      ok = walkable(t.x, t.y);
    }
    if (!ok) {
      release(c.id);
      c.target = null;
      c.dwellUntil = 0;
      if (c.mode === 'sit') c.mode = 'stand';
      c.plan(now, true);
    } else if (c.mode === 'walk') {
      c.goTo(t, now); // obstacles may have changed: re-path
    }
  }
}

function renderBrand(S) {
  const isOrbit = S.name.trim().toLowerCase() === 'orbit group';
  const logo = document.getElementById('brand-logo');
  const mark = document.getElementById('brand-mark');
  const name = document.getElementById('office-name');
  logo.hidden = !(S.sign === 'logo' && isOrbit);
  mark.hidden = !(S.sign === 'logo' && !isOrbit);
  name.hidden = S.sign === 'logo' && isOrbit;
  name.textContent = S.name;
  document.title = `${S.name} · Office`;
}

// ---------------------------------------------------------------------------
// View / zoom
const view = { zoom: 2, ox: 0, oy: 0, fit: true, dpr: 1, inset: 0 }; // inset: canvas px covered by the customize panel
function resize() {
  const wrap = document.getElementById('stage');
  const dpr = window.devicePixelRatio || 1;
  view.dpr = dpr;
  canvas.width = Math.floor(wrap.clientWidth * dpr);
  canvas.height = Math.floor(wrap.clientHeight * dpr);
  canvas.style.width = wrap.clientWidth + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  if (view.fit) fitZoom();
  clampPan();
}
function fitZoom() {
  const availW = canvas.width - view.inset;
  view.zoom = Math.max(1, Math.floor(Math.min(availW / W, canvas.height / H)));
  view.fit = true;
  view.ox = view.inset + Math.floor((availW - W * view.zoom) / 2);
  view.oy = Math.floor((canvas.height - H * view.zoom) / 2);
}
function clampPan() {
  const sw = W * view.zoom, sh = H * view.zoom;
  const availW = canvas.width - view.inset;
  if (sw <= availW) view.ox = view.inset + Math.floor((availW - sw) / 2);
  else view.ox = Math.min(view.inset, Math.max(canvas.width - sw, view.ox));
  if (sh <= canvas.height) view.oy = Math.floor((canvas.height - sh) / 2);
  else view.oy = Math.min(0, Math.max(canvas.height - sh, view.oy));
}
function setZoom(z, cx = canvas.width / 2, cy = canvas.height / 2) {
  z = Math.max(1, Math.min(12, Math.round(z)));
  if (z === view.zoom) return;
  const wx = (cx - view.ox) / view.zoom, wy = (cy - view.oy) / view.zoom;
  view.zoom = z;
  view.fit = false;
  view.ox = Math.round(cx - wx * z);
  view.oy = Math.round(cy - wy * z);
  clampPan();
  document.getElementById('zoom-level').textContent = `${z}x`;
}

// ---------------------------------------------------------------------------
// Rendering
const STATUS_COLORS = { working: '#45e27a', waiting: '#ffc53d', idle: '#7cc4ff', offline: '#8a90a0' };

function occupantOfDesk(index) {
  for (const c of world.chars.values()) {
    const a = c.agent;
    if (a && a.desk === index && c.atDesk) return c;
  }
  return null;
}

const ALT_ACTIVITY = { command: 'read', write: 'read', read: 'write' };
function drawMonitor(g, d, now, idx = 0) {
  const m = monitorRect(d, idx);
  const c = occupantOfDesk(d.index);
  const a0 = c && c.agent;
  // the second screen shows something complementary to the first
  const a = a0 && idx === 1 && a0.status === 'working' ? { ...a0, activity: ALT_ACTIVITY[a0.activity || 'write'] } : a0;
  const x = m.x, y = m.y;
  g.fillStyle = '#15161b'; g.fillRect(x, y, 14, 12);
  g.fillStyle = '#2a2c33'; g.fillRect(x + 5, y + 12, 4, 3); g.fillRect(x + 3, y + 14, 8, 1);
  g.fillStyle = '#34363f'; g.fillRect(x, y, 14, 1);
  const sx = x + 1, sy = y + 1, sw = 12, sh = 9;
  const t = Math.floor(now / 220);
  let glow = null;
  if (!a || a.status === 'offline') {
    g.fillStyle = '#0c0d11'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = '#1c1e26'; g.fillRect(sx + 1, sy + 1, 3, 1);
    g.fillStyle = a ? '#f0a33c' : '#3a3d48'; g.fillRect(x + 12, y + 10, 1, 1);
  } else if (a.status === 'waiting') {
    g.fillStyle = '#1a1c24'; g.fillRect(sx, sy, sw, sh);
    if (Math.floor(now / 450) % 2) drawText(g, '?', sx + 5, sy + 2, '#ffc53d');
    glow = '#ffc53d';
  } else if (a.status === 'idle') {
    g.fillStyle = '#0d1020'; g.fillRect(sx, sy, sw, sh);
    const p = Math.floor(now / 400);
    g.fillStyle = '#4d7cff'; g.fillRect(sx + (p % 10), sy + ((p >> 1) % 7), 2, 2);
    glow = '#4d7cff';
  } else {
    const act = a.activity || 'write';
    const analyst = /analy|portfolio|invest|market|finan/i.test(a.role || '');
    if (act === 'command') {
      g.fillStyle = '#07090c'; g.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 4; i++) {
        const w = 3 + Math.floor(((i + t) * 37 % 7));
        g.fillStyle = i === 3 ? '#b6f09c' : '#2fbf5f'; g.fillRect(sx + 1, sy + 1 + i * 2, w, 1);
      }
      if (Math.floor(now / 400) % 2) { g.fillStyle = '#b6f09c'; g.fillRect(sx + 9, sy + 7, 2, 1); }
      glow = '#45e27a';
    } else if (act === 'read' && analyst) {
      g.fillStyle = '#0b0f18'; g.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 5; i++) {
        const v = Math.sin((i + t * 0.25) * 1.3) * 2 + Math.sin(i * 0.7 + t * 0.1);
        const up = Math.sin(i * 2.1 + t * 0.3) > 0;
        const cy = sy + 4 - Math.round(v * 0.8);
        g.fillStyle = up ? '#45e27a' : '#ff5c5c';
        g.fillRect(sx + 1 + i * 2, cy, 1, 3);
        g.fillStyle = up ? '#2a8a4a' : '#a33a3a';
        g.fillRect(sx + 1 + i * 2, cy - 1, 1, 5);
        g.fillStyle = up ? '#45e27a' : '#ff5c5c';
        g.fillRect(sx + 1 + i * 2, cy, 1, 3);
      }
      glow = '#4d7cff';
    } else if (act === 'read') {
      g.fillStyle = '#e8edf4'; g.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 4; i++) {
        const w = 5 + ((i + t) * 13 % 5);
        g.fillStyle = i === 0 && t % 8 < 4 ? '#2f6fdb' : '#8e96a8'; g.fillRect(sx + 2, sy + 1 + i * 2, w, 1);
      }
      glow = '#dfe8ff';
    } else {
      g.fillStyle = '#1b1f2b'; g.fillRect(sx, sy, sw, sh);
      const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff'];
      for (let i = 0; i < 4; i++) {
        const n = i + t;
        const indent = (n * 3) % 4;
        const w = 2 + ((n * 7) % 6);
        g.fillStyle = cols[n % cols.length]; g.fillRect(sx + 1 + indent, sy + 1 + i * 2, w, 1);
      }
      if (Math.floor(now / 300) % 2) { g.fillStyle = '#ffffff'; g.fillRect(sx + 1 + ((t * 3) % 4) + 6, sy + 7, 1, 1); }
      glow = '#82aaff';
    }
  }
  return glow ? { x: x + 7, y: y + 5, color: glow } : null;
}

function drawTypingHands(g, d, c, now) {
  const a = c.agent;
  if (!a || a.status !== 'working') return;
  const X = d.x * T, Y = d.y * T;
  const typing = a.activity !== 'read';
  const f = typing ? Math.floor((now + c.phaseOffset) / 130) % 2 : 0;
  g.fillStyle = c.look.skin;
  g.fillRect(X + 19, Y - 4 + f, 3, 2);
  g.fillRect(X + 26, Y - 4 + (typing ? 1 - f : 0), 3, 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(X + 19, Y - 2 + f, 3, 1);
  g.fillRect(X + 26, Y - 2 + (typing ? 1 - f : 0), 3, 1);
}

function renderScene(now) {
  world.date = timeNow();
  const lighting = settings().lighting;
  world.phase = params.get('phase') || (lighting && lighting !== 'auto' ? lighting : skyPhase(world.date));
  const g = sctx;
  g.imageSmoothingEnabled = false;
  g.drawImage(background, 0, 0);
  drawWallDecor(g, now, world);

  const items = [];
  for (const f of furniture) items.push({ y: f.sortY, draw: () => f.draw(g, now, world), f });
  for (const c of world.chars.values()) items.push({ y: c.sortY() + (c.seated && c.target.facing === 'up' ? 0.5 : 0), draw: () => c.draw(g, now) });
  items.sort((a, b) => a.y - b.y);
  const glows = [];
  for (const it of items) {
    it.draw();
    if (it.f && it.f.desk !== undefined) {
      const d = desks[it.f.desk];
      for (let mi = 0; mi < monitorCount(); mi++) {
        const gl = drawMonitor(g, d, now, mi);
        if (gl) glows.push(gl);
      }
      const occ = occupantOfDesk(d.index);
      if (occ) drawTypingHands(g, d, occ, now);
    }
  }

  // time-of-day lighting
  const tint = { night: '#8690c6', dusk: '#f2cfb4', dawn: '#ddd2ea' }[world.phase];
  if (tint) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, W, H);
    g.restore();
    if (world.phase === 'night' || world.phase === 'dusk') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const all = [...glows.map((l) => ({ ...l, r: 14, a: 0.22 })), ...lights];
      for (const l of all) {
        const grad = g.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.r);
        grad.addColorStop(0, hexA(l.color, l.a));
        grad.addColorStop(1, hexA(l.color, 0));
        g.fillStyle = grad;
        g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      g.restore();
    }
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function renderOverlay(now) {
  const g = ctx;
  const z = view.zoom;
  const fs = Math.max(Math.round(10 * view.dpr), Math.round(z * 5.6));
  const pad = Math.round(fs * 0.4);
  const placed = [];
  const list = [...world.chars.values()].sort((a, b) => b.sortY() - a.sortY());
  const hits = [];
  for (const c of list) {
    const a = c.agent;
    if (!a) continue;
    const { px, py } = c.spriteRect();
    const cx = view.ox + (px + 8) * z;
    let top = view.oy + (py + 1) * z;
    // label
    g.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const name = a.name;
    const tw = g.measureText(name).width;
    const dot = Math.round(fs * 0.5);
    const lw = Math.round(tw + pad * 3 + dot), lh = Math.round(fs * 1.45);
    let rect = { x: Math.round(cx - lw / 2), y: Math.round(top - lh - z), w: lw, h: lh };
    for (let i = 0; i < 6 && placed.some((p) => overlaps(p, rect)); i++) rect.y -= lh + 2;
    placed.push(rect);
    hits.push({ id: c.id, ...rect });
    const offline = a.status === 'offline';
    g.fillStyle = world.selected === c.id ? 'rgba(255,200,40,0.95)' : offline ? 'rgba(30,31,38,0.75)' : 'rgba(14,15,20,0.86)';
    roundRect(g, rect.x, rect.y, rect.w, rect.h, Math.round(lh / 3));
    g.fill();
    g.fillStyle = STATUS_COLORS[a.status] || '#fff';
    g.beginPath();
    g.arc(rect.x + pad + dot / 2, rect.y + lh / 2, dot / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = world.selected === c.id ? '#15161b' : offline ? '#a4a9b6' : '#ffffff';
    g.textBaseline = 'middle';
    g.fillText(name, rect.x + pad * 2 + dot, rect.y + lh / 2 + 1);

    // bubble
    const bubble = bubbleFor(c, a, now);
    if (!bubble) continue;
    const bfs = Math.round(fs * 0.92);
    g.font = `500 ${bfs}px ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
    const iconScale = Math.max(1, Math.round(bfs / 9));
    const iconW = bubble.icon ? 8 * iconScale + pad : 0;
    const maxText = Math.round(Math.max(60 * z, 150 * view.dpr));
    const text = bubble.text ? ellipsize(g, bubble.text, maxText) : '';
    const textW = text ? g.measureText(text).width : 0;
    const bw = Math.round(iconW + textW + pad * 2 + (bubble.big ? bfs : 0));
    const bh = Math.round(Math.max(bfs * 1.6, 8 * iconScale + pad * 1.4));
    const bounce = bubble.bounce ? Math.round(Math.abs(Math.sin(now / 250)) * z) : 0;
    let br = { x: Math.round(cx - bw / 2), y: rect.y - bh - Math.round(z * 2.5) - bounce, w: bw, h: bh };
    for (let i = 0; i < 6 && placed.some((p) => overlaps(p, br)); i++) br.y -= bh + 2;
    placed.push(br);
    const u = Math.max(1, Math.round(z / 2));
    g.fillStyle = bubble.border;
    roundRect(g, br.x - u, br.y - u, br.w + 2 * u, br.h + 2 * u, Math.round(bh / 4) + u);
    g.fill();
    // tail
    const tx = Math.round(cx);
    g.beginPath();
    g.moveTo(tx - 3 * u, br.y + br.h);
    g.lineTo(tx + 3 * u, br.y + br.h);
    g.lineTo(tx, br.y + br.h + 4 * u);
    g.closePath();
    g.fill();
    g.fillStyle = bubble.bg;
    roundRect(g, br.x, br.y, br.w, br.h, Math.round(bh / 4));
    g.fill();
    g.beginPath();
    g.moveTo(tx - 2 * u, br.y + br.h - 1);
    g.lineTo(tx + 2 * u, br.y + br.h - 1);
    g.lineTo(tx, br.y + br.h + 2 * u);
    g.closePath();
    g.fill();
    let x = br.x + pad;
    if (bubble.big) {
      g.fillStyle = bubble.fg;
      g.font = `800 ${Math.round(bfs * 1.15)}px ui-monospace, Menlo, monospace`;
      g.fillText(bubble.big, x, br.y + bh / 2 + 1);
      x += bfs;
      g.font = `500 ${bfs}px ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
    }
    if (bubble.icon) {
      const ic = icon(bubble.icon);
      g.imageSmoothingEnabled = false;
      g.drawImage(ic, x, Math.round(br.y + (bh - 8 * iconScale) / 2), 8 * iconScale, 8 * iconScale);
      x += iconW;
    }
    if (text) {
      g.fillStyle = bubble.fg;
      g.fillText(text, x, br.y + bh / 2 + 1);
    }
    hits.push({ id: c.id, ...br });
  }
  world.hitboxes = hits;
}

function bubbleFor(c, a, now) {
  const msg = (a.message || '').replace(/\s+/g, ' ').trim();
  if (a.status === 'working') {
    return { icon: a.activity || 'write', text: msg || { read: 'Reading…', write: 'Writing…', command: 'Running a command…' }[a.activity || 'write'], bg: '#ffffff', fg: '#1b1d23', border: '#1b1d23' };
  }
  if (a.status === 'waiting') {
    return { big: '?', text: msg || 'Needs your input', bg: '#ffe27a', fg: '#3a2a00', border: '#6b4e00', bounce: true };
  }
  if (a.status === 'offline') {
    const t = Math.floor(now / 700) % 3;
    return { text: ['z', 'zZ', 'zZz'][t], bg: '#2a2c35', fg: '#aab0bf', border: '#15161b' };
  }
  // idle
  if (msg && now < c.bubbleUntil) return { text: msg, bg: '#eef3ff', fg: '#1b1d23', border: '#3a4a6b' };
  if (c.mode === 'stand' && c.target && c.target.spot && c.target.spot.icon) return { icon: c.target.spot.icon, bg: '#ffffff', fg: '#1b1d23', border: '#1b1d23' };
  return null;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const c of world.chars.values()) c.update(dt, now);
  renderScene(now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, view.ox, view.oy, W * view.zoom, H * view.zoom);
  renderOverlay(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// UI: roster chips + side panel
const rosterEl = document.getElementById('roster');
function renderRoster() {
  const list = [...world.agents.values()];
  rosterEl.innerHTML = '';
  for (const a of list) {
    const b = document.createElement('button');
    b.className = 'chip' + (world.selected === a.id ? ' active' : '');
    b.innerHTML = `<span class="dot" style="background:${STATUS_COLORS[a.status]}"></span><span></span>`;
    b.lastChild.textContent = a.name;
    b.title = `${a.name} — ${a.status}${a.message ? ': ' + a.message : ''}`;
    b.onclick = () => select(a.id);
    rosterEl.appendChild(b);
  }
}

const panel = document.getElementById('panel');
function select(id) {
  world.selected = id;
  renderRoster();
  renderPanel();
}
function relTime(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const STATUS_TEXT = { working: 'Working', waiting: 'Waiting for input', idle: 'Idle', offline: 'Offline' };
const ACTIVITY_TEXT = { read: 'Reading', write: 'Writing', command: 'Running commands' };
function renderPanel() {
  const a = world.agents.get(world.selected);
  if (!a) { panel.hidden = true; return; }
  panel.hidden = false;
  const c = world.chars.get(a.id);
  const pc = document.getElementById('portrait');
  const pg = pc.getContext('2d');
  pg.imageSmoothingEnabled = false;
  pg.clearRect(0, 0, pc.width, pc.height);
  pg.drawImage(c.frames.down[0], 0, 0, 16, 24, 8, 4, 64, 96);
  document.getElementById('p-name').textContent = a.name;
  const role = document.getElementById('p-role');
  role.textContent = a.role || 'Teammate · no role set yet';
  role.classList.toggle('muted', !a.role);
  const st = document.getElementById('p-status');
  st.textContent = STATUS_TEXT[a.status] + (a.status === 'working' && a.activity ? ` · ${ACTIVITY_TEXT[a.activity]}` : '');
  st.style.setProperty('--c', STATUS_COLORS[a.status]);
  const msg = document.getElementById('p-message');
  msg.textContent = a.message || '—';
  msg.classList.toggle('muted', !a.message);
  const up = document.getElementById('p-updated');
  up.textContent = a.updatedAt ? `${new Date(a.updatedAt).toLocaleString()} (${relTime(a.updatedAt)})` : 'No updates yet';
  document.getElementById('p-desk').textContent = a.desk != null ? `Desk ${a.desk + 1}` : 'Hot desk';
  document.getElementById('p-id').textContent = a.id;
}
setInterval(() => { if (!panel.hidden) renderPanel(); }, 15000);
document.getElementById('p-close').onclick = () => select(null);

// ---------------------------------------------------------------------------
// Input
function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = (clientX - r.left) * view.dpr, y = (clientY - r.top) * view.dpr;
  for (const h of world.hitboxes || []) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
  const wx = (x - view.ox) / view.zoom, wy = (y - view.oy) / view.zoom;
  const list = [...world.chars.values()].sort((a, b) => b.sortY() - a.sortY());
  for (const c of list) {
    const { px, py } = c.spriteRect();
    if (wx >= px + 2 && wx <= px + 14 && wy >= py && wy <= py + 24) return c.id;
  }
  return null;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      view.ox = Math.round(drag.ox + dx * view.dpr);
      view.oy = Math.round(drag.oy + dy * view.dpr);
      clampPan();
    }
  } else {
    canvas.style.cursor = hitTest(e.clientX, e.clientY) ? 'pointer' : 'default';
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) select(hitTest(e.clientX, e.clientY));
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) {
    setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1), (e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr);
  } else {
    view.ox -= Math.round(e.deltaX * view.dpr);
    view.oy -= Math.round(e.deltaY * view.dpr);
    clampPan();
  }
}, { passive: false });
document.getElementById('zoom-in').onclick = () => setZoom(view.zoom + 1);
document.getElementById('zoom-out').onclick = () => setZoom(view.zoom - 1);
document.getElementById('zoom-fit').onclick = () => { fitZoom(); document.getElementById('zoom-level').textContent = `${view.zoom}x`; };
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
  if (e.key === '+' || e.key === '=') setZoom(view.zoom + 1);
  else if (e.key === '-') setZoom(view.zoom - 1);
  else if (e.key === '0') document.getElementById('zoom-fit').click();
  else if (e.key === 'Escape') { if (customize && customize.isOpen()) customize.close(); else select(null); }
});
window.addEventListener('resize', () => { resize(); document.getElementById('zoom-level').textContent = `${view.zoom}x`; });

// clock in header
function tickClock() {
  const d = timeNow();
  document.getElementById('clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickClock, 10000);

// sanity: every spot/seat must be reachable
for (const s of [...spots]) if (!walkable(s.x, s.y)) console.warn('unwalkable spot', s);

resize();
document.getElementById('zoom-level').textContent = `${view.zoom}x`;
tickClock();
renderBrand(settings());
// While the customize panel is open, fit the office into the space beside it.
function setInset(px) {
  view.inset = Math.round(px * view.dpr);
  if (view.fit) fitZoom();
  clampPan();
  document.getElementById('zoom-level').textContent = `${view.zoom}x`;
}
customize = initCustomize({
  onChange: (s) => setOfficeSettings(s, 'local'),
  onOpen: (width) => setInset(window.innerWidth > 900 ? width + 28 : 0),
  onClose: () => setInset(0),
});
connect();
requestAnimationFrame(frame);

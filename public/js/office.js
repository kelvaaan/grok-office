// Office map, furniture and all environment pixel art (original, drawn in code).
// Everything customizable (walls, floors, accessories, branding) is driven by the
// settings object passed to applySettings(); call buildBackground() afterwards.
import { drawText, textWidth } from './font.js';

export const T = 16;
export const COLS = 40;
export const ROWS = 22;
export const W = COLS * T;
export const H = ROWS * T;

const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const cache = new Map();
function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    cache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Settings (see office-config.json for the full schema and defaults)
export const FALLBACK_SETTINGS = {
  name: 'Orbit Group', sign: 'logo', preset: 'orbit-classic', lighting: 'auto',
  walls: { work: 'charcoal', meeting: 'charcoal', lounge: 'charcoal' }, accent: 'none',
  floors: { work: 'wood-honey', meeting: 'carpet-grey', lounge: 'tile-blue', kitchen: 'checker-cream' },
  accessories: {
    plants: true, bookshelves: true, whiteboards: true, serverRacks: true, pingPong: true, arcade: true, neon: true,
    clock: true, windows: true, coffeeMachine: true, beanBags: true, rugs: true, artwork: true, meetingTv: true,
    collabTable: true, printer: true, deskItems: true, deskLamps: false,
  },
  monitors: 1, plantStyle: 'mixed', rugColor: 'sunset', sofaColor: 'charcoal',
};
let S = FALLBACK_SETTINGS;
export const settings = () => S;
const on = (item) => S.accessories[item] !== false;

// ---------------------------------------------------------------------------
// Map layout
// Floor codes: X solid wall top, F wall face, w wood, c carpet, b lounge tile, k kitchen tile
export const floor = [];
for (let y = 0; y < ROWS; y++) {
  const row = [];
  for (let x = 0; x < COLS; x++) {
    let f;
    if (x === 0 || x === COLS - 1 || y === ROWS - 1) f = 'X';
    else if (y <= 2) f = x === 23 ? 'X' : 'F';
    else if (x === 23) f = (y === 7 || y === 8 || y === 16 || y === 17) ? 'w' : 'X';
    else if (x < 23) f = 'w';
    else if (y <= 9) f = 'c';
    else if (y === 10) f = x === 25 || x === 26 ? 'c' : 'X';
    else if (y === 11) f = x === 25 || x === 26 ? 'b' : 'F';
    else f = x >= 34 ? 'k' : 'b';
    row.push(f);
  }
  floor.push(row);
}
export const isFloor = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && 'wcbk'.includes(floor[y][x]);
const ROOM_OF = { w: 'work', c: 'meeting', b: 'lounge', k: 'kitchen' };

// Zones (for idle wandering)
export const ZONES = {
  lounge: { x0: 24, y0: 12, x1: 33, y1: 20 },
  kitchen: { x0: 34, y0: 13, x1: 38, y1: 20 },
  meeting: { x0: 24, y0: 3, x1: 38, y1: 9 },
  collab: { x0: 2, y0: 13, x1: 19, y1: 20 },
};

// ---------------------------------------------------------------------------
// Furniture registry (rebuilt by applySettings; arrays keep their identity)
export const furniture = []; // {x,y,w,h,block,sortY,draw(ctx,now,world)}
export const seats = []; // {x,y,facing,offY,kind,desk?}
export const spots = []; // standing idle spots {x,y,facing,label}
export const desks = []; // {index,x,y,chair:{x,y}}
export const lights = []; // night-time light sources {x,y,r,color,a}
const wallDecor = []; // drawn right after the background: {static(ctx)} or {draw(ctx,now,world)}

function add(item) { furniture.push(item); return item; }

// ---------------------------------------------------------------------------
// Floors
const WOODS = {
  'wood-honey': { tones: ['#a4733f', '#9c6c3a', '#a97a47', '#a06f3c'], line: '#8a5c30', seam: '#7d5330', speck: '#93633a' },
  'wood-light': { tones: ['#d3ae7c', '#cca574', '#d8b584', '#cfa978'], line: '#b8905f', seam: '#aa8252', speck: '#c29a6a' },
  'wood-dark': { tones: ['#5f3e27', '#593a24', '#65432b', '#5c3c25'], line: '#482d1b', seam: '#3c2516', speck: '#523520' },
};
const CARPETS = {
  'carpet-grey': ['#474b59', '#51566a'],
  'carpet-blue': ['#2e4877', '#3a5790'],
  'carpet-green': ['#35604a', '#417459'],
};
export function drawFloorStyle(ctx, X, Y, tx, ty, style) {
  if (WOODS[style]) {
    const p = WOODS[style];
    for (let r = 0; r < 4; r++) {
      const pr = ty * 4 + r;
      R(ctx, X, Y + r * 4, T, 4, p.tones[pr % 4]);
      R(ctx, X, Y + r * 4, T, 1, p.line);
      for (let i = 0; i < T; i++) {
        const wx = tx * T + i;
        if ((wx + pr * 11) % 28 === 0) R(ctx, X + i, Y + r * 4, 1, 4, p.seam);
        else if (hash2(wx, ty * T + r * 4 + 2) > 0.93) R(ctx, X + i, Y + r * 4 + 2, 1, 1, p.speck);
      }
    }
  } else if (CARPETS[style]) {
    const [base, dot] = CARPETS[style];
    R(ctx, X, Y, T, T, base);
    for (let i = 0; i < T; i += 4) for (let j = 0; j < T; j += 4) R(ctx, X + i + ((j / 4) % 2) * 2, Y + j, 1, 1, dot);
  } else if (style === 'tile-blue') {
    R(ctx, X, Y, T, T, '#3d6891');
    R(ctx, X, Y, T, 1, '#34597c');
    R(ctx, X, Y, 1, T, '#34597c');
    R(ctx, X + 1, Y + 1, T - 2, 1, '#4675a0');
    R(ctx, X + 1, Y + 1, 1, T - 2, '#4675a0');
    if (hash2(tx, ty) > 0.7) R(ctx, X + 5 + ((tx * 3) % 6), Y + 6 + ((ty * 5) % 6), 2, 1, '#42709a');
  } else if (style === 'checker-cream' || style === 'checker-bw') {
    const [a, b, grout] = style === 'checker-bw' ? ['#e6e6e2', '#232428', null] : ['#ebe5d6', '#d9d1bf', '#c9c0ac'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) R(ctx, X + i * 8, Y + j * 8, 8, 8, (i + j) % 2 ? b : a);
    if (grout) { R(ctx, X, Y, T, 1, grout); R(ctx, X, Y, 1, T, grout); }
  } else if (style === 'concrete') {
    R(ctx, X, Y, T, T, '#8a8c90');
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) {
      const h = hash2(tx * T + i, ty * T + j);
      if (h > 0.94) R(ctx, X + i, Y + j, 1, 1, '#7c7e83');
      else if (h < 0.04) R(ctx, X + i, Y + j, 1, 1, '#999ba0');
    }
    if (tx % 3 === 0) R(ctx, X, Y, 1, T, '#76787d');
    if (ty % 3 === 0) R(ctx, X, Y, T, 1, '#76787d');
  } else if (style === 'marble') {
    R(ctx, X, Y, T, T, '#e7e5e0');
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) {
      const gx = tx * T + i, gy = ty * T + j;
      const v = (gx + gy * 0.55 + Math.sin(gy * 0.35 + gx * 0.05) * 3) % 37;
      if (v < 0.9) R(ctx, X + i, Y + j, 1, 1, '#bdb8af');
      else if (v > 18 && v < 18.6 && hash2(gx, gy) > 0.4) R(ctx, X + i, Y + j, 1, 1, '#d2cec6');
    }
    R(ctx, X, Y, T, 1, '#d6d3cc'); R(ctx, X, Y, 1, T, '#d6d3cc');
  } else {
    R(ctx, X, Y, T, T, '#555');
  }
}

// ---------------------------------------------------------------------------
// Walls
const WALLS = {
  charcoal: { edge: '#3c404d', face: '#2b2e39', hi: '#343845', groove: '#272a34', lower: '#282b35', trim: '#454a58', base: '#1c1e25', pattern: 'panel' },
  black: { edge: '#2c2d33', face: '#141418', hi: '#1c1c21', groove: '#101013', lower: '#111114', trim: '#393a41', base: '#08080a', pattern: 'panel' },
  'warm-white': { edge: '#b3a996', face: '#e6dfd1', hi: '#efe9de', groove: '#dcd4c4', lower: '#ddd5c5', trim: '#f6f2e9', base: '#a99c85', pattern: 'panel' },
  navy: { edge: '#34436a', face: '#1f2b48', hi: '#283659', groove: '#1a2440', lower: '#1c2743', trim: '#3f4f79', base: '#121a2d', pattern: 'panel' },
  sage: { edge: '#63775e', face: '#8ca385', hi: '#98ae91', groove: '#83997c', lower: '#7d9377', trim: '#b5c7ae', base: '#4f5f49', pattern: 'panel' },
  brick: { edge: '#5c3226', face: '#9a4a36', hi: '#ab5741', groove: '#c8b5a2', lower: '#8a4230', trim: '#d6c6b5', base: '#40241c', pattern: 'brick' },
  'wood-panel': { edge: '#5c3d22', face: '#8a5e3a', hi: '#9a6b44', groove: '#6c472a', lower: '#7a5232', trim: '#b08256', base: '#35230f', pattern: 'planks' },
  terracotta: { edge: '#7c4230', face: '#c06a4b', hi: '#cc7858', groove: '#b36146', lower: '#ad5d41', trim: '#e0a58a', base: '#5a2e20', pattern: 'panel' },
};
const ACCENTS = { white: '#eeebe4', black: '#151519', orange: '#df7438', teal: '#2c8c87', sage: '#7c9875', navy: '#24325b', wood: '#7a5232' };
export function wallStyle(id) { return WALLS[id] || WALLS.charcoal; }

// Draw a wall face segment. top = y of the edge line, h = face height incl. trim/base.
function drawWallFace(ctx, X, top, w, h, styleId, accentId, tx) {
  const s = wallStyle(styleId);
  const faceTop = top + 1, trimY = top + h - 4, faceH = trimY - faceTop;
  const lowerY = faceTop + Math.round(faceH * 0.6);
  R(ctx, X, top, w, 1, s.edge);
  R(ctx, X, faceTop, w, faceH, s.face);
  if (s.pattern === 'brick') {
    for (let y = faceTop; y < trimY; y += 4) {
      const row = (y - faceTop) / 4;
      R(ctx, X, y, w, 1, s.groove);
      for (let x = 0; x < w; x++) {
        const gx = tx * T + x;
        if ((gx + (row % 2) * 4) % 8 === 0) R(ctx, X + x, y, 1, 4, s.groove);
        else if (hash2(gx, y) > 0.9) R(ctx, X + x, y + 2, 1, 1, s.hi);
      }
    }
  } else if (s.pattern === 'planks') {
    for (let x = 0; x < w; x++) {
      const gx = tx * T + x;
      if (gx % 6 === 0) R(ctx, X + x, faceTop, 1, faceH, s.groove);
      else if (gx % 12 < 6) R(ctx, X + x, faceTop, 1, faceH, s.hi);
    }
  } else {
    R(ctx, X, faceTop, w, 1, s.hi);
    if (tx % 2 === 0) R(ctx, X, faceTop + 1, 1, faceH - 1, s.groove);
  }
  const acc = ACCENTS[accentId];
  if (acc) {
    R(ctx, X, lowerY - 1, w, 1, shadeHex(acc, 0.25));
    R(ctx, X, lowerY, w, trimY - lowerY, acc);
    if (tx % 2 === 0) R(ctx, X, lowerY, 1, trimY - lowerY, shadeHex(acc, -0.12));
  } else if (s.pattern === 'panel') {
    R(ctx, X, lowerY - 1, w, 1, s.hi);
    R(ctx, X, lowerY, w, trimY - lowerY, s.lower);
  }
  R(ctx, X, trimY, w, 1, s.trim);
  R(ctx, X, trimY + 1, w, 3, s.base);
}
export function drawWallSwatch(ctx, styleId, accentId, w, h) {
  R(ctx, 0, 0, w, 4, '#16171c');
  for (let x = 0; x < w; x += T) drawWallFace(ctx, x, 4, Math.min(T, w - x), h - 4, styleId, accentId, x / T);
}
export function drawFloorSwatch(ctx, styleId, w, h) {
  for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) drawFloorStyle(ctx, x, y, 3 + x / T, 5 + y / T, styleId);
}
export const ACCENT_COLORS = ACCENTS;

function wallRoomAt(x) { return x < 23 ? 'work' : 'meeting'; }

function drawFloors(ctx) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const f = floor[y][x];
    if (!ROOM_OF[f]) continue;
    // door thresholds belong to the room they open from
    drawFloorStyle(ctx, x * T, y * T, x, y, S.floors[ROOM_OF[f]]);
  }
}

function drawWalls(ctx) {
  // Top wall face (rows 0-2): wall top band + face
  for (let x = 0; x < COLS; x++) {
    const X = x * T;
    if (floor[1][x] !== 'F') continue;
    R(ctx, X, 0, T, 7, '#16171c');
    drawWallFace(ctx, X, 7, T, 41, S.walls[wallRoomAt(x)], S.accent, x);
  }
  // Lounge partition face (row 11)
  for (let x = 24; x < COLS - 1; x++) {
    if (floor[11][x] !== 'F') continue;
    drawWallFace(ctx, x * T, 11 * T, T, 16, S.walls.lounge, S.accent, x);
  }
  // Solid wall tops
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (floor[y][x] !== 'X') continue;
    const X = x * T, Y = y * T;
    R(ctx, X, Y, T, T, '#1a1b21');
    R(ctx, X + 2, Y + 2, T - 4, T - 4, '#202229');
    if (isFloor(x - 1, y)) R(ctx, X, Y, 1, T, '#3a3d49');
    if (isFloor(x + 1, y)) R(ctx, X + T - 1, Y, 1, T, '#3a3d49');
    if (isFloor(x, y + 1) || (y + 1 < ROWS && floor[y + 1][x] === 'F')) R(ctx, X, Y + T - 1, T, 1, '#3a3d49');
    if (isFloor(x, y - 1)) R(ctx, X, Y, T, 1, '#2e313b');
  }
  // door thresholds
  for (const [x, y] of [[23, 7], [23, 16]]) { R(ctx, x * T, y * T, T, 1, '#1a1b21'); R(ctx, x * T, (y + 2) * T - 1, T, 1, '#6b4a2c'); }
}

// ---------------------------------------------------------------------------
// Rugs
const RUGS = {
  sunset: ['#c9773a', '#e3a65c', '#8f4f25'],
  mono: ['#1d1d22', '#ededea', '#0b0b0e'],
  navy: ['#2b3f6e', '#6b86c4', '#1b2847'],
  forest: ['#3d6b45', '#7fb07a', '#274a2e'],
  berry: ['#8a3b5c', '#cf7598', '#5c2440'],
  sand: ['#c9ad80', '#ecdcb9', '#96805c'],
};
export const RUG_COLORS = RUGS;
function drawRugs(ctx) {
  if (!on('rugs')) return;
  const [b, l, d] = RUGS[S.rugColor] || RUGS.sunset;
  rug(ctx, 25 * T + 4, 13 * T + 2, 7 * T - 8, 7 * T - 4, b, l, d); // lounge
  if (on('collabTable')) rug(ctx, 9 * T + 6, 14 * T + 10, 6 * T - 12, 5 * T - 4, '#40475a', '#5d6784', '#2c3140'); // collab
  rug(ctx, 27 * T + 8, 3 * T + 10, 8 * T - 16, 6 * T - 4, '#3a3f4f', '#4f566b', '#2b2f3b'); // meeting
}
function rug(ctx, x, y, w, h, base, light, dark) {
  R(ctx, x + 1, y, w - 2, h, dark);
  R(ctx, x, y + 1, w, h - 2, dark);
  R(ctx, x + 2, y + 2, w - 4, h - 4, base);
  R(ctx, x + 4, y + 4, w - 8, 1, light);
  R(ctx, x + 4, y + h - 5, w - 8, 1, light);
  R(ctx, x + 4, y + 4, 1, h - 8, light);
  R(ctx, x + w - 5, y + 4, 1, h - 8, light);
  for (let i = x + 8; i < x + w - 8; i += 6) R(ctx, i, y + h / 2 - 1, 2, 2, light);
}

export function buildBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  R(ctx, 0, 0, W, H, '#101116');
  drawFloors(ctx);
  drawRugs(ctx);
  drawWalls(ctx);
  for (const d of wallDecor) if (d.static) d.static(ctx);
  return c;
}

export function drawWallDecor(ctx, now, world) {
  for (const d of wallDecor) if (d.draw) d.draw(ctx, now, world);
}

// ---------------------------------------------------------------------------
// Orbit Group brand mark, drawn as pixel art (ring + inner orbit stroke + wordmark)
const LOGO_GLYPHS = {
  // 7-row cap height; lowercase x-height rows 2..6; descender rows 7..8
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  b: ['#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'],
  o: ['....', '....', '.##.', '#..#', '#..#', '#..#', '.##.'],
  u: ['....', '....', '#..#', '#..#', '#..#', '#..#', '.###'],
  p: ['....', '....', '###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'],
};
function drawLogoWord(ctx, word, x, y, color) {
  let cx = x;
  ctx.fillStyle = color;
  for (const ch of word) {
    const g = LOGO_GLYPHS[ch];
    if (!g) { cx += 3; continue; }
    g.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(cx + c, y + r, 1, 1); });
    cx += g[0].length + 1;
  }
  return cx - x - 1;
}
// Ring of diameter d with the inner "orbit" stroke curving through the lower right.
// Small sizes use hand-drawn bitmaps; larger ones are rasterised from the geometry
// fitted to the logo (arc centre offset up-left of the ring centre).
const MARK_BITMAPS = {
  7: ['..###..', '.#...#.', '#.....#', '#...#.#', '#..##.#', '.#...#.', '..###..'],
  9: ['..#####..', '.#.....#.', '#.......#', '#.....#.#', '#.....#.#', '#...##..#', '#.......#', '.#.....#.', '..#####..'],
  18: [
    '......######......',
    '....##########....',
    '...###......###...',
    '..###........###..',
    '.###..........###.',
    '.##............##.',
    '##..........##..##',
    '##..........##..##',
    '##..........##..##',
    '##.........##...##',
    '##........###...##',
    '##.....#####....##',
    '.##....####....##.',
    '.###..........###.',
    '..###........###..',
    '...###......###...',
    '....##########....',
    '......######......',
  ],
};
export function drawOrbitMark(ctx, x, y, d, color) {
  ctx.fillStyle = color;
  const bmp = MARK_BITMAPS[d];
  if (bmp) {
    bmp.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c, y + r, 1, 1); });
    return;
  }
  const r = d / 2;
  const stroke = Math.max(1, Math.round(d / 9));
  const inner = r - stroke;
  const arcR = inner * 0.68, arcW = Math.max(1, stroke * 0.95);
  const ox = -d / 30, oy = -d / 10; // arc centre offset
  for (let py = 0; py < d; py++) for (let px = 0; px < d; px++) {
    const dx = px + 0.5 - r, dy = py + 0.5 - r;
    const dist = Math.hypot(dx, dy);
    let hit = dist <= r && dist >= inner;
    if (!hit) {
      const ax = dx - ox, ay = dy - oy;
      const ang = Math.atan2(ay, ax) * 180 / Math.PI; // 0 = right, 90 = down
      if (ang >= -2 && ang <= 92 && Math.abs(Math.hypot(ax, ay) - arcR) <= arcW / 2 + 0.4) hit = true;
    }
    if (hit) ctx.fillRect(x + px, y + py, 1, 1);
  }
}
// Full sign: returns width/height. Plate is 53 x 24 native pixels.
export const LOGO_SIGN = { w: 53, h: 24 };
export function drawOrbitLogoSign(ctx, x, y) {
  const { w, h } = LOGO_SIGN;
  R(ctx, x - 1, y + h, w + 2, 1, 'rgba(0,0,0,0.35)');
  R(ctx, x, y, w, h, '#0b0b0e');
  R(ctx, x, y, w, 1, '#34363f');
  const ink = '#f2f2f2';
  drawOrbitMark(ctx, x + 3, y + 3, 18, ink);
  drawLogoWord(ctx, 'Orbit', x + 25, y + 3, ink);
  drawLogoWord(ctx, 'Group', x + 25, y + 12, ink);
}

// Plain text sign (office name in the 3x5 pixel font, 2x when it fits)
function drawTextSign(ctx, name, centerX, y, maxW) {
  const label = name.toUpperCase();
  let scale = textWidth(label) * 2 + 12 <= maxW ? 2 : 1;
  let lines = [label];
  if (scale === 1 && textWidth(label) + 12 > maxW) {
    const mid = label.length / 2;
    let cut = -1;
    for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    lines = cut > 0 ? [label.slice(0, cut), label.slice(cut + 1)] : [label];
    lines = lines.map((l) => { let s = l; while (textWidth(s) + 12 > maxW && s.length > 1) s = s.slice(0, -1); return s; });
  }
  const tw = Math.max(...lines.map(textWidth)) * scale;
  const lh = 5 * scale;
  const w = tw + 12, h = lines.length * lh + (lines.length - 1) * 2 + 8;
  const x = Math.round(centerX - w / 2);
  R(ctx, x - 1, y + h, w + 2, 1, 'rgba(0,0,0,0.35)');
  R(ctx, x, y, w, h, '#0b0b0e');
  R(ctx, x, y, w, 1, '#34363f');
  const tmp = document.createElement('canvas');
  tmp.width = tw / scale + 1; tmp.height = 5 * lines.length + 2 * (lines.length - 1);
  const tg = tmp.getContext('2d');
  lines.forEach((l, i) => drawText(tg, l, Math.round((tw / scale - textWidth(l)) / 2), i * 7 / (scale === 2 ? 1 : 1), '#f2f2f2'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x + 6, y + 4, tmp.width * scale, tmp.height * scale);
  R(ctx, x + 2, y + 2, 1, 1, '#555a66'); R(ctx, x + w - 3, y + 2, 1, 1, '#555a66');
  R(ctx, x + 2, y + h - 3, 1, 1, '#555a66'); R(ctx, x + w - 3, y + h - 3, 1, 1, '#555a66');
}
// Ring mark + custom office name (logo mode with a name other than "Orbit Group")
function drawMarkSign(ctx, name, centerX, y, maxW) {
  const words = name.toUpperCase().trim().split(/\s+/);
  let lines = [words.join(' ')];
  if (words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const l = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const w = Math.max(...l.map(textWidth));
      if (!best || w < best.w) best = { l, w };
    }
    lines = best.l;
  }
  const markW = 18, gap = 5, pad = 3;
  let scale = 2;
  const widest = () => Math.max(...lines.map(textWidth)) * scale;
  if (markW + gap + widest() + pad * 2 > maxW) scale = 1;
  while (markW + gap + widest() + pad * 2 > maxW) lines = lines.map((l) => (textWidth(l) * scale + markW + gap + pad * 2 > maxW ? l.slice(0, -1) : l));
  const lg = scale === 2 ? 1 : 2; // line gap in font pixels (before scaling)
  const rows = lines.length * 5 + (lines.length - 1) * lg;
  const textH = rows * scale;
  const w = markW + gap + widest() + pad * 2, h = Math.max(24, textH + 4);
  const x = Math.round(centerX - w / 2);
  R(ctx, x - 1, y + h, w + 2, 1, 'rgba(0,0,0,0.35)');
  R(ctx, x, y, w, h, '#0b0b0e');
  R(ctx, x, y, w, 1, '#34363f');
  drawOrbitMark(ctx, x + pad, y + Math.round((h - 18) / 2), 18, '#f2f2f2');
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, widest() / scale); tmp.height = rows;
  const tg = tmp.getContext('2d');
  lines.forEach((l, i) => drawText(tg, l, 0, i * (5 + lg), '#f2f2f2'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x + pad + markW + gap, y + Math.round((h - textH) / 2), tmp.width * scale, tmp.height * scale);
}
const firstWord = (name) => (name || '').trim().split(/\s+/)[0].toUpperCase();

// ---------------------------------------------------------------------------
// Sky / time of day
export function skyPhase(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 5 || h >= 20) return 'night';
  if (h < 7) return 'dawn';
  if (h < 17) return 'day';
  return 'dusk';
}
const SKY = {
  night: ['#0a1030', '#1a2552', '#141a33', '#ffe08a'],
  dawn: ['#46528f', '#f1a071', '#3a3f63', '#ffd27a'],
  day: ['#5aa8e8', '#b4def7', '#7f93b4', '#ffffff'],
  dusk: ['#3d3a78', '#f08a5d', '#35355a', '#ffcf7a'],
};

function drawWindow(ctx, X, Y, w, h, phase, now) {
  const [top, bottom, city, lit] = SKY[phase];
  R(ctx, X - 2, Y - 2, w + 4, h + 4, '#4d5260');
  R(ctx, X - 1, Y - 1, w + 2, h + 2, '#646a7a');
  // sky gradient in 4 bands
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1);
    ctx.fillStyle = lerpColor(top, bottom, t);
    ctx.fillRect(X, Y + i, w, 1);
  }
  if (phase === 'night') {
    for (let i = 0; i < 7; i++) {
      const sx = X + Math.floor(hash2(X + i, 7) * w), sy = Y + Math.floor(hash2(i, X) * (h - 10));
      if ((Math.floor(now / 700) + i) % 5) R(ctx, sx, sy, 1, 1, '#dfe6ff');
    }
    R(ctx, X + w - 9, Y + 3, 4, 4, '#f3efd2'); R(ctx, X + w - 8, Y + 3, 3, 3, '#fffbe6'); R(ctx, X + w - 9, Y + 3, 1, 1, lerpColor(top, bottom, 0));
  } else if (phase === 'day') {
    // clouds
    const off = Math.floor(now / 1500) % (w + 20);
    const cx = X + ((off + X) % (w + 12)) - 10;
    ctx.save(); ctx.beginPath(); ctx.rect(X, Y, w, h); ctx.clip();
    R(ctx, cx, Y + 5, 10, 2, '#ffffff'); R(ctx, cx + 2, Y + 4, 5, 1, '#ffffff');
    ctx.restore();
  }
  // skyline
  const heights = [8, 12, 6, 14, 9, 17, 7, 11, 13, 6, 10, 15, 8];
  let bx = X;
  let i = 0;
  while (bx < X + w) {
    const bw = 3 + ((X + i) % 3);
    const bh = Math.min(h - 3, heights[(i + X) % heights.length]);
    R(ctx, bx, Y + h - bh, Math.min(bw, X + w - bx), bh, city);
    if (phase !== 'day') {
      for (let wy = Y + h - bh + 2; wy < Y + h - 1; wy += 2) for (let wx = bx + 1; wx < Math.min(bx + bw, X + w) - 0; wx += 2) {
        if (hash2(wx, wy) > 0.55) R(ctx, wx, wy, 1, 1, lit);
      }
    }
    bx += bw + 1; i++;
  }
  // an antenna tower (Shanghai-ish silhouette)
  const tx = X + Math.floor(w * 0.62);
  R(ctx, tx, Y + h - 18, 2, 18, city); R(ctx, tx - 1, Y + h - 13, 4, 3, city); R(ctx, tx - 1, Y + h - 7, 4, 3, city);
  if (phase !== 'day' && Math.floor(now / 600) % 2) R(ctx, tx, Y + h - 19, 2, 1, '#ff4d4d');
  // mullions & glare
  R(ctx, X + Math.floor(w / 2), Y, 1, h, '#646a7a');
  R(ctx, X, Y + Math.floor(h / 2) - 1, w, 1, '#646a7a');
  if (phase === 'day') { R(ctx, X + 2, Y + 2, 1, 5, 'rgba(255,255,255,0.5)'); R(ctx, X + 3, Y + 2, 1, 3, 'rgba(255,255,255,0.35)'); }
  // sill
  R(ctx, X - 3, Y + h + 2, w + 6, 2, '#7a8092');
  R(ctx, X - 3, Y + h + 4, w + 6, 1, '#3c404d');
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

// ---------------------------------------------------------------------------
// Wall decorations (registered per settings)
function registerWallDecor() {
  if (on('windows')) {
    for (const col of [2, 18, 34]) wallDecor.push({ draw: (ctx, now, world) => drawWindow(ctx, col * T + 4, 12, 3 * T - 8, 24, world.phase, now) });
  }

  // Brand sign centred on the work-room wall
  wallDecor.push({
    static: (ctx) => {
      if (S.sign === 'logo' && S.name.trim().toLowerCase() === 'orbit group') drawOrbitLogoSign(ctx, Math.round(11.5 * T - LOGO_SIGN.w / 2), 9);
      else if (S.sign === 'logo') drawMarkSign(ctx, S.name, 11.5 * T, 9, 110);
      else drawTextSign(ctx, S.name, 11.5 * T, 11, 110);
    },
  });

  if (on('clock')) wallDecor.push({
    draw: (ctx, now, world) => {
      const cx = 15 * T + 8, cy = 20;
      const d = world.date;
      R(ctx, cx - 5, cy - 7, 11, 15, '#15161b');
      R(ctx, cx - 6, cy - 6, 13, 13, '#15161b');
      R(ctx, cx - 4, cy - 6, 9, 13, '#e9e6dc');
      R(ctx, cx - 5, cy - 5, 11, 11, '#e9e6dc');
      R(ctx, cx - 6, cy - 4, 1, 9, '#15161b');
      R(ctx, cx, cy - 5, 1, 1, '#777'); R(ctx, cx, cy + 5, 1, 1, '#777'); R(ctx, cx - 5, cy, 1, 1, '#777'); R(ctx, cx + 5, cy, 1, 1, '#777');
      const hand = (ang, len, col) => {
        for (let i = 1; i <= len; i++) R(ctx, Math.round(cx + Math.sin(ang) * i), Math.round(cy - Math.cos(ang) * i), 1, 1, col);
      };
      const hr = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2;
      const mn = d.getMinutes() / 60 * Math.PI * 2;
      hand(mn, 4, '#2a2a33');
      hand(hr, 3, '#2a2a33');
      hand(d.getSeconds() / 60 * Math.PI * 2, 4, '#d23c3c');
      R(ctx, cx, cy, 1, 1, '#2a2a33');
    },
  });

  // Meeting whiteboard (wall mounted)
  if (on('whiteboards')) wallDecor.push({
    static: (ctx) => {
      const x = 24 * T + 10, y = 10, w = 50, h = 28;
      R(ctx, x - 1, y - 1, w + 2, h + 2, '#8d93a3');
      R(ctx, x, y, w, h, '#f4f5f7');
      R(ctx, x, y + h - 1, w, 1, '#d9dce3');
      R(ctx, x + 4, y + 4, 1, 14, '#5d6272'); R(ctx, x + 4, y + 18, 20, 1, '#5d6272');
      const pts = [[6, 16], [9, 14], [12, 15], [15, 11], [18, 9], [21, 6]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let s = 0; s <= steps; s++) R(ctx, x + Math.round(x1 + (x2 - x1) * s / steps), y + Math.round(y1 + (y2 - y1) * s / steps), 1, 1, '#1f9d55');
      }
      R(ctx, x + 28, y + 4, 7, 6, '#ffd84d'); R(ctx, x + 37, y + 4, 7, 6, '#ff9db5'); R(ctx, x + 28, y + 12, 7, 6, '#8fd3ff');
      R(ctx, x + 29, y + 6, 5, 1, '#b39320'); R(ctx, x + 38, y + 6, 4, 1, '#b3607a'); R(ctx, x + 29, y + 14, 5, 1, '#4a86ad');
      R(ctx, x + 37, y + 13, 7, 1, '#d23c3c'); R(ctx, x + 40, y + 12, 1, 3, '#d23c3c');
      drawText(ctx, 'Q4', x + 7, y + 21, '#2f5bd0');
      R(ctx, x + 16, y + 23, 10, 1, '#5d6272');
      R(ctx, x + 4, y + h + 1, w - 8, 2, '#8d93a3');
      R(ctx, x + 10, y + h, 4, 1, '#d23c3c'); R(ctx, x + 16, y + h, 4, 1, '#2f5bd0'); R(ctx, x + 22, y + h, 4, 1, '#1f9d55');
    },
  });

  // Meeting TV (animated)
  if (on('meetingTv')) wallDecor.push({
    draw: (ctx, now) => {
      const x = 29 * T + 4, y = 10, w = 56, h = 30;
      R(ctx, x - 1, y - 1, w + 2, h + 2, '#050507');
      R(ctx, x, y, w, h, '#0f1117');
      const slide = Math.floor(now / 6000) % 3;
      const sx = x + 3, sy = y + 3, sw = w - 6, sh = h - 6;
      if (slide === 0) {
        R(ctx, sx, sy, sw, sh, '#0b0c10');
        let s = firstWord(S.name);
        const markW = S.sign === 'logo' ? 11 : 0;
        while (s.length > 1 && textWidth(s) + markW > sw - 6) s = s.slice(0, -1);
        const total = textWidth(s) + markW;
        const x0 = sx + Math.round(sw / 2 - total / 2);
        if (markW) drawOrbitMark(ctx, x0, sy + 4, 9, '#ffffff');
        drawText(ctx, s, x0 + markW, sy + 6, '#ffffff');
        R(ctx, sx + sw / 2 - 10, sy + 15, 20, 1, '#3c404d');
        drawText(ctx, 'ALL HANDS', sx + Math.round(sw / 2 - textWidth('ALL HANDS') / 2), sy + 17, '#8a90a0');
      } else if (slide === 1) {
        R(ctx, sx, sy, sw, sh, '#10131b');
        const bars = [6, 9, 7, 12, 10, 15, 13, 18];
        bars.forEach((b, i) => {
          const bh = Math.round(b * (0.85 + 0.15 * Math.sin(now / 700 + i)));
          R(ctx, sx + 4 + i * 6, sy + sh - 2 - bh, 4, bh, i === bars.length - 1 ? '#45e27a' : '#4d7cff');
        });
        R(ctx, sx + 2, sy + sh - 2, sw - 4, 1, '#3c404d');
      } else {
        R(ctx, sx, sy, sw, sh, '#0c0f14');
        for (let i = 0; i < 5; i++) {
          const lw = 8 + Math.floor(hash2(i, Math.floor(now / 6000)) * 30);
          R(ctx, sx + 3, sy + 3 + i * 4, lw, 2, i === 0 ? '#ffffff' : '#596175');
        }
        drawText(ctx, '>_', sx + sw - 12, sy + sh - 7, Math.floor(now / 500) % 2 ? '#45e27a' : '#1c6b3a');
      }
      R(ctx, x + w / 2 - 1, y + h + 1, 2, 1, '#2a2c35');
      R(ctx, x + w - 3, y + h - 2, 1, 1, '#45e27a');
    },
  });

  // Lounge neon sign: orbit ring + first word of the office name
  if (on('neon')) {
    lights.push({ x: 29 * T + 2, y: 11 * T + 6, r: 26, color: '#46c8ff', a: 0.2 });
    wallDecor.push({
      draw: (ctx, now) => {
        const markW = S.sign === 'logo' ? 10 : 0;
        let s = firstWord(S.name);
        while (s.length > 1 && textWidth(s) + markW > 54) s = s.slice(0, -1);
        const cw = textWidth(s) + markW;
        const w = Math.max(36, cw + 10), h = 11;
        const x = Math.round(29 * T + 2 - w / 2), y = 11 * T + 1;
        R(ctx, x, y, w, h, '#101116');
        R(ctx, x, y, w, 1, '#2c2f3a');
        const flicker = Math.floor(now / 90) % 97 === 0;
        const glow = flicker ? 'rgba(80,200,255,0.12)' : 'rgba(80,200,255,0.35)';
        const core = flicker ? '#6a8ea0' : '#e6f7ff';
        const tx = x + Math.round((w - cw) / 2) + markW, ty = y + 3;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          drawText(ctx, s, tx + dx, ty + dy, glow);
          if (markW) drawOrbitMark(ctx, tx - markW + dx, y + 1 + dy, 7, glow);
        }
        drawText(ctx, s, tx, ty, core);
        if (markW) drawOrbitMark(ctx, tx - markW, y + 1, 7, core);
        R(ctx, x + 3, y + 9, w - 6, 1, flicker ? '#553344' : '#ff5fa2');
      },
    });
  }
  if (on('artwork')) wallDecor.push({
    static: (ctx) => {
      // framed painting: ringed planet
      const x = 32 * T + 2, y = 11 * T + 1, w = 20, h = 11;
      R(ctx, x - 1, y - 1, w + 2, h + 2, '#b08a4a');
      R(ctx, x, y, w, h, '#161a33');
      R(ctx, x + 3, y + 2, 1, 1, '#ffffff'); R(ctx, x + 16, y + 7, 1, 1, '#ffffff'); R(ctx, x + 12, y + 1, 1, 1, '#aab4ff');
      R(ctx, x + 8, y + 3, 5, 5, '#e08a4a'); R(ctx, x + 9, y + 3, 3, 1, '#f3b27a'); R(ctx, x + 7, y + 4, 1, 3, '#e08a4a'); R(ctx, x + 13, y + 4, 1, 3, '#b8642e');
      R(ctx, x + 5, y + 5, 11, 1, '#e8d9b0');
      // small abstract print in the work room, between shelf and window
      const px = 17 * T + 2, py = 14;
      R(ctx, px - 1, py - 1, 14, 18, '#1a1b20');
      R(ctx, px, py, 12, 16, '#efece4');
      R(ctx, px + 2, py + 3, 8, 8, '#e0763a'); R(ctx, px + 4, py + 5, 4, 4, '#efece4');
      R(ctx, px + 2, py + 12, 8, 1, '#2b2e39');
    },
  });
  // Kitchen upper cabinets
  wallDecor.push({
    static: (ctx) => {
      const x = 34 * T, y = 11 * T;
      R(ctx, x, y, 4 * T, 10, '#3a3d47');
      R(ctx, x, y + 10, 4 * T, 1, '#24262d');
      for (let i = 0; i < 4; i++) {
        R(ctx, x + i * T + 1, y + 1, T - 2, 8, '#454954');
        R(ctx, x + i * T + (i % 2 ? 2 : T - 4), y + 4, 2, 2, '#b8bcc6');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Furniture sprites
function bookshelf(x, y) {
  if (!on('bookshelves')) return;
  spots.push({ x: x + 1, y: y + 1, facing: 'up', label: 'books', dwell: [4, 8] });
  const X = x * T, Y = y * T;
  const img = cached('shelf' + x, 32, 40, (c) => {
    R(c, 0, 2, 32, 38, '#5c3d22');
    R(c, 1, 3, 30, 36, '#6e4a2c');
    R(c, 3, 5, 26, 32, '#2e1f12');
    const colors = ['#c0392b', '#2f6fdb', '#27a36a', '#f0b429', '#8e52c4', '#e67e22', '#ecf0f1', '#1fa3a3', '#34495e'];
    for (let s = 0; s < 3; s++) {
      const sy = 5 + s * 11;
      let bx = 4;
      let k = 0;
      while (bx < 27) {
        const bw = 2 + Math.floor(hash2(x * 13 + k, s) * 2);
        const bh = 7 + Math.floor(hash2(k, x + s * 7) * 3);
        if (hash2(k * 3, s + x) > 0.88) { bx += 2; k++; continue; }
        const col = colors[Math.floor(hash2(k, s * 5 + x) * colors.length)];
        R(c, bx, sy + 10 - bh, Math.min(bw, 28 - bx), bh, col);
        R(c, bx, sy + 10 - bh + 2, Math.min(bw, 28 - bx), 1, 'rgba(255,255,255,0.35)');
        bx += bw; k++;
      }
      R(c, 3, sy + 10, 26, 1, '#6e4a2c');
      R(c, 3, sy + 11, 26, 1, '#4a3019');
    }
    R(c, 0, 38, 32, 2, '#3b2715');
  });
  add({ x, y, w: 2, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y + T - 40) });
}

const PLANT_STYLE = { leafy: 0, snake: 1, cactus: 2, palm: 3 };
function plant(x, y, mixedVariant = 0) {
  if (!on('plants')) return;
  const X = x * T, Y = y * T;
  const variant = S.plantStyle in PLANT_STYLE ? PLANT_STYLE[S.plantStyle] : mixedVariant;
  const img = cached('plant' + variant, 16, 30, (c) => {
    const leaf = ['#2f7d3e', '#3f9b4e', '#5cbf5e', '#236030'];
    if (variant === 2) {
      // cactus with two arms and a flower
      R(c, 6, 5, 4, 15, '#3f8f46'); R(c, 7, 5, 1, 15, '#62b85f'); R(c, 6, 4, 4, 1, '#3f8f46');
      R(c, 2, 10, 2, 5, '#3f8f46'); R(c, 2, 14, 4, 2, '#3f8f46'); R(c, 2, 10, 1, 5, '#62b85f');
      R(c, 12, 7, 2, 6, '#3f8f46'); R(c, 10, 12, 4, 2, '#3f8f46'); R(c, 13, 7, 1, 6, '#2c6b33');
      for (const [sx, sy] of [[5, 8], [10, 11], [5, 15], [10, 17], [1, 12], [14, 9]]) R(c, sx, sy, 1, 1, '#d8f0c0');
      R(c, 7, 2, 2, 2, '#ff6fa8'); R(c, 6, 3, 1, 1, '#ff9fc6'); R(c, 9, 3, 1, 1, '#ff9fc6');
    } else if (variant === 3) {
      // palm: fronds fanning out from the trunk top
      R(c, 7, 9, 2, 11, '#8a6a3f'); R(c, 7, 11, 2, 1, '#6e532f'); R(c, 7, 15, 2, 1, '#6e532f');
      const fronds = [[-1, -0.35], [1, -0.35], [-1, 0.25], [1, 0.25], [-0.35, -1], [0.4, -1]];
      fronds.forEach(([dx, dy], i) => {
        for (let t = 1; t <= 7; t++) {
          const fx = Math.round(8 + dx * t), fy = Math.round(9 + dy * t + (Math.abs(dx) > 0.5 ? t * t * 0.06 : 0));
          R(c, fx, fy, 1, 1, leaf[i % 2]);
          if (t > 1 && t < 7) R(c, fx, fy + 1, 1, 1, leaf[3]);
        }
      });
      R(c, 7, 8, 2, 2, leaf[2]);
    } else if (variant === 1) {
      // tall snake plant
      for (let i = 0; i < 5; i++) {
        const lx = 4 + i * 2, lh = 12 + ((i * 7) % 6);
        R(c, lx, 20 - lh, 2, lh, leaf[i % 3]);
        R(c, lx, 20 - lh, 1, lh, '#8fd16a');
      }
    } else {
      const blobs = [[7, 2, 3], [3, 6, 4], [10, 6, 4], [5, 10, 5], [9, 11, 4], [2, 13, 3], [12, 13, 3], [7, 7, 3]];
      blobs.forEach(([bx, by, r], i) => {
        R(c, bx - r + 1, by, r * 2 - 2, r * 2 - 1, leaf[i % 4 === 3 ? 3 : 0]);
        R(c, bx - r + 2, by, r * 2 - 4, r * 2 - 3, leaf[1]);
        R(c, bx - r + 2, by, 2, 1, leaf[2]);
      });
    }
    // pot
    R(c, 3, 20, 10, 1, '#1d1e24');
    const pot = [['#2a2c33', '#44474f', '#1f2026'], ['#e8e4dc', '#ffffff', '#c9c4b8'], ['#c0643c', '#d9825a', '#9a4a2a'], ['#b89a66', '#d1b683', '#927646']][variant];
    R(c, 3, 21, 10, 8, pot[0]);
    R(c, 4, 29, 8, 1, '#1d1e24');
    R(c, 3, 21, 10, 1, pot[1]);
    R(c, 11, 22, 1, 6, pot[2]);
    if (variant === 3) for (let i = 0; i < 3; i++) R(c, 4, 23 + i * 2, 7, 1, pot[2]);
  });
  add({ x, y, w: 1, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y + T - 30) });
}

// Office chair; facing: 'down' (person faces viewer, chair back behind) or 'up'
function drawChair(c, ox, oy, facing, color = '#2b2d35', accent = '#3d404b') {
  if (facing === 'down') {
    R(c, ox + 4, oy + 0, 8, 1, color);
    R(c, ox + 3, oy + 1, 10, 7, color);
    R(c, ox + 4, oy + 1, 8, 6, accent);
    R(c, ox + 5, oy + 1, 6, 1, '#5a5e6c');
    R(c, ox + 2, oy + 8, 12, 4, color);
    R(c, ox + 3, oy + 8, 10, 1, accent);
    R(c, ox + 7, oy + 12, 2, 2, '#15161a');
    R(c, ox + 3, oy + 14, 10, 1, '#15161a');
    R(c, ox + 3, oy + 15, 1, 1, '#15161a'); R(c, ox + 12, oy + 15, 1, 1, '#15161a');
  } else {
    R(c, ox + 2, oy + 4, 12, 4, color);
    R(c, ox + 7, oy + 12, 2, 2, '#15161a');
    R(c, ox + 3, oy + 14, 10, 1, '#15161a');
    R(c, ox + 3, oy + 7, 10, 8, color);
    R(c, ox + 4, oy + 8, 8, 5, accent);
  }
}

function desk(index, x, y) {
  // Desk occupies (x..x+2, y); chair above it at (x+1, y-1)
  const X = x * T, Y = y * T;
  const chairX = x + 1, chairY = y - 1;
  desks.push({ index, x, y, chair: { x: chairX, y: chairY } });
  seats.push({ x: chairX, y: chairY, facing: 'down', offY: 2, kind: 'desk', desk: index });
  const chairImg = cached('chair-down', 16, 16, (c) => drawChair(c, 0, 0, 'down', '#1e2027', '#3a3e4b'));
  add({ x: chairX, y: chairY, w: 1, h: 1, block: true, sortY: chairY * T + 1, draw: (ctx) => ctx.drawImage(chairImg, chairX * T, chairY * T + 4) });
  const dual = S.monitors === 2, lamp = on('deskLamps') && !dual, items = on('deskItems');
  if (lamp) lights.push({ x: X + 43, y: Y - 8, r: 12, color: '#ffd27a', a: 0.22 });
  const img = cached('desk' + index, 48, 32, (c) => {
    const oy = 12; // desk surface starts at Y-5 => local 7
    // legs
    R(c, 2, oy + 6, 2, 14 - 1, '#3a2616'); R(c, 44, oy + 6, 2, 13, '#3a2616');
    // top
    R(c, 0, 7, 48, 12, '#b98653');
    R(c, 0, 7, 48, 1, '#d6a36b');
    R(c, 0, 8, 1, 11, '#a37244'); R(c, 47, 8, 1, 11, '#a37244');
    for (let i = 0; i < 48; i += 9) R(c, i + ((index * 3) % 5), 11 + (i % 3), 3, 1, '#ae7c4a');
    // front panel
    R(c, 0, 19, 48, 6, '#8a5b33');
    R(c, 0, 19, 48, 1, '#6d4526');
    R(c, 2, 25, 44, 1, '#4d3119');
    R(c, 18, 21, 12, 1, '#6d4526');
    // keyboard + mouse
    R(c, 18, 10, 12, 4, '#2a2c33'); R(c, 19, 10, 10, 1, '#4a4d57');
    for (let i = 0; i < 5; i++) R(c, 19 + i * 2, 12, 1, 1, '#6a6e7a');
    R(c, 32, 11, 2, 3, '#d9dce3'); R(c, 32, 11, 2, 1, '#ffffff');
    // right side items
    const v = index % 4;
    if (lamp) {
      R(c, 40, 12, 6, 2, '#2a2c33'); R(c, 42, 4, 1, 8, '#3a3d47'); R(c, 42, 3, 3, 1, '#3a3d47');
      R(c, 42, 1, 5, 3, '#f0b429'); R(c, 43, 1, 3, 1, '#ffd27a'); R(c, 43, 4, 3, 1, '#fff2c4');
    }
    if (!items || dual) return;
    if (!lamp && v === 0) { R(c, 38, 8, 5, 6, '#e9e6dc'); R(c, 39, 9, 3, 1, '#9aa0ad'); R(c, 39, 11, 3, 1, '#9aa0ad'); R(c, 43, 10, 1, 2, '#e9e6dc'); } // papers
    if (!lamp && v === 1) { R(c, 38, 8, 7, 5, '#f4f4f4'); R(c, 37, 12, 9, 1, '#c9c9c9'); R(c, 39, 9, 5, 1, '#2f6fdb'); } // notebook
    if (!lamp && v === 2) { R(c, 38, 4, 6, 6, '#4aa35a'); R(c, 39, 3, 4, 2, '#6ccb6a'); R(c, 38, 10, 6, 4, '#d8d2c4'); } // plant
    if (!lamp && v === 3) { R(c, 37, 9, 9, 4, '#3b3f4c'); R(c, 38, 9, 7, 1, '#5d6272'); } // tablet
    // mug
    R(c, 34, 6, 3, 4, ['#d23c3c', '#ffffff', '#2f6fdb', '#f0b429'][v]); R(c, 37, 7, 1, 2, '#bbbbbb');
  });
  add({ x, y, w: 3, h: 1, block: true, sortY: Y + T, desk: index, draw: (ctx) => ctx.drawImage(img, X, Y - 12) });
}

// Monitors drawn separately (dynamic screens): main on the desk's left, optional second on the right.
export function monitorRect(d, i = 0) {
  return i === 0 ? { x: d.x * T + 3, y: d.y * T - 17, w: 14, h: 11 } : { x: d.x * T + 32, y: d.y * T - 17, w: 14, h: 11 };
}
export const monitorCount = () => (S.monitors === 2 ? 2 : 1);

function meetingTable() {
  const x = 29, y = 5; // 5x2
  const X = x * T, Y = y * T;
  const img = cached('meettable', 80, 36, (c) => {
    R(c, 4, 26, 3, 8, '#121317'); R(c, 73, 26, 3, 8, '#121317');
    R(c, 0, 2, 80, 24, '#23252c');
    R(c, 1, 3, 78, 1, '#454956');
    R(c, 0, 26, 80, 4, '#16171c');
    R(c, 0, 2, 1, 24, '#1a1b21'); R(c, 79, 2, 1, 24, '#1a1b21');
    // reflection stripe
    R(c, 6, 6, 20, 1, '#2f323b');
    // laptops & notepads & bottles
    const lap = (lx, ly, flip) => {
      R(c, lx, ly, 10, 7, '#c8ccd4'); R(c, lx + 1, ly + 1, 8, 5, flip ? '#2e5fae' : '#1b1d23');
      R(c, lx - 1, ly + 7, 12, 2, '#9aa0ad');
    };
    lap(4, 4, false); lap(34, 4, true); lap(62, 4, false);
    R(c, 20, 16, 7, 6, '#f5f1e3'); R(c, 21, 17, 5, 1, '#9aa0ad'); R(c, 21, 19, 4, 1, '#9aa0ad');
    R(c, 52, 15, 7, 6, '#ffd84d');
    R(c, 30, 14, 2, 5, '#8fd3ff'); R(c, 30, 13, 2, 1, '#2f6fdb');
    R(c, 70, 15, 2, 5, '#8fd3ff'); R(c, 70, 14, 2, 1, '#2f6fdb');
    R(c, 44, 17, 4, 3, '#ffffff'); R(c, 45, 18, 2, 1, '#7a4a2a');
  });
  add({ x, y, w: 5, h: 2, block: true, sortY: (y + 2) * T, draw: (ctx) => ctx.drawImage(img, X, Y - 2) });
  const cd = cached('mchair-down', 16, 16, (c) => drawChair(c, 0, 0, 'down', '#1f2026', '#34363f'));
  const cu = cached('mchair-up', 16, 16, (c) => drawChair(c, 0, 0, 'up', '#1f2026', '#34363f'));
  for (const cx of [29, 31, 33]) {
    seats.push({ x: cx, y: 4, facing: 'down', offY: 3, kind: 'meeting' });
    add({ x: cx, y: 4, w: 1, h: 1, block: true, sortY: 4 * T + 1, draw: (ctx) => ctx.drawImage(cd, cx * T, 4 * T + 2) });
    seats.push({ x: cx, y: 7, facing: 'up', offY: 1, kind: 'meeting' });
    add({ x: cx, y: 7, w: 1, h: 1, block: true, sortY: 8 * T + 2, draw: (ctx) => ctx.drawImage(cu, cx * T, 7 * T + 2) });
  }
}

const SOFAS = {
  charcoal: ['#353946', '#474c5c', '#23262f', '#e07b39'],
  cream: ['#cfc6b4', '#e2dbcc', '#9d937f', '#2f6fdb'],
  teal: ['#1f6f6b', '#2d8a84', '#134845', '#f0b429'],
  mustard: ['#c3952b', '#d9ad45', '#8a661a', '#2b2e39'],
  burgundy: ['#78263a', '#933548', '#4d1724', '#e8e1d3'],
  olive: ['#5e6a35', '#737f46', '#3e4622', '#e07b39'],
};
export const SOFA_COLORS = SOFAS;
function sofa(x, y, facing) {
  // 3 wide
  const X = x * T, Y = y * T;
  const [base, light, dark, pillow] = SOFAS[S.sofaColor] || SOFAS.charcoal;
  const img = cached('sofa-' + facing, 48, 24, (c) => {
    if (facing === 'down') {
      R(c, 1, 0, 46, 10, dark);
      R(c, 2, 1, 44, 8, base);
      R(c, 2, 1, 44, 1, light);
      R(c, 0, 8, 48, 12, dark);
      R(c, 1, 9, 46, 9, light);
      R(c, 1, 17, 46, 3, base);
      R(c, 16, 9, 1, 9, base); R(c, 31, 9, 1, 9, base);
      R(c, 0, 6, 4, 15, dark); R(c, 1, 7, 2, 12, base);
      R(c, 44, 6, 4, 15, dark); R(c, 45, 7, 2, 12, base);
      R(c, 5, 4, 7, 6, pillow); R(c, 6, 5, 5, 1, shadeHex(pillow, 0.3));
      R(c, 38, 4, 6, 6, '#f2f2f2'); R(c, 39, 5, 4, 1, '#ffffff');
      R(c, 2, 20, 2, 2, '#15161a'); R(c, 44, 20, 2, 2, '#15161a');
    } else {
      R(c, 0, 2, 48, 8, dark);
      R(c, 1, 3, 46, 6, light);
      R(c, 1, 10, 46, 12, dark);
      R(c, 2, 11, 44, 9, base);
      R(c, 2, 11, 44, 1, light);
      R(c, 0, 2, 4, 20, dark); R(c, 44, 2, 4, 20, dark);
      R(c, 2, 22, 2, 2, '#15161a'); R(c, 44, 22, 2, 2, '#15161a');
    }
  });
  if (facing === 'down') {
    add({ x, y, w: 3, h: 1, block: true, sortY: Y + 2, draw: (ctx) => ctx.drawImage(img, X, Y - 6) });
    for (let i = 0; i < 3; i++) seats.push({ x: x + i, y, facing: 'down', offY: 1, kind: 'sofa' });
  } else {
    add({ x, y, w: 3, h: 1, block: true, sortY: Y + T + 3, draw: (ctx) => ctx.drawImage(img, X, Y - 2) });
    for (let i = 0; i < 3; i++) seats.push({ x: x + i, y, facing: 'up', offY: -1, kind: 'sofa' });
  }
}

function coffeeTable(x, y) {
  const X = x * T, Y = y * T;
  const img = cached('ctable', 48, 16, (c) => {
    R(c, 4, 2, 40, 10, '#6e4a2c');
    R(c, 4, 2, 40, 1, '#936540');
    R(c, 4, 12, 40, 2, '#4a3019');
    R(c, 6, 14, 2, 2, '#3b2715'); R(c, 40, 14, 2, 2, '#3b2715');
    R(c, 10, 4, 8, 6, '#f2f2f2'); R(c, 11, 5, 6, 2, '#d23c3c'); R(c, 11, 8, 5, 1, '#9aa0ad');
    R(c, 24, 5, 3, 4, '#ffffff'); R(c, 27, 6, 1, 2, '#cccccc'); R(c, 24, 5, 3, 1, '#7a4a2a');
    R(c, 32, 4, 7, 5, '#1b1d23'); R(c, 33, 5, 5, 3, '#2f6fdb');
  });
  add({ x, y, w: 3, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y) });
}

function beanbag(x, y, color) {
  if (!on('beanBags')) return;
  const X = x * T, Y = y * T;
  const img = cached('bean' + color, 16, 16, (c) => {
    R(c, 2, 5, 12, 10, shadeHex(color, -0.35));
    R(c, 1, 7, 14, 7, shadeHex(color, -0.35));
    R(c, 3, 5, 10, 9, color);
    R(c, 2, 8, 12, 5, color);
    R(c, 4, 6, 5, 2, shadeHex(color, 0.3));
  });
  seats.push({ x, y, facing: 'down', offY: 3, kind: 'beanbag' });
  add({ x, y, w: 1, h: 1, block: true, sortY: Y + 1, draw: (ctx) => ctx.drawImage(img, X, Y + 2) });
}
function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

function kitchen() {
  // Counter along row 12, cols 34..37
  const x = 34, y = 12, X = x * T, Y = y * T;
  const img = cached('counter', 64, 22, (c) => {
    R(c, 0, 4, 64, 5, '#c9ced6'); R(c, 0, 4, 64, 1, '#e4e8ee');
    R(c, 0, 9, 64, 12, '#3a3d47'); R(c, 0, 9, 64, 1, '#24262d');
    for (let i = 0; i < 4; i++) { R(c, i * 16 + 1, 10, 14, 10, '#434753'); R(c, i * 16 + 7, 12, 2, 1, '#b8bcc6'); }
    R(c, 0, 21, 64, 1, '#1d1e24');
    // sink (col 36)
    R(c, 34, 5, 12, 3, '#9aa0ad'); R(c, 35, 6, 10, 1, '#7b8190'); R(c, 39, 0, 2, 5, '#b8bcc6'); R(c, 39, 0, 4, 1, '#b8bcc6');
    // microwave (col 37)
    R(c, 49, -0, 14, 6, '#2a2c33'); R(c, 50, 1, 9, 4, '#1b1d23'); R(c, 60, 2, 2, 1, '#45e27a');
    // fruit bowl (col 34)
    R(c, 3, 2, 9, 3, '#e8e4dc'); R(c, 4, 0, 3, 3, '#e24b4b'); R(c, 7, 0, 3, 3, '#f0b429'); R(c, 6, -1, 2, 2, '#6ccb6a');
  });
  add({ x, y, w: 4, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y - 6) });
  // Coffee machine (col 35) dynamic (steam)
  if (on('coffeeMachine')) add({
    x: 35, y: 12, w: 0, h: 0, block: false, sortY: Y + T + 0.5,
    draw: (ctx, now) => {
      const mx = 35 * T + 2, my = Y - 16;
      R(ctx, mx, my, 12, 14, '#15161b');
      R(ctx, mx + 1, my + 1, 10, 3, '#2b2e39');
      R(ctx, mx + 2, my + 5, 8, 5, '#0b0b0e');
      R(ctx, mx + 5, my + 5, 2, 2, '#9aa0ad');
      R(ctx, mx + 4, my + 8, 4, 2, '#ffffff');
      R(ctx, mx + 9, my + 2, 1, 1, Math.floor(now / 800) % 2 ? '#e24b4b' : '#6b1f1f');
      R(ctx, mx + 1, my + 12, 10, 2, '#2b2e39');
      const t = Math.floor(now / 250) % 4;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(mx + 5 + (t % 2), my + 2 - t, 1, 2);
      ctx.fillRect(mx + 6 - (t % 2), my - 1 - t, 1, 2);
    },
  });
  if (on('coffeeMachine')) {
    spots.push({ x: 35, y: 13, facing: 'up', label: 'coffee', dwell: [4, 7], icon: 'coffee' });
    lights.push({ x: 35 * T + 8, y: 12 * T - 10, r: 12, color: '#ff9a5c', a: 0.15 });
  }
  spots.push({ x: 36, y: 13, facing: 'up', label: 'sink', dwell: [3, 5] });
  // Fridge (col 38)
  const fr = cached('fridge', 16, 34, (c) => {
    R(c, 1, 0, 14, 34, '#8f96a3');
    R(c, 2, 1, 12, 32, '#cdd3db');
    R(c, 2, 12, 12, 1, '#8f96a3');
    R(c, 11, 4, 1, 6, '#6b7280'); R(c, 11, 15, 1, 8, '#6b7280');
    R(c, 3, 1, 1, 31, '#e8ecf1');
    R(c, 5, 16, 3, 3, '#ffd84d'); R(c, 6, 21, 3, 2, '#ff9db5');
  });
  add({ x: 38, y: 12, w: 1, h: 1, block: true, sortY: 13 * T, draw: (ctx) => ctx.drawImage(fr, 38 * T, 13 * T - 34) });
  spots.push({ x: 38, y: 13, facing: 'up', label: 'fridge', dwell: [3, 5] });
  // Water cooler
  const wc = cached('cooler', 16, 28, (c) => {
    R(c, 4, 0, 8, 10, '#7cc4f2'); R(c, 5, 1, 2, 8, '#b5e2ff'); R(c, 4, 0, 8, 1, '#4a9ad0');
    R(c, 3, 10, 10, 16, '#e8ecf1'); R(c, 3, 10, 10, 1, '#ffffff'); R(c, 12, 11, 1, 15, '#b8bec8');
    R(c, 6, 14, 2, 2, '#2f6fdb'); R(c, 9, 14, 2, 2, '#d23c3c'); R(c, 5, 18, 6, 1, '#9aa0ad');
    R(c, 3, 26, 10, 2, '#9aa0ad');
  });
  add({ x: 38, y: 16, w: 1, h: 1, block: true, sortY: 17 * T, draw: (ctx) => ctx.drawImage(wc, 38 * T, 17 * T - 28) });
  spots.push({ x: 37, y: 16, facing: 'right', label: 'water', dwell: [3, 6] });
  // Bar table + stools
  const bt = cached('bartable', 32, 20, (c) => {
    R(c, 0, 0, 32, 8, '#15161b'); R(c, 0, 0, 32, 1, '#3c404d'); R(c, 1, 1, 30, 6, '#23252c');
    R(c, 14, 8, 4, 10, '#15161b'); R(c, 9, 18, 14, 2, '#15161b');
    R(c, 6, 2, 3, 4, '#ffffff'); R(c, 6, 2, 3, 1, '#7a4a2a'); R(c, 22, 2, 4, 3, '#e24b4b');
  });
  add({ x: 35, y: 17, w: 2, h: 1, block: true, sortY: 18 * T, draw: (ctx) => ctx.drawImage(bt, 35 * T, 17 * T - 4) });
  const st = cached('stool', 16, 16, (c) => {
    R(c, 4, 6, 8, 3, '#e07b39'); R(c, 4, 6, 8, 1, '#f5a468');
    R(c, 7, 9, 2, 5, '#15161b'); R(c, 5, 14, 6, 1, '#15161b');
  });
  for (const sx of [35, 36]) {
    seats.push({ x: sx, y: 16, facing: 'down', offY: 1, kind: 'stool' });
    add({ x: sx, y: 16, w: 1, h: 1, block: true, sortY: 16 * T + 1, draw: (ctx) => ctx.drawImage(st, sx * T, 16 * T + 1) });
  }
}

function serverRack(x, y) {
  if (!on('serverRacks')) return;
  const X = x * T, Y = y * T;
  const img = cached('rack', 16, 32, (c) => {
    R(c, 1, 0, 14, 32, '#0b0b0e');
    R(c, 2, 1, 12, 30, '#17181d');
    for (let i = 0; i < 7; i++) { R(c, 3, 3 + i * 4, 10, 3, '#23252c'); R(c, 3, 3 + i * 4, 10, 1, '#2f323b'); }
    R(c, 1, 0, 14, 1, '#3c404d');
  });
  add({
    x, y, w: 1, h: 1, block: true, sortY: Y + T,
    draw: (ctx, now) => {
      ctx.drawImage(img, X, Y + T - 32);
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 3; j++) {
          const on = hash2(x * 31 + i * 7 + j, Math.floor(now / (180 + j * 90 + i * 20))) > 0.35;
          R(ctx, X + 4 + j * 2, Y + T - 32 + 4 + i * 4, 1, 1, on ? (j === 2 ? '#4d7cff' : '#45e27a') : '#1c3324');
        }
        R(ctx, X + 11, Y + T - 32 + 4 + i * 4, 1, 1, '#6b7280');
      }
    },
  });
}

function standingWhiteboard(x, y) {
  if (!on('whiteboards')) return;
  const X = x * T, Y = y * T;
  const img = cached('swb', 48, 40, (c) => {
    R(c, 4, 26, 2, 14, '#5d6272'); R(c, 42, 26, 2, 14, '#5d6272');
    R(c, 1, 38, 10, 2, '#3c404d'); R(c, 37, 38, 10, 2, '#3c404d');
    R(c, 0, 0, 48, 28, '#8d93a3');
    R(c, 1, 1, 46, 26, '#f4f5f7');
    // kanban columns
    R(c, 16, 3, 1, 22, '#c9ccd4'); R(c, 32, 3, 1, 22, '#c9ccd4');
    drawText(c, 'TODO', 1, 3, '#5d6272'); drawText(c, 'WIP', 19, 3, '#2f6fdb'); drawText(c, 'DONE', 33, 3, '#1f9d55');
    const notes = [[3, 10, '#ffd84d'], [3, 17, '#ff9db5'], [19, 10, '#8fd3ff'], [19, 17, '#ffd84d'], [35, 10, '#b6f09c'], [35, 17, '#b6f09c'], [9, 10, '#8fd3ff']];
    for (const [nx, ny, col] of notes) { R(c, nx, ny, 6, 5, col); R(c, nx + 1, ny + 2, 4, 1, 'rgba(0,0,0,0.25)'); }
    R(c, 2, 28, 44, 2, '#6b7080');
  });
  add({ x, y, w: 3, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y + T - 40) });
  spots.push({ x: x + 1, y: y + 1, facing: 'up', label: 'whiteboard', dwell: [5, 9] });
  spots.push({ x, y: y + 1, facing: 'up', label: 'whiteboard', dwell: [5, 9] });
}

function roundTable(x, y) {
  if (!on('collabTable')) return;
  const X = x * T, Y = y * T;
  const img = cached('rtable', 32, 32, (c) => {
    R(c, 13, 20, 6, 8, '#1d1e24'); R(c, 8, 28, 16, 2, '#1d1e24');
    R(c, 6, 4, 20, 18, '#e8e4dc'); R(c, 4, 6, 24, 14, '#e8e4dc'); R(c, 3, 8, 26, 10, '#e8e4dc');
    R(c, 6, 4, 20, 1, '#ffffff'); R(c, 3, 17, 26, 3, '#c9c4b8'); R(c, 6, 21, 20, 1, '#b3aea2');
    R(c, 9, 8, 6, 4, '#2a2c33'); R(c, 10, 9, 4, 2, '#4d7cff');
    R(c, 19, 10, 3, 3, '#ffffff'); R(c, 19, 10, 3, 1, '#7a4a2a');
  });
  add({ x, y, w: 2, h: 2, block: true, sortY: (y + 2) * T - 4, draw: (ctx) => ctx.drawImage(img, X, Y - 2) });
  const st = cached('rstool', 16, 16, (c) => {
    R(c, 3, 5, 10, 5, '#2b2d35'); R(c, 4, 5, 8, 1, '#4a4d57');
    R(c, 7, 10, 2, 4, '#15161a'); R(c, 4, 14, 8, 1, '#15161a');
  });
  for (const sx of [x, x + 1]) {
    seats.push({ x: sx, y: y - 1, facing: 'down', offY: 2, kind: 'collab' });
    add({ x: sx, y: y - 1, w: 1, h: 1, block: true, sortY: (y - 1) * T + 1, draw: (ctx) => ctx.drawImage(st, sx * T, (y - 1) * T + 2) });
    seats.push({ x: sx, y: y + 2, facing: 'up', offY: 0, kind: 'collab' });
    add({ x: sx, y: y + 2, w: 1, h: 1, block: true, sortY: (y + 2) * T + 1, draw: (ctx) => ctx.drawImage(st, sx * T, (y + 2) * T + 2) });
  }
}

function printer(x, y) {
  if (!on('printer')) return;
  const X = x * T, Y = y * T;
  const img = cached('printer', 16, 26, (c) => {
    R(c, 1, 10, 14, 16, '#5c3d22'); R(c, 2, 11, 12, 14, '#6e4a2c'); R(c, 7, 17, 2, 1, '#c9a26b');
    R(c, 1, 2, 14, 9, '#d9dce3'); R(c, 1, 2, 14, 1, '#ffffff'); R(c, 3, 5, 10, 2, '#2a2c33');
    R(c, 4, 0, 8, 3, '#f7f7f7'); R(c, 12, 8, 2, 1, '#45e27a');
  });
  add({ x, y, w: 1, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y + T - 26) });
  spots.push({ x: x + 1, y, facing: 'left', label: 'printer', dwell: [3, 5] });
}
function cabinet(x, y) {
  if (!on('printer')) return;
  const X = x * T, Y = y * T;
  const img = cached('cabinet', 16, 26, (c) => {
    R(c, 1, 0, 14, 26, '#6b7280'); R(c, 2, 1, 12, 24, '#9aa0ad');
    for (let i = 0; i < 3; i++) { R(c, 2, 1 + i * 8, 12, 1, '#6b7280'); R(c, 6, 4 + i * 8, 4, 1, '#3c404d'); }
  });
  add({ x, y, w: 1, h: 1, block: true, sortY: Y + T, draw: (ctx) => ctx.drawImage(img, X, Y + T - 26) });
}
function arcade(x, y) {
  if (!on('arcade')) return;
  const X = x * T, Y = y * T;
  add({
    x, y, w: 1, h: 1, block: true, sortY: Y + T,
    draw: (ctx, now) => {
      const oy = Y + T - 32;
      R(ctx, X + 1, oy, 14, 32, '#15161b');
      R(ctx, X + 2, oy + 1, 12, 4, '#e24b4b');
      drawText(ctx, 'GO', X + 5, oy + 0, '#ffffff');
      R(ctx, X + 3, oy + 7, 10, 9, '#0b0c10');
      const t = Math.floor(now / 200);
      R(ctx, X + 4 + (t % 8), oy + 9 + ((t >> 3) % 5), 1, 1, '#45e27a');
      R(ctx, X + 4, oy + 14, 8, 1, '#4d7cff');
      R(ctx, X + 2, oy + 17, 12, 4, '#2b2e39');
      R(ctx, X + 4, oy + 18, 1, 2, '#e24b4b'); R(ctx, X + 8, oy + 18, 2, 2, '#f0b429'); R(ctx, X + 11, oy + 18, 2, 2, '#4d7cff');
      R(ctx, X + 2, oy + 21, 12, 11, '#1d1e24'); R(ctx, X + 6, oy + 24, 4, 1, '#f0b429');
    },
  });
  spots.push({ x, y: y - 1, facing: 'up', label: 'arcade', dwell: [6, 10] });
}

function pingPong(x, y) {
  // 3x2 table
  if (!on('pingPong')) return;
  const X = x * T, Y = y * T;
  const img = cached('pingpong', 48, 34, (c) => {
    R(c, 3, 24, 2, 10, '#15161a'); R(c, 43, 24, 2, 10, '#15161a');
    R(c, 0, 2, 48, 24, '#1f6b4f'); R(c, 0, 2, 48, 1, '#2f8f6a');
    R(c, 1, 3, 46, 1, '#e8e8e8'); R(c, 1, 24, 46, 1, '#e8e8e8'); R(c, 1, 3, 1, 22, '#e8e8e8'); R(c, 46, 3, 1, 22, '#e8e8e8');
    R(c, 2, 13, 44, 1, '#cfd8d3');
    R(c, 23, 0, 2, 27, '#f2f2f2'); R(c, 23, 0, 2, 1, '#9aa0ad'); R(c, 24, 1, 1, 25, '#b8bec8');
    R(c, 0, 26, 48, 3, '#154a37');
    R(c, 8, 8, 5, 4, '#d23c3c'); R(c, 12, 11, 1, 2, '#6e4a2c');
    R(c, 36, 16, 5, 4, '#1b1d23'); R(c, 36, 19, 1, 2, '#6e4a2c');
  });
  add({ x, y, w: 3, h: 2, block: true, sortY: (y + 2) * T, draw: (ctx, now) => {
    ctx.drawImage(img, X, Y - 2);
    const t = (now / 900) % 2;
    const p = t < 1 ? t : 2 - t;
    const bx = X + 6 + Math.round(p * 36), by = Y + 8 + Math.round(Math.abs(Math.sin(p * Math.PI * 3)) * -3) + Math.round(p * 10);
    R(ctx, bx, by, 2, 2, '#ffffff');
  } });
  spots.push({ x: x - 1, y: y + 1, facing: 'right', label: 'ping-pong', dwell: [6, 12] });
  spots.push({ x: x + 3, y, facing: 'left', label: 'ping-pong', dwell: [6, 12] });
}

// ---------------------------------------------------------------------------
// Place everything (re-run whenever settings change)
const DESK_COLS = [2, 7, 12, 17];
function layout() {
  furniture.length = 0; seats.length = 0; spots.length = 0; desks.length = 0; lights.length = 0; wallDecor.length = 0;
  cache.clear();
  registerWallDecor();

  // Work room: 8 desks in two rows of four
  DESK_COLS.forEach((x, i) => desk(i, x, 6));
  DESK_COLS.forEach((x, i) => desk(i + 4, x, 11));
  bookshelf(5, 3);
  bookshelf(15, 3);
  plant(1, 3, 0);
  plant(22, 3, 1);
  plant(1, 20, 1);
  plant(22, 20, 0);
  plant(10, 3, 0);
  printer(1, 13);
  cabinet(1, 14);
  cabinet(1, 15);
  standingWhiteboard(4, 15);
  roundTable(11, 16);
  serverRack(20, 14);
  serverRack(21, 14);
  serverRack(22, 14);
  if (on('serverRacks')) spots.push({ x: 21, y: 15, facing: 'up', label: 'servers', dwell: [4, 7] });
  plant(8, 20, 0);
  plant(16, 20, 1);
  pingPong(16, 17);
  if (on('windows')) {
    spots.push({ x: 3, y: 4, facing: 'up', label: 'window', dwell: [5, 9] });
    spots.push({ x: 19, y: 4, facing: 'up', label: 'window', dwell: [5, 9] });
    spots.push({ x: 35, y: 3, facing: 'up', label: 'window', dwell: [5, 9] });
  }

  // Meeting room
  meetingTable();
  plant(24, 3, 1);
  plant(38, 3, 0);
  plant(24, 9, 0);
  plant(38, 9, 1);
  if (on('whiteboards')) spots.push({ x: 26, y: 3, facing: 'up', label: 'whiteboard', dwell: [5, 9] });

  // Lounge
  sofa(26, 14, 'down');
  coffeeTable(26, 16);
  sofa(26, 18, 'up');
  beanbag(30, 15, '#4d7cff');
  beanbag(30, 17, '#e24b4b');
  plant(33, 12, 1);
  plant(24, 20, 0);
  arcade(33, 20);
  plant(24, 13, 0);

  // Kitchen
  kitchen();
  spots.push({ x: 37, y: 19, facing: 'down', label: 'kitchen', dwell: [3, 6] });

  // Walkability
  for (let y = 0; y < ROWS; y++) {
    if (!blocked[y]) blocked[y] = [];
    for (let x = 0; x < COLS; x++) blocked[y][x] = !isFloor(x, y);
  }
  for (const f of furniture) {
    if (!f.block) continue;
    for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) blocked[f.y + dy][f.x + dx] = true;
  }
  // Drop any idle spot that ended up unreachable
  for (let i = spots.length - 1; i >= 0; i--) if (blocked[spots[i].y][spots[i].x]) spots.splice(i, 1);
}

export const blocked = [];
export const walkable = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked[y][x];

// Merge settings over the fallback defaults and rebuild the office.
export function applySettings(next) {
  const d = FALLBACK_SETTINGS;
  const n = next || {};
  S = {
    ...d, ...n,
    walls: { ...d.walls, ...(n.walls || {}) },
    floors: { ...d.floors, ...(n.floors || {}) },
    accessories: { ...d.accessories, ...(n.accessories || {}) },
  };
  layout();
  return S;
}
applySettings(FALLBACK_SETTINGS);

// Original procedurally-built chibi character sprites (16x24), recolored per employee.
// Palette keys: k outline, h/H hair, s/S skin, r blush, e eye, t/T shirt,
// p/P pants, o shoes, n tie, g glasses frame.

const HEAD_FRONT = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhsssssshhk..',
  '..khsssssssshk..',
  '..kssessssessk..',
  '..ksrssssssrsk..',
  '...kssssssssk...',
];
const BODY_FRONT = [
  '...kkttssttkk...',
  '..kTttttttttTk..',
  '.kTkttttttttkTk.',
  '.kTkttttttttkTk.',
  '.kskttttttttksk.',
  '..kkppppppppkk..',
  '...kppppppppk...',
];
const HEAD_BACK = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..kHhhhhhhhhHk..',
  '...kHHHHHHHHk...',
];
const BODY_BACK = [
  '...kkttttttkk...',
  '..kTttttttttTk..',
  '.kTkttttttttkTk.',
  '.kTkttttttttkTk.',
  '.kskTTTTTTTTksk.',
  '..kkppppppppkk..',
  '...kppppppppk...',
];
const LEGS_STAND = [
  '....kppkkppk....',
  '....kppkkppk....',
  '....kppkkppk....',
  '....kookkook....',
  '....kkkkkkkk....',
];
const LEGS_STEP_A = [
  '....kppkkppk....',
  '....kookkppk....',
  '....kkkkkppk....',
  '........kook....',
  '........kkkk....',
];
const LEGS_STEP_B = [
  '....kppkkppk....',
  '....kppkkook....',
  '....kppkkkkk....',
  '....kook........',
  '....kkkk........',
];
const LEGS_SIT = [
  '...kPPPPPPPPk...',
  '....kookkook....',
  '....kkkkkkkk....',
  '................',
  '................',
];
const LEGS_SIT_BACK = [
  '................',
  '................',
  '................',
  '................',
  '................',
];
const HEAD_SIDE = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhhk..',
  '...khhhhhhhhhk..',
  '...khhhhhhhhhk..',
  '...khhhhhssssk..',
  '...khhhhsssssk..',
  '...khhhssssesk..',
  '...khhsssssrsk..',
  '....kkssssssk...',
];
const BODY_SIDE = [
  '.....ktttttk....',
  '....kttttttk....',
  '....kttTTttk....',
  '....kttTTttk....',
  '....kttssttk....',
  '....kppppppk....',
  '....kppppppk....',
];
const LEGS_SIDE_STAND = [
  '.....kppppk.....',
  '.....kppppk.....',
  '.....kppppk.....',
  '.....koooook....',
  '.....kkkkkkk....',
];
const LEGS_SIDE_STEP = [
  '....kpppppk.....',
  '...kppk.kppk....',
  '...kpk...kpk....',
  '..kook...kook...',
  '..kkkk...kkkk...',
];

export const TEMPLATE_ROWS = {
  HEAD_FRONT, BODY_FRONT, HEAD_BACK, BODY_BACK, HEAD_SIDE, BODY_SIDE,
  LEGS_STAND, LEGS_STEP_A, LEGS_STEP_B, LEGS_SIT, LEGS_SIT_BACK, LEGS_SIDE_STAND, LEGS_SIDE_STEP,
};

function grid(rows) {
  return rows.map((r) => r.split(''));
}

function set(g, x, y, ch) {
  if (y >= 0 && y < g.length && x >= 0 && x < 16) g[y][x] = ch;
}

// Hair style overlays, applied on the assembled 16x24 grid.
function applyHair(g, style, view) {
  const side = view === 'side';
  const back = view === 'back';
  switch (style) {
    case 'spiky': {
      const tips = side ? [5, 7, 9, 11] : [3, 5, 7, 9, 11];
      for (const x of tips) { set(g, x, 0, 'k'); set(g, x + 1, 0, 'k'); set(g, x, 1, 'h'); set(g, x + 1, 1, 'h'); }
      if (!side && !back) { set(g, 5, 7, 'h'); set(g, 6, 7, 'h'); set(g, 9, 7, 'h'); }
      if (side) { set(g, 9, 7, 'h'); set(g, 12, 6, 'h'); set(g, 13, 6, 'k'); }
      break;
    }
    case 'long': {
      const x0 = side ? 3 : 2;
      for (let y = 7; y <= 15; y++) {
        set(g, x0 - 1, y, 'k');
        set(g, x0, y, 'h');
        if (!side) set(g, x0 + 1, y, y > 11 ? 'H' : 'h');
        if (!side) { set(g, 14, y, 'k'); set(g, 13, y, 'h'); set(g, 12, y, y > 11 ? 'H' : 'h'); }
        else { set(g, x0 + 1, y, 'h'); set(g, x0 + 2, y, y > 12 ? 'H' : g[y][x0 + 2] === 'k' ? 'h' : g[y][x0 + 2]); }
      }
      set(g, x0 - 1, 16, 'k'); set(g, x0, 16, 'k'); set(g, x0 + 1, 16, 'k');
      if (!side) { set(g, 14, 16, 'k'); set(g, 13, 16, 'k'); set(g, 12, 16, 'k'); }
      if (back) for (let y = 12; y <= 15; y++) for (let x = 3; x <= 12; x++) set(g, x, y, y === 15 ? 'H' : 'h');
      if (back) for (let x = 3; x <= 12; x++) set(g, x, 16, 'k');
      if (!side && !back) { set(g, 5, 7, 'h'); set(g, 10, 7, 'h'); }
      break;
    }
    case 'curly': {
      const bumps = side ? [[4, 1], [8, 1], [11, 2], [2, 4], [2, 7], [14, 4]] : [[3, 1], [6, 0], [9, 0], [12, 1], [1, 4], [14, 4], [1, 7], [14, 7]];
      for (const [x, y] of bumps) {
        set(g, x, y, 'k'); set(g, x + 1, y, 'k');
        if (y < 3) { set(g, x, y + 1, 'h'); set(g, x + 1, y + 1, 'h'); }
        else { set(g, x, y + 1, 'k'); set(g, x + (x < 8 ? 1 : -1), y, 'h'); set(g, x + (x < 8 ? 1 : -1), y + 1, 'h'); }
      }
      // texture
      for (let y = 2; y <= (back ? 10 : 6); y++) for (let x = 3; x <= 12; x++) if (g[y][x] === 'h' && (x * 7 + y * 5) % 6 === 0) g[y][x] = 'H';
      break;
    }
    case 'bun': {
      set(g, 6, 0, 'k'); set(g, 7, 0, 'k'); set(g, 8, 0, 'k'); set(g, 9, 0, 'k');
      set(g, 6, 1, 'h'); set(g, 7, 1, 'h'); set(g, 8, 1, 'H'); set(g, 9, 1, 'h');
      break;
    }
    case 'bald': {
      for (let y = 2; y <= (back ? 9 : 6); y++) for (let x = 3; x <= 12; x++) if (g[y][x] === 'h' && (back || x > 3 && x < 12)) g[y][x] = 's';
      break;
    }
    default: {
      // short with a side part
      if (!side && !back) { set(g, 5, 7, 'h'); set(g, 6, 7, 'h'); set(g, 7, 7, 'H'); }
    }
  }
}

function assemble(view, legs) {
  let head, body;
  if (view === 'front') { head = HEAD_FRONT; body = BODY_FRONT; }
  else if (view === 'back') { head = HEAD_BACK; body = BODY_BACK; }
  else { head = HEAD_SIDE; body = BODY_SIDE; }
  return grid([...head, ...body, ...legs]);
}

// ---------------------------------------------------------------------------
// Color helpers
export function hexToRgb(hex) {
  let h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return rgbToHex([f(r), f(g), f(b)]);
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

// Deterministic look for employees without one in roster.json.
const HAIRS = ['#1c1512', '#3b2417', '#6b4426', '#a8692f', '#d9b56b', '#8e3a1c', '#2b2b35', '#c8c8d0'];
const SKINS = ['#f6d3b5', '#f0c8a2', '#d9a47a', '#b57d55', '#8f5b3a', '#6a4127'];
const SHIRTS = ['#2f6fdb', '#e24b4b', '#27a36a', '#8e52c4', '#f09a2b', '#1fa3a3', '#d6477f', '#4a4f63'];
const STYLES = ['short', 'spiky', 'long', 'curly', 'bun'];
function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function resolveLook(id, look) {
  const h = hash(id);
  const d = {
    hair: HAIRS[h % HAIRS.length],
    skin: SKINS[(h >>> 4) % SKINS.length],
    shirt: SHIRTS[(h >>> 8) % SHIRTS.length],
    pants: '#2e3242',
    shoes: '#1a1a1f',
    hairStyle: STYLES[(h >>> 12) % STYLES.length],
    glasses: false,
    tie: null,
  };
  return { ...d, ...(look || {}) };
}

function palette(look) {
  return {
    k: '#1b1720',
    e: '#1b1720',
    h: look.hair,
    H: shade(look.hair, -0.3),
    s: look.skin,
    S: shade(look.skin, -0.15),
    r: mix(look.skin, '#ff6f6f', 0.3),
    t: look.shirt,
    T: shade(look.shirt, -0.22),
    p: look.pants,
    P: shade(look.pants, -0.25),
    o: look.shoes,
    n: look.tie || '#b3263a',
    g: '#5b6070',
    w: '#ffffff',
  };
}

function toCanvas(g, pal, flip) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 24;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = g[y][flip ? 15 - x : x];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function decorate(g, look, view) {
  applyHair(g, look.hairStyle, view);
  if (view === 'front') {
    if (look.glasses) {
      for (const x of [4, 5, 6, 9, 10, 11]) set(g, x, 8, 'g');
      for (const x of [4, 6, 7, 8, 9, 11]) set(g, x, 9, 'g');
    }
    if (look.tie) { set(g, 7, 12, 'w'); set(g, 8, 12, 'w'); for (let y = 13; y <= 16; y++) { set(g, 7, y, 'n'); set(g, 8, y, 'n'); } }
  } else if (view === 'side') {
    if (look.glasses) { set(g, 10, 8, 'g'); set(g, 11, 8, 'g'); set(g, 12, 8, 'g'); set(g, 10, 9, 'g'); set(g, 12, 9, 'g'); set(g, 9, 8, 'g'); }
    if (look.tie) { for (let y = 13; y <= 15; y++) set(g, 10, y, 'n'); }
  }
}

// Build all frames for a look. Returns { down:[3], up:[3], left:[3], right:[3], sitDown, sitUp, sleep }
export function buildCharacter(look) {
  const pal = palette(look);
  const make = (view, legs, flip = false, mod) => {
    const g = assemble(view, legs);
    decorate(g, look, view);
    if (mod) mod(g);
    return toCanvas(g, pal, flip);
  };
  const closedEyes = (g) => { set(g, 5, 9, 's'); set(g, 10, 9, 's'); set(g, 4, 10, 'k'); set(g, 5, 10, 'k'); set(g, 10, 10, 'k'); set(g, 11, 10, 'k'); };
  const blink = (g) => { if (g[9][5] === 'e') set(g, 5, 9, 'S'); if (g[9][10] === 'e') set(g, 10, 9, 'S'); };
  return {
    down: [make('front', LEGS_STAND), make('front', LEGS_STEP_A), make('front', LEGS_STEP_B)],
    up: [make('back', LEGS_STAND), make('back', LEGS_STEP_A), make('back', LEGS_STEP_B)],
    right: [make('side', LEGS_SIDE_STAND), make('side', LEGS_SIDE_STEP), make('side', LEGS_SIDE_STAND)],
    left: [make('side', LEGS_SIDE_STAND, true), make('side', LEGS_SIDE_STEP, true), make('side', LEGS_SIDE_STAND, true)],
    blinkDown: make('front', LEGS_STAND, false, blink),
    sitDown: make('front', LEGS_SIT),
    sitBlink: make('front', LEGS_SIT, false, blink),
    sitUp: make('back', LEGS_SIT_BACK),
    sleep: make('front', LEGS_SIT, false, closedEyes),
    palette: pal,
  };
}

// ---------------------------------------------------------------------------
// Small pixel icons (drawn at 1px per cell, scaled by caller).
const ICONS = {
  write: {
    pal: { a: '#f5c542', b: '#e07b39', c: '#2a2a33', d: '#f2a7b5', e: '#cfd3dc' },
    rows: ['......dd', '.....dcd', '....aac.', '...aaa..', '..aaa...', '.baa....', 'cbb.....', 'cc......'],
  },
  read: {
    pal: { a: '#ffffff', b: '#6aa6ff', c: '#2a2a33', d: '#c9d4e6' },
    rows: ['........', 'cc....cc', 'cacccac.', 'cabdbac.', 'cabdbac.', 'caaaaac.', 'cccccccc', '........'],
  },
  command: {
    pal: { a: '#1d2027', b: '#45e27a', c: '#9aa3b5' },
    rows: ['cccccccc', 'caaaaaac', 'cabaaaac', 'caabaaac', 'cabaaaac', 'caaabbac', 'caaaaaac', 'cccccccc'],
  },
  coffee: {
    pal: { a: '#ffffff', b: '#7a4a2a', c: '#2a2a33', d: '#cfd3dc' },
    rows: ['..d.d...', '...d.d..', 'cccccc..', 'cbbbbcc.', 'caaaac.c', 'caaaacc.', '.cccc...', '........'],
  },
};
const iconCache = {};
export function icon(name) {
  if (iconCache[name]) return iconCache[name];
  const def = ICONS[name];
  if (!def) return null;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  def.rows.forEach((row, y) => row.split('').forEach((ch, x) => {
    if (def.pal[ch]) { ctx.fillStyle = def.pal[ch]; ctx.fillRect(x, y, 1, 1); }
  }));
  iconCache[name] = c;
  return c;
}

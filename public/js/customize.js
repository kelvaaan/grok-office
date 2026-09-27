// Customize panel: walls, floors, accessories, branding, presets. Changes preview
// live (onChange) and are saved to the server (PUT /api/office), which broadcasts
// them to every open tab.
import { drawFloorSwatch, drawWallSwatch, ACCENT_COLORS, RUG_COLORS, SOFA_COLORS } from './office.js';

const $ = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function swatchCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g);
  return c;
}

export function initCustomize({ onChange, onOpen = () => {}, onClose = () => {} }) {
  const btn = document.getElementById('customize-btn');
  const panel = document.getElementById('customize');
  const body = document.getElementById('c-body');
  const statusEl = document.getElementById('c-status');
  let meta = null; // {settings, defaults, options, presets}
  let S = null;
  let dirty = false, seq = 0, timer = null;
  const refreshers = []; // functions that re-sync the DOM with S

  const setStatus = (text, kind = '') => { statusEl.textContent = text; statusEl.className = 'c-status ' + kind; };

  async function load() {
    setStatus('Loading…');
    try {
      const r = await fetch('/api/office', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      meta = await r.json();
      if (!S || !dirty) S = meta.settings;
      build();
      setStatus('Saved', 'ok');
    } catch (err) {
      setStatus('Could not load settings: ' + err.message, 'err');
    }
  }

  function commit(next, { keepPreset = false } = {}) {
    if (!keepPreset) next.preset = 'custom';
    S = next;
    dirty = true;
    onChange(clone(S));
    refresh();
    clearTimeout(timer);
    setStatus('Saving…');
    timer = setTimeout(save, 350);
  }
  const change = (mut, opts) => { const n = clone(S); mut(n); commit(n, opts); };

  async function save() {
    const my = ++seq;
    try {
      const r = await fetch('/api/office', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.errors && j.errors.join('; ')) || j.error || 'HTTP ' + r.status);
      if (my === seq) { dirty = false; S = j.settings; setStatus('Saved', 'ok'); refresh(); }
    } catch (err) {
      if (my === seq) { dirty = false; setStatus('Not saved: ' + err.message, 'err'); }
    }
  }

  async function reset() {
    clearTimeout(timer);
    const my = ++seq;
    setStatus('Resetting…');
    try {
      const r = await fetch('/api/office/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      if (my === seq) { dirty = false; S = j.settings; onChange(clone(S)); refresh(); setStatus('Reset to default', 'ok'); }
    } catch (err) { setStatus('Reset failed: ' + err.message, 'err'); }
  }

  function applyPreset(p) {
    const d = meta.defaults, ps = p.settings || {};
    const n = {
      ...clone(d), ...clone(ps),
      walls: { ...d.walls, ...(ps.walls || {}) },
      floors: { ...d.floors, ...(ps.floors || {}) },
      accessories: { ...d.accessories, ...(ps.accessories || {}) },
      name: S.name, sign: S.sign, preset: p.id,
    };
    commit(n, { keepPreset: true });
  }

  // ---- building blocks ---------------------------------------------------
  function section(title, ...kids) {
    return $('section', { class: 'c-sec' }, $('h3', {}, title), ...kids);
  }
  function row(label, ...kids) {
    return $('div', { class: 'c-row' }, $('div', { class: 'c-label' }, label), $('div', { class: 'c-ctl' }, ...kids));
  }
  function segmented(options, get, set) {
    const wrap = $('div', { class: 'seg' });
    const btns = options.map((o) => $('button', { type: 'button', on: { click: () => set(o.id) } }, o.label));
    wrap.append(...btns);
    refreshers.push(() => btns.forEach((b, i) => b.classList.toggle('on', get() === options[i].id)));
    return wrap;
  }
  function swatches(options, get, set, draw, { w = 16, h = 16 } = {}) {
    const wrap = $('div', { class: 'swatches' });
    const btns = options.map((o) => {
      const b = $('button', { type: 'button', class: 'sw', title: o.label, 'aria-label': o.label, on: { click: () => set(o.id) } });
      b.append(swatchCanvas(w, h, (g) => draw(g, o.id, w, h)));
      return b;
    });
    wrap.append(...btns);
    refreshers.push(() => btns.forEach((b, i) => b.classList.toggle('on', get() === options[i].id)));
    return wrap;
  }
  function toggle(label, get, set) {
    const input = $('input', { type: 'checkbox', on: { change: () => set(input.checked) } });
    const el = $('label', { class: 'tog' }, input, $('span', { class: 'box' }), $('span', {}, label));
    refreshers.push(() => { input.checked = get(); });
    return el;
  }

  const drawWall = (g, id, w, h) => drawWallSwatch(g, id, 'none', w, h);
  const drawFloor = (g, id, w, h) => drawFloorSwatch(g, id, w, h);
  const drawAccent = (g, id, w, h) => {
    g.fillStyle = '#2b2e39'; g.fillRect(0, 0, w, h);
    if (id === 'none') { g.fillStyle = '#d9534f'; for (let i = 0; i < w; i++) g.fillRect(i, i, 1, 1); return; }
    g.fillStyle = ACCENT_COLORS[id]; g.fillRect(0, 5, w, h - 5);
  };
  const drawRug = (g, id, w, h) => {
    const [b, l, d] = RUG_COLORS[id];
    g.fillStyle = d; g.fillRect(0, 0, w, h);
    g.fillStyle = b; g.fillRect(2, 2, w - 4, h - 4);
    g.fillStyle = l; g.fillRect(4, 4, w - 8, 1); g.fillRect(4, h - 5, w - 8, 1); g.fillRect(4, 4, 1, h - 8); g.fillRect(w - 5, 4, 1, h - 8);
  };
  const drawSofa = (g, id, w, h) => {
    const [b, l, d, p] = SOFA_COLORS[id];
    g.fillStyle = d; g.fillRect(0, 3, w, h - 5);
    g.fillStyle = l; g.fillRect(1, 8, w - 2, 5);
    g.fillStyle = b; g.fillRect(1, 4, w - 2, 4);
    g.fillStyle = p; g.fillRect(3, 5, 4, 4);
  };

  // ---- panel ---------------------------------------------------------------
  function build() {
    refreshers.length = 0;
    body.innerHTML = '';
    const O = meta.options;

    // Presets
    const presetWrap = $('div', { class: 'presets' });
    const presetBtns = meta.presets.map((p) => {
      const ps = p.settings || {};
      const wall = (ps.walls && ps.walls.work) || meta.defaults.walls.work;
      const fl = (ps.floors && ps.floors.work) || meta.defaults.floors.work;
      const fl2 = (ps.floors && ps.floors.lounge) || meta.defaults.floors.lounge;
      const cv = swatchCanvas(48, 28, (g) => {
        drawWallSwatch(g, wall, ps.accent || meta.defaults.accent, 48, 14);
        g.save(); g.translate(0, 14); drawFloorSwatch(g, fl, 32, 14); g.restore();
        g.save(); g.translate(32, 14); drawFloorSwatch(g, fl2, 16, 14); g.restore();
        if (ps.lighting === 'night') { g.globalCompositeOperation = 'multiply'; g.fillStyle = '#8690c6'; g.fillRect(0, 0, 48, 28); }
      });
      return $('button', { type: 'button', class: 'preset', on: { click: () => applyPreset(p) } }, cv, $('span', {}, p.label));
    });
    presetWrap.append(...presetBtns);
    refreshers.push(() => presetBtns.forEach((b, i) => b.classList.toggle('on', S.preset === meta.presets[i].id)));

    // Brand
    const nameInput = $('input', { type: 'text', maxlength: '32', spellcheck: 'false', 'aria-label': 'Office name' });
    nameInput.addEventListener('input', () => {
      const v = nameInput.value.replace(/[<>]/g, '');
      if (v.trim()) change((n) => { n.name = v.trim(); }, { keepPreset: true });
    });
    nameInput.addEventListener('blur', () => { if (!nameInput.value.trim()) nameInput.value = S.name; });
    refreshers.push(() => { if (document.activeElement !== nameInput) nameInput.value = S.name; });

    const wallRows = O.wallRooms.map((r) => row(r.label, swatches(O.walls, () => S.walls[r.id], (v) => change((n) => { n.walls[r.id] = v; }), drawWall, { w: 16, h: 22 })));
    const allWalls = $('button', { type: 'button', class: 'mini', on: { click: () => change((n) => { for (const r of O.wallRooms) n.walls[r.id] = S.walls.work; }) } }, 'Use work-room walls everywhere');
    const floorRows = O.rooms.map((r) => row(r.label, swatches(O.floors, () => S.floors[r.id], (v) => change((n) => { n.floors[r.id] = v; }), drawFloor)));
    const toggles = $('div', { class: 'toggles' }, O.accessories.map((a) => toggle(a.label, () => S.accessories[a.id] !== false, (v) => change((n) => { n.accessories[a.id] = v; }))));

    body.append(
      section('Theme presets', presetWrap),
      section('Branding',
        row('Office name', nameInput),
        row('Wall sign', segmented(O.sign, () => S.sign, (v) => change((n) => { n.sign = v; }, { keepPreset: true })))),
      section('Walls', ...wallRows, row('Accent stripe', swatches(O.accent, () => S.accent, (v) => change((n) => { n.accent = v; }), drawAccent)), allWalls),
      section('Flooring', ...floorRows),
      section('Accessories', toggles,
        row('Monitors / desk', segmented(O.monitors, () => S.monitors, (v) => change((n) => { n.monitors = v; }))),
        row('Plant style', segmented(O.plantStyle, () => S.plantStyle, (v) => change((n) => { n.plantStyle = v; }))),
        row('Rug colour', swatches(O.rugColor, () => S.rugColor, (v) => change((n) => { n.rugColor = v; }), drawRug)),
        row('Sofa colour', swatches(O.sofaColor, () => S.sofaColor, (v) => change((n) => { n.sofaColor = v; }), drawSofa))),
      section('Lighting', segmented(O.lighting, () => S.lighting, (v) => change((n) => { n.lighting = v; }))),
    );
    refresh();
  }

  function refresh() { for (const f of refreshers) f(); }

  function open() {
    panel.hidden = false;
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
    onOpen(panel.offsetWidth);
    load();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
    onClose();
  }
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.getElementById('c-close').addEventListener('click', close);
  document.getElementById('c-reset').addEventListener('click', reset);
  if (new URLSearchParams(location.search).has('customize')) open();

  return {
    isOpen: () => !panel.hidden,
    isDirty: () => dirty,
    close,
    sync(serverSettings) {
      if (dirty) return;
      S = clone(serverSettings);
      if (meta) { meta.settings = S; refresh(); }
    },
  };
}

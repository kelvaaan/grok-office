// Dev helper: derive web-friendly variants of the Orbit Group logo with headless Chrome.
//   node scripts/make-logo-assets.mjs [public/assets/orbit-group-logo.png]
// Writes: orbit-group-logo-white.png (white on transparent, trimmed),
//         orbit-mark.png (ring mark on black, 64x64 favicon), orbit-mark-white.png (ring only, transparent)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const src = process.argv[2] || 'public/assets/orbit-group-logo.png';
const outDir = path.dirname(src);
const dataUrl = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H);
  // Find the black plate: pixels that are dark. Everything bright *inside* the plate is artwork.
  let px0 = W, py0 = H, px1 = 0, py1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const l = d.data[i] + d.data[i + 1] + d.data[i + 2];
    if (l < 60 && d.data[i + 3] > 200) { if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y; }
  }
  const inset = 4;
  px0 += inset; py0 += inset; px1 -= inset; py1 -= inset;
  // White-on-transparent: alpha = luminance (the art is anti-aliased white on black).
  const wc = document.createElement('canvas'); wc.width = W; wc.height = H;
  const wg = wc.getContext('2d');
  const wd = wg.createImageData(W, H);
  let ax0 = W, ay0 = H, ax1 = 0, ay1 = 0;
  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
    const i = (y * W + x) * 4;
    const l = Math.max(d.data[i], d.data[i + 1], d.data[i + 2]);
    const a = Math.max(0, Math.min(255, Math.round((l - 20) * 255 / 222)));
    if (!a) continue;
    wd.data[i] = 255; wd.data[i + 1] = 255; wd.data[i + 2] = 255; wd.data[i + 3] = a;
    if (a > 40) { if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y; }
  }
  wg.putImageData(wd, 0, 0);
  const pad = 6;
  const crop = (x0, y0, x1, y1) => {
    const cc = document.createElement('canvas'); cc.width = x1 - x0 + 1 + pad * 2; cc.height = y1 - y0 + 1 + pad * 2;
    cc.getContext('2d').drawImage(wc, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
    return cc;
  };
  // Downscale in halving steps for a clean anti-aliased result.
  const fit = (src, h) => {
    let cur = src;
    while (cur.height / 2 >= h) {
      const n = document.createElement('canvas'); n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
      const ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    const n = document.createElement('canvas'); n.height = h; n.width = Math.round(cur.width * h / cur.height);
    const ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(cur, 0, 0, n.width, n.height);
    return n;
  };
  const white = fit(crop(ax0, ay0, ax1, ay1), 128);
  // Ring mark: the left-most connected blob. Find the gap column between ring and text.
  const colHas = (x) => { for (let y = ay0; y <= ay1; y++) if (wd.data[(y * W + x) * 4 + 3] > 40) return true; return false; };
  let x = ax0; while (x <= ax1 && colHas(x)) x++;
  const ringX1 = x - 1;
  let ry0 = H, ry1 = 0;
  for (let y = ay0; y <= ay1; y++) for (let xx = ax0; xx <= ringX1; xx++) if (wd.data[(y * W + xx) * 4 + 3] > 40) { if (y < ry0) ry0 = y; if (y > ry1) ry1 = y; }
  const ringFull = crop(ax0, ry0, ringX1, ry1);
  const ring = fit(ringFull, 128);
  const mark = document.createElement('canvas'); mark.width = 64; mark.height = 64;
  const mg = mark.getContext('2d');
  mg.fillStyle = '#0b0b0e'; mg.fillRect(0, 0, 64, 64);
  mg.imageSmoothingQuality = 'high';
  const small = fit(ringFull, 54);
  mg.drawImage(small, (64 - small.width) / 2, (64 - small.height) / 2);
  return { white: white.toDataURL('image/png'), ring: ring.toDataURL('image/png'), mark: mark.toDataURL('image/png'),
    info: { plate: [px0, py0, px1, py1], art: [ax0, ay0, ax1, ay1], ringX1, ringY: [ry0, ry1], W, H } };
}, dataUrl);
await browser.close();
const save = (name, url) => fs.writeFileSync(path.join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
save('orbit-group-logo-white.png', out.white);
save('orbit-mark-white.png', out.ring);
save('orbit-mark.png', out.mark);
console.log(JSON.stringify(out.info));

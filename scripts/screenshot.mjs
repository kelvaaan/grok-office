// Dev helper: headless screenshot + console-error check.
// Requires playwright-core (not a runtime dependency):  npm i -g playwright-core
//   node scripts/screenshot.mjs [url] [out.png] [width] [height]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const url = process.argv[2] || 'http://127.0.0.1:3200/';
const out = process.argv[3] || 'screenshot.png';
const width = Number(process.argv[4] || 1440), height = Number(process.argv[5] || 860);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(process.env.DPR || 1) });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(Number(process.env.WAIT || 2500));
if (process.env.CLICK) {
  await page.evaluate((id) => document.querySelectorAll('.chip').forEach((b) => { if (b.textContent.trim() === id) b.click(); }), process.env.CLICK);
  await page.waitForTimeout(400);
}
const info = await page.evaluate(() => {
  const w = window.__grokOffice;
  return { chars: w ? w.chars.size : 0, labels: (w && w.hitboxes || []).length, connected: w && w.connected, chips: document.querySelectorAll('.chip').length };
});
const clip = process.env.CLIP ? (([x, y, w, h]) => ({ x, y, width: w, height: h }))(process.env.CLIP.split(',').map(Number)) : undefined;
await page.screenshot({ path: out, clip });
await browser.close();
console.log(JSON.stringify({ out, ...info, errors }, null, 2));
if (errors.length) process.exit(2);

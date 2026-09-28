// Renders LiGo's logo PNGs, apple-touch-icon.png and favicon.ico from the SVGs in public/logo.
// LiGo's own tooling (MIT, ADR 0006); replaces upstream's ImageMagick script for the lichess logo.
// Run from lila/: node bin/gen/ligo-logo.mjs  (uses lila's Playwright and the preinstalled Chromium)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const logo = f => readFileSync(`public/logo/${f}`, 'utf8');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();

async function render(html, width, height, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden">${html}</body></html>`,
  );
  return page.screenshot({ omitBackground: transparent, type: 'png' });
}

const icon = (svg, size, pad = 0) =>
  `<div style="padding:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;

const out = {};
for (const px of [16, 32, 48, 64, 128, 192, 256, 512]) {
  const png = await render(icon(logo('ligo-favicon.svg'), px), px, px);
  out[px] = png;
  if (px >= 32) writeFileSync(`public/logo/ligo-favicon-${px}.png`, png);
}
writeFileSync('public/logo/ligo-mono-128.png', await render(icon(logo('ligo-white.svg'), 128), 128, 128));
writeFileSync(
  'public/apple-touch-icon.png',
  await render(
    `<div style="background:#c9a15a">${icon(logo('ligo-favicon.svg'), 180, 18)}</div>`,
    180,
    180,
    false,
  ),
);
writeFileSync(
  'public/logo/ligo-tile-wide.png',
  await render(
    `<div style="display:flex;align-items:center;justify-content:center;gap:60px;width:1200px;height:630px;background:#c9a15a;font:bold 180px sans-serif;color:#1d1d1d">
       <div style="width:300px;height:300px">${logo('ligo-favicon.svg').replace('<svg ', '<svg width="100%" height="100%" ')}</div>LiGo</div>`,
    1200,
    630,
    false,
  ),
);
await browser.close();

// favicon.ico: an ICO directory holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((px, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(px, e);
  header.writeUInt8(px, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(out[px].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += out[px].length;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...sizes.map(px => out[px])]));
console.log('wrote public/logo/*.png, public/apple-touch-icon.png, public/favicon.ico');

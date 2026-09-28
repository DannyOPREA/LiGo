import { chromium } from '@playwright/test';
// TEMPORARY (unit 2.4): where a Playwright diff picture's red (changed) pixels are, as a coarse grid.
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.LIGO_CHROMIUM || undefined });
const page = await browser.newPage();
for (const f of process.argv.slice(2)) {
  const cells = await page.evaluate(async data => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const out = {};
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) {
          const k = `${Math.floor(x / 40) * 40},${Math.floor(y / 40) * 40}`;
          out[k] = (out[k] || 0) + 1;
        }
      }
    return { w: c.width, h: c.height, out };
  }, readFileSync(f).toString('base64'));
  console.log(
    `DIFFMAP ${f} ${cells.w}x${cells.h} ` +
      Object.entries(cells.out)
        .map(([k, v]) => `${k}:${v}`)
        .join(' '),
  );
}
await browser.close();

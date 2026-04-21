#!/usr/bin/env node
/**
 * Renders each species SVG to a 512×512 PNG using Playwright.
 * Output: public/sprites/{species}.png
 *
 * Usage: node scripts/rasterize-sprites.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = resolve(__dir, '../public/sprites');
const SPECIES = ['oak', 'magnolia', 'azalea', 'fern'];
const SIZE = 512;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

for (const sp of SPECIES) {
  const svgPath = `${SPRITES_DIR}/${sp}.svg`;
  const svgContent = readFileSync(svgPath, 'utf8');

  // Wrap SVG in an HTML page that fills the viewport
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:transparent">
<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}"
     style="width:${SIZE}px;height:${SIZE}px;display:block;object-fit:contain" />
</body></html>`;

  await page.setContent(html);
  await page.waitForTimeout(300); // let SVG render fully

  const png = await page.screenshot({ type: 'png', omitBackground: true });
  const outPath = `${SPRITES_DIR}/${sp}.png`;
  writeFileSync(outPath, png);
  console.log(`Written ${outPath} (${Math.round(png.length / 1024)}KB)`);
}

await browser.close();
console.log('Done.');

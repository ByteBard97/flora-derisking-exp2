#!/usr/bin/env node
/**
 * Headless Playwright FPS benchmark for experiment-2 (tldraw).
 *
 * Usage:
 *   node benchmark/run.mjs [--url http://localhost:5173] [--reps 5] [--out benchmark/results.json]
 *
 * Outputs a JSON file consumed by benchmark/report.mjs to generate an HTML report.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------- CLI args ----------

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const BASE_URL = args.url ?? 'http://localhost:5173';
const REPS     = parseInt(args.reps ?? '5', 10);
const OUT_PATH = args.out ?? new URL('results.json', import.meta.url).pathname;

// ---------- Scenario matrix ----------

const PLANT_COUNTS   = [50, 100, 200, 300];
const ZOOM_LEVELS    = [0.08, 0.3, 1.0, 3.0];
const MOVEMENT_TYPES = ['still', 'pan', 'zoom'];
const BACKGROUNDS    = ['none', 'bg1', 'bg3'];
const RENDER_MODES   = ['svg', 'png', 'use'];
const DURATION_MS    = 5000; // per scenario rep

// Build scenario list
const scenarios = [];

// --- Baseline matrix (svg mode only, same as original run) ---
for (const plantCount of PLANT_COUNTS) {
  for (const movementType of MOVEMENT_TYPES) {
    for (const bg of BACKGROUNDS) {
      scenarios.push({ plantCount, zoomLevel: 0.08, movementType, bg, bgSize: 400, renderMode: 'svg' });
    }
  }
}
for (const zoomLevel of ZOOM_LEVELS) {
  for (const movementType of ['still', 'pan']) {
    scenarios.push({ plantCount: 300, zoomLevel, movementType, bg: 'none', bgSize: 400, renderMode: 'svg' });
  }
}

// --- Render mode comparison (key scenarios only: 300 plants, no bg, zoom 0.08 + 0.3) ---
for (const renderMode of ['png', 'use']) {
  for (const zoomLevel of [0.08, 0.3]) {
    for (const movementType of ['still', 'pan']) {
      scenarios.push({ plantCount: 300, zoomLevel, movementType, bg: 'none', bgSize: 400, renderMode });
    }
  }
}

// ---------- Helpers ----------

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (s.length - 1));
  return s[idx];
}

function frameTimesToFPS(frameTimes) {
  // frameTimes is array of ms-per-frame; filter out startup spikes (>500ms)
  const valid = frameTimes.filter(t => t > 0 && t < 500);
  if (!valid.length) return { fps: 0, p50: 0, p95: 0, p5: 0 };
  const medMs = median(valid);
  return {
    fps: Math.round(1000 / medMs * 10) / 10,
    p50: Math.round(medMs * 10) / 10,
    p95: Math.round(percentile(valid, 95) * 10) / 10,
    p5:  Math.round(percentile(valid, 5) * 10) / 10,
  };
}

// ---------- Wait for app ready ----------

async function waitForReady(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const f = window.__flora__;
    const e = window.__flora_editor__;
    return f && e && typeof f.runBenchmarkScenario === 'function';
  }, { timeout: timeoutMs });
}

// ---------- Run one rep of one scenario ----------

async function runRep(page, scenario) {
  const { plantCount, zoomLevel, movementType, bg, bgSize, renderMode = 'svg' } = scenario;

  // Configure state via window.__flora__
  await page.evaluate(({ plantCount, bg, bgSize, renderMode }) => {
    window.__flora__.setPlantCount(plantCount);
    window.__flora__.setBackground(bg);
    window.__flora__.setBgSize(bgSize);
    window.__flora__.setRenderMode(renderMode);
  }, { plantCount, bg, bgSize, renderMode });

  // Give Vue reactivity + tldraw a frame to settle after plant count change
  await page.waitForTimeout(800);

  // Run the scenario
  const frameTimes = await page.evaluate(({ durationMs, movementType, zoomLevel }) => {
    return window.__flora__.runBenchmarkScenario({ durationMs, movementType, zoomLevel });
  }, { durationMs: DURATION_MS, movementType, zoomLevel });

  return frameTimesToFPS(frameTimes);
}

// ---------- Main ----------

async function main() {
  console.log(`\nFlora tldraw benchmark`);
  console.log(`URL:      ${BASE_URL}`);
  console.log(`Reps:     ${REPS}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Est. time: ~${Math.ceil(scenarios.length * REPS * (DURATION_MS + 1000) / 60000)} min\n`);

  // Must run headed — tldraw's React bridge (veaury) doesn't mount in headless Chromium.
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[page error]', msg.text());
  });

  await page.goto(BASE_URL);
  await waitForReady(page);
  console.log('App ready.\n');

  const results = [];
  let done = 0;

  for (const scenario of scenarios) {
    const reps = [];
    for (let r = 0; r < REPS; r++) {
      const stats = await runRep(page, scenario);
      reps.push(stats);
      process.stdout.write('.');
    }

    // Aggregate across reps: median of medians
    const agg = {
      fps:  Math.round(median(reps.map(r => r.fps)) * 10) / 10,
      p50:  Math.round(median(reps.map(r => r.p50)) * 10) / 10,
      p95:  Math.round(median(reps.map(r => r.p95)) * 10) / 10,
      p5:   Math.round(median(reps.map(r => r.p5)) * 10) / 10,
    };

    results.push({ ...scenario, reps, agg });
    done++;
    console.log(
      ` [${done}/${scenarios.length}] mode=${scenario.renderMode ?? 'svg'} plants=${scenario.plantCount}` +
      ` zoom=${scenario.zoomLevel} move=${scenario.movementType} bg=${scenario.bg}` +
      ` → ${agg.fps} fps (p95 frame: ${agg.p95}ms)`
    );
  }

  await browser.close();

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ meta: { url: BASE_URL, reps: REPS, durationMs: DURATION_MS, ts: new Date().toISOString() }, results }, null, 2));
  console.log(`\nResults written to ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });

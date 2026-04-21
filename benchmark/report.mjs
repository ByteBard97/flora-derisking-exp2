#!/usr/bin/env node
/**
 * Generates an HTML report from benchmark/results.json.
 *
 * Usage:
 *   node benchmark/report.mjs [--in benchmark/results.json] [--out benchmark/report.html]
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('='); return [k, v ?? true];
  })
);

const IN_PATH  = args.in  ?? new URL('results.json', import.meta.url).pathname;
const OUT_PATH = args.out ?? new URL('report.html',  import.meta.url).pathname;

const { meta, results } = JSON.parse(readFileSync(IN_PATH, 'utf8'));

// ---------- Group helpers ----------

function group(results, key) {
  const map = new Map();
  for (const r of results) {
    const k = r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function filterBy(results, pred) { return results.filter(pred); }

// ---------- Chart data builders ----------

const COLORS = {
  50:   '#4ade80',
  100:  '#22d3ee',
  200:  '#f59e0b',
  300:  '#f87171',
  none: '#9ca3af',
  bg1:  '#86efac',
  bg3:  '#fca5a5',
  still:'#60a5fa',
  pan:  '#f472b6',
  zoom: '#a78bfa',
  svg:  '#60a5fa',
  png:  '#f59e0b',
  use:  '#4ade80',
};

function barChartConfig(title, labels, datasets) {
  return {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: title, color: '#e5e7eb', font: { size: 14 } },
        legend: { labels: { color: '#9ca3af' } },
      },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, title: { display: true, text: 'FPS', color: '#9ca3af' } },
      },
    },
  };
}

// Chart 1: FPS vs plant count, grouped by movement type (bg=none, zoom=0.08)
function chart_plants_vs_fps() {
  const base = filterBy(results, r => r.bg === 'none' && r.zoomLevel === 0.08);
  const byMove = group(base, 'movementType');
  const labels = [50, 100, 200, 300].map(String);
  const datasets = [];
  for (const [move, rows] of byMove) {
    datasets.push({
      label: `movement: ${move}`,
      backgroundColor: COLORS[move] ?? '#fff',
      data: [50, 100, 200, 300].map(n => rows.find(r => r.plantCount === n)?.agg.fps ?? null),
    });
  }
  return barChartConfig('FPS vs Plant Count (no bg, zoom 0.08)', labels, datasets);
}

// Chart 2: FPS vs zoom level, pan vs still (300 plants, no bg)
function chart_zoom_vs_fps() {
  const base = filterBy(results, r => r.plantCount === 300 && r.bg === 'none');
  const byMove = group(base, 'movementType');
  const labels = [0.08, 0.3, 1.0, 3.0].map(String);
  const datasets = [];
  for (const [move, rows] of byMove) {
    datasets.push({
      label: `movement: ${move}`,
      backgroundColor: COLORS[move] ?? '#fff',
      data: [0.08, 0.3, 1.0, 3.0].map(z => rows.find(r => r.zoomLevel === z)?.agg.fps ?? null),
    });
  }
  return barChartConfig('FPS vs Zoom Level (300 plants, no bg)', labels, datasets);
}

// Chart 3: Background impact (300 plants, still, zoom 0.08)
function chart_bg_vs_fps() {
  const base = filterBy(results, r => r.plantCount === 300 && r.zoomLevel === 0.08);
  const byMove = group(base, 'movementType');
  const labels = ['none', 'bg1', 'bg3'];
  const datasets = [];
  for (const [move, rows] of byMove) {
    datasets.push({
      label: `movement: ${move}`,
      backgroundColor: COLORS[move] ?? '#fff',
      data: labels.map(bg => rows.find(r => r.bg === bg)?.agg.fps ?? null),
    });
  }
  return barChartConfig('Background Impact on FPS (300 plants, zoom 0.08)', labels, datasets);
}

// Chart 4: Render mode comparison (svg vs png vs use) — 300 plants, no bg
function chart_render_modes() {
  const labels = ['z=0.08 still', 'z=0.08 pan', 'z=0.3 still', 'z=0.3 pan'];
  const datasets = ['svg', 'png', 'use'].map(mode => {
    const rows = filterBy(results, r => (r.renderMode ?? 'svg') === mode && r.plantCount === 300 && r.bg === 'none');
    return {
      label: `render: ${mode}`,
      backgroundColor: COLORS[mode] ?? '#fff',
      data: [
        rows.find(r => r.zoomLevel === 0.08 && r.movementType === 'still')?.agg.fps ?? null,
        rows.find(r => r.zoomLevel === 0.08 && r.movementType === 'pan')?.agg.fps ?? null,
        rows.find(r => r.zoomLevel === 0.3  && r.movementType === 'still')?.agg.fps ?? null,
        rows.find(r => r.zoomLevel === 0.3  && r.movementType === 'pan')?.agg.fps ?? null,
      ],
    };
  });
  return barChartConfig('Render Mode Comparison: SVG vs PNG vs <use> (300 plants, no bg)', labels, datasets);
}

// Chart 5: p95 frame time (worst-frame latency) vs plant count, pan only, no bg
function chart_p95_latency() {
  const base = filterBy(results, r => r.bg === 'none' && r.zoomLevel === 0.08 && r.movementType === 'pan');
  const labels = [50, 100, 200, 300].map(String);
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'p95 frame time (ms)',
        backgroundColor: '#f59e0b',
        data: [50, 100, 200, 300].map(n => base.find(r => r.plantCount === n)?.agg.p95 ?? null),
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'p95 Frame Time vs Plant Count (pan, no bg, zoom 0.08)', color: '#e5e7eb', font: { size: 14 } },
        legend: { labels: { color: '#9ca3af' } },
      },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, title: { display: true, text: 'ms', color: '#9ca3af' } },
      },
    },
  };
}

// ---------- Summary table ----------

function summaryRows() {
  return results.map(r => `
    <tr>
      <td>${r.plantCount}</td>
      <td>${r.zoomLevel}</td>
      <td>${r.movementType}</td>
      <td>${r.bg}</td>
      <td>${r.agg.fps}</td>
      <td>${r.agg.p50}</td>
      <td>${r.agg.p95}</td>
      <td>${r.agg.p5}</td>
    </tr>`).join('');
}

// ---------- HTML ----------

const charts = [chart_plants_vs_fps(), chart_zoom_vs_fps(), chart_bg_vs_fps(), chart_render_modes(), chart_p95_latency()];
const chartIds = charts.map((_, i) => `chart${i}`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Flora tldraw Benchmark Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #e5e7eb; font-family: system-ui, sans-serif; padding: 24px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(560px, 1fr)); gap: 24px; margin-bottom: 32px; }
    .card { background: #1f2937; border-radius: 8px; padding: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 6px 10px; border-bottom: 1px solid #374151; text-align: right; }
    th { color: #9ca3af; text-align: right; }
    td:nth-child(3), td:nth-child(4), th:nth-child(3), th:nth-child(4) { text-align: left; }
    tr:hover td { background: #374151; }
    .note { color: #6b7280; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>Flora tldraw Benchmark</h1>
  <div class="meta">Run: ${meta.ts} · URL: ${meta.url} · ${meta.reps} reps × ${meta.durationMs / 1000}s · ${results.length} scenarios</div>

  <div class="grid">
    ${charts.map((cfg, i) => `<div class="card"><canvas id="${chartIds[i]}"></canvas></div>`).join('\n    ')}
  </div>

  <div class="card">
    <h2 style="font-size:14px;color:#9ca3af;margin-bottom:12px;">All Results</h2>
    <table>
      <thead><tr>
        <th>Plants</th><th>Zoom</th><th>Movement</th><th>BG</th>
        <th>FPS (med)</th><th>p50 frame</th><th>p95 frame</th><th>p5 frame</th>
      </tr></thead>
      <tbody>${summaryRows()}</tbody>
    </table>
    <div class="note">FPS = median across reps. Frame times in ms. p95 = worst-case frame latency (jank). p5 = best-case.</div>
  </div>

  <script>
    const configs = ${JSON.stringify(charts)};
    configs.forEach((cfg, i) => {
      new Chart(document.getElementById('chart' + i), cfg);
    });
  </script>
</body>
</html>`;

writeFileSync(OUT_PATH, html);
console.log(`Report written to ${OUT_PATH}`);

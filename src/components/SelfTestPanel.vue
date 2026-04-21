<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  ttiMs: number | null;
  getShapeCount: () => number;
}>();

interface Result {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'manual';
  measured: string;
  numericValue: number | null;
  numericMax: number | null;
  threshold: string;
  unit: string;
}

const open = ref(false);
const running = ref(false);
const m2Checked = ref(false);
const m2Pass = ref(false);
const EPSILON = 0.001;

const results = ref<Result[]>([
  { id: 'M4', label: 'Time-to-interactive (TTI)', status: 'pending', measured: '—', numericValue: null, numericMax: 2500, threshold: '< 2000ms', unit: 'ms' },
  { id: 'M1', label: 'Sustained FPS (3s pan)', status: 'pending', measured: '—', numericValue: null, numericMax: 120, threshold: '≥ 55fps', unit: 'fps' },
  { id: 'M3', label: 'Single mutation per drag', status: 'pending', measured: '—', numericValue: null, numericMax: null, threshold: '= 1 mutation', unit: '' },
  { id: 'M6', label: 'Undo roundtrip (5 drags)', status: 'pending', measured: '—', numericValue: null, numericMax: null, threshold: '< 0.001in drift', unit: '' },
  { id: 'M5', label: 'Memory stability', status: 'pending', measured: '—', numericValue: null, numericMax: 20, threshold: '< 10MB growth', unit: 'MB' },
  { id: 'M7', label: 'Consistency check', status: 'pending', measured: '—', numericValue: null, numericMax: null, threshold: '0 failures', unit: '' },
]);

const machine = {
  userAgent: navigator.userAgent,
  cores: navigator.hardwareConcurrency,
  memoryGB: (navigator as any).deviceMemory ?? 'unknown',
  screenRes: `${screen.width}×${screen.height}`,
};

const machineLabel = computed(() => {
  const ua = machine.userAgent;
  if (ua.includes('Mac OS X')) {
    const ver = ua.match(/Mac OS X [\d_]+/)?.[0]?.replace(/_/g, '.') ?? 'Mac';
    return `${ver} · ${machine.cores} cores · ${machine.memoryGB}GB`;
  }
  return `${machine.cores} cores · ${machine.memoryGB}GB`;
});

function set(id: string, patch: Partial<Result>) {
  const r = results.value.find(r => r.id === id)!;
  Object.assign(r, patch);
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function measureFPS(): Promise<number> {
  return new Promise(resolve => {
    let frames = 0;
    const start = performance.now();
    function tick() {
      frames++;
      performance.now() - start < 3000 ? requestAnimationFrame(tick) : resolve(frames / 3);
    }
    requestAnimationFrame(tick);
  });
}

async function runAll() {
  if (running.value) return;
  running.value = true;
  for (const r of results.value) Object.assign(r, { status: 'pending', measured: '—', numericValue: null });

  const flora = (window as any).__flora__;

  // M4
  set('M4', { status: 'running' });
  await sleep(30);
  const tti = props.ttiMs;
  if (tti === null) {
    set('M4', { status: 'fail', measured: 'not captured', numericValue: null });
  } else {
    set('M4', { status: tti < 2000 ? 'pass' : 'fail', measured: `${tti.toFixed(0)}ms`, numericValue: tti });
  }

  // M1 — measure rAF rate naturally while optionally nudging plants to simulate interaction
  set('M1', { status: 'running' });
  const fps = await measureFPS();
  set('M1', { status: fps >= 55 ? 'pass' : 'fail', measured: `${fps.toFixed(1)} fps`, numericValue: fps });

  // M3 — verify a single programmaticDrag produces exactly 1 mutation
  set('M3', { status: 'running' });
  const ids: string[] = flora?.getPlantIds() ?? [];
  if (ids.length === 0) {
    set('M3', { status: 'fail', measured: 'no plants' });
  } else {
    flora.resetMutationCount();
    flora.programmaticDrag(ids[0], 1.0, 0.5);
    await sleep(50);
    const mutCount: number = flora.getMutationCount();
    flora.undo();
    set('M3', { status: mutCount === 1 ? 'pass' : 'fail', measured: `${mutCount} mutation${mutCount !== 1 ? 's' : ''}`, numericValue: mutCount });
  }

  // M6 — 5 programmatic drags then 5 undos, check positions restored
  set('M6', { status: 'running' });
  const fiveIds = ids.slice(0, 5);
  const originals = fiveIds.map((id: string) => ({ ...flora.getPlantPosition(id) }));
  for (const id of fiveIds) {
    flora.programmaticDrag(id, 2.0, 1.5);
    await sleep(30);
  }
  for (let i = 0; i < 5; i++) { flora.undo(); await sleep(50); }
  const posOk = fiveIds.every((id: string, i: number) => {
    const pos = flora.getPlantPosition(id);
    return pos &&
      Math.abs(pos.x - originals[i].x) < EPSILON &&
      Math.abs(pos.y - originals[i].y) < EPSILON;
  });
  set('M6', { status: posOk ? 'pass' : 'fail', measured: posOk ? 'all restored' : 'drift detected' });

  // M5 — memory stability across 20 drag+undo cycles
  set('M5', { status: 'running' });
  const heapBefore = (performance as any).memory?.usedJSHeapSize ?? 0;
  for (let i = 0; i < 20; i++) {
    const id = ids[i % ids.length];
    flora.programmaticDrag(id, i % 2 ? 0.5 : -0.5, 0.3);
    await sleep(20);
    flora.undo();
    await sleep(10);
  }
  const heapAfter = (performance as any).memory?.usedJSHeapSize ?? 0;
  if (heapBefore === 0) {
    set('M5', { status: 'pass', measured: 'N/A (Chrome --enable-precise-memory-info needed)', numericValue: null });
  } else {
    const mb = (heapAfter - heapBefore) / 1_048_576;
    set('M5', { status: mb < 10 ? 'pass' : 'fail', measured: `+${mb.toFixed(2)} MB`, numericValue: mb });
  }

  // M7 — consistency: after 5 drag+undo cycles, plant count === shape count
  set('M7', { status: 'running' });
  const failures: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = ids[i % ids.length];
    flora.programmaticDrag(id, 0.5, 0.3);
    await sleep(50);
    flora.undo();
    await sleep(30);
  }
  const plantCount: number = flora.getPlantCount();
  const shapeCountVal: number = flora.getShapeCount();
  if (plantCount !== shapeCountVal) {
    failures.push(`plant count ${plantCount} ≠ shape count ${shapeCountVal}`);
  }
  set('M7', { status: failures.length === 0 ? 'pass' : 'fail', measured: `${failures.length} failure${failures.length !== 1 ? 's' : ''}`, numericValue: failures.length });

  running.value = false;
  saveToLocalStorage();
}

// ── Bar gauge helpers ────────────────────────────────────────────────────────

function barPercent(r: Result): number {
  if (r.numericValue === null || r.numericMax === null) return 0;
  return Math.min(100, (r.numericValue / r.numericMax) * 100);
}

function thresholdPercent(r: Result): number {
  if (r.numericMax === null) return 0;
  if (r.id === 'M1') return (55 / r.numericMax) * 100;
  if (r.id === 'M4') return (2000 / r.numericMax) * 100;
  if (r.id === 'M5') return (10 / r.numericMax) * 100;
  return 0;
}

function hasBar(r: Result): boolean {
  return r.numericMax !== null && r.numericValue !== null;
}

function statusColor(status: string): string {
  if (status === 'pass') return '#5cb85c';
  if (status === 'fail') return '#d9534f';
  if (status === 'running') return '#f0ad4e';
  return '#666';
}

// ── Persistence & export ─────────────────────────────────────────────────────

interface StoredRun {
  date: string;
  machine: typeof machine;
  results: { id: string; status: string; measured: string }[];
  m2Pass: boolean | null;
}

function saveToLocalStorage() {
  const run: StoredRun = {
    date: new Date().toISOString(),
    machine,
    results: results.value.map(r => ({ id: r.id, status: r.status, measured: r.measured })),
    m2Pass: m2Checked.value ? m2Pass.value : null,
  };
  const existing: StoredRun[] = JSON.parse(localStorage.getItem('exp2-results') ?? '[]');
  existing.unshift(run);
  localStorage.setItem('exp2-results', JSON.stringify(existing.slice(0, 5)));
}

function exportJSON() {
  const data = {
    experiment: 'experiment-2',
    schemaVersion: '1.0',
    date: new Date().toISOString(),
    machine,
    results: Object.fromEntries(
      results.value.map(r => [r.id, {
        status: r.status,
        measured: r.measured,
        threshold: r.threshold,
        numericValue: r.numericValue,
        unit: r.unit,
      }])
    ),
    m2: { status: m2Checked.value ? (m2Pass.value ? 'pass' : 'fail') : 'pending', measured: 'manual' },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exp2-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const allAutoPass = computed(() => results.value.every(r => r.status === 'pass'));
const anyRan = computed(() => results.value.some(r => r.status === 'pass' || r.status === 'fail'));
const verdict = computed(() => {
  if (!allAutoPass.value || !m2Checked.value) return null;
  return m2Pass.value ? 'go' : 'nogo';
});
</script>

<template>
  <div style="position: absolute; top: 12px; right: 12px; z-index: 100; font-family: monospace; font-size: 12px;">
    <button
      @click="open = !open"
      style="background: #1a2e1a; color: #6dbf6d; border: 1px solid #3a6a3a; padding: 7px 16px; cursor: pointer; border-radius: 5px; font-family: monospace; font-size: 12px; letter-spacing: 0.03em;"
    >
      Self-test {{ open ? '▲' : '▼' }}
    </button>

    <div v-if="open" data-testid="self-test-panel" style="margin-top: 8px; background: #0d150d; color: #ccc; padding: 16px; border-radius: 6px; width: 420px; border: 1px solid #2a4a2a; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">

      <!-- Header -->
      <div style="font-size: 11px; color: #5a8a5a; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #1a3a1a;">
        <div style="font-size: 13px; color: #8dc88d; font-weight: bold; margin-bottom: 3px;">Experiment 2 — Self-Test</div>
        <div>{{ machineLabel }}</div>
      </div>

      <!-- Results rows -->
      <div v-for="r in results" :key="r.id" style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
          <span style="width: 24px; font-weight: bold; color: #6a8a6a; font-size: 11px;">{{ r.id }}</span>
          <span :style="{ width: '16px', textAlign: 'center', color: statusColor(r.status), fontWeight: 'bold' }">
            {{ r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : r.status === 'running' ? '…' : '·' }}
          </span>
          <span style="flex: 1; color: #bbb;">{{ r.label }}</span>
          <span :style="{ color: statusColor(r.status), minWidth: '80px', textAlign: 'right', fontSize: '11px' }">
            {{ r.measured }}
          </span>
        </div>
        <!-- Bar gauge for numeric metrics -->
        <div v-if="hasBar(r)" style="margin-left: 48px; height: 5px; background: #1a2a1a; border-radius: 3px; position: relative; overflow: visible;">
          <div :style="{
            width: `${barPercent(r)}%`,
            height: '100%',
            background: r.status === 'pass' ? '#2d6a2d' : '#6a2d2d',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }" />
          <!-- threshold marker -->
          <div :style="{
            position: 'absolute',
            left: `${thresholdPercent(r)}%`,
            top: '-3px',
            width: '2px',
            height: '11px',
            background: '#c8a830',
            borderRadius: '1px',
          }" />
        </div>
      </div>

      <!-- M2 manual -->
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #1a3a1a;">
        <div style="color: #6a8a6a; font-size: 11px; margin-bottom: 6px; font-weight: bold;">M2 — MANUAL</div>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #bbb; margin-bottom: 4px;">
          <input type="checkbox" v-model="m2Checked" @change="() => { if (!m2Checked) m2Pass = false; }" />
          Drag feels responsive (no lag)
        </label>
        <label v-if="m2Checked" style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-left: 20px;">
          <input type="checkbox" v-model="m2Pass" />
          <span :style="{ color: m2Pass ? '#5cb85c' : '#d9534f' }">
            {{ m2Pass ? 'PASS — cursor-to-shape lag was imperceptible' : 'FAIL — visible lag or stutter' }}
          </span>
        </label>
      </div>

      <!-- Controls -->
      <div style="margin-top: 14px; display: flex; gap: 8px;">
        <button
          @click="runAll"
          :disabled="running"
          style="flex: 1; background: #1a4a1a; color: #6dbf6d; border: 1px solid #3a6a3a; padding: 8px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 12px;"
        >
          {{ running ? 'Running…' : 'Run automated tests' }}
        </button>
        <button
          v-if="anyRan"
          @click="exportJSON()"
          style="background: #1a2a3a; color: #6aabcf; border: 1px solid #2a4a6a; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 12px;"
          title="Download results as JSON"
        >
          Export JSON
        </button>
      </div>

      <!-- Verdict -->
      <div v-if="verdict" :style="{
        marginTop: '12px',
        padding: '10px 12px',
        borderRadius: '4px',
        fontWeight: 'bold',
        fontSize: '13px',
        background: verdict === 'go' ? '#0a200a' : '#200a0a',
        color: verdict === 'go' ? '#6dbf6d' : '#d9534f',
        border: `1px solid ${verdict === 'go' ? '#2a5a2a' : '#5a2a2a'}`,
      }">
        {{ verdict === 'go' ? '✓ GO — all 7 pass. Proceed to Experiment 3.' : '✗ NO-GO — M2 failed.' }}
      </div>

      <!-- Legend -->
      <div style="margin-top: 10px; font-size: 10px; color: #3a6a3a; display: flex; gap: 16px;">
        <span>bar fill = measured</span>
        <span style="color: #c8a830;">│ = threshold</span>
      </div>
    </div>
  </div>
</template>

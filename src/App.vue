<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { applyReactInVue } from 'veaury';
import { useDocStore } from '@/stores/docStore';
import { useSelectionStore } from '@/stores/selectionStore';
import TldrawCanvasReact, { type RenderMode } from '@/canvas/TldrawCanvas';
import SelfTestPanel from '@/components/SelfTestPanel.vue';

const APP_START = performance.now();

const docStore = useDocStore();
const selectionStore = useSelectionStore();

const TldrawCanvas = applyReactInVue(TldrawCanvasReact);

const ttiMs = ref<number | null>(null);
const shapeCount = ref(0);
let mutationCount = 0;

const BACKGROUNDS = [
  { id: 'bg1', url: '/backgrounds/bg1.png' },
  { id: 'bg2', url: '/backgrounds/bg2.png' },
  { id: 'bg3', url: '/backgrounds/bg3.png' },
  { id: 'bg4', url: '/backgrounds/bg4.png' },
  { id: 'bg5', url: '/backgrounds/bg5.png' },
  { id: 'bg6', url: '/backgrounds/bg6.png' },
  { id: 'none', url: '' },
];
const activeBg = ref('none');
const bgSize = ref(400);
const renderMode = ref<RenderMode>('svg');

// Live debug stats
const fps = ref(0);
const frameMs = ref(0);
const heapMB = ref<number | null>(null);
const domNodes = ref(0);
const pointerState = ref('idle');

let rafId = 0;
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

function debugLoop(): void {
  const now = performance.now();
  frameMs.value = Math.round(now - lastFrameTime);
  lastFrameTime = now;
  frameCount++;

  if (now - lastFpsUpdate >= 500) {
    fps.value = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = now;
    domNodes.value = document.querySelectorAll('*').length;
    const mem = (performance as any).memory;
    if (mem) heapMB.value = Math.round(mem.usedJSHeapSize / 1024 / 1024 * 10) / 10;
  }

  rafId = requestAnimationFrame(debugLoop);
}

function trackPointer(e: PointerEvent): void {
  if (e.type === 'pointerdown') pointerState.value = e.isPrimary ? 'down' : 'multi';
  else if (e.type === 'pointermove' && e.buttons > 0) pointerState.value = 'drag';
  else if (e.type === 'pointerup') pointerState.value = 'idle';
}

docStore.$subscribe(() => { mutationCount++; });

function handleDragEnd(plantId: string, pos: { x: number; y: number }): void {
  docStore.updatePlantPosition(plantId, pos);
}

function handleSelect(plantId: string): void {
  selectionStore.selectPlant(plantId);
}

function handleUndo(): void {
  docStore.undo();
}

function handleShapeCountChange(count: number): void {
  shapeCount.value = count;
}

onMounted(() => {
  rafId = requestAnimationFrame(debugLoop);
  window.addEventListener('pointerdown', trackPointer);
  window.addEventListener('pointermove', trackPointer);
  window.addEventListener('pointerup', trackPointer);

  if (import.meta.env.DEV) {
    (window as any).__flora__ = {
      getPlantCount: () => docStore.plants.size,
      getShapeCount: () => shapeCount.value,
      getPlantIds: () => [...docStore.plants.keys()],
      getPlantPosition: (id: string) => docStore.plants.get(id)?.position ?? null,
      programmaticDrag: (id: string, dxInches: number, dyInches: number): boolean => {
        const plant = docStore.plants.get(id);
        if (!plant) return false;
        docStore.updatePlantPosition(id, {
          x: plant.position.x + dxInches,
          y: plant.position.y + dyInches,
        });
        return true;
      },
      getMutationCount: () => mutationCount,
      resetMutationCount: () => { mutationCount = 0; },
      undo: () => docStore.undo(),
      // Benchmark helpers
      setPlantCount: (n: number) => docStore.setPlantCount(n),
      setRenderMode: (mode: RenderMode) => { renderMode.value = mode; },
      getRenderMode: () => renderMode.value,
      setBackground: (bgId: string) => { activeBg.value = bgId; },
      setBgSize: (px: number) => { bgSize.value = px; },
      setCamera: (x: number, y: number, z: number) => {
        const editor = (window as any).__flora_editor__;
        if (editor) editor.setCamera({ x, y, z });
      },
      // Drives the canvas for `durationMs` ms with the given movement pattern.
      // Returns a Promise<number[]> of per-frame ms timings.
      runBenchmarkScenario: (config: {
        durationMs: number;
        movementType: 'pan' | 'zoom' | 'still';
        zoomLevel: number;
      }): Promise<number[]> => {
        return new Promise((resolve) => {
          const editor = (window as any).__flora_editor__;
          if (!editor) { resolve([]); return; }

          // World dimensions: 120 × 180 inches × 96 px/inch
          const WORLD_W = 120 * 96;
          const WORLD_H = 180 * 96;

          // Set initial camera for this scenario
          editor.setCamera({ x: -20, y: -20, z: config.zoomLevel });

          const frameTimes: number[] = [];
          const startMs = performance.now();
          let lastFrame = startMs;
          let rafId = 0;

          const panAmpX = WORLD_W * 0.6; // sweep 60% of drawing width
          const panAmpY = WORLD_H * 0.3;
          const panPeriod = 3000; // ms per full oscillation

          function tick() {
            const now = performance.now();
            const elapsed = now - startMs;
            frameTimes.push(now - lastFrame);
            lastFrame = now;

            if (elapsed >= config.durationMs) {
              resolve(frameTimes.slice(1)); // drop first (setup) frame
              return;
            }

            if (config.movementType === 'pan') {
              const t = elapsed / panPeriod;
              const cx = -20 - panAmpX * 0.5 * (1 - Math.cos(2 * Math.PI * t));
              const cy = -20 - panAmpY * 0.5 * (1 - Math.cos(2 * Math.PI * t * 0.7));
              editor.setCamera({ x: cx, y: cy, z: config.zoomLevel }, { immediate: true });
            } else if (config.movementType === 'zoom') {
              const t = elapsed / panPeriod;
              // Oscillate zoom between 0.05 and 2.0
              const z = 0.05 + 1.975 * 0.5 * (1 - Math.cos(2 * Math.PI * t));
              editor.setCamera({ x: -20, y: -20, z }, { immediate: true });
            }
            // 'still' does nothing, just measures idle FPS

            rafId = requestAnimationFrame(tick);
          }

          rafId = requestAnimationFrame(tick);
          // Suppress unused-var warning in closure
          void rafId;
        });
      },
    };
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('pointerdown', trackPointer);
  window.removeEventListener('pointermove', trackPointer);
  window.removeEventListener('pointerup', trackPointer);
});
</script>

<template>
  <div role="main" style="position: relative; width: 100vw; height: 100vh;">
    <TldrawCanvas
      :plants="[...docStore.plants.values()]"
      :beds="[...docStore.beds.values()]"
      :selected-id="selectionStore.selectedPlantId"
      :render-mode="renderMode"
      :callbacks="{
        dragEnd: handleDragEnd,
        selectPlant: handleSelect,
        undoAction: handleUndo,
        ttiReady: (ms: number) => { ttiMs = ms },
        shapeCountChange: handleShapeCountChange,
      }"
    />
    <SelfTestPanel :tti-ms="ttiMs" :get-shape-count="() => shapeCount" />
    <!-- Live debug overlay -->
    <aside
      aria-label="Debug stats"
      style="
        position: absolute; top: 12px; left: 12px;
        background: rgba(0,0,0,0.75); color: #0f0; border: 1px solid #0f04;
        padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 11px;
        pointer-events: none; line-height: 1.7;
      "
    >
      <div><span style="color:#888">FPS</span>      {{ fps }} <span style="color:#555">fps</span></div>
      <div><span style="color:#888">frame</span>    {{ frameMs }} <span style="color:#555">ms</span></div>
      <div v-if="heapMB !== null"><span style="color:#888">heap</span>     {{ heapMB }} <span style="color:#555">MB</span></div>
      <div><span style="color:#888">DOM</span>      {{ domNodes }} <span style="color:#555">nodes</span></div>
      <div><span style="color:#888">pointer</span>  <span :style="{ color: pointerState === 'drag' ? '#ff0' : pointerState === 'down' ? '#fa0' : '#0f0' }">{{ pointerState }}</span></div>
    </aside>
    <!-- Stats HUD -->
    <aside
      role="complementary"
      aria-label="Canvas stats"
      style="
        position: absolute; bottom: 12px; left: 12px;
        background: rgba(0,0,0,0.6); color: #fff;
        padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px;
        pointer-events: none;
      "
    >
      <div data-testid="stat-plants">Plants: {{ docStore.plants.size }}</div>
      <div data-testid="stat-selected">Selected: {{ selectionStore.selectedPlantId ?? 'none' }}</div>
      <div data-testid="stat-undo-stack">Undo stack: {{ docStore.undoStack.length }}/10</div>
      <div style="margin-top: 6px; color: #aaa; font-size: 11px;">tldraw handles zoom/pan natively</div>
    </aside>

    <!-- Background picker -->
    <div style="
      position: absolute; bottom: 12px; right: 12px;
      background: rgba(0,0,0,0.75); border-radius: 6px;
      padding: 8px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
    ">
      <div style="display: flex; gap: 6px; align-items: center;">
        <span style="color:#888; font-family:monospace; font-size:10px;">BG</span>
        <div
          v-for="bg in BACKGROUNDS"
          :key="bg.id"
          @click="activeBg = bg.id"
          :title="bg.id"
          :style="{
            width: '28px', height: '28px', borderRadius: '4px', cursor: 'pointer',
            border: activeBg === bg.id ? '2px solid #fff' : '2px solid transparent',
            backgroundImage: bg.url ? `url(${bg.url})` : 'none',
            backgroundSize: 'cover',
            backgroundColor: bg.url ? undefined : '#111',
            flexShrink: '0',
          }"
        >
          <span v-if="!bg.url" style="display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:14px;">✕</span>
        </div>
      </div>
      <div v-if="activeBg !== 'none'" style="display:flex;gap:6px;align-items:center;">
        <span style="color:#888;font-family:monospace;font-size:10px;">size</span>
        <input type="range" v-model.number="bgSize" min="100" max="1200" step="50"
          style="width:80px;" title="Tile size (smaller = more tiles = slower)" />
        <span style="color:#666;font-family:monospace;font-size:10px;">{{ bgSize }}px</span>
      </div>
    </div>

    <!-- Canvas background layer (behind tldraw) -->
    <div
      v-if="activeBg !== 'none'"
      :style="{
        position: 'absolute', inset: '0', zIndex: -1, pointerEvents: 'none',
        backgroundImage: `url(${BACKGROUNDS.find(b => b.id === activeBg)?.url})`,
        backgroundSize: `${bgSize}px ${bgSize}px`,
        backgroundRepeat: 'repeat',
      }"
    />
  </div>
</template>

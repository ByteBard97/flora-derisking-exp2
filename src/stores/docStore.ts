import { defineStore } from 'pinia';
import { ref } from 'vue';

/** All positions are in drawing-space inches. Never pixels. */
export interface DrawingPoint {
  x: number; // inches from document left
  y: number; // inches from document top
}

export interface BezierAnchor {
  position: DrawingPoint;
  handleIn: DrawingPoint;
  handleOut: DrawingPoint;
}

// Four distinct species to test the common case of shared sprites.
export type SpeciesType = 'oak' | 'magnolia' | 'azalea' | 'fern';

export interface Plant {
  id: string;
  speciesType: SpeciesType;
  position: DrawingPoint;
  rotation: number; // degrees
  radius: number; // inches
  label: string; // ref designator, e.g. "OAK-01"
}

export interface Bed {
  id: string;
  anchors: BezierAnchor[];
  closed: boolean;
  fillColor: string;
}

const SPECIES: SpeciesType[] = ['oak', 'magnolia', 'azalea', 'fern'];
export const LOT_WIDTH_INCHES = 120;
export const LOT_HEIGHT_INCHES = 180;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function procedurePlants(count: number): Map<string, Plant> {
  const plants = new Map<string, Plant>();
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const spacingX = LOT_WIDTH_INCHES / (cols + 1);
  const spacingY = LOT_HEIGHT_INCHES / (rows + 1);
  let i = 0;
  for (let row = 0; row < rows && i < count; row++) {
    for (let col = 0; col < cols && i < count; col++) {
      const id = generateId();
      plants.set(id, {
        id,
        speciesType: SPECIES[i % SPECIES.length],
        position: {
          x: spacingX * (col + 1) + (Math.random() - 0.5) * 2,
          y: spacingY * (row + 1) + (Math.random() - 0.5) * 2,
        },
        rotation: Math.random() * 360,
        radius: 1 + Math.random() * 2, // 1–3 inch radius
        label: `${SPECIES[i % SPECIES.length].slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      });
      i++;
    }
  }
  return plants;
}

function hardcodedBeds(): Map<string, Bed> {
  const beds = new Map<string, Bed>();
  const bedDefs: Omit<Bed, 'id'>[] = [
    {
      closed: true,
      fillColor: '#2d5a1b44',
      anchors: [
        { position: { x: 10, y: 20 }, handleIn: { x: -2, y: 0 }, handleOut: { x: 2, y: 0 } },
        { position: { x: 30, y: 15 }, handleIn: { x: 0, y: -3 }, handleOut: { x: 0, y: 3 } },
        { position: { x: 35, y: 35 }, handleIn: { x: 2, y: 0 }, handleOut: { x: -2, y: 0 } },
        { position: { x: 10, y: 38 }, handleIn: { x: 0, y: 3 }, handleOut: { x: 0, y: -3 } },
      ],
    },
    {
      closed: true,
      fillColor: '#1b3a5a44',
      anchors: [
        { position: { x: 70, y: 10 }, handleIn: { x: -4, y: 0 }, handleOut: { x: 4, y: 0 } },
        { position: { x: 95, y: 25 }, handleIn: { x: 0, y: -4 }, handleOut: { x: 0, y: 4 } },
        { position: { x: 85, y: 50 }, handleIn: { x: 4, y: 0 }, handleOut: { x: -4, y: 0 } },
        { position: { x: 65, y: 30 }, handleIn: { x: 0, y: 4 }, handleOut: { x: 0, y: -4 } },
      ],
    },
    {
      closed: true,
      fillColor: '#5a3a1b44',
      anchors: [
        { position: { x: 20, y: 100 }, handleIn: { x: -3, y: 0 }, handleOut: { x: 3, y: 0 } },
        { position: { x: 45, y: 95 }, handleIn: { x: 0, y: -2 }, handleOut: { x: 0, y: 2 } },
        { position: { x: 50, y: 130 }, handleIn: { x: 3, y: 0 }, handleOut: { x: -3, y: 0 } },
        { position: { x: 15, y: 135 }, handleIn: { x: 0, y: 3 }, handleOut: { x: 0, y: -3 } },
      ],
    },
    {
      closed: true,
      fillColor: '#3a1b5a44',
      anchors: [
        { position: { x: 70, y: 90 }, handleIn: { x: -5, y: 0 }, handleOut: { x: 5, y: 0 } },
        { position: { x: 100, y: 100 }, handleIn: { x: 0, y: -5 }, handleOut: { x: 0, y: 5 } },
        { position: { x: 95, y: 150 }, handleIn: { x: 5, y: 0 }, handleOut: { x: -5, y: 0 } },
        { position: { x: 60, y: 140 }, handleIn: { x: 0, y: 5 }, handleOut: { x: 0, y: -5 } },
      ],
    },
    {
      closed: true,
      fillColor: '#1b5a3a44',
      anchors: [
        { position: { x: 40, y: 55 }, handleIn: { x: -2, y: 0 }, handleOut: { x: 2, y: 0 } },
        { position: { x: 55, y: 50 }, handleIn: { x: 0, y: -2 }, handleOut: { x: 0, y: 2 } },
        { position: { x: 60, y: 70 }, handleIn: { x: 2, y: 0 }, handleOut: { x: -2, y: 0 } },
        { position: { x: 38, y: 72 }, handleIn: { x: 0, y: 2 }, handleOut: { x: 0, y: -2 } },
      ],
    },
  ];

  for (const def of bedDefs) {
    const id = generateId();
    beds.set(id, { id, ...def });
  }
  return beds;
}

export const useDocStore = defineStore('doc', () => {
  const plants = ref<Map<string, Plant>>(procedurePlants(300));
  const beds = ref<Map<string, Bed>>(hardcodedBeds());
  const undoStack = ref<Array<{ id: string; oldPosition: DrawingPoint; newPosition: DrawingPoint }>>([]);

  function updatePlantPosition(id: string, newPosition: DrawingPoint): void {
    const plant = plants.value.get(id);
    if (!plant) return;
    const oldPosition = { ...plant.position };
    plant.position = newPosition;
    undoStack.value.push({ id, oldPosition, newPosition });
    if (undoStack.value.length > 10) {
      undoStack.value.shift();
    }
  }

  function undo(): void {
    const entry = undoStack.value.pop();
    if (!entry) return;
    const plant = plants.value.get(entry.id);
    if (!plant) return;
    plant.position = entry.oldPosition;
  }

  function setPlantCount(n: number): void {
    plants.value = procedurePlants(n);
    undoStack.value = [];
  }

  return { plants, beds, undoStack, updatePlantPosition, undo, setPlantCount };
});

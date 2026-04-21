# Experiment 2: Bed Drawing Tool

**Status:** Not started — blocked on Experiment 1 pass
**Goal:** Prove freehand → bezier, Turf.js worker, anchor-drag in Pinia architecture

## Prerequisite

Experiment 1 must pass its go/no-go gate before starting here.

## What to build

See `docs/FLORA_DERISKING_EXPERIMENTS_v2.md` Experiment 2 section.

Key additions to the Experiment 1 app:
- `BedPenTool` (Konva-native tool class)
- `geometry.worker.ts` (Turf.js + @odiak/fit-curve)
- Live area HUD on bed selection
- Anchor-drag proving editing works through the architecture

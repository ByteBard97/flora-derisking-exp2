import { useEffect, useRef } from 'react'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import type { Bed, BezierAnchor, DrawingPoint, Plant } from '@/stores/docStore'
import { LOT_HEIGHT_INCHES, LOT_WIDTH_INCHES } from '@/stores/docStore'
import { PX_PER_INCH } from '../shapes/types'

// ---------- Bezier path helpers ----------

function pxCoord(pt: DrawingPoint): string {
  return `${pt.x * PX_PER_INCH},${pt.y * PX_PER_INCH}`
}

function offsetCoord(anchor: DrawingPoint, offset: DrawingPoint): string {
  return pxCoord({ x: anchor.x + offset.x, y: anchor.y + offset.y })
}

function anchorsToPath(anchors: BezierAnchor[], closed: boolean): string {
  if (anchors.length < 2) return ''

  const first = anchors[0]
  let d = `M ${pxCoord(first.position)}`

  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1]
    const curr = anchors[i]
    d += ` C ${offsetCoord(prev.position, prev.handleOut)} ${offsetCoord(curr.position, curr.handleIn)} ${pxCoord(curr.position)}`
  }

  if (closed) {
    const last = anchors[anchors.length - 1]
    d += ` C ${offsetCoord(last.position, last.handleOut)} ${offsetCoord(first.position, first.handleIn)} ${pxCoord(first.position)} Z`
  }

  return d
}

// ---------- Return type ----------

export interface DocBridgeMaps {
  /** plantId → tldraw shape id */
  plantIdToShapeId: Map<string, TLShapeId>
  /** tldraw shape id → plantId */
  shapeIdToPlantId: Map<TLShapeId, string>
}

// ---------- Hook ----------

/**
 * Syncs Pinia docStore state into the tldraw editor.
 *
 * Must be called at React component top level with a stable, non-null editor.
 * On mount: bulk-creates background, bed, and plant shapes.
 * On plants change: updates only shapes whose positions changed.
 * On unmount: deletes all created shapes.
 *
 * Returns stable map refs — do not destructure, reference via .current.
 */
export function useDocBridge(
  editor: Editor,
  plants: Plant[],
  beds: Bed[],
): DocBridgeMaps {
  const backgroundIdRef = useRef<TLShapeId | null>(null)
  const bedShapeIdsRef = useRef<TLShapeId[]>([])
  const plantIdToShapeId = useRef<Map<string, TLShapeId>>(new Map())
  const shapeIdToPlantId = useRef<Map<TLShapeId, string>>(new Map())
  const prevPositions = useRef<Map<string, DrawingPoint>>(new Map())

  // Stable return object — consumers hold a ref to these maps
  const mapsRef = useRef<DocBridgeMaps>({
    plantIdToShapeId: plantIdToShapeId.current,
    shapeIdToPlantId: shapeIdToPlantId.current,
  })

  // Mount: create all shapes in bulk, register ID mappings
  useEffect(() => {
    const bgId = createShapeId()
    backgroundIdRef.current = bgId

    const backgroundShape = {
      id: bgId,
      type: 'background' as const,
      x: 0,
      y: 0,
      rotation: 0,
      props: {
        width: LOT_WIDTH_INCHES * PX_PER_INCH,
        height: LOT_HEIGHT_INCHES * PX_PER_INCH,
      },
    }

    const bedShapes = beds.map((bed) => {
      const id = createShapeId()
      bedShapeIdsRef.current.push(id)
      return {
        id,
        type: 'bed' as const,
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          bedId: bed.id,
          pathData: anchorsToPath(bed.anchors, bed.closed),
          fillColor: bed.fillColor,
        },
      }
    })

    const plantShapes = plants.map((plant) => {
      const shapeId = createShapeId()
      plantIdToShapeId.current.set(plant.id, shapeId)
      shapeIdToPlantId.current.set(shapeId, plant.id)
      prevPositions.current.set(plant.id, { ...plant.position })

      const radiusPx = plant.radius * PX_PER_INCH
      return {
        id: shapeId,
        type: 'plant' as const,
        x: plant.position.x * PX_PER_INCH - radiusPx,
        y: plant.position.y * PX_PER_INCH - radiusPx,
        rotation: 0,
        props: {
          plantId: plant.id,
          speciesType: plant.speciesType,
          radiusPx,
          label: plant.label,
        },
      }
    })

    editor.createShapes([backgroundShape, ...bedShapes, ...plantShapes])

    return () => {
      const allIds: TLShapeId[] = []
      if (backgroundIdRef.current) allIds.push(backgroundIdRef.current)
      allIds.push(...bedShapeIdsRef.current)
      allIds.push(...plantIdToShapeId.current.values())
      if (allIds.length > 0) {
        editor.deleteShapes(allIds)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally runs once on mount; editor/plants/beds are stable at mount time

  // Propagate position changes (undo, external drag-harvest writes)
  useEffect(() => {
    const updates: Array<{ id: TLShapeId; type: 'plant'; x: number; y: number }> = []

    for (const plant of plants) {
      const prev = prevPositions.current.get(plant.id)
      if (prev && (prev.x !== plant.position.x || prev.y !== plant.position.y)) {
        const shapeId = plantIdToShapeId.current.get(plant.id)
        if (shapeId) {
          const radiusPx = plant.radius * PX_PER_INCH
          updates.push({
            id: shapeId,
            type: 'plant',
            x: plant.position.x * PX_PER_INCH - radiusPx,
            y: plant.position.y * PX_PER_INCH - radiusPx,
          })
        }
        prevPositions.current.set(plant.id, { ...plant.position })
      }
    }

    if (updates.length > 0) {
      editor.updateShapes(updates)
    }
  }, [editor, plants])

  return mapsRef.current
}

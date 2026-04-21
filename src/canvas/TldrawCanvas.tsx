import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Editor,
  Tldraw,
  type TLShapeId,
  type TLUiOverrides,
  type TLAnyShapeUtilConstructor,
} from 'tldraw'
import type { Plant, Bed } from '@/stores/docStore'
import { useDocBridge } from './bridge/docBridge'
import { PlantShapeUtil } from './shapes/PlantShapeUtil'
import { PlantShapeUtilPng } from './shapes/PlantShapeUtilPng'
import { PlantShapeUtilUse } from './shapes/PlantShapeUtilUse'
import { BedShapeUtil } from './shapes/BedShapeUtil'
import { BackgroundShapeUtil } from './shapes/BackgroundShapeUtil'
import { SpriteDefs } from './SpriteDefs'
import 'tldraw/tldraw.css'

export type RenderMode = 'svg' | 'png' | 'use'

// ---------- Props ----------

export interface TldrawCallbacks {
  dragEnd: (plantId: string, pos: { x: number; y: number }) => void
  selectPlant: (plantId: string) => void
  undoAction: () => void
  ttiReady: (ms: number) => void
  shapeCountChange?: (count: number) => void
}

// NOTE: veaury converts all function props (including non-on* ones) into Vue events.
// Workaround: bundle callbacks into a single plain-object prop so veaury passes it as data.
export interface TldrawCanvasProps {
  plants: Plant[]
  beds: Bed[]
  selectedId: string | null
  callbacks: TldrawCallbacks
  renderMode?: RenderMode
}

// ---------- Inner component (rendered inside Tldraw context, has editor access) ----------

interface InnerProps extends TldrawCanvasProps {
  editor: Editor
}

function TldrawCanvasInner({
  editor,
  plants,
  beds,
  selectedId,
  callbacks,
}: InnerProps) {
  const { dragEnd, selectPlant, undoAction, ttiReady, shapeCountChange } = callbacks
  const startTimeRef = useRef(performance.now())
  const ttiCalledRef = useRef(false)

  // Initialize shapes — hook called at component top level with non-null editor.
  const maps = useDocBridge(editor, plants, beds)

  // Report TTI and shape count after shapes are created and a render frame has completed.
  useEffect(() => {
    if (ttiCalledRef.current) return
    ttiCalledRef.current = true
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ttiReady(performance.now() - startTimeRef.current)
        shapeCountChange?.(editor.getCurrentPageShapes().length)
      })
    })
  }, [ttiReady, shapeCountChange, editor])

  // Drag harvest: listen for plant shape updates from user interaction.
  useEffect(() => {
    const unsub = editor.store.listen(
      (entry) => {
        if (entry.source !== 'user') return

        for (const record of Object.values(entry.changes.updated)) {
          const [, next] = record as [unknown, { id: TLShapeId; type: string; x: number; y: number; props?: { plantId?: string; radiusPx?: number } }]
          if (next.type !== 'plant') continue

          // Only harvest on pointer-up, not during live drag frames.
          if (editor.inputs.isDragging) continue

          const plantId = maps.shapeIdToPlantId.get(next.id)
          if (!plantId) continue

          const radiusPx = next.props?.radiusPx ?? 0
          const PX_PER_INCH = 96
          dragEnd(plantId, {
            x: (next.x + radiusPx) / PX_PER_INCH,
            y: (next.y + radiusPx) / PX_PER_INCH,
          })
        }
      },
      { scope: 'document', source: 'user' },
    )
    return unsub
  }, [editor, maps, dragEnd])

  // Selection sync: watch instance_page_state for selected shape changes.
  useEffect(() => {
    const unsub = editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.updated)) {
          const [, next] = record as [unknown, { typeName?: string; selectedShapeIds?: TLShapeId[] }]
          if (next.typeName !== 'instance_page_state') continue
          if (!next.selectedShapeIds || next.selectedShapeIds.length === 0) continue

          const firstId = next.selectedShapeIds[0]
          const plantId = maps.shapeIdToPlantId.get(firstId)
          if (plantId) {
            selectPlant(plantId)
          }
          break
        }
      },
      { scope: 'session' },
    )
    return unsub
  }, [editor, maps, selectPlant])

  // Mirror external selectedId → tldraw selection (e.g. from sidebar click).
  useEffect(() => {
    if (!selectedId) {
      editor.selectNone()
      return
    }
    const shapeId = maps.plantIdToShapeId.get(selectedId)
    if (shapeId) {
      editor.select(shapeId)
    }
  }, [editor, maps, selectedId])

  // Intercept Cmd/Ctrl+Z to route undo through docStore instead of tldraw's history.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        undoAction()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [undoAction])

  return null
}

// ---------- Outer component (mounts Tldraw, then inner bridge) ----------

export default function TldrawCanvas(props: TldrawCanvasProps) {
  const { renderMode = 'svg' } = props
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(false)

  const shapeUtils = useMemo<TLAnyShapeUtilConstructor[]>(() => {
    const plantUtil =
      renderMode === 'png' ? PlantShapeUtilPng :
      renderMode === 'use' ? PlantShapeUtilUse :
      PlantShapeUtil
    return [plantUtil, BedShapeUtil, BackgroundShapeUtil]
  }, [renderMode])

  // Build overrides at component scope so OVERRIDES is stable.
  const overridesRef = useRef<TLUiOverrides>({
    actions(_editor, actions) {
      // Replace tldraw's built-in undo with a no-op so our keydown handler
      // has sole ownership. Prevents double-undo.
      if (actions['undo']) {
        actions['undo'] = {
          ...actions['undo'],
          kbd: undefined,
        }
      }
      return actions
    },
  })

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      editor.setCamera({ x: -20, y: -20, z: 0.3 })
      if (import.meta.env.DEV) {
        (window as any).__flora_editor__ = editor
      }
      setEditorReady(true)
    },
    [],
  )

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{`.tl-background { background: transparent !important; }`}</style>
      {renderMode === 'use' && <SpriteDefs imageExt="svg" />}
      <Tldraw
        shapeUtils={shapeUtils}
        overrides={overridesRef.current}
        onMount={handleMount}
        hideUi={true}
      />
      {editorReady && editorRef.current && (
        <TldrawCanvasInner editor={editorRef.current} {...props} />
      )}
    </div>
  )
}

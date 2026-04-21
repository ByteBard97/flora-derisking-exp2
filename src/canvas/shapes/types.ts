import type { TLBaseShape } from 'tldraw'

// Module augmentation so tldraw's type system knows about our custom shapes.
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    plant: PlantShapeProps
    bed: BedShapeProps
    background: BackgroundShapeProps
  }
}

export const PX_PER_INCH = 96

export type SpeciesType = 'oak' | 'magnolia' | 'azalea' | 'fern'

export const SPECIES_COLORS: Record<SpeciesType, string> = {
  oak: '#5c8a3c',
  magnolia: '#a0522d',
  azalea: '#d4508a',
  fern: '#2e7d32',
}

// ---------- PlantShape ----------

export interface PlantShapeProps {
  plantId: string
  speciesType: SpeciesType
  radiusPx: number
  label: string
}

export type PlantShape = TLBaseShape<'plant', PlantShapeProps>

// ---------- BedShape ----------

export interface BedShapeProps {
  bedId: string
  /** Pre-computed SVG path string in tldraw pixel space (absolute coordinates, x=0 y=0 on shape). */
  pathData: string
  fillColor: string
}

export type BedShape = TLBaseShape<'bed', BedShapeProps>

// ---------- BackgroundShape ----------

export interface BackgroundShapeProps {
  width: number
  height: number
}

export type BackgroundShape = TLBaseShape<'background', BackgroundShapeProps>

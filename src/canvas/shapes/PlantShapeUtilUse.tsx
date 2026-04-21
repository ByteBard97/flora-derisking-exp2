import React from 'react'
import { Circle2d, RecordProps, ShapeUtil, SVGContainer, T } from 'tldraw'
import { type PlantShape, type SpeciesType } from './types'

/**
 * <use> instancing variant: each plant renders 2 DOM elements instead of 3.
 * - <use href="#sprite-{species}"> references a shared <symbol> in SpriteDefs
 *   (symbol contains circle + image, defined once for all 300 plants)
 * - <text> for the label (must stay per-plant)
 *
 * Requires SpriteDefs to be mounted at app level before any shapes render.
 */
export class PlantShapeUtilUse extends ShapeUtil<PlantShape> {
  static override type = 'plant' as const

  static override props: RecordProps<PlantShape> = {
    plantId: T.string,
    speciesType: T.string as T.Validator<SpeciesType>,
    radiusPx: T.number,
    label: T.string,
  }

  getDefaultProps(): PlantShape['props'] {
    return { plantId: '', speciesType: 'oak', radiusPx: 48, label: '' }
  }

  getGeometry(shape: PlantShape) {
    return new Circle2d({ radius: shape.props.radiusPx, isFilled: true })
  }

  component(shape: PlantShape) {
    const r = shape.props.radiusPx
    const fontSize = Math.max(8, r * 0.5)

    return (
      <SVGContainer>
        {/* Single <use> replaces <circle> + <image> — 2 elements per plant vs 3 */}
        <use
          href={`#sprite-${shape.props.speciesType}`}
          x={0}
          y={0}
          width={r * 2}
          height={r * 2}
        />
        <text
          x={r} y={r}
          fill="#000" stroke="#fff" strokeWidth={3}
          paintOrder="stroke" textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {shape.props.label}
        </text>
      </SVGContainer>
    )
  }

  indicator(shape: PlantShape) {
    const r = shape.props.radiusPx
    return <circle cx={r} cy={r} r={r} />
  }
}

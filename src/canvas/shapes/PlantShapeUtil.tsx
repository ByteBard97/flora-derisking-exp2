import React from 'react'
import { Circle2d, RecordProps, ShapeUtil, SVGContainer, T } from 'tldraw'
import { SPECIES_COLORS, type PlantShape, type SpeciesType } from './types'

export class PlantShapeUtil extends ShapeUtil<PlantShape> {
  static override type = 'plant' as const

  static override props: RecordProps<PlantShape> = {
    plantId: T.string,
    speciesType: T.string as T.Validator<SpeciesType>,
    radiusPx: T.number,
    label: T.string,
  }

  getDefaultProps(): PlantShape['props'] {
    return {
      plantId: '',
      speciesType: 'oak',
      radiusPx: 48,
      label: '',
    }
  }

  getGeometry(shape: PlantShape) {
    return new Circle2d({ radius: shape.props.radiusPx, isFilled: true })
  }

  component(shape: PlantShape) {
    const r = shape.props.radiusPx
    const color = SPECIES_COLORS[shape.props.speciesType] ?? '#888'
    const fontSize = Math.max(8, r * 0.5)

    return (
      <SVGContainer>
        <circle cx={r} cy={r} r={r} fill={color} opacity={0.7} />
        <image
          href={`/sprites/${shape.props.speciesType}.svg`}
          x={0}
          y={0}
          width={r * 2}
          height={r * 2}
        />
        <text
          x={r}
          y={r}
          fill="#000"
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
          textAnchor="middle"
          dominantBaseline="middle"
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

import React from 'react'
import { RecordProps, Rectangle2d, ShapeUtil, SVGContainer, T } from 'tldraw'
import type { TLShapeUtilCanBindOpts } from '@tldraw/editor'
import type { BedShape } from './types'

export class BedShapeUtil extends ShapeUtil<BedShape> {
  static override type = 'bed' as const

  static override props: RecordProps<BedShape> = {
    bedId: T.string,
    pathData: T.string,
    fillColor: T.string,
  }

  getDefaultProps(): BedShape['props'] {
    return {
      bedId: '',
      pathData: '',
      fillColor: '#2d5a1b44',
    }
  }

  getGeometry(_shape: BedShape) {
    // Large fixed bounds — the actual visual shape comes from the SVG path.
    return new Rectangle2d({ width: 2000, height: 2000, isFilled: true })
  }

  component(shape: BedShape) {
    return (
      <SVGContainer>
        <path
          d={shape.props.pathData}
          fill={shape.props.fillColor}
          stroke="#ffffff44"
          strokeWidth={1}
        />
      </SVGContainer>
    )
  }

  indicator(_shape: BedShape) {
    return <></>
  }

  override canBind(_opts: TLShapeUtilCanBindOpts) {
    return false
  }

  override canResize(_shape: BedShape) {
    return false
  }

  override hideSelectionBoundsFg(_shape: BedShape) {
    return true
  }

  override hideSelectionBoundsBg(_shape: BedShape) {
    return true
  }
}

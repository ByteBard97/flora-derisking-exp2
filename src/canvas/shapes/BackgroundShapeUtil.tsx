import React from 'react'
import { RecordProps, Rectangle2d, ShapeUtil, SVGContainer, T } from 'tldraw'
import type { TLShapeUtilCanBindOpts } from '@tldraw/editor'
import type { BackgroundShape } from './types'

export class BackgroundShapeUtil extends ShapeUtil<BackgroundShape> {
  static override type = 'background' as const

  static override props: RecordProps<BackgroundShape> = {
    width: T.number,
    height: T.number,
  }

  getDefaultProps(): BackgroundShape['props'] {
    return {
      width: 11520, // 120 inches * 96 px/inch
      height: 17280, // 180 inches * 96 px/inch
    }
  }

  getGeometry(shape: BackgroundShape) {
    return new Rectangle2d({
      width: shape.props.width,
      height: shape.props.height,
      isFilled: true,
    })
  }

  component(shape: BackgroundShape) {
    return (
      <SVGContainer>
        <image
          href="/site-plan.svg"
          x={0}
          y={0}
          width={shape.props.width}
          height={shape.props.height}
        />
      </SVGContainer>
    )
  }

  indicator(_shape: BackgroundShape) {
    return <></>
  }

  override canBind(_opts: TLShapeUtilCanBindOpts) {
    return false
  }

  override canResize(_shape: BackgroundShape) {
    return false
  }

  override hideSelectionBoundsFg(_shape: BackgroundShape) {
    return true
  }

  override hideSelectionBoundsBg(_shape: BackgroundShape) {
    return true
  }
}

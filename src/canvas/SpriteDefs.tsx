import React, { useEffect, useRef } from 'react'
import { SPECIES_COLORS } from './shapes/types'

/**
 * Injects a hidden SVG <defs> block into document.body with one <symbol> per species.
 * Each symbol is a unit square (viewBox="0 0 1 1") containing a colored circle
 * and the species PNG/SVG image, so <use> elements can resize them freely.
 *
 * Mounted once at app level so all 300 plants share 4 symbol definitions.
 */
export function SpriteDefs({ imageExt = 'svg' }: { imageExt?: 'svg' | 'png' }) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('style', 'display:none;position:absolute')
    svg.setAttribute('aria-hidden', 'true')

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

    for (const [sp, color] of Object.entries(SPECIES_COLORS)) {
      const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol')
      symbol.setAttribute('id', `sprite-${sp}`)
      symbol.setAttribute('viewBox', '0 0 1 1')

      // Colored background circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', '0.5')
      circle.setAttribute('cy', '0.5')
      circle.setAttribute('r', '0.5')
      circle.setAttribute('fill', color)
      circle.setAttribute('opacity', '0.7')

      // Species image (SVG or PNG)
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image')
      img.setAttribute('href', `/sprites/${sp}.${imageExt}`)
      img.setAttribute('x', '0')
      img.setAttribute('y', '0')
      img.setAttribute('width', '1')
      img.setAttribute('height', '1')

      symbol.appendChild(circle)
      symbol.appendChild(img)
      defs.appendChild(symbol)
    }

    svg.appendChild(defs)
    document.body.appendChild(svg)
    svgRef.current = svg

    return () => { svg.remove() }
  }, [imageExt])

  return null
}

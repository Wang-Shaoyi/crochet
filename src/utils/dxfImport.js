import DxfParser from 'dxf-parser'

// dxf-parser reports ARC start/end angles in radians already.
function arcPoints(cx, cy, r, startAngleRad, endAngleRad, segments = 32) {
  let start = startAngleRad
  let end = endAngleRad
  if (end <= start) end += Math.PI * 2

  const pts = []
  for (let i = 0; i <= segments; i++) {
    const t = start + ((end - start) * i) / segments
    pts.push(cx + r * Math.cos(t), cy + r * Math.sin(t))
  }
  return pts
}

function circlePoints(cx, cy, r, segments = 48) {
  return arcPoints(cx, cy, r, 0, Math.PI * 2, segments)
}

function entityToPointSets(entity) {
  switch (entity.type) {
    case 'LINE': {
      const verts = entity.vertices || []
      if (verts.length < 2) return []
      return [{ points: verts.flatMap((v) => [v.x, v.y]), closed: false }]
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = entity.vertices || []
      if (verts.length < 2) return []
      return [{ points: verts.flatMap((v) => [v.x, v.y]), closed: !!entity.shape }]
    }
    case 'CIRCLE': {
      const { center, radius } = entity
      if (!center || !radius) return []
      return [{ points: circlePoints(center.x, center.y, radius), closed: true }]
    }
    case 'ARC': {
      const { center, radius, startAngle, endAngle } = entity
      if (!center || !radius) return []
      return [{ points: arcPoints(center.x, center.y, radius, startAngle, endAngle), closed: false }]
    }
    default:
      return []
  }
}

function normalize(pointSets, targetSize) {
  if (pointSets.length === 0) return []

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { points } of pointSets) {
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i]
      const y = points[i + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const width = maxX - minX || 1
  const height = maxY - minY || 1
  const scale = targetSize / Math.max(width, height)
  const offsetX = (targetSize - width * scale) / 2
  const offsetY = (targetSize - height * scale) / 2

  return pointSets.map(({ points, closed }) => {
    const transformed = []
    for (let i = 0; i < points.length; i += 2) {
      const x = (points[i] - minX) * scale + offsetX
      // DXF is Y-up, canvas is Y-down
      const y = targetSize - ((points[i + 1] - minY) * scale + offsetY)
      transformed.push(x, y)
    }
    return { points: transformed, closed }
  })
}

/**
 * Parses raw DXF text and returns normalized point sets scaled to fit
 * within a `targetSize` x `targetSize` box, ready to render as canvas shapes.
 */
export function parseDxf(text, targetSize = 700) {
  const parser = new DxfParser()
  const dxf = parser.parseSync(text)
  const entities = dxf?.entities || []
  const raw = entities.flatMap(entityToPointSets)
  return normalize(raw, targetSize)
}

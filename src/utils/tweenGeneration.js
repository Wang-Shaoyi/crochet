import { createId } from './id.js'

const OUTLINE = '#111111'
const CONTROL = '#2f6fed'
const SKELETON = '#199473'
const HOLE = '#d94a3a'
const TWEEN = '#b8b8b3'

function nodesFrom(points) {
  const nodes = []
  for (let i = 0; i < points.length; i += 2) nodes.push({ x: points[i], y: points[i + 1] })
  return nodes
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  const t = length2 ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / length2)) : 0
  return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy))
}

function segmentsFrom(nodes, closed = false) {
  const segments = []
  for (let i = 0; i < nodes.length - 1; i++) segments.push([nodes[i], nodes[i+1]])
  if (closed && nodes.length > 2) segments.push([nodes[nodes.length-1], nodes[0]])
  return segments
}

function distanceToSegments(point, segments) {
  let best = Infinity
  for (const [a, b] of segments) best = Math.min(best, distanceToSegment(point, a, b))
  return best
}

function sampleSegments(segments, spacing) {
  const points = []
  for (const [a,b] of segments) {
    const length = Math.hypot(b.x-a.x,b.y-a.y)
    const steps = Math.max(1, Math.ceil(length/spacing))
    for (let i=0; i<steps; i++) {
      const t = i/steps
      points.push({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t})
    }
  }
  return points
}

function interpolate(a, b, va, vb, level) {
  const t = Math.abs(vb-va) < 1e-9 ? 0.5 : (level-va)/(vb-va)
  return { x:a.x + (b.x-a.x)*t, y:a.y + (b.y-a.y)*t }
}

function contourSegments(grid, cols, rows, level) {
  const output = []
  for (let y = 0; y < rows-1; y++) for (let x = 0; x < cols-1; x++) {
    const c = [grid[y][x], grid[y][x+1], grid[y+1][x+1], grid[y+1][x]]
    if (c.some((v) => v.value == null)) continue
    const edges = []
    const pairs = [[0,1],[1,2],[2,3],[3,0]]
    for (let edge = 0; edge < 4; edge++) {
      const [a,b] = pairs[edge]
      if ((c[a].value < level) !== (c[b].value < level))
        edges.push(interpolate(c[a], c[b], c[a].value, c[b].value, level))
    }
    if (edges.length === 2) output.push(edges)
    else if (edges.length === 4) {
      const center = c.reduce((sum, v) => sum + v.value, 0) / 4
      if (center < level) output.push([edges[0],edges[3]], [edges[1],edges[2]])
      else output.push([edges[0],edges[1]], [edges[2],edges[3]])
    }
  }
  return output
}

function stitch(segments, tolerance) {
  const lines = []
  const remaining = segments.slice()
  const close = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) <= tolerance
  while (remaining.length) {
    const line = remaining.pop().slice()
    let changed = true
    while (changed) {
      changed = false
      for (let i = remaining.length-1; i >= 0; i--) {
        const segment = remaining[i], first = line[0], last = line[line.length-1]
        if (close(last, segment[0])) line.push(segment[1])
        else if (close(last, segment[1])) line.push(segment[0])
        else if (close(first, segment[1])) line.unshift(segment[0])
        else if (close(first, segment[0])) line.unshift(segment[1])
        else continue
        remaining.splice(i,1); changed = true
      }
    }
    if (line.length >= 4) lines.push(line)
  }
  return lines
}

function makeTween(nodes, closed = false) {
  return {
    id:createId('tween'), source:'generated', role:'tween', color:TWEEN, closed,
    points:nodes.flatMap((p) => [p.x,p.y]), segmentKinds:Array(Math.max(0,nodes.length-1)).fill('polyline'),
  }
}

function nearestVertexIndex(point, polygon) {
  let best=0, distance=Infinity
  polygon.forEach((vertex,index)=>{
    const next=Math.hypot(point.x-vertex.x,point.y-vertex.y)
    if (next<distance) { distance=next; best=index }
  })
  return best
}

function polygonArc(polygon, start, end, direction) {
  const arc=[]
  let index=start
  while (index!==end && arc.length<=polygon.length) {
    arc.push(polygon[index])
    index=(index+direction+polygon.length)%polygon.length
  }
  arc.push(polygon[end])
  return arc
}

function arcLength(nodes) {
  let length=0
  for (let i=1;i<nodes.length;i++) length+=Math.hypot(nodes[i].x-nodes[i-1].x,nodes[i].y-nodes[i-1].y)
  return length
}

function shapeLength(shape) {
  const nodes=nodesFrom(shape.points)
  return arcLength(shape.closed?[...nodes,nodes[0]]:nodes)
}

function routeNodesAroundPolygon(nodes, polygon) {
  const result=[]
  let index=0
  while (index<nodes.length) {
    if (!pointInPolygon(nodes[index],polygon)) { result.push(nodes[index]); index++; continue }
    const entry=result.at(-1)
    while (index<nodes.length && pointInPolygon(nodes[index],polygon)) index++
    const exit=nodes[index]
    if (!entry || !exit) continue
    const start=nearestVertexIndex(entry,polygon), end=nearestVertexIndex(exit,polygon)
    const forward=polygonArc(polygon,start,end,1), backward=polygonArc(polygon,start,end,-1)
    result.push(...(arcLength(forward)<=arcLength(backward)?forward:backward),exit)
    index++
  }
  return result
}

function routeAroundHoles(shape, holes) {
  let nodes=nodesFrom(shape.points)
  for (const hole of holes) nodes=routeNodesAroundPolygon(nodes,nodesFrom(hole.points))
  return {...shape,points:nodes.flatMap((p)=>[p.x,p.y]),segmentKinds:Array(Math.max(0,nodes.length-1)).fill('polyline')}
}

function resample(nodes, count) {
  if (nodes.length < 2) return nodes
  const lengths = [0]
  for (let i=1; i<nodes.length; i++) lengths.push(lengths[i-1] + Math.hypot(nodes[i].x-nodes[i-1].x,nodes[i].y-nodes[i-1].y))
  const total = lengths.at(-1)
  return Array.from({length:count}, (_,index) => {
    const target = total * index/(count-1)
    let segment = 1
    while (segment < lengths.length-1 && lengths[segment] < target) segment++
    const span = lengths[segment]-lengths[segment-1]
    const t = span ? (target-lengths[segment-1])/span : 0
    const a=nodes[segment-1], b=nodes[segment]
    return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}
  })
}

function alignedPair(aNodes, bNodes, resolution) {
  const count = Math.max(24, Math.min(500, Math.max(aNodes.length,bNodes.length) * (8 + resolution*4)))
  const a = resample(aNodes,count), forward = resample(bNodes,count), reverse = forward.slice().reverse()
  const score = (b) => a.reduce((sum,p,i) => sum + Math.hypot(p.x-b[i].x,p.y-b[i].y),0)
  return [a, score(reverse) < score(forward) ? reverse : forward]
}

function generateOpenBands(outline, skeleton, controls, distance, resolution) {
  const skeletonSegments = segmentsFrom(nodesFrom(skeleton.points), false)
  const orderedControls = controls.slice().sort((a,b) => {
    const average = (shape) => {
      const samples = sampleSegments(segmentsFrom(nodesFrom(shape.points),false),Math.max(3,distance/2))
      return samples.reduce((sum,p) => sum+distanceToSegments(p,skeletonSegments),0)/Math.max(1,samples.length)
    }
    return average(a)-average(b)
  })
  const guides = [skeleton,...orderedControls,outline]
  const result = []
  for (let band=0; band<guides.length-1; band++) {
    const [a,b] = alignedPair(nodesFrom(guides[band].points),nodesFrom(guides[band+1].points),resolution)
    if (a.length < 2 || b.length < 2) continue
    const average = a.reduce((sum,p,i) => sum+Math.hypot(p.x-b[i].x,p.y-b[i].y),0)/a.length
    const count = Math.max(0,Math.min(36,Math.round(average/distance)-1))
    for (let layer=1; layer<=count; layer++) {
      const t=layer/(count+1)
      result.push(makeTween(a.map((p,i) => ({x:p.x+(b[i].x-p.x)*t,y:p.y+(b[i].y-p.y)*t})),false))
    }
  }
  return result
}

export function generateTweens(shapes, targetDistance, targetResolution = 2) {
  const outlines = shapes.filter((s) => s.source !== 'generated' && s.color === OUTLINE)
  const skeletons = shapes.filter((s) => s.source !== 'generated' && s.color === SKELETON)
  const holes = shapes.filter((s) => s.source !== 'generated' && s.color === HOLE)
  const closedHoles = holes.filter((s)=>s.closed)
  const controls = shapes.filter((s) => s.source !== 'generated' && s.color === CONTROL)
    .concat(holes.filter((s)=>!s.closed))
  const holeReplacesSkeleton = !skeletons.length && closedHoles.length > 0
  const innerGuides = holeReplacesSkeleton ? closedHoles : skeletons
  if (!outlines.length) throw new Error('Draw at least one Outline before generating.')
  if (!innerGuides.length) throw new Error('Draw a Skeleton or a closed Hole before generating.')
  const distance = Math.max(1, Number(targetDistance) || 20)
  const resolution = Math.max(1, Math.min(5, Math.round(Number(targetResolution) || 2)))
  const generated = []
  const outlineSegmentsById = new Map(outlines.map((shape)=>[
    shape.id,
    segmentsFrom(nodesFrom(shape.points),shape.closed),
  ]))
  const assignedOutlineByGuide = new Map(controls.map((guide)=>{
    const guideSegments=segmentsFrom(nodesFrom(guide.points),guide.closed)
    const samples=sampleSegments(guideSegments,Math.max(3,distance/2))
    const nearest=outlines.slice().sort((a,b)=>{
      const average=(outline)=>samples.reduce((sum,p)=>sum+distanceToSegments(p,outlineSegmentsById.get(outline.id)),0)/Math.max(1,samples.length)
      return average(a)-average(b)
    })[0]
    return [guide.id,nearest?.id]
  }))

  for (const outline of outlines.filter((shape) => !shape.closed)) {
    const outlineSegments = segmentsFrom(nodesFrom(outline.points),false)
    const nearestSkeleton = innerGuides.slice().sort((a,b) => {
      const distanceToOutline = (shape) => {
        const samples=sampleSegments(segmentsFrom(nodesFrom(shape.points),false),Math.max(3,distance/2))
        return samples.reduce((sum,p)=>sum+distanceToSegments(p,outlineSegments),0)/Math.max(1,samples.length)
      }
      return distanceToOutline(a)-distanceToOutline(b)
    })[0]
    const localControls=controls.filter((guide)=>!guide.closed && assignedOutlineByGuide.get(guide.id)===outline.id)
    const shortControls=localControls.filter((guide)=>shapeLength(guide)<shapeLength(outline)*0.28)
    const fullControls=localControls.filter((guide)=>!shortControls.includes(guide))
    generated.push(...generateOpenBands(outline,nearestSkeleton,fullControls,distance,resolution))
  }

  for (const outline of outlines.filter((shape) => shape.closed)) {
    const polygon = nodesFrom(outline.points)
    const localSkeletons = innerGuides.filter((s) => nodesFrom(s.points).some((p) => pointInPolygon(p, polygon)))
    if (!localSkeletons.length) continue
    const outlineSegments = segmentsFrom(polygon, true)
    const skeletonSegments = localSkeletons.flatMap((s) => segmentsFrom(nodesFrom(s.points), s.closed))
    if (!skeletonSegments.length) continue

    const xs = polygon.map((p) => p.x), ys = polygon.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const maxSpan=Math.max(maxX-minX,maxY-minY)
    const cell=Math.max(0.75,maxSpan/(120+resolution*80),distance/(2+resolution*2))
    const cols = Math.ceil((maxX-minX)/cell)+1, rows = Math.ceil((maxY-minY)/cell)+1

    const localControls = controls.filter((guide)=>assignedOutlineByGuide.get(guide.id)===outline.id)
      .sort((a,b) => {
        const average=(shape)=>{
          const samples=sampleSegments(segmentsFrom(nodesFrom(shape.points),shape.closed),Math.max(3,distance/2))
          return samples.reduce((sum,p)=>sum+distanceToSegments(p,skeletonSegments),0)/Math.max(1,samples.length)
        }
        return average(a)-average(b)
      })
    const shortControls=localControls.filter((guide)=>!guide.closed && shapeLength(guide)<shapeLength(outline)*0.28)
    const fullControls=localControls.filter((guide)=>!shortControls.includes(guide))
    const guides = [
      {segments:skeletonSegments, polygon:holeReplacesSkeleton && localSkeletons.length===1 ? nodesFrom(localSkeletons[0].points) : null},
      ...fullControls.map((shape)=>({
        segments:segmentsFrom(nodesFrom(shape.points),shape.closed),
        polygon:shape.closed?nodesFrom(shape.points):null,
      })),
      {segments:outlineSegments,polygon},
    ]

    for (let band=0; band<guides.length-1; band++) {
      const inner=guides[band], outer=guides[band+1]
      const boundarySamples=sampleSegments(outer.segments,Math.max(3,distance/2))
      const actualDistance=boundarySamples.reduce((sum,p)=>sum+distanceToSegments(p,inner.segments),0)/Math.max(1,boundarySamples.length)
      const count=Math.max(0,Math.min(36,Math.round(actualDistance/distance)-1))
      if (!count) continue
      const grid=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>{
        const point={x:minX+x*cell,y:minY+y*cell}
        const valid=pointInPolygon(point,polygon) && (!outer.polygon || pointInPolygon(point,outer.polygon)) && (!inner.polygon || !pointInPolygon(point,inner.polygon))
        if (!valid) return {...point,value:null}
        const a=distanceToSegments(point,inner.segments), b=distanceToSegments(point,outer.segments)
        return {...point,value:a/(a+b+1e-9)}
      }))
      for (let levelIndex=1;levelIndex<=count;levelIndex++) {
        const level=levelIndex/(count+1)
        for (const line of stitch(contourSegments(grid,cols,rows,level),cell*.25)) {
          const closed=line.length>3 && Math.hypot(line[0].x-line.at(-1).x,line[0].y-line.at(-1).y)<cell*1.5
          generated.push(makeTween(line,closed))
        }
      }
    }
  }
  if (!generated.length) throw new Error('The guides are too close for the current Distance, or no matching inner guide was found.')
  return holeReplacesSkeleton ? generated : generated.map((shape)=>routeAroundHoles(shape,closedHoles))
}

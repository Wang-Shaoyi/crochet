import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line, Circle, Group } from 'react-konva'
import { createId } from '../utils/id'

const MIN_SCALE = 0.2
const MAX_SCALE = 6

function getRenderedPoints(points, segmentKinds, closed, fallbackKind = 'polyline') {
  const nodes = []
  for (let i = 0; i < points.length; i += 2) nodes.push({ x: points[i], y: points[i + 1] })
  if (nodes.length < 2) return points
  const result = [nodes[0].x, nodes[0].y]
  const segmentCount = closed ? nodes.length : nodes.length - 1
  const getNode = (index) => closed
    ? nodes[(index + nodes.length) % nodes.length]
    : nodes[Math.max(0, Math.min(nodes.length - 1, index))]

  for (let i = 0; i < segmentCount; i++) {
    const kind = segmentKinds?.[i] || fallbackKind
    const p0 = getNode(i - 1), p1 = getNode(i), p2 = getNode(i + 1), p3 = getNode(i + 2)
    if (kind !== 'curve') {
      result.push(p2.x, p2.y)
      continue
    }
    for (let step = 1; step <= 12; step++) {
      const t = step / 12, t2 = t * t, t3 = t2 * t
      result.push(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3),
      )
    }
  }
  return result
}

function getGridLines(size, cell, stageScale, stagePos) {
  // Draw enough grid lines to cover the visible viewport regardless of pan/zoom.
  const left = -stagePos.x / stageScale
  const top = -stagePos.y / stageScale
  const right = left + size.width / stageScale
  const bottom = top + size.height / stageScale

  const startCol = Math.floor(left / cell) - 1
  const endCol = Math.ceil(right / cell) + 1
  const startRow = Math.floor(top / cell) - 1
  const endRow = Math.ceil(bottom / cell) + 1

  const lines = []
  for (let c = startCol; c <= endCol; c++) {
    const x = c * cell
    lines.push({ key: `v-${c}`, points: [x, top - cell, x, bottom + cell] })
  }
  for (let r = startRow; r <= endRow; r++) {
    const y = r * cell
    lines.push({ key: `h-${r}`, points: [left - cell, y, right + cell, y] })
  }
  return lines
}

export default function DrawingCanvas({
  shapes,
  setShapes,
  tool,
  selectedId,
  setSelectedId,
  showGrid,
  gridSize,
  activeColor,
}) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [draft, setDraft] = useState(null) // { points: [x1,y1, x2,y2, ...] }
  const [cursorPoint, setCursorPoint] = useState(null)
  const lastClickRef = useRef(null) // { time, x, y } of the previous draw click
  const rightPanningRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const toStageCoords = useCallback((stage) => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    }
  }, [])

  const finishDraft = useCallback(() => {
    if (draft && draft.points.length >= 4) {
      setShapes((prev) => [
        ...prev,
        { id: createId('draw'), points: draft.points, closed: false, source: 'draw', color: activeColor, segmentKinds: draft.segmentKinds },
      ])
    }
    lastClickRef.current = null
    setDraft(null)
  }, [draft, setShapes, activeColor])

  const cancelDraft = useCallback(() => {
    lastClickRef.current = null
    setDraft(null)
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cancelDraft()
      } else if (e.key === 'Enter') {
        finishDraft()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && selectedId) {
        setShapes((prev) => prev.filter((s) => s.id !== selectedId))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelDraft, finishDraft, tool, selectedId, setShapes, setSelectedId])

  function handleStageClick(e) {
    if (tool !== 'polyline' && tool !== 'curve') return
    const stage = e.target.getStage()
    const point = toStageCoords(stage)
    if (!point) return

    const first = draft && { x: draft.points[0], y: draft.points[1] }
    const shouldClose = first && draft.points.length >= 6 &&
      Math.hypot(point.x - first.x, point.y - first.y) <= 14 / stage.scaleX()
    if (shouldClose) {
      setShapes((prev) => [...prev, {
        id: createId('draw'), points: draft.points, closed: true, source: 'draw', color: activeColor,
        segmentKinds: [...draft.segmentKinds, tool],
      }])
      setDraft(null)
      setCursorPoint(null)
      lastClickRef.current = null
      return
    }

    // Konva's built-in dblclick only checks timing, not position, so it
    // fires on any two quick clicks anywhere on the stage. Detect a real
    // "double-click to finish" ourselves: close in time AND close in space.
    const now = Date.now()
    const last = lastClickRef.current
    const isFinishClick =
      last &&
      now - last.time < 400 &&
      Math.hypot(point.x - last.x, point.y - last.y) < 8 / stage.scaleX()

    if (isFinishClick) {
      lastClickRef.current = null
      finishDraft()
      return
    }

    lastClickRef.current = { time: now, x: point.x, y: point.y }
    setDraft((current) => {
      if (!current) return { points: [point.x, point.y], segmentKinds: [] }
      return {
        ...current,
        points: [...current.points, point.x, point.y],
        segmentKinds: [...current.segmentKinds, tool],
      }
    })
  }

  function handleMouseMove(e) {
    if ((tool !== 'polyline' && tool !== 'curve') || !draft) return
    const stage = e.target.getStage()
    const point = toStageCoords(stage)
    if (point) {
      const first = { x: draft.points[0], y: draft.points[1] }
      const snaps = draft.points.length >= 6 &&
        Math.hypot(point.x - first.x, point.y - first.y) <= 14 / stage.scaleX()
      setCursorPoint(snaps ? first : point)
    }
  }

  function handleWheel(e) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const oldScale = stageScale
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    }

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = 1.08
    let newScale = direction > 0 ? oldScale * factor : oldScale / factor
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale))

    setStageScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  function updatePoint(shapeId, pointIndex, x, y) {
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== shapeId) return s
        const points = s.points.slice()
        points[pointIndex] = x
        points[pointIndex + 1] = y
        return { ...s, points }
      }),
    )
  }

  function moveShape(shapeId, dx, dy) {
    setShapes((prev) => prev.map((shape) => shape.id === shapeId
      ? { ...shape, points: shape.points.map((value, i) => value + (i % 2 ? dy : dx)) }
      : shape))
  }

  function startRightPan(e) {
    if (e.evt.button !== 2) return
    e.evt.preventDefault()
    rightPanningRef.current = true
    const stage = stageRef.current
    stage.draggable(true)
    stage.startDrag()
  }

  function stopRightPan() {
    if (!rightPanningRef.current) return
    rightPanningRef.current = false
    stageRef.current?.draggable(false)
  }

  const gridLines = showGrid ? getGridLines(size, gridSize, stageScale, stagePos) : []
  const previewPoints =
    draft && cursorPoint ? [...draft.points, cursorPoint.x, cursorPoint.y] : draft?.points
  const previewKinds = draft && cursorPoint ? [...draft.segmentKinds, tool] : draft?.segmentKinds

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      style={{ cursor: tool === 'polyline' || tool === 'curve' ? 'crosshair' : 'default' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={false}
        onMouseDown={startRightPan}
        onMouseUp={stopRightPan}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onDragEnd={(e) => {
          if (e.target !== stageRef.current) return
          setStagePos({ x: e.target.x(), y: e.target.y() })
        }}
      >
        <Layer listening={false}>
          {gridLines.map((l) => (
            <Line key={l.key} points={l.points} stroke="#e4e1da" strokeWidth={1 / stageScale} />
          ))}
        </Layer>

        <Layer>
          {shapes.map((shape) => {
            const isSelected = shape.id === selectedId
            const isGenerated = shape.source === 'generated'
            return (
              <Group key={shape.id} listening={!isGenerated} draggable={tool === 'select' && !isGenerated}
                onDragEnd={(e) => {
                  if (e.target !== e.currentTarget) return
                  moveShape(shape.id, e.target.x(), e.target.y())
                  e.target.position({ x: 0, y: 0 })
                }}>
                <Line
                  points={getRenderedPoints(shape.points, shape.segmentKinds, shape.closed, shape.kind)}
                  closed={false}
                  stroke={shape.color || '#111111'}
                  strokeWidth={isGenerated ? 1 / stageScale : isSelected ? 2.5 / stageScale : 2 / stageScale}
                  hitStrokeWidth={isGenerated ? 0 : 12 / stageScale}
                  lineCap="round"
                  lineJoin="round"
                  onClick={(e) => {
                    if (tool !== 'select' || isGenerated) return
                    e.cancelBubble = true
                    setSelectedId(shape.id)
                  }}
                />
                {isSelected &&
                  tool === 'select' &&
                  Array.from({ length: shape.points.length / 2 }).map((_, i) => {
                    const x = shape.points[i * 2]
                    const y = shape.points[i * 2 + 1]
                    return (
                      <Circle
                        key={i}
                        x={x}
                        y={y}
                        radius={5 / stageScale}
                        fill="#fff"
                        stroke="#c2410c"
                        strokeWidth={1.5 / stageScale}
                        draggable
                        onDragMove={(e) => updatePoint(shape.id, i * 2, e.target.x(), e.target.y())}
                      />
                    )
                  })}
              </Group>
            )
          })}

          {draft && (
            <>
              <Line
                points={getRenderedPoints(previewPoints, previewKinds, false)}
                stroke={activeColor}
                strokeWidth={2 / stageScale}
                dash={[6 / stageScale, 4 / stageScale]}
                lineCap="round"
                lineJoin="round"
              />
              {Array.from({ length: draft.points.length / 2 }).map((_, i) => (
                <Circle
                  key={i}
                  x={draft.points[i * 2]}
                  y={draft.points[i * 2 + 1]}
                  radius={4 / stageScale}
                  fill={activeColor}
                />
              ))}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  )
}

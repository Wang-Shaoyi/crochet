import { useCallback, useState } from 'react'
import Toolbar from './components/Toolbar'
import DrawingCanvas from './components/DrawingCanvas'
import { parseDxf } from './utils/dxfImport'
import { createId } from './utils/id'
import { generateTweens } from './utils/tweenGeneration'
import './App.css'

export default function App() {
  const [shapes, setShapes] = useState([])
  const [tool, setTool] = useState('polyline')
  const [selectedId, setSelectedId] = useState(null)
  const [showGrid, setShowGrid] = useState(true)
  const [gridSize, setGridSize] = useState(20)
  const [activeColor, setActiveColor] = useState('#111111')
  const [unitSize, setUnitSize] = useState(10)
  const [tweenDistance, setTweenDistance] = useState(20)
  const [resolution, setResolution] = useState(2)

  const handleImportDxf = useCallback((dxfText) => {
    let imported
    try { imported = parseDxf(dxfText) } catch (err) {
      window.alert(`DXF import failed: ${err.message}`)
      return
    }
    if (!imported.length) {
      window.alert('No supported geometry was found in this file.')
      return
    }
    setShapes((prev) => [...prev, ...imported.map(({ points, closed }) => ({
      id: createId('dxf'), points, closed, source: 'dxf', color: '#111111',
    }))])
  }, [])

  const undo = () => { setShapes((prev) => prev.slice(0, -1)); setSelectedId(null) }
  const clear = () => { setShapes([]); setSelectedId(null) }
  const generate = () => {
    try {
      const tweens = generateTweens(shapes, tweenDistance, resolution)
      setShapes((prev) => [...prev.filter((shape) => shape.source !== 'generated'), ...tweens])
      setSelectedId(null)
    } catch (error) { window.alert(error.message) }
  }

  return <div className="app-shell">
    <aside className="intro-panel">
      <a className="brand-mark" href="https://shaoyiw.com" target="_blank" rel="noreferrer">
        more: shaoyiw.com
      </a>
      <div className="intro-copy">
        <p className="eyebrow">Crochet geometry workspace</p>
        <h1>Shape an idea,<br />one line at a time.</h1>
        <p className="intro-lede">A focused drafting space for building crochet outlines and internal construction guides.</p>
      </div>
      <div className="notes-block">
        <label htmlFor="project-notes">Project notes</label>
        <textarea id="project-notes" placeholder="Write your introduction, pattern notes, or instructions here…" />
      </div>
      <p className="intro-footer">© 2026 Shaoyi Wang</p>
    </aside>

    <main className="editor-column">
      <section className="editor-window">
        <Toolbar tool={tool} setTool={setTool} onClear={clear} onUndo={undo}
          canUndo={shapes.length > 0} onImportDxf={handleImportDxf} showGrid={showGrid}
          setShowGrid={setShowGrid} gridSize={gridSize} setGridSize={setGridSize}
          shapeCount={shapes.length} activeColor={activeColor} setActiveColor={setActiveColor}
          onGenerate={generate} unitSize={unitSize} setUnitSize={setUnitSize}
          tweenDistance={tweenDistance} setTweenDistance={setTweenDistance}
          resolution={resolution} setResolution={setResolution} />
        <div className="canvas-area">
          <DrawingCanvas shapes={shapes} setShapes={setShapes} tool={tool}
            selectedId={selectedId} setSelectedId={setSelectedId} showGrid={showGrid}
            gridSize={gridSize} activeColor={activeColor} />
        </div>
      </section>
    </main>
  </div>
}

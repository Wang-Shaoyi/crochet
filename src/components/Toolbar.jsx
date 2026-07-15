import { useRef } from 'react'

const TOOLS = [
  { id: 'select', label: 'Select / Edit', icon: '↖' },
  { id: 'polyline', label: 'Draw polyline', icon: '⌁' },
  { id: 'curve', label: 'Draw curve', icon: '∿' },
]
const COLORS = [
  { value: '#111111', label: 'Outline' },
  { value: '#2f6fed', label: 'Control' },
  { value: '#199473', label: 'Skeleton' },
  { value: '#d94a3a', label: 'Hole' },
]

export default function Toolbar({ tool, setTool, onClear, onUndo, canUndo, onImportDxf,
  showGrid, setShowGrid, gridSize, setGridSize, shapeCount, activeColor, setActiveColor, onGenerate,
  unitSize, setUnitSize, tweenDistance, setTweenDistance, resolution, setResolution }) {
  const fileInputRef = useRef(null)
  const importFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onImportDxf(String(reader.result))
    reader.readAsText(file); e.target.value = ''
  }

  return <aside className="toolbar">
    <div className="toolbar-section">
      <div className="tool-group">{TOOLS.map((t) => <button key={t.id} type="button"
        className={`tool-button ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)}>
        <span className="tool-icon">{t.icon}</span>{t.label}</button>)}</div>
    </div>
    <div className="toolbar-section">
      <div className="color-list">{COLORS.map((color) => <button type="button" key={color.value}
        className={`color-option ${activeColor === color.value ? 'active' : ''}`}
        disabled={tool === 'select'}
        onClick={() => setActiveColor(color.value)}>
        <span className="color-swatch" style={{ background: color.value }} />
        <strong>{color.label}</strong>
      </button>)}</div>
    </div>
    <div className="toolbar-section compact">
      <div className="toolbar-section-label">Params</div>
      <label className="range-row">Grid size<input type="number" min="5" max="200" value={gridSize}
        onChange={(e) => setGridSize(Number(e.target.value) || 1)} /></label>
      <label className="toolbar-number">Unit size<input type="number" min="1" value={unitSize}
        onChange={(e) => setUnitSize(Math.max(1, Number(e.target.value) || 1))} /></label>
      <label className="toolbar-number">Distance<input type="number" min="1" value={tweenDistance}
        onChange={(e) => setTweenDistance(Math.max(1, Number(e.target.value) || 1))} /></label>
      <label className="toolbar-number">Resolution<input type="number" min="1" max="5" value={resolution}
        onChange={(e) => setResolution(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={showGrid}
        onChange={(e) => setShowGrid(e.target.checked)} /> Show grid</label>
    </div>
    <div className="toolbar-section compact">
      <div className="toolbar-section-label">File & actions</div>
      <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>Import DXF</button>
      <input ref={fileInputRef} type="file" accept=".dxf" onChange={importFile} hidden />
      <div className="action-row"><button type="button" className="secondary-button" onClick={onUndo} disabled={!canUndo}>Undo</button>
      <button type="button" className="danger-button" onClick={onClear} disabled={!shapeCount}>Clear</button></div>
    </div>
    <button type="button" className="generate-button" onClick={onGenerate} disabled={!shapeCount}>
      Generate <span>→</span>
    </button>
  </aside>
}

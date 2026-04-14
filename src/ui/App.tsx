import React, { useState } from 'react'
import { useGameStore } from './store'
import { InfoPanel } from './InfoPanel'
import { Minimap } from './Minimap'
import { BuilderPanel } from './BuilderPanel'
import { FileMenu } from './FileMenu'
import { CIV_PALETTE } from '../shared/constants'
import { MapLayout } from '../shared/types'
import type { GameConfig } from '../shared/types'
import {
  listSaves, loadFromLocalStorage, defaultSaveName,
  readJsonFile,
} from '../shared/saveFormat'
import type { SaveEntry } from '../shared/saveFormat'

export function App(): React.ReactElement {
  const gameConfig    = useGameStore(s => s.gameConfig)
  const isLoading     = useGameStore(s => s.isLoading)
  const progress      = useGameStore(s => s.loadingProgress)
  const msg           = useGameStore(s => s.loadingMsg)
  const startGame     = useGameStore(s => s.startGame)

  // ── Screen routing ─────────────────────────────────────────────────────────
  if (gameConfig === null) {
    return <NewGameMenu onStart={startGame} />
  }

  if (isLoading) {
    return (
      <div style={loadingOverlay}>
        <div style={loadingBox}>
          <div style={loadingTitle}>Civ TS</div>
          <div style={loadingMsgStyle}>{msg}</div>
          <div style={barTrack}>
            <div style={{ ...barFill, width: `${progress}%` }} />
          </div>
          <div style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>{progress}%</div>
        </div>
      </div>
    )
  }

  return <GameHUD />
}

// ── New Game menu ─────────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { value: MapLayout; label: string; desc: string }[] = [
  { value: MapLayout.Continents, label: 'Continents',  desc: '2-4 large landmasses separated by ocean' },
  { value: MapLayout.Pangaea,    label: 'Pangaea',     desc: 'One giant continent filling most of the map' },
  { value: MapLayout.Islands,    label: 'Islands',     desc: '10+ small islands scattered across ocean' },
  { value: MapLayout.InlandSea,  label: 'Inland Sea',  desc: 'Land ring surrounding a central sea' },
  { value: MapLayout.Lakes,      label: 'Lakes',       desc: 'All land with scattered freshwater lakes' },
]

function NewGameMenu({ onStart }: { onStart: (cfg: GameConfig) => void }): React.ReactElement {
  const loadSave = useGameStore(s => s.loadSave)

  const [mapWidth,  setMapWidth]  = useState(80)
  const [mapHeight, setMapHeight] = useState(80)
  const [numCivs,   setNumCivs]   = useState(2)
  const [layout,    setLayout]    = useState<MapLayout>(MapLayout.Continents)

  // Load-saves section state
  const [showLoadList, setShowLoadList] = useState(false)
  const [saves,        setSaves]        = useState<SaveEntry[]>([])
  const [loadStatus,   setLoadStatus]   = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const w = Math.max(20, Math.min(500, mapWidth))
    const h = Math.max(20, Math.min(500, mapHeight))
    const n = Math.max(2,  Math.min(CIV_PALETTE.length - 1, numCivs))
    const civColors = CIV_PALETTE.slice(0, n + 1)
    onStart({ mapWidth: w, mapHeight: h, numCivs: n, civColors, layout })
  }

  function openLoadList() {
    setSaves(listSaves())
    setLoadStatus('')
    setShowLoadList(true)
  }

  function handleLoadSave(key: string) {
    const save = loadFromLocalStorage(key)
    if (!save) { setLoadStatus('Save not found'); return }
    loadSave(save)
  }

  async function handleImportFile() {
    try {
      const save = await readJsonFile()
      if (save.version !== 1) throw new Error('Unsupported save version')
      loadSave(save)
    } catch (e) {
      const msg = (e as Error).message
      if (msg !== 'No file selected') setLoadStatus(`Error: ${msg}`)
    }
  }

  const selectedDesc = LAYOUT_OPTIONS.find(o => o.value === layout)?.desc ?? ''

  return (
    <div style={menuOverlay}>
      <form style={menuBox} onSubmit={handleSubmit}>
        <div style={loadingTitle}>Civ TS</div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Map Width</label>
          <input
            type="number" min={20} max={500} value={mapWidth}
            onChange={e => setMapWidth(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Map Height</label>
          <input
            type="number" min={20} max={500} value={mapHeight}
            onChange={e => setMapHeight(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Civilizations</label>
          <input
            type="number" min={2} max={CIV_PALETTE.length - 1} value={numCivs}
            onChange={e => setNumCivs(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroup}>
          <label style={labelStyle}>Map Layout</label>
          <select
            value={layout}
            onChange={e => setLayout(e.target.value as MapLayout)}
            style={selectStyle}
          >
            {LAYOUT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Layout description hint */}
        <div style={layoutDescStyle}>{selectedDesc}</div>

        {/* Civ colour preview */}
        <div style={civPreviewRow}>
          {Array.from({ length: Math.max(2, Math.min(CIV_PALETTE.length - 1, numCivs)) }, (_, i) => (
            <span
              key={i}
              title={i === 0 ? 'Player 1' : `AI ${i}`}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: `#${(CIV_PALETTE[i + 1] ?? 0x888888).toString(16).padStart(6, '0')}`,
                display: 'inline-block',
                boxShadow: `0 0 4px #${(CIV_PALETTE[i + 1] ?? 0x888888).toString(16).padStart(6, '0')}`,
              }}
            />
          ))}
        </div>

        <button type="submit" style={startBtnStyle}>New Game</button>
      </form>

      {/* Load saved game section */}
      <div style={menuLoadSection}>
        <div style={menuDivider}>— or load a saved game —</div>

        {!showLoadList ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button style={loadBtnStyle} onClick={openLoadList}>Load Save</button>
            <button style={loadBtnStyle} onClick={handleImportFile}>Import .json</button>
          </div>
        ) : (
          <div style={loadListBox}>
            {saves.length === 0 && (
              <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '6px 0' }}>
                No saves found
              </div>
            )}
            {saves.map(entry => (
              <div key={entry.key} style={loadRowStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#ddd', fontSize: 12 }}>{entry.name}</div>
                  <div style={{ color: '#555', fontSize: 10 }}>{new Date(entry.savedAt).toLocaleString()}</div>
                </div>
                <button style={loadSmallBtnStyle} onClick={() => handleLoadSave(entry.key)}>Load</button>
              </div>
            ))}
            <button
              style={{ ...loadBtnStyle, marginTop: 6, width: '100%', textAlign: 'center' }}
              onClick={() => setShowLoadList(false)}
            >
              ← Back
            </button>
          </div>
        )}

        {loadStatus && (
          <div style={{ color: '#f88', fontSize: 11, textAlign: 'center', marginTop: 4 }}>{loadStatus}</div>
        )}
      </div>
    </div>
  )
}

// ── In-game HUD ───────────────────────────────────────────────────────────────

function GameHUD(): React.ReactElement {
  const turn           = useGameStore(s => s.turn)
  const unitCount      = useGameStore(s => s.unitCount)
  const currentPlayer  = useGameStore(s => s.currentPlayer)
  const pendingCount   = useGameStore(s => s.pendingCount)
  const canEndTurn     = useGameStore(s => s.canEndTurn)
  const phaseLabel     = useGameStore(s => s.phaseLabel)
  const endTurn        = useGameStore(s => s.endTurn)
  const skipUnit       = useGameStore(s => s.skipUnit)
  const skipAll        = useGameStore(s => s.skipAll)
  const minimapVisible  = useGameStore(s => s.minimapVisible)
  const toggleMinimap   = useGameStore(s => s.toggleMinimap)
  const builderMode     = useGameStore(s => s.builderMode)
  const toggleBuilder   = useGameStore(s => s.toggleBuilderMode)

  const playerColorCss = currentPlayer
    ? `#${currentPlayer.color.toString(16).padStart(6, '0')}`
    : '#aaa'
  const isHumanTurn = currentPlayer?.isHuman ?? false

  return (
    <>
      {/* Top HUD bar */}
      <div style={hudStyle}>
        <span style={hudItem}>Turn <b>{turn}</b></span>
        <span style={hudItem}>Units <b>{unitCount.toLocaleString()}</b></span>

        {currentPlayer && (
          <span style={{ ...hudItem, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: playerColorCss,
              display: 'inline-block',
              boxShadow: `0 0 5px ${playerColorCss}`,
            }} />
            <b style={{ color: playerColorCss }}>{currentPlayer.name}</b>
            <span style={{ color: '#888', fontSize: 11 }}>{phaseLabel}</span>
          </span>
        )}

        {isHumanTurn && pendingCount > 0 && (
          <span style={pendingBadge}>{pendingCount} to move</span>
        )}

        <span style={{ flex: 1 }} />

        {isHumanTurn && (
          <>
            <button style={btnStyle} onClick={() => skipUnit?.()} title="Skip active unit (Space)">
              Skip Unit
            </button>
            <button style={btnStyle} onClick={() => skipAll?.()} title="Skip all remaining units">
              Skip All
            </button>
            <button
              style={{ ...btnStyle, ...(canEndTurn ? btnEndTurnActive : btnEndTurnDisabled) }}
              disabled={!canEndTurn}
              onClick={() => { if (canEndTurn) endTurn?.() }}
              title="End Turn (Enter)"
            >
              End Turn
            </button>
          </>
        )}

        <button
          style={{ ...btnStyle, ...(minimapVisible ? btnMinimapActive : {}) }}
          onClick={toggleMinimap}
          title="Toggle minimap (M)"
        >
          Map
        </button>

        <button
          style={{ ...btnStyle, ...(builderMode ? btnBuilderActive : {}) }}
          onClick={toggleBuilder}
          title="Open Game Builder"
        >
          Builder
        </button>

        <FileMenu />

        <span style={{ ...hudItem, opacity: 0.45, fontSize: 11 }}>
          Drag · scroll · click · right-click to move
        </span>
      </div>

      {/* Tile / unit info panel */}
      <InfoPanel />

      {/* Minimap */}
      <Minimap />

      {/* Game Builder side panel */}
      <BuilderPanel />

      {/* Keyboard hints */}
      <div style={hintsStyle}>
        <span>Arrows/WASD · scroll · click · right-click move · Space skip · Enter end turn</span>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const menuOverlay: React.CSSProperties = {
  position:       'absolute',
  inset:          0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  background:     'rgba(5,5,18,0.97)',
  pointerEvents:  'auto',
}

const menuBox: React.CSSProperties = {
  width:       320,
  textAlign:   'center',
  fontFamily:  'monospace',
  color:       '#e0e0e0',
  display:     'flex',
  flexDirection: 'column',
  gap:         14,
}

const fieldGroup: React.CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  justifyContent:'space-between',
  gap:           12,
}

const labelStyle: React.CSSProperties = {
  color:    '#aad4ff',
  fontSize: 13,
  flex:     1,
  textAlign:'left',
}

const inputStyle: React.CSSProperties = {
  width:       90,
  padding:     '4px 8px',
  fontSize:    13,
  fontFamily:  'monospace',
  background:  'rgba(255,255,255,0.07)',
  border:      '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:       '#e0e0e0',
  textAlign:   'right',
}

const selectStyle: React.CSSProperties = {
  width:        148,
  padding:      '4px 8px',
  fontSize:     13,
  fontFamily:   'monospace',
  background:   'rgba(20,20,44,0.95)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#e0e0e0',
  cursor:       'pointer',
}

const layoutDescStyle: React.CSSProperties = {
  fontSize:   11,
  color:      'rgba(170,212,255,0.55)',
  textAlign:  'center',
  marginTop:  -6,
  minHeight:  16,
}

const civPreviewRow: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'center',
  gap:            8,
  marginTop:      -4,
}

const startBtnStyle: React.CSSProperties = {
  padding:      '8px 0',
  fontSize:     14,
  fontFamily:   'monospace',
  fontWeight:   700,
  background:   'rgba(34,102,204,0.3)',
  border:       '1px solid rgba(68,170,255,0.6)',
  borderRadius: 6,
  color:        '#88ccff',
  cursor:       'pointer',
  letterSpacing:'0.05em',
  marginTop:    4,
}

const menuLoadSection: React.CSSProperties = {
  width:       320,
  marginTop:   10,
  fontFamily:  'monospace',
}

const menuDivider: React.CSSProperties = {
  color:     'rgba(170,212,255,0.3)',
  fontSize:  11,
  textAlign: 'center',
  marginBottom: 10,
}

const loadBtnStyle: React.CSSProperties = {
  padding:      '5px 14px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  color:        '#aaa',
  cursor:       'pointer',
}

const loadListBox: React.CSSProperties = {
  maxHeight:   180,
  overflowY:   'auto',
  background:  'rgba(0,0,0,0.3)',
  border:      '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding:     '4px 0',
}

const loadRowStyle: React.CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         8,
  padding:     '4px 10px',
  borderBottom:'1px solid rgba(255,255,255,0.05)',
}

const loadSmallBtnStyle: React.CSSProperties = {
  padding:      '2px 8px',
  fontSize:     11,
  fontFamily:   'monospace',
  background:   'rgba(34,102,204,0.2)',
  border:       '1px solid rgba(68,150,255,0.4)',
  borderRadius: 3,
  color:        '#88ccff',
  cursor:       'pointer',
  flexShrink:   0,
}

const loadingOverlay: React.CSSProperties = {
  position:       'absolute',
  inset:          0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  background:     'rgba(5,5,18,0.95)',
  pointerEvents:  'auto',
}

const loadingBox: React.CSSProperties = {
  width:       320,
  textAlign:   'center',
  fontFamily:  'monospace',
  color:       '#e0e0e0',
}

const loadingTitle: React.CSSProperties = {
  fontSize:     36,
  fontWeight:   700,
  color:        '#aad4ff',
  marginBottom: 12,
  letterSpacing:'0.1em',
}

const loadingMsgStyle: React.CSSProperties = {
  fontSize:     14,
  color:        '#aaa',
  marginBottom: 16,
}

const barTrack: React.CSSProperties = {
  width:        '100%',
  height:       6,
  background:   'rgba(255,255,255,0.1)',
  borderRadius: 3,
  overflow:     'hidden',
}

const barFill: React.CSSProperties = {
  height:       '100%',
  background:   'linear-gradient(90deg, #2266cc, #44aaff)',
  borderRadius: 3,
  transition:   'width 0.2s ease',
}

const hudStyle: React.CSSProperties = {
  position:      'absolute',
  top:           0,
  left:          0,
  right:         0,
  height:        40,
  background:    'rgba(5,5,18,0.88)',
  borderBottom:  '1px solid rgba(255,255,255,0.1)',
  display:       'flex',
  alignItems:    'center',
  padding:       '0 12px',
  gap:           14,
  color:         '#ddd',
  fontFamily:    'monospace',
  fontSize:      13,
  pointerEvents: 'auto',
  backdropFilter:'blur(4px)',
  zIndex:        10,
}

const hudItem: React.CSSProperties = { letterSpacing: '0.03em', pointerEvents: 'none' }

const pendingBadge: React.CSSProperties = {
  background:   'rgba(255,200,0,0.18)',
  border:       '1px solid rgba(255,200,0,0.5)',
  borderRadius: 10,
  padding:      '1px 8px',
  fontSize:     11,
  color:        '#ffc800',
  pointerEvents:'none',
}

const btnStyle: React.CSSProperties = {
  padding:      '3px 10px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.08)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#ccc',
  cursor:       'pointer',
}

const btnEndTurnActive: React.CSSProperties = {
  background: 'rgba(34,170,80,0.25)',
  border:     '1px solid rgba(34,200,80,0.7)',
  color:      '#44ee88',
  fontWeight: 700,
}

const btnMinimapActive: React.CSSProperties = {
  background: 'rgba(34,102,204,0.3)',
  border:     '1px solid rgba(68,170,255,0.6)',
  color:      '#88ccff',
}

const btnBuilderActive: React.CSSProperties = {
  background: 'rgba(180,100,20,0.3)',
  border:     '1px solid rgba(255,160,60,0.6)',
  color:      '#ffbb66',
}

const btnEndTurnDisabled: React.CSSProperties = {
  opacity: 0.35,
  cursor:  'not-allowed',
}

const hintsStyle: React.CSSProperties = {
  position:    'absolute',
  bottom:      16,
  right:       16,
  color:       'rgba(255,255,255,0.3)',
  fontFamily:  'monospace',
  fontSize:    11,
  pointerEvents:'none',
}

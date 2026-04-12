import React from 'react'
import { useGameStore } from './store'
import { InfoPanel } from './InfoPanel'

export function App(): React.ReactElement {
  const isLoading  = useGameStore(s => s.isLoading)
  const progress   = useGameStore(s => s.loadingProgress)
  const msg        = useGameStore(s => s.loadingMsg)
  const turn       = useGameStore(s => s.turn)
  const unitCount  = useGameStore(s => s.unitCount)

  return (
    <>
      {/* Top HUD bar */}
      {!isLoading && (
        <div style={hudStyle}>
          <span style={hudItem}>Turn <b>{turn}</b></span>
          <span style={hudItem}>Units <b>{unitCount.toLocaleString()}</b></span>
          <span style={{ ...hudItem, opacity: 0.55, fontSize: 11 }}>
            Drag to pan · Scroll/pinch to zoom · Click tile for info
          </span>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div style={loadingOverlay}>
          <div style={loadingBox}>
            <div style={loadingTitle}>Civ TS</div>
            <div style={loadingMsg}>{msg}</div>
            <div style={barTrack}>
              <div style={{ ...barFill, width: `${progress}%` }} />
            </div>
            <div style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>{progress}%</div>
          </div>
        </div>
      )}

      {/* Tile / unit info panel */}
      {!isLoading && <InfoPanel />}

      {/* Keyboard hints (bottom-right) */}
      {!isLoading && (
        <div style={hintsStyle}>
          <span>Arrows / WASD · scroll · click</span>
        </div>
      )}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const hudStyle: React.CSSProperties = {
  position:      'absolute',
  top:           0,
  left:          0,
  right:         0,
  height:        36,
  background:    'rgba(5,5,18,0.85)',
  borderBottom:  '1px solid rgba(255,255,255,0.1)',
  display:       'flex',
  alignItems:    'center',
  padding:       '0 16px',
  gap:           20,
  color:         '#ddd',
  fontFamily:    'monospace',
  fontSize:      13,
  pointerEvents: 'none',
  backdropFilter:'blur(4px)',
}

const hudItem: React.CSSProperties = { letterSpacing: '0.03em' }

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

const loadingMsg: React.CSSProperties = {
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

const hintsStyle: React.CSSProperties = {
  position:    'absolute',
  bottom:      16,
  right:       16,
  color:       'rgba(255,255,255,0.35)',
  fontFamily:  'monospace',
  fontSize:    11,
  pointerEvents:'none',
}

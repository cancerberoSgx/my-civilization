import React from 'react'
import { useGameStore } from './store'
import { InfoPanel } from './InfoPanel'

export function App(): React.ReactElement {
  const isLoading     = useGameStore(s => s.isLoading)
  const progress      = useGameStore(s => s.loadingProgress)
  const msg           = useGameStore(s => s.loadingMsg)
  const turn          = useGameStore(s => s.turn)
  const unitCount     = useGameStore(s => s.unitCount)
  const currentPlayer = useGameStore(s => s.currentPlayer)
  const pendingCount  = useGameStore(s => s.pendingCount)
  const canEndTurn    = useGameStore(s => s.canEndTurn)
  const phaseLabel    = useGameStore(s => s.phaseLabel)
  const endTurn       = useGameStore(s => s.endTurn)
  const skipUnit      = useGameStore(s => s.skipUnit)
  const skipAll       = useGameStore(s => s.skipAll)

  // Convert player color number to CSS hex string
  const playerColorCss = currentPlayer
    ? `#${currentPlayer.color.toString(16).padStart(6, '0')}`
    : '#aaa'

  const isHumanTurn = currentPlayer?.isHuman ?? false

  return (
    <>
      {/* Top HUD bar */}
      {!isLoading && (
        <div style={hudStyle}>
          <span style={hudItem}>Turn <b>{turn}</b></span>
          <span style={hudItem}>Units <b>{unitCount.toLocaleString()}</b></span>

          {/* Current player indicator */}
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

          {/* Pending count badge */}
          {isHumanTurn && pendingCount > 0 && (
            <span style={pendingBadge}>{pendingCount} to move</span>
          )}

          <span style={{ flex: 1 }} />

          {/* Skip / End Turn buttons */}
          {isHumanTurn && (
            <>
              <button
                style={btnStyle}
                onClick={() => skipUnit?.()}
                title="Skip active unit (Space)"
              >
                Skip Unit
              </button>
              <button
                style={btnStyle}
                onClick={() => skipAll?.()}
                title="Skip all remaining units"
              >
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

          <span style={{ ...hudItem, opacity: 0.45, fontSize: 11 }}>
            Drag · scroll · click · right-click to move
          </span>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
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
      )}

      {/* Tile / unit info panel */}
      {!isLoading && <InfoPanel />}

      {/* Keyboard hints (bottom-right) */}
      {!isLoading && (
        <div style={hintsStyle}>
          <span>Arrows/WASD · scroll · click · right-click move · Space skip · Enter end turn</span>
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

const btnEndTurnDisabled: React.CSSProperties = {
  opacity: 0.35,
  cursor:  'not-allowed',
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

const hintsStyle: React.CSSProperties = {
  position:    'absolute',
  bottom:      16,
  right:       16,
  color:       'rgba(255,255,255,0.3)',
  fontFamily:  'monospace',
  fontSize:    11,
  pointerEvents:'none',
}

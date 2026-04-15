import React, { useState } from 'react'
import { useGameStore } from './store'
import { computeScore, getRelation } from '../game/diplomacy/relations'
import type { DiplomaticStatus } from '../game/diplomacy/types'

// ── Status metadata ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DiplomaticStatus, string> = {
  peace:       'Peace',
  war:         'War',
  openBorders: 'Open Borders',
  alliance:    'Alliance',
}

const STATUS_COLOR: Record<DiplomaticStatus, string> = {
  peace:       '#aaa',
  war:         '#ee5555',
  openBorders: '#55aaee',
  alliance:    '#eebb44',
}

// ── Score tiers ───────────────────────────────────────────────────────────────

const SCORE_TIERS: Array<{ threshold: number; color: string; label: string }> = [
  { threshold:  15, color: '#44ee88', label: 'Friendly'  },
  { threshold:   5, color: '#88cc44', label: 'Pleased'   },
  { threshold:   0, color: '#cccc44', label: 'Cautious'  },
  { threshold: -10, color: '#cc8844', label: 'Annoyed'   },
  { threshold: -Infinity, color: '#ee4444', label: 'Furious' },
]

function scoreInfo(score: number): { color: string; label: string } {
  return SCORE_TIERS.find(t => score >= t.threshold) ?? SCORE_TIERS[SCORE_TIERS.length - 1]!
}

// Maps every action string (human or AI) to display text
const ACTION_TEXT: Record<string, string> = {
  war:               'declared war on',
  declareWar:        'declared war on',
  peace:             'made peace with',
  makePeace:         'made peace with',
  openBorders:       'opened borders with',
  cancelOpenBorders: 'cancelled borders with',
  alliance:          'formed alliance with',
  proposeAlliance:   'formed alliance with',
  breakAlliance:     'broke alliance with',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ForeignAdvisor(): React.ReactElement | null {
  const open            = useGameStore(s => s.foreignAdvisorOpen)
  const toggle          = useGameStore(s => s.toggleForeignAdvisor)
  const players         = useGameStore(s => s.players)
  const diplomacy       = useGameStore(s => s.diplomacy)
  const events          = useGameStore(s => s.diplomacyEvents)
  const performActionFn = useGameStore(s => s.diplomacyActionFn)

  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (!open) return null

  const humanPlayer = players.find(p => p.isHuman)
  if (!humanPlayer) return null

  const others = players.filter(p => !p.isHuman)

  function doAction(action: string, targetId: number) {
    performActionFn?.(action, targetId)
  }

  function civColor(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`
  }

  const selectedTarget = selectedId !== null
    ? (players.find(p => p.id === selectedId) ?? null)
    : null

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>⚖ Foreign Advisor</span>
        <button style={closeBtnStyle} onClick={toggle}>×</button>
      </div>

      <div style={scrollBodyStyle}>

        {/* ── Civilizations table ────────────────────────────────────────────── */}
        <div>
          <div style={sectionTitleStyle}>Civilizations</div>
          {others.length === 0 ? (
            <div style={{ color: '#555', fontSize: 12 }}>No other civilizations.</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Leader / Civ</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Attitude</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {others.map(other => {
                  const rel      = getRelation(diplomacy, humanPlayer.id, other.id)
                  const score    = computeScore(rel)
                  const info     = scoreInfo(score)
                  const color    = civColor(other.color)
                  const selected = selectedId === other.id
                  return (
                    <tr
                      key={other.id}
                      style={{
                        ...rowStyle,
                        background: selected ? 'rgba(255,255,255,0.07)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedId(selected ? null : other.id)}
                    >
                      <td style={tdStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: color, display: 'inline-block', flexShrink: 0,
                          }} />
                          <span>
                            <b style={{ color }}>{other.leaderName}</b>
                            <span style={{ color: '#666', fontSize: 10, marginLeft: 5 }}>
                              {other.civName}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: STATUS_COLOR[rel.status] }}>
                        {STATUS_LABEL[rel.status]}
                      </td>
                      <td style={{ ...tdStyle, color: info.color }}>{info.label}</td>
                      <td style={{ ...tdStyle, color: info.color, textAlign: 'right' }}>
                        {score > 0 ? `+${score}` : `${score}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Action panel ───────────────────────────────────────────────────── */}
        {selectedTarget !== null && (() => {
          const rel   = getRelation(diplomacy, humanPlayer.id, selectedTarget.id)
          const color = civColor(selectedTarget.color)
          const tId   = selectedTarget.id
          return (
            <div>
              <div style={sectionTitleStyle}>
                Actions — <b style={{ color }}>{selectedTarget.civName}</b>
              </div>
              <div style={actionRowStyle}>
                {rel.status !== 'war' && (
                  <button
                    style={{ ...actionBtnStyle, ...warBtnStyle }}
                    onClick={() => doAction('declareWar', tId)}
                  >
                    ⚔ Declare War
                  </button>
                )}
                {rel.status === 'war' && (
                  <button
                    style={{ ...actionBtnStyle, ...peaceBtnStyle }}
                    onClick={() => doAction('makePeace', tId)}
                  >
                    ☮ Make Peace
                  </button>
                )}
                {rel.status === 'peace' && (
                  <button
                    style={{ ...actionBtnStyle, ...bordersBtnStyle }}
                    onClick={() => doAction('openBorders', tId)}
                  >
                    ↔ Open Borders
                  </button>
                )}
                {rel.status === 'openBorders' && (
                  <>
                    <button
                      style={actionBtnStyle}
                      onClick={() => doAction('cancelOpenBorders', tId)}
                    >
                      ✕ Cancel Borders
                    </button>
                    <button
                      style={{ ...actionBtnStyle, ...allianceBtnStyle }}
                      onClick={() => doAction('proposeAlliance', tId)}
                    >
                      ★ Propose Alliance
                    </button>
                  </>
                )}
                {rel.status === 'alliance' && (
                  <>
                    <button
                      style={actionBtnStyle}
                      onClick={() => doAction('breakAlliance', tId)}
                    >
                      ✕ Break Alliance
                    </button>
                    <button
                      style={{ ...actionBtnStyle, ...warBtnStyle }}
                      onClick={() => doAction('declareWar', tId)}
                    >
                      ⚔ Declare War
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── AI-to-AI relations (compact chips) ────────────────────────────── */}
        {others.length > 1 && (
          <div>
            <div style={sectionTitleStyle}>AI Relations</div>
            <div style={aiMatrixStyle}>
              {others.flatMap(from =>
                others
                  .filter(to => to.id !== from.id)
                  .map(to => {
                    const rel   = getRelation(diplomacy, from.id, to.id)
                    const score = computeScore(rel)
                    const info  = scoreInfo(score)
                    return (
                      <span
                        key={`${from.id}-${to.id}`}
                        style={{
                          ...matrixCellStyle,
                          color:       info.color,
                          borderColor: STATUS_COLOR[rel.status],
                        }}
                        title={`${from.civName} → ${to.civName}: ${STATUS_LABEL[rel.status]} (${score >= 0 ? '+' : ''}${score})`}
                      >
                        {from.civName.slice(0, 3)}→{to.civName.slice(0, 3)}
                      </span>
                    )
                  })
              )}
            </div>
          </div>
        )}

        {/* ── Recent events ──────────────────────────────────────────────────── */}
        {events.length > 0 && (
          <div>
            <div style={sectionTitleStyle}>Recent Events</div>
            <div style={eventsListStyle}>
              {events.slice(0, 10).map((evt, i) => {
                const from      = players.find(p => p.id === evt.fromId)
                const to        = players.find(p => p.id === evt.toId)
                const fromColor = from ? civColor(from.color) : '#aaa'
                const toColor   = to   ? civColor(to.color)   : '#aaa'
                const text      = ACTION_TEXT[evt.action] ?? evt.action
                return (
                  <div
                    key={i}
                    style={{
                      ...eventRowStyle,
                      color: evt.isAI ? '#ffaa44' : '#88ccff',
                    }}
                  >
                    <span style={{ color: '#555', fontSize: 10, flexShrink: 0 }}>T{evt.turn}</span>
                    <b style={{ color: fromColor }}>
                      {from?.civName ?? `P${evt.fromId}`}
                    </b>
                    <span style={{ color: '#666' }}>{text}</span>
                    <b style={{ color: toColor }}>
                      {to?.civName ?? `P${evt.toId}`}
                    </b>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Legend ─────────────────────────────────────────────────────────── */}
        <div style={legendStyle}>
          <span style={{ color: '#444', fontSize: 10 }}>STATUS:</span>
          {(Object.keys(STATUS_LABEL) as DiplomaticStatus[]).map(s => (
            <span key={s} style={{ color: STATUS_COLOR[s], fontSize: 10 }}>
              {STATUS_LABEL[s]}
            </span>
          ))}
          <span style={{ color: '#333', fontSize: 10, margin: '0 2px' }}>·</span>
          <span style={{ color: '#444', fontSize: 10 }}>ATTITUDE:</span>
          {SCORE_TIERS.filter(t => isFinite(t.threshold)).map(t => (
            <span key={t.label} style={{ color: t.color, fontSize: 10 }}>
              {t.label}
            </span>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position:      'absolute',
  top:           50,
  right:         16,
  width:         520,
  maxHeight:     'calc(100vh - 70px)',
  background:    'rgba(5,5,18,0.96)',
  border:        '1px solid rgba(255,255,255,0.15)',
  borderRadius:  8,
  fontFamily:    'monospace',
  color:         '#ddd',
  pointerEvents: 'auto',
  zIndex:        20,
  display:       'flex',
  flexDirection: 'column',
  fontSize:      12,
}

const headerStyle: React.CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'space-between',
  padding:         '10px 14px',
  borderBottom:    '1px solid rgba(255,255,255,0.1)',
  flexShrink:      0,
}

const titleStyle: React.CSSProperties = {
  fontSize:      14,
  fontWeight:    700,
  color:         '#aad4ff',
  letterSpacing: '0.05em',
}

const closeBtnStyle: React.CSSProperties = {
  background:  'none',
  border:      'none',
  color:       '#666',
  fontSize:    20,
  cursor:      'pointer',
  padding:     '0 4px',
  lineHeight:  1,
}

const scrollBodyStyle: React.CSSProperties = {
  overflowY:     'auto',
  flex:          1,
  padding:       '12px 14px',
  display:       'flex',
  flexDirection: 'column',
  gap:           16,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize:      10,
  color:         '#556',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom:  8,
}

const tableStyle: React.CSSProperties = {
  width:           '100%',
  borderCollapse:  'collapse',
}

const thStyle: React.CSSProperties = {
  textAlign:    'left',
  padding:      '3px 8px',
  color:        '#555',
  fontSize:     10,
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontWeight:   400,
}

const tdStyle: React.CSSProperties = {
  padding:       '5px 8px',
  verticalAlign: 'middle',
}

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}

const actionRowStyle: React.CSSProperties = {
  display:  'flex',
  flexWrap: 'wrap',
  gap:      6,
}

const actionBtnStyle: React.CSSProperties = {
  padding:      '4px 10px',
  fontSize:     11,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  color:        '#ccc',
  cursor:       'pointer',
}

const warBtnStyle: React.CSSProperties = {
  background: 'rgba(238,85,85,0.15)',
  border:     '1px solid rgba(238,85,85,0.4)',
  color:      '#ee5555',
}

const peaceBtnStyle: React.CSSProperties = {
  background: 'rgba(68,238,136,0.15)',
  border:     '1px solid rgba(68,238,136,0.4)',
  color:      '#44ee88',
}

const bordersBtnStyle: React.CSSProperties = {
  background: 'rgba(85,170,238,0.15)',
  border:     '1px solid rgba(85,170,238,0.4)',
  color:      '#55aaee',
}

const allianceBtnStyle: React.CSSProperties = {
  background: 'rgba(238,187,68,0.15)',
  border:     '1px solid rgba(238,187,68,0.4)',
  color:      '#eebb44',
}

const aiMatrixStyle: React.CSSProperties = {
  display:  'flex',
  flexWrap: 'wrap',
  gap:      4,
}

const matrixCellStyle: React.CSSProperties = {
  fontSize:     9,
  padding:      '2px 6px',
  border:       '1px solid',
  borderRadius: 3,
  opacity:      0.75,
}

const eventsListStyle: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           3,
}

const eventRowStyle: React.CSSProperties = {
  fontSize:    11,
  display:     'flex',
  alignItems:  'center',
  flexWrap:    'wrap',
  gap:         5,
  padding:     '2px 0',
  borderBottom:'1px solid rgba(255,255,255,0.04)',
}

const legendStyle: React.CSSProperties = {
  display:    'flex',
  flexWrap:   'wrap',
  gap:        8,
  paddingTop: 8,
  borderTop:  '1px solid rgba(255,255,255,0.06)',
}

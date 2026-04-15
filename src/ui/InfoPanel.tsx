import React from 'react'
import { useGameStore } from './store'
import type { ActionId } from '../shared/types'

const civName = (id: number) => ['', 'Blue', 'Red', 'Green', 'Yellow'][id] ?? `Civ ${id}`

function hexColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

export function InfoPanel(): React.ReactElement | null {
  const tile             = useGameStore(s => s.selectedTile)
  const unit             = useGameStore(s => s.selectedUnit)
  const civColors        = useGameStore(s => s.civColors)
  const availableActions = useGameStore(s => s.availableActions)
  const performActionFn  = useGameStore(s => s.performActionFn)
  const isHumanTurn      = useGameStore(s => s.currentPlayer?.isHuman ?? false)
  const activeCityKey    = useGameStore(s => s.activeCityKey)

  if (!tile && !unit) return null
  if (unit && activeCityKey !== null) return null

  return (
    <div style={panelStyle}>
      {tile && (
        <section>
          <header style={headerStyle}>Tile ({tile.x}, {tile.y})</header>
          <Row label="Terrain"     value={tile.terrain} />
          {tile.feature     !== 'None'    && <Row label="Feature"     value={tile.feature} />}
          {tile.resource    !== 'None'    && <Row label="Resource"    value={tile.resource} />}
          {tile.improvement !== 'None'    && <Row label="Improvement" value={tile.improvement} />}
          <div style={divider} />
          <Row label="Food"       value={tile.food}       />
          <Row label="Production" value={tile.production} />
          <Row label="Commerce"   value={tile.commerce}   />
          {tile.defense > 0       && <Row label="Defense"     value={`+${tile.defense}%`} />}
          {tile.hasFreshWater     && <Row label="Fresh Water"  value="Yes" />}
        </section>
      )}

      {unit && (
        <section style={tile ? { marginTop: 12 } : {}}>
          <header style={headerStyle}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: hexColor(civColors[unit.civ] ?? 0x888888),
                marginRight: 6,
                verticalAlign: 'middle',
              }}
            />
            {unit.name} ({civName(unit.civ)})
          </header>
          <Row label="Tile"     value={`(${unit.x}, ${unit.y})`} />
          <Row label="HP"       value={`${unit.hp}/100`}         />
          <Row label="Strength" value={unit.strength}            />
          <Row label="Moves"    value={unit.movesLeft}           />

          {isHumanTurn && availableActions.length > 0 && (
            <div style={actionsRowStyle}>
              {availableActions.map(a => (
                <button
                  key={a.id}
                  style={actionBtnStyle}
                  onClick={() => performActionFn?.(a.id as ActionId)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position:        'absolute',
  bottom:          16,
  left:            16,
  minWidth:        220,
  background:      'rgba(10,10,24,0.88)',
  border:          '1px solid rgba(255,255,255,0.15)',
  borderRadius:    8,
  padding:         '12px 16px',
  color:           '#e8e8e8',
  fontFamily:      'monospace',
  fontSize:        13,
  pointerEvents:   'auto',
  backdropFilter:  'blur(6px)',
  boxShadow:       '0 4px 20px rgba(0,0,0,0.5)',
}

const headerStyle: React.CSSProperties = {
  fontWeight:   700,
  fontSize:     14,
  color:        '#aad4ff',
  marginBottom: 6,
  letterSpacing: '0.03em',
}

const rowStyle: React.CSSProperties = {
  display:       'flex',
  justifyContent:'space-between',
  gap:           16,
  marginBottom:  2,
}

const labelStyle: React.CSSProperties = {
  color:  'rgba(255,255,255,0.55)',
}

const valueStyle: React.CSSProperties = {
  color:      '#f0f0f0',
  fontWeight: 500,
}

const divider: React.CSSProperties = {
  height:       1,
  background:   'rgba(255,255,255,0.1)',
  margin:       '6px 0',
}

const actionsRowStyle: React.CSSProperties = {
  display:   'flex',
  flexWrap:  'wrap',
  gap:       6,
  marginTop: 8,
}

const actionBtnStyle: React.CSSProperties = {
  padding:      '3px 10px',
  fontSize:     11,
  fontFamily:   'monospace',
  background:   'rgba(34,102,204,0.25)',
  border:       '1px solid rgba(68,170,255,0.5)',
  borderRadius: 4,
  color:        '#88ccff',
  cursor:       'pointer',
}

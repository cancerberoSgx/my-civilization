import React from 'react'
import { useGameStore } from './store'

export function CombatOddsTooltip(): React.ReactElement | null {
  const tooltip = useGameStore(s => s.combatOddsTooltip)
  if (!tooltip) return null

  const pct = Math.round(tooltip.pct * 100)

  // Color shifts from red (low) to green (high)
  const r = Math.round(255 * (1 - tooltip.pct))
  const g = Math.round(255 * tooltip.pct)
  const color = `rgb(${r},${g},60)`

  return (
    <div style={{
      position:       'absolute',
      left:           tooltip.x + 14,
      top:            tooltip.y - 32,
      background:     'rgba(5,5,18,0.92)',
      border:         `1px solid ${color}`,
      borderRadius:   5,
      padding:        '4px 10px',
      fontFamily:     'monospace',
      fontSize:       13,
      color:          color,
      fontWeight:     700,
      pointerEvents:  'none',
      boxShadow:      `0 0 8px rgba(${r},${g},60,0.4)`,
      whiteSpace:     'nowrap',
      zIndex:         50,
    }}>
      {pct}% win
    </div>
  )
}

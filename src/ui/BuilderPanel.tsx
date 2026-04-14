import React from 'react'
import { useGameStore } from './store'
import { TERRAIN_DEFS } from '../data/terrains'
import { RESOURCE_DEFS } from '../data/resources'
import { IMPROVEMENT_DEFS } from '../data/improvements'
import { UNIT_DEFS } from '../data/units'
import { ResourceType, ImprovementType } from '../shared/types'

type Tab = 'unit' | 'terrain' | 'resource' | 'improvement'

const TAB_LABELS: Record<Tab, string> = {
  unit:        'Units',
  terrain:     'Terrain',
  resource:    'Resources',
  improvement: 'Improve',
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function BuilderPanel(): React.ReactElement | null {
  const builderMode       = useGameStore(s => s.builderMode)
  const gameConfig        = useGameStore(s => s.gameConfig)
  const tab               = useGameStore(s => s.builderTab)
  const civId             = useGameStore(s => s.builderCivId)
  const unitTypeId        = useGameStore(s => s.builderUnitTypeId)
  const terrainType       = useGameStore(s => s.builderTerrainType)
  const resourceType      = useGameStore(s => s.builderResourceType)
  const improvementType   = useGameStore(s => s.builderImprovementType)
  const setTab            = useGameStore(s => s.setBuilderTab)
  const setCivId          = useGameStore(s => s.setBuilderCivId)
  const setUnitTypeId     = useGameStore(s => s.setBuilderUnitTypeId)
  const setTerrainType    = useGameStore(s => s.setBuilderTerrainType)
  const setResourceType   = useGameStore(s => s.setBuilderResourceType)
  const setImprovementType = useGameStore(s => s.setBuilderImprovementType)
  const toggleBuilderMode = useGameStore(s => s.toggleBuilderMode)

  if (!builderMode || !gameConfig) return null

  const { numCivs, civColors } = gameConfig

  // Current action description
  let actionDesc: React.ReactNode = null
  if (tab === 'unit') {
    const unitName = UNIT_DEFS.find(u => u.id === unitTypeId)?.name ?? '?'
    const civName  = civId === 1 ? 'Player 1' : `AI ${civId - 1}`
    actionDesc = <>Place <b>{unitName}</b> for {civName}</>
  } else if (tab === 'terrain') {
    const name = TERRAIN_DEFS.find(t => t.id === terrainType)?.name ?? '?'
    actionDesc = <>Set terrain: <b>{name}</b></>
  } else if (tab === 'resource') {
    actionDesc = resourceType === ResourceType.None
      ? 'Clear resource'
      : <>Add <b>{RESOURCE_DEFS.find(r => r.id === resourceType)?.name}</b></>
  } else {
    actionDesc = improvementType === ImprovementType.None
      ? 'Clear improvement'
      : <>Add <b>{IMPROVEMENT_DEFS.find(i => i.id === improvementType)?.name}</b></>
  }

  return (
    <div style={panelStyle}>
      <div style={panelHeader}>Game Builder</div>

      {/* Tab bar */}
      <div style={tabRow}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            style={{ ...tabBtn, ...(tab === t ? tabBtnActive : {}) }}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={tabContent}>

        {/* ── Units ── */}
        {tab === 'unit' && <>
          <div style={sectionLabel}>Player</div>
          <div style={civRow}>
            {Array.from({ length: numCivs }, (_, i) => {
              const cid   = i + 1
              const color = civColors[cid] ?? 0x888888
              return (
                <button
                  key={cid}
                  title={cid === 1 ? 'Player 1' : `AI ${i}`}
                  style={{
                    ...civDot,
                    background: hex(color),
                    outline: civId === cid ? `2px solid #fff` : '2px solid transparent',
                    outlineOffset: 2,
                  }}
                  onClick={() => setCivId(cid)}
                />
              )
            })}
          </div>

          <div style={sectionLabel}>Unit Type</div>
          {UNIT_DEFS.map(def => (
            <button
              key={def.id}
              style={{ ...itemBtn, ...(unitTypeId === def.id ? itemBtnActive : {}) }}
              onClick={() => setUnitTypeId(def.id)}
            >
              {def.name}
              <span style={statBadge}>str {def.strength}</span>
            </button>
          ))}
        </>}

        {/* ── Terrain ── */}
        {tab === 'terrain' && <>
          <div style={sectionLabel}>Terrain Type</div>
          {TERRAIN_DEFS.map(def => (
            <button
              key={def.id}
              style={{ ...itemBtn, ...(terrainType === def.id ? itemBtnActive : {}) }}
              onClick={() => setTerrainType(def.id)}
            >
              <span style={{ ...swatch, background: hex(def.color) }} />
              {def.name}
            </button>
          ))}
        </>}

        {/* ── Resources ── */}
        {tab === 'resource' && <>
          <div style={sectionLabel}>Resource</div>
          <button
            style={{ ...itemBtn, ...(resourceType === ResourceType.None ? itemBtnActive : {}) }}
            onClick={() => setResourceType(ResourceType.None)}
          >
            <span style={{ ...swatch, background: '#333', border: '1px solid #666' }} />
            Clear
          </button>
          {RESOURCE_DEFS.map(def => (
            <button
              key={def.id}
              style={{ ...itemBtn, ...(resourceType === def.id ? itemBtnActive : {}) }}
              onClick={() => setResourceType(def.id)}
            >
              <span style={{ ...swatch, background: hex(def.color) }} />
              {def.name}
            </button>
          ))}
        </>}

        {/* ── Improvements ── */}
        {tab === 'improvement' && <>
          <div style={sectionLabel}>Improvement</div>
          <button
            style={{ ...itemBtn, ...(improvementType === ImprovementType.None ? itemBtnActive : {}) }}
            onClick={() => setImprovementType(ImprovementType.None)}
          >
            <span style={{ ...swatch, background: '#333', border: '1px solid #666' }} />
            Clear
          </button>
          {IMPROVEMENT_DEFS.map(def => (
            <button
              key={def.id}
              style={{ ...itemBtn, ...(improvementType === def.id ? itemBtnActive : {}) }}
              onClick={() => setImprovementType(def.id)}
            >
              <span style={{ ...swatch, background: hex(def.color) }} />
              {def.name}
            </button>
          ))}
        </>}

      </div>

      {/* Action status */}
      <div style={statusBar}>{actionDesc}</div>

      {/* Exit */}
      <button style={exitBtn} onClick={toggleBuilderMode}>
        ← Exit Builder
      </button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position:    'absolute',
  top:         40,
  right:       0,
  width:       210,
  maxHeight:   'calc(100vh - 56px)',
  overflowY:   'auto',
  background:  'rgba(5,5,22,0.96)',
  borderLeft:  '1px solid rgba(255,255,255,0.14)',
  borderBottom:'1px solid rgba(255,255,255,0.14)',
  borderBottomLeftRadius: 6,
  fontFamily:  'monospace',
  color:       '#ddd',
  fontSize:    12,
  pointerEvents: 'auto',
  zIndex:      30,
  display:     'flex',
  flexDirection:'column',
}

const panelHeader: React.CSSProperties = {
  padding:     '7px 12px 6px',
  fontSize:    12,
  fontWeight:  700,
  color:       '#aad4ff',
  letterSpacing: '0.06em',
  borderBottom:'1px solid rgba(255,255,255,0.1)',
  flexShrink:  0,
}

const tabRow: React.CSSProperties = {
  display:    'flex',
  borderBottom:'1px solid rgba(255,255,255,0.1)',
  flexShrink: 0,
}

const tabBtn: React.CSSProperties = {
  flex:        1,
  padding:     '5px 0',
  fontSize:    11,
  fontFamily:  'monospace',
  background:  'transparent',
  border:      'none',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  color:       '#888',
  cursor:      'pointer',
}

const tabBtnActive: React.CSSProperties = {
  color:       '#aad4ff',
  background:  'rgba(34,102,204,0.18)',
  borderBottom:'2px solid #4488cc',
}

const tabContent: React.CSSProperties = {
  padding:   '8px 10px',
  flexGrow:  1,
  overflowY: 'auto',
}

const sectionLabel: React.CSSProperties = {
  fontSize:     10,
  color:        '#666',
  letterSpacing:'0.08em',
  textTransform:'uppercase',
  marginBottom: 5,
  marginTop:    6,
}

const civRow: React.CSSProperties = {
  display:    'flex',
  flexWrap:   'wrap',
  gap:        6,
  marginBottom: 10,
}

const civDot: React.CSSProperties = {
  width:        20,
  height:       20,
  borderRadius: '50%',
  border:       'none',
  cursor:       'pointer',
  padding:      0,
}

const itemBtn: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  gap:          7,
  width:        '100%',
  padding:      '4px 8px',
  marginBottom: 3,
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.04)',
  border:       '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  color:        '#ccc',
  cursor:       'pointer',
  textAlign:    'left',
}

const itemBtnActive: React.CSSProperties = {
  background: 'rgba(34,102,204,0.28)',
  border:     '1px solid rgba(68,150,255,0.55)',
  color:      '#aad4ff',
}

const swatch: React.CSSProperties = {
  display:      'inline-block',
  width:        10,
  height:       10,
  borderRadius: 2,
  flexShrink:   0,
}

const statBadge: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize:   10,
  color:      '#666',
}

const statusBar: React.CSSProperties = {
  padding:     '5px 10px',
  fontSize:    11,
  color:       '#aaa',
  borderTop:   '1px solid rgba(255,255,255,0.08)',
  background:  'rgba(0,0,0,0.2)',
  flexShrink:  0,
  minHeight:   26,
}

const exitBtn: React.CSSProperties = {
  margin:       '0',
  padding:      '7px 12px',
  fontSize:     12,
  fontFamily:   'monospace',
  fontWeight:   700,
  background:   'rgba(180,40,40,0.2)',
  border:       'none',
  borderTop:    '1px solid rgba(255,80,80,0.25)',
  color:        '#ff9090',
  cursor:       'pointer',
  letterSpacing:'0.04em',
  flexShrink:   0,
}

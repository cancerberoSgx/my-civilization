import React, { useEffect, useState } from 'react'
import { useGameStore } from './store'
import { TILE_STRIDE, TILE_TERRAIN } from '../shared/constants'
import { TerrainType } from '../shared/types'
import { TERRAIN_MAP } from '../data/terrains'
import { calculateCityYields, getSpecialistYield } from '../game/city/yields'
import {
  assignCitizenToTile,
  unassignCitizen,
  assignSpecialist,
  unassignSpecialist,
  addToProductionQueue,
  removeFromQueue,
  reorderQueue,
} from '../game/city/actions'
import { getBuildingDef, BUILDING_MAP, UNIT_DEF_MAP } from '../game/city/definitions'
import { SpecialistType } from '../game/city/types'
import type {
  City,
  CityId,
  TileYield,
  WorkedTile,
  CitizenAssignment,
  BuildingId,
} from '../game/city/types'

// ── Tile yield helper ─────────────────────────────────────────────────────────

function getTileYield(
  tileBuffer: SharedArrayBuffer,
  tx: number,
  ty: number,
  mapWidth: number,
): TileYield {
  const view    = new DataView(tileBuffer)
  const offset  = (ty * mapWidth + tx) * TILE_STRIDE
  const terrain = view.getUint8(offset + TILE_TERRAIN) as TerrainType
  const def     = TERRAIN_MAP.get(terrain) ?? TERRAIN_MAP.get(TerrainType.Grassland)!
  return { food: def.food, production: def.production, commerce: def.commerce }
}

function terrainColor(tileBuffer: SharedArrayBuffer, tx: number, ty: number, mapWidth: number): string {
  const view    = new DataView(tileBuffer)
  const offset  = (ty * mapWidth + tx) * TILE_STRIDE
  const terrain = view.getUint8(offset + TILE_TERRAIN) as TerrainType
  const color   = TERRAIN_MAP.get(terrain)?.color ?? 0x333344
  return '#' + color.toString(16).padStart(6, '0')
}

function makeDefaultCity(tx: number, ty: number, mapWidth: number, mapHeight: number): City {
  const cultureBorderTiles: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const bx = tx + dx, by = ty + dy
      if (bx >= 0 && bx < mapWidth && by >= 0 && by < mapHeight) {
        cultureBorderTiles.push(by * mapWidth + bx)
      }
    }
  }
  return {
    id:          `city-${tx}-${ty}` as CityId,
    name:        'City',
    ownerId:     1,
    foundedTurn: 0,
    x: tx, y: ty,
    population:  1,
    storedFood:  0,
    citizenAssignments: [
      { kind: 'specialist', specialistType: SpecialistType.Scientist },
    ],
    productionQueue:    [],
    builtBuildings:     [],
    greatPersonPool:    { points: 0, greatPeopleBorn: 0, sources: {} },
    health:             5,
    happiness:          5,
    storedCulture:      0,
    cultureBorderTiles,
  }
}

// ── Specialist label helpers ───────────────────────────────────────────────────

const SPECIALIST_LABELS: Record<SpecialistType, string> = {
  [SpecialistType.Scientist]: 'Scientist',
  [SpecialistType.Merchant]:  'Merchant',
  [SpecialistType.Engineer]:  'Engineer',
  [SpecialistType.Artist]:    'Artist',
  [SpecialistType.Priest]:    'Priest',
}

const ALL_SPECIALIST_TYPES: SpecialistType[] = [
  SpecialistType.Scientist,
  SpecialistType.Merchant,
  SpecialistType.Engineer,
  SpecialistType.Artist,
  SpecialistType.Priest,
]

// ── Component ─────────────────────────────────────────────────────────────────

export function CityModal(): React.ReactElement | null {
  const activeCityKey  = useGameStore(s => s.activeCityKey)
  const cities         = useGameStore(s => s.cities)
  const closeCity      = useGameStore(s => s.closeCity)
  const updateCity     = useGameStore(s => s.updateCity)
  const tileBuffer     = useGameStore(s => s.tileBuffer)
  const gameConfig     = useGameStore(s => s.gameConfig)
  const commerceRates  = useGameStore(s => s.commerceRates)

  const [addBuildingId, setAddBuildingId] = useState<BuildingId | ''>('')
  const [addUnitTypeId, setAddUnitTypeId] = useState<number>(-1)
  const [hoveredTileKey, setHoveredTileKey] = useState<number | null>(null)

  // Close on Escape
  useEffect(() => {
    if (!activeCityKey) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCity()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeCityKey, closeCity])

  if (!activeCityKey || !tileBuffer || !gameConfig) return null

  // Parse city position from key "x,y"
  const [cx, cy] = activeCityKey.split(',').map(Number)
  if (isNaN(cx) || isNaN(cy)) return null

  // Ensure city exists in store — create default if predates tracking
  let city = cities.get(activeCityKey)
  if (!city) {
    const defaultCity = makeDefaultCity(cx, cy, gameConfig.mapWidth, gameConfig.mapHeight)
    updateCity(activeCityKey, defaultCity)
    return null  // re-render will pick up the created city
  }

  const mapWidth  = gameConfig.mapWidth
  const mapHeight = gameConfig.mapHeight

  // ── Derived data ───────────────────────────────────────────────────────────

  const centerYields = getTileYield(tileBuffer, city.x, city.y, mapWidth)

  const workedTiles: WorkedTile[] = city.citizenAssignments
    .filter((a): a is Extract<CitizenAssignment, { kind: 'tile' }> => a.kind === 'tile')
    .map(a => {
      const tx = a.tileKey % mapWidth
      const ty = Math.floor(a.tileKey / mapWidth)
      return { tileKey: a.tileKey, yields: getTileYield(tileBuffer, tx, ty, mapWidth) }
    })

  const buildings     = city.builtBuildings.map(id => getBuildingDef(id))
  const cityYields    = calculateCityYields(city, centerYields, workedTiles, buildings, commerceRates)
  const foodThreshold = 20 + 10 * city.population
  const netFood       = cityYields.food - 2 * city.population
  const turnsToGrowth = netFood > 0
    ? Math.ceil((foodThreshold - city.storedFood) / netFood)
    : null

  // ── Building / unit add-queue options ─────────────────────────────────────

  const availableBuildings = [...BUILDING_MAP.values()].filter(b => {
    if (city!.builtBuildings.includes(b.id)) return false
    if (city!.productionQueue.some(q => q.kind === 'building' && q.buildingId === b.id)) return false
    return b.prerequisites.buildings.every(req => city!.builtBuildings.includes(req))
  })

  const allUnits = [...UNIT_DEF_MAP.values()]

  // activeCityKey is guaranteed non-null past the guard above
  const cityKey: string = activeCityKey

  // ── Action helpers ─────────────────────────────────────────────────────────

  function update(next: City) { updateCity(cityKey, next) }

  function handleTileClick(tileKey: number) {
    const isWorked       = city!.citizenAssignments.some(a => a.kind === 'tile' && a.tileKey === tileKey)
    const hasFreeCitizen = city!.citizenAssignments.some(a => a.kind === 'specialist')
    if (isWorked) {
      update(unassignCitizen(city!, tileKey))
    } else if (hasFreeCitizen) {
      update(assignCitizenToTile(city!, tileKey))
    }
  }

  function handleAddBuilding() {
    if (!addBuildingId) return
    update(addToProductionQueue(city!, {
      kind: 'building', buildingId: addBuildingId as BuildingId, accumulatedHammers: 0,
    }))
    setAddBuildingId('')
  }

  function handleAddUnit() {
    if (addUnitTypeId < 0) return
    update(addToProductionQueue(city!, {
      kind: 'unit', unitTypeId: addUnitTypeId, accumulatedHammers: 0,
    }))
    setAddUnitTypeId(-1)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>

        {/* ── Title bar ─────────────────────────────────────────────────────── */}
        <div style={titleBarStyle}>
          <span style={cityNameStyle}>{city.name}</span>
          <span style={titleStatsStyle}>
            Pop: <b>{city.population}</b>
            {' '}·{' '}
            ❤ <b>{city.health}</b>
            {' '}·{' '}
            ☺ <b>{city.happiness}</b>
            {' '}·{' '}
            ({city.x}, {city.y})
          </span>
          <button style={closeBtnStyle} onClick={closeCity}>✕</button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div style={bodyStyle}>

          {/* ── Left column: tile map ──────────────────────────────────────── */}
          <div>
            <div style={sectionLabelStyle}>TILE MAP</div>
            <div style={tileGridStyle}>
              {Array.from({ length: 5 }, (_, row) =>
                Array.from({ length: 5 }, (_, col) => {
                  const dx = col - 2
                  const dy = row - 2
                  const tx = city!.x + dx
                  const ty = city!.y + dy

                  const outOfBounds = tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight
                  const isCenter    = dx === 0 && dy === 0
                  const tileKey     = ty * mapWidth + tx

                  if (outOfBounds) {
                    return <div key={`${row}-${col}`} style={emptyTileCellStyle} />
                  }

                  const inBorder   = isCenter || city!.cultureBorderTiles.includes(tileKey)
                  const isWorked   = city!.citizenAssignments.some(a => a.kind === 'tile' && a.tileKey === tileKey)
                  const isHovered  = hoveredTileKey === tileKey && inBorder && !isCenter
                  const tileYield  = getTileYield(tileBuffer!, tx, ty, mapWidth)
                  const bgColor    = terrainColor(tileBuffer!, tx, ty, mapWidth)

                  const cellStyle: React.CSSProperties = {
                    ...tileCellBase,
                    background:   bgColor,
                    opacity:      inBorder ? 1 : 0.3,
                    cursor:       inBorder && !isCenter ? 'pointer' : 'default',
                    border:       isCenter
                      ? '2px solid #ffd700'
                      : isWorked
                        ? '2px solid rgba(60,200,80,0.8)'
                        : '1px solid rgba(0,0,0,0.4)',
                    boxShadow:    isHovered ? 'inset 0 0 0 2px rgba(255,255,255,0.4)' : undefined,
                    position:     'relative',
                  }

                  return (
                    <div
                      key={`${row}-${col}`}
                      style={cellStyle}
                      onClick={() => inBorder && !isCenter && handleTileClick(tileKey)}
                      onMouseEnter={() => setHoveredTileKey(tileKey)}
                      onMouseLeave={() => setHoveredTileKey(null)}
                    >
                      {isCenter && (
                        <span style={centerStarStyle}>★</span>
                      )}
                      {isWorked && !isCenter && (
                        <span style={workerDotStyle}>●</span>
                      )}
                      <div style={tileYieldLabelStyle}>
                        {tileYield.food > 0       && <span style={{ color: '#6ecf6e' }}>🌾{tileYield.food}</span>}
                        {tileYield.production > 0 && <span style={{ color: '#e8a040' }}>⚒{tileYield.production}</span>}
                        {tileYield.commerce > 0   && <span style={{ color: '#e0d060' }}>💰{tileYield.commerce}</span>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Citizen summary */}
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {city.citizenAssignments.filter(a => a.kind === 'tile').length} on tiles
              {' · '}
              {city.citizenAssignments.filter(a => a.kind === 'specialist').length} specialists
            </div>
          </div>

          {/* ── Right column: production ───────────────────────────────────── */}
          <div>
            <div style={sectionLabelStyle}>PRODUCTION</div>

            {city.productionQueue.length === 0 ? (
              <div style={mutedStyle}>Nothing in queue.</div>
            ) : (
              <>
                {/* Current item */}
                {(() => {
                  const head = city.productionQueue[0]!
                  const def  = head.kind === 'building'
                    ? getBuildingDef(head.buildingId)
                    : UNIT_DEF_MAP.get(head.unitTypeId)
                  const cost = def?.cost ?? 1
                  const pct  = Math.min(100, Math.round(head.accumulatedHammers / cost * 100))
                  const remaining = cost - head.accumulatedHammers
                  const turns = cityYields.production > 0
                    ? Math.ceil(remaining / cityYields.production)
                    : null
                  return (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e0', marginBottom: 4 }}>
                        {def?.name ?? '?'}
                      </div>
                      <div style={progressTrackStyle}>
                        <div style={{ ...progressFillStyle, width: `${pct}%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{head.accumulatedHammers} / {cost} ⚒</span>
                        {turns !== null && <span>~{turns} turns</span>}
                      </div>
                    </div>
                  )
                })()}

                {/* Queue tail */}
                {city.productionQueue.slice(1).map((item, i) => {
                  const idx = i + 1
                  const def = item.kind === 'building'
                    ? getBuildingDef(item.buildingId)
                    : UNIT_DEF_MAP.get(item.unitTypeId)
                  return (
                    <div key={idx} style={queueRowStyle}>
                      <span style={{ flex: 1, fontSize: 12 }}>{def?.name ?? '?'}</span>
                      <span style={mutedStyle}>{def?.cost ?? '?'}⚒</span>
                      <button
                        style={queueBtnStyle}
                        disabled={idx === 1}
                        onClick={() => update(reorderQueue(city!, idx, idx - 1))}
                      >↑</button>
                      <button
                        style={queueBtnStyle}
                        disabled={idx === city!.productionQueue.length - 1}
                        onClick={() => update(reorderQueue(city!, idx, idx + 1))}
                      >↓</button>
                      <button
                        style={{ ...queueBtnStyle, color: '#e86060' }}
                        onClick={() => update(removeFromQueue(city!, idx))}
                      >✕</button>
                    </div>
                  )
                })}
              </>
            )}

            {/* Remove head */}
            {city.productionQueue.length > 0 && (
              <button
                style={{ ...addBtnStyle, marginTop: 4, color: '#e86060', borderColor: 'rgba(232,96,96,0.4)' }}
                onClick={() => update(removeFromQueue(city!, 0))}
              >
                Remove current
              </button>
            )}

            {/* Add building */}
            <div style={addRowStyle}>
              <select
                style={selectStyle}
                value={addBuildingId}
                onChange={e => setAddBuildingId(e.target.value as BuildingId | '')}
              >
                <option value=''>+ Building…</option>
                {availableBuildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.cost}⚒)</option>
                ))}
              </select>
              <button style={addBtnStyle} onClick={handleAddBuilding} disabled={!addBuildingId}>
                Add
              </button>
            </div>

            {/* Add unit */}
            <div style={addRowStyle}>
              <select
                style={selectStyle}
                value={addUnitTypeId}
                onChange={e => setAddUnitTypeId(Number(e.target.value))}
              >
                <option value={-1}>+ Unit…</option>
                {allUnits.map(u => {
                  const prereqsMet = u.prerequisites.buildings.every(
                    req => city!.builtBuildings.includes(req),
                  )
                  const missing = u.prerequisites.buildings
                    .filter(req => !city!.builtBuildings.includes(req))
                    .map(req => getBuildingDef(req).name)
                    .join(', ')
                  return (
                    <option key={u.typeId} value={u.typeId} disabled={!prereqsMet}>
                      {u.name} ({u.cost}⚒){!prereqsMet ? ` — needs ${missing}` : ''}
                    </option>
                  )
                })}
              </select>
              <button style={addBtnStyle} onClick={handleAddUnit} disabled={addUnitTypeId < 0}>
                Add
              </button>
            </div>
          </div>
        </div>

        {/* ── Yields bar (full width) ────────────────────────────────────────── */}
        <div style={yieldsBarStyle}>
          <span style={{ color: '#6ecf6e'  }}>🌾 {cityYields.food}</span>
          <span style={{ color: '#e8a040'  }}>⚒ {cityYields.production}</span>
          <span style={{ color: '#e0d060'  }}>💰 {cityYields.commerce}</span>
          <span style={{ color: '#6eb0e8'  }}>🔬 {cityYields.science}</span>
          <span style={{ color: '#f0c040'  }}>🪙 {cityYields.gold}</span>
          <span style={{ color: '#c080f0'  }}>🎨 {cityYields.culture}</span>
          {cityYields.gpp > 0 && (
            <span style={{ color: '#e0e0e0' }}>✨ {cityYields.gpp} GPP</span>
          )}
        </div>

        {/* ── Food growth bar ────────────────────────────────────────────────── */}
        <div style={foodSectionStyle}>
          <span style={sectionLabelStyle}>FOOD</span>
          <div style={progressTrackStyle}>
            <div style={{
              ...progressFillStyle,
              background: '#6ecf6e',
              width: `${Math.min(100, Math.round(city.storedFood / foodThreshold * 100))}%`,
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3, display: 'flex', gap: 12 }}>
            <span>{city.storedFood} / {foodThreshold}</span>
            <span style={{ color: netFood >= 0 ? '#6ecf6e' : '#e86060' }}>
              net {netFood >= 0 ? '+' : ''}{netFood}/turn
            </span>
            {turnsToGrowth !== null && (
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>~{turnsToGrowth} turns to grow</span>
            )}
            {netFood < 0 && (
              <span style={{ color: '#e86060' }}>⚠ starvation</span>
            )}
          </div>
        </div>

        {/* ── Specialists ────────────────────────────────────────────────────── */}
        {(() => {
          const rows = ALL_SPECIALIST_TYPES.map(type => {
            const count    = city!.citizenAssignments.filter(a => a.kind === 'specialist' && a.specialistType === type).length
            const maxSlots = buildings.reduce((n, b) => n + (b.specialistSlots.find(s => s.type === type)?.count ?? 0), 0)
            if (maxSlots === 0 && count === 0) return null
            const sy       = getSpecialistYield(type)
            const hints: string[] = []
            if (sy.science    > 0) hints.push(`+${sy.science}🔬`)
            if (sy.gold       > 0) hints.push(`+${sy.gold}🪙`)
            if (sy.production > 0) hints.push(`+${sy.production}⚒`)
            if (sy.culture    > 0) hints.push(`+${sy.culture}🎨`)
            if (sy.gpp        > 0) hints.push(`+${sy.gpp}✨`)
            return (
              <div key={type} style={specialistRowStyle}>
                <span style={{ minWidth: 80 }}>{SPECIALIST_LABELS[type]}</span>
                <span style={mutedStyle}>{hints.join(' ')}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    style={specBtnStyle}
                    disabled={count === 0}
                    onClick={() => update(unassignSpecialist(city!, type))}
                  >−</button>
                  <span style={{ minWidth: 40, textAlign: 'center', fontSize: 12 }}>
                    {count}/{maxSlots}
                  </span>
                  <button
                    style={specBtnStyle}
                    disabled={count >= maxSlots}
                    onClick={() => update(assignSpecialist(city!, type, buildings))}
                  >+</button>
                </div>
              </div>
            )
          }).filter(Boolean)

          if (rows.length === 0) return null
          return (
            <div style={fullWidthSectionStyle}>
              <div style={sectionLabelStyle}>SPECIALISTS</div>
              {rows}
            </div>
          )
        })()}

        {/* Unassigned specialist notice */}
        {(() => {
          const unassigned = city.citizenAssignments.filter(a => a.kind === 'specialist').length
          const totalSlots = ALL_SPECIALIST_TYPES.reduce((sum, type) =>
            sum + buildings.reduce((n, b) => n + (b.specialistSlots.find(s => s.type === type)?.count ?? 0), 0), 0)
          if (unassigned > 0 && totalSlots === 0) {
            return (
              <div style={{ ...fullWidthSectionStyle, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                Unassigned citizens: {unassigned} — Build Library / Market / Forge to unlock specialist slots.
              </div>
            )
          }
          return null
        })()}

        {/* ── Buildings ──────────────────────────────────────────────────────── */}
        <div style={fullWidthSectionStyle}>
          <div style={sectionLabelStyle}>BUILDINGS</div>
          {city.builtBuildings.length === 0 ? (
            <span style={mutedStyle}>No buildings yet.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {city.builtBuildings.map(id => {
                const def    = getBuildingDef(id)
                const tips: string[] = [`${def.cost}⚒ · ${def.maintenance}g/turn`]
                Object.entries(def.percentYields).forEach(([k, v]) => {
                  if (v) tips.push(`+${v}% ${k}`)
                })
                def.specialistSlots.forEach(s => tips.push(`${s.count} ${SPECIALIST_LABELS[s.type]} slot${s.count > 1 ? 's' : ''}`))
                if (def.granaryEffect)    tips.push('Granary effect')
                if (def.barracksEffect)   tips.push('Barracks effect')
                if (def.courthouseEffect) tips.push('Courthouse effect')
                if (def.healthBonus > 0)  tips.push(`+${def.healthBonus} health`)
                if (def.happinessBonus > 0) tips.push(`+${def.happinessBonus} happiness`)
                return (
                  <span key={id} style={buildingPillStyle} title={tips.join(' · ')}>
                    {def.name}
                  </span>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position:       'fixed',
  inset:          0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  pointerEvents:  'none',
  zIndex:         50,
}

const panelStyle: React.CSSProperties = {
  pointerEvents:  'auto',
  width:          820,
  maxHeight:      '88vh',
  overflowY:      'auto',
  background:     'rgba(8,8,22,0.97)',
  border:         '1px solid rgba(255,255,255,0.18)',
  borderRadius:   10,
  fontFamily:     'monospace',
  color:          '#e0e0e0',
  fontSize:       13,
  backdropFilter: 'blur(8px)',
  boxShadow:      '0 8px 40px rgba(0,0,0,0.7)',
}

const titleBarStyle: React.CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  gap:           12,
  padding:       '12px 16px 10px',
  borderBottom:  '1px solid rgba(255,255,255,0.1)',
}

const cityNameStyle: React.CSSProperties = {
  fontSize:      16,
  fontWeight:    700,
  color:         '#aad4ff',
  letterSpacing: '0.04em',
}

const titleStatsStyle: React.CSSProperties = {
  fontSize: 12,
  color:    'rgba(255,255,255,0.55)',
}

const closeBtnStyle: React.CSSProperties = {
  marginLeft:   'auto',
  padding:      '3px 10px',
  fontSize:     13,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.08)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#ccc',
  cursor:       'pointer',
}

const bodyStyle: React.CSSProperties = {
  display:               'grid',
  gridTemplateColumns:   '1fr 1fr',
  gap:                   16,
  padding:               '14px 16px 10px',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize:      11,
  fontVariant:   'small-caps',
  color:         'rgba(255,255,255,0.35)',
  letterSpacing: '0.08em',
  marginBottom:  6,
}

const tileGridStyle: React.CSSProperties = {
  display:               'grid',
  gridTemplateColumns:   'repeat(5, 60px)',
  gridTemplateRows:      'repeat(5, 60px)',
  gap:                   2,
}

const tileCellBase: React.CSSProperties = {
  width:         60,
  height:        60,
  borderRadius:  3,
  overflow:      'hidden',
  display:       'flex',
  flexDirection: 'column',
  alignItems:    'center',
  justifyContent:'center',
  userSelect:    'none',
}

const emptyTileCellStyle: React.CSSProperties = {
  ...tileCellBase,
  background: 'rgba(0,0,0,0.3)',
  opacity:    0.15,
}

const centerStarStyle: React.CSSProperties = {
  fontSize:  18,
  color:     '#ffd700',
  textShadow:'0 0 4px rgba(255,215,0,0.7)',
}

const workerDotStyle: React.CSSProperties = {
  position: 'absolute',
  top:      3,
  right:    4,
  fontSize: 10,
  color:    'rgba(60,200,80,0.9)',
  textShadow: '0 0 3px rgba(0,0,0,0.8)',
}

const tileYieldLabelStyle: React.CSSProperties = {
  position:   'absolute',
  bottom:     2,
  left:       0,
  right:      0,
  fontSize:   9,
  textAlign:  'center',
  display:    'flex',
  justifyContent: 'center',
  gap:        2,
  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
}

const progressTrackStyle: React.CSSProperties = {
  width:        '100%',
  height:       8,
  background:   'rgba(255,255,255,0.1)',
  borderRadius: 4,
  overflow:     'hidden',
}

const progressFillStyle: React.CSSProperties = {
  height:       '100%',
  background:   'rgba(255,160,40,0.85)',
  borderRadius: 4,
  transition:   'width 0.2s ease',
}

const queueRowStyle: React.CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         6,
  marginBottom: 4,
  padding:     '3px 0',
  borderBottom:'1px solid rgba(255,255,255,0.05)',
}

const queueBtnStyle: React.CSSProperties = {
  padding:      '1px 6px',
  fontSize:     11,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.15)',
  borderRadius: 3,
  color:        '#ccc',
  cursor:       'pointer',
}

const addRowStyle: React.CSSProperties = {
  display:   'flex',
  gap:       6,
  marginTop: 8,
}

const selectStyle: React.CSSProperties = {
  flex:         1,
  padding:      '4px 6px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(20,20,44,0.95)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#e0e0e0',
  cursor:       'pointer',
}

const addBtnStyle: React.CSSProperties = {
  padding:      '4px 10px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(34,102,204,0.2)',
  border:       '1px solid rgba(68,150,255,0.4)',
  borderRadius: 4,
  color:        '#88ccff',
  cursor:       'pointer',
}

const yieldsBarStyle: React.CSSProperties = {
  display:       'flex',
  gap:           18,
  padding:       '8px 16px',
  borderTop:     '1px solid rgba(255,255,255,0.08)',
  borderBottom:  '1px solid rgba(255,255,255,0.08)',
  fontSize:      13,
  fontWeight:    600,
}

const foodSectionStyle: React.CSSProperties = {
  padding: '8px 16px',
}

const fullWidthSectionStyle: React.CSSProperties = {
  padding:    '8px 16px',
  borderTop:  '1px solid rgba(255,255,255,0.06)',
}

const specialistRowStyle: React.CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         10,
  marginBottom: 4,
  fontSize:    13,
}

const specBtnStyle: React.CSSProperties = {
  width:        24,
  height:       24,
  fontSize:     14,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.08)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#ccc',
  cursor:       'pointer',
  display:      'flex',
  alignItems:   'center',
  justifyContent:'center',
  lineHeight:   1,
}

const mutedStyle: React.CSSProperties = {
  color:    'rgba(255,255,255,0.45)',
  fontSize: 12,
}

const buildingPillStyle: React.CSSProperties = {
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  padding:      '2px 10px',
  fontSize:     12,
  cursor:       'default',
}

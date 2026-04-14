import React, { useState } from 'react'
import { useGameStore } from './store'
import {
  listSaves, saveToLocalStorage, loadFromLocalStorage, deleteSave,
  downloadJson, readJsonFile, defaultSaveName,
} from '../shared/saveFormat'
import type { SaveEntry } from '../shared/saveFormat'

type View = 'main' | 'save' | 'load'

export function FileMenu(): React.ReactElement | null {
  const saveGameFn = useGameStore(s => s.saveGameFn)
  const loadSave   = useGameStore(s => s.loadSave)

  const [open,     setOpen]     = useState(false)
  const [view,     setView]     = useState<View>('main')
  const [saveName, setSaveName] = useState('')
  const [saves,    setSaves]    = useState<SaveEntry[]>([])
  const [status,   setStatus]   = useState('')

  function openMenu() {
    setSaves(listSaves())
    setSaveName(defaultSaveName())
    setView('main')
    setStatus('')
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
    setView('main')
    setStatus('')
  }

  function handleSave() {
    const name = saveName.trim()
    if (!name || !saveGameFn) return
    try {
      const save = saveGameFn(name)
      saveToLocalStorage(save)
      setStatus('Saved!')
      setTimeout(closeMenu, 800)
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`)
    }
  }

  function handleLoad(key: string) {
    const save = loadFromLocalStorage(key)
    if (!save) { setStatus('Save not found'); return }
    closeMenu()
    loadSave(save)
  }

  function handleDelete(key: string) {
    deleteSave(key)
    setSaves(listSaves())
  }

  function handleExport() {
    if (!saveGameFn) return
    try {
      const name = saveName.trim() || defaultSaveName()
      const save = saveGameFn(name)
      downloadJson(save)
      closeMenu()
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`)
    }
  }

  async function handleImport() {
    try {
      const save = await readJsonFile()
      if (save.version !== 1) throw new Error('Unsupported save version')
      closeMenu()
      loadSave(save)
    } catch (e) {
      const msg = (e as Error).message
      if (msg !== 'No file selected') setStatus(`Error: ${msg}`)
    }
  }

  const inGame = saveGameFn !== null

  return (
    <div style={wrapStyle}>
      <button
        style={{ ...btnStyle, ...(open ? btnActiveStyle : {}) }}
        onClick={open ? closeMenu : openMenu}
      >
        File {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={panelStyle}>

          {/* ── Main menu ── */}
          {view === 'main' && (
            <>
              {inGame && (
                <button style={itemStyle} onClick={() => { setView('save'); setStatus('') }}>
                  Save Game
                </button>
              )}
              <button style={itemStyle} onClick={() => { setSaves(listSaves()); setView('load'); setStatus('') }}>
                Load Game
              </button>
              {inGame && (
                <button style={itemStyle} onClick={handleExport}>
                  Export .json
                </button>
              )}
              <button style={itemStyle} onClick={handleImport}>
                Import .json
              </button>
              {status && <div style={statusStyle}>{status}</div>}
            </>
          )}

          {/* ── Save sub-view ── */}
          {view === 'save' && (
            <div style={subViewStyle}>
              <div style={subLabelStyle}>Save name</div>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') closeMenu() }}
                style={inputStyle}
              />
              <div style={rowStyle}>
                <button style={confirmBtnStyle} onClick={handleSave}>Save</button>
                <button style={cancelBtnStyle}  onClick={() => setView('main')}>Cancel</button>
              </div>
              {status && <div style={statusStyle}>{status}</div>}
            </div>
          )}

          {/* ── Load sub-view ── */}
          {view === 'load' && (
            <div>
              <div style={subLabelStyle}>Saved Games</div>
              {saves.length === 0 && (
                <div style={emptySavesStyle}>No saves found</div>
              )}
              <div style={saveListStyle}>
                {saves.map(entry => (
                  <div key={entry.key} style={saveRowStyle}>
                    <div style={saveInfoStyle}>
                      <div style={saveNameStyle}>{entry.name}</div>
                      <div style={saveDateStyle}>{new Date(entry.savedAt).toLocaleString()}</div>
                    </div>
                    <button style={smallBtnStyle}          onClick={() => handleLoad(entry.key)}>Load</button>
                    <button style={{ ...smallBtnStyle, color: '#ff6060' }} onClick={() => handleDelete(entry.key)}>✕</button>
                  </div>
                ))}
              </div>
              <div style={backRowStyle}>
                <button style={cancelBtnStyle} onClick={() => setView('main')}>← Back</button>
              </div>
              {status && <div style={statusStyle}>{status}</div>}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  position: 'relative',
  display:  'inline-block',
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

const btnActiveStyle: React.CSSProperties = {
  background: 'rgba(34,102,204,0.25)',
  border:     '1px solid rgba(68,150,255,0.5)',
  color:      '#88ccff',
}

const panelStyle: React.CSSProperties = {
  position:    'absolute',
  top:         'calc(100% + 4px)',
  right:       0,
  width:       220,
  background:  'rgba(5,5,22,0.97)',
  border:      '1px solid rgba(255,255,255,0.14)',
  borderRadius: 6,
  fontFamily:  'monospace',
  color:       '#ddd',
  fontSize:    12,
  zIndex:      60,
  overflow:    'hidden',
}

const itemStyle: React.CSSProperties = {
  display:    'block',
  width:      '100%',
  padding:    '8px 12px',
  textAlign:  'left',
  background: 'transparent',
  border:     'none',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  color:      '#ddd',
  fontSize:   12,
  fontFamily: 'monospace',
  cursor:     'pointer',
}

const subViewStyle: React.CSSProperties = {
  padding: '10px 12px',
}

const subLabelStyle: React.CSSProperties = {
  fontSize:      10,
  color:         '#666',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom:  6,
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '4px 8px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  color:        '#e0e0e0',
  boxSizing:    'border-box',
  marginBottom: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap:     6,
}

const confirmBtnStyle: React.CSSProperties = {
  flex:         1,
  padding:      '4px 0',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(34,102,204,0.3)',
  border:       '1px solid rgba(68,170,255,0.5)',
  borderRadius: 4,
  color:        '#88ccff',
  cursor:       'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  padding:      '4px 10px',
  fontSize:     12,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  color:        '#aaa',
  cursor:       'pointer',
}

const statusStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize:  11,
  color:     '#f8a',
}

const saveListStyle: React.CSSProperties = {
  maxHeight: 240,
  overflowY: 'auto',
}

const saveRowStyle: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  gap:          4,
  padding:      '5px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const saveInfoStyle: React.CSSProperties = {
  flex:    1,
  minWidth: 0,
}

const saveNameStyle: React.CSSProperties = {
  color:     '#ddd',
  fontSize:  12,
  overflow:  'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const saveDateStyle: React.CSSProperties = {
  color:    '#666',
  fontSize: 10,
  marginTop: 1,
}

const smallBtnStyle: React.CSSProperties = {
  padding:      '2px 7px',
  fontSize:     11,
  fontFamily:   'monospace',
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.15)',
  borderRadius: 3,
  color:        '#aaa',
  cursor:       'pointer',
  flexShrink:   0,
}

const emptySavesStyle: React.CSSProperties = {
  padding:  '8px 12px',
  color:    '#555',
  fontSize: 12,
}

const backRowStyle: React.CSSProperties = {
  padding:   '6px 10px',
  borderTop: '1px solid rgba(255,255,255,0.08)',
}

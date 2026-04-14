import type { GameConfig } from './types'

// ── Save data types ───────────────────────────────────────────────────────────

export interface SavedGameState {
  turnNumber:       number
  currentPlayerIdx: number
  activeUnitId:     number
  pendingIds:       number[]
  unitPaths:        Array<{ uid: number; path: Array<{ x: number; y: number }> }>
}

export interface SaveFile {
  version:   1
  name:      string
  savedAt:   string     // ISO timestamp
  config:    GameConfig
  /** base64-encoded full tileBuffer bytes */
  tileData:  string
  /** base64-encoded first (unitCount × UNIT_STRIDE) bytes of unitBuffer */
  unitData:  string
  unitCount: number
  gameState: SavedGameState
}

export interface SaveEntry {
  key:     string
  name:    string
  savedAt: string
}

// ── Binary helpers ────────────────────────────────────────────────────────────

/** Convert bytes to base64 safely (chunk to avoid call-stack overflow on large buffers). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000
  let out = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(out)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const INDEX_KEY   = 'civ_saves_index'
const SAVE_PREFIX = 'civ_save_'

export function listSaves(): SaveEntry[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as SaveEntry[]
  } catch {
    return []
  }
}

export function saveToLocalStorage(save: SaveFile): void {
  const key     = SAVE_PREFIX + Date.now()
  // Overwrite an existing entry with the same name (replace its key)
  const entries = listSaves().filter(e => e.name !== save.name)
  entries.push({ key, name: save.name, savedAt: save.savedAt })
  try {
    localStorage.setItem(key, JSON.stringify(save))
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch (err) {
    // If quota exceeded, clean up the partially-written key
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    throw err
  }
}

export function loadFromLocalStorage(key: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as SaveFile
  } catch {
    return null
  }
}

export function deleteSave(key: string): void {
  localStorage.removeItem(key)
  try {
    const entries = listSaves().filter(e => e.key !== key)
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch { /* ignore */ }
}

// ── File export / import ──────────────────────────────────────────────────────

export function downloadJson(save: SaveFile): void {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${save.name.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'civts_save'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function readJsonFile(): Promise<SaveFile> {
  return new Promise((resolve, reject) => {
    const input    = document.createElement('input')
    input.type     = 'file'
    input.accept   = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { reject(new Error('No file selected')); return }
      const reader   = new FileReader()
      reader.onload  = () => {
        try { resolve(JSON.parse(reader.result as string) as SaveFile) }
        catch { reject(new Error('Invalid JSON file')) }
      }
      reader.onerror = () => reject(new Error('File read error'))
      reader.readAsText(file)
    }
    input.click()
  })
}

// ── Default save name ─────────────────────────────────────────────────────────

export function defaultSaveName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `Save_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

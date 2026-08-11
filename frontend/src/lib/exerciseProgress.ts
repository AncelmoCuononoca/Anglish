// Per-lesson progress. localStorage is a fast synchronous cache; the Supabase
// table `lesson_progress` is the source of truth so a student's completed
// lessons, in-progress state and mistakes follow them across browsers/devices.
// Every local write is mirrored to the server (debounced); on login we hydrate
// the cache from the server (merging, never losing local-only progress).
import { supabase } from './supabase'

const KEY           = (id: string) => `anglish-ex-progress-${id}`
const MAX_KEY       = (id: string) => `anglish-ex-maxstage-${id}`
const MISTAKES_KEY  = (id: string) => `anglish-mistakes-${id}`
const SYNC_UID_KEY  = 'anglish-sync-uid'
const LAST_KEY      = 'anglish-last-lesson'  // "Continue where you left off" pointer (any month)

export interface ProgressState {
  stage: 1 | 2 | 3
  idx: number
  score: number
  xpEarned: number
  wrongIds: number[]
  done: boolean
}

// ─── localStorage (synchronous, used by the UI) ───────────────────────────────

export function saveProgress(lessonId: string, state: ProgressState) {
  try { localStorage.setItem(KEY(lessonId), JSON.stringify(state)) } catch {}
  setLastLesson(lessonId)
  scheduleSync(lessonId)
}

// ─── "Continue where you left off" pointer (works for any month/lesson) ────────

export function setLastLesson(lessonId: string): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: lessonId, at: Date.now() })) } catch {}
}

export function getLastLesson(): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (raw) { const o = JSON.parse(raw) as { id?: string }; if (o?.id) return o.id }
  } catch { /* ignore */ }
  return null
}

export function loadProgress(lessonId: string): ProgressState | null {
  try {
    const raw = localStorage.getItem(KEY(lessonId))
    return raw ? (JSON.parse(raw) as ProgressState) : null
  } catch { return null }
}

export function clearProgress(lessonId: string) {
  try { localStorage.removeItem(KEY(lessonId)) } catch {}
  scheduleSync(lessonId)
}

/** Highest stage completed (0 = none, 1 = Beginner done, 2 = Intermediate done, 3 = Expert done) */
export function getMaxStage(lessonId: string): number {
  try { return parseInt(localStorage.getItem(MAX_KEY(lessonId)) ?? '0', 10) } catch { return 0 }
}

export function advanceMaxStage(lessonId: string, stage: number) {
  try {
    setLastLesson(lessonId)
    const cur = getMaxStage(lessonId)
    if (stage > cur) { localStorage.setItem(MAX_KEY(lessonId), String(stage)); scheduleSync(lessonId) }
  } catch {}
}

export function resetMaxStage(lessonId: string) {
  try { localStorage.removeItem(MAX_KEY(lessonId)) } catch {}
  scheduleSync(lessonId)
}

// ─── Persistent mistake tracking ──────────────────────────────────────────────

export function getMistakes(lessonId: string): number[] {
  try {
    const raw = localStorage.getItem(MISTAKES_KEY(lessonId))
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch { return [] }
}

export function addMistake(lessonId: string, exId: number): void {
  try {
    const cur = getMistakes(lessonId)
    if (!cur.includes(exId)) {
      localStorage.setItem(MISTAKES_KEY(lessonId), JSON.stringify([...cur, exId]))
      scheduleSync(lessonId)
    }
  } catch {}
}

export function clearMistake(lessonId: string, exId: number): void {
  try {
    const filtered = getMistakes(lessonId).filter(id => id !== exId)
    localStorage.setItem(MISTAKES_KEY(lessonId), JSON.stringify(filtered))
    scheduleSync(lessonId)
  } catch {}
}

export function getAllMistakes(): { lessonId: string; exIds: number[] }[] {
  const result: { lessonId: string; exIds: number[] }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('anglish-mistakes-')) {
      try {
        const lessonId = key.slice('anglish-mistakes-'.length)
        const exIds = JSON.parse(localStorage.getItem(key) ?? '[]') as number[]
        if (exIds.length > 0) result.push({ lessonId, exIds })
      } catch {}
    }
  }
  return result
}

export function getAllMistakesCount(): number {
  return getAllMistakes().reduce((sum, m) => sum + m.exIds.length, 0)
}

// ─── Server sync (Supabase `lesson_progress`) ──────────────────────────────────

let userId: string | null = null

async function getUid(): Promise<string | null> {
  if (userId) return userId
  try {
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch { userId = null }
  return userId
}

// Debounced write-through: push the FULL current state of one lesson to the server.
const pending = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleSync(lessonId: string) {
  const existing = pending.get(lessonId)
  if (existing) clearTimeout(existing)
  pending.set(lessonId, setTimeout(() => { pending.delete(lessonId); void pushLesson(lessonId) }, 700))
}

async function pushLesson(lessonId: string): Promise<void> {
  const uid = await getUid()
  if (!uid) return
  try {
    await supabase.from('lesson_progress').upsert({
      user_id: uid,
      lesson_id: lessonId,
      max_stage: getMaxStage(lessonId),
      state: loadProgress(lessonId),
      mistakes: getMistakes(lessonId),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lesson_id' })
  } catch { /* offline / RLS - keep local copy, retry on next change */ }
}

function clearAllLocalProgress() {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('anglish-ex-progress-') || k.startsWith('anglish-ex-maxstage-') || k.startsWith('anglish-mistakes-'))) {
      toRemove.push(k)
    }
  }
  toRemove.forEach(k => { try { localStorage.removeItem(k) } catch {} })
}

let hydratedFor: string | null = null

// Pull the user's progress from the server and merge it into localStorage.
// - Different account on this browser → wipe the old cache, load theirs.
// - Same account / first run → merge (keep the furthest progress), then push
//   any local-only progress back up so nothing is lost.
export async function hydrateProgressFromServer(): Promise<void> {
  const uid = await getUid()
  if (!uid || hydratedFor === uid) return

  const storedUid = (() => { try { return localStorage.getItem(SYNC_UID_KEY) } catch { return null } })()
  if (storedUid && storedUid !== uid) clearAllLocalProgress()
  try { localStorage.setItem(SYNC_UID_KEY, uid) } catch {}

  let rows: { lesson_id: string; max_stage: number; state: ProgressState | null; mistakes: number[]; updated_at?: string }[] = []
  try {
    const { data } = await supabase
      .from('lesson_progress')
      .select('lesson_id, max_stage, state, mistakes, updated_at')
      .eq('user_id', uid)
    rows = (data as typeof rows) ?? []
  } catch { rows = [] }

  // Seed the "continue where you left off" pointer from the server so it follows
  // the student across devices — prefer an unfinished lesson, else the most
  // recently touched one. Only when this device has no local pointer yet.
  if (!getLastLesson() && rows.length) {
    const byRecent = [...rows].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    const resume = byRecent.find(r => r.state && r.state.done === false) ?? byRecent[0]
    if (resume) setLastLesson(resume.lesson_id)
  }

  const serverIds = new Set<string>()
  for (const r of rows) {
    serverIds.add(r.lesson_id)
    const localMax = getMaxStage(r.lesson_id)
    const mergedMax = Math.max(localMax, r.max_stage ?? 0)
    try {
      if (mergedMax > 0) localStorage.setItem(MAX_KEY(r.lesson_id), String(mergedMax))
      if (!loadProgress(r.lesson_id) && r.state) localStorage.setItem(KEY(r.lesson_id), JSON.stringify(r.state))
      const serverM = Array.isArray(r.mistakes) ? r.mistakes : []
      const union = Array.from(new Set([...getMistakes(r.lesson_id), ...serverM]))
      if (union.length) localStorage.setItem(MISTAKES_KEY(r.lesson_id), JSON.stringify(union))
      // If local was ahead, push the merged result back to the server.
      if (localMax > (r.max_stage ?? 0)) scheduleSync(r.lesson_id)
    } catch {}
  }

  // Push local-only lessons (progress made before this device synced) up to the server.
  const localIds = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('anglish-ex-maxstage-')) localIds.add(k.slice('anglish-ex-maxstage-'.length))
    if (k?.startsWith('anglish-mistakes-')) localIds.add(k.slice('anglish-mistakes-'.length))
  }
  for (const id of localIds) if (!serverIds.has(id)) scheduleSync(id)

  hydratedFor = uid
  // Let any mounted screens recompute from the freshly hydrated cache.
  try { window.dispatchEvent(new Event('anglish-progress-hydrated')) } catch {}
}

// Reset on logout so the next login re-hydrates for the correct account.
export function resetProgressSync(): void {
  userId = null
  hydratedFor = null
}

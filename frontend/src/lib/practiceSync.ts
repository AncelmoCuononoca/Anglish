// Cross-device sync for Speaking → "Talk" (practice) mode.
//
// The practice in-progress state and the completed-sets history (with the red
// "errors to fix") were localStorage-only, so a student who practised on their
// phone saw nothing on their PC. This mirrors lesson_progress: localStorage is a
// fast synchronous cache; the Supabase table `speaking_practice` is the source of
// truth. Every local write is mirrored to the server (debounced); on login we
// hydrate the cache from the server, merging so no completed set or error is lost.
import { supabase } from './supabase'

// Same keys PracticeMode already uses in SpeakingPage.tsx.
const STATE_KEY   = (uid: string) => `practice:${uid}`
const HISTORY_KEY = (uid: string) => `practiceHistory:${uid}`

type Outcome = Record<number, 'correct' | 'wrong'>
interface PracticeState { idx: number; results: Outcome; items: unknown[]; setNumber: number; roundType: string }
interface CompletedSet { setNumber: number; score: number; total: number; items: unknown[]; wrongItems: { say?: string }[]; at: number }

function readState(uid: string): PracticeState | null {
  try { const raw = localStorage.getItem(STATE_KEY(uid)); return raw ? JSON.parse(raw) as PracticeState : null } catch { return null }
}
function readHistory(uid: string): CompletedSet[] {
  try { const raw = localStorage.getItem(HISTORY_KEY(uid)); const h = raw ? JSON.parse(raw) : []; return Array.isArray(h) ? h : [] } catch { return [] }
}

// ─── Server sync ──────────────────────────────────────────────────────────────

let userId: string | null = null
async function getUid(): Promise<string | null> {
  if (userId) return userId
  try { const { data } = await supabase.auth.getUser(); userId = data.user?.id ?? null } catch { userId = null }
  return userId
}

let pending: ReturnType<typeof setTimeout> | null = null
export function schedulePracticeSync(uid: string): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => { pending = null; void pushPractice(uid) }, 800)
}

// Push = read-merge-write. We first pull the current server row and UNION it with
// the local copy before writing back, so a device with an empty/older cache can
// never wipe another device's completed sets or errors ("empty overwrite" race).
async function pushPractice(uid: string): Promise<void> {
  try {
    const localState = readState(uid)
    const localHistory = readHistory(uid)
    let serverState: PracticeState | null = null
    let serverHistory: CompletedSet[] = []
    try {
      const { data } = await supabase
        .from('speaking_practice')
        .select('state, history')
        .eq('user_id', uid)
        .maybeSingle()
      const row = data as { state: PracticeState | null; history: CompletedSet[] | null } | null
      serverState = row?.state ?? null
      serverHistory = Array.isArray(row?.history) ? row!.history! : []
    } catch { /* treat as no server row */ }

    const mergedHistory = mergeHistory(localHistory, serverHistory)
    const mergedState = furthestState(localState, serverState)

    // Keep local cache in step with the merged truth so the UI never regresses.
    try {
      if (mergedState) localStorage.setItem(STATE_KEY(uid), JSON.stringify(mergedState))
      localStorage.setItem(HISTORY_KEY(uid), JSON.stringify(mergedHistory))
    } catch { /* quota - ignore */ }

    await supabase.from('speaking_practice').upsert({
      user_id: uid,
      state: mergedState,
      history: mergedHistory,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  } catch { /* offline / RLS - keep local, retry on next change */ }
}

// Union completed sets by setNumber, never losing a set or its errors.
function mergeHistory(a: CompletedSet[], b: CompletedSet[]): CompletedSet[] {
  const byNum = new Map<number, CompletedSet>()
  for (const s of [...a, ...b]) {
    const prev = byNum.get(s.setNumber)
    if (!prev) { byNum.set(s.setNumber, s); continue }
    // Keep the richer record: union wrong items, take the higher score/total.
    const wrong = Array.from(new Map([...(prev.wrongItems ?? []), ...(s.wrongItems ?? [])].map(w => [w.say, w])).values())
    byNum.set(s.setNumber, {
      ...prev,
      score: Math.max(prev.score ?? 0, s.score ?? 0),
      total: Math.max(prev.total ?? 0, s.total ?? 0),
      wrongItems: wrong as CompletedSet['wrongItems'],
      at: Math.max(prev.at ?? 0, s.at ?? 0),
    })
  }
  return Array.from(byNum.values()).sort((x, y) => x.setNumber - y.setNumber)
}

// The device furthest along wins: higher setNumber, then higher idx within it.
function furthestState(a: PracticeState | null, b: PracticeState | null): PracticeState | null {
  if (!a) return b
  if (!b) return a
  if ((b.setNumber ?? 0) > (a.setNumber ?? 0)) return b
  if ((b.setNumber ?? 0) === (a.setNumber ?? 0) && (b.idx ?? 0) > (a.idx ?? 0)) return b
  return a
}

let hydratedFor: string | null = null

// Pull practice state + history from the server and merge into localStorage.
// State: the device that is furthest along (higher setNumber) wins. History:
// union so completed sets and errors from every device always show everywhere.
export async function hydratePracticeFromServer(): Promise<void> {
  const uid = await getUid()
  if (!uid || hydratedFor === uid) return

  type Row = { state: PracticeState | null; history: CompletedSet[] | null }
  let row: Row | null = null
  try {
    const { data } = await supabase
      .from('speaking_practice')
      .select('state, history')
      .eq('user_id', uid)
      .maybeSingle()
    row = (data as Row | null) ?? null
  } catch { row = null }

  const localState = readState(uid)
  const localHistory = readHistory(uid)
  const serverState = row?.state ?? null
  const serverHistory = Array.isArray(row?.history) ? row!.history! : []

  const mergedHistory = mergeHistory(localHistory, serverHistory)
  const mergedState = furthestState(localState, serverState)

  try {
    if (mergedState) localStorage.setItem(STATE_KEY(uid), JSON.stringify(mergedState))
    localStorage.setItem(HISTORY_KEY(uid), JSON.stringify(mergedHistory))
  } catch { /* quota - ignore */ }

  hydratedFor = uid
  // Push the merged result back so both devices converge on the same record.
  schedulePracticeSync(uid)
  // Let a mounted SpeakingPage re-read the freshly hydrated cache.
  try { window.dispatchEvent(new Event('anglish-practice-hydrated')) } catch { /* SSR guard */ }
}

// Reset on logout so the next login re-hydrates for the correct account.
export function resetPracticeSync(): void {
  userId = null
  hydratedFor = null
}

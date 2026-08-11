import toast from 'react-hot-toast'

// Where the app lives. Shared links are deep links into a specific lesson:
// https://anglishme.com/lessons/<id> — the /lessons/:id route opens that lesson
// straight away for anyone who already has the app (i.e. an active session).
const SITE = 'https://anglishme.com'

export interface ShareableLesson {
  id: string
  title: string
  topic?: string
  level?: string
}

export function lessonShareUrl(id: string): string {
  return `${SITE}/lessons/${id}`
}

// The invite message is intentionally in ENGLISH — it doubles as a tiny bit of
// practice for the friend receiving it, and keeps the brand voice consistent
// across Facebook / Instagram / WhatsApp / SMS.
function lessonShareText(lesson: ShareableLesson): string {
  const tag = lesson.level ? ` (${lesson.level})` : ''
  return [
    "I'm learning English with Anglish Me! 🎓",
    `Come try this lesson with me: “${lesson.title}”${tag}.`,
    'Tap the link to open it in the app 👇',
  ].join('\n')
}

type ShareCapableNavigator = Navigator & {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
}

// Opens the phone's native share sheet (Facebook, Instagram, WhatsApp, Messages,
// email, …). Must be called from inside a user gesture (a tap). Falls back to
// copying the link on desktop / browsers without the Web Share API.
export async function shareLesson(lesson: ShareableLesson): Promise<void> {
  const url = lessonShareUrl(lesson.id)
  const data: ShareData = {
    title: `Anglish Me · ${lesson.title}`,
    text: lessonShareText(lesson),
    url,
  }

  const nav = navigator as ShareCapableNavigator
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data)
      return
    } catch (err) {
      // The user dismissed the share sheet — that's a normal outcome, not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Anything else: fall through and copy the link so the share still succeeds.
    }
  }

  await copyLink(url)
}

// Clipboard fallback (desktop, or when Web Share is unavailable).
export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied — paste it anywhere to share')
  } catch {
    toast.error('Could not copy the link')
  }
}

// True when the OS can show a native share sheet — lets the UI label the action
// "Share" vs. "Copy link".
export function canNativeShare(): boolean {
  return typeof (navigator as ShareCapableNavigator).share === 'function'
}

// The 12 month characters (Angli & friends). Backgrounds already removed; two
// framings: `full` (whole figure) for month mascots, `bust` (head + chest, square)
// for the profile avatar. Order follows the course months.
export interface Mascot {
  month: number
  label: string
  bust: string
  full: string
}

export const MASCOTS: Mascot[] = [
  { month: 1,  label: 'Angli',      bust: '/mascots/bust/month01.png', full: '/mascots/full/month01.png' },
  { month: 2,  label: 'Rosy',       bust: '/mascots/bust/month02.png', full: '/mascots/full/month02.png' },
  { month: 3,  label: 'Léo',        bust: '/mascots/bust/month03.png', full: '/mascots/full/month03.png' },
  { month: 4,  label: 'Mara',       bust: '/mascots/bust/month04.png', full: '/mascots/full/month04.png' },
  { month: 5,  label: 'Yuki',       bust: '/mascots/bust/month05.png', full: '/mascots/full/month05.png' },
  { month: 6,  label: 'Aarav',      bust: '/mascots/bust/month06.png', full: '/mascots/full/month06.png' },
  { month: 7,  label: 'Dunk',       bust: '/mascots/bust/month07.png', full: '/mascots/full/month07.png' },
  { month: 8,  label: 'Nadia',      bust: '/mascots/bust/month08.png', full: '/mascots/full/month08.png' },
  { month: 9,  label: 'Ellie',      bust: '/mascots/bust/month09.png', full: '/mascots/full/month09.png' },
  { month: 10, label: 'Sakura',     bust: '/mascots/bust/month10.png', full: '/mascots/full/month10.png' },
  { month: 11, label: 'Tavi',       bust: '/mascots/bust/month11.png', full: '/mascots/full/month11.png' },
  { month: 12, label: 'Max',        bust: '/mascots/bust/month12.png', full: '/mascots/full/month12.png' },
]

// Mascot for a course month (1-based). Months beyond 12 wrap around.
export function mascotForMonth(month?: number | null): Mascot {
  const m = month && month > 0 ? ((month - 1) % 12) + 1 : 1
  return MASCOTS.find(x => x.month === m) ?? MASCOTS[0]
}

// Nice background choices for the character avatar (hex without #, or 'transparent').
export const MASCOT_BG = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c8f7d4', 'ffe8a3', 'transparent']

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Composite a bust cut-out over a solid circle background → PNG data URI. Bakes
// the chosen background colour in so the avatar looks right anywhere it's shown.
export async function composeMascotAvatar(bustUrl: string, bg: string, size = 256): Promise<string> {
  const img = await loadImage(bustUrl)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return bustUrl
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = `#${bg}`
    ctx.fillRect(0, 0, size, size)
  }
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return canvas.toDataURL('image/png')
}

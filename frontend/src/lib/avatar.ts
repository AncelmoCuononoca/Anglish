// Cartoon avatar builder + photo upload. The cartoon uses DiceBear's "adventurer"
// style (MIT), rendered 100% in the browser — no API, no AI credits. It gives
// real eyes (white sclera + a pupil/iris), many hairstyles incl. afros, and skin
// tones. DiceBear has no iris-colour option, so we post-process the SVG: within
// the eyes group (the only part with an eye-white), the black pupils are recoloured
// to the chosen iris colour. Every enum value below is valid in adventurer v9.
import { createAvatar } from '@dicebear/core'
import { adventurer } from '@dicebear/collection'
import { supabase } from './supabase'

// ── Palettes (hex without leading #) ──────────────────────────────────────────
export const SKIN_TONES  = ['f2d3b1', 'ecad80', 'c68642', '9e5622', '763900', '4a2600']
export const HAIR_COLORS = ['0e0e0e', '3a2a1d', '562306', '6a4e35', 'ac6511', 'cb6820', 'e5d7a3', 'ab2a18', 'afafaf', 'ffffff', '3eac2c', '85c2c6', 'dba3be', '592454']
export const EYE_COLORS  = ['3a2a1d', '6a4e35', '1e6b3a', '2563eb', '5aa9e6', '7c3f1d', '808080', '111111']
export const BG_COLORS   = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c8f7d4', 'ffe8a3', 'transparent']

// Full option sets (shown as visual pickers so afros/cuts are easy to choose).
export const HAIR_STYLES: string[] = [
  'short01','short02','short03','short04','short05','short06','short07','short08','short09','short10',
  'short11','short12','short13','short14','short15','short16','short17','short18','short19',
  'long01','long02','long03','long04','long05','long06','long07','long08','long09','long10','long11','long12','long13',
  'long14','long15','long16','long17','long18','long19','long20','long21','long22','long23','long24','long25','long26',
]
export const EYE_SHAPES: string[] = Array.from({ length: 26 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`)
export const MOUTHS: string[] = ['variant01','variant02','variant03','variant04','variant05','variant08','variant10','variant12','variant15','variant19','variant24','variant29']
export const GLASSES = [
  { value: 'none', label: 'None' },
  { value: 'variant01', label: 'Glasses 1' },
  { value: 'variant02', label: 'Glasses 2' },
  { value: 'variant03', label: 'Round' },
  { value: 'variant04', label: 'Square' },
  { value: 'variant05', label: 'Wide' },
]

export interface AvatarOptions {
  skinColor: string
  hair: string
  hairColor: string
  eyes: string
  eyesTint: string   // iris colour (hex without #)
  mouth: string
  glasses: string    // 'none' or a GLASSES value
  backgroundColor: string
}

export const DEFAULT_AVATAR: AvatarOptions = {
  skinColor: 'ecad80', hair: 'short01', hairColor: '0e0e0e', eyes: 'variant01',
  eyesTint: '3a2a1d', mouth: 'variant01', glasses: 'none', backgroundColor: 'b6e3f4',
}

const EYEBROWS = 'variant01' // stable brows so the face doesn't randomise

// Recolour the iris: inside the first part-group containing an eye-white (#fff),
// turn the black pupils (#000) into the chosen colour. Eyebrows/outlines are in
// separate groups and stay black.
function tintIris(svg: string, color: string): string {
  const re = /<g transform="translate\([^)]*\)">/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) {
    const start = m.index
    let depth = 0, i = start, end = -1
    while (i < svg.length) {
      if (svg.startsWith('<g', i)) depth++
      else if (svg.startsWith('</g>', i)) { depth--; if (depth === 0) { end = i + 4; break } }
      i++
    }
    if (end < 0) break
    const chunk = svg.slice(start, end)
    if (chunk.includes('fill="#fff"')) {
      return svg.slice(0, start) + chunk.split('fill="#000"').join(`fill="${color}"`) + svg.slice(end)
    }
    re.lastIndex = end
  }
  return svg
}

export function buildAvatarUri(o: AvatarOptions): string {
  const svg = createAvatar(adventurer, {
    seed: 'anglish',
    radius: 50,
    backgroundColor: o.backgroundColor === 'transparent' ? [] : [o.backgroundColor],
    skinColor: [o.skinColor],
    hair: [o.hair],
    hairColor: [o.hairColor],
    eyes: [o.eyes],
    eyebrows: [EYEBROWS],
    mouth: [o.mouth],
    glasses: [o.glasses === 'none' ? 'variant01' : o.glasses],
    glassesProbability: o.glasses === 'none' ? 0 : 100,
    featuresProbability: 0,
    earringsProbability: 0,
  } as Record<string, unknown>).toString()
  const tinted = tintIris(svg, `#${o.eyesTint}`)
  return `data:image/svg+xml;utf8,${encodeURIComponent(tinted)}`
}

// Small preview of a single feature: overrides `patch` onto a neutral base so the
// picker can show hair/eye shapes as thumbnails. Memoise-friendly (pure).
export function thumbUri(patch: Partial<AvatarOptions>): string {
  return buildAvatarUri({ ...DEFAULT_AVATAR, backgroundColor: 'transparent', ...patch })
}

export function isCartoonAvatar(url?: string | null): boolean {
  return !!url && url.startsWith('data:image/svg+xml')
}

export function randomAvatar(): AvatarOptions {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]
  return {
    skinColor: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYE_SHAPES),
    eyesTint: pick(EYE_COLORS),
    mouth: pick(MOUTHS),
    glasses: Math.random() < 0.25 ? pick(GLASSES.slice(1)).value : 'none',
    backgroundColor: pick(BG_COLORS),
  }
}

// Upload a photo to the public `avatars` bucket (path scoped to the user's uid,
// per storage RLS) and return its public URL.
export async function uploadAvatarPhoto(file: File, userId: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true, cacheControl: '3600', contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

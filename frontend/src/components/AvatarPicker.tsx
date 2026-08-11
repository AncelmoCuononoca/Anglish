import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shuffle, Upload, Check, Trash2, Loader2, Image as ImageIcon, Smile, Camera, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../lib/AuthContext'
import { updateAvatar } from '../lib/auth'
import { cn } from '../lib/utils'
import {
  type AvatarOptions, DEFAULT_AVATAR, buildAvatarUri, thumbUri, randomAvatar, uploadAvatarPhoto,
  SKIN_TONES, HAIR_COLORS, EYE_COLORS, BG_COLORS,
  HAIR_STYLES, EYE_SHAPES, MOUTHS, GLASSES,
} from '../lib/avatar'
import { MASCOTS, MASCOT_BG, composeMascotAvatar } from '../lib/mascots'

type Tab = 'characters' | 'cartoon' | 'photo'

const OPTS_KEY = (uid: string) => `anglish_avatar_opts_${uid}`

function loadOpts(uid: string): AvatarOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY(uid))
    if (raw) return { ...DEFAULT_AVATAR, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_AVATAR
}

// A row of colour swatches.
function Swatches({ label, colors, value, onChange }: {
  label: string; colors: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map(c => {
          const transparent = c === 'transparent'
          const active = value === c
          return (
            <button key={c} type="button" onClick={() => onChange(c)}
              className={cn('w-7 h-7 rounded-full border-2 transition-transform',
                active ? 'border-purple-400 scale-110' : 'border-transparent hover:scale-105')}
              style={transparent
                ? { backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 75%,#ccc 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px' }
                : { background: `#${c}` }}
              aria-label={transparent ? 'Transparent' : `#${c}`}
            />
          )
        })}
      </div>
    </div>
  )
}

// A wrapping row of text chips.
function Chips({ label, options, value, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
              value === o.value
                ? 'border-purple-400 bg-purple-500/10 text-purple-400'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-white/20 hover:text-[var(--text)]')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// A scrollable grid of feature thumbnails (hair, eyes, mouth).
function ThumbGrid({ label, items, thumbs, value, onChange }: {
  label: string; items: string[]; thumbs: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">{label}</p>
      <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto pr-1">
        {items.map((v, i) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={cn('aspect-square rounded-lg overflow-hidden border-2 bg-[var(--bg-elev)] transition-all',
              value === v ? 'border-purple-400 scale-105' : 'border-[var(--border)] hover:border-white/20')}>
            <img src={thumbs[i]} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function AvatarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth()
  const [tab, setTab] = useState<Tab>('characters')
  const [opts, setOpts] = useState<AvatarOptions>(() => (user ? loadOpts(user.id) : DEFAULT_AVATAR))
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [charMonth, setCharMonth] = useState<number | null>(null)
  const [charBg, setCharBg] = useState<string>('b6e3f4')
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const selectedChar = MASCOTS.find(m => m.month === charMonth) ?? null

  const set = (patch: Partial<AvatarOptions>) => setOpts(o => ({ ...o, ...patch }))
  const preview = useMemo(() => buildAvatarUri(opts), [opts])

  // Feature thumbnails (rendered once when the Cartoon tab is first opened).
  const hairThumbs = useMemo(() => (tab === 'cartoon' ? HAIR_STYLES.map(v => thumbUri({ hair: v })) : []), [tab])
  const eyeThumbs = useMemo(() => (tab === 'cartoon' ? EYE_SHAPES.map(v => thumbUri({ eyes: v })) : []), [tab])
  const mouthThumbs = useMemo(() => (tab === 'cartoon' ? MOUTHS.map(v => thumbUri({ mouth: v })) : []), [tab])

  if (!user) return null

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast.error('Use a JPG, PNG or WebP image'); return }
    if (f.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const saveCartoon = async () => {
    setSaving(true)
    try {
      await updateAvatar(buildAvatarUri(opts))
      try { localStorage.setItem(OPTS_KEY(user.id), JSON.stringify(opts)) } catch { /* ignore */ }
      await refresh()
      toast.success('Avatar updated')
      onClose()
    } catch { toast.error('Could not save your avatar') }
    finally { setSaving(false) }
  }

  const savePhoto = async () => {
    if (!photoFile) { toast.error('Choose a photo first'); return }
    setSaving(true)
    try {
      const url = await uploadAvatarPhoto(photoFile, user.id)
      await updateAvatar(url)
      await refresh()
      toast.success('Photo updated')
      onClose()
    } catch { toast.error('Could not upload your photo') }
    finally { setSaving(false) }
  }

  const saveCharacter = async () => {
    if (!selectedChar) { toast.error('Pick a character first'); return }
    setSaving(true)
    try {
      const uri = await composeMascotAvatar(selectedChar.bust, charBg)
      await updateAvatar(uri)
      await refresh()
      toast.success('Avatar updated')
      onClose()
    } catch { toast.error('Could not save your avatar') }
    finally { setSaving(false) }
  }

  const removeAvatar = async () => {
    setSaving(true)
    try {
      await updateAvatar(null)
      await refresh()
      toast.success('Avatar removed')
      onClose()
    } catch { toast.error('Could not remove avatar') }
    finally { setSaving(false) }
  }

  const canSave = tab === 'characters' ? !!selectedChar : tab === 'photo' ? !!photoFile : true
  const onSave = () => (tab === 'characters' ? saveCharacter() : tab === 'photo' ? savePhoto() : saveCartoon())

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => !saving && onClose()}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[var(--text)]">Choose your avatar</h2>
              <button onClick={() => !saving && onClose()} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X size={18} />
              </button>
            </div>

            {/* Preview */}
            <div className="flex flex-col items-center mb-5">
              {tab === 'characters' ? (
                <div className="w-28 h-28 rounded-full overflow-hidden border border-[var(--border)] flex items-center justify-center"
                  style={{ background: charBg === 'transparent' ? 'var(--bg-elev)' : `#${charBg}` }}>
                  {selectedChar
                    ? <img src={selectedChar.bust} alt={selectedChar.label} className="w-full h-full object-cover" />
                    : <Users size={30} className="text-[var(--text-muted)]" />}
                </div>
              ) : (
                <img src={tab === 'photo' && photoPreview ? photoPreview : preview} alt="Avatar preview"
                  className="w-28 h-28 rounded-full object-cover border border-[var(--border)] bg-[var(--bg-elev)]" />
              )}
              {tab === 'cartoon' && (
                <button onClick={() => set(randomAvatar())}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-purple-400 border border-purple-400/30 hover:bg-purple-500/10 rounded-lg px-3 py-1.5 transition-all">
                  <Shuffle size={13} /> Randomize
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <button onClick={() => setTab('characters')}
                className={cn('flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all',
                  tab === 'characters' ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')}>
                <Users size={15} /> Characters
              </button>
              <button onClick={() => setTab('cartoon')}
                className={cn('flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all',
                  tab === 'cartoon' ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')}>
                <Smile size={15} /> Cartoon
              </button>
              <button onClick={() => setTab('photo')}
                className={cn('flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border transition-all',
                  tab === 'photo' ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')}>
                <ImageIcon size={15} /> Photo
              </button>
            </div>

            {tab === 'characters' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Pick a character</p>
                  <div className="grid grid-cols-4 gap-2">
                    {MASCOTS.map(m => (
                      <button key={m.month} type="button" onClick={() => setCharMonth(m.month)}
                        className={cn('aspect-square rounded-xl overflow-hidden border-2 transition-all bg-[var(--bg-elev)]',
                          charMonth === m.month ? 'border-purple-400 scale-105' : 'border-[var(--border)] hover:border-white/20')}>
                        <img src={m.bust} alt={m.label} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
                <Swatches label="Background" colors={MASCOT_BG} value={charBg} onChange={setCharBg} />
              </div>
            ) : tab === 'cartoon' ? (
              <div className="space-y-4">
                <Swatches label="Skin" colors={SKIN_TONES} value={opts.skinColor} onChange={v => set({ skinColor: v })} />
                <ThumbGrid label="Hair" items={HAIR_STYLES} thumbs={hairThumbs} value={opts.hair} onChange={v => set({ hair: v })} />
                <Swatches label="Hair colour" colors={HAIR_COLORS} value={opts.hairColor} onChange={v => set({ hairColor: v })} />
                <ThumbGrid label="Eyes" items={EYE_SHAPES} thumbs={eyeThumbs} value={opts.eyes} onChange={v => set({ eyes: v })} />
                <Swatches label="Eye colour" colors={EYE_COLORS} value={opts.eyesTint} onChange={v => set({ eyesTint: v })} />
                <ThumbGrid label="Mouth" items={MOUTHS} thumbs={mouthThumbs} value={opts.mouth} onChange={v => set({ mouth: v })} />
                <Chips label="Glasses" options={GLASSES} value={opts.glasses} onChange={v => set({ glasses: v })} />
                <Swatches label="Background" colors={BG_COLORS} value={opts.backgroundColor} onChange={v => set({ backgroundColor: v })} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2">
                {/* Gallery picker (no capture) and camera (capture opens the
                    front camera on phones; ignored → file dialog on desktop). */}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
                <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onPickFile} />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => camRef.current?.click()}
                    className="inline-flex items-center gap-2 bg-purple-500 text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-purple-400 transition-all">
                    <Camera size={15} /> Take a selfie
                  </button>
                  <button onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 bg-[var(--bg-elev)] border border-[var(--border)] hover:border-white/20 text-[var(--text)] text-sm font-medium rounded-xl px-4 py-2.5 transition-all">
                    <Upload size={15} /> {photoFile ? 'Change photo' : 'Choose a photo'}
                  </button>
                </div>
                <p className="text-xs text-[var(--text-muted)] text-center">JPG, PNG or WebP · up to 5 MB</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-6">
              {user.avatar_url && (
                <button onClick={() => void removeAvatar()} disabled={saving}
                  className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/25 hover:bg-red-500/10 rounded-xl px-3 py-2.5 transition-all disabled:opacity-40">
                  <Trash2 size={13} /> Remove
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => !saving && onClose()} disabled={saving}
                className="py-2.5 px-4 rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => void onSave()} disabled={saving || !canSave}
                className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-400 transition-colors disabled:opacity-40">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

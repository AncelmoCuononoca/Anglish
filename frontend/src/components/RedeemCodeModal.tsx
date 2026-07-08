import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { KeyRound, X, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { redeemCode } from '../lib/accessApi'
import { useAuth } from '../lib/AuthContext'

// Shared modal: the student types a code the admin gave them (e.g. after paying by
// IBAN over WhatsApp) and it unlocks / extends their access. On success it
// refreshes the auth profile so any access block lifts immediately.
export function RedeemCodeModal({
  open, onClose, onRedeemed,
}: {
  open: boolean
  onClose: () => void
  onRedeemed?: (accessEnd: string) => void
}) {
  const { refresh } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const value = code.trim()
    if (!value) { toast.error('Escreve o teu código.'); return }
    setBusy(true)
    try {
      const r = await redeemCode(value)
      await refresh() // reload profile → AccessGate unlocks
      toast.success('Código resgatado! Acesso desbloqueado. 🎉')
      onRedeemed?.(r.access_end)
      setCode('')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível resgatar o código.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <h2 className="font-bold text-white flex items-center gap-2">
                <KeyRound size={18} className="text-cyan" /> Resgatar código
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Tens um código de acesso? Escreve-o abaixo para desbloquear o teu tempo.
                Pagaste por transferência? Pede o código pelo WhatsApp.
              </p>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                autoFocus
                placeholder="ANG-XXXX-XXXX"
                className="w-full bg-bg-elevated border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-wider text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan/50"
              />
              <button
                onClick={submit}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-gradient-purple-cyan text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Sparkles size={16} /> {busy ? 'A resgatar…' : 'Desbloquear'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

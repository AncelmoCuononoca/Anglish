import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Calendar, MessageSquare, CheckCircle } from 'lucide-react'

const WHATSAPP_NUMBER = '264813762588'

export function SchedulePage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', whatsapp: '', level: 'A1', date: '', notes: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const message =
      `Ola Anselmo!\n\n` +
      `Quero agendar uma aula no Doctor English.\n\n` +
      `- Nome: ${form.name}\n` +
      `- Email: ${form.email}\n` +
      `- WhatsApp: ${form.whatsapp}\n` +
      `- Nivel: ${form.level}\n` +
      `- Data preferida: ${form.date}\n` +
      (form.notes ? `- Notas: ${form.notes}\n` : '') +
      `\nAguardo confirmacao. Obrigado!`

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')

    await new Promise(r => setTimeout(r, 500))
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 bg-green/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-green/20">
            <CheckCircle size={32} className="text-green" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Request Sent!</h2>
          <p className="text-slate-400 mb-2">
            Your live class request has been sent to Anselmo on WhatsApp. He'll confirm shortly.
          </p>
          <p className="text-xs text-slate-500 mb-6">Classes are available from the next business day.</p>
          <Button onClick={() => setSubmitted(false)} variant="secondary">Schedule Another</Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white mb-1 flex items-center gap-2">
          <Calendar size={24} className="text-pink" /> Schedule a Doctor English Class
        </h1>
        <p className="text-slate-400 text-sm">
          Book a 1-on-1 session with Anselmo Aldair or a certified tutor. You'll be contacted via WhatsApp.
        </p>
      </div>

      <Card className="border-pink/15">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              placeholder="Your name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="WhatsApp Number"
              placeholder="+244 9xx xxx xxx"
              value={form.whatsapp}
              onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
              required
              icon={<MessageSquare size={16} />}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Current Level</label>
              <select
                className="bg-bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple"
                value={form.level}
                onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
              >
                {['A1 – Beginner','A2 – Elementary','B1 – Intermediate','B2 – Upper Intermediate','C1 – Advanced','C2 – Mastery'].map(l => (
                  <option key={l} value={l.split(' ')[0]}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Preferred Date & Time"
            type="datetime-local"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">Notes (optional)</label>
            <textarea
              className="bg-bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple resize-none"
              rows={3}
              placeholder="Topics you want to focus on, questions, etc."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="bg-bg-elevated border border-white/5 rounded-xl p-4 text-xs text-slate-400 space-y-1">
            <p>📅 Sessions available from the next business day</p>
            <p>💬 Confirmation sent via WhatsApp within 24h</p>
            <p>⏱️ Default session: 60 minutes</p>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Request Live Class via WhatsApp
          </Button>
        </form>
      </Card>
    </div>
  )
}

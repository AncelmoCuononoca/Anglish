import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { CheckCircle, Zap, X, Flag, KeyRound } from 'lucide-react'
import { startCheckout, type CheckoutPlan, type CheckoutPeriod } from '../lib/paymentsApi'
import { getCodeInfo } from '../lib/accessApi'

const WHATSAPP_NUMBER = '264813762588'
const EUR_TO_AOA = 1000

// Plans page card id → the plan key the Stripe checkout endpoint expects.
const CARD_TO_PLAN: Record<string, CheckoutPlan> = {
  basic: 'basic',
  monthly: 'super',
  family: 'family',
  'family-tutor': 'family_tutor',
  power: 'power',
}

type Plan = {
  id: string
  name: string
  monthlyEUR: number | null
  annualEUR: number | null
  annualDiscountPct: number
  annualMonths?: number
  badge?: string
  color: string
  features: string[]
}

const plans: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    monthlyEUR: 25,
    annualEUR: Math.round(25 * 12 * 0.93),
    annualDiscountPct: 7,
    color: '#7F77DD',
    features: [
      'Current level access',
      'Speaking practice (7 min)',
      'Chat with AI',
      'Lessons unlock 1 per day',
      'Progress tracking',
    ],
  },
  {
    id: 'monthly',
    name: 'Super',
    monthlyEUR: 45,
    annualEUR: Math.round(45 * 12 * 0.90),
    annualDiscountPct: 10,
    badge: 'Most Popular',
    color: '#00D4FF',
    features: [
      'Everything in Basic',
      'Daily call with tutor',
      'Unlimited Chat',
      'Up to 2 lessons unlocked per day',
      'Priority AI responses',
      'Downloadable lessons (PDF)',
      'Email support',
    ],
  },
  {
    id: 'family',
    name: 'Family',
    monthlyEUR: 25 * 5,
    annualEUR: Math.round(25 * 5 * 12 * 0.86),
    annualDiscountPct: 14,
    color: '#00FF88',
    features: [
      'Up to 5 devices/accounts',
      'All Basic features per account',
      'Lessons unlock 1 per day',
      'Shared family progress',
      'Parent dashboard',
    ],
  },
  {
    id: 'family-tutor',
    name: 'Family + Tutor',
    monthlyEUR: 50 * 5,
    annualEUR: Math.round(50 * 5 * 12 * 0.85),
    annualDiscountPct: 15,
    color: '#FF77AA',
    features: [
      'Up to 5 devices/accounts',
      'All Super features per account',
      'Daily call with tutor for each',
      'Up to 2 lessons unlocked per day',
      'Downloadable lessons (PDF)',
      'Shared family progress',
      'Parent dashboard',
    ],
  },
  {
    id: 'power',
    name: 'Power All Access',
    monthlyEUR: null,
    annualEUR: Math.round(50 * 24 * 0.80),
    annualDiscountPct: 20,
    annualMonths: 24,
    badge: '2 Years',
    color: '#FFD700',
    features: [
      'All 6 levels unlocked',
      'Whole year opens in your first month (25% each week)',
      'Daily call with tutor',
      'First 6 months: 2x/week conversation sessions (20 min)',
      'After 6 months: global practice community access',
      '2 years of full access',
      'All future updates',
    ],
  },
]

const formatEUR = (v: number) => `€${v.toLocaleString('en-US')}`
const formatAOA = (v: number) => `${v.toLocaleString('pt-PT')} Kz`

// Apply a whole-number % discount to a price (rounded to the nearest unit).
const applyDiscount = (v: number, pct: number) => Math.round(v * (1 - pct / 100))

function buildWhatsAppMessage(plan: Plan, period: 'monthly' | 'annual', currency: 'EUR' | 'AOA', discountPct = 0) {
  const baseEUR = period === 'monthly' ? plan.monthlyEUR! : plan.annualEUR!
  const eur = applyDiscount(baseEUR, discountPct)
  const value = currency === 'EUR' ? formatEUR(eur) : formatAOA(eur * EUR_TO_AOA)

  const periodLabel =
    period === 'monthly'
      ? '/mês'
      : plan.annualMonths === 24
        ? ' (2 anos)'
        : '/ano'

  const promoLine = discountPct > 0 ? `\n(ja com ${discountPct}% de desconto do codigo)` : ''

  if (currency === 'AOA') {
    return (
      `Ola Anselmo!\n\n` +
      `Quero assinar o plano *${plan.name}* - *${value}${periodLabel}*.${promoLine}\n\n` +
      `Sou de Angola e quero pagar por transferencia bancaria (IBAN).\n` +
      `Por favor envia-me as coordenadas bancarias. Obrigado!`
    )
  }

  return (
    `Ola Anselmo!\n\n` +
    `Quero assinar o plano *${plan.name}* - *${value}${periodLabel}*.${promoLine}\n\n` +
    `Aguardo as instrucoes de pagamento. Obrigado!`
  )
}

function openWhatsApp(plan: Plan, period: 'monthly' | 'annual', currency: 'EUR' | 'AOA', discountPct = 0) {
  const msg = buildWhatsAppMessage(plan, period, currency, discountPct)
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
}

function PlanCard({ plan, index, currency, discountPct = 0 }: { plan: Plan; index: number; currency: 'EUR' | 'AOA'; discountPct?: number }) {
  const { monthlyEUR, annualEUR, annualMonths, annualDiscountPct, badge, color, features, name } = plan
  const [busy, setBusy] = useState<CheckoutPeriod | null>(null)
  const [error, setError] = useState<string | null>(null)

  // EUR → Stripe Checkout (card). AOA → WhatsApp for IBAN bank transfer.
  async function handleBuy(period: CheckoutPeriod) {
    setError(null)
    if (currency === 'AOA') {
      openWhatsApp(plan, period, currency, discountPct)
      return
    }
    const planKey = CARD_TO_PLAN[plan.id]
    if (!planKey) {
      setError('This plan is not available for card payment.')
      return
    }
    try {
      setBusy(period)
      await startCheckout(planKey, period)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  // Prices with the promo discount applied (discountPct 0 = unchanged).
  const mEUR = monthlyEUR == null ? null : applyDiscount(monthlyEUR, discountPct)
  const aEUR = annualEUR == null ? null : applyDiscount(annualEUR, discountPct)

  const monthlyDisplay = mEUR == null
    ? null
    : currency === 'EUR' ? formatEUR(mEUR) : formatAOA(mEUR * EUR_TO_AOA)

  const annualDisplay = aEUR == null
    ? null
    : currency === 'EUR' ? formatEUR(aEUR) : formatAOA(aEUR * EUR_TO_AOA)

  const annualLabel = annualMonths === 24 ? 'for 2 years' : 'per year'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-bg-card rounded-2xl p-6 flex flex-col relative overflow-hidden"
      style={{ border: `1px solid ${color}30` }}
    >
      {badge && (
        <div
          className="absolute top-0 right-0 text-xs font-bold px-3 py-1 rounded-bl-xl"
          style={{ background: color, color: '#0D1B2A' }}
        >
          {badge}
        </div>
      )}

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white font-bold text-lg">{name}</span>
          {discountPct > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan/20 text-cyan">−{discountPct}%</span>
          )}
        </div>

        {monthlyDisplay ? (
          <>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-4xl font-black" style={{ color }}>{monthlyDisplay}</span>
              <span className="text-slate-400 text-sm">per month</span>
            </div>
            {annualDisplay && (
              <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                <span>
                  or <span className="text-white font-semibold">{annualDisplay}</span> {annualLabel}
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green/20 text-green"
                >
                  SAVE {annualDiscountPct}%
                </span>
              </div>
            )}
          </>
        ) : (
          annualDisplay && (
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
              <span className="text-4xl font-black" style={{ color }}>{annualDisplay}</span>
              <span className="text-slate-400 text-sm">{annualLabel}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-green/20 text-green">
                SAVE {annualDiscountPct}%
              </span>
            </div>
          )
        )}
      </div>

      <ul className="space-y-2.5 flex-1 mb-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
            <CheckCircle size={15} className="mt-0.5 flex-shrink-0" style={{ color }} />
            {f}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        {annualDisplay && (
          <Button
            className="w-full"
            variant="primary"
            disabled={busy !== null}
            onClick={() => handleBuy('annual')}
          >
            {busy === 'annual'
              ? 'Redirecting…'
              : `${annualMonths === 24 ? `2 Years · ${annualDisplay}` : `Annual · ${annualDisplay}`} (SAVE ${annualDiscountPct}%)`}
          </Button>
        )}
        {monthlyDisplay && (
          <Button
            className="w-full"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => handleBuy('monthly')}
          >
            {busy === 'monthly' ? 'Redirecting…' : `Get ${name} · ${monthlyDisplay}/mo`}
          </Button>
        )}
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      </div>
    </motion.div>
  )
}

export function PlansPage() {
  const [showAngolan, setShowAngolan] = useState(false)
  const [discountPct, setDiscountPct] = useState(0)
  const [promoInput, setPromoInput] = useState('')
  const [applying, setApplying] = useState(false)

  const applyPromo = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = promoInput.trim()
    if (!code) return
    setApplying(true)
    try {
      const info = await getCodeInfo(code)
      if (info.discount_pct > 0) {
        setDiscountPct(info.discount_pct)
        toast.success(`Código aplicado — ${info.discount_pct}% de desconto em todos os planos!`)
      } else {
        toast('Este código não tem desconto associado.', { icon: 'ℹ️' })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-purple/10 border border-purple/20 rounded-full px-4 py-1.5 text-sm text-purple mb-4">
          <Zap size={14} /> Flexible Plans for Every Learner
        </div>
        <h1 className="text-3xl font-black text-white mb-3">
          Invest in Your <span className="text-gradient-purple-cyan">English Future</span>
        </h1>
        <p className="text-slate-400 max-w-md mx-auto mb-5">
          Cancel anytime. All plans include AI-powered lessons, speaking practice and chat.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setShowAngolan(true)}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 via-black to-yellow-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:scale-105 transition-transform"
          >
            <Flag size={16} /> 🇦🇴 Para Angolanos, pagar por IBAN
          </button>
          <form onSubmit={applyPromo} className="inline-flex items-center gap-2">
            <div className="relative">
              <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                placeholder="Código de desconto"
                className="bg-bg-elevated border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan/50 w-44"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={applying}>
              {applying ? '…' : 'Aplicar'}
            </Button>
          </form>
        </div>
        {discountPct > 0 && (
          <p className="text-cyan text-sm font-semibold mt-3">
            ✓ {discountPct}% de desconto aplicado a todos os planos
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} index={i} currency="EUR" discountPct={discountPct} />
        ))}
      </div>

      {/* Doctor English */}
      <div className="mt-6 bg-bg-card border border-green/20 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-white font-bold flex items-center gap-2 mb-1">
            🩺 Doctor English Student
          </div>
          <p className="text-sm text-slate-400">
            Special access for selected students, with real practice alongside native English speakers.
          </p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Ola Anselmo!\n\nQuero saber mais sobre o *Doctor English* e ter acesso.\n\nObrigado!')}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm">Request Access</Button>
        </a>
      </div>

      <AnimatePresence>
        {showAngolan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4"
            onClick={() => setShowAngolan(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-bg-base border border-white/10 rounded-2xl max-w-6xl w-full my-8 p-6 md:p-8 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowAngolan(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-4 py-1.5 text-sm text-yellow-400 mb-3">
                  <Flag size={14} /> 🇦🇴 Planos para Angolanos
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
                  Pagamento por <span className="text-gradient-purple-cyan">IBAN</span>
                </h2>
                <p className="text-slate-400 text-sm max-w-lg mx-auto">
                  Todos os valores em Kwanzas (Kz). Ao escolher um plano, abre o WhatsApp para pedir as coordenadas bancárias (IBAN) com segurança.
                </p>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                {plans.map((plan, i) => (
                  <PlanCard key={plan.id} plan={plan} index={i} currency="AOA" discountPct={discountPct} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

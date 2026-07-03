// ─────────────────────────────────────────────────────────────────────────────
// Canonical plan model — single source of truth for what each plan gives you.
//
// The stored `PlanType` (profiles.plan) evolved separately from the marketing
// plans on the Plans page, so we map it onto 5 clean TIERS here. All gating
// (chat/speaking limits, lesson-unlock pacing) reads from this file so the
// rules live in exactly one place. This is the structure Stripe will plug into
// later; for now it just drives limits + unlocking.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlanType } from '../types'

export type PlanTier = 'basic' | 'super' | 'family' | 'family_tutor' | 'power'

// Map the stored plan value → a tier. Doctor English is top-of-the-line, so it
// inherits Power's generosity. 'free' is the entry tier (Basic).
export function planTier(plan: PlanType | null | undefined): PlanTier {
  switch (plan) {
    case 'monthly':
    case 'annual':          return 'super'
    case 'family':          return 'family'
    case 'family_tutor':    return 'family_tutor'
    case 'power_all_access':return 'power'
    case 'doctor_english':  return 'power'
    case 'free':
    case 'basic':
    default:                return 'basic'
  }
}

// ── Usage limits per tier ──────────────────────────────────────────────────────
// Speaking amounts are the SAME across tiers (3 min talk, 2 min group); what
// changes is how often the allowance renews. Basic/Family renew daily/weekly;
// Super/Family+Tutor/Power renew on short rolling windows so paying users get
// far more throughput while bursty (expensive) usage is still capped.
export interface SpeakingLimit {
  seconds: number       // allowance per window
  windowHours: number   // how often it renews
}
export interface TierLimits {
  chatPerDay: number | null   // null = unlimited chat
  talk: SpeakingLimit         // push-to-talk
  group: SpeakingLimit        // group conversation
  phonecallWindowHours: number // one tutor call per this window
}

const DAY = 24
const WEEK = 24 * 7

// Basic & Family share the tight, cheap allowance.
const ENTRY_LIMITS: TierLimits = {
  chatPerDay: 50,
  talk:  { seconds: 3 * 60, windowHours: DAY },
  group: { seconds: 2 * 60, windowHours: DAY },
  phonecallWindowHours: WEEK,   // 1 call / week
}

// Super, Family+Tutor & Power: much bigger chat allowance (marketed as
// "Unlimited"; 100/day is a safety cap a normal user never reaches), and
// speaking renews fast.
const PREMIUM_LIMITS: TierLimits = {
  chatPerDay: 100,
  talk:  { seconds: 3 * 60, windowHours: 2 },  // renews every 2h
  group: { seconds: 2 * 60, windowHours: 1 },  // renews every 1h
  phonecallWindowHours: DAY,   // 1 call / day
}

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  basic:        ENTRY_LIMITS,
  family:       ENTRY_LIMITS,
  super:        PREMIUM_LIMITS,
  family_tutor: PREMIUM_LIMITS,
  power:        PREMIUM_LIMITS,
}

export function limitsFor(plan: PlanType | null | undefined): TierLimits {
  return TIER_LIMITS[planTier(plan)]
}

// Downloadable lesson PDFs are a Super / Family+Tutor / Power perk.
export function canDownloadPdf(plan: PlanType | null | undefined): boolean {
  const t = planTier(plan)
  return t === 'super' || t === 'family_tutor' || t === 'power'
}

// Whether this plan is a Family plan (gets the family-management dashboard).
export function hasFamilyPlan(plan: PlanType | null | undefined): boolean {
  const t = planTier(plan)
  return t === 'family' || t === 'family_tutor'
}

// ── Lesson-unlock pacing per plan ──────────────────────────────────────────────
// Rate at which the course opens up. Monthly billing stays at the 1-lesson-a-day
// floor; annual/premium plans open faster. Power (annual/2-year only) is special:
// it opens the WHOLE course over your first month, 25% each week.
//
// The stored PlanType already encodes Super's billing period (`monthly` vs
// `annual`), so we can honor "monthly = 1/day, annual = 2/day" today. Basic
// (`free`) and Family have no annual variant stored yet, so they stay at 1/day
// until the Stripe billing structure adds a per-plan billing period.
type UnlockRule = { perDay: number } | { weeklyRamp: 4 }

export function unlockRule(plan: PlanType | null | undefined): UnlockRule {
  switch (plan) {
    case 'power_all_access':
    case 'doctor_english':   return { weeklyRamp: 4 }  // whole course in ~1 month
    case 'annual':           return { perDay: 2 }      // Super (annual)
    case 'monthly':          return { perDay: 1 }      // Super (monthly)
    case 'family':           return { perDay: 1 }
    case 'free':                                       // Basic
    default:                 return { perDay: 1 }
  }
}

// How many lessons are unlocked for this plan after `daysElapsed` days enrolled.
export function planUnlockCount(
  plan: PlanType | null | undefined,
  daysElapsed: number,
  total: number,
): number {
  const days = Math.max(0, daysElapsed)
  const rule = unlockRule(plan)
  if ('weeklyRamp' in rule) {
    const weeksElapsed = Math.floor(days / 7) + 1 // week 1 from day 0
    return Math.min(total, Math.ceil(total * Math.min(1, weeksElapsed / rule.weeklyRamp)))
  }
  return Math.min(total, (days + 1) * rule.perDay)
}

// Short human label for the unlock pace (shown on the Lessons header).
export function unlockPaceLabel(plan: PlanType | null | undefined): string {
  const rule = unlockRule(plan)
  if ('weeklyRamp' in rule) return 'whole course opens over your first month'
  return rule.perDay === 1 ? '1 per day' : `${rule.perDay} per day`
}

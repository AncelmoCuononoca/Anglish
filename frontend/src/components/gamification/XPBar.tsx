import { xpToNextLevel, formatXP } from '../../lib/utils'

interface XPBarProps {
  xp: number
  compact?: boolean
}

export function XPBar({ xp, compact = false }: XPBarProps) {
  const { current, needed, percent } = xpToNextLevel(xp)

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-cyan font-mono">{formatXP(xp)} XP</span>
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden min-w-[60px]">
          <div className="xp-bar-fill h-full rounded-full" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span className="text-cyan font-semibold">{formatXP(xp)} XP</span>
        <span>{formatXP(current)} / {formatXP(needed)} to next level</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="xp-bar-fill h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

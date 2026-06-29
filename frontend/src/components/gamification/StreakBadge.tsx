import { cn } from '../../lib/utils'

interface StreakBadgeProps {
  streak: number
  size?: 'sm' | 'md' | 'lg'
}

export function StreakBadge({ streak, size = 'md' }: StreakBadgeProps) {
  const isHot = streak >= 7

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-xl font-bold',
        isHot ? 'text-gold' : 'text-slate-400',
        {
          'px-2 py-1 text-xs': size === 'sm',
          'px-3 py-1.5 text-sm': size === 'md',
          'px-4 py-2 text-base': size === 'lg',
        }
      )}
    >
      <span className={cn('text-xl', isHot && 'streak-fire')}>🔥</span>
      <span>{streak}</span>
      <span className="font-normal opacity-70 text-xs">days</span>
    </div>
  )
}

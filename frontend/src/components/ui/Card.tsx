import { cn } from '../../lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  glow?: 'purple' | 'cyan' | 'green' | 'gold' | 'none'
  hover?: boolean
}

export function Card({ children, glow = 'none', hover = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-bg-card rounded-2xl border border-white/5 p-5',
        hover && 'card-hover cursor-pointer',
        {
          'hover:border-purple/40': glow === 'purple',
          'hover:border-cyan/40': glow === 'cyan',
          'hover:border-green/40': glow === 'green',
          'hover:border-gold/40': glow === 'gold',
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

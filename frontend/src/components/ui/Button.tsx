import { cn } from '../../lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 select-none',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        {
          // sizes
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-5 py-2.5 text-sm': size === 'md',
          'px-7 py-3.5 text-base': size === 'lg',
          // variants
          'bg-purple text-white hover:bg-purple-light focus:ring-purple shadow-glow-purple hover:shadow-glow-purple':
            variant === 'primary',
          'bg-bg-elevated border border-purple/40 text-purple hover:border-purple hover:bg-purple/10 focus:ring-purple':
            variant === 'secondary',
          'text-slate-400 hover:text-white hover:bg-white/5 focus:ring-white/20':
            variant === 'ghost',
          'bg-pink/10 border border-pink/40 text-pink hover:bg-pink/20 focus:ring-pink':
            variant === 'danger',
          'bg-gold text-bg font-bold hover:bg-gold-light focus:ring-gold shadow-glow-gold':
            variant === 'gold',
        },
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}

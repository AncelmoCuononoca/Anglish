import { cn } from '../../lib/utils'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

export function Input({ label, error, icon, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-300">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </div>
        )}
        <input
          className={cn(
            'w-full bg-bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white',
            'placeholder:text-slate-500 focus:outline-none focus:border-purple focus:ring-1 focus:ring-purple/50',
            'transition-all duration-200',
            icon && 'pl-10',
            error && 'border-pink focus:border-pink focus:ring-pink/50',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-pink">{error}</p>}
    </div>
  )
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Always show the exact XP with thousands separators (e.g. 1255 → "1,255"),
// so the value is identical everywhere it appears (sidebar, dashboard, profile,
// ranking). No "k" rounding, which used to make 1,255 look like "1.3k".
export function formatXP(xp: number): string {
  return Math.round(xp).toLocaleString('en-US')
}

export function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    A1: 'Beginner',
    A2: 'Elementary',
    B1: 'Intermediate',
    B2: 'Upper Intermediate',
    C1: 'Advanced',
    C2: 'Mastery',
  }
  return labels[level] ?? level
}

export function getLevelColor(level: string): string {
  const colors: Record<string, string> = {
    A1: '#00FF88',
    A2: '#00D4FF',
    B1: '#7F77DD',
    B2: '#FF006E',
    C1: '#FFD700',
    C2: '#FF6B35',
  }
  return colors[level] ?? '#7F77DD'
}

export function xpToNextLevel(xp: number): { current: number; needed: number; percent: number } {
  const thresholds = [0, 500, 1500, 3500, 7000, 12000, 20000]
  let idx = 0
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (xp >= thresholds[i]) idx = i
  }
  const current = xp - thresholds[idx]
  const needed = thresholds[idx + 1] - thresholds[idx]
  return { current, needed, percent: Math.min((current / needed) * 100, 100) }
}

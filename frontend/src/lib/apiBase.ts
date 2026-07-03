// URL base do backend, resolvido uma vez para toda a app.
//
// Regras:
// - Se VITE_API_URL estiver definido no build, usa esse valor (produção correta).
// - Sem env var:
//     • em localhost/127.0.0.1 → '' (caminhos relativos /api → proxy do Vite, sem CORS).
//     • em qualquer outro host (produção) → backend do Railway como fallback,
//       para o site nunca ficar sem API mesmo que a env var da Vercel falte.
const RAILWAY_BACKEND = 'https://anglish-production.up.railway.app'

function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_URL
  if (env) return env.replace(/\/+$/, '')

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return ''
    return RAILWAY_BACKEND
  }
  return ''
}

export const API_BASE = resolveApiBase()

// URL base do backend, resolvido uma vez para toda a app.
//
// Depois da migração Railway → Supabase Edge Functions, o backend deixa de ter
// URL própria: o browser chama caminhos RELATIVOS `/api/*` (mesmo domínio, sem
// CORS) e o rewrite do `vercel.json` reencaminha `/api/:path*` para
// `.../functions/v1/:path*`. Em dev, o proxy do Vite (vite.config.ts) faz o
// mesmo papel para `/api`.
//
// Regras:
// - `VITE_API_URL` (se definido no build) é um OVERRIDE explícito. Serve de
//   ALAVANCA DE ROLLBACK: apontá-lo de volta ao Railway
//   (https://anglish-production.up.railway.app) repõe o backend antigo sem
//   tocar no código. Deixar VAZIO em produção para usar o rewrite → Supabase.
// - Sem `VITE_API_URL`: base vazia → caminhos relativos `/api/*`, servidos pelo
//   rewrite da Vercel (produção) ou pelo proxy do Vite (dev). É o caminho normal
//   pós-migração.
function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_URL
  if (env) return env.replace(/\/+$/, '')
  return ''
}

export const API_BASE = resolveApiBase()

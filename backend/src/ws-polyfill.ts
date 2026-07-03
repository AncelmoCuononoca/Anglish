// @supabase/supabase-js constrói um RealtimeClient dentro do construtor do
// SupabaseClient, e este exige um `WebSocket` GLOBAL. O Node < 22 não o tem, por
// isso `createClient()` LANÇA ("Node.js 18 detected without native WebSocket
// support") e rebenta TODAS as rotas autenticadas (requireAuth) com 500.
//
// Solução: expor a implementação do pacote `ws` como WebSocket global ANTES de
// qualquer cliente Supabase ser criado. No Node 22+ (que já tem WebSocket
// nativo) isto é um no-op. Importado logo a seguir ao load-env no index.ts.
import ws from 'ws'

const g = globalThis as unknown as { WebSocket?: unknown }
if (typeof g.WebSocket === 'undefined') {
  g.WebSocket = ws
}

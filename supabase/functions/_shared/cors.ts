// Mirrors backend/src/index.ts's cors({ origin: FRONTEND_URL, credentials: true }).
// Edge Functions have no framework-level CORS middleware, so every function
// applies this manually: call corsHeaders() for the actual response headers,
// and short-circuit OPTIONS preflight requests with handlePreflight(req).

const ALLOWED_ORIGIN = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000'

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  }
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }
  return null
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...(init.headers ?? {}) },
  })
}

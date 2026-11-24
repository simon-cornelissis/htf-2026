// Server-only: the /mcp endpoint (MCP Streamable HTTP, stateless, JSON responses).
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { runAs } from '#/lib/session.ts'
import { createAchronaMcpServer } from './server.ts'
import { guardianForToken } from './tokens.ts'

/** Extra browser origins allowed to call /mcp, comma separated (e.g. an MCP inspector). */
const EXTRA_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: status === 401 ? -32001 : -32000, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/**
 * DNS-rebinding protection (MCP spec, Streamable HTTP "Security Warning"):
 * desktop clients send no Origin; a browser always does, and then it must be
 * this app itself, localhost, or explicitly allowed.
 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return origin === null
  if (EXTRA_ORIGINS.includes(origin)) return true
  try {
    const o = new URL(origin)
    if (o.origin === new URL(request.url).origin) return true
    return o.hostname === 'localhost' || o.hostname === '127.0.0.1' || o.hostname === '[::1]'
  } catch {
    return false
  }
}

export async function handleMcpPost(request: Request): Promise<Response> {
  if (!originAllowed(request)) return jsonRpcError(403, 'Origin not allowed.')

  const auth = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)\s*$/i.exec(auth)
  const challenge = { 'www-authenticate': 'Bearer realm="achrona-mcp"' }
  if (!match) {
    return jsonRpcError(401, 'Missing access token. Create one on the "MCP access" page and send it as "Authorization: Bearer <token>".', challenge)
  }
  const guardian = guardianForToken(match[1])
  if (!guardian) {
    return jsonRpcError(401, 'This access token is unknown or was revoked. Create a new one on the "MCP access" page.', {
      'www-authenticate': 'Bearer realm="achrona-mcp", error="invalid_token"',
    })
  }

  // Stateless: a fresh server and transport per request, scoped to this guardian.
  const server = createAchronaMcpServer(guardian)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return await runAs(guardian, () => transport.handleRequest(request))
  } finally {
    // JSON mode: the response is complete once handleRequest resolves.
    void server.close().catch(() => {})
  }
}

/** No server-initiated stream in stateless mode, and no sessions to delete. */
export function mcpMethodNotAllowed(): Response {
  return jsonRpcError(405, 'Method not allowed. Send MCP requests as POST.', { allow: 'POST' })
}

/** Per-request context that routes cannot derive from the Request alone. */
export interface RouteContext {
  /**
   * Remote peer address, or null when unavailable. Resolved from the server
   * socket rather than a proxy header, which a caller could spoof.
   */
  clientAddress?: string | null;
  /**
   * Which API key authenticated a `/v1/*` request, or null on the session-authed
   * `/api/*` routes. The router needs it to apply that key's provider/model
   * scope and token budget.
   */
  apiKeyId?: string | null;
}

export type RouteHandler = (
  req: Request,
  params?: Record<string, string>,
  context?: RouteContext,
) => Response | Promise<Response>;

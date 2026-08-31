/** Per-request context that routes cannot derive from the Request alone. */
export interface RouteContext {
  /**
   * Remote peer address, or null when unavailable. Resolved from the server
   * socket rather than a proxy header, which a caller could spoof.
   */
  clientAddress: string | null;
}

export type RouteHandler = (
  req: Request,
  params?: Record<string, string>,
  context?: RouteContext,
) => Response | Promise<Response>;

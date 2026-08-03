export type RouteHandler = (req: Request, params?: Record<string, string>) => Response | Promise<Response>;

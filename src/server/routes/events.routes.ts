import * as EventBus from "../services/event-bus";
import type { RouteHandler } from "./types";

export const eventsRoutes: Record<string, RouteHandler> = {
  "GET /api/events": () => {
    return EventBus.subscribe();
  },
};

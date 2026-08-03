import { handleChatRequest } from "../services/router.service";
import type { RouteHandler } from "./types";

export const v1Routes: Record<string, RouteHandler> = {
  "POST /v1/chat/completions": async (req) => {
    const body = await req.json();
    const tokenSaver = req.headers.get("x-token-saver") as "on" | "off" | null;

    const result = await handleChatRequest({
      rawBody: body,
      sourceFormat: "openai",
      targetSelector: body.model ?? "default",
      tokenSaverOverride: tokenSaver ?? undefined,
      stream: body.stream ?? false,
    });

    return new Response(
      typeof result.body === "string" ? result.body : JSON.stringify(result.body),
      { status: result.status, headers: result.headers },
    );
  },

  "POST /v1/messages": async (req) => {
    const body = await req.json();
    const tokenSaver = req.headers.get("x-token-saver") as "on" | "off" | null;

    const result = await handleChatRequest({
      rawBody: body,
      sourceFormat: "anthropic",
      targetSelector: body.model ?? "default",
      tokenSaverOverride: tokenSaver ?? undefined,
      stream: body.stream ?? false,
    });

    return new Response(
      typeof result.body === "string" ? result.body : JSON.stringify(result.body),
      { status: result.status, headers: result.headers },
    );
  },

  "GET /v1/models": () => {
    // Return empty model list for now — models are configured via combos
    return Response.json({ object: "list", data: [] });
  },
};

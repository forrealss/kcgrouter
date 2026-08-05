import { listAllEnabledModels } from "../services/model-registry.service";
import { handleChatRequest } from "../services/router.service";
import type { RouteHandler } from "./types";

/**
 * Builds the HTTP response from a router result.
 *
 * Streaming results carry a ReadableStream of pre-encoded SSE bytes, which must
 * be handed to Response untouched — JSON.stringify() on a stream yields "{}",
 * so the client receives two characters and no events.
 */
function toResponse(result: {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}): Response {
  if (result.body instanceof ReadableStream) {
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  const payload =
    typeof result.body === "string" ? result.body : JSON.stringify(result.body);

  return new Response(payload, {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      ...result.headers,
    },
  });
}

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

    return toResponse(result);
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

    return toResponse(result);
  },

  "GET /v1/models": () => {
    const models = listAllEnabledModels();
    const data = models.map((m) => ({
      id: `${m.prefix}/${m.modelId}`,
      object: "model" as const,
      created: Math.floor(new Date(m.createdAt).getTime() / 1000),
      owned_by: m.prefix,
    }));
    return Response.json({ object: "list", data });
  },
};

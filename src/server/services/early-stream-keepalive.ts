import { doneBytes, OPENAI_SSE_HEADERS } from "./sse-encoder.service";

const encoder = new TextEncoder();

const OPENAI_KEEPALIVE_FRAME = encoder.encode(
  'data: {"id":"kcgrouter-keepalive","object":"chat.completion.chunk","created":0,"model":"kcgrouter","choices":[{"index":0,"delta":{},"finish_reason":null}]}\n\n',
);

const OPENAI_ERROR_FRAME = encoder.encode(
  'data: {"error":{"message":"Upstream stream failed before completion.","type":"stream_error"}}\n\n',
);

interface EarlyStreamKeepaliveOptions {
  thresholdMs?: number;
  intervalMs?: number;
  signal?: AbortSignal | null;
  /**
   * Frame emitted while waiting for the upstream's first byte. Defaults to
   * an OpenAI-compatible chunk; pass Anthropic-compatible frames for
   * `/v1/messages` responses.
   */
  keepaliveFrame?: Uint8Array;
  /** In-band error frame emitted when the upstream never produced a stream. */
  errorFrame?: Uint8Array;
  /**
   * Final frame appended when the wrapped stream ends. Defaults to OpenAI's
   * `[DONE]` sentinel. Set to `null` for Anthropic responses, which terminate
   * with their own `message_stop` event.
   */
  doneFrame?: Uint8Array | null;
  /** SSE headers for the wrapper response. Defaults to OpenAI SSE headers. */
  headers?: Record<string, string>;
}

export async function withEarlyStreamKeepalive(
  handlerPromise: Promise<Response>,
  options: EarlyStreamKeepaliveOptions = {},
): Promise<Response> {
  const thresholdMs = Math.max(0, options.thresholdMs ?? 2_000);
  const intervalMs = Math.max(250, options.intervalMs ?? 2_500);
  const signal = options.signal ?? null;
  const keepaliveFrame = options.keepaliveFrame ?? OPENAI_KEEPALIVE_FRAME;
  const errorFrame = options.errorFrame ?? OPENAI_ERROR_FRAME;
  const doneFrame =
    options.doneFrame === undefined ? doneBytes() : options.doneFrame;
  const headers = options.headers ?? OPENAI_SSE_HEADERS;

  const settled: Promise<
    | { status: "fulfilled"; response: Response }
    | { status: "rejected"; error: unknown }
  > = handlerPromise.then(
    (response) => ({ status: "fulfilled" as const, response }),
    (error) => ({ status: "rejected" as const, error }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const raced = await Promise.race([
    settled.then((result) => ({ kind: "settled" as const, result })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), thresholdMs);
    }),
  ]);
  if (timer) clearTimeout(timer);

  if (raced.kind === "settled") {
    const result = raced.result;
    if (result.status === "fulfilled") return result.response;
    throw result.error;
  }

  let stopKeepalive = () => {};
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let stopped = false;
      const interval = setInterval(() => {
        if (stopped) return;
        try {
          controller.enqueue(keepaliveFrame);
        } catch {
          stopped = true;
          clearInterval(interval);
        }
      }, intervalMs);
      if (interval && typeof interval === "object" && "unref" in interval) {
        (interval as unknown as { unref(): void }).unref();
      }

      try {
        controller.enqueue(keepaliveFrame);
      } catch {
        /* consumer already gone */
      }

      stopKeepalive = () => {
        stopped = true;
        clearInterval(interval);
      };

      const onAbort = () => {
        if (aborted) return;
        aborted = true;
        stopKeepalive();
        upstreamReader?.cancel().catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();

      try {
        const result = await settled;
        stopKeepalive();
        if (aborted) {
          if (result.status === "fulfilled" && result.response.body) {
            await result.response.body.cancel().catch(() => undefined);
          }
          return;
        }

        if (result.status === "rejected") {
          controller.enqueue(errorFrame);
        } else {
          const response = result.response;
          const contentType = (
            response.headers.get("content-type") ?? ""
          ).toLowerCase();
          const isSse = contentType.includes("text/event-stream");

          if (response.body && isSse) {
            upstreamReader = response.body.getReader();
            let bytesForwarded = 0;
            try {
              while (true) {
                const { done, value } = await upstreamReader.read();
                if (done) break;
                if (value) {
                  controller.enqueue(value);
                  bytesForwarded += value.byteLength;
                }
              }
            } catch {
              if (bytesForwarded === 0) {
                controller.enqueue(errorFrame);
              }
            }
          } else {
            controller.enqueue(errorFrame);
          }
        }
      } catch {
        if (!aborted) {
          try {
            controller.enqueue(errorFrame);
          } catch {
            /* consumer gone */
          }
        }
      } finally {
        stopKeepalive();
        signal?.removeEventListener("abort", onAbort);
        try {
          if (doneFrame !== null) {
            controller.enqueue(doneFrame);
          }
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      aborted = true;
      stopKeepalive();
      upstreamReader?.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    status: 200,
    headers,
  });
}

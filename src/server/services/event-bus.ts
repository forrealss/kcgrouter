import type { ReadableStreamDefaultController } from "node:stream/web";

type Subscriber = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const subscribers = new Map<string, Subscriber>();
let nextId = 0;

const textEncoder = new TextEncoder();

function sseFrame(event: string, data: string): Uint8Array {
  return textEncoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function subscribe(): Response {
  const id = `sub_${++nextId}`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscribers.set(id, { id, controller });
      // send initial connection ack
      controller.enqueue(sseFrame("connected", JSON.stringify({ id })));
    },
    cancel() {
      subscribers.delete(id);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function publish(event: string, data: unknown): void {
  const frame = sseFrame(event, JSON.stringify(data));
  const dead: string[] = [];

  for (const [id, sub] of subscribers) {
    try {
      sub.controller.enqueue(frame);
    } catch {
      // subscriber disconnected, remove it
      dead.push(id);
    }
  }

  for (const id of dead) subscribers.delete(id);
}

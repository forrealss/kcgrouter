import { useEffect, useState } from "react";

export type SseStatus = "connecting" | "live" | "offline";

type Listener = (event: MessageEvent) => void;

/**
 * Process-wide singleton EventSource for `/api/events`.
 *
 * Several dashboard widgets react to the same router events (the activity
 * feed, the usage graph, the LIVE indicator). Opening one connection per
 * hook wastes a server-side SSE subscriber each, so they all share this one
 * and it closes only when the last subscriber unmounts.
 */
let source: EventSource | null = null;
let refCount = 0;
let status: SseStatus = "connecting";

const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Set<(s: SseStatus) => void>();

function setStatus(next: SseStatus) {
  if (status === next) return;
  status = next;
  for (const cb of statusListeners) cb(next);
}

function dispatch(type: string, event: MessageEvent) {
  const set = listeners.get(type);
  if (!set) return;
  for (const cb of set) cb(event);
}

const KNOWN_EVENTS = [
  "connected",
  "log:new",
  "request:complete",
  "account:cooldown",
  "account:recovered",
] as const;

function ensureOpen() {
  if (source) return;
  setStatus("connecting");
  const es = new EventSource("/api/events");
  source = es;
  es.onopen = () => setStatus("live");
  es.onerror = () => setStatus("offline");
  for (const type of KNOWN_EVENTS) {
    es.addEventListener(type, (e) => {
      // any frame arriving proves the stream is alive
      setStatus("live");
      dispatch(type, e as MessageEvent);
    });
  }
}

function releaseIfIdle() {
  if (refCount > 0 || !source) return;
  source.close();
  source = null;
  status = "connecting";
}

/**
 * Subscribe to one router event type on the shared stream.
 * `handler` should be stable (wrapped in `useCallback`) to avoid resubscribing.
 */
export function useSseEvent(type: string, handler: Listener): void {
  useEffect(() => {
    refCount += 1;
    ensureOpen();

    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(handler);

    return () => {
      set?.delete(handler);
      if (set && set.size === 0) listeners.delete(type);
      refCount -= 1;
      releaseIfIdle();
    };
  }, [type, handler]);
}

/** Current connection state of the shared stream. */
export function useSseStatus(): SseStatus {
  const [value, setValue] = useState<SseStatus>(status);

  useEffect(() => {
    refCount += 1;
    ensureOpen();
    setValue(status);
    statusListeners.add(setValue);
    return () => {
      statusListeners.delete(setValue);
      refCount -= 1;
      releaseIfIdle();
    };
  }, []);

  return value;
}

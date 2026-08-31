import { useCallback, useEffect, useState } from "react";
import { useTicker } from "@/hooks/useTicker";

/**
 * Tracks a login lockout deadline and exposes the live seconds remaining.
 *
 * Stores an absolute timestamp rather than a decrementing counter so the
 * countdown stays honest if the tab is backgrounded and timers are throttled —
 * on return it reflects real elapsed time instead of however many ticks fired.
 */
export function useLoginLockout() {
  const [until, setUntil] = useState<number | null>(null);

  const locked = until !== null && until > Date.now();

  // Only run the interval while actually counting down.
  useTicker(locked);

  const secondsRemaining = locked
    ? Math.max(0, Math.ceil((until - Date.now()) / 1000))
    : 0;

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) {
      setUntil(null);
      return;
    }
    setUntil(Date.now() + seconds * 1000);
  }, []);

  const clear = useCallback(() => setUntil(null), []);

  // Drop the deadline once it passes so `locked` settles to false and the
  // ticker stops, instead of leaving a stale timestamp behind.
  useEffect(() => {
    if (until === null) return;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      setUntil(null);
      return;
    }
    const id = setTimeout(() => setUntil(null), remaining);
    return () => clearTimeout(id);
  }, [until]);

  return { locked, secondsRemaining, start, clear };
}

/** Format a countdown as `m:ss` past a minute, plain seconds below it. */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

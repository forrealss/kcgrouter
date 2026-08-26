import { useEffect, useState } from "react";

/**
 * Re-renders the caller once per second while `active` is true, so that
 * derived countdown values (e.g. remaining cooldown seconds) stay live.
 * The interval tears itself down as soon as `active` flips to false.
 */
export function useTicker(active: boolean, intervalMs = 1000): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
}

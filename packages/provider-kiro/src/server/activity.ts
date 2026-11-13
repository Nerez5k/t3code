// @effect-diagnostics globalDate:off - The interval gate is a plain synchronous predicate, outside an Effect runtime.
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
let lastTurnEndedAt = 0;

/** Called when a Kiro turn ends; keeps the 5-minute probe running while Kiro is in use. */
export function markKiroTurnFinished(now: number = Date.now()): void {
  lastTurnEndedAt = now;
}

export function kiroRecentlyActive(now: number = Date.now()): boolean {
  return now - lastTurnEndedAt < ACTIVE_WINDOW_MS;
}

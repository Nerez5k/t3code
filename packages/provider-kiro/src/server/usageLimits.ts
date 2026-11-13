import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { clampPercent, makeUsageLimits } from "@t3tools/provider-core/server/usageLimits";

/**
 * Kiro credits as limit bars, parsed from the text of Kiro's `/usage`, which bills
 * nothing. Labels carry the amounts ("Credits 4.4/50"); a window holds only a percentage.
 */

const RESETS_ON = /resets on (\d{4}-\d{2}-\d{2})/i;
const PLAN_CREDITS = /Credits \(([\d.,]+) of ([\d.,]+) covered in plan\)/i;
const BONUS_LINE = /^\s*([^:\n]+?):\s*([\d.,]+)\s*\/\s*([\d.,]+) credits used/gim;

function parseAmount(value: string): number {
  return Number(value.replace(/,/g, ""));
}

/** One decimal under 100, whole numbers above, so a label stays short. */
export function formatCredits(value: number): string {
  if (Number.isInteger(value) || value >= 100) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}

function percent(used: number, limit: number): number {
  return limit > 0 ? clampPercent((used / limit) * 100) : 100;
}

export function kiroUsageWindowsFromText(text: string): ReadonlyArray<ServerProviderUsageWindow> {
  const windows: ServerProviderUsageWindow[] = [];
  const plan = PLAN_CREDITS.exec(text);
  if (plan?.[1] !== undefined && plan[2] !== undefined) {
    const used = parseAmount(plan[1]);
    const limit = parseAmount(plan[2]);
    if (Number.isFinite(used) && Number.isFinite(limit)) {
      const resetsOn = RESETS_ON.exec(text)?.[1];
      windows.push({
        id: "credits",
        kind: "monthly",
        label: `Credits ${formatCredits(used)}/${formatCredits(limit)}`,
        usedPercent: percent(used, limit),
        ...(resetsOn !== undefined ? { resetsAt: `${resetsOn}T00:00:00.000Z` } : {}),
      });
    }
  }
  for (const match of text.matchAll(BONUS_LINE)) {
    const name = match[1]?.trim();
    if (!name || match[2] === undefined || match[3] === undefined) continue;
    const used = parseAmount(match[2]);
    const limit = parseAmount(match[3]);
    if (!Number.isFinite(used) || !Number.isFinite(limit)) continue;
    windows.push({
      id: `bonus:${name}`,
      kind: "other",
      label: `Bonus ${formatCredits(used)}/${formatCredits(limit)}`,
      usedPercent: percent(used, limit),
    });
  }
  return windows;
}

/** The `/usage` reply and session id from `kiro-cli chat --output-format stream-json /usage`. */
export function kiroUsageFromStreamJson(stdout: string): {
  readonly text: string | undefined;
  readonly sessionId: string | undefined;
} {
  let text: string | undefined;
  let sessionId: string | undefined;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof event !== "object" || event === null) continue;
    const { type, data } = event as { type?: unknown; data?: Record<string, unknown> };
    if (typeof data?.sessionId === "string") sessionId = data.sessionId;
    if (type === "runFinished" && typeof data?.finalText === "string") text = data.finalText;
  }
  return { text, sessionId };
}

export function kiroUsageLimits(
  text: string | undefined,
  checkedAt: string,
): ServerProviderUsageLimits | undefined {
  if (text === undefined) return undefined;
  const windows = kiroUsageWindowsFromText(text);
  return windows.length === 0 ? undefined : makeUsageLimits({ checkedAt, windows });
}

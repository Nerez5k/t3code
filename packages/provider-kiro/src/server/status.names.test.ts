import { describe, expect, it } from "@effect/vitest";

import { kiroRecentlyActive, markKiroTurnFinished } from "./activity.ts";
import { prettyKiroModelName } from "./status.ts";

describe("prettyKiroModelName", () => {
  it("shortens Kiro model ids", () => {
    expect(prettyKiroModelName("claude-opus-5.5")).toBe("Opus 5.5");
    expect(prettyKiroModelName("claude-sonnet-4.6")).toBe("Sonnet 4.6");
    expect(prettyKiroModelName("gpt-5.6-sol")).toBe("GPT-5.6 Sol");
    expect(prettyKiroModelName("kimi-k3")).toBe("Kimi K3");
    expect(prettyKiroModelName("grok-4.7")).toBe("Grok 4.7");
    expect(prettyKiroModelName("auto")).toBe("Auto");
    expect(prettyKiroModelName("Claude Opus 5.5")).toBe("Claude Opus 5.5");
  });
});

describe("kiroRecentlyActive", () => {
  it("stays active for ten minutes after a turn", () => {
    markKiroTurnFinished(1_000_000);
    expect(kiroRecentlyActive(1_000_000 + 9 * 60_000)).toBe(true);
    expect(kiroRecentlyActive(1_000_000 + 11 * 60_000)).toBe(false);
  });
});

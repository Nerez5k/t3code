import { describe, expect, it } from "@effect/vitest";

import {
  formatCredits,
  kiroUsageFromStreamJson,
  kiroUsageLimits,
  kiroUsageWindowsFromText,
} from "./usageLimits.ts";

const FREE_WITH_BONUS = [
  "Estimated Usage | resets on 2026-12-01 | KIRO FREE",
  "Bonus credits",
  "kiroween-20-26: 1346.13/4000 credits used, expires in 48 days",
  "Credits (4.43 of 50 covered in plan), 8.9%",
  "Manage your plan at https://app.kiro.dev/account/usage",
  "",
].join("\n");

describe("kiroUsageWindowsFromText", () => {
  it("reads plan credits and each bonus pool", () => {
    expect(kiroUsageWindowsFromText(FREE_WITH_BONUS)).toEqual([
      {
        id: "credits",
        kind: "monthly",
        label: "Credits 4.4/50",
        usedPercent: 8.86,
        resetsAt: "2026-12-01T00:00:00.000Z",
      },
      {
        id: "bonus:kiroween-20-26",
        kind: "other",
        label: "Bonus 1346/4000",
        usedPercent: (1346.13 / 4000) * 100,
      },
    ]);
  });

  it("reads plan credits without bonus pools", () => {
    const windows = kiroUsageWindowsFromText(
      "Estimated Usage | resets on 2027-01-01 | KIRO PRO\nCredits (1,250 of 1,000 covered in plan), 125%",
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ label: "Credits 1250/1000", usedPercent: 100 });
  });

  it("returns nothing for unrecognised text", () => {
    expect(kiroUsageWindowsFromText("Something else")).toEqual([]);
    expect(kiroUsageLimits("Something else", "2026-11-13T00:00:00.000Z")).toBeUndefined();
    expect(kiroUsageLimits(undefined, "2026-11-13T00:00:00.000Z")).toBeUndefined();
  });
});

describe("kiroUsageFromStreamJson", () => {
  it("takes the final text and the session id", () => {
    const stdout = [
      '{"type":"runStarted","data":{"payloadSchema":"acp"}}',
      '{"type":"metadata","data":{"sessionId":"abc"}}',
      "not json",
      JSON.stringify({
        type: "runFinished",
        data: { sessionId: "abc", finalText: FREE_WITH_BONUS },
      }),
    ].join("\n");
    expect(kiroUsageFromStreamJson(stdout)).toEqual({ text: FREE_WITH_BONUS, sessionId: "abc" });
  });
});

describe("formatCredits", () => {
  it("keeps labels short", () => {
    expect(formatCredits(4.43)).toBe("4.4");
    expect(formatCredits(50)).toBe("50");
    expect(formatCredits(1346.13)).toBe("1346");
  });
});

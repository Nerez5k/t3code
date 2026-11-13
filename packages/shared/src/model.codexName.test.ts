import { describe, expect, it } from "@effect/vitest";

import { formatCodexModelName, formatModelSlugName } from "./model.ts";

describe("formatCodexModelName", () => {
  it.each([
    ["gpt-6.1-sol", "GPT-6.1 Sol"],
    ["GPT-6.1-Sol", "GPT-6.1 Sol"],
    ["GPT-6.1 Terra", "GPT-6.1 Terra"],
    ["gpt-6-astra", "GPT-6 Astra"],
    ["gpt-7.2-nova-mini", "GPT-7.2 Nova Mini"],
    ["gpt-6.1", "GPT-6.1"],
    ["gpt-6.1-codex-5x", "GPT-6.1 Codex 5x"],
    ["o5-pro", "o5-pro"],
    ["Custom Model", "Custom Model"],
  ])("%s -> %s", (input, expected) => {
    expect(formatCodexModelName(input)).toBe(expected);
  });

  it("keeps a provider prefix on slugs", () => {
    expect(formatModelSlugName("github-copilot/gpt-6.1-sol")).toBe("github-copilot/GPT-6.1 Sol");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerContextMeter, contextMeterPercent } from "./ComposerContextMeter";

describe("contextMeterPercent", () => {
  it("rounds the share of the window in use", () => {
    expect(
      contextMeterPercent({ usedTokens: 50_000, maxTokens: 200_000, autoCompactThreshold: null }),
    ).toBe(25);
  });

  it("caps at 100 when usage passes the window", () => {
    expect(
      contextMeterPercent({ usedTokens: 300_000, maxTokens: 200_000, autoCompactThreshold: null }),
    ).toBe(100);
  });

  it("has no percent without a reported maximum", () => {
    expect(
      contextMeterPercent({ usedTokens: 1_000, maxTokens: null, autoCompactThreshold: null }),
    ).toBeNull();
    expect(
      contextMeterPercent({ usedTokens: 1_000, maxTokens: 0, autoCompactThreshold: null }),
    ).toBeNull();
  });
});

describe("ComposerContextMeter", () => {
  it("renders nothing before the provider reports usage", () => {
    expect(renderToStaticMarkup(<ComposerContextMeter usage={null} />)).toBe("");
  });

  it("names the used share and both token counts", () => {
    const html = renderToStaticMarkup(
      <ComposerContextMeter
        usage={{ usedTokens: 50_000, maxTokens: 200_000, autoCompactThreshold: null }}
      />,
    );
    expect(html).toContain('aria-label="Context: 25% used, 50k of 200k"');
  });
});

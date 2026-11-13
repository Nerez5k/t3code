import { describe, expect, it } from "vite-plus/test";
import { glyphFor, bayerThreshold, presetColor, PRESETS } from "./asciiBackground";

describe("background sampling", () => {
  it("clamps glyph density and preserves the full ramp", () => {
    expect(glyphFor(-1)).toBe(" ");
    expect(glyphFor(2)).toBe("@");
    expect(new Set(Array.from({ length: 10 }, (_, i) => glyphFor(i / 9))).size).toBe(10);
  });
  it("tiles all sixteen ordered thresholds without bias", () => {
    const thresholds = Array.from({ length: 16 }, (_, i) =>
      bayerThreshold(i % 4, Math.floor(i / 4)),
    );
    expect(new Set(thresholds).size).toBe(16);
    expect(thresholds.reduce((a, b) => a + b) / 16).toBe(0.5);
    expect(bayerThreshold(5, 6)).toBe(bayerThreshold(1, 2));
  });
  it("produces deterministic distinct preset samples", () => {
    const samples = PRESETS.map((p) => presetColor(p, 0.75, 0.65));
    expect(new Set(samples.map(String)).size).toBe(6);
    for (const [i, p] of PRESETS.entries()) expect(presetColor(p, 0.75, 0.65)).toEqual(samples[i]);
  });
});

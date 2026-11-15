import { describe, expect, it } from "vite-plus/test";

import { isProceduralPreset } from "./asciiBackground";
import { SCENES, sceneColor } from "./scenes";

const COLS = 160;
const ROWS = 90;

function frame(scene: (typeof SCENES)[number], t: number) {
  const levels: number[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const [r, g, b] = sceneColor(scene, x, y, COLS, ROWS, t);
      levels.push(Math.max(r, g, b) / 255);
    }
  return levels;
}

describe("dither scenes", () => {
  it.each(SCENES)("%s stays in colour range, shows bright detail and moves", (scene) => {
    expect(isProceduralPreset(scene)).toBe(true);
    const still = frame(scene, 0);
    const later = frame(scene, 6);
    expect(still.every((level) => Number.isFinite(level) && level >= 0 && level <= 1.2)).toBe(true);
    // Rain, crests, petals or flames: some cells reach the brightest glyphs.
    expect(still.filter((level) => level > 0.6).length).toBeGreaterThan(30);
    const changed = still.filter((level, index) => Math.abs(level - later[index]!) > 0.05).length;
    expect(changed).toBeGreaterThan(100);
  });
});

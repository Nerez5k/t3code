import { describe, expect, it } from "vite-plus/test";

import {
  PRESETS,
  TARGET_CONTRAST,
  contrastRatio,
  renderBackground,
  sampleCanvas,
  scrimAlphaForContrast,
  type BackgroundStyle,
  type Rgb,
} from "./asciiBackground";

const THEMES = {
  dark: { page: [13, 13, 17] as Rgb, text: [228, 228, 231] as Rgb, light: false },
  light: { page: [255, 255, 255] as Rgb, text: [24, 24, 27] as Rgb, light: true },
} as const;
const STYLES: ReadonlyArray<BackgroundStyle> = ["ascii", "dither", "halftone"];
const WIDTH = 1600;
const HEIGHT = 1000;
const COLUMN = { x: (WIDTH - 820) / 2, y: 0, width: 820, height: HEIGHT };
// Personal images live in a git-ignored folder, so this list is empty on other machines.
const LOCAL_IMAGES = import.meta.glob("/public/backgrounds-local/x-[0-9].jpg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

function paint(preset: string, style: BackgroundStyle, light: boolean, image?: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  document.body.append(canvas);
  renderBackground(canvas, WIDTH, HEIGHT, { preset, style, cellSize: 10, light, image });
  const samples = sampleCanvas(canvas, COLUMN);
  canvas.remove();
  return samples;
}

function worstShare(samples: ReadonlyArray<Rgb>, page: Rgb, text: Rgb, alpha: number) {
  const failing = samples.filter((pixel) => {
    const shown: Rgb = [
      pixel[0] + (page[0] - pixel[0]) * alpha,
      pixel[1] + (page[1] - pixel[1]) * alpha,
      pixel[2] + (page[2] - pixel[2]) * alpha,
    ];
    return contrastRatio(text, shown) < TARGET_CONTRAST;
  });
  return failing.length / samples.length;
}

const CASES = Object.entries(THEMES).flatMap(([theme, colors]) =>
  PRESETS.flatMap((preset) => STYLES.map((style) => ({ theme, colors, preset, style }))),
);

describe("text stays readable on every background", () => {
  it.each(CASES)("$preset / $style / $theme", ({ colors, preset, style }) => {
    const samples = paint(preset, style, colors.light);
    const alpha = scrimAlphaForContrast({ ...colors, samples, opacity: 1 });
    expect(worstShare(samples, colors.page, colors.text, alpha)).toBeLessThanOrEqual(0.02);
    // The column shade must leave the pattern visible, not paint over it.
    expect(alpha).toBeLessThan(0.95);
  });

  it.each(Object.values(LOCAL_IMAGES))("local image %s (dark, original)", async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const samples = paint("x-image", "original", false, image);
    const alpha = scrimAlphaForContrast({ ...THEMES.dark, samples, opacity: 1 });
    expect(worstShare(samples, THEMES.dark.page, THEMES.dark.text, alpha)).toBeLessThanOrEqual(
      0.02,
    );
  });
});

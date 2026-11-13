import type { ClientSettings } from "@t3tools/contracts/settings";

export const PRESETS = ["glow", "rotor", "ridgeline", "aurora", "nebula", "dusk"] as const;
export type ProceduralPreset = (typeof PRESETS)[number];
export type BackgroundStyle = ClientSettings["backgroundStyle"];
export type Rgb = readonly [number, number, number];
const RAMP = " .:-=+*#%@";

/** Text over the background must reach this contrast against its darkest or brightest pixel. */
export const TARGET_CONTRAST = 4.5;

export function isProceduralPreset(value: string): value is ProceduralPreset {
  return (PRESETS as ReadonlyArray<string>).includes(value);
}

export function glyphFor(value: number): string {
  return RAMP[Math.round(Math.max(0, Math.min(1, value)) * (RAMP.length - 1))]!;
}

export function bayerThreshold(x: number, y: number): number {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (matrix[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
}

export function presetColor(preset: ProceduralPreset, x: number, y: number): Rgb {
  const noise = ((Math.sin(x * 357.1 + y * 193.7) * 43758.5453) % 1) * 0.04;
  let strength = 0;
  let color: Rgb = [255, 115, 45];
  switch (preset) {
    case "glow":
      strength = 1.25 * Math.exp(-((x - 0.85) ** 2 * 2.2 + (y - 0.9) ** 2 * 1.8));
      break;
    case "rotor": {
      const dx = x - 0.68;
      const dy = y - 0.6;
      strength =
        1.2 *
        (0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 7 + Math.hypot(dx, dy) * 13)) *
        Math.exp(-Math.hypot(dx, dy) * 1.8);
      color = [255, 145, 75];
      break;
    }
    case "ridgeline": {
      const ridge = 0.66 + Math.sin(x * 8) * 0.09 + Math.sin(x * 19) * 0.025;
      strength =
        y < ridge
          ? 1.2 * Math.exp(-(((y - 0.57) * 7) ** 2))
          : 0.3 + 0.35 * Math.sin(y * 48 + x * 8) ** 12;
      color = y < ridge ? [255, 145, 93] : [92, 120, 175];
      break;
    }
    case "aurora":
      strength =
        1.2 * Math.exp(-(((y - 0.45 - Math.sin(x * 6) * 0.22) * 4.5) ** 2)) * (0.55 + x * 0.5);
      color = [65, 230, 170];
      break;
    case "nebula":
      strength =
        1.25 * Math.exp(-((x - 0.72) ** 2 * 3 + (y - 0.6 - Math.sin(x * 9) * 0.15) ** 2 * 5));
      color = [215, 95 + x * 45, 245];
      break;
    case "dusk":
      strength = 1.15 * Math.exp(-(((y - 0.68) * 3.2) ** 2)) * (0.5 + 0.5 * Math.sin(x * 4) ** 2);
      color = [110 + y * 55, 130, 250];
      break;
  }
  const level = Math.max(0, Math.min(1.2, strength + noise));
  return [
    Math.min(255, color[0] * level),
    Math.min(255, color[1] * level),
    Math.min(255, color[2] * level),
  ];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(under: Rgb, over: Rgb, alpha: number): Rgb {
  return [
    under[0] + (over[0] - under[0]) * alpha,
    under[1] + (over[1] - under[1]) * alpha,
    under[2] + (over[2] - under[2]) * alpha,
  ];
}

/**
 * The smallest scrim (page colour over the background) that keeps `text` readable on all but
 * the worst 2% of `samples`. `opacity` is the background layer's own opacity over the page.
 */
export function scrimAlphaForContrast(input: {
  readonly samples: ReadonlyArray<Rgb>;
  readonly page: Rgb;
  readonly text: Rgb;
  readonly opacity: number;
  readonly target?: number;
}): number {
  const target = input.target ?? TARGET_CONTRAST;
  if (input.samples.length === 0) return 0;
  const shown = input.samples.map((sample) => mix(input.page, sample, input.opacity));
  const allowedFailures = Math.floor(shown.length * 0.02);
  for (let step = 0; step <= 50; step += 1) {
    const alpha = step / 50;
    let failures = 0;
    for (const pixel of shown) {
      if (contrastRatio(input.text, mix(pixel, input.page, alpha)) < target) {
        failures += 1;
        if (failures > allowedFailures) break;
      }
    }
    if (failures <= allowedFailures) return alpha;
  }
  return 1;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

export function renderBackground(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: {
    readonly preset: string;
    readonly style: BackgroundStyle;
    readonly cellSize: number;
    readonly light: boolean;
    readonly image?: HTMLImageElement | undefined;
  },
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = options.light ? "#faf9f6" : "#08080b";
  ctx.fillRect(0, 0, width, height);
  // Kail-style images are already ASCII art, so "original" shows them untouched.
  if (options.image && (options.style === "original" || !isProceduralPreset(options.preset))) {
    if (options.style === "original") {
      ctx.imageSmoothingQuality = "high";
      drawCover(ctx, options.image, width, height);
      return;
    }
  }
  const cell = Math.max(6, options.cellSize);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const source = document.createElement("canvas");
  source.width = cols;
  source.height = rows;
  const sample = source.getContext("2d", { willReadFrequently: true });
  if (!sample) return;
  if (options.image) {
    drawCover(sample, options.image, cols, rows);
  } else if (isProceduralPreset(options.preset)) {
    const pixels = sample.createImageData(cols, rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const rgb = presetColor(options.preset, x / cols, y / rows);
        const i = (y * cols + x) * 4;
        pixels.data[i] = rgb[0];
        pixels.data[i + 1] = rgb[1];
        pixels.data[i + 2] = rgb[2];
        pixels.data[i + 3] = 255;
      }
    sample.putImageData(pixels, 0, 0);
  } else {
    return;
  }
  const pixels = sample.getImageData(0, 0, cols, rows).data;
  ctx.font = `bold ${cell}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const level = Math.max(r, g, b) / 255;
      if (level < 0.04) continue;
      ctx.fillStyle = options.light
        ? `rgb(${Math.round(255 - (255 - r) * 0.75)},${Math.round(255 - (255 - g) * 0.75)},${Math.round(255 - (255 - b) * 0.75)})`
        : `rgb(${r},${g},${b})`;
      const px = (x + 0.5) * cell;
      const py = (y + 0.5) * cell;
      if (options.style === "ascii" || options.style === "original") {
        ctx.fillText(glyphFor(level), px, py);
      } else if (options.style === "halftone" || level > bayerThreshold(x, y)) {
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          options.style === "halftone" ? cell * 0.48 * Math.sqrt(level) : cell * 0.24,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
}

/** Pixels inside `region` (CSS px) of a painted canvas, sampled on a coarse grid. */
export function sampleCanvas(
  canvas: HTMLCanvasElement,
  region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): Rgb[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || region.width <= 0 || region.height <= 0) return [];
  const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
  const x = Math.max(0, Math.floor(region.x * dpr));
  const y = Math.max(0, Math.floor(region.y * dpr));
  const w = Math.min(canvas.width - x, Math.ceil(region.width * dpr));
  const h = Math.min(canvas.height - y, Math.ceil(region.height * dpr));
  if (w <= 0 || h <= 0) return [];
  const data = ctx.getImageData(x, y, w, h).data;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  const out: Rgb[] = [];
  for (let py = 0; py < h; py += step)
    for (let px = 0; px < w; px += step) {
      const i = (py * w + px) * 4;
      out.push([data[i]!, data[i + 1]!, data[i + 2]!]);
    }
  return out;
}

/** Any CSS colour as RGB, through the canvas (handles oklch and color-mix). */
export function cssColorToRgb(color: string): Rgb {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}

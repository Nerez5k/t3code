import type { ClientSettings } from "@t3tools/contracts/settings";

export const PRESETS = ["glow", "rotor", "ridgeline", "aurora", "nebula", "dusk"] as const;
export type ProceduralPreset = (typeof PRESETS)[number];
export type BackgroundStyle = ClientSettings["backgroundStyle"];
export type Rgb = readonly [number, number, number];
const RAMP = " .:-=+*#%@";
const LEVELS = RAMP.length;

/** Text over the background must reach this contrast against its darkest or brightest pixel. */
export const TARGET_CONTRAST = 4.5;

export function isProceduralPreset(value: string): value is ProceduralPreset {
  return (PRESETS as ReadonlyArray<string>).includes(value);
}

function levelIndex(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * (LEVELS - 1));
}

export function glyphFor(value: number): string {
  return RAMP[levelIndex(value)]!;
}

export function bayerThreshold(x: number, y: number): number {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (matrix[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
}

/** Travelling brightness waves; never above 1, so a still frame bounds every moving one. */
function shimmer(x: number, y: number, t: number): number {
  if (t === 0) return 1;
  const a = Math.sin(x * 9 + y * 5 - t * 1.4);
  const b = Math.sin(x * 4 - y * 11 + t * 0.9);
  return 0.72 + 0.28 * (0.5 + 0.25 * a + 0.25 * b);
}

/** Colour of a preset at (x, y) in 0..1 and `t` seconds; t = 0 is the still frame. */
export function presetColor(preset: ProceduralPreset, x: number, y: number, t = 0): Rgb {
  const noise = ((Math.sin(x * 357.1 + y * 193.7) * 43758.5453) % 1) * 0.04;
  let strength = 0;
  let color: Rgb = [255, 115, 45];
  switch (preset) {
    case "glow": {
      const cx = 0.85 + 0.02 * Math.sin(t * 0.3);
      const cy = 0.9 + 0.02 * Math.cos(t * 0.23);
      const dist = Math.hypot(x - cx, (y - cy) * 0.9);
      const ripple = t === 0 ? 1 : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(dist * 26 - t * 2));
      strength = 1.25 * Math.exp(-((x - cx) ** 2 * 2.2 + (y - cy) ** 2 * 1.8)) * ripple;
      break;
    }
    case "rotor": {
      const dx = x - 0.68;
      const dy = y - 0.6;
      const r = Math.hypot(dx, dy);
      strength =
        1.2 *
        (0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 7 + r * 13 - t * 0.35)) *
        Math.exp(-r * 1.8);
      color = [255, 145, 75];
      break;
    }
    case "ridgeline": {
      const ridge = 0.66 + Math.sin(x * 8 + t * 0.12) * 0.09 + Math.sin(x * 19 - t * 0.2) * 0.025;
      strength =
        y < ridge
          ? 1.2 * Math.exp(-(((y - 0.57) * 7) ** 2))
          : 0.3 + 0.35 * Math.sin(y * 48 + x * 8 - t * 2.4) ** 12;
      color = y < ridge ? [255, 145, 93] : [92, 120, 175];
      break;
    }
    case "aurora": {
      const band = 0.45 + Math.sin(x * 6 + t * 0.45) * 0.2 + Math.sin(x * 13 - t * 0.7) * 0.03;
      const curtain = t === 0 ? 1 : 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(x * 38 + t * 1.6));
      strength = 1.2 * Math.exp(-(((y - band) * 4.5) ** 2)) * (0.55 + x * 0.5) * curtain;
      color = [65, 230, 170];
      break;
    }
    case "nebula": {
      const swirl = Math.sin(x * 9 + t * 0.4) * 0.15;
      strength = 1.25 * Math.exp(-((x - 0.72) ** 2 * 3 + (y - 0.6 - swirl) ** 2 * 5));
      color = [215, 95 + x * 45, 245];
      break;
    }
    case "dusk":
      strength =
        1.15 * Math.exp(-(((y - 0.68) * 3.2) ** 2)) * (0.5 + 0.5 * Math.sin(x * 4 + t * 0.35) ** 2);
      color = [110 + y * 55, 130, 250];
      break;
  }
  const level = Math.max(0, Math.min(1.2, (strength + noise) * shimmer(x, y, t)));
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

export interface BackgroundOptions {
  readonly preset: string;
  readonly style: BackgroundStyle;
  readonly cellSize: number;
  readonly light: boolean;
  readonly image?: HTMLImageElement | undefined;
}

export interface BackgroundRenderer {
  /** Size in CSS px; rebuilds the glyph atlas and buffers. */
  readonly configure: (width: number, height: number, options: BackgroundOptions) => void;
  /** Paints one frame at `t` seconds. Only procedural presets move. */
  readonly draw: (t: number) => void;
  readonly animatable: () => boolean;
}

function offscreen(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

/**
 * Glyphs come from a white atlas (one drawImage per cell), then the colour field is painted
 * over them with "source-in", so a frame costs one pass instead of a fillText per cell.
 */
export function createBackgroundRenderer(canvas: HTMLCanvasElement): BackgroundRenderer {
  let options: BackgroundOptions | undefined;
  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let cellPx = 0;
  let glyphs: Uint8Array[] = [];
  let frame: ImageData | undefined;
  let imageField: Uint8ClampedArray | undefined;

  /** Coverage (0..255) of each glyph or dot, one cellPx square per level. */
  const buildGlyphs = (style: BackgroundStyle): Uint8Array[] => {
    const sheet = offscreen(cellPx * LEVELS, cellPx);
    const ctx = sheet.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${cellPx}px ui-monospace, monospace`;
    for (let level = 1; level < LEVELS; level += 1) {
      const cx = level * cellPx + cellPx / 2;
      const cy = cellPx / 2;
      if (style === "ascii" || style === "original") {
        ctx.fillText(RAMP[level]!, cx, cy);
      } else {
        const radius =
          style === "halftone" ? cellPx * 0.48 * Math.sqrt(level / (LEVELS - 1)) : cellPx * 0.24;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const pixels = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
    return Array.from({ length: LEVELS }, (_, level) => {
      const coverage = new Uint8Array(cellPx * cellPx);
      for (let y = 0; y < cellPx; y++)
        for (let x = 0; x < cellPx; x++)
          coverage[y * cellPx + x] = pixels[(y * sheet.width + level * cellPx + x) * 4 + 3]!;
      return coverage;
    });
  };

  const sampleImage = (image: HTMLImageElement) => {
    const sample = offscreen(cols, rows).getContext("2d", { willReadFrequently: true });
    if (!sample) return undefined;
    drawCover(sample, image, cols, rows);
    return sample.getImageData(0, 0, cols, rows).data;
  };

  const configure: BackgroundRenderer["configure"] = (w, h, next) => {
    options = next;
    // Glyphs stay crisp at 1.5x and a Retina frame costs about half of 2x.
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const cell = Math.max(4, next.cellSize);
    cols = Math.ceil(w / cell);
    rows = Math.ceil(h / cell);
    cellPx = Math.max(1, Math.round(cell * dpr));
    glyphs = buildGlyphs(next.style);
    frame = canvas.getContext("2d")?.createImageData(canvas.width, canvas.height);
    imageField = next.image && next.style !== "original" ? sampleImage(next.image) : undefined;
  };

  const draw: BackgroundRenderer["draw"] = (t) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !options) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = options.light ? "#faf9f6" : "#08080b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (options.image && options.style === "original") {
      ctx.imageSmoothingQuality = "high";
      drawCover(ctx, options.image, canvas.width, canvas.height);
      return;
    }
    const preset = options.preset;
    if (!imageField && !isProceduralPreset(preset)) return;
    if (!frame || glyphs.length === 0) return;
    const out = frame.data;
    const [br, bg, bb] = options.light ? [250, 249, 246] : [8, 8, 11];
    new Uint32Array(out.buffer).fill(
      new Uint32Array(new Uint8ClampedArray([br, bg, bb, 255]).buffer)[0]!,
    );
    const stride = frame.width;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let r: number;
        let g: number;
        let b: number;
        if (imageField) {
          const i = (y * cols + x) * 4;
          r = imageField[i]!;
          g = imageField[i + 1]!;
          b = imageField[i + 2]!;
        } else {
          [r, g, b] = presetColor(preset as ProceduralPreset, x / cols, y / rows, t);
        }
        const level = Math.max(r, g, b) / 255;
        if (level < 0.04) continue;
        const index =
          options.style === "dither" ? (level > bayerThreshold(x, y) ? 1 : 0) : levelIndex(level);
        if (index === 0) continue;
        if (options.light) {
          r = 255 - (255 - r) * 0.75;
          g = 255 - (255 - g) * 0.75;
          b = 255 - (255 - b) * 0.75;
        }
        const coverage = glyphs[index]!;
        const ox = x * cellPx;
        const oy = y * cellPx;
        const w = Math.min(cellPx, frame.width - ox);
        const h = Math.min(cellPx, frame.height - oy);
        for (let py = 0; py < h; py++) {
          let o = ((oy + py) * stride + ox) * 4;
          let c = py * cellPx;
          for (let px = 0; px < w; px++, o += 4, c++) {
            const a = coverage[c]!;
            if (a === 0) continue;
            const k = a / 255;
            out[o] = br + (r - br) * k;
            out[o + 1] = bg + (g - bg) * k;
            out[o + 2] = bb + (b - bb) * k;
          }
        }
      }
    ctx.putImageData(frame, 0, 0);
  };

  return {
    configure,
    draw,
    animatable: () =>
      options !== undefined && !imageField && !options.image && isProceduralPreset(options.preset),
  };
}

/** One still frame; tests and thumbnails use it. */
export function renderBackground(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: BackgroundOptions & { readonly time?: number },
): void {
  const renderer = createBackgroundRenderer(canvas);
  renderer.configure(width, height, options);
  renderer.draw(options.time ?? 0);
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
  const canvas = offscreen(1, 1);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}

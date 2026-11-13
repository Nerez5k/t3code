import type { ClientSettings } from "@t3tools/contracts/settings";

export const PRESETS = ["glow", "rotor", "ridgeline", "aurora", "nebula", "dusk"] as const;
export type Preset = ClientSettings["backgroundPreset"];
export type BackgroundStyle = ClientSettings["backgroundStyle"];
const RAMP = " .:-=+*#%@";

export function glyphFor(value: number): string {
  return RAMP[Math.round(Math.max(0, Math.min(1, value)) * (RAMP.length - 1))]!;
}

export function bayerThreshold(x: number, y: number): number {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (matrix[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
}

export function presetColor(preset: Preset, x: number, y: number): readonly number[] {
  const noise = ((Math.sin(x * 357.1 + y * 193.7) * 43758.5453) % 1) * 0.025;
  let strength = 0;
  let color = [255, 115, 45];
  switch (preset) {
    case "glow":
      strength = Math.exp(-((x - 0.9) ** 2 * 3 + (y - 0.95) ** 2 * 2.5));
      break;
    case "rotor": {
      const dx = x - 0.65,
        dy = y - 0.58;
      strength =
        (0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 7 + Math.hypot(dx, dy) * 13)) *
        Math.exp(-Math.hypot(dx, dy) * 2.4);
      color = [255, 145, 75];
      break;
    }
    case "ridgeline": {
      const ridge = 0.66 + Math.sin(x * 8) * 0.09 + Math.sin(x * 19) * 0.025;
      strength =
        y < ridge
          ? Math.exp(-(((y - 0.57) * 9) ** 2))
          : 0.18 + 0.2 * Math.sin(y * 48 + x * 8) ** 12;
      color = y < ridge ? [255, 145, 93] : [82, 110, 160];
      break;
    }
    case "aurora":
      strength = Math.exp(-(((y - 0.5 - Math.sin(x * 6) * 0.22) * 6) ** 2)) * (0.5 + x * 0.5);
      color = [65, 230, 170];
      break;
    case "nebula":
      strength = Math.exp(-((x - 0.75) ** 2 * 4 + (y - 0.65 - Math.sin(x * 9) * 0.15) ** 2 * 7));
      color = [207, 90 + x * 45, 240];
      break;
    case "dusk":
      strength = Math.exp(-(((y - 0.7) * 4) ** 2)) * (0.45 + 0.55 * Math.sin(x * 4) ** 2);
      color = [95 + y * 55, 125, 245];
      break;
    default:
      break;
  }
  return color.map((channel) => Math.max(0, channel * Math.max(0, strength + noise)));
}

export function renderBackground(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: {
    preset: Preset;
    style: BackgroundStyle;
    cellSize: number;
    light: boolean;
    image?: HTMLImageElement;
  },
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = options.light ? "#faf9f6" : "#090a0d";
  ctx.fillRect(0, 0, width, height);
  const cell = Math.max(6, options.cellSize);
  const cols = Math.ceil(width / cell),
    rows = Math.ceil(height / cell);
  const source = document.createElement("canvas");
  source.width = cols;
  source.height = rows;
  const sample = source.getContext("2d", { willReadFrequently: true });
  if (!sample) return;
  if (options.image) {
    const scale = Math.max(cols / options.image.width, rows / options.image.height);
    const w = options.image.width * scale,
      h = options.image.height * scale;
    sample.drawImage(options.image, (cols - w) / 2, (rows - h) / 2, w, h);
  } else {
    const pixels = sample.createImageData(cols, rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const rgb = presetColor(options.preset, x / cols, y / rows);
        const i = (y * cols + x) * 4;
        pixels.data[i] = rgb[0]!;
        pixels.data[i + 1] = rgb[1]!;
        pixels.data[i + 2] = rgb[2]!;
        pixels.data[i + 3] = 255;
      }
    sample.putImageData(pixels, 0, 0);
  }
  const pixels = sample.getImageData(0, 0, cols, rows).data;
  ctx.font = `${cell}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      const luminance = (Math.max(...rgb) / 255) * (pixels[i + 3]! / 255);
      ctx.fillStyle = options.light
        ? `rgb(${rgb.map((c) => Math.round(200 - c * 0.5)).join(",")})`
        : `rgb(${rgb.join(",")})`;
      const px = (x + 0.5) * cell,
        py = (y + 0.5) * cell;
      if (options.style === "ascii") ctx.fillText(glyphFor(luminance), px, py);
      else if (options.style === "halftone" || luminance > bayerThreshold(x, y)) {
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          options.style === "halftone" ? cell * 0.44 * Math.sqrt(luminance) : cell * 0.19,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
}

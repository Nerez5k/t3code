// Animated scenes after the Dither themes for Claude (dither-themes.vercel.app): their published
// palettes, with our own drawing. Everything works in cell units, so particles stay one glyph wide.

export const SCENES = ["rainy-days", "waves", "sakura-drift", "campfire"] as const;
export type Scene = (typeof SCENES)[number];
type Rgb = readonly [number, number, number];

export function isScene(value: string): value is Scene {
  return (SCENES as ReadonlyArray<string>).includes(value);
}

export const SCENE_LABELS: Record<Scene, string> = {
  "rainy-days": "Rainy Days",
  waves: "Waves",
  "sakura-drift": "Sakura Drift",
  campfire: "Campfire",
};

/** The page colour each scene paints on, from the theme's darkest surface. */
export function sceneBase(scene: Scene, light: boolean): Rgb {
  const dark: Record<Scene, Rgb> = {
    "rainy-days": [20, 25, 33],
    waves: [3, 28, 38],
    "sakura-drift": [34, 20, 31],
    campfire: [25, 21, 18],
  };
  const day: Record<Scene, Rgb> = {
    "rainy-days": [228, 232, 237],
    waves: [230, 244, 250],
    "sakura-drift": [248, 232, 236],
    campfire: [232, 230, 207],
  };
  return (light ? day : dark)[scene];
}

function hash(a: number, b = 0): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function scale(color: Rgb, level: number): Rgb {
  const k = Math.max(0, Math.min(1.2, level));
  return [color[0] * k, color[1] * k, color[2] * k];
}

function brighter(a: Rgb, b: Rgb): Rgb {
  return Math.max(...a) >= Math.max(...b) ? a : b;
}

/** A falling (or rising, with negative speed) streak in lanes `spacing` cells apart. */
function streak(
  cx: number,
  cy: number,
  rows: number,
  t: number,
  layer: {
    spacing: number;
    speed: number;
    length: number;
    density: number;
    seed: number;
    /** Rows between drops in one lane; defaults to one drop per screen. */
    period?: number;
  },
): number {
  const lane = Math.floor(cx / layer.spacing);
  if (cx - lane * layer.spacing !== Math.floor(hash(lane, layer.seed) * layer.spacing)) return 0;
  if (hash(lane, layer.seed + 1) > layer.density) return 0;
  const span = layer.period ?? rows + layer.length;
  const speed = layer.speed * (0.75 + 0.5 * hash(lane, layer.seed + 2));
  const head = fract(hash(lane, layer.seed + 3) + (t * speed) / span) * span;
  const along = (((head - cy) % span) + span) % span;
  if (along > layer.length) return 0;
  return 1 - along / (layer.length + 1);
}

function rainyDays(cx: number, cy: number, cols: number, rows: number, t: number): Rgb {
  const x = cx / cols;
  const y = cy / rows;
  const sky: Rgb = [120, 140, 165];
  let out = scale(sky, 0.06 + 0.06 * (1 - y));
  // Slow overcast clouds across the top.
  const cloud =
    Math.sin(x * 7 + t * 0.05) * 0.5 +
    Math.sin(x * 13 - t * 0.08 + 1.3) * 0.3 +
    Math.sin(x * 23 + t * 0.03 + y * 9) * 0.2;
  const band = Math.exp(-(((y - 0.14 - cloud * 0.05) * 6) ** 2));
  out = brighter(out, scale([160, 172, 190], band * (0.3 + 0.25 * cloud)));
  // Rain at three depths: far is fine and dim, near is long and bright.
  const slant = Math.floor(cy * 0.2);
  const layers = [
    { spacing: 3, speed: 9, length: 2, density: 0.6, seed: 11, level: 0.34, period: 23 },
    { spacing: 5, speed: 15, length: 4, density: 0.6, seed: 23, level: 0.58, period: 31 },
    { spacing: 8, speed: 24, length: 7, density: 0.6, seed: 37, level: 0.92, period: 47 },
  ];
  for (const layer of layers) {
    const hit = streak(cx + slant, cy, rows, t, layer);
    if (hit > 0) out = brighter(out, scale([125, 178, 225], layer.level * hit));
  }
  // Drops sliding down the glass: a bright bead with a short wet trail.
  const bead = streak(cx, cy, rows, t, {
    spacing: 17,
    speed: 1.1,
    length: 5,
    density: 0.45,
    seed: 53,
  });
  if (bead > 0) out = brighter(out, scale([200, 225, 245], bead > 0.8 ? 1 : bead * 0.45));
  return out;
}

function waves(cx: number, cy: number, cols: number, rows: number, t: number): Rgb {
  const x = cx / cols;
  const y = cy / rows;
  let out = scale([40, 110, 150], 0.05 + 0.05 * y);
  const colours: Rgb[] = [
    [20, 70, 120],
    [10, 110, 160],
    [0, 140, 175],
    [60, 190, 220],
    [120, 215, 240],
  ];
  // Five swells; nearer ones sit lower, move faster and catch more light.
  for (let i = 0; i < colours.length; i++) {
    const base = 0.42 + i * 0.1;
    const speed = 0.25 + i * 0.12;
    const surface =
      base +
      Math.sin(x * (5 + i) + t * speed + i * 1.7) * (0.025 + i * 0.006) +
      Math.sin(x * (11 + i * 2) - t * speed * 1.3 + i) * 0.012;
    if (y < surface) continue;
    const depth = y - surface;
    const crest = Math.exp(-(((depth * rows) / 1.4) ** 2));
    const body = 0.18 + 0.12 * i + 0.1 * Math.sin(x * 40 + y * 30 - t * speed * 2);
    out = scale(colours[i]!, Math.max(0, body - depth * 0.6));
    if (crest > 0.3) out = brighter(out, scale([225, 245, 252], crest * (0.45 + i * 0.12)));
  }
  return out;
}

function distanceToBough(x: number, y: number, fromLeft: boolean, t: number): number {
  const u = fromLeft ? x : 1 - x;
  if (u > 0.5) return 1;
  const sway = Math.sin(t * 0.4 + (fromLeft ? 0 : 2)) * 0.006 * u * 4;
  const curve = 0.13 - u * 0.16 + u * u * 0.18 + sway;
  return Math.abs(y - curve);
}

function sakuraDrift(cx: number, cy: number, cols: number, rows: number, t: number): Rgb {
  const x = cx / cols;
  const y = cy / rows;
  const aspect = cols / rows;
  let out = scale([140, 70, 120], 0.07 + 0.1 * y);
  // Boughs reach in from both top corners, heavy with blossom.
  for (const fromLeft of [true, false]) {
    const d = distanceToBough(x, y, fromLeft, t);
    const u = fromLeft ? x : 1 - x;
    if (d < 0.008 + (0.5 - u) * 0.012 && u < 0.48) out = brighter(out, scale([125, 75, 80], 0.45));
    const bloom = hash(Math.floor(cx / 2), Math.floor(cy / 2) + (fromLeft ? 0 : 99));
    if (d < 0.06 && u < 0.46 && bloom > 0.35 + d * 8) {
      out = brighter(out, scale([255, 160, 200], 0.55 + 0.4 * bloom));
    }
  }
  // Paper lanterns on strings, glowing warm.
  for (const [lx, top, len] of [
    [0.16, 0.12, 0.12],
    [0.3, 0.08, 0.18],
    [0.84, 0.1, 0.14],
  ] as const) {
    const swing = Math.sin(t * 0.6 + lx * 10) * 0.004;
    const ly = top + len;
    const dx = (x - lx - swing) * aspect;
    const dy = y - ly;
    if (Math.abs(dx) < 0.004 && y > top && y < ly - 0.03)
      out = brighter(out, scale([180, 120, 110], 0.35));
    const body = (dx / 0.028) ** 2 + (dy / 0.034) ** 2;
    if (body < 1) out = brighter(out, scale([255, 175, 95], 0.75 + 0.25 * (1 - body)));
    else out = brighter(out, scale([255, 150, 80], 0.5 * Math.exp(-(body - 1) * 0.8)));
  }
  // Petals drift down and sway.
  const sway = Math.round(Math.sin(t * 0.7 + cy * 0.15) * 2);
  for (const layer of [
    { spacing: 6, speed: 2.2, length: 0, density: 0.7, seed: 71, level: 0.55, period: 19 },
    { spacing: 9, speed: 3.4, length: 1, density: 0.7, seed: 83, level: 0.95, period: 29 },
  ]) {
    const hit = streak(cx + sway + Math.floor(cy * 0.3), cy, rows, t, layer);
    if (hit > 0) out = brighter(out, scale([255, 175, 210], layer.level));
  }
  return out;
}

function campfire(cx: number, cy: number, cols: number, rows: number, t: number): Rgb {
  const x = cx / cols;
  const y = cy / rows;
  const aspect = cols / rows;
  const fireX = 0.8;
  const ground = 0.84;
  let out = scale([80, 90, 135], 0.07 + 0.06 * (1 - y));
  // A few stars twinkle in the upper sky.
  const star = hash(cx, cy);
  if (y < 0.45 && star > 0.994)
    out = scale([230, 230, 255], 0.4 + 0.4 * Math.sin(t * 2 + star * 50) ** 2);
  // Pines on the horizon, jagged triangles.
  for (const [px, height, width] of [
    [0.05, 0.42, 0.06],
    [0.14, 0.32, 0.05],
    [0.58, 0.3, 0.05],
    [0.93, 0.44, 0.07],
    [0.99, 0.34, 0.05],
  ] as const) {
    const topY = ground - height;
    if (y < topY || y > ground) continue;
    const reach = ((y - topY) / height) * width * (0.85 + 0.15 * Math.sin(y * 140));
    if (Math.abs((x - px) * aspect) < reach) out = scale([60, 120, 85], 0.5);
  }
  // A tent to the left of the fire, lit on the side facing it.
  const tentX = 0.62;
  const tentTop = ground - 0.14;
  if (y > tentTop && y < ground) {
    const half = ((y - tentTop) / 0.14) * 0.05;
    const dx = (x - tentX) * aspect;
    if (Math.abs(dx) < half) {
      out = scale([220, 160, 105], dx > 0 ? 0.45 : 0.22);
      if (Math.abs(dx) < half * 0.18 && y > ground - 0.06) out = scale([70, 40, 25], 0.5);
    }
  }
  if (y >= ground) out = scale([90, 60, 35], 0.18 + 0.1 * hash(cx, cy + 1));
  // Warm light pooling around the fire.
  const glow = Math.exp(-((((x - fireX) * aspect) / 0.12) ** 2) - ((y - ground) / 0.1) ** 2);
  const pulse = 0.72 + 0.28 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1);
  out = brighter(out, scale([255, 130, 50], glow * 0.6 * pulse));
  // Flames: a flickering column, yellow at the core and red at the tips.
  const dx = (x - fireX) * aspect;
  const flicker = 0.75 + 0.25 * Math.sin(t * 7 + dx * 120) + 0.12 * Math.sin(t * 13 - dx * 60);
  const flameHeight = Math.max(0, 0.22 * (1 - Math.abs(dx) / 0.065)) * flicker;
  const rise = ground - y;
  if (rise > 0 && rise < flameHeight) {
    const k = rise / flameHeight;
    const colour: Rgb = k < 0.35 ? [255, 230, 130] : k < 0.7 ? [255, 150, 45] : [215, 60, 25];
    out = scale(colour, 1.05 - k * 0.35);
  }
  // Logs under the flames.
  if (Math.abs(y - ground - 0.01) < 0.008 && Math.abs(dx) < 0.05) out = scale([120, 70, 40], 0.5);
  // Embers drift up and fade.
  if (Math.abs(dx) < 0.04 + rise * 0.3 && rise > 0 && rise < 0.6) {
    const drift = Math.round(Math.sin(t * 1.3 + cy * 0.4) * 1.5);
    const hit = streak(cx + drift, rows - cy, rows, t, {
      spacing: 2,
      speed: 4,
      length: 0,
      density: 0.75,
      seed: 97,
      period: 9,
    });
    if (hit > 0) out = brighter(out, scale([255, 160, 60], 0.95 - rise * 1.2));
  }
  return out;
}

/** Colour of a scene's cell (cx, cy) on a cols x rows grid at `t` seconds. */
export function sceneColor(
  scene: Scene,
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  t: number,
): Rgb {
  switch (scene) {
    case "rainy-days":
      return rainyDays(cx, cy, cols, rows, t);
    case "waves":
      return waves(cx, cy, cols, rows, t);
    case "sakura-drift":
      return sakuraDrift(cx, cy, cols, rows, t);
    case "campfire":
      return campfire(cx, cy, cols, rows, t);
  }
}

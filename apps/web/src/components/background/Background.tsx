import { observeResize } from "../../lib/observeResize";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import {
  createBackgroundRenderer,
  cssColorToRgb,
  isProceduralPreset,
  sampleCanvas,
  scrimAlphaForContrast,
  type BackgroundStyle,
} from "./asciiBackground";

const IMAGE_KEY = "t3code:background-image";
const IMAGE_EVENT = "t3code:background-image-change";
/** Width of the text column the scrim protects, matching the timeline's reading width. */
const COLUMN_WIDTH = 820;
/** 15 fps is enough for slow waves; each frame costs a few ms of one core. */
const FRAME_MS = 1000 / 15;
/** How often a moving background re-measures the text scrim. */
const REPORT_MS = 2500;

function subscribeImage(listener: () => void) {
  window.addEventListener(IMAGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(IMAGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
function readImage() {
  try {
    return localStorage.getItem(IMAGE_KEY);
  } catch {
    return null;
  }
}

export async function uploadBackground(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    localStorage.setItem(IMAGE_KEY, canvas.toDataURL("image/jpeg", 0.9));
    window.dispatchEvent(new Event(IMAGE_EVENT));
  } finally {
    bitmap.close();
  }
}

function imageSourceFor(preset: string, upload: string | null): string | null {
  return preset === "upload" ? upload : null;
}

/** Paints a preset or image; `onPainted` gets the canvas once its bitmap is ready. */
export function BackgroundCanvas({
  preset,
  style,
  cellSize,
  animate = false,
  thumbnail = false,
  onPainted,
}: {
  preset: string;
  style: BackgroundStyle;
  cellSize: number;
  animate?: boolean;
  thumbnail?: boolean;
  onPainted?: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const upload = useSyncExternalStore(subscribeImage, readImage, () => null);
  const src = imageSourceFor(preset, upload);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Owns the canvas bitmap and its animation loop for this source and size.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = createBackgroundRenderer(canvas);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let image: HTMLImageElement | undefined;
    let disposed = false;
    let ready = false;
    let frame = 0;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let lastFrame = 0;
    let lastReport = 0;
    const started = performance.now();
    const seconds = () => (performance.now() - started) / 1000;

    const shouldMove = () =>
      animate &&
      ready &&
      renderer.animatable() &&
      !motion.matches &&
      document.visibilityState === "visible" &&
      document.hasFocus();

    const tick = (now: number) => {
      frame = 0;
      if (disposed || !shouldMove()) return;
      if (now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        renderer.draw(seconds());
        if (now - lastReport >= REPORT_MS) {
          lastReport = now;
          onPainted?.(canvas);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (shouldMove()) {
        if (frame === 0) frame = requestAnimationFrame(tick);
      } else if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const paint = () => {
      if (disposed) return;
      const parent = canvas.parentElement;
      if (!parent || (src && !image?.complete)) return;
      renderer.configure(parent.clientWidth, parent.clientHeight, {
        preset,
        style,
        cellSize: thumbnail ? Math.max(4, Math.round(cellSize / 2)) : cellSize,
        light: resolvedTheme === "light",
        image,
      });
      ready = true;
      renderer.draw(shouldMove() ? seconds() : 0);
      onPainted?.(canvas);
      sync();
    };
    if (src) {
      image = new Image();
      image.decoding = "async";
      image.onload = paint;
      image.src = src;
    }
    const unsubscribe = canvas.parentElement
      ? observeResize(canvas.parentElement, () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(paint, 120);
        })
      : () => {};
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    paint();
    return () => {
      disposed = true;
      clearTimeout(resizeTimer);
      if (frame !== 0) cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- onPainted is a notification, not an input
  }, [preset, style, cellSize, resolvedTheme, src, thumbnail, animate]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}

/**
 * The page background. A scrim behind the text column is sized from the painted pixels, so
 * text keeps 4.5:1 contrast on any preset or image while the edges stay vivid.
 */
export function ChatBackground({ hero }: { hero: boolean }) {
  const settings = useClientSettings();
  // Presets from removed image sets fall back to Glow.
  const preset =
    settings.backgroundPreset === "none" ||
    settings.backgroundPreset === "upload" ||
    isProceduralPreset(settings.backgroundPreset)
      ? settings.backgroundPreset
      : "glow";
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrimState, setScrimState] = useState({ key: "", alpha: 0.6 });
  const opacity = settings.backgroundIntensity / 100;
  const scrimKey = [
    settings.backgroundPreset,
    settings.backgroundStyle,
    settings.backgroundCellSize,
    settings.backgroundIntensity,
    hero,
  ].join("|");
  // A moving pattern can bring brighter cells into the column, so the shade only grows per setup.
  const scrim = scrimState.key === scrimKey ? scrimState.alpha : 0.6;
  const enabled = preset !== "none" && (hero || settings.backgroundShowInThreads);

  const measure = (canvas: HTMLCanvasElement) => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const column = Math.min(width, COLUMN_WIDTH);
    const region = hero
      ? { x: (width - column) / 2, y: height * 0.25, width: column, height: height * 0.45 }
      : { x: (width - column) / 2, y: 0, width: column, height };
    const style = getComputedStyle(host);
    const alpha = scrimAlphaForContrast({
      samples: sampleCanvas(canvas, region),
      page: cssColorToRgb(style.backgroundColor),
      text: cssColorToRgb(style.color),
      opacity,
    });
    setScrimState((current) =>
      current.key === scrimKey
        ? alpha > current.alpha
          ? { key: scrimKey, alpha }
          : current
        : { key: scrimKey, alpha },
    );
  };

  if (!enabled) return null;
  const page = "var(--background)";
  const solid = `color-mix(in srgb, ${page} ${Math.round(scrim * 100)}%, transparent)`;
  const soft = `color-mix(in srgb, ${page} ${Math.round(scrim * 55)}%, transparent)`;
  const half = COLUMN_WIDTH / 2;
  const scrimBackground = hero
    ? `radial-gradient(${COLUMN_WIDTH * 0.62}px 38% at 50% 48%, ${solid} 0%, ${solid} 55%, ${soft} 78%, transparent 100%)`
    : `linear-gradient(to right, transparent calc(50% - ${half + 120}px), ${soft} calc(50% - ${half + 40}px), ${solid} calc(50% - ${half}px), ${solid} calc(50% + ${half}px), ${soft} calc(50% + ${half + 40}px), transparent calc(50% + ${half + 120}px))`;
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0" style={{ opacity }}>
        <BackgroundCanvas
          preset={preset}
          style={
            preset === "upload"
              ? settings.backgroundStyle
              : settings.backgroundStyle === "original"
                ? "ascii"
                : settings.backgroundStyle
          }
          cellSize={settings.backgroundCellSize}
          animate={settings.backgroundAnimate}
          onPainted={measure}
        />
      </div>
      <div className="absolute inset-0" style={{ background: scrimBackground }} />
    </div>
  );
}

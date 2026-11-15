import { observeResize } from "../../lib/observeResize";
import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { BackgroundThreadContext } from "../chat/backgroundThread";
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

/** Mounted views painting the window-wide pattern; the document flag stays while any does. */
let windowBackdropOwners = 0;

const IMAGE_KEY = "t3code:background-image";
const IMAGE_EVENT = "t3code:background-image-change";
/** Width of the text column the scrim protects, matching the timeline's reading width. */
const COLUMN_WIDTH = 820;
/** 12 fps keeps slow waves smooth; a timer wakes the window only on those frames. */
const FRAME_MS = 1000 / 12;
const TIME_SCALE = 0.75;
/** Without mouse or keyboard input for this long, the pattern holds still until the next input. */
const IDLE_MS = 90_000;
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
    let lastReport = 0;
    const started = performance.now();
    const seconds = () => ((performance.now() - started) / 1000) * TIME_SCALE;
    let lastInput = performance.now();

    const shouldMove = () =>
      animate &&
      ready &&
      renderer.animatable() &&
      !motion.matches &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      performance.now() - lastInput < IDLE_MS;

    // A timer paces frames, so the window wakes 12 times a second instead of on every vsync.
    const tick = () => {
      frame = 0;
      if (disposed || !shouldMove()) return;
      const now = performance.now();
      renderer.draw(seconds());
      if (now - lastReport >= REPORT_MS) {
        lastReport = now;
        onPainted?.(canvas);
      }
      frame = window.setTimeout(() => requestAnimationFrame(tick), FRAME_MS);
    };
    const sync = () => {
      if (shouldMove()) {
        if (frame === 0) frame = window.setTimeout(() => requestAnimationFrame(tick), FRAME_MS);
      } else if (frame !== 0) {
        clearTimeout(frame);
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
    const onInput = () => {
      lastInput = performance.now();
      if (frame === 0) sync();
    };
    window.addEventListener("pointermove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    paint();
    return () => {
      disposed = true;
      clearTimeout(resizeTimer);
      if (frame !== 0) clearTimeout(frame);
      unsubscribe();
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("wheel", onInput);
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
export function ChatBackground({
  hero,
  embedded = false,
}: {
  hero: boolean;
  /** Side chats and other inset views keep the pattern to their own column. */
  embedded?: boolean;
}) {
  const settings = useClientSettings();
  const background = use(BackgroundThreadContext);
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
  // Under a see-through sidebar the pattern covers the whole window, beneath the app's surfaces.
  // Kept-alive threads behind the visible one stay out, so only the routed view paints it.
  const windowWide = enabled && !background && !embedded && settings.sidebarSurface !== "solid";

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- marks the document so the app shell's surfaces turn transparent while the window-wide pattern is painted
  useEffect(() => {
    if (!windowWide) return;
    windowBackdropOwners += 1;
    document.documentElement.dataset.appBackdrop = "";
    return () => {
      windowBackdropOwners -= 1;
      // Another mounted view may still paint the window; only the last one clears the flag.
      if (windowBackdropOwners === 0) delete document.documentElement.dataset.appBackdrop;
    };
  }, [windowWide]);

  const measure = (canvas: HTMLCanvasElement) => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    // The canvas may span the window; the text column is measured within this host.
    const hostRect = host.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const offsetX = hostRect.left - canvasRect.left;
    const offsetY = hostRect.top - canvasRect.top;
    const width = hostRect.width;
    const height = hostRect.height;
    const column = Math.min(width, COLUMN_WIDTH);
    const local = hero
      ? { x: (width - column) / 2, y: height * 0.25, width: column, height: height * 0.45 }
      : { x: (width - column) / 2, y: 0, width: column, height };
    const region = { ...local, x: local.x + offsetX, y: local.y + offsetY };
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

  if (!enabled || background) return null;
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
      {windowWide ? (
        // On <body>, behind #root: no ancestor surface or stacking context in the app can hide it.
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
            data-background-layer="window"
            style={{ opacity }}
          >
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
          </div>,
          document.body,
        )
      ) : (
        <div className="absolute inset-0" data-background-layer="column" style={{ opacity }}>
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
      )}
      <div className="absolute inset-0" style={{ background: scrimBackground }} />
    </div>
  );
}

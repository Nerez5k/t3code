import { observeResize } from "../../lib/observeResize";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import {
  cssColorToRgb,
  isProceduralPreset,
  renderBackground,
  sampleCanvas,
  scrimAlphaForContrast,
  type BackgroundStyle,
} from "./asciiBackground";

const IMAGE_KEY = "t3code:background-image";
const IMAGE_EVENT = "t3code:background-image-change";
/** Width of the text column the scrim protects, matching the timeline's reading width. */
const COLUMN_WIDTH = 820;

export interface LocalBackground {
  readonly id: string;
  readonly label: string;
  readonly src: string;
  readonly thumb: string;
}

let localBackgrounds: Promise<ReadonlyArray<LocalBackground>> | undefined;

/** Images in public/backgrounds-local (kept out of git), listed by its manifest. */
function loadLocalBackgrounds(): Promise<ReadonlyArray<LocalBackground>> {
  localBackgrounds ??= fetch("/backgrounds-local/manifest.json")
    .then((response) => (response.ok ? response.json() : []))
    .then((list: unknown) => (Array.isArray(list) ? (list as LocalBackground[]) : []))
    .catch(() => []);
  return localBackgrounds;
}

export function useLocalBackgrounds(): ReadonlyArray<LocalBackground> {
  const [list, setList] = useState<ReadonlyArray<LocalBackground>>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the manifest is a static file read once
  useEffect(() => {
    let live = true;
    void loadLocalBackgrounds().then((value) => {
      if (live) setList(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return list;
}

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

function imageSourceFor(preset: string, upload: string | null, thumb: boolean): string | null {
  if (preset === "upload") return upload;
  if (preset === "none" || isProceduralPreset(preset)) return null;
  return `/backgrounds-local/${preset}${thumb ? ".thumb" : ""}.jpg`;
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
  const src = imageSourceFor(preset, upload, thumbnail);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Paint the canvas bitmap when its source or size changes.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let image: HTMLImageElement | undefined;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const draw = () => {
      if (disposed) return;
      const parent = canvas.parentElement;
      if (!parent || (src && !image?.complete)) return;
      renderBackground(canvas, parent.clientWidth, parent.clientHeight, {
        preset,
        style,
        cellSize: thumbnail ? Math.max(4, Math.round(cellSize / 2)) : cellSize,
        light: resolvedTheme === "light",
        image,
      });
      onPainted?.(canvas);
    };
    if (src) {
      image = new Image();
      image.decoding = "async";
      image.onload = draw;
      image.src = src;
    }
    const unsubscribe = canvas.parentElement
      ? observeResize(canvas.parentElement, () => {
          clearTimeout(timer);
          timer = setTimeout(draw, 120);
        })
      : () => {};
    draw();
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- onPainted is a notification, not an input
  }, [preset, style, cellSize, resolvedTheme, src, thumbnail]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the native canvas animation aligned with visibility and motion preferences.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animate) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const sync = () => {
      if (motion.matches || document.hidden) {
        animation?.pause();
        return;
      }
      animation ??= canvas.animate(
        [
          { transform: "scale(1.04) translate(-1%, 0)" },
          { transform: "scale(1.04) translate(1%, -1%)" },
        ],
        { duration: 40000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
      );
      animation.play();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => {
      animation?.cancel();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, [animate]);
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
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrim, setScrim] = useState(0.6);
  const opacity = settings.backgroundIntensity / 100;
  const enabled =
    settings.backgroundPreset !== "none" && (hero || settings.backgroundShowInThreads);

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
    setScrim(
      scrimAlphaForContrast({
        samples: sampleCanvas(canvas, region),
        page: cssColorToRgb(style.backgroundColor),
        text: cssColorToRgb(style.color),
        opacity,
      }),
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
          preset={settings.backgroundPreset}
          style={settings.backgroundStyle}
          cellSize={settings.backgroundCellSize}
          animate={settings.backgroundAnimate}
          onPainted={measure}
        />
      </div>
      <div className="absolute inset-0" style={{ background: scrimBackground }} />
    </div>
  );
}

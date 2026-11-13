import { observeResize } from "../../lib/observeResize";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import { renderBackground, type Preset, type BackgroundStyle } from "./asciiBackground";

const IMAGE_KEY = "t3code:background-image";
const IMAGE_EVENT = "t3code:background-image-change";

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
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    localStorage.setItem(IMAGE_KEY, canvas.toDataURL("image/jpeg", 0.85));
    window.dispatchEvent(new Event(IMAGE_EVENT));
  } finally {
    bitmap.close();
  }
}

export function BackgroundCanvas({
  preset,
  style,
  cellSize,
  animate = false,
}: {
  preset: Preset;
  style: BackgroundStyle;
  cellSize: number;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const imageSource = useSyncExternalStore(subscribeImage, readImage, () => null);
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
      if (!parent) return;
      renderBackground(canvas, parent.clientWidth, parent.clientHeight, {
        preset,
        style,
        cellSize,
        light: resolvedTheme === "light",
        ...(image ? { image } : {}),
      });
    };
    if (preset === "upload") {
      try {
        const src = imageSource;
        if (src) {
          image = new Image();
          image.onload = draw;
          image.src = src;
        }
      } catch {
        /* Storage may be unavailable in private browsing. */
      }
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
  }, [preset, style, cellSize, resolvedTheme, imageSource]);
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

export function ChatBackground({ hero }: { hero: boolean }) {
  const settings = useClientSettings();
  if (settings.backgroundPreset === "none" || (!hero && !settings.backgroundShowInThreads))
    return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: (settings.backgroundIntensity / 100) * (hero ? 1 : 0.2) }}
    >
      <BackgroundCanvas
        preset={settings.backgroundPreset}
        style={settings.backgroundStyle}
        cellSize={settings.backgroundCellSize}
        animate={settings.backgroundAnimate}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--background) 85%, transparent), transparent 85%), linear-gradient(to bottom, var(--background), transparent 30%, transparent 80%, var(--background))",
        }}
      />
    </div>
  );
}

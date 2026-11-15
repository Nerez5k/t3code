import { useEffect } from "react";

import { useClientSettings } from "../../hooks/useSettings";

/** Mirrors the sidebar surface settings onto <html>, where the glass CSS reads them. */
export function useSidebarSurfaceAttributes() {
  const surface = useClientSettings((settings) => settings.sidebarSurface);
  const tint = useClientSettings((settings) => settings.sidebarTint);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the sidebar surface choice to the document element for the stylesheet
  useEffect(() => {
    const root = document.documentElement;
    if (surface === "solid") {
      delete root.dataset.sidebarSurface;
      root.style.removeProperty("--sidebar-tint");
      return;
    }
    root.dataset.sidebarSurface = surface;
    root.style.setProperty("--sidebar-tint", `${tint}%`);
  }, [surface, tint]);
}

/** A soft coloured glow behind the sidebar's brand row, with a faint dither of dots. */
export function SidebarGlow() {
  const enabled = useClientSettings((settings) => settings.sidebarGlow);
  const color = useClientSettings((settings) => settings.sidebarGlowColor);
  const intensity = useClientSettings((settings) => settings.sidebarGlowIntensity);
  if (!enabled || intensity === 0) return null;
  const strong = `color-mix(in oklab, ${color} 78%, transparent)`;
  const soft = `color-mix(in oklab, ${color} 32%, transparent)`;
  const shifted = `color-mix(in oklab, color-mix(in oklch, ${color} 55%, var(--color-violet-400)) 42%, transparent)`;
  const light = `color-mix(in oklab, color-mix(in oklab, ${color} 40%, var(--color-white)) 55%, transparent)`;
  return (
    <div
      aria-hidden
      data-sidebar-glow
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-32 select-none overflow-hidden"
      style={{
        opacity: intensity / 100,
        maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(70% 85% at 18% 0%, ${light} 0%, transparent 55%)`,
            `radial-gradient(95% 100% at 8% 10%, ${strong} 0%, ${soft} 45%, transparent 75%)`,
            `radial-gradient(70% 90% at 85% 0%, ${shifted} 0%, transparent 70%)`,
          ].join(", "),
        }}
      />
      <div
        className="absolute inset-0 opacity-35 mix-blend-overlay"
        style={{
          backgroundImage: `radial-gradient(circle, ${light} 0.7px, transparent 1px)`,
          backgroundSize: "5px 5px",
          maskImage: "linear-gradient(to right, black 0%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to right, black 0%, transparent 85%)",
        }}
      />
    </div>
  );
}

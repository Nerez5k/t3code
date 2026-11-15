import { cn } from "~/lib/utils";
import { SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";
import { Switch } from "../ui/switch";

const SURFACES = [
  { id: "solid", label: "Solid" },
  { id: "glass", label: "Glass" },
  { id: "clear", label: "Clear" },
] as const;

const GLOW_SWATCHES = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
  { label: "Orange", value: "#f97316" },
  { label: "Green", value: "#10b981" },
] as const;

/** Settings → Appearance → Sidebar: how see-through it is, and the glow behind the brand row. */
export function SidebarAppearanceSettings() {
  const settings = useScopedSettings();
  const update = useUpdateScopedSettings();
  const seeThrough = settings.sidebarSurface !== "solid";
  return (
    <SettingsSection id="appearance-sidebar" title="Sidebar">
      <SettingsRow
        title="Surface"
        description="Glass frosts the background behind the sidebar; Clear shows it sharp. Solid keeps today's opaque panel."
        control={
          <div
            role="radiogroup"
            aria-label="Sidebar surface"
            className="flex rounded-lg border p-0.5"
          >
            {SURFACES.map((surface) => (
              <button
                key={surface.id}
                type="button"
                role="radio"
                aria-checked={settings.sidebarSurface === surface.id}
                onClick={() => update({ sidebarSurface: surface.id })}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  settings.sidebarSurface === surface.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {surface.label}
              </button>
            ))}
          </div>
        }
      />
      {seeThrough ? (
        <SettingsRow
          title="Tint"
          description="How much of the sidebar colour stays over the background."
          control={
            <label className="flex items-center gap-3">
              <input
                aria-label="Sidebar tint"
                type="range"
                min={0}
                max={100}
                value={settings.sidebarTint}
                onChange={(event) => update({ sidebarTint: Number(event.target.value) })}
              />
              <span className="w-9 text-xs tabular-nums">{settings.sidebarTint}%</span>
            </label>
          }
        />
      ) : null}
      <SettingsRow
        title="Glow"
        description="A soft light behind the Synthia name at the top of the sidebar."
        control={
          <Switch
            aria-label="Sidebar glow"
            checked={settings.sidebarGlow}
            onCheckedChange={(value) => update({ sidebarGlow: Boolean(value) })}
          />
        }
      />
      {settings.sidebarGlow ? (
        <>
          <SettingsRow
            title="Glow colour"
            control={
              <div className="flex items-center gap-1.5">
                {GLOW_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    aria-label={swatch.label}
                    aria-pressed={settings.sidebarGlowColor.toLowerCase() === swatch.value}
                    onClick={() => update({ sidebarGlowColor: swatch.value })}
                    className={cn(
                      "size-6 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      settings.sidebarGlowColor.toLowerCase() === swatch.value &&
                        "ring-2 ring-inset ring-foreground/80",
                    )}
                    style={{ backgroundColor: swatch.value }}
                  />
                ))}
                <label className="relative ml-1 flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-xs text-muted-foreground focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
                  <span aria-hidden>+</span>
                  <input
                    aria-label="Custom glow colour"
                    type="color"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={settings.sidebarGlowColor}
                    onChange={(event) => update({ sidebarGlowColor: event.target.value })}
                  />
                </label>
              </div>
            }
          />
          <SettingsRow
            title="Glow intensity"
            control={
              <label className="flex items-center gap-3">
                <input
                  aria-label="Sidebar glow intensity"
                  type="range"
                  min={0}
                  max={100}
                  value={settings.sidebarGlowIntensity}
                  onChange={(event) => update({ sidebarGlowIntensity: Number(event.target.value) })}
                />
                <span className="w-9 text-xs tabular-nums">{settings.sidebarGlowIntensity}%</span>
              </label>
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

import { useState } from "react";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";
import { SettingsSection, SettingsRow } from "../settings/settingsLayout";
import { Switch } from "../ui/switch";
import { BackgroundCanvas, uploadBackground, useLocalBackgrounds } from "./Background";
import { PRESETS } from "./asciiBackground";

export function BackgroundSettings() {
  const settings = useScopedSettings();
  const update = useUpdateScopedSettings();
  const [error, setError] = useState("");
  const images = useLocalBackgrounds();
  const choices: ReadonlyArray<{ id: string; label: string; image: boolean }> = [
    { id: "none", label: "None", image: false },
    ...PRESETS.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), image: false })),
    ...images.map((entry) => ({ id: entry.id, label: entry.label, image: true })),
    { id: "upload", label: "Your image", image: true },
  ];
  return (
    <SettingsSection id="appearance-background" title="Background">
      <p className="text-sm text-muted-foreground">
        A little atmosphere for a fresh start. Images stay on this device.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={settings.backgroundPreset === choice.id}
            onClick={() =>
              update({
                backgroundPreset: choice.id,
                // Images such as the Kail set are already ASCII art: show them as they are.
                ...(choice.image && choice.id !== "upload"
                  ? { backgroundStyle: "original" as const }
                  : !choice.image && settings.backgroundStyle === "original"
                    ? { backgroundStyle: "ascii" as const }
                    : {}),
              })
            }
            className="overflow-hidden rounded-lg border text-left focus-visible:outline-2 focus-visible:outline-ring"
            style={{
              borderColor: settings.backgroundPreset === choice.id ? "var(--primary)" : undefined,
            }}
          >
            <div className="relative h-24 overflow-hidden bg-background">
              {choice.id !== "none" && (
                <BackgroundCanvas
                  preset={choice.id}
                  style={
                    choice.image && choice.id !== "upload"
                      ? "original"
                      : settings.backgroundStyle === "original"
                        ? "ascii"
                        : settings.backgroundStyle
                  }
                  cellSize={settings.backgroundCellSize}
                  thumbnail
                />
              )}
            </div>
            <span className="block px-3 py-2 text-xs">{choice.label}</span>
          </button>
        ))}
      </div>
      <SettingsRow
        title="Style"
        control={
          <select
            aria-label="Background style"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={settings.backgroundStyle}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "original" || v === "ascii" || v === "dither" || v === "halftone")
                update({ backgroundStyle: v });
            }}
          >
            <option value="original">Original image</option>
            <option value="ascii">ASCII</option>
            <option value="dither">Dither</option>
            <option value="halftone">Halftone</option>
          </select>
        }
      />
      <SettingsRow
        title="Cell size"
        control={
          <label className="flex items-center gap-3">
            <input
              aria-label="Background cell size"
              type="range"
              min={6}
              max={24}
              value={settings.backgroundCellSize}
              onChange={(e) => update({ backgroundCellSize: Number(e.target.value) })}
            />
            <span className="text-xs tabular-nums">{settings.backgroundCellSize}px</span>
          </label>
        }
      />
      <SettingsRow
        title="Intensity"
        control={
          <label className="flex items-center gap-3">
            <input
              aria-label="Background intensity"
              type="range"
              min={0}
              max={100}
              value={settings.backgroundIntensity}
              onChange={(e) => update({ backgroundIntensity: Number(e.target.value) })}
            />
            <span className="text-xs tabular-nums">{settings.backgroundIntensity}%</span>
          </label>
        }
      />
      <SettingsRow
        title="Show in threads"
        description="Keep the background behind messages. The text column gets just enough shade to stay readable."
        control={
          <Switch
            aria-label="Show background in threads"
            checked={settings.backgroundShowInThreads}
            onCheckedChange={(v) => update({ backgroundShowInThreads: Boolean(v) })}
          />
        }
      />
      <SettingsRow
        title="Animate"
        description="Slow drift. Respects reduced motion and pauses when hidden."
        control={
          <Switch
            aria-label="Animate background"
            checked={settings.backgroundAnimate}
            onCheckedChange={(v) => update({ backgroundAnimate: Boolean(v) })}
          />
        }
      />
      <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm focus-within:outline-2 focus-within:outline-ring">
        Upload image
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              await uploadBackground(file);
              update({ backgroundPreset: "upload" });
              setError("");
            } catch {
              setError("Could not save this image. Try a smaller image or allow local storage.");
            }
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}

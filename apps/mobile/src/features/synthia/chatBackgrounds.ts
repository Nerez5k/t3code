/** Still dither scenes for the thread background; the desktop app animates the same scenes. */
export const CHAT_BACKGROUNDS = [
  { id: "none", label: "None" },
  { id: "rainy-days", label: "Rainy Days" },
  { id: "waves", label: "Waves" },
  { id: "sakura-drift", label: "Sakura Drift" },
  { id: "campfire", label: "Campfire" },
] as const;

export type ChatBackgroundId = (typeof CHAT_BACKGROUNDS)[number]["id"];

const IMAGES = {
  "rainy-days": {
    dark: require("../../../assets/backgrounds/rainy-days-dark.jpg"),
    light: require("../../../assets/backgrounds/rainy-days-light.jpg"),
  },
  waves: {
    dark: require("../../../assets/backgrounds/waves-dark.jpg"),
    light: require("../../../assets/backgrounds/waves-light.jpg"),
  },
  "sakura-drift": {
    dark: require("../../../assets/backgrounds/sakura-drift-dark.jpg"),
    light: require("../../../assets/backgrounds/sakura-drift-light.jpg"),
  },
  campfire: {
    dark: require("../../../assets/backgrounds/campfire-dark.jpg"),
    light: require("../../../assets/backgrounds/campfire-light.jpg"),
  },
} as const;

/** The image for a stored id, or null for "none" and ids this build does not know. */
export function chatBackgroundImage(id: string | undefined, dark: boolean): number | null {
  if (id === undefined || !(id in IMAGES)) return null;
  const pair = IMAGES[id as keyof typeof IMAGES];
  return dark ? pair.dark : pair.light;
}

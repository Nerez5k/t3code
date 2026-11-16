import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Image } from "expo-image";
import { useColorScheme, View } from "react-native";

import { mobilePreferencesAtom } from "../../state/preferences";
import { chatBackgroundImage } from "./chatBackgrounds";

/**
 * The chosen dither scene behind a thread, under a shade of the screen colour so messages stay
 * readable. A still image, so it costs nothing while the thread scrolls or streams.
 */
export function ChatBackdrop() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const dark = useColorScheme() === "dark";
  const id = AsyncResult.isSuccess(preferences) ? preferences.value.chatBackground : undefined;
  const source = chatBackgroundImage(id, dark);
  if (source === null) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <Image
        source={source}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View className="absolute inset-0 bg-screen" style={{ opacity: dark ? 0.45 : 0.55 }} />
    </View>
  );
}

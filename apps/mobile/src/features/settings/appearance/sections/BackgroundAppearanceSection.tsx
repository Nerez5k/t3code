import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";

import { AppText as Text } from "../../../../components/ui/AppText";
import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { CHAT_BACKGROUNDS } from "../../../synthia/chatBackgrounds";
import { SettingsSection } from "../../components/SettingsSection";

export function BackgroundAppearanceSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const selected = AsyncResult.isSuccess(preferences)
    ? (preferences.value.chatBackground ?? "none")
    : null;

  return (
    <View className="gap-3">
      <SettingsSection title="Background">
        {CHAT_BACKGROUNDS.map((option, index) => (
          <ListChoiceRow
            key={option.id}
            label={option.label}
            selected={selected === option.id}
            separated={index > 0}
            disabled={selected === null}
            onPress={() => savePreferences({ chatBackground: option.id })}
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        A still dither scene behind your threads, matched to light or dark mode. It never animates,
        so it costs no battery.
      </Text>
    </View>
  );
}

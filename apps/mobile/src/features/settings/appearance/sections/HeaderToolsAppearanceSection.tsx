import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";

import { AppText as Text } from "../../../../components/ui/AppText";
import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";

export function HeaderToolsAppearanceSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const shown = AsyncResult.isSuccess(preferences)
    ? preferences.value.threadHeaderTools === true
    : null;
  return (
    <View className="gap-3">
      <SettingsSection title="Thread header">
        <ListChoiceRow
          label="Hide Git and terminal"
          selected={shown === false}
          disabled={shown === null}
          onPress={() => savePreferences({ threadHeaderTools: false })}
        />
        <ListChoiceRow
          label="Show Git and terminal"
          selected={shown === true}
          separated
          disabled={shown === null}
          onPress={() => savePreferences({ threadHeaderTools: true })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        The branch, commit and terminal menus at the top of a thread. Files stay either way.
      </Text>
    </View>
  );
}

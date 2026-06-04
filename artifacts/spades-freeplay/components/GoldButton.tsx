import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type Variant = "solid" | "outline";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * Primary call-to-action button for the card-room theme.
 * `solid` = filled gold, `outline` = gold-bordered ghost button.
 */
export function GoldButton({
  label,
  onPress,
  variant = "solid",
  icon,
  loading = false,
  disabled = false,
  style,
}: Props) {
  const colors = useColors();
  const isSolid = variant === "solid";
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  const fg = isSolid ? colors.primaryForeground : colors.primary;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: colors.radius,
          backgroundColor: isSolid ? colors.primary : "transparent",
          borderWidth: isSolid ? 0 : 1.5,
          borderColor: colors.primary,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.3,
  },
});

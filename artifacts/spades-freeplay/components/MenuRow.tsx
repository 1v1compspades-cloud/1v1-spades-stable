import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  label: string;
  sublabel?: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  external?: boolean;
};

/** A tappable settings-style row used for navigation and external links. */
export function MenuRow({ label, sublabel, icon, onPress, external }: Props) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.sublabel, { color: colors.mutedForeground }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <Feather
        name={external ? "external-link" : "chevron-right"}
        size={18}
        color={colors.mutedForeground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15.5,
  },
  sublabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    marginTop: 2,
  },
});

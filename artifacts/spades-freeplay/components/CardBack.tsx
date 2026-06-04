import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  width?: number;
  style?: ViewStyle;
  dim?: boolean;
};

/**
 * A face-down playing card in the black & gold card-room style.
 *
 * Used for the deck, dealt piles, and the teaching deal animation — anywhere a
 * card's face should stay hidden. Kept separate from `PlayingCard` (face-up) so
 * the shared face-up component is never altered.
 */
export function CardBack({ width = 48, style, dim = false }: Props) {
  const colors = useColors();
  const height = Math.round(width * 1.4);
  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: Math.round(width * 0.16),
          borderColor: dim ? colors.border : colors.goldDim,
          backgroundColor: colors.card,
          shadowColor: colors.shadow,
          opacity: dim ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            borderColor: dim ? colors.border : colors.goldDim,
            borderRadius: Math.round(width * 0.1),
          },
        ]}
      >
        <Feather
          name="award"
          size={Math.round(width * 0.42)}
          color={dim ? colors.muted : colors.goldDim}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 4,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  inner: {
    flex: 1,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

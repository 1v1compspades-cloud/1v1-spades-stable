import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { SUIT_HEX_COLORS, SUIT_SYMBOLS, type Card } from "@workspace/spades-core";
import { useColors } from "@/hooks/useColors";

type Props = {
  card: Card;
  width?: number;
  style?: ViewStyle;
};

/**
 * A single face-up playing card rendered in the card-room style.
 * Suit symbols + colors come from the shared @workspace/spades-core package so
 * the mobile app and web client always agree on how a card looks.
 */
export function PlayingCard({ card, width = 64, style }: Props) {
  const colors = useColors();
  const height = Math.round(width * 1.4);
  const suitColor = SUIT_HEX_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: Math.round(width * 0.16),
          borderColor: colors.border,
          backgroundColor: colors.cardFace,
          shadowColor: colors.shadow,
        },
        style,
      ]}
    >
      <Text style={[styles.corner, { color: suitColor, fontSize: width * 0.26 }]}>
        {card.rank}
      </Text>
      <Text style={[styles.pip, { color: suitColor, fontSize: width * 0.5 }]}>
        {symbol}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: "space-between",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  corner: {
    fontFamily: "Inter_700Bold",
    lineHeight: undefined,
  },
  pip: {
    alignSelf: "flex-end",
    fontFamily: "Inter_600SemiBold",
  },
});

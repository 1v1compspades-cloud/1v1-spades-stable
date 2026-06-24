import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { useColors } from "@/hooks/useColors";
import { LINKS } from "@/constants/links";

type Point = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
};

const POINTS: Point[] = [
  {
    icon: "gift",
    title: "Just for fun",
    body: "Every game is casual play, with nothing on the line but bragging rights. You play for the love of the game.",
  },
  {
    icon: "server",
    title: "Server-decided outcomes",
    body: "Every deal, every legal move, and every score is decided by the server — never by your device. The app shows you only your own hand and a fair view of the table.",
  },
  {
    icon: "eye-off",
    title: "Hidden hands",
    body: "Your cards are yours alone. Opponents and onlookers never see your hand until cards are played, so no one can peek at what you are holding.",
  },
  {
    icon: "heart",
    title: "Respect the table",
    body: "Play your best, keep it friendly, and let people enjoy the game. Stalling, abuse, and bad-faith play have no place at the table.",
  },
];

export default function FairPlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        A few principles that keep every game fair and fun for both players.
      </Text>

      {POINTS.map((p) => (
        <View
          key={p.title}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.cardHead}>
            <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
              <Feather name={p.icon} size={16} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {p.title}
            </Text>
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {p.body}
          </Text>
        </View>
      ))}

      <GoldButton
        label="Questions? Ask in the Discord"
        icon="message-circle"
        variant="outline"
        onPress={() => WebBrowser.openBrowserAsync(LINKS.discord).catch(() => {})}
        style={{ marginTop: 6 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    gap: 14,
  },
  intro: {
    fontFamily: "Inter_400Regular",
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
});

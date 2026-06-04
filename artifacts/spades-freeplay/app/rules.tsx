import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { useColors } from "@/hooks/useColors";

type Section = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
};

const SECTIONS: Section[] = [
  {
    icon: "users",
    title: "The setup",
    body: "Spades is a trick-taking game played head-to-head, one against one. Each player is dealt a hidden hand and tries to win tricks. Spades are always the trump suit.",
  },
  {
    icon: "edit-3",
    title: "Bidding",
    body: "Before each round, both players bid how many tricks they expect to win. Make your bid to score; fall short and you get 'set' and lose points. Bidding order alternates each round.",
  },
  {
    icon: "layers",
    title: "Playing a trick",
    body: "The leader plays any legal card and the other player must follow that suit if they can. The highest card of the led suit wins — unless a spade is played, in which case the highest spade takes the trick.",
  },
  {
    icon: "zap",
    title: "Breaking spades",
    body: "You cannot lead with a spade until spades have been 'broken' — that is, until a spade has been played on an earlier trick (or you hold nothing but spades).",
  },
  {
    icon: "target",
    title: "Nil bids",
    body: "Bid Nil to claim you will win zero tricks. Pull it off for a big bonus; take even one trick and it costs you the same amount.",
  },
  {
    icon: "award",
    title: "Winning",
    body: "Points add up over multiple rounds. The first player to reach the match target — and hold the lead — wins. Overtricks pile up as 'bags', and too many bags carry a penalty.",
  },
];

export default function Rules() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        A quick guide to 1v1 Spades. Same rules as the table — just you and one
        opponent.
      </Text>

      <GoldButton
        label="Watch how dealing works"
        icon="play-circle"
        variant="outline"
        onPress={() => router.push("/learn-deal")}
      />

      {SECTIONS.map((s) => (
        <View
          key={s.title}
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
              <Feather name={s.icon} size={16} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {s.title}
            </Text>
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {s.body}
          </Text>
        </View>
      ))}
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

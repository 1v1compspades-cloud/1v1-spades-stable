import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { PlayingCard } from "@/components/PlayingCard";
import { useColors } from "@/hooks/useColors";
import { sortHandBySuit, type Card } from "@workspace/spades-core";

const SAMPLE_HAND: Card[] = [
  { suit: "spades", rank: "A" },
  { suit: "spades", rank: "10" },
  { suit: "hearts", rank: "K" },
  { suit: "hearts", rank: "7" },
  { suit: "clubs", rank: "Q" },
  { suit: "diamonds", rank: "9" },
];

export default function Play() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);

  const grouped = sortHandBySuit(SAMPLE_HAND);

  const onFindMatch = () => {
    setSearching(true);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>
        Find a 1v1 match
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Get matched against another player for a free head-to-head game. Just
        you, an opponent, and a deck.
      </Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          Display name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter a name for the table"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius,
            },
          ]}
          maxLength={20}
          autoCapitalize="words"
        />
      </View>

      {searching ? (
        <View
          style={[
            styles.searchCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="search" size={22} color={colors.primary} />
          <Text style={[styles.searchTitle, { color: colors.foreground }]}>
            Matchmaking coming soon
          </Text>
          <Text style={[styles.searchBody, { color: colors.mutedForeground }]}>
            Live matchmaking lands in the next update. For now, you can play a
            friend with a private table.
          </Text>
          <GoldButton
            label="Play a Friend instead"
            icon="users"
            variant="outline"
            onPress={() => router.replace("/friend")}
            style={{ marginTop: 6 }}
          />
        </View>
      ) : (
        <GoldButton
          label="Find Match"
          icon="zap"
          onPress={onFindMatch}
          disabled={name.trim().length === 0}
        />
      )}

      {/* Preview of a sorted hand, rendered via shared spades-core helpers */}
      <View style={styles.previewBlock}>
        <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
          YOUR HAND, SORTED
        </Text>
        <View style={styles.handRow}>
          {grouped.flatMap((group) =>
            group.cards.map((card) => (
              <PlayingCard
                key={`${card.suit}-${card.rank}`}
                card={card}
                width={46}
                style={{ marginRight: 6, marginBottom: 6 }}
              />
            )),
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
    gap: 18,
  },
  heading: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14.5,
    lineHeight: 21,
  },
  field: {
    gap: 8,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  searchCard: {
    borderWidth: 1,
    padding: 20,
    gap: 10,
    alignItems: "flex-start",
  },
  searchTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  searchBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  previewBlock: {
    gap: 12,
    marginTop: 8,
  },
  previewLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 2,
  },
  handRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});

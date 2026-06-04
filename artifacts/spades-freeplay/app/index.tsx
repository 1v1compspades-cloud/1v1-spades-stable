import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { PlayingCard } from "@/components/PlayingCard";
import { useColors } from "@/hooks/useColors";
import { LINKS } from "@/constants/links";
import { loadOnboarded } from "@/lib/session";
import type { Card } from "@workspace/spades-core";

const HERO_FAN: Card[] = [
  { suit: "spades", rank: "A" },
  { suit: "hearts", rank: "K" },
  { suit: "clubs", rank: "Q" },
  { suit: "diamonds", rank: "J" },
];

export default function Home() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);

  // First-launch gate: send brand-new users to onboarding before the home screen.
  useEffect(() => {
    let active = true;
    loadOnboarded().then((seen) => {
      if (!active) return;
      if (seen) {
        setReady(true);
      } else {
        router.replace("/onboarding");
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  const openLink = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  if (!ready) {
    return <View style={[styles.root, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.felt, colors.background, colors.background]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.glowWrap}>
        <LinearGradient
          colors={[colors.glowStrong, colors.glowFade]}
          style={styles.glow}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.fan}>
            {HERO_FAN.map((card, i) => {
              const mid = (HERO_FAN.length - 1) / 2;
              const angle = (i - mid) * 11;
              return (
                <PlayingCard
                  key={`${card.suit}-${card.rank}`}
                  card={card}
                  width={70}
                  style={{
                    marginHorizontal: -14,
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateY: Math.abs(i - mid) * 8 },
                    ],
                  }}
                />
              );
            })}
          </View>

          <View style={styles.titleRow}>
            <Feather name="award" size={22} color={colors.gold} />
            <Text style={[styles.brand, { color: colors.foreground }]}>SPADES</Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.gold }]}>
            FREE PLAY
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Head-to-head 1v1 Spades. Just you and the table.
          </Text>
        </View>

        {/* Primary actions */}
        <View style={styles.actions}>
          <GoldButton
            label="Quick Match"
            icon="zap"
            onPress={() => router.push("/play")}
          />
          <GoldButton
            label="Play a Friend"
            icon="users"
            variant="outline"
            onPress={() => router.push("/friend")}
          />
        </View>

        {/* Info tiles */}
        <View style={styles.tiles}>
          <InfoTile
            icon="book-open"
            label="How to Play"
            onPress={() => router.push("/rules")}
          />
          <InfoTile
            icon="shield"
            label="Fair Play"
            onPress={() => router.push("/fairplay")}
          />
        </View>

        {/* Community / web */}
        <View style={styles.community}>
          <CommunityLink
            icon="award"
            label="Tournaments on 1v1spades.com"
            onPress={() => openLink(LINKS.websiteTournaments)}
          />
          <CommunityLink
            icon="message-circle"
            label="Join the Discord"
            onPress={() => openLink(LINKS.discord)}
          />
          <CommunityLink
            icon="globe"
            label="Visit 1v1spades.com"
            onPress={() => openLink(LINKS.website)}
          />
        </View>

        {/* Replay onboarding */}
        <Pressable
          onPress={() => router.push("/onboarding")}
          style={({ pressed }) => [styles.tourRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="help-circle" size={14} color={colors.mutedForeground} />
          <Text style={[styles.tourLabel, { color: colors.mutedForeground }]}>
            New here? Take the tour
          </Text>
        </Pressable>

        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          Free play only — competitive tournaments are hosted on the website.
        </Text>
      </ScrollView>
    </View>
  );
}

function InfoTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Feather name={icon} size={20} color={colors.primary} />
      <Text style={[styles.tileLabel, { color: colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CommunityLink({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.communityLink, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Feather name={icon} size={16} color={colors.gold} />
      <Text style={[styles.communityLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <Feather name="external-link" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glowWrap: {
    position: "absolute",
    top: -120,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  glow: {
    width: 460,
    height: 460,
    borderRadius: 230,
  },
  content: {
    paddingHorizontal: 22,
    gap: 26,
  },
  hero: {
    alignItems: "center",
    gap: 6,
  },
  fan: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 22,
    height: 120,
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    letterSpacing: 6,
  },
  subtitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    letterSpacing: 8,
  },
  tagline: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 280,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  tiles: {
    flexDirection: "row",
    gap: 12,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 10,
  },
  tileLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  community: {
    gap: 4,
    marginTop: 2,
  },
  communityLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  communityLabel: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14.5,
  },
  tourRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 4,
    marginTop: -10,
  },
  tourLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  footnote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: -8,
    paddingHorizontal: 24,
  },
});

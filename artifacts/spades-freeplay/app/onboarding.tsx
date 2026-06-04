import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { PlayingCard } from "@/components/PlayingCard";
import { useColors } from "@/hooks/useColors";
import { setOnboarded } from "@/lib/session";
import type { Card } from "@workspace/spades-core";

type Step = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "award",
    title: "Welcome to 1v1 Spades",
    body: "A fast, head-to-head take on the classic trick-taking card game. One opponent, one deck — pure skill.",
  },
  {
    icon: "edit-3",
    title: "Bid, then battle",
    body: "Call how many tricks you'll win, then play them out. Spades are always trump. Make your bid to score — fall short and you're set.",
  },
  {
    icon: "users",
    title: "Two ways to play",
    body: "Quick Match spins up a private table you can share instantly. Play a Friend lets you create or join a table with a code.",
  },
  {
    icon: "gift",
    title: "Free play, always",
    body: "Every game is free, with nothing on the line but bragging rights. No catches — just you, your opponent, and the cards.",
  },
];

const HERO_FAN: Card[] = [
  { suit: "spades", rank: "A" },
  { suit: "spades", rank: "K" },
  { suit: "spades", rank: "Q" },
];

export default function Onboarding() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = async () => {
    await setOnboarded();
    router.replace("/");
  };

  const next = () => {
    if (isLast) {
      void finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => {
    if (step > 0) setStep((s) => s - 1);
  };

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

      {/* Top bar: Back + Skip */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 10 },
        ]}
      >
        {step > 0 ? (
          <Pressable
            onPress={back}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </Pressable>
        ) : (
          <View style={styles.topBarSpacer} />
        )}
        <Pressable
          onPress={() => void finish()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.skip, { color: colors.mutedForeground }]}>
            Skip
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {step === 0 ? (
          <View style={styles.fan}>
            {HERO_FAN.map((card, i) => {
              const mid = (HERO_FAN.length - 1) / 2;
              const angle = (i - mid) * 12;
              return (
                <PlayingCard
                  key={`${card.suit}-${card.rank}`}
                  card={card}
                  width={76}
                  style={{
                    marginHorizontal: -12,
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateY: Math.abs(i - mid) * 8 },
                    ],
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Feather name={current.icon} size={40} color={colors.primary} />
          </View>
        )}

        <Text style={[styles.title, { color: colors.foreground }]}>
          {current.title}
        </Text>
        <Text style={[styles.text, { color: colors.mutedForeground }]}>
          {current.body}
        </Text>
      </View>

      {/* Progress dots */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === step ? colors.primary : colors.border,
                width: i === step ? 22 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <GoldButton
          label={isLast ? "Start Playing" : "Next"}
          icon={isLast ? "play" : "arrow-right"}
          onPress={next}
        />
      </View>
    </View>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  topBarSpacer: {
    width: 26,
  },
  skip: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 18,
  },
  fan: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 130,
    marginBottom: 8,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    textAlign: "center",
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 15.5,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 320,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
  },
});

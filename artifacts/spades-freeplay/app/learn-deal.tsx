import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardBack } from "@/components/CardBack";
import { GoldButton } from "@/components/GoldButton";
import { useColors } from "@/hooks/useColors";

// Native driver is unavailable on react-native-web; gate it so transforms/opacity
// animate on the UI thread on device and fall back cleanly in the web preview.
const NATIVE = Platform.OS !== "web";

const BOARD_W = 320;
const BOARD_H = 372;
const CARD_W = 44;
const CARD_H = Math.round(CARD_W * 1.4);
const SLOT_W = CARD_W + 16;
const SLOT_H = CARD_H + 16;
const CARDS_PER_PILE = 4;

const CX = BOARD_W / 2;
const CY = BOARD_H / 2;

type PileKey = "opponent" | "you" | "left" | "right";

const SLOTS: Record<
  PileKey,
  { x: number; y: number; label: string; active: boolean }
> = {
  opponent: { x: 0, y: -126, label: "Opponent", active: true },
  you: { x: 0, y: 126, label: "You", active: true },
  left: { x: -112, y: 2, label: "Side hand", active: false },
  right: { x: 112, y: 2, label: "Side hand", active: false },
};

// Where the discarded side hands collect.
const GRAVE = { x: -98, y: -138 };

// Counter-clockwise deal order ("dealing left").
const DEAL_ORDER: PileKey[] = ["you", "left", "opponent", "right"];

const CAPTIONS = {
  shuffle: "The dealer shuffles the deck.",
  cut: "Your opponent cuts the deck.",
  deal: "The dealer deals one card at a time into four piles.",
  graveyard:
    "The two side piles are set aside — the graveyard. Only the opposite piles are in play.",
  done: "You play the bottom pile, your opponent plays the top — 13 cards each.",
} as const;

type Phase = keyof typeof CAPTIONS;

type Dealt = {
  key: string;
  pile: PileKey;
  stack: number;
  tx: Animated.Value;
  ty: Animated.Value;
  op: Animated.Value;
};

export default function LearnDeal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("shuffle");

  // --- Animated values (created once) ---
  const deckOpacity = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const cutX = useRef(new Animated.Value(0)).current;
  const cutY = useRef(new Animated.Value(0)).current;
  const glowOpponent = useRef(new Animated.Value(0)).current;
  const glowYou = useRef(new Animated.Value(0)).current;

  const cardsRef = useRef<Dealt[] | null>(null);
  if (cardsRef.current === null) {
    const arr: Dealt[] = [];
    const counts: Record<PileKey, number> = {
      opponent: 0,
      you: 0,
      left: 0,
      right: 0,
    };
    for (let round = 0; round < CARDS_PER_PILE; round++) {
      for (const pile of DEAL_ORDER) {
        const stack = counts[pile]++;
        arr.push({
          key: `${pile}-${stack}`,
          pile,
          stack,
          tx: new Animated.Value(0),
          ty: new Animated.Value(0),
          op: new Animated.Value(0),
        });
      }
    }
    cardsRef.current = arr;
  }
  const cards = cardsRef.current;

  // Monotonic run token: every new run (or skip/unmount) bumps this so any
  // pending Animated callback from a prior run bails instead of chaining.
  const runIdRef = useRef(0);

  const allValues = (): Animated.Value[] => [
    deckOpacity,
    wiggle,
    cutX,
    cutY,
    glowOpponent,
    glowYou,
    ...cards.flatMap((c) => [c.tx, c.ty, c.op]),
  ];

  const stopAll = () => {
    allValues().forEach((v) => v.stopAnimation());
  };

  const reset = () => {
    deckOpacity.setValue(1);
    wiggle.setValue(0);
    cutX.setValue(0);
    cutY.setValue(0);
    glowOpponent.setValue(0);
    glowYou.setValue(0);
    cards.forEach((c) => {
      c.tx.setValue(0);
      c.ty.setValue(0);
      c.op.setValue(0);
    });
  };

  const setFinal = () => {
    deckOpacity.setValue(0);
    glowOpponent.setValue(1);
    glowYou.setValue(1);
    cards.forEach((c) => {
      const s = SLOTS[c.pile];
      if (s.active) {
        c.tx.setValue(s.x);
        c.ty.setValue(s.y + c.stack * 2);
        c.op.setValue(1);
      } else {
        c.tx.setValue(GRAVE.x);
        c.ty.setValue(GRAVE.y + c.stack * 2);
        c.op.setValue(0.4);
      }
    });
  };

  const t = (v: Animated.Value, to: number, d: number) =>
    Animated.timing(v, {
      toValue: to,
      duration: d,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: NATIVE,
    });

  const play = (fast = false) => {
    const myRun = ++runIdRef.current;
    stopAll();
    reset();
    const k = fast ? 0.5 : 1;

    const shuffle = Animated.sequence([
      t(wiggle, 1, 150 * k),
      t(wiggle, -1, 150 * k),
      t(wiggle, 1, 150 * k),
      t(wiggle, 0, 150 * k),
    ]);

    const cut = Animated.sequence([
      t(cutY, -56, 240 * k),
      t(cutX, 70, 240 * k),
      Animated.parallel([t(cutX, 0, 220 * k), t(cutY, 0, 220 * k)]),
    ]);

    const dealSteps = cards.map((c) => {
      const s = SLOTS[c.pile];
      return Animated.parallel([
        t(c.tx, s.x, 150 * k),
        t(c.ty, s.y + c.stack * 2, 150 * k),
        t(c.op, 1, 120 * k),
      ]);
    });
    const staggerMs = 58 * k;
    const deal = Animated.stagger(staggerMs, dealSteps);
    const dealTotal = staggerMs * cards.length + 150 * k;

    const graveMoves: Animated.CompositeAnimation[] = [];
    cards.forEach((c) => {
      if (c.pile === "left" || c.pile === "right") {
        graveMoves.push(t(c.tx, GRAVE.x, 440 * k));
        graveMoves.push(t(c.ty, GRAVE.y + c.stack * 2, 440 * k));
        graveMoves.push(t(c.op, 0.4, 440 * k));
      }
    });
    graveMoves.push(t(glowOpponent, 1, 440 * k));
    graveMoves.push(t(glowYou, 1, 440 * k));
    const grave = Animated.parallel(graveMoves);

    const live = () => runIdRef.current === myRun;

    setPhase("shuffle");
    shuffle.start(() => {
      if (!live()) return;
      setPhase("cut");
      cut.start(() => {
        if (!live()) return;
        setPhase("deal");
        Animated.timing(deckOpacity, {
          toValue: 0,
          duration: dealTotal,
          useNativeDriver: NATIVE,
        }).start();
        deal.start(() => {
          if (!live()) return;
          setPhase("graveyard");
          grave.start(() => {
            if (!live()) return;
            setPhase("done");
          });
        });
      });
    });
  };

  const skip = () => {
    runIdRef.current++;
    stopAll();
    setFinal();
    setPhase("done");
  };

  useEffect(() => {
    play(false);
    return () => {
      runIdRef.current++;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = wiggle.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-6deg", "0deg", "6deg"],
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.felt, colors.background, colors.background]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18 },
        ]}
      >
        <Text style={[styles.heading, { color: colors.foreground }]}>
          How a 1v1 deal works
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          A quick, no-stakes walkthrough of how the cards hit the table.
        </Text>

        {/* Animation board */}
        <View style={styles.boardWrap}>
          <View style={{ width: BOARD_W, height: BOARD_H }}>
            {/* Graveyard zone */}
            <View
              style={[
                styles.graveBox,
                {
                  left: CX + GRAVE.x - SLOT_W / 2,
                  top: CY + GRAVE.y - SLOT_H / 2,
                  width: SLOT_W,
                  height: SLOT_H,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="trash-2" size={16} color={colors.mutedForeground} />
            </View>
            <Text
              style={[
                styles.graveLabel,
                {
                  left: CX + GRAVE.x - 40,
                  top: CY + GRAVE.y + SLOT_H / 2 - 4,
                  color: colors.mutedForeground,
                },
              ]}
            >
              Graveyard
            </Text>

            {/* Pile slots + labels */}
            {(Object.keys(SLOTS) as PileKey[]).map((key) => {
              const s = SLOTS[key];
              const glow = key === "opponent" ? glowOpponent : key === "you" ? glowYou : null;
              return (
                <React.Fragment key={key}>
                  {glow ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.glowRing,
                        {
                          left: CX + s.x - (SLOT_W + 14) / 2,
                          top: CY + s.y - (SLOT_H + 14) / 2,
                          width: SLOT_W + 14,
                          height: SLOT_H + 14,
                          borderColor: colors.gold,
                          opacity: glow,
                        },
                      ]}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.slot,
                      {
                        left: CX + s.x - SLOT_W / 2,
                        top: CY + s.y - SLOT_H / 2,
                        width: SLOT_W,
                        height: SLOT_H,
                        borderColor: s.active ? colors.goldDim : colors.border,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.slotLabel,
                      {
                        left: CX + s.x - 50,
                        top:
                          key === "opponent"
                            ? CY + s.y - SLOT_H / 2 - 18
                            : CY + s.y + SLOT_H / 2 + 4,
                        color: s.active ? colors.gold : colors.mutedForeground,
                      },
                    ]}
                  >
                    {s.label}
                    {s.active ? "" : " (out)"}
                  </Text>
                </React.Fragment>
              );
            })}

            {/* Dealt cards */}
            {cards.map((c) => (
              <Animated.View
                key={c.key}
                style={[
                  styles.dealt,
                  {
                    left: CX - CARD_W / 2,
                    top: CY - CARD_H / 2,
                    opacity: c.op,
                    transform: [{ translateX: c.tx }, { translateY: c.ty }],
                  },
                ]}
              >
                <CardBack width={CARD_W} dim={c.pile === "left" || c.pile === "right"} />
              </Animated.View>
            ))}

            {/* Deck (shuffle + cut) */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.deck,
                {
                  left: CX - CARD_W / 2,
                  top: CY - CARD_H / 2,
                  opacity: deckOpacity,
                  transform: [{ rotate }],
                },
              ]}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={{ position: "absolute", top: i * 1.2, left: i * 0.6 }}
                >
                  <CardBack width={CARD_W} />
                </View>
              ))}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.deck,
                {
                  left: CX - CARD_W / 2,
                  top: CY - CARD_H / 2 - 3,
                  opacity: deckOpacity,
                  transform: [
                    { translateX: cutX },
                    { translateY: cutY },
                    { rotate },
                  ],
                },
              ]}
            >
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={{ position: "absolute", top: i * 1.2, left: i * 0.6 }}
                >
                  <CardBack width={CARD_W} />
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        {/* Caption */}
        <View style={styles.captionWrap}>
          <Text style={[styles.caption, { color: colors.foreground }]}>
            {CAPTIONS[phase]}
          </Text>
          <View style={styles.legend}>
            <View style={[styles.legendDot, { backgroundColor: colors.gold }]} />
            <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
              Gold = your two active piles
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {phase !== "done" ? (
            <GoldButton
              label="Skip"
              icon="skip-forward"
              variant="outline"
              onPress={skip}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <View style={styles.controlRow}>
                <GoldButton
                  label="Replay"
                  icon="rotate-ccw"
                  variant="outline"
                  onPress={() => play(false)}
                  style={{ flex: 1 }}
                />
                <GoldButton
                  label="Fast Deal"
                  icon="fast-forward"
                  variant="outline"
                  onPress={() => play(true)}
                  style={{ flex: 1 }}
                />
              </View>
              <GoldButton label="Got it" icon="check" onPress={() => router.back()} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 22,
  },
  heading: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    textAlign: "center",
    marginTop: 4,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  boardWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  graveBox: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  graveLabel: {
    position: "absolute",
    width: 80,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 10.5,
  },
  glowRing: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 14,
  },
  slot: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
  },
  slotLabel: {
    position: "absolute",
    width: 100,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  dealt: {
    position: "absolute",
  },
  deck: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
  },
  captionWrap: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  caption: {
    fontFamily: "Inter_500Medium",
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  controls: {
    marginTop: 8,
  },
  controlRow: {
    flexDirection: "row",
    gap: 10,
  },
});

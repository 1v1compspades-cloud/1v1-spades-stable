import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useSocket } from "@/hooks/useSocket";
import { clearSession, loadSession } from "@/lib/session";
import { sortHandBySuit, type Card, type GameState } from "@workspace/spades-core";

type Seat = 0 | 1;

function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

/** UI-only follow-suit hint. The SERVER is the sole authority on legality. */
function isPlayable(hand: Card[], trick: GameState["currentTrick"], card: Card): boolean {
  if (trick.length === 0) return true; // leading — server enforces spades-broken
  const leadSuit = trick[0].card.suit;
  const hasLead = hand.some((c) => c.suit === leadSuit);
  return hasLead ? card.suit === leadSuit : true;
}

export default function Game() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string; seat?: string; name?: string }>();

  const {
    gameState,
    status,
    error,
    clearError,
    setActiveRoom,
    clearGameState,
    reconnect,
    setReady,
    startGame,
    placeBid,
    playCard,
    nextRound,
    newMatch,
  } = useSocket();

  const code = (params.code ?? gameState?.roomCode ?? "").toUpperCase();
  const paramSeat: Seat | null =
    params.seat != null && (Number(params.seat) === 0 || Number(params.seat) === 1)
      ? (Number(params.seat) as Seat)
      : null;
  const name = params.name ?? "";

  const [resolvedSeat, setResolvedSeat] = useState<Seat | null>(paramSeat);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const gsRef = useRef<GameState | null>(gameState);
  gsRef.current = gameState;

  // Source of truth for our seat: the route param if present, otherwise the
  // persisted session (cold relaunch / foreground). Never silently default to
  // seat 0 — that would mislabel turns/scores for the seat-1 player.
  useEffect(() => {
    if (resolvedSeat != null) return;
    let alive = true;
    loadSession().then((sess) => {
      if (alive && (sess?.playerIndex === 0 || sess?.playerIndex === 1)) {
        setResolvedSeat(sess.playerIndex);
      }
    });
    return () => {
      alive = false;
    };
  }, [resolvedSeat]);

  // Bind the active room so foreign-room broadcasts can't clobber this view.
  useEffect(() => {
    if (code) setActiveRoom(code);
    return () => setActiveRoom(null);
  }, [code, setActiveRoom]);

  // If we land here without state (app relaunch / foreground), re-claim the seat
  // from the saved session so the server re-broadcasts our current view.
  useEffect(() => {
    if (gameState) return;
    const t = setTimeout(async () => {
      if (gsRef.current) return;
      const sess = await loadSession();
      const useCode = code || sess?.roomCode || "";
      const useSeat: Seat | undefined =
        resolvedSeat ?? (sess?.playerIndex === 0 || sess?.playerIndex === 1 ? sess.playerIndex : undefined);
      const useName = name || sess?.playerName || "";
      if (useCode && (useSeat === 0 || useSeat === 1) && useName) {
        if (resolvedSeat == null) setResolvedSeat(useSeat);
        try {
          await reconnect(useCode, useSeat, useName, sess?.token);
        } catch {
          /* surfaced via socket error state */
        }
      }
    }, 700);
    return () => clearTimeout(t);
  }, [gameState, code, resolvedSeat, name, reconnect]);

  const onCopy = useCallback(async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }, [code]);

  const leaveToHome = useCallback(() => {
    clearGameState();
    setActiveRoom(null);
    void clearSession();
    router.replace("/");
  }, [clearGameState, setActiveRoom, router]);

  const wrap = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "That action was rejected.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // ── Loading / connecting ────────────────────────────────────────────────
  if (!gameState || resolvedSeat == null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>
          {status === "online" ? "Loading table…" : "Connecting…"}
        </Text>
        {error ? (
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        ) : null}
        <Pressable onPress={leaveToHome} style={styles.linkBtn}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Back to menu</Text>
        </Pressable>
      </View>
    );
  }

  const gs = gameState;
  const mySeat: Seat = resolvedSeat;
  const oppSeat = otherSeat(mySeat);
  const me = gs.players[mySeat];
  const opp = gs.players[oppSeat];
  const myName = me?.name ?? name ?? "You";
  const oppName = opp?.name ?? "Opponent";
  const phase = gs.phase;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 28, paddingTop: insets.top + 8 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tableLabel, { color: colors.mutedForeground }]}>
            {gs.matchLabel ?? `Race to ${gs.matchTarget}`}
          </Text>
          <Text style={[styles.roomCode, { color: colors.foreground }]}>
            Table {code}
          </Text>
        </View>
        <ConnPill status={status} colors={colors} />
      </View>

      {/* Scoreboard */}
      <View
        style={[
          styles.scoreboard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <SeatScore
          label={myName + " (you)"}
          score={gs.scores[mySeat]}
          bid={gs.bids[mySeat]}
          tricks={gs.tricks[mySeat]}
          bags={gs.bags[mySeat]}
          highlight={gs.currentTurnIndex === mySeat || gs.currentBidder === mySeat}
          colors={colors}
        />
        <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
        <SeatScore
          label={oppName}
          score={gs.scores[oppSeat]}
          bid={gs.bids[oppSeat]}
          tricks={gs.tricks[oppSeat]}
          bags={gs.bags[oppSeat]}
          highlight={gs.currentTurnIndex === oppSeat || gs.currentBidder === oppSeat}
          colors={colors}
        />
      </View>

      {error || actionError ? (
        <Pressable
          onPress={() => {
            clearError();
            setActionError(null);
          }}
          style={[styles.banner, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
        >
          <Feather name="alert-circle" size={15} color={colors.destructive} />
          <Text style={[styles.bannerText, { color: colors.foreground }]}>
            {error ?? actionError}
          </Text>
        </Pressable>
      ) : null}

      {/* Phase body */}
      {phase === "waiting" && (
        <WaitingView
          gs={gs}
          mySeat={mySeat}
          code={code}
          copied={copied}
          onCopy={onCopy}
          busy={busy}
          onReady={(r) => wrap(() => setReady(code, r))}
          onStart={() => startGame(code)}
          colors={colors}
        />
      )}

      {phase === "coin_toss" && (
        <CenterCard colors={colors} icon="disc" title="Coin toss">
          <Text style={[styles.centerBody, { color: colors.mutedForeground }]}>
            {gs.coinFlipWinner == null
              ? "Flipping…"
              : `${gs.players[gs.coinFlipWinner]?.name ?? `Seat ${gs.coinFlipWinner + 1}`} won the toss and bids second.`}
          </Text>
        </CenterCard>
      )}

      {phase === "shuffling" && (
        <CenterCard colors={colors} icon="shuffle" title="Shuffling & dealing">
          <ActivityIndicator color={colors.primary} style={{ marginTop: 6 }} />
        </CenterCard>
      )}

      {phase === "bidding" && (
        <BiddingView
          gs={gs}
          mySeat={mySeat}
          busy={busy}
          onBid={(n) => wrap(() => placeBid(code, n))}
          colors={colors}
        />
      )}

      {phase === "playing" && (
        <PlayingView
          gs={gs}
          mySeat={mySeat}
          busy={busy}
          onPlay={(card) => wrap(() => playCard(code, card))}
          colors={colors}
        />
      )}

      {phase === "round_over" && (
        <RoundOverView gs={gs} onNext={() => nextRound(code)} colors={colors} />
      )}

      {phase === "game_over" && (
        <GameOverView
          gs={gs}
          mySeat={mySeat}
          onNewMatch={() => newMatch(code)}
          onLeave={leaveToHome}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ─── Sub-views ───────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;

function ConnPill({ status, colors }: { status: string; colors: Colors }) {
  const online = status === "online";
  return (
    <View style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: online ? colors.gold : colors.mutedForeground },
        ]}
      />
      <Text style={[styles.pillText, { color: colors.mutedForeground }]}>
        {online ? "Live" : status === "offline" ? "Offline" : "Reconnecting"}
      </Text>
    </View>
  );
}

function SeatScore({
  label,
  score,
  bid,
  tricks,
  bags,
  highlight,
  colors,
}: {
  label: string;
  score: number;
  bid: number | null;
  tricks: number;
  bags: number;
  highlight: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.seatScore}>
      <Text
        numberOfLines={1}
        style={[
          styles.seatName,
          { color: highlight ? colors.gold : colors.foreground },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.seatScoreNum, { color: colors.foreground }]}>{score}</Text>
      <Text style={[styles.seatMeta, { color: colors.mutedForeground }]}>
        {bid == null ? "no bid" : bid === 0 ? "nil" : `bid ${bid}`} · won {tricks} · {bags} bags
      </Text>
    </View>
  );
}

function CenterCard({
  colors,
  icon,
  title,
  children,
}: {
  colors: Colors;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.phaseCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <Feather name={icon} size={26} color={colors.primary} />
      <Text style={[styles.phaseTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function WaitingView({
  gs,
  mySeat,
  code,
  copied,
  onCopy,
  busy,
  onReady,
  onStart,
  colors,
}: {
  gs: GameState;
  mySeat: Seat;
  code: string;
  copied: boolean;
  onCopy: () => void;
  busy: boolean;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  colors: Colors;
}) {
  const bothSeated = !!gs.players[0] && !!gs.players[1];
  const ready = gs.ready ?? [false, false];
  const iAmReady = ready[mySeat];
  const bothReady = ready[0] && ready[1];

  return (
    <View style={styles.phaseStack}>
      <View
        style={[
          styles.phaseCard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>
          {bothSeated ? "Both players are here" : "Share this code to invite a friend"}
        </Text>
        <Pressable onPress={onCopy} style={styles.codeRow}>
          <Text style={[styles.bigCode, { color: colors.gold }]}>{code}</Text>
          <Feather
            name={copied ? "check" : "copy"}
            size={22}
            color={copied ? colors.gold : colors.mutedForeground}
          />
        </Pressable>
        <SeatRow
          name={gs.players[0]?.name ?? "Waiting…"}
          filled={!!gs.players[0]}
          isReady={ready[0]}
          colors={colors}
        />
        <SeatRow
          name={gs.players[1]?.name ?? "Waiting…"}
          filled={!!gs.players[1]}
          isReady={ready[1]}
          colors={colors}
        />
      </View>

      {bothSeated ? (
        <>
          <GoldButton
            label={iAmReady ? "Cancel ready" : "I'm ready"}
            icon={iAmReady ? "x" : "check"}
            variant={iAmReady ? "outline" : "solid"}
            loading={busy}
            onPress={() => onReady(!iAmReady)}
          />
          {mySeat === 0 && bothReady ? (
            <GoldButton label="Deal cards" icon="play" onPress={onStart} />
          ) : bothReady ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Waiting for the host to deal…
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          The game starts once your opponent joins with the code above.
        </Text>
      )}
    </View>
  );
}

function SeatRow({
  name,
  filled,
  isReady,
  colors,
}: {
  name: string;
  filled: boolean;
  isReady: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.seatRow}>
      <Feather
        name={filled ? "user" : "user-x"}
        size={16}
        color={filled ? colors.foreground : colors.mutedForeground}
      />
      <Text
        style={[styles.seatRowName, { color: filled ? colors.foreground : colors.mutedForeground }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      {filled ? (
        <Text style={[styles.readyTag, { color: isReady ? colors.gold : colors.mutedForeground }]}>
          {isReady ? "ready" : "not ready"}
        </Text>
      ) : null}
    </View>
  );
}

function BiddingView({
  gs,
  mySeat,
  busy,
  onBid,
  colors,
}: {
  gs: GameState;
  mySeat: Seat;
  busy: boolean;
  onBid: (n: number) => void;
  colors: Colors;
}) {
  const myTurn = gs.currentBidder === mySeat && gs.bids[mySeat] == null;
  const grouped = sortHandBySuit(gs.hand);
  const maxBid = gs.hand.length || 13;

  return (
    <View style={styles.phaseStack}>
      <Text style={[styles.phaseHeading, { color: colors.foreground }]}>
        {myTurn
          ? "Your bid — how many tricks will you take?"
          : gs.bids[mySeat] != null
            ? "Waiting for opponent to bid…"
            : "Opponent is bidding…"}
      </Text>

      {myTurn ? (
        <View style={styles.bidGrid}>
          {Array.from({ length: maxBid + 1 }, (_, n) => (
            <Pressable
              key={n}
              disabled={busy}
              onPress={() => onBid(n)}
              style={[
                styles.bidChip,
                {
                  backgroundColor: colors.card,
                  borderColor: n === 0 ? colors.gold : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.bidChipText, { color: n === 0 ? colors.gold : colors.foreground }]}>
                {n === 0 ? "Nil" : n}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <HandBlock grouped={grouped} colors={colors} title="YOUR HAND" />
    </View>
  );
}

function PlayingView({
  gs,
  mySeat,
  busy,
  onPlay,
  colors,
}: {
  gs: GameState;
  mySeat: Seat;
  busy: boolean;
  onPlay: (card: Card) => void;
  colors: Colors;
}) {
  const myTurn = gs.currentTurnIndex === mySeat;
  const oppSeat = otherSeat(mySeat);
  const grouped = sortHandBySuit(gs.hand);

  return (
    <View style={styles.phaseStack}>
      {/* Opponent's hidden hand */}
      <View style={styles.oppRow}>
        <Feather name="layers" size={15} color={colors.mutedForeground} />
        <Text style={[styles.oppText, { color: colors.mutedForeground }]}>
          {gs.players[oppSeat]?.name ?? "Opponent"} holds {gs.handSizes[oppSeat]} cards
        </Text>
        {gs.spadesBroken ? (
          <Text style={[styles.brokenTag, { color: colors.gold }]}>♠ broken</Text>
        ) : null}
      </View>

      {/* Trick table */}
      <View
        style={[
          styles.table,
          { backgroundColor: colors.felt, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        {gs.currentTrick.length === 0 ? (
          <Text style={[styles.tableEmpty, { color: colors.text }]}>
            {myTurn ? "Your lead" : "Opponent leads…"}
          </Text>
        ) : (
          <View style={styles.trickRow}>
            {gs.currentTrick.map((t, i) => (
              <View key={i} style={styles.trickCard}>
                <PlayingCard card={t.card} width={58} />
                <Text style={[styles.trickWho, { color: colors.text }]}>
                  {t.playerIndex === mySeat ? "you" : "opp"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.turnLabel, { color: myTurn ? colors.gold : colors.mutedForeground }]}>
        {myTurn ? "Your turn — tap a card to play" : "Waiting for opponent…"}
      </Text>

      {/* My hand */}
      <View style={styles.handWrap}>
        {grouped.flatMap((group) =>
          group.cards.map((card) => {
            const playable = myTurn && !busy && isPlayable(gs.hand, gs.currentTrick, card);
            return (
              <Pressable
                key={`${card.suit}-${card.rank}`}
                disabled={!playable}
                onPress={() => onPlay(card)}
                style={{ opacity: myTurn && !playable ? 0.4 : 1 }}
              >
                <PlayingCard card={card} width={50} style={{ marginRight: 6, marginBottom: 8 }} />
              </Pressable>
            );
          }),
        )}
      </View>
    </View>
  );
}

function HandBlock({
  grouped,
  colors,
  title,
}: {
  grouped: ReturnType<typeof sortHandBySuit>;
  colors: Colors;
  title: string;
}) {
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={styles.handWrap}>
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
  );
}

function RoundOverView({
  gs,
  onNext,
  colors,
}: {
  gs: GameState;
  onNext: () => void;
  colors: Colors;
}) {
  const last = gs.roundHistory[gs.roundHistory.length - 1];
  return (
    <View style={styles.phaseStack}>
      <CenterCard colors={colors} icon="flag" title={`Round ${last?.round ?? gs.roundNumber} complete`}>
        {last ? (
          <View style={{ gap: 6, marginTop: 8, alignSelf: "stretch" }}>
            <SummaryRow l="Bids" a={last.bids[0]} b={last.bids[1]} colors={colors} />
            <SummaryRow l="Tricks" a={last.tricks[0]} b={last.tricks[1]} colors={colors} />
            <SummaryRow l="Score" a={last.scores[0]} b={last.scores[1]} colors={colors} />
            <SummaryRow l="Bags" a={last.bags[0]} b={last.bags[1]} colors={colors} />
          </View>
        ) : null}
      </CenterCard>
      <GoldButton label="Next round" icon="arrow-right" onPress={onNext} />
    </View>
  );
}

function SummaryRow({
  l,
  a,
  b,
  colors,
}: {
  l: string;
  a: number;
  b: number;
  colors: Colors;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{l}</Text>
      <Text style={[styles.summaryVal, { color: colors.foreground }]}>
        {a} <Text style={{ color: colors.mutedForeground }}>vs</Text> {b}
      </Text>
    </View>
  );
}

function GameOverView({
  gs,
  mySeat,
  onNewMatch,
  onLeave,
  colors,
}: {
  gs: GameState;
  mySeat: Seat;
  onNewMatch: () => void;
  onLeave: () => void;
  colors: Colors;
}) {
  const explicitWinner = gs.winnerSeat ?? null;
  const oppSeat = otherSeat(mySeat);
  const tie = explicitWinner == null && gs.scores[0] === gs.scores[1];
  const iWon = explicitWinner != null
    ? explicitWinner === mySeat
    : gs.scores[mySeat] > gs.scores[oppSeat];
  return (
    <View style={styles.phaseStack}>
      <View
        style={[
          styles.phaseCard,
          { backgroundColor: colors.card, borderColor: colors.gold, borderRadius: colors.radius },
        ]}
      >
        <Feather name={iWon ? "award" : "flag"} size={30} color={colors.gold} />
        <Text style={[styles.gameOverTitle, { color: colors.foreground }]}>
          {tie ? "It's a tie" : iWon ? "You win!" : "You lose"}
        </Text>
        <Text style={[styles.gameOverScore, { color: colors.mutedForeground }]}>
          Final {gs.scores[mySeat]} — {gs.scores[oppSeat]}
        </Text>
        {gs.gameOverReason ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: "center" }]}>
            {gs.gameOverReason}
          </Text>
        ) : null}
      </View>
      <GoldButton label="New match" icon="refresh-cw" onPress={onNewMatch} />
      <GoldButton label="Leave table" icon="home" variant="outline" onPress={onLeave} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { fontFamily: "Inter_500Medium", fontSize: 15 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "center" },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  linkText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  tableLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  roomCode: { fontFamily: "Inter_700Bold", fontSize: 20 },

  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  scoreboard: { flexDirection: "row", borderWidth: 1, padding: 14 },
  scoreDivider: { width: 1, marginHorizontal: 12 },
  seatScore: { flex: 1, gap: 3 },
  seatName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  seatScoreNum: { fontFamily: "Inter_700Bold", fontSize: 28 },
  seatMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5 },

  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  bannerText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  phaseStack: { gap: 14 },
  phaseCard: { borderWidth: 1, padding: 20, alignItems: "center", gap: 8 },
  phaseTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  phaseHeading: { fontFamily: "Inter_700Bold", fontSize: 17 },
  centerBody: { fontFamily: "Inter_400Regular", fontSize: 14.5, textAlign: "center", lineHeight: 21 },

  codeLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, textAlign: "center" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  bigCode: { fontFamily: "Inter_700Bold", fontSize: 40, letterSpacing: 10 },

  seatRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch", paddingTop: 8 },
  seatRowName: { fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1 },
  readyTag: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 20, textAlign: "center" },

  bidGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bidChip: { width: 54, height: 54, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  bidChipText: { fontFamily: "Inter_700Bold", fontSize: 18 },

  previewLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2 },
  handWrap: { flexDirection: "row", flexWrap: "wrap" },

  oppRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  oppText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  brokenTag: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginLeft: "auto" },

  table: { minHeight: 120, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  tableEmpty: { fontFamily: "Inter_500Medium", fontSize: 14, opacity: 0.85 },
  trickRow: { flexDirection: "row", gap: 18 },
  trickCard: { alignItems: "center", gap: 6 },
  trickWho: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  turnLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center" },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  summaryVal: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  gameOverTitle: { fontFamily: "Inter_700Bold", fontSize: 24 },
  gameOverScore: { fontFamily: "Inter_500Medium", fontSize: 15 },
});

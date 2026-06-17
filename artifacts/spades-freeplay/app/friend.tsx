import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { useColors } from "@/hooks/useColors";
import { useSocket } from "@/hooks/useSocket";
import { loadName, saveSession } from "@/lib/session";

export default function Friend() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createRoom, joinRoom, status } = useSocket();

  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadName().then((n) => n && setName(n));
  }, []);

  const goToGame = async (
    roomCode: string,
    playerIndex: 0 | 1,
    token: string | undefined,
    playerName: string,
  ) => {
    await saveSession({ roomCode, playerIndex, token, playerName });
    router.replace({
      pathname: "/game",
      params: { code: roomCode, seat: String(playerIndex), name: playerName },
    });
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("create");
    setErr(null);
    try {
      const { roomCode, playerIndex, token } = await createRoom(trimmed);
      await goToGame(roomCode, playerIndex, token, trimmed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the table.");
      setBusy(null);
    }
  };

  const onJoin = async () => {
    const trimmed = name.trim();
    const codeUp = joinCode.trim().toUpperCase();
    if (!trimmed || codeUp.length < 5) return;
    setBusy("join");
    setErr(null);
    try {
      const { playerIndex, token } = await joinRoom(codeUp, trimmed);
      await goToGame(codeUp, playerIndex, token, trimmed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not join that table.");
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>Play a friend</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Start a private table and share the code, or join a friend's table with
        theirs.
      </Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.foreground }]}>Display name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
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

      {err ? <Text style={[styles.err, { color: colors.destructive }]}>{err}</Text> : null}

      {/* Create a table */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.cardHead}>
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Create a table</Text>
        </View>
        <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
          Generates a private code you share with one friend.
        </Text>
        <GoldButton
          label="Create Table"
          icon="plus"
          loading={busy === "create"}
          disabled={name.trim().length === 0 || status === "offline" || busy !== null}
          onPress={onCreate}
        />
      </View>

      {/* Join a table */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.cardHead}>
          <Feather name="log-in" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Join a table</Text>
        </View>
        <TextInput
          value={joinCode}
          onChangeText={(t) => setJoinCode(t.toUpperCase())}
          placeholder="Enter 5-letter code"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={5}
          style={[
            styles.codeInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius,
            },
          ]}
        />
        <GoldButton
          label="Join Table"
          icon="arrow-right"
          variant="outline"
          loading={busy === "join"}
          onPress={onJoin}
          disabled={joinCode.trim().length < 5 || name.trim().length === 0 || busy !== null}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 20, gap: 18 },
  heading: { fontFamily: "Inter_700Bold", fontSize: 24 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21 },
  field: { gap: 8 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  err: { fontFamily: "Inter_500Medium", fontSize: 13 },
  card: { borderWidth: 1, padding: 18, gap: 14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  cardBody: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 19 },
  codeInput: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 6,
    textAlign: "center",
  },
});

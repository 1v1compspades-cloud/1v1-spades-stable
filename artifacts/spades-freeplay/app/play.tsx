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

export default function Play() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createRoom, status } = useSocket();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadName().then((n) => n && setName(n));
  }, []);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      const { roomCode, playerIndex, token } = await createRoom(trimmed);
      await saveSession({ roomCode, playerIndex, token, playerName: trimmed });
      router.replace({
        pathname: "/game",
        params: { code: roomCode, seat: String(playerIndex), name: trimmed },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the table.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>Quick 1v1</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Spin up a private table and share the code with anyone for a
        head-to-head game. Just you, an opponent, and a deck.
      </Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.foreground }]}>Display name</Text>
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

      {err ? <Text style={[styles.err, { color: colors.destructive }]}>{err}</Text> : null}

      <GoldButton
        label="Create Quick Table"
        icon="zap"
        loading={busy}
        onPress={onCreate}
        disabled={name.trim().length === 0 || status === "offline"}
      />

      <View
        style={[
          styles.infoCard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <Feather name="info" size={18} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Once your table is created, send the code to a friend. The match begins
          the moment they join and you both ready up.
        </Text>
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
  infoCard: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "flex-start",
    marginTop: 4,
  },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 20, flex: 1 },
});

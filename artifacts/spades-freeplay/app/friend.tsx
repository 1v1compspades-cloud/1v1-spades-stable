import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoldButton } from "@/components/GoldButton";
import { useColors } from "@/hooks/useColors";

function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function Friend() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const onCreate = () => {
    setCreatedCode(makeRoomCode());
    setCopied(false);
  };

  const onCopy = async () => {
    if (!createdCode) return;
    await Clipboard.setStringAsync(createdCode);
    setCopied(true);
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
        Play a friend
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Start a private table and share the code, or join a friend's table with
        theirs.
      </Text>

      {/* Create a table */}
      <View
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
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Create a table
          </Text>
        </View>

        {createdCode ? (
          <>
            <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>
              Share this code
            </Text>
            <Pressable onPress={onCopy} style={styles.codeRow}>
              <Text style={[styles.code, { color: colors.gold }]}>
                {createdCode}
              </Text>
              <Feather
                name={copied ? "check" : "copy"}
                size={20}
                color={copied ? colors.gold : colors.mutedForeground}
              />
            </Pressable>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Live private tables connect in the next update. Your code is ready
              to share now.
            </Text>
          </>
        ) : (
          <GoldButton label="Create Table" icon="plus" onPress={onCreate} />
        )}
      </View>

      {/* Join a table */}
      <View
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
          <Feather name="log-in" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Join a table
          </Text>
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
            styles.input,
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
          onPress={() => {}}
          disabled={joinCode.trim().length < 5}
        />
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
  card: {
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  codeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  code: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    letterSpacing: 8,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 6,
    textAlign: "center",
  },
});

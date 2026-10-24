import React from "react";
import { Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { theme, evidenceLabels, type EvidenceKind } from "./theme";

const icons: Record<
  EvidenceKind,
  React.ComponentProps<typeof Feather>["name"]
> = {
  calculated: "compass",
  derived: "git-branch",
  canonical: "book-open",
  ai: "message-circle",
  user: "user",
  exploratory: "feather",
  uncertain: "alert-triangle",
};
export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 7,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <Feather name={icons[kind]} size={13} color={theme[kind]} />
      <Text
        style={{
          color: theme[kind],
          fontSize: 12,
          lineHeight: 18,
          flexShrink: 1,
        }}
      >
        {evidenceLabels[kind]}
      </Text>
    </View>
  );
}

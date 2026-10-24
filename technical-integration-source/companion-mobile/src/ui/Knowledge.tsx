import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { documents, type SearchDoc } from "../content/records";
import { query } from "../content/retrieval";
import { EvidenceBadge } from "./EvidenceBadge";
import { theme } from "./theme";
import { CONCEPTS, conceptGloss, migrateReaderPreferences } from "../intelligence/reader-preferences";
import { DEFAULT_PROFILE } from "../domain/contracts";

const categories = ["All", "Basics", "Gates", "Lines", "Channels"] as const;
const types = {
  All: undefined,
  Basics: undefined,
  Gates: "gate",
  Lines: "line",
  Channels: "channel",
} as const;
export function Knowledge({ onRecord }: { onRecord: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [visible, setVisible] = useState(24);
  const [concept,setConcept]=useState<keyof typeof CONCEPTS|null>(null);
  const selectedType = types[category];
  const found = useMemo(() => {
    if (!search.trim()) {
      const results = documents.filter(
        (d) => !selectedType || d.type === selectedType,
      );
      return { results, total_matches: results.length };
    }
    return query(search, selectedType ? { type: selectedType } : {}, 1000);
  }, [search, selectedType]);
  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>AURIC MECHANICS</Text>
      <Text style={s.h1}>Knowledge</Text>
      <Text style={s.body}>64 Gates. 384 exact Lines. 36 Channels.</Text>
      <Text style={s.muted}>
        Your offline reference, with or without a birth chart.
      </Text>
      <EvidenceBadge kind="canonical" />
      <View style={s.search}>
        <Feather name="search" color={theme.muted} size={18} />
        <TextInput
          accessibilityLabel="Search knowledge"
          placeholder="Gate 14, 14.2, 2-14, or a theme"
          placeholderTextColor={theme.muted}
          style={s.input}
          value={search}
          autoCapitalize="none"
          onChangeText={(value) => {
            setSearch(value);
            setVisible(24);
          }}
        />
        {!!search && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear knowledge search"
            style={s.clear}
            onPress={() => {
              setSearch("");
              setVisible(24);
            }}
          >
            <Feather name="x" size={20} color={theme.text} />
          </Pressable>
        )}
      </View>
      <View style={s.categories}>
        {categories.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ checked: category === name }}
            onPress={() => {
              setCategory(name);
              setVisible(24);
            }}
            style={[s.category, category === name && s.selected]}
          >
            <Text
              style={[
                s.body,
                {
                  marginBottom: 0,
                  color: category === name ? theme.accent : theme.muted,
                },
              ]}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      {(category==="All"||category==="Basics")&&<View style={{gap:10}}><Text style={s.title}>Basic concepts</Text><View style={s.categories}>{Object.entries(CONCEPTS).filter(([key,label])=>!search.trim()||`${key} ${label}`.toLowerCase().includes(search.toLowerCase())).map(([key,label])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={`Learn ${label}`} accessibilityState={{expanded:concept===key}} style={s.category} onPress={()=>setConcept(current=>current===key?null:key as keyof typeof CONCEPTS)}><Text style={s.body}>{label}</Text></Pressable>)}</View>{concept&&<Text style={s.body}>{conceptGloss(migrateReaderPreferences(DEFAULT_PROFILE),concept)}</Text>}<Text style={s.small}>Technical glossary, not a complete interpretive curriculum.</Text></View>}
      {category!=="Basics"&&<>
      <Text style={s.muted}>
        {found.total_matches} records{search.trim() ? " matched" : " available"}
      </Text>
      {found.results.slice(0, visible).map((record) => (
        <Pressable
          key={record.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${record.title}`}
          onPress={() => onRecord(record.id)}
          style={s.row}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{record.title}</Text>
            <Text style={s.small}>
              {record.type === "line"
                ? "Exact Line mechanics"
                : record.type === "gate"
                  ? "Gate Mechanics"
                  : "Channel Mechanics"}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={theme.muted} />
        </Pressable>
      ))}
      {!found.results.length && (
        <Text style={s.body}>
          No matching records. Try another term or category. Exact identities
          and category filters are not relaxed.
        </Text>
      )}
      {visible < found.results.length && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show more knowledge"
          onPress={() => setVisible(visible + 24)}
          style={s.more}
        >
          <Text style={s.title}>Show more</Text>
        </Pressable>
      )}
      {found.total_matches > found.results.length && (
        <Text style={s.small}>
          Showing the top {found.results.length} search results. Narrow your
          search, or clear it to browse every record.
        </Text>
      )}
      </>}
      <Text style={s.small}>
        This reconciled candidate contains Gate, Line, and Channel material, not
        a complete Type, Authority, or Center curriculum. App interpretations
        are labeled separately. Original frozen source files have not been
        independently authenticated.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  section: { gap: 12 },
  eyebrow: { color: theme.accent, fontSize: 12, fontWeight: "600" },
  h1: { fontSize: 28, lineHeight: 36, fontWeight: "600", color: theme.text },
  body: { fontSize: 15, lineHeight: 24, color: theme.text },
  muted: { fontSize: 14, lineHeight: 22, color: theme.muted },
  small: { fontSize: 12, lineHeight: 20, color: theme.muted },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingLeft: 12,
    backgroundColor: theme.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    color: theme.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  clear: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 5,
  },
  selected: { backgroundColor: theme.surfaceRaised, borderColor: theme.accent },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  title: { color: theme.text, fontSize: 15, lineHeight: 23, fontWeight: "500" },
  more: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceRaised,
    borderRadius: 5,
  },
});

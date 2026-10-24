import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { searchTimeZones } from "../domain/timezones";
import { theme } from "./theme";

export function TimezonePicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(40);
  const options = searchTimeZones(search);
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide">
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.heading}>Select time zone</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close time zone selector"
            onPress={onClose}
            style={s.icon}
          >
            <Feather name="x" color={theme.text} size={22} />
          </Pressable>
        </View>
        <View style={s.search}>
          <Feather name="search" size={18} color={theme.muted} />
          <TextInput
            accessibilityLabel="Search time zones"
            placeholder="City, region, country, name or UTC offset"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setLimit(40);
            }}
            style={s.input}
            autoCapitalize="none"
          />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.list}
        >
          <Text style={s.small}>
            UTC-offset searches use standard offsets for discovery, not fixed
            offsets for chart calculations.
          </Text>
          {options.slice(0, limit).map((zone) => (
            <Pressable
              key={zone.id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${zone.id}`}
              onPress={() => {
                onSelect(zone.id);
                onClose();
              }}
              style={s.row}
            >
              <Text style={s.title}>{zone.label}</Text>
              <Text style={s.small}>
                {zone.country}
                {zone.country ? " / " : ""}
                {zone.id}
              </Text>
            </Pressable>
          ))}
          {!options.length && (
            <Text style={s.title}>
              No matching time zones. Try a nearby major city, region, or
              country.
            </Text>
          )}
          {limit < options.length && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show more time zones"
              style={s.row}
              onPress={() => setLimit(limit + 40)}
            >
              <Text style={s.title}>Show more</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  heading: { fontSize: 20, color: theme.text, fontWeight: "500", flex: 1 },
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 18,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 5,
    backgroundColor: theme.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    color: theme.text,
    fontSize: 15,
  },
  list: { padding: 18, width: "100%", maxWidth: 800, alignSelf: "center" },
  row: {
    minHeight: 54,
    paddingVertical: 16,
    gap: 5,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  title: { color: theme.text, fontSize: 15, lineHeight: 23 },
  small: { color: theme.muted, fontSize: 12, lineHeight: 20 },
});

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { BirthRecordV1 } from "../domain/contracts";
import {
  birthTimeZoneInfo,
  findBirthPlaces,
  timeZoneLabel,
  type BirthPlace,
} from "../domain/timezones";
import { TimezonePicker } from "./TimezonePicker";
import { theme } from "./theme";

export function BirthLocationInput({
  birth,
  onChange,
}: {
  birth: BirthRecordV1;
  onChange: (birth: BirthRecordV1) => void;
}) {
  const [results, setResults] = useState<BirthPlace[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [searched, setSearched] = useState(false),
    [picker, setPicker] = useState(false);
  const [source, setSource] = useState(
    birth.timezone ? "Saved time zone (unchanged)" : "",
  );
  const request = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
      request.current?.abort();
    },
    [],
  );
  async function search() {
    const current = ++revision.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setBusy(true);
    setError("");
    setResults([]);
    setSearched(false);
    try {
      const places = await findBirthPlaces(birth.place, controller.signal);
      if (revision.current === current) {
        setResults(places);
        setSearched(true);
      }
    } catch (failure) {
      if (revision.current === current)
        setError(
          controller.signal.aborted
            ? "Location search timed out. Try again or choose a time zone manually."
            : (failure as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (revision.current === current) setBusy(false);
    }
  }
  const info = birthTimeZoneInfo(birth);
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>Birth location</Text>
      <View style={s.search}>
        <TextInput
          accessibilityLabel="Birth location"
          placeholder="City, state or country"
          placeholderTextColor={theme.muted}
          value={birth.place}
          autoCapitalize="words"
          style={s.input}
          onChangeText={(value) => {
            revision.current++;
            request.current?.abort();
            setBusy(false);
            setResults([]);
            setError("");
            setSearched(false);
            setSource("");
            onChange({
              ...birth,
              place: value,
              timezone: "",
              latitude: 0,
              longitude: 0,
              utcDisambiguation: undefined,
              resolution: { status: "unresolved", originalPlace: value, resolvedPlace: "", coordinateSource: "manual", sourceVersion: null, resolvedAt: new Date().toISOString(), timezoneOverride: false },
              conversion: undefined,
            });
          }}
          onSubmitEditing={search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find birth locations"
          disabled={busy || birth.place.trim().length < 2}
          onPress={search}
          style={s.action}
        >
          {busy ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Feather name="search" size={20} color={theme.accent} />
          )}
        </Pressable>
      </View>
      <Text style={s.small}>
        Search sends only location text to Open-Meteo / GeoNames. Your birth
        date and time stay on this device.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {searched && !results.length && (
        <Text style={s.small}>
          No locations found. Refine the city/region or choose a time zone
          manually.
        </Text>
      )}
      {results.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`Use birth location ${place.label}`}
          style={s.result}
          onPress={() => {
            onChange({
              ...birth,
              place: place.label,
              latitude: place.latitude,
              longitude: place.longitude,
              timezone: place.timezone,
              utcDisambiguation: undefined,
              resolution: { status: "resolved", originalPlace: birth.place, resolvedPlace: place.label, coordinateSource: "open-meteo-geonames", sourceVersion: null, resolvedAt: new Date().toISOString(), timezoneOverride: false },
              conversion: undefined,
            });
            setSource(
              place.timezone
                ? "Detected from birth location"
                : "Location selected; time zone unavailable",
            );
            setResults([]);
            setSearched(false);
          }}
        >
          <Text style={s.body}>{place.label}</Text>
          <Text style={s.small}>
            {place.timezone
              ? timeZoneLabel(place.timezone)
              : "Choose a time zone after selection"}
          </Text>
        </Pressable>
      ))}
      <View style={s.zone}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.label}>Time zone</Text>
          <Text style={s.body}>
            {birth.timezone
              ? timeZoneLabel(birth.timezone)
              : "Select a birth location or choose a time zone"}
          </Text>
          {!!birth.timezone && <Text style={s.small}>{birth.timezone}</Text>}
          {!!source && <Text style={s.small}>{source}</Text>}
          {birth.confidence === "range" && <Text style={s.small}>Historical offsets are evaluated for every sampled time in the window.</Text>}
          {!!info?.offset && (
            <Text style={s.small}>At this birth time: {info.offset}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change birth time zone"
          onPress={() => setPicker(true)}
          style={s.action}
        >
          <Feather name="edit-2" size={18} color={theme.accent} />
        </Pressable>
      </View>
      {!!info?.error && (
        <Text accessibilityRole="alert" style={s.error}>
          {info.error}
        </Text>
      )}
      {info?.error.includes("occurs twice") && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["earlier", "later"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Use ${value} time occurrence`}
              style={s.result}
              onPress={() => onChange({ ...birth, utcDisambiguation: value })}
            >
              <Text style={s.body}>
                {value === "earlier"
                  ? "Earlier occurrence"
                  : "Later occurrence"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {birth.timezone && birth.date && Number(birth.date.slice(0, 4)) < 1970 ? (
        <Text style={s.small}>
          Historical location boundaries and pre-1970 records can be incomplete.
          Confirm the selected zone against your birth record if uncertain.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Location data attribution"
        onPress={() =>
          Linking.openURL("https://open-meteo.com/en/docs/geocoding-api")
        }
      >
        <Text style={s.small}>Location data: Open-Meteo / GeoNames</Text>
      </Pressable>
      <TimezonePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onSelect={(id) => {
          revision.current++;
          request.current?.abort();
          setBusy(false);
          setResults([]);
          setSource("Manual override");
          onChange({ ...birth, timezone: id, utcDisambiguation: undefined,
            resolution: birth.resolution ? { ...birth.resolution, timezoneOverride: true } : undefined,
            conversion: undefined });
        }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  label: { color: theme.text, fontSize: 13, lineHeight: 20, fontWeight: "500" },
  search: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 5,
  },
  input: {
    minWidth: 0,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.text,
  },
  action: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { fontSize: 15, lineHeight: 23, color: theme.text },
  small: { fontSize: 12, lineHeight: 20, color: theme.muted },
  error: { fontSize: 13, lineHeight: 21, color: theme.dangerText },
  result: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingVertical: 12,
    gap: 4,
  },
  zone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderLeftWidth: 2,
    borderColor: theme.accentMuted,
    paddingLeft: 12,
    paddingVertical: 8,
  },
});

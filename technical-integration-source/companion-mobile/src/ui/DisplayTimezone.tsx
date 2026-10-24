import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { deviceTimeZone, timeZoneLabel } from "../domain/timezones";
import { TimezonePicker } from "./TimezonePicker";
import { theme } from "./theme";

export function DisplayTimezone({
  zone,
  override,
  onSelect,
  onDevice,
}: {
  zone: string;
  override: boolean;
  onSelect: (id: string) => void;
  onDevice: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.text, fontSize: 15 }}>
        {timeZoneLabel(zone)}
      </Text>
      <Text style={{ color: theme.muted, lineHeight: 21 }}>
        {zone} /{" "}
        {override ? "Manual display override" : "Detected from this device"}
      </Text>
      <Text style={{ color: theme.muted, lineHeight: 21 }}>
        Used for question-history dates only. Birth charts keep their own saved
        time zone.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change display time zone"
        onPress={() => setOpen(true)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: theme.accent }}>Change</Text>
      </Pressable>
      {override && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use device time zone"
          onPress={onDevice}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: theme.accent }}>
            Use device time zone ({timeZoneLabel(deviceTimeZone())})
          </Text>
        </Pressable>
      )}
      <TimezonePicker
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
      />
    </View>
  );
}

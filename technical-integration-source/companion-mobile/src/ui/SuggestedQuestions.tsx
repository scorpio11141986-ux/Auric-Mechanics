import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { HumanDesignFactsV1 } from "../domain/contracts";
import { suggestedQuestions } from "../intelligence/suggestions";
import { theme } from "./theme";

export function SuggestedQuestions({
  chart,
  question,
  disabled,
  onSelect,
}: {
  chart: HumanDesignFactsV1;
  question: string;
  disabled: boolean;
  onSelect: (question: string) => void;
}) {
  const [topicId, setTopicId] = useState("your-chart");
  const topics = suggestedQuestions(chart);
  const topic = topics.find((item) => item.id === topicId) || topics[0];
  return (
    <View testID="suggested-questions" style={s.section}>
      <Text style={s.heading}>Suggested questions</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Question topics" style={s.topics}>
        {topics.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityLabel={item.title}
            aria-checked={item.id === topic.id}
            accessibilityState={{ checked: item.id === topic.id, disabled }}
            disabled={disabled}
            onPress={() => setTopicId(item.id)}
            style={[s.topic, item.id === topic.id && s.activeTopic]}
          >
            <Text style={{ color: item.id === topic.id ? theme.accent : theme.muted }}>
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={disabled && { opacity: 0.45 }}>
        {topic.questions.map((text) => (
          <Pressable
            key={text}
            testID="suggested-question"
            accessibilityRole="button"
            accessibilityLabel={text}
            aria-selected={text === question}
            accessibilityState={{ selected: text === question, disabled }}
            disabled={disabled}
            onPress={() => onSelect(text)}
            style={s.question}
          >
            <Text style={[s.questionText, text === question && { color: theme.accent }]}>
              {text}
            </Text>
            <Feather name={text === question ? "check" : "arrow-up-left"} size={16} color={theme.accent} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 24, marginBottom: 12 },
  heading: { color: theme.text, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  topic: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTopic: { borderBottomColor: theme.accent },
  question: { minHeight: 48, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  questionText: { flex: 1, flexShrink: 1, color: theme.text, fontSize: 15, lineHeight: 22 },
});

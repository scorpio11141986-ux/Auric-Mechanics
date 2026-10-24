import type { HumanDesignFactsV1 } from "../domain/contracts";

export type QuestionTopic = {
  id: string;
  title: string;
  questions: string[];
};

const topics: QuestionTopic[] = [
  {
    id: "decisions",
    title: "Decisions",
    questions: [
      "How are Strategy and Authority different in my chart?",
      "What could I observe about my decision-making process without treating my chart as an instruction?",
      "What questions could I journal about when a decision feels rushed?",
    ],
  },
  {
    id: "energy",
    title: "Energy",
    questions: [
      "What do my defined and undefined centers mean in Human Design?",
      "Which of my activated gates relate to work, rest, or sustained effort?",
      "What could I observe about the difference between consistent energy and conditioning?",
    ],
  },
  {
    id: "communication",
    title: "Communication",
    questions: [
      "Which of my activated gates relate to expression and listening?",
      "How does my Throat center connect to the rest of my chart?",
      "What communication patterns could I explore without assuming the chart defines my personality?",
    ],
  },
  {
    id: "relationships",
    title: "Relationships",
    questions: [
      "What could I observe about my own communication and boundaries in relationships?",
      "What can my individual chart say about relationships, and what would require a second chart?",
      "What is the difference between a hanging gate and a complete channel in relationship mechanics?",
    ],
  },
  {
    id: "stress",
    title: "Stress",
    questions: [
      "Which of my activated gates describe pressure or urgency as symbolic themes?",
      "What could I journal about when I feel pressure to prove myself?",
      "How can I explore conditioning without using my chart to diagnose stress or health?",
    ],
  },
  {
    id: "mechanics",
    title: "Mechanics",
    questions: [
      "What do Design, Personality, and dual activations mean on the BodyGraph?",
      "How do gates, lines, and channels differ?",
      "Which parts of this reading are calculated facts, reference interpretations, or AI synthesis?",
    ],
  },
];

export function suggestedQuestions(chart: HumanDesignFactsV1): QuestionTopic[] {
  const sun = chart.activations.find(
    (a) => a.side === "personality" && a.planet === "Sun",
  );
  const channel = chart.channels[0];
  const personal = [
    `How do my ${chart.type} Type and ${chart.strategy} Strategy relate in Human Design?`,
    `What does ${chart.authority} Authority mean in my chart?`,
    `How could I explore my ${chart.profile} Profile as a symbolic theme?`,
  ];
  if (sun)
    personal.push(
      `What does Gate ${sun.gate}, Line ${sun.line}, my Personality Sun activation, describe?`,
    );
  if (channel)
    personal.push(
      `What mechanics does my defined Channel ${channel.gates.join("-")} describe?`,
    );
  return [
    { id: "your-chart", title: "Your chart", questions: personal },
    ...topics.map((topic) => ({ ...topic, questions: [...topic.questions] })),
  ];
}

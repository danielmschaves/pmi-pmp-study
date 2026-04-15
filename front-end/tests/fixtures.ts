import type { Question, SessionConfig, SessionState } from "../src/types";

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    question: "What is 2 + 2?",
    options: ["A. 3", "B. 4", "C. 5", "D. 6"],
    answer: "B",
    explanation: "Two plus two equals four.",
    difficulty: "easy",
    topic: "Arithmetic",
    domain: 1,
    source_id: "t_001",
    chunk_index: 0,
    video_segment: "0:00→0:10",
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    examId: "practice",
    kind: "dynamic",
    profile: "practice",
    count: 2,
    domain: null,
    difficulty: null,
    showExplanation: true,
    seed: 42,
    examMode: false,
    timeLimitSec: null,
    ...overrides,
  };
}

export function makeSession(
  questions: Question[],
  cfg: Partial<SessionConfig> = {},
): SessionState {
  return {
    config: makeConfig(cfg),
    questions,
    index: 0,
    answers: [],
    startedAt: Date.now(),
  };
}

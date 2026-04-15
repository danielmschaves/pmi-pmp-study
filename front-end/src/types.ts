export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type Domain = 1 | 2 | 3;
export type Letter = "A" | "B" | "C" | "D";

export type Question = {
  id: string;
  question: string;
  options: string[];
  answer: Letter;
  explanation: string;
  difficulty: Difficulty;
  topic: string;
  domain: Domain;
  source_id: string;
  chunk_index: number;
  video_segment: string;
};

export type ExamKind = "dynamic" | "static";
export type ProfileId = "practice" | "standard" | "hard";

export type Manifest = {
  generatedAt: string;
  bank: { path: string; count: number } | null;
  exams: { id: string; path: string; count: number }[];
};

export type SessionConfig = {
  examId: string;
  kind: ExamKind;
  profile?: ProfileId;
  count: number;
  domain: Domain | null;
  difficulty: Difficulty | null;
  showExplanation: boolean;
  seed: number | null;
  examMode: boolean;            // hide feedback/explanations until results
  timeLimitSec: number | null;  // null = no countdown, just elapsed clock
  label?: string;               // display label, e.g. "Mini Exam"
};

export type AnswerRecord = {
  q: Question;
  picked: Letter | "S";
  correct: boolean;
  ms: number;
};

export type SessionState = {
  config: SessionConfig;
  questions: Question[];
  index: number;
  answers: AnswerRecord[];
  startedAt: number;
  finishedAt?: number;
};

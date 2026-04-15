import type { AnswerRecord, Domain, QuizAttempt } from "../types";

export const DOMAIN_NAMES: Record<Domain, string> = {
  1: "People",
  2: "Process",
  3: "Business Environment",
};

export const ECO_TARGETS: Record<Domain, number> = { 1: 0.42, 2: 0.5, 3: 0.08 };

export type Tally = { correct: number; total: number };

export type DomainBreakdown = Record<Domain, Tally & { pct: number; targetPct: number }>;

export type ConceptBreakdown = {
  all: Map<string, Tally>;
  strong: Array<{ concept: string; tally: Tally; pct: number }>;
  weak: Array<{ concept: string; tally: Tally; pct: number }>;
};

export function overallAccuracy(answers: AnswerRecord[]): { correct: number; answered: number; pct: number } {
  const answered = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  return { correct, answered, pct: answered ? (correct / answered) * 100 : 0 };
}

export function byDomain(answers: AnswerRecord[]): DomainBreakdown {
  const out: DomainBreakdown = {
    1: { correct: 0, total: 0, pct: 0, targetPct: ECO_TARGETS[1] * 100 },
    2: { correct: 0, total: 0, pct: 0, targetPct: ECO_TARGETS[2] * 100 },
    3: { correct: 0, total: 0, pct: 0, targetPct: ECO_TARGETS[3] * 100 },
  };
  for (const a of answers) {
    const d = a.q.domain;
    out[d].total += 1;
    if (a.correct) out[d].correct += 1;
  }
  for (const d of [1, 2, 3] as Domain[]) {
    out[d].pct = out[d].total ? (out[d].correct / out[d].total) * 100 : 0;
  }
  return out;
}

/**
 * Parse topic strings on commas and aggregate correct/total per concept.
 * Concepts with fewer than `minN` answers are excluded from strong/weak lists
 * but retained in `all` so callers can show raw counts if desired.
 */
export function byConcept(answers: AnswerRecord[], minN = 2): ConceptBreakdown {
  const all = new Map<string, Tally>();
  for (const a of answers) {
    const topics = splitTopic(a.q.topic);
    for (const t of topics) {
      const cur = all.get(t) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (a.correct) cur.correct += 1;
      all.set(t, cur);
    }
  }
  const strong: ConceptBreakdown["strong"] = [];
  const weak: ConceptBreakdown["weak"] = [];
  for (const [concept, tally] of all) {
    if (tally.total < minN) continue;
    const pct = (tally.correct / tally.total) * 100;
    if (pct >= 80) strong.push({ concept, tally, pct });
    else if (pct <= 50) weak.push({ concept, tally, pct });
  }
  strong.sort((a, b) => b.pct - a.pct || b.tally.total - a.tally.total);
  weak.sort((a, b) => a.pct - b.pct || b.tally.total - a.tally.total);
  return { all, strong, weak };
}

export function splitTopic(topic: string | undefined): string[] {
  if (!topic) return [];
  return topic
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function aggregateAnswers(quizzes: QuizAttempt[]): AnswerRecord[] {
  const out: AnswerRecord[] = [];
  for (const q of quizzes) out.push(...q.answers);
  return out;
}

export function statusFromPct(pct: number): { label: string; cls: string } {
  if (pct >= 70) return { label: "Pass", cls: "badge-accent" };
  if (pct >= 61) return { label: "Borderline", cls: "badge-warning" };
  return { label: "Needs work", cls: "badge-danger" };
}

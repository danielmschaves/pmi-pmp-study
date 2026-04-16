import type { Question } from "../types";

// Format/section parsed from the topic prefix (PMI practice exam convention).
// Topic looks like "Agile / Stakeholder Engagement" — we split on the first " / ".
export type Section = "agile" | "predictive" | "hybrid" | null;

export type SourceFamily = "studyhall" | "youtube";

const SECTION_MAP: Record<string, Exclude<Section, null>> = {
  agile: "agile",
  predictive: "predictive",
  hybrid: "hybrid",
};

export function getSection(q: Pick<Question, "topic">): Section {
  const t = q.topic ?? "";
  const idx = t.indexOf(" / ");
  if (idx <= 0) return null;
  const head = t.slice(0, idx).trim().toLowerCase();
  return SECTION_MAP[head] ?? null;
}

export function getSourceFamily(q: Pick<Question, "source_id">): SourceFamily {
  return q.source_id?.startsWith("sh_") ? "studyhall" : "youtube";
}

export const SECTION_LABELS: Record<Exclude<Section, null>, string> = {
  agile: "Agile",
  predictive: "Predictive",
  hybrid: "Hybrid",
};

export const SOURCE_LABELS: Record<SourceFamily, string> = {
  studyhall: "PMI Practice Exam",
  youtube: "YouTube",
};

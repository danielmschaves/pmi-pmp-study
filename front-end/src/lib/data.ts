import { supabase } from "../supabase";
import type { Manifest, Question } from "../types";

let manifestCache: Manifest | null = null;
let bankCache: Question[] | null = null;
const examCache = new Map<string, Question[]>();

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;

  const [{ count: bankCount }, { data: examRows, error }] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("exams").select("id, question_ids"),
  ]);

  if (error) throw new Error(`manifest: ${error.message}`);

  manifestCache = {
    generatedAt: new Date().toISOString(),
    bank: bankCount != null ? { path: "/supabase/questions", count: bankCount } : null,
    exams: (examRows ?? []).map((e) => ({
      id: e.id,
      path: `/supabase/exams/${e.id}`,
      count: (e.question_ids as string[]).length,
    })),
  };
  return manifestCache;
}

export async function loadBank(): Promise<Question[]> {
  if (bankCache) return bankCache;

  const PAGE = 1000;
  const all: Question[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`bank: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Question[]));
    if (data.length < PAGE) break;
  }
  bankCache = all;
  return bankCache;
}

export async function loadExam(id: string): Promise<Question[]> {
  const hit = examCache.get(id);
  if (hit) return hit;

  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("question_ids")
    .eq("id", id)
    .single();

  if (examErr) throw new Error(`exam ${id}: ${examErr.message}`);

  const ids = exam.question_ids as string[];

  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("*")
    .in("id", ids);

  if (qErr) throw new Error(`exam ${id} questions: ${qErr.message}`);

  // Restore the exam's original ordering
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Question[];

  examCache.set(id, ordered);
  return ordered;
}

import type { Manifest, Question } from "../types";

let manifestCache: Manifest | null = null;
let bankCache: Question[] | null = null;
const examCache = new Map<string, Question[]>();

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const r = await fetch("/data/index.json");
  if (!r.ok) throw new Error(`manifest: ${r.status}`);
  manifestCache = await r.json();
  return manifestCache!;
}

export async function loadBank(): Promise<Question[]> {
  if (bankCache) return bankCache;
  const r = await fetch("/data/question_bank.json");
  if (!r.ok) throw new Error(`bank: ${r.status}`);
  bankCache = await r.json();
  return bankCache!;
}

export async function loadExam(id: string): Promise<Question[]> {
  const hit = examCache.get(id);
  if (hit) return hit;
  const r = await fetch(`/data/${id}.json`);
  if (!r.ok) throw new Error(`exam ${id}: ${r.status}`);
  const data = (await r.json()) as Question[];
  examCache.set(id, data);
  return data;
}

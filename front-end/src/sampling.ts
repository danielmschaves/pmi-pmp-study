import type { Difficulty, Domain, ProfileId, Question } from "./types";
import { shuffle, type Rng } from "./lib/prng";

export const PROFILES: Record<ProfileId, Record<Difficulty, number>> = {
  practice: { easy: 0.45, medium: 0.4, hard: 0.12, expert: 0.03 },
  standard: { easy: 0.25, medium: 0.4, hard: 0.25, expert: 0.1 },
  hard: { easy: 0.05, medium: 0.2, hard: 0.45, expert: 0.3 },
};

export const ECO_WEIGHTS: Record<Domain, number> = { 1: 0.42, 2: 0.5, 3: 0.08 };
export const FULL_EXAM_SIZE = 180;

export function sortUnseenFirst(
  questions: Question[],
  seen: Record<string, string>,
  rng: Rng,
): Question[] {
  const unseen: Question[] = [];
  const seenList: Question[] = [];
  for (const q of questions) {
    if (seen[q.id]) seenList.push(q);
    else unseen.push(q);
  }
  seenList.sort((a, b) => (seen[a.id] < seen[b.id] ? -1 : 1));
  return shuffle(unseen, rng).concat(seenList);
}

export function sampleQuestions(
  bank: Question[],
  opts: {
    profile: ProfileId;
    count: number;
    seen: Record<string, string>;
    rng: Rng;
    domainFilter: Domain | null;
    difficultyFilter: Difficulty | null;
  },
): Question[] {
  let pool = bank;
  if (opts.domainFilter != null) pool = pool.filter((q) => q.domain === opts.domainFilter);
  if (opts.difficultyFilter != null)
    pool = pool.filter((q) => q.difficulty === opts.difficultyFilter);

  const ordered = sortUnseenFirst(pool, opts.seen, opts.rng);

  if (opts.count < 50 || opts.domainFilter != null || opts.difficultyFilter != null) {
    return ordered.slice(0, opts.count);
  }

  const profile = PROFILES[opts.profile];
  const selected: Question[] = [];
  const used = new Set<string>();

  const pick = (subpool: Question[], n: number): void => {
    for (const q of subpool) {
      if (selected.length >= opts.count) break;
      if (used.has(q.id)) continue;
      selected.push(q);
      used.add(q.id);
      if (--n <= 0) break;
    }
  };

  for (const d of [1, 2, 3] as Domain[]) {
    const domQuota = Math.round(opts.count * ECO_WEIGHTS[d]);
    const domOrdered = ordered.filter((q) => q.domain === d);
    for (const diff of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
      const n = Math.round(domQuota * profile[diff]);
      pick(
        domOrdered.filter((q) => q.difficulty === diff),
        n,
      );
    }
    const have = selected.filter((q) => q.domain === d).length;
    if (have < domQuota) pick(domOrdered, domQuota - have);
  }

  if (selected.length < opts.count) pick(ordered, opts.count - selected.length);

  return shuffle(selected, opts.rng).slice(0, opts.count);
}

/**
 * ECO-weighted draw of any size. Distributes `count` across the three domains using
 * ECO_WEIGHTS (largest-remainder method), then takes unseen-first from each domain.
 * Used by Mini Exam and any small-N balanced session where plain sampleQuestions
 * would fall back to straight unseen-first and ignore ECO.
 */
export function sampleBalanced(
  bank: Question[],
  opts: { count: number; seen: Record<string, string>; rng: Rng },
): Question[] {
  const ordered = sortUnseenFirst(bank, opts.seen, opts.rng);
  const raw: [Domain, number][] = ([1, 2, 3] as Domain[]).map((d) => [
    d,
    opts.count * ECO_WEIGHTS[d],
  ]);
  const quotas: Record<Domain, number> = { 1: 0, 2: 0, 3: 0 };
  let assigned = 0;
  for (const [d, r] of raw) {
    quotas[d] = Math.floor(r);
    assigned += quotas[d];
  }
  const byFrac = raw.slice().sort((a, b) => b[1] - Math.floor(b[1]) - (a[1] - Math.floor(a[1])));
  for (let i = 0; i < opts.count - assigned; i++) quotas[byFrac[i % 3][0]] += 1;

  const picked: Question[] = [];
  for (const d of [1, 2, 3] as Domain[]) {
    const pool = ordered.filter((q) => q.domain === d);
    picked.push(...pool.slice(0, quotas[d]));
  }
  return shuffle(picked, opts.rng);
}

export function filterStaticExam(
  exam: Question[],
  opts: {
    count: number | null;
    domainFilter: Domain | null;
    difficultyFilter: Difficulty | null;
    rng: Rng;
  },
): Question[] {
  let out = exam;
  if (opts.domainFilter != null) out = out.filter((q) => q.domain === opts.domainFilter);
  if (opts.difficultyFilter != null)
    out = out.filter((q) => q.difficulty === opts.difficultyFilter);
  out = shuffle(out, opts.rng);
  if (opts.count != null) out = out.slice(0, opts.count);
  return out;
}

import { describe, expect, it } from "vitest";
import {
  ECO_WEIGHTS,
  PROFILES,
  sampleBalanced,
  sampleQuestions,
  sortUnseenFirst,
} from "../src/sampling";
import { mulberry32 } from "../src/lib/prng";
import type { Difficulty, Domain, Question } from "../src/types";

function makeBank(): Question[] {
  const out: Question[] = [];
  const diffs: Difficulty[] = ["easy", "medium", "hard", "expert"];
  for (const d of [1, 2, 3] as Domain[]) {
    for (const diff of diffs) {
      for (let i = 0; i < 50; i++) {
        out.push({
          id: `d${d}-${diff}-${i}`,
          question: "",
          options: [],
          answer: "A",
          explanation: "",
          difficulty: diff,
          topic: `t${d}`,
          domain: d,
          source_id: "",
          chunk_index: 0,
          video_segment: "",
        });
      }
    }
  }
  return out;
}

describe("sampling", () => {
  it("sortUnseenFirst puts unseen first and seen (oldest) last", () => {
    const bank = makeBank();
    const seen = {
      [bank[0].id]: "2024-01-02T00:00:00Z",
      [bank[1].id]: "2024-01-01T00:00:00Z", // older
      [bank[2].id]: "2024-01-03T00:00:00Z", // newest
    };
    const ordered = sortUnseenFirst(bank, seen, mulberry32(1));
    const seenIdsInOrder = ordered.slice(-3).map((q) => q.id);
    expect(seenIdsInOrder).toEqual([bank[1].id, bank[0].id, bank[2].id]);
    // All unseen come before any seen.
    const firstSeenIdx = ordered.findIndex((q) => seen[q.id]);
    expect(firstSeenIdx).toBe(bank.length - 3);
  });

  it("sampleBalanced distributes 15 questions across domains by ECO weights", () => {
    const bank = makeBank();
    const rng = mulberry32(7);
    const out = sampleBalanced(bank, { count: 15, seen: {}, rng });
    expect(out).toHaveLength(15);
    const byDomain = { 1: 0, 2: 0, 3: 0 } as Record<Domain, number>;
    for (const q of out) byDomain[q.domain] += 1;
    // 15 * 0.42 = 6.3, 15 * 0.50 = 7.5, 15 * 0.08 = 1.2 → largest-remainder: 6,8,1
    expect(byDomain[1]).toBe(6);
    expect(byDomain[2]).toBe(8);
    expect(byDomain[3]).toBe(1);
  });

  it("sampleBalanced is deterministic for a given seed", () => {
    const bank = makeBank();
    const a = sampleBalanced(bank, { count: 15, seen: {}, rng: mulberry32(7) })
      .map((q) => q.id)
      .sort();
    const b = sampleBalanced(bank, { count: 15, seen: {}, rng: mulberry32(7) })
      .map((q) => q.id)
      .sort();
    expect(a).toEqual(b);
  });

  it("sampleQuestions returns exactly N for small counts without ECO weighting", () => {
    const bank = makeBank();
    const out = sampleQuestions(bank, {
      profile: "practice",
      count: 20,
      seen: {},
      rng: mulberry32(1),
      domainFilter: null,
      difficultyFilter: null,
    });
    expect(out).toHaveLength(20);
  });

  it("sampleQuestions honors domain + difficulty filters", () => {
    const bank = makeBank();
    const out = sampleQuestions(bank, {
      profile: "standard",
      count: 30,
      seen: {},
      rng: mulberry32(1),
      domainFilter: 2,
      difficultyFilter: "hard",
    });
    expect(out.every((q) => q.domain === 2 && q.difficulty === "hard")).toBe(true);
  });

  it("sampleQuestions applies ECO + profile for count >= 50 without filters", () => {
    const bank = makeBank();
    const out = sampleQuestions(bank, {
      profile: "standard",
      count: 100,
      seen: {},
      rng: mulberry32(3),
      domainFilter: null,
      difficultyFilter: null,
    });
    expect(out).toHaveLength(100);
    const byDomain = { 1: 0, 2: 0, 3: 0 } as Record<Domain, number>;
    for (const q of out) byDomain[q.domain] += 1;
    // ECO: 42 / 50 / 8 — allow ±3 slack for rounding in nested loop.
    expect(byDomain[1]).toBeGreaterThanOrEqual(39);
    expect(byDomain[1]).toBeLessThanOrEqual(45);
    expect(byDomain[2]).toBeGreaterThanOrEqual(47);
    expect(byDomain[2]).toBeLessThanOrEqual(53);
    expect(byDomain[3]).toBeGreaterThanOrEqual(5);
    expect(byDomain[3]).toBeLessThanOrEqual(11);
  });

  it("profile and ECO weights sum to 1", () => {
    for (const p of Object.values(PROFILES)) {
      const sum = Object.values(p).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
    const ecoSum = Object.values(ECO_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(ecoSum).toBeCloseTo(1, 5);
  });
});

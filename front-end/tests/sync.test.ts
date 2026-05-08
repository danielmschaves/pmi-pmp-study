import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeSeenRecords, mergeSessionHistories } from "../src/sync";
import type { StudySession } from "../src/types";

// ── Pure merge helpers ────────────────────────────────────────────────────────

describe("mergeSeenRecords", () => {
  it("returns local records when remote is empty", () => {
    const local = { "q-1": "2024-01-10T00:00:00Z" };
    expect(mergeSeenRecords(local, [])).toEqual(local);
  });

  it("adds remote questions not in local", () => {
    const result = mergeSeenRecords({}, [{ question_id: "q-1", seen_at: "2024-01-10T00:00:00Z" }]);
    expect(result["q-1"]).toBe("2024-01-10T00:00:00Z");
  });

  it("keeps local date when local is earlier", () => {
    const local = { "q-1": "2024-01-01T00:00:00Z" };
    const remote = [{ question_id: "q-1", seen_at: "2024-01-10T00:00:00Z" }];
    expect(mergeSeenRecords(local, remote)["q-1"]).toBe("2024-01-01T00:00:00Z");
  });

  it("replaces local date when remote is earlier", () => {
    const local = { "q-1": "2024-01-10T00:00:00Z" };
    const remote = [{ question_id: "q-1", seen_at: "2024-01-01T00:00:00Z" }];
    expect(mergeSeenRecords(local, remote)["q-1"]).toBe("2024-01-01T00:00:00Z");
  });

  it("does not mutate the local input", () => {
    const local = { "q-1": "2024-01-10T00:00:00Z" };
    const original = { ...local };
    mergeSeenRecords(local, [{ question_id: "q-1", seen_at: "2024-01-01T00:00:00Z" }]);
    expect(local).toEqual(original);
  });

  it("handles multiple questions correctly", () => {
    const local = { "q-1": "2024-02-01T00:00:00Z", "q-2": "2024-01-15T00:00:00Z" };
    const remote = [
      { question_id: "q-1", seen_at: "2024-01-01T00:00:00Z" }, // earlier → wins
      { question_id: "q-2", seen_at: "2024-02-01T00:00:00Z" }, // later  → local wins
      { question_id: "q-3", seen_at: "2024-01-20T00:00:00Z" }, // new
    ];
    const result = mergeSeenRecords(local, remote);
    expect(result["q-1"]).toBe("2024-01-01T00:00:00Z");
    expect(result["q-2"]).toBe("2024-01-15T00:00:00Z");
    expect(result["q-3"]).toBe("2024-01-20T00:00:00Z");
  });
});

// ── mergeSessionHistories ─────────────────────────────────────────────────────

function makeSession(id: string, startedAt: number): StudySession {
  return { id, startedAt, endedAt: startedAt + 1000, quizzes: [], seenQuestionIds: [] };
}

describe("mergeSessionHistories", () => {
  it("returns local when remote is empty", () => {
    const local = [makeSession("s1", 1000)];
    expect(mergeSessionHistories(local, [])).toEqual(local);
  });

  it("adds remote sessions not present locally", () => {
    const local = [makeSession("s1", 2000)];
    const remote = [makeSession("s2", 1000)];
    const result = mergeSessionHistories(local, remote);
    expect(result).toHaveLength(2);
  });

  it("deduplicates sessions by id — local copy is kept", () => {
    const local  = [{ ...makeSession("s1", 2000), quizzes: [], seenQuestionIds: ["local-marker"] }];
    const remote = [{ ...makeSession("s1", 2000), quizzes: [], seenQuestionIds: ["remote-marker"] }];
    const result = mergeSessionHistories(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].seenQuestionIds).toContain("local-marker");
  });

  it("sorts merged list newest-first", () => {
    const local  = [makeSession("s1", 1000)];
    const remote = [makeSession("s2", 3000), makeSession("s3", 2000)];
    const result = mergeSessionHistories(local, remote);
    expect(result.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("caps result at 50 entries", () => {
    const local  = Array.from({ length: 40 }, (_, i) => makeSession(`l${i}`, 1000 + i));
    const remote = Array.from({ length: 20 }, (_, i) => makeSession(`r${i}`, 2000 + i));
    const result = mergeSessionHistories(local, remote);
    expect(result).toHaveLength(50);
  });
});

// ── Push functions: error resilience ─────────────────────────────────────────

// Mock supabase so push functions don't make real network calls
vi.mock("../src/supabase", () => {
  const upsert = vi.fn().mockRejectedValue(new Error("network error"));
  const update = vi.fn().mockReturnThis();
  const del    = vi.fn().mockRejectedValue(new Error("network error"));
  const eq     = vi.fn().mockReturnValue({ update, delete: del });
  const chain  = { upsert, update, delete: del, eq };
  return { supabase: { from: vi.fn().mockReturnValue(chain) } };
});

describe("pushProgress — error resilience", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not throw when supabase.from().upsert() rejects", async () => {
    const { pushProgress } = await import("../src/sync");
    await expect(pushProgress("uid", "q-1", "2024-01-01T00:00:00Z")).resolves.toBeUndefined();
  });
});

describe("pushStudySession — error resilience", () => {
  it("does not throw when supabase rejects", async () => {
    const { pushStudySession } = await import("../src/sync");
    const session = makeSession("s1", Date.now());
    await expect(pushStudySession("uid", session)).resolves.toBeUndefined();
  });
});

describe("pushPreferences — error resilience", () => {
  it("does not throw when supabase rejects", async () => {
    const { pushPreferences } = await import("../src/sync");
    await expect(
      pushPreferences("uid", { explanationsByDefault: false }),
    ).resolves.toBeUndefined();
  });
});

describe("deleteProgress — error resilience", () => {
  it("does not throw when supabase rejects", async () => {
    const { deleteProgress } = await import("../src/sync");
    await expect(deleteProgress("uid")).resolves.toBeUndefined();
  });
});

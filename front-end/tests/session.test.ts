import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionState } from "../src/types";
import { makeConfig, makeQuestion } from "./fixtures";

const { mockGetSession, mockUpsert } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  mockUpsert:     vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("../src/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
  },
}));

import {
  appendFinishedQuiz,
  endActiveStudySession,
  getActiveStudySession,
  getHistoricalSession,
  getSession,
  getSessionHistory,
  setActiveStudySession,
  setSession,
  startStudySession,
} from "../src/session";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  const questions = [makeQuestion({ id: "q-1" }), makeQuestion({ id: "q-2" })];
  return {
    config: makeConfig(),
    questions,
    index: 0,
    answers: [{ q: questions[0], picked: "B", correct: true, ms: 2000 }],
    startedAt: Date.now(),
    ...overrides,
  };
}

// ── In-memory session ─────────────────────────────────────────────────────────

describe("getSession / setSession", () => {
  it("returns null initially", () => {
    expect(getSession()).toBeNull();
  });

  it("returns the value set by setSession", () => {
    const s = makeSessionState();
    setSession(s);
    expect(getSession()).toBe(s);
  });

  it("returns null after setSession(null)", () => {
    setSession(makeSessionState());
    setSession(null);
    expect(getSession()).toBeNull();
  });
});

// ── Study session lifecycle ───────────────────────────────────────────────────

describe("startStudySession", () => {
  it("creates a session with a unique id", () => {
    const a = startStudySession();
    const b = startStudySession();
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("sets startedAt and endedAt=null", () => {
    const s = startStudySession();
    expect(s.startedAt).toBeGreaterThan(0);
    expect(s.endedAt).toBeNull();
  });

  it("persists to localStorage so getActiveStudySession returns it", () => {
    const s = startStudySession();
    expect(getActiveStudySession()?.id).toBe(s.id);
  });
});

describe("setActiveStudySession", () => {
  it("clears active session when passed null", () => {
    startStudySession();
    setActiveStudySession(null);
    expect(getActiveStudySession()).toBeNull();
  });
});

describe("appendFinishedQuiz", () => {
  it("returns null when no active session", () => {
    expect(appendFinishedQuiz(makeSessionState())).toBeNull();
  });

  it("appends quiz attempt and unions seen question ids", () => {
    startStudySession();
    const state = makeSessionState();
    const attempt = appendFinishedQuiz(state);

    expect(attempt).not.toBeNull();
    expect(attempt!.score.answered).toBe(1);
    expect(attempt!.score.correct).toBe(1);

    const active = getActiveStudySession()!;
    expect(active.quizzes).toHaveLength(1);
    expect(active.seenQuestionIds).toContain("q-1");
    expect(active.seenQuestionIds).toContain("q-2");
  });

  it("accumulates multiple quiz attempts", () => {
    startStudySession();
    appendFinishedQuiz(makeSessionState());
    appendFinishedQuiz(makeSessionState());
    expect(getActiveStudySession()!.quizzes).toHaveLength(2);
  });
});

describe("endActiveStudySession", () => {
  it("returns null when no active session", () => {
    expect(endActiveStudySession()).toBeNull();
  });

  it("moves active session to history with endedAt set", () => {
    startStudySession();
    const ended = endActiveStudySession();

    expect(ended).not.toBeNull();
    expect(ended!.endedAt).toBeGreaterThan(0);
    expect(getActiveStudySession()).toBeNull();
    expect(getSessionHistory()).toHaveLength(1);
    expect(getSessionHistory()[0].id).toBe(ended!.id);
  });

  it("prepends newest session in history (most-recent first)", () => {
    startStudySession();
    const first = endActiveStudySession();
    startStudySession();
    const second = endActiveStudySession();

    const history = getSessionHistory();
    expect(history[0].id).toBe(second!.id);
    expect(history[1].id).toBe(first!.id);
  });

  it("caps history at 50 entries", () => {
    for (let i = 0; i < 52; i++) {
      startStudySession();
      endActiveStudySession();
    }
    expect(getSessionHistory()).toHaveLength(50);
  });

  it("fires pushStudySession when a session exists", async () => {
    const fakeSession = { user: { id: "user-789" } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    startStudySession();
    endActiveStudySession();
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  });

  it("does not call pushStudySession when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    startStudySession();
    endActiveStudySession();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// ── History queries ───────────────────────────────────────────────────────────

describe("getSessionHistory", () => {
  it("returns empty array initially", () => {
    expect(getSessionHistory()).toEqual([]);
  });
});

describe("getHistoricalSession", () => {
  it("finds a session by id", () => {
    startStudySession();
    const ended = endActiveStudySession()!;
    expect(getHistoricalSession(ended.id)?.id).toBe(ended.id);
  });

  it("returns null for unknown id", () => {
    expect(getHistoricalSession("nonexistent")).toBeNull();
  });
});

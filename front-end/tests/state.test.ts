import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSession, mockUpsert, mockUpdate, mockEq } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  mockUpsert:     vi.fn().mockResolvedValue({ data: null, error: null }),
  mockUpdate:     vi.fn(),
  mockEq:         vi.fn(),
}));

vi.mock("../src/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
      update: mockUpdate,
      eq: mockEq,
    }),
  },
}));

import {
  getSeen,
  getExplanationsDefault,
  markSeen,
  resetHistory,
  setExplanationsDefault,
} from "../src/state";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockUpdate.mockReturnThis();
  mockEq.mockReturnThis();
});

describe("getSeen", () => {
  it("returns empty object when nothing stored", () => {
    expect(getSeen()).toEqual({});
  });

  it("returns previously marked questions", () => {
    markSeen("q-1");
    expect(getSeen()["q-1"]).toBeTruthy();
  });
});

describe("markSeen", () => {
  it("records an ISO timestamp for the question id", () => {
    markSeen("q-abc");
    expect(getSeen()["q-abc"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accumulates multiple seen questions", () => {
    markSeen("q-1");
    markSeen("q-2");
    expect(Object.keys(getSeen())).toHaveLength(2);
  });

  it("fires pushProgress when a session exists", async () => {
    const fakeSession = { user: { id: "user-123" } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    markSeen("q-fire");
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  });

  it("does not call pushProgress when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    markSeen("q-noauth");
    await new Promise((r) => setTimeout(r, 10));
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("resetHistory", () => {
  it("clears the seen map", () => {
    markSeen("q-1");
    markSeen("q-2");
    resetHistory();
    expect(getSeen()).toEqual({});
  });

  it("preserves explanationsByDefault when clearing seen", () => {
    setExplanationsDefault(false);
    resetHistory();
    expect(getExplanationsDefault()).toBe(false);
  });
});

describe("getExplanationsDefault", () => {
  it("defaults to true", () => {
    expect(getExplanationsDefault()).toBe(true);
  });
});

describe("setExplanationsDefault", () => {
  it("persists false", () => {
    setExplanationsDefault(false);
    expect(getExplanationsDefault()).toBe(false);
  });

  it("persists true after setting false", () => {
    setExplanationsDefault(false);
    setExplanationsDefault(true);
    expect(getExplanationsDefault()).toBe(true);
  });

  it("fires pushPreferences when a session exists", async () => {
    const fakeSession = { user: { id: "user-456" } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    setExplanationsDefault(false);
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  });
});

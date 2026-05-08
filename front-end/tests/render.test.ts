import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderLanding } from "../src/views/landing";
import { renderAuth } from "../src/views/auth";
import { renderResults } from "../src/views/results";
import { setSession } from "../src/session";
import { makeQuestion, makeSession } from "./fixtures";

// Mock Supabase so auth/sync imports don't fail in jsdom
vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("../src/sync", () => ({
  pullAndMerge: vi.fn().mockResolvedValue(undefined),
}));

function root(): HTMLElement {
  return document.getElementById("app")!;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  setSession(null);
});

afterEach(() => {
  setSession(null);
});

// ── Landing ────────────────────────────────────────────────

describe("landing view — design system classes", () => {
  it("renders full-bleed landing-page wrapper", () => {
    renderLanding(root());
    expect(document.querySelector(".landing-page")).not.toBeNull();
    expect(document.querySelector("main.app")).toBeNull();
  });

  it("uses btn-iris for primary CTA", () => {
    renderLanding(root());
    expect(document.querySelector(".btn-iris")).not.toBeNull();
    expect(document.querySelector("#cta-signup")).not.toBeNull();
  });

  it("uses f-display on the hero heading", () => {
    renderLanding(root());
    expect(document.querySelector(".f-display")).not.toBeNull();
  });

  it("does not use any .badge classes", () => {
    renderLanding(root());
    expect(document.querySelector(".badge")).toBeNull();
  });
});

// ── Auth ───────────────────────────────────────────────────

describe("auth view — design system classes", () => {
  it("wraps in auth-page (not app-shell) and shows auth-card", () => {
    renderAuth(root(), "login");
    expect(document.querySelector(".auth-page")).not.toBeNull();
    expect(document.querySelector(".auth-card")).not.toBeNull();
  });

  it("adds .input class to email and password fields", () => {
    renderAuth(root(), "login");
    const inputs = document.querySelectorAll("input.input");
    expect(inputs.length).toBe(2);
  });

  it("adds .field-label class to form labels", () => {
    renderAuth(root(), "login");
    const labels = document.querySelectorAll(".field-label");
    expect(labels.length).toBe(2);
  });

  it("uses btn-iris for submit button", () => {
    renderAuth(root(), "login");
    const submit = document.querySelector<HTMLButtonElement>("#auth-submit");
    expect(submit).not.toBeNull();
    expect(submit!.classList.contains("btn-iris")).toBe(true);
  });

  it("signup mode also uses input and field-label classes", () => {
    renderAuth(root(), "signup");
    expect(document.querySelectorAll("input.input").length).toBe(2);
    expect(document.querySelectorAll(".field-label").length).toBe(2);
  });

  it("does not use any .badge classes", () => {
    renderAuth(root(), "login");
    expect(document.querySelector(".badge")).toBeNull();
  });
});

// ── Results ────────────────────────────────────────────────

describe("results view — design system classes", () => {
  function makeAnsweredSession(correct: boolean[]) {
    const questions = correct.map((_, i) =>
      makeQuestion({ id: `q${i}`, answer: "A" }),
    );
    const sess = makeSession(questions, { examMode: true });
    sess.answers = correct.map((c, i) => ({
      q: questions[i],
      picked: c ? "A" : ("B" as "A" | "B" | "C" | "D" | "S"),
      correct: c,
      ms: 100,
    }));
    sess.finishedAt = Date.now();
    return sess;
  }

  it("renders app-shell wrapper", () => {
    setSession(makeAnsweredSession([true, false, true]));
    renderResults(root());
    expect(document.querySelector("main.app-shell")).not.toBeNull();
    expect(document.querySelector("main.app")).toBeNull();
  });

  it("uses .chip for status label, not .badge", () => {
    setSession(makeAnsweredSession([true, true, true]));
    renderResults(root());
    expect(document.querySelector(".chip")).not.toBeNull();
    expect(document.querySelector(".badge")).toBeNull();
  });

  it("uses sticky-foot instead of footer-bar", () => {
    setSession(makeAnsweredSession([true, false]));
    renderResults(root());
    expect(document.querySelector(".sticky-foot")).not.toBeNull();
    expect(document.querySelector(".footer-bar")).toBeNull();
  });

  it("review list has ok/bad status indicators per answer", () => {
    setSession(makeAnsweredSession([true, false]));
    renderResults(root());
    expect(document.querySelector('[data-review-status="ok"]')).not.toBeNull();
    expect(document.querySelector('[data-review-status="bad"]')).not.toBeNull();
  });

  it("uses btn-ghost for source links instead of btn-secondary", () => {
    setSession(makeAnsweredSession([true]));
    renderResults(root());
    expect(document.querySelector(".btn-secondary")).toBeNull();
  });
});

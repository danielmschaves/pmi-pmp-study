import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPlay } from "../src/views/play";
import { setSession, getSession } from "../src/session";
import { makeQuestion, makeSession } from "./fixtures";

function root(): HTMLElement {
  return document.getElementById("app")!;
}

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  el.click();
}

function optionByLetter(letter: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`.option[data-letter="${letter}"]`);
  if (!el) throw new Error(`no option ${letter}`);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = "#/play";
  setSession(null);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  setSession(null);
});

describe("play view — selection and Next behavior", () => {
  it("disables Next until the user selects an option", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1", answer: "B" }), makeQuestion({ id: "q2" })]),
    );
    renderPlay(root());

    const next = document.querySelector<HTMLButtonElement>("#act")!;
    expect(next.disabled).toBe(true);

    click('.option[data-letter="A"]');
    expect(next.disabled).toBe(false);
  });

  it("lets the user change their selection before committing", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1", answer: "B" }), makeQuestion({ id: "q2" })]),
    );
    renderPlay(root());

    click('.option[data-letter="A"]');
    expect(optionByLetter("A").dataset.selected).toBe("true");
    expect(optionByLetter("C").dataset.selected).toBe("false");

    click('.option[data-letter="C"]');
    expect(optionByLetter("A").dataset.selected).toBe("false");
    expect(optionByLetter("C").dataset.selected).toBe("true");

    // No answer has been recorded yet — just selection changes.
    expect(getSession()!.answers).toHaveLength(0);
  });

  it("study mode: first Next reveals feedback; second Next advances", () => {
    setSession(
      makeSession(
        [
          makeQuestion({ id: "q1", answer: "B" }),
          makeQuestion({ id: "q2", question: "Q2?", answer: "A" }),
        ],
        { showExplanation: true, examMode: false },
      ),
    );
    renderPlay(root());

    click('.option[data-letter="B"]');
    click("#act");

    // Locked: correct state painted, explanation visible, still on Q1.
    expect(optionByLetter("B").dataset.state).toBe("correct");
    expect(document.querySelector(".explanation")).not.toBeNull();
    expect(getSession()!.index).toBe(0);
    expect(getSession()!.answers).toHaveLength(1);
    expect(getSession()!.answers[0].correct).toBe(true);

    // Second Next advances.
    click("#act");
    expect(getSession()!.index).toBe(1);
    expect(document.querySelector(".question-text")!.textContent).toContain("Q2");
  });

  it("study mode: wrong answer reveals the correct option and marks wrong", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1", answer: "B" }), makeQuestion({ id: "q2" })]),
    );
    renderPlay(root());

    click('.option[data-letter="A"]');
    click("#act");

    expect(optionByLetter("A").dataset.state).toBe("wrong");
    expect(optionByLetter("B").dataset.state).toBe("reveal");
    expect(getSession()!.answers[0].correct).toBe(false);
  });

  it("exam mode: Next locks and advances in one step, no feedback shown", () => {
    setSession(
      makeSession(
        [
          makeQuestion({ id: "q1", answer: "B" }),
          makeQuestion({ id: "q2", question: "Q2?", answer: "A" }),
        ],
        { examMode: true, showExplanation: false },
      ),
    );
    renderPlay(root());

    click('.option[data-letter="A"]'); // wrong choice
    click("#act");

    expect(document.querySelector(".explanation")).toBeNull();
    expect(getSession()!.index).toBe(1);
    expect(getSession()!.answers).toHaveLength(1);
    // Now on Q2 — no reveal-state markers should exist on the new question.
    expect(optionByLetter("A").dataset.state).toBeUndefined();
  });

  it("Skip advances without requiring a selection and records a skip", () => {
    setSession(
      makeSession([
        makeQuestion({ id: "q1", answer: "B" }),
        makeQuestion({ id: "q2" }),
      ]),
    );
    renderPlay(root());

    click("#skip");
    // Skip locks with picked="S" and shows feedback (study mode).
    expect(getSession()!.answers[0].picked).toBe("S");
    expect(getSession()!.answers[0].correct).toBe(false);

    // Still on Q1 until Next fires.
    expect(getSession()!.index).toBe(0);
    click("#act");
    expect(getSession()!.index).toBe(1);
  });

  it("finishing the last question navigates to results", () => {
    setSession(makeSession([makeQuestion({ id: "q1", answer: "B" })]));
    renderPlay(root());

    click('.option[data-letter="B"]');
    click("#act"); // lock + show feedback
    click("#act"); // advance → finish

    expect(location.hash).toBe("#/results");
    expect(getSession()!.finishedAt).toBeTypeOf("number");
  });
});

describe("play view — timer", () => {
  it("countdown updates every second and uses MM:SS format", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1" }), makeQuestion({ id: "q2" })], {
        timeLimitSec: 120,
      }),
    );
    renderPlay(root());

    const timer = (): string => document.getElementById("timer")!.textContent ?? "";
    expect(timer()).toBe("02:00");

    vi.advanceTimersByTime(1000);
    expect(timer()).toBe("01:59");

    vi.advanceTimersByTime(60_000);
    expect(timer()).toBe("00:59");
  });

  it("countdown turns low (red) under 60 seconds remaining", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1" })], { timeLimitSec: 65 }),
    );
    renderPlay(root());

    vi.advanceTimersByTime(5_000);
    const el = document.getElementById("timer")!;
    expect(el.dataset.low).toBe("true");
  });

  it("expiring the countdown auto-finishes the session to /results", () => {
    setSession(
      makeSession([makeQuestion({ id: "q1" }), makeQuestion({ id: "q2" })], {
        timeLimitSec: 2,
        examMode: true,
      }),
    );
    renderPlay(root());

    vi.advanceTimersByTime(3_000);

    expect(location.hash).toBe("#/results");
    // Unanswered questions are recorded as skipped so the results screen has data.
    expect(getSession()!.answers.length).toBe(2);
    expect(getSession()!.answers.every((a) => a.picked === "S")).toBe(true);
  });

  it("no time limit → timer shows elapsed time climbing from 00:00", () => {
    setSession(makeSession([makeQuestion({ id: "q1" })]));
    renderPlay(root());

    const timer = (): string => document.getElementById("timer")!.textContent ?? "";
    expect(timer()).toBe("00:00");

    vi.advanceTimersByTime(5_000);
    expect(timer()).toBe("00:05");
  });
});

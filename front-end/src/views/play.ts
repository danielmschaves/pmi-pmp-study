import { getSession } from "../session";
import { markSeen } from "../state";
import { setKeyHandler } from "../lib/keys";
import type { Letter, Question } from "../types";

const DOMAIN_NAMES: Record<number, string> = {
  1: "People",
  2: "Process",
  3: "Business Env",
};

export function renderPlay(root: HTMLElement): void {
  const sess = getSession();
  if (!sess) {
    location.hash = "#/";
    return;
  }

  let selected: Letter | null = null;
  let locked: { picked: Letter | "S"; correct: boolean } | null = null;
  let questionStart = Date.now();
  let tickHandle: number | null = null;

  const stopTicking = (): void => {
    if (tickHandle != null) {
      window.clearInterval(tickHandle);
      tickHandle = null;
    }
  };

  render();
  startTicking();

  function startTicking(): void {
    stopTicking();
    tickHandle = window.setInterval(() => {
      updateTimer();
    }, 1000);
  }

  function updateTimer(): void {
    const el = document.getElementById("timer");
    if (!el) return;
    const elapsed = (Date.now() - sess!.startedAt) / 1000;
    if (sess!.config.timeLimitSec != null) {
      const remaining = sess!.config.timeLimitSec - elapsed;
      if (remaining <= 0) {
        el.textContent = "00:00";
        el.dataset.low = "true";
        stopTicking();
        forceFinish();
        return;
      }
      el.textContent = formatClock(remaining);
      el.dataset.low = remaining <= 60 ? "true" : "false";
    } else {
      el.textContent = formatClock(elapsed);
    }
  }

  function render(): void {
    const q = sess!.questions[sess!.index];
    const total = sess!.questions.length;
    const done = sess!.index;
    const pct = (done / total) * 100;
    const examMode = sess!.config.examMode;
    const timerInitial = sess!.config.timeLimitSec != null
      ? formatClock(sess!.config.timeLimitSec)
      : "00:00";

    root.innerHTML = `
      <main class="app stack">
        <div class="play-top">
          <span class="mono">Q ${done + 1}/${total}</span>
          ${sess!.config.label ? `<span class="badge badge-accent">${escapeHtml(sess!.config.label)}</span>` : ""}
          <span class="spacer"></span>
          <span class="mono timer" id="timer" data-low="false">${timerInitial}</span>
          <button class="exit" id="exit" aria-label="Exit session">×</button>
        </div>
        <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>

        <div class="row" style="flex-wrap:wrap;gap:8px;">
          <span class="badge">${DOMAIN_NAMES[q.domain] ?? `Domain ${q.domain}`}</span>
          ${examMode ? "" : `<span class="badge ${diffBadgeClass(q.difficulty)}">${q.difficulty}</span>`}
          ${examMode ? "" : `<span class="badge">${escapeHtml(truncate(q.topic, 40))}</span>`}
        </div>

        <p class="question-text">${escapeHtml(q.question)}</p>

        <div class="options" id="options"></div>

        <div id="feedback"></div>

        <div class="footer-bar">
          <button class="btn btn-secondary" id="skip">Skip <span class="kbd-hint mono dim">S</span></button>
          <button class="btn btn-primary" id="act" disabled>Next <span class="kbd-hint mono dim">⏎</span></button>
        </div>
      </main>
    `;

    const optionsEl = document.getElementById("options")!;
    q.options.forEach((opt, i) => {
      const letter = String.fromCharCode(65 + i) as Letter;
      const text = opt.replace(/^[A-D]\.\s*/, "");
      const row = document.createElement("button");
      row.className = "option";
      row.dataset.letter = letter;
      row.innerHTML = `
        <span class="letter">${letter}</span>
        <span class="text">${escapeHtml(text)}</span>
        <span class="mark"></span>
      `;
      row.addEventListener("click", () => {
        if (locked) return;
        selectLetter(letter);
      });
      optionsEl.appendChild(row);
    });

    document.getElementById("exit")!.addEventListener("click", () => {
      if (confirm("Exit this session? Progress so far won't be saved as a result.")) {
        stopTicking();
        location.hash = "#/";
      }
    });
    document.getElementById("skip")!.addEventListener("click", () => {
      if (locked) next();
      else skip();
    });
    document.getElementById("act")!.addEventListener("click", () => {
      if (locked) next();
      else advance();
    });

    setKeyHandler((e) => {
      const key = e.key.toUpperCase();
      if (locked) {
        if (key === "ENTER" || key === "N" || key === " ") {
          e.preventDefault();
          next();
        }
        return;
      }
      if (["A", "B", "C", "D"].includes(key)) {
        e.preventDefault();
        selectLetter(key as Letter);
      } else if (key === "ENTER" || key === " ") {
        e.preventDefault();
        advance();
      } else if (key === "S") {
        e.preventDefault();
        skip();
      } else if (key === "ESCAPE") {
        if (confirm("Exit this session?")) {
          stopTicking();
          location.hash = "#/";
        }
      }
    });

    updateTimer();
  }

  function selectLetter(letter: Letter): void {
    selected = letter;
    const options = document.querySelectorAll<HTMLElement>(".option");
    options.forEach((o) => {
      o.dataset.selected = o.dataset.letter === letter ? "true" : "false";
    });
    const act = document.getElementById("act") as HTMLButtonElement;
    act.disabled = false;
  }

  /**
   * Primary commit action. Called by Next button / Enter / Space.
   * - Before any answer: nothing to do if no selection.
   * - Exam mode: lock + advance in one step (no feedback).
   * - Study mode: first press locks and shows feedback; second press advances.
   */
  function advance(): void {
    if (!selected) return;
    const q = sess!.questions[sess!.index];
    const correct = selected === q.answer;
    locked = { picked: selected, correct };
    recordAnswer(q, selected, correct);
    if (sess!.config.examMode) {
      next();
    } else {
      paintLocked(q);
    }
  }

  function skip(): void {
    const q = sess!.questions[sess!.index];
    locked = { picked: "S", correct: false };
    paintLocked(q);
    recordAnswer(q, "S", false);
  }

  function paintLocked(q: Question): void {
    const examMode = sess!.config.examMode;
    const options = document.querySelectorAll<HTMLElement>(".option");

    if (examMode) {
      // Exam mode: just mark the chosen option as "selected-and-locked", no reveal.
      options.forEach((o) => {
        const letter = o.dataset.letter as Letter;
        if (letter === locked!.picked) {
          o.dataset.state = "locked";
        } else {
          (o as HTMLButtonElement).disabled = true;
          o.style.opacity = "0.55";
        }
      });
      const fb = document.getElementById("feedback")!;
      fb.innerHTML = locked!.picked === "S"
        ? `<p class="muted">Skipped — no feedback until the end.</p>`
        : "";
    } else {
      options.forEach((o) => {
        const letter = o.dataset.letter as Letter;
        const mark = o.querySelector(".mark")!;
        if (letter === q.answer) {
          o.dataset.state = locked!.picked === q.answer ? "correct" : "reveal";
          mark.textContent = "✓";
        } else if (letter === locked!.picked) {
          o.dataset.state = "wrong";
          mark.textContent = "✗";
        } else {
          (o as HTMLButtonElement).disabled = true;
          o.style.opacity = "0.55";
        }
      });

      const fb = document.getElementById("feedback")!;
      if (sess!.config.showExplanation && locked!.picked !== "S") {
        fb.innerHTML = `
          <div class="explanation">
            <div>${escapeHtml(q.explanation)}</div>
            <div class="src">source · ${escapeHtml(q.video_segment)}</div>
          </div>
        `;
      } else if (locked!.picked === "S") {
        fb.innerHTML = `<p class="muted">Skipped — correct answer: <strong>${q.answer}</strong></p>`;
      } else {
        fb.innerHTML = "";
      }
    }

    const skipBtn = document.getElementById("skip") as HTMLButtonElement;
    skipBtn.style.display = "none";
    const act = document.getElementById("act") as HTMLButtonElement;
    act.style.display = "";
    act.disabled = false;
    act.innerHTML = `Next <span class="kbd-hint mono dim">⏎</span>`;
  }

  function recordAnswer(q: Question, picked: Letter | "S", correct: boolean): void {
    sess!.answers.push({ q, picked, correct, ms: Date.now() - questionStart });
    if (sess!.config.kind === "dynamic") markSeen(q.id);
  }

  function next(): void {
    locked = null;
    selected = null;
    sess!.index += 1;
    questionStart = Date.now();
    if (sess!.index >= sess!.questions.length) {
      finish();
      return;
    }
    render();
  }

  function forceFinish(): void {
    // Time expired — record any remaining questions as skipped so results are complete.
    while (sess!.index < sess!.questions.length) {
      const q = sess!.questions[sess!.index];
      if (locked == null && sess!.answers.length === sess!.index) {
        sess!.answers.push({ q, picked: "S", correct: false, ms: 0 });
        if (sess!.config.kind === "dynamic") markSeen(q.id);
      }
      sess!.index += 1;
      locked = null;
    }
    finish();
  }

  function finish(): void {
    stopTicking();
    sess!.finishedAt = Date.now();
    location.hash = "#/results";
  }
}

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function diffBadgeClass(d: string): string {
  if (d === "expert") return "badge-danger";
  if (d === "hard") return "badge-warning";
  return "";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

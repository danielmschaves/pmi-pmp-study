import { getActiveStudySession, getHistoricalSession } from "../session";
import {
  DOMAIN_NAMES,
  aggregateAnswers,
  byConcept,
  byDomain,
  overallAccuracy,
  statusFromPct,
} from "../lib/analytics";
import { preloadSources, resolveSourceLink } from "../lib/source_links";
import { formatDuration } from "../lib/format";
import type { AnswerRecord, Domain, StudySession } from "../types";

type Filter = "all" | "wrong" | "right";

export function renderSessionReport(root: HTMLElement, sessionId: string | null): void {
  const session = resolveSession(sessionId);
  if (!session) {
    location.hash = "#/";
    return;
  }

  preloadSources();

  const answers = aggregateAnswers(session.quizzes);
  if (answers.length === 0) {
    root.innerHTML = `
      <main class="app stack">
        <h1>No answers recorded yet</h1>
        <button class="btn btn-secondary btn-block" id="home">Back home</button>
      </main>
    `;
    document.getElementById("home")!.addEventListener("click", () => (location.hash = "#/"));
    return;
  }

  const overall = overallAccuracy(answers);
  const status = statusFromPct(overall.pct);
  const dom = byDomain(answers);
  const con = byConcept(answers, 1);
  const elapsed = ((session.endedAt ?? Date.now()) - session.startedAt) / 1000;

  const state = { filter: "all" as Filter };

  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <div class="stack" style="gap:4px;flex:1;">
          <p class="muted" style="margin:0;font-size:13px;">Session report</p>
          <div class="row" style="gap:16px;align-items:flex-end;">
            <span class="score-big mono">${overall.pct.toFixed(0)}%</span>
            <span class="badge ${status.cls}" style="font-size:12px;">${status.label}</span>
          </div>
        </div>
      </header>

      <p class="mono muted" style="margin:0;">
        ${overall.correct} / ${overall.answered} correct ·
        ${session.quizzes.length} quiz${session.quizzes.length === 1 ? "" : "zes"} ·
        ${formatDuration(elapsed)}
      </p>

      <section class="stack">
        <h2>Domain breakdown</h2>
        <div class="stack" style="gap:10px;">
          ${([1, 2, 3] as Domain[])
            .map((d) => {
              const v = dom[d];
              const low = v.total > 0 && v.pct < 70;
              return `
                <div class="domain-bar">
                  <span class="label">${DOMAIN_NAMES[d]}</span>
                  <span class="track">
                    <span class="fill" data-low="${low}" style="width:${v.pct}%"></span>
                    <span class="eco-tick" style="left:${v.targetPct}%" title="ECO target ${v.targetPct.toFixed(0)}% weight"></span>
                  </span>
                  <span class="pct muted">${v.total ? v.pct.toFixed(0) + "%" : "—"}</span>
                </div>
                <div class="muted" style="font-size:12px;margin-left:142px;">
                  ${v.correct} / ${v.total} answered · target weight ${v.targetPct.toFixed(0)}%
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      <section class="stack">
        <h2>Concept mastery</h2>
        <div class="concept-grid">
          <div class="stack" style="gap:6px;">
            <h3 class="muted" style="font-size:13px;margin:0;">Strong areas</h3>
            ${renderConceptList(con.strong, "accent")}
          </div>
          <div class="stack" style="gap:6px;">
            <h3 class="muted" style="font-size:13px;margin:0;">Needs more practice</h3>
            ${renderConceptList(con.weak, "danger")}
          </div>
        </div>
        ${
          con.all.size === 0
            ? `<p class="muted" style="font-size:13px;">Complete a quiz to see concept-level insights here.</p>`
            : ""
        }
      </section>

      <section class="stack">
        <div class="row">
          <h2>Question review</h2>
          <span class="spacer"></span>
          <div class="seg" id="filter-chips"></div>
        </div>
        <div class="stack" id="review-list" style="gap:8px;"></div>
      </section>

      <div class="footer-bar" style="flex-direction:column;">
        <button class="btn btn-secondary btn-block" id="home">Back home</button>
      </div>
    </main>
  `;

  document.getElementById("home")!.addEventListener("click", () => (location.hash = "#/"));

  renderFilterChips(state, () => renderReviewList(answers, state));
  renderReviewList(answers, state);
}

function resolveSession(id: string | null): StudySession | null {
  if (id) {
    const hist = getHistoricalSession(id);
    if (hist) return hist;
  }
  // Fallback: in-flight session (if the user hit the route manually)
  return getActiveStudySession();
}

function renderConceptList(
  items: Array<{ concept: string; tally: { correct: number; total: number }; pct: number }>,
  tone: "accent" | "danger",
): string {
  if (items.length === 0) {
    return `<p class="muted" style="font-size:13px;margin:0;">None yet.</p>`;
  }
  return items
    .slice(0, 12)
    .map(
      (it) => `
        <div class="row">
          <span class="badge badge-${tone} mono" style="min-width:48px;justify-content:center;">
            ${it.pct.toFixed(0)}%
          </span>
          <span style="flex:1;">${escapeHtml(it.concept)}</span>
          <span class="mono dim" style="font-size:12px;">${it.tally.correct}/${it.tally.total}</span>
        </div>
      `,
    )
    .join("");
}

function renderFilterChips(
  state: { filter: Filter },
  onChange: () => void,
): void {
  const el = document.getElementById("filter-chips")!;
  const chips: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Wrong", value: "wrong" },
    { label: "Right", value: "right" },
  ];
  el.innerHTML = "";
  chips.forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c.label;
    b.setAttribute("aria-pressed", state.filter === c.value ? "true" : "false");
    b.addEventListener("click", () => {
      state.filter = c.value;
      el.querySelectorAll("button").forEach((bb, i) => {
        bb.setAttribute("aria-pressed", chips[i].value === state.filter ? "true" : "false");
      });
      onChange();
    });
    el.appendChild(b);
  });
}

function renderReviewList(answers: AnswerRecord[], state: { filter: Filter }): void {
  const list = document.getElementById("review-list")!;
  const filtered = answers.filter((a) => {
    if (state.filter === "wrong") return !a.correct;
    if (state.filter === "right") return a.correct;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p class="muted">No questions match this filter — try switching to All.</p>`;
    return;
  }

  list.innerHTML = "";
  filtered.forEach((a, idx) => {
    const row = document.createElement("details");
    row.className = "review-row";
    row.innerHTML = `
      <summary class="row">
        <span class="badge mono ${a.correct ? "badge-accent" : "badge-danger"}" style="min-width:24px;justify-content:center;">
          ${a.correct ? "✓" : "✗"}
        </span>
        <span class="review-q">${escapeHtml(truncate(a.q.question, 100))}</span>
        <span class="mono dim" style="font-size:12px;">${DOMAIN_NAMES[a.q.domain]}</span>
      </summary>
      <div class="stack" style="gap:8px;padding:12px 0 0 0;">
        <p style="margin:0;">${escapeHtml(a.q.question)}</p>
        <div class="stack" style="gap:4px;">
          ${a.q.options
            .map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrect = letter === a.q.answer;
              const isPicked = letter === a.picked;
              const cls = isCorrect
                ? "review-opt-correct"
                : isPicked
                  ? "review-opt-wrong"
                  : "";
              return `<div class="review-opt ${cls}">${escapeHtml(opt)}</div>`;
            })
            .join("")}
        </div>
        <div class="explanation" style="padding:12px;font-size:14px;">
          ${escapeHtml(a.q.explanation)}
        </div>
        <div class="row" style="gap:8px;">
          <span class="mono dim" style="font-size:12px;">${escapeHtml(a.q.topic)}</span>
          <span class="spacer"></span>
          <a class="btn btn-secondary" data-src-link="${idx}" target="_blank" rel="noopener noreferrer" href="#">
            ▶ Open source
          </a>
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  // Resolve source links asynchronously and rewrite hrefs.
  filtered.forEach((a, idx) => {
    void resolveSourceLink(a.q).then((link) => {
      const anchor = list.querySelector<HTMLAnchorElement>(`[data-src-link="${idx}"]`);
      if (!anchor) return;
      if (!link) {
        anchor.textContent = "Source unavailable";
        anchor.removeAttribute("href");
        anchor.setAttribute("aria-disabled", "true");
        anchor.style.opacity = "0.5";
        anchor.style.pointerEvents = "none";
        return;
      }
      anchor.href = link.href;
      anchor.textContent = `▶ ${link.label}`;
      if (!link.precise) anchor.title = "No precise timestamp available for this source";
    });
  });
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

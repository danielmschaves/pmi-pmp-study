import { appendFinishedQuiz, getSession, setSession } from "../session";
import { formatDuration } from "../lib/format";
import { preloadSources, resolveSourceLink } from "../lib/source_links";
import type { AnswerRecord, Domain } from "../types";

const DOMAIN_NAMES: Record<Domain, string> = {
  1: "People",
  2: "Process",
  3: "Business Env",
};

// Remember which sessions we've already promoted into the study session so a
// back-nav to #/results doesn't double-append.
const appended = new Set<string>();

export function renderResults(root: HTMLElement): void {
  const sess = getSession();
  if (!sess || sess.answers.length === 0) {
    location.hash = "#/";
    return;
  }

  preloadSources();

  const inSession = sess.studySessionId != null;
  if (inSession) {
    const key = `${sess.studySessionId}:${sess.startedAt}`;
    if (!appended.has(key)) {
      appendFinishedQuiz(sess);
      appended.add(key);
    }
  }

  const answered = sess.answers.length;
  const correct = sess.answers.filter((a) => a.correct).length;
  const pct = (correct / answered) * 100;
  const elapsed = ((sess.finishedAt ?? Date.now()) - sess.startedAt) / 1000;
  const avgPerQ = elapsed / answered;

  const status =
    pct >= 70
      ? { label: "Pass", cls: "badge-accent" }
      : pct >= 61
        ? { label: "Borderline", cls: "badge-warning" }
        : { label: "Needs work", cls: "badge-danger" };

  // Per-domain accuracy
  const byDomain: Record<Domain, { c: number; t: number }> = {
    1: { c: 0, t: 0 },
    2: { c: 0, t: 0 },
    3: { c: 0, t: 0 },
  };
  for (const a of sess.answers) {
    byDomain[a.q.domain].t += 1;
    if (a.correct) byDomain[a.q.domain].c += 1;
  }

  // Topics to review
  const missed = sess.answers.filter((a) => !a.correct);
  const topicCounts = new Map<string, number>();
  for (const a of missed) {
    const t = a.q.topic || "General";
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <div class="stack" style="gap:4px;">
          <p class="muted" style="margin:0;font-size:13px;">${inSession ? "Quiz results" : "Results"}</p>
          <div class="row" style="gap:16px;align-items:flex-end;">
            <span class="score-big mono">${pct.toFixed(0)}%</span>
            <span class="badge ${status.cls}" style="font-size:12px;">${status.label}</span>
          </div>
        </div>
      </header>

      <p class="mono muted" style="margin:0;">
        ${correct} / ${answered} correct · ${formatDuration(elapsed)} · avg ${Math.round(avgPerQ)}s/q
      </p>

      <section class="stack">
        <h2>By domain</h2>
        <div class="stack" style="gap:10px;">
          ${([1, 2, 3] as Domain[])
            .map((d) => {
              const v = byDomain[d];
              const p = v.t ? (v.c / v.t) * 100 : 0;
              const low = p < 70;
              return `
                <div class="domain-bar">
                  <span class="label">${DOMAIN_NAMES[d]}</span>
                  <span class="track"><span class="fill" data-low="${low}" style="width:${p}%"></span></span>
                  <span class="pct muted">${v.t ? p.toFixed(0) + "%" : "—"}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      ${renderNextSteps(byDomain, missed.length)}

      ${
        topTopics.length
          ? `
        <section class="stack">
          <h2>Topics to review</h2>
          <div class="stack" style="gap:6px;">
            ${topTopics
              .map(
                ([t, n]) => `
              <div class="row">
                <span class="badge badge-danger mono" style="min-width:28px;justify-content:center;">${n}</span>
                <span>${escapeHtml(t)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </section>
      `
          : ""
      }

      <section class="stack">
        <h2>Review each question</h2>
        <div class="stack" id="review-list" style="gap:8px;"></div>
      </section>

      <div class="footer-bar" style="flex-direction:column;">
        ${
          inSession
            ? `<button class="btn btn-primary btn-block" id="hub">Back to session hub</button>`
            : missed.length
              ? `<button class="btn btn-primary btn-block" id="retry">Retry missed (${missed.length})</button>`
              : ""
        }
        ${
          inSession
            ? ""
            : `<button class="btn btn-secondary btn-block" id="new">New session</button>`
        }
      </div>
    </main>
  `;

  renderReviewList(sess.answers);

  if (inSession) {
    document.getElementById("hub")!.addEventListener("click", () => {
      setSession(null);
      location.hash = "#/session";
    });
  } else {
    document.getElementById("new")!.addEventListener("click", () => {
      setSession(null);
      location.hash = "#/";
    });

    const retry = document.getElementById("retry");
    if (retry) {
      retry.addEventListener("click", () => {
        const missedQs = missed.map((a) => a.q);
        setSession({
          config: {
            ...sess.config,
            count: missedQs.length,
            examMode: false,
            timeLimitSec: null,
          },
          questions: missedQs,
          index: 0,
          answers: [],
          startedAt: Date.now(),
        });
        location.hash = "#/play";
      });
    }
  }
}

function renderNextSteps(
  domainData: Record<Domain, { c: number; t: number }>,
  missedCount: number,
): string {
  const weakDomains = ([1, 2, 3] as Domain[]).filter(
    (d) => domainData[d].t > 0 && domainData[d].c / domainData[d].t < 0.7,
  );

  if (weakDomains.length === 0 && missedCount === 0) {
    return `
      <section class="stack">
        <h2>Next steps</h2>
        <p class="muted" style="font-size:14px;margin:0;">
          All domains above the pass threshold. Try the Hard or Expert preset to keep pushing.
        </p>
      </section>
    `;
  }

  if (weakDomains.length === 0) {
    return "";
  }

  return `
    <section class="stack">
      <h2>Next steps</h2>
      <div class="stack" style="gap:6px;">
        ${weakDomains
          .map((d) => {
            const v = domainData[d];
            const p = Math.round((v.c / v.t) * 100);
            return `
              <div class="row">
                <span class="badge badge-danger mono" style="min-width:42px;justify-content:center;">${p}%</span>
                <span><strong>${DOMAIN_NAMES[d]}</strong> is at ${p}% — focus here before your exam</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderReviewList(answers: AnswerRecord[]): void {
  const list = document.getElementById("review-list");
  if (!list) return;
  list.innerHTML = "";
  answers.forEach((a, idx) => {
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
              const cls = isCorrect ? "review-opt-correct" : isPicked ? "review-opt-wrong" : "";
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

  answers.forEach((a, idx) => {
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

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
    location.hash = sess?.config.demo ? "#/landing" : "#/";
    return;
  }

  if (sess.config.demo) {
    renderDemoResults(root, sess);
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
      ? { label: "Pass", cls: "chip-iris" }
      : pct >= 61
        ? { label: "Borderline", cls: "chip-warn" }
        : { label: "Needs work", cls: "chip-bad" };

  const byDomain: Record<Domain, { c: number; t: number }> = {
    1: { c: 0, t: 0 },
    2: { c: 0, t: 0 },
    3: { c: 0, t: 0 },
  };
  for (const a of sess.answers) {
    byDomain[a.q.domain].t += 1;
    if (a.correct) byDomain[a.q.domain].c += 1;
  }

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
    <main class="app-shell stack">
      <div class="eyebrow" style="margin-bottom:var(--s-1);">${inSession ? "Quiz results" : "Results"}</div>
      <header style="margin-bottom:var(--s-2);">
        <div class="row" style="align-items:flex-end;gap:14px;">
          <span class="f-display" style="font-size:88px;line-height:0.9;letter-spacing:-0.03em;">
            ${pct.toFixed(0)}<span style="font-size:32px;color:var(--paper-3);">%</span>
          </span>
          <span class="chip ${status.cls}">${status.label}</span>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:16px;margin-top:14px;font-family:var(--f-mono);font-size:12px;color:var(--paper-2);">
          <span><b style="color:var(--paper);">${correct}</b> / ${answered} correct</span>
          <span>${formatDuration(elapsed)}</span>
          <span>avg ${Math.round(avgPerQ)}s/q</span>
        </div>
      </header>

      <section class="stack">
        <h2>By domain</h2>
        <div class="stack" style="gap:14px;">
          ${([1, 2, 3] as Domain[])
            .map((d) => {
              const v = byDomain[d];
              const p = v.t ? (v.c / v.t) * 100 : 0;
              const tone = p < 40 ? "bad" : p < 70 ? "warn" : "iris";
              return `
                <div>
                  <div class="row" style="margin-bottom:6px;">
                    <span style="font-size:14px;color:var(--paper-2);">${DOMAIN_NAMES[d]}</span>
                    <span class="spacer"></span>
                    <span class="f-mono" style="font-size:12px;">${v.t ? p.toFixed(0) + "%" : "—"}</span>
                  </div>
                  <div class="progress-track" style="height:6px;">
                    <span class="progress-fill ${tone}" style="width:${p}%;"></span>
                  </div>
                  <div class="f-mono dim" style="font-size:11px;margin-top:6px;letter-spacing:0.04em;">
                    ${v.c} / ${v.t} answered
                  </div>
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
              <div style="display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line-1);">
                <span style="width:22px;height:22px;border-radius:999px;border:1px solid var(--bad);background:var(--bad-tint);color:var(--bad);font-family:var(--f-mono);font-size:10px;display:inline-flex;align-items:center;justify-content:center;">${n}</span>
                <span style="font-size:14px;">${escapeHtml(t)}</span>
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

      <div class="sticky-foot" style="flex-direction:column;">
        ${
          inSession
            ? `<button class="btn btn-iris btn-block" id="hub">Back to session hub</button>`
            : missed.length
              ? `<button class="btn btn-iris btn-block" id="retry">Retry missed (${missed.length})</button>`
              : ""
        }
        ${
          inSession
            ? ""
            : `<button class="btn btn-ghost btn-block" id="new">New session</button>`
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
                <span class="chip chip-bad mono" style="min-width:42px;justify-content:center;">${p}%</span>
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
    const ok = a.correct;
    const circleStyle = ok
      ? `border-color:var(--ok);background:var(--ok-tint);color:var(--ok);`
      : `border-color:var(--bad);background:var(--bad-tint);color:var(--bad);`;
    const circleIcon = ok
      ? `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
      : `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    row.innerHTML = `
      <summary class="row">
        <span data-review-status="${ok ? "ok" : "bad"}" style="width:22px;height:22px;border-radius:999px;border:1px solid;${circleStyle}display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;">
          ${circleIcon}
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
          <a class="btn btn-ghost" data-src-link="${idx}" target="_blank" rel="noopener noreferrer" href="#">
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

function renderDemoResults(root: HTMLElement, sess: import("../types").SessionState): void {
  const answered = sess.answers.length;
  const correct  = sess.answers.filter((a) => a.correct).length;
  const pct      = (correct / answered) * 100;
  const elapsed  = ((sess.finishedAt ?? Date.now()) - sess.startedAt) / 1000;

  const status =
    pct >= 70
      ? { label: "Pass", cls: "chip-iris" }
      : pct >= 61
        ? { label: "Borderline", cls: "chip-warn" }
        : { label: "Needs work", cls: "chip-bad" };

  const byDomain: Record<Domain, { c: number; t: number }> = {
    1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 },
  };
  for (const a of sess.answers) {
    byDomain[a.q.domain].t += 1;
    if (a.correct) byDomain[a.q.domain].c += 1;
  }

  root.innerHTML = `
    <main class="app-shell stack">
      <div class="eyebrow" style="margin-bottom:var(--s-1);">Demo results</div>
      <header style="margin-bottom:var(--s-2);">
        <div class="row" style="align-items:flex-end;gap:14px;">
          <span class="f-display" style="font-size:88px;line-height:0.9;letter-spacing:-0.03em;">
            ${pct.toFixed(0)}<span style="font-size:32px;color:var(--paper-3);">%</span>
          </span>
          <span class="chip ${status.cls}">${status.label}</span>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:16px;margin-top:14px;font-family:var(--f-mono);font-size:12px;color:var(--paper-2);">
          <span><b style="color:var(--paper);">${correct}</b> / ${answered} correct</span>
          <span>${formatDuration(elapsed)}</span>
        </div>
      </header>

      <section class="stack">
        <h2>By domain</h2>
        <div class="stack" style="gap:14px;">
          ${([1, 2, 3] as Domain[]).map((d) => {
            const v = byDomain[d];
            const p = v.t ? (v.c / v.t) * 100 : 0;
            const tone = p < 40 ? "bad" : p < 70 ? "warn" : "iris";
            return `
              <div>
                <div class="row" style="margin-bottom:6px;">
                  <span style="font-size:14px;color:var(--paper-2);">${DOMAIN_NAMES[d]}</span>
                  <span class="spacer"></span>
                  <span class="f-mono" style="font-size:12px;">${v.t ? p.toFixed(0) + "%" : "—"}</span>
                </div>
                <div class="progress-track" style="height:6px;">
                  <span class="progress-fill ${tone}" style="width:${p}%;"></span>
                </div>
                <div class="f-mono dim" style="font-size:11px;margin-top:6px;">${v.c} / ${v.t} answered</div>
              </div>`;
          }).join("")}
        </div>
      </section>

      <!-- locked review -->
      <section class="stack">
        <h2>Question review</h2>
        <div style="border:1px solid var(--line-2);border-radius:var(--r-md);overflow:hidden;">
          <!-- blurred preview rows with fade-out gradient -->
          <div style="position:relative;">
            <div style="filter:blur(4px);pointer-events:none;user-select:none;padding:12px 12px 0;" aria-hidden="true">
              ${sess.answers.slice(0, 3).map((a) => {
                const ok = a.correct;
                const cs = ok ? "border-color:var(--ok);background:var(--ok-tint);color:var(--ok);" : "border-color:var(--bad);background:var(--bad-tint);color:var(--bad);";
                const icon = ok
                  ? `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
                  : `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
                return `
                  <div class="row" style="padding:12px 14px;background:var(--ink-1);border:1px solid var(--line-1);border-radius:var(--r-md);margin-bottom:8px;gap:12px;">
                    <span style="width:22px;height:22px;border-radius:999px;border:1px solid;${cs}display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;">${icon}</span>
                    <span style="flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(truncate(a.q.question, 80))}</span>
                  </div>`;
              }).join("")}
            </div>
            <div style="position:absolute;inset:0;background:linear-gradient(to top,var(--ink-0) 30%,transparent);pointer-events:none;" aria-hidden="true"></div>
          </div>
          <!-- gate content in normal flow — always fully visible -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:var(--s-4);padding:var(--s-4) var(--s-5) var(--s-6);background:var(--ink-0);">
            <div class="eyebrow" style="text-align:center;">Create a free account to unlock</div>
            <p style="color:var(--paper-2);font-size:14px;text-align:center;margin:0;max-width:280px;">
              See every question, correct answers, and explanations — plus track your readiness over time.
            </p>
            <button class="btn btn-iris btn-lg btn-block" id="demo-signup">Create free account</button>
            <button class="btn btn-ghost btn-block" id="demo-login">Already have an account? Log in</button>
          </div>
        </div>
      </section>
    </main>
  `;

  root.querySelector<HTMLButtonElement>("#demo-signup")!
    .addEventListener("click", () => { location.hash = "#/signup"; });
  root.querySelector<HTMLButtonElement>("#demo-login")!
    .addEventListener("click", () => { location.hash = "#/login"; });
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

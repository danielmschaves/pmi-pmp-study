import { getSession, setSession } from "../session";
import { formatDuration } from "../lib/format";
import type { Domain } from "../types";

const DOMAIN_NAMES: Record<Domain, string> = {
  1: "People",
  2: "Process",
  3: "Business Env",
};

export function renderResults(root: HTMLElement): void {
  const sess = getSession();
  if (!sess || sess.answers.length === 0) {
    location.hash = "#/";
    return;
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
          <p class="muted" style="margin:0;font-size:13px;">Results</p>
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

      <div class="footer-bar" style="flex-direction:column;">
        ${
          missed.length
            ? `<button class="btn btn-primary btn-block" id="retry">Retry missed (${missed.length})</button>`
            : ""
        }
        <button class="btn btn-secondary btn-block" id="new">New session</button>
      </div>
    </main>
  `;

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
          examMode: false,      // retry is always study mode
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

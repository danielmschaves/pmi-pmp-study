import { loadBank } from "../lib/data";
import { getSeen, resetHistory, getExplanationsDefault, setExplanationsDefault } from "../state";
import {
  getActiveStudySession,
  getSessionHistory,
  startStudySession,
} from "../session";
import type { StudySession } from "../types";

export async function renderHome(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <div class="stack" style="gap:4px;flex:1;">
          <h1>PMP Study</h1>
          <p class="muted" style="margin:0;">Run a study session — quizzes and configuration live inside.</p>
        </div>
        <button class="btn btn-ghost" id="open-settings" aria-label="Settings">Settings</button>
      </header>

      <section id="stats" class="stat-strip">Loading…</section>

      <section id="session-banner"></section>

      <section class="stack" id="recent-section" hidden>
        <h2>Recent sessions</h2>
        <div class="stack" id="recent-list" style="gap:8px;"></div>
      </section>
    </main>
  `;

  document.getElementById("open-settings")!.addEventListener("click", openSettings);

  renderSessionBanner();
  renderRecent();

  const bank = await loadBank();
  const seen = getSeen();
  const total = bank.length;
  const bankIds = new Set(bank.map((q) => q.id));
  const seenCount = Object.keys(seen).filter((id) => bankIds.has(id)).length;
  const unseen = total - seenCount;
  const pct = total ? Math.round((seenCount / total) * 100) : 0;

  document.getElementById("stats")!.innerHTML = `
    <span><b>${total}</b> questions</span>
    <span><b>${unseen}</b> unseen</span>
    <span><b>${pct}%</b> covered</span>
  `;
}

function renderSessionBanner(): void {
  const el = document.getElementById("session-banner");
  if (!el) return;
  const active = getActiveStudySession();
  const history = getSessionHistory();

  if (active) {
    el.innerHTML = `
      <button class="card-button stack" id="resume-session" style="gap:6px;border-color:var(--accent);background:var(--accent-dim);">
        <div class="row">
          <strong>Resume study session</strong>
          <span class="spacer"></span>
          <span class="mono dim">${active.quizzes.length} quiz${active.quizzes.length === 1 ? "" : "zes"}</span>
        </div>
        <div class="muted" style="font-size:14px;">
          Continue where you left off or end the session to see the report.
        </div>
      </button>
    `;
    document.getElementById("resume-session")!.addEventListener("click", () => {
      location.hash = "#/session";
    });
    return;
  }

  const lastPct = (() => {
    if (!history.length) return null;
    const last = history[0];
    const answered = last.quizzes.reduce((s, q) => s + q.score.answered, 0);
    const correct = last.quizzes.reduce((s, q) => s + q.score.correct, 0);
    return answered ? Math.round((correct / answered) * 100) : null;
  })();

  el.innerHTML = `
    <button class="card-button stack" id="start-session" style="gap:6px;">
      <div class="row">
        <strong>Start a study session</strong>
        <span class="spacer"></span>
        ${lastPct != null ? `<span class="mono dim">last: ${lastPct}%</span>` : ""}
      </div>
      <div class="muted" style="font-size:14px;">
        Pick presets and filters inside the session — one panel, no extra screens.
      </div>
    </button>
  `;
  document.getElementById("start-session")!.addEventListener("click", () => {
    startStudySession();
    location.hash = "#/session";
  });
}

function renderRecent(): void {
  const section = document.getElementById("recent-section");
  const list = document.getElementById("recent-list");
  if (!section || !list) return;
  const history = getSessionHistory().slice(0, 5);
  if (!history.length) return;
  section.hidden = false;
  list.innerHTML = "";
  for (const s of history) {
    const pct = sessionPct(s);
    const when = new Date(s.endedAt ?? s.startedAt).toLocaleDateString();
    const row = document.createElement("button");
    row.className = "card-button row";
    row.innerHTML = `
      <div class="stack" style="gap:2px;flex:1;">
        <strong>${s.quizzes.length} quiz${s.quizzes.length === 1 ? "" : "zes"} · ${when}</strong>
        <span class="mono muted" style="font-size:12px;">${pct != null ? pct + "%" : "no answers"}</span>
      </div>
      <span class="mono dim">Report →</span>
    `;
    row.addEventListener("click", () => {
      location.hash = `#/session-report/${s.id}`;
    });
    list.appendChild(row);
  }
}

function sessionPct(s: StudySession): number | null {
  const answered = s.quizzes.reduce((acc, q) => acc + q.score.answered, 0);
  const correct = s.quizzes.reduce((acc, q) => acc + q.score.correct, 0);
  return answered ? Math.round((correct / answered) * 100) : null;
}

function openSettings(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  const drawer = document.createElement("div");
  drawer.className = "drawer stack";
  drawer.innerHTML = `
    <h2>Settings</h2>
    <label class="toggle">
      <input type="checkbox" id="exp-default" ${getExplanationsDefault() ? "checked" : ""} />
      <span class="track"></span>
      <span>Show explanations by default</span>
    </label>
    <div class="divider"></div>
    <button class="btn btn-danger btn-block" id="reset-progress">Reset progress</button>
    <button class="btn btn-secondary btn-block" id="close-settings">Close</button>
  `;

  const close = (): void => {
    backdrop.remove();
    drawer.remove();
  };
  backdrop.addEventListener("click", close);
  drawer.querySelector<HTMLButtonElement>("#close-settings")!.addEventListener("click", close);
  drawer.querySelector<HTMLInputElement>("#exp-default")!.addEventListener("change", (e) => {
    setExplanationsDefault((e.target as HTMLInputElement).checked);
  });
  drawer.querySelector<HTMLButtonElement>("#reset-progress")!.addEventListener("click", () => {
    if (confirm("Reset all question history? This cannot be undone.")) {
      resetHistory();
      close();
      location.reload();
    }
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
}

import { loadManifest, loadBank } from "../lib/data";
import { getSeen, resetHistory, getExplanationsDefault, setExplanationsDefault } from "../state";
import { PROFILES, sampleBalanced } from "../sampling";
import { defaultRng } from "../lib/prng";
import { setSession } from "../session";
import type { ProfileId, SessionConfig } from "../types";

const MINI_EXAM_COUNT = 15;
const MINI_EXAM_SECONDS = 15 * 60;

const PROFILE_LABELS: Record<ProfileId, { name: string; blurb: string }> = {
  practice: { name: "Practice", blurb: "Easier mix — ramp up" },
  standard: { name: "Standard", blurb: "Balanced, exam-like" },
  hard: { name: "Hard", blurb: "Deep end — expert-heavy" },
};

export async function renderHome(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <div class="stack" style="gap:4px;flex:1;">
          <h1>PMP Study</h1>
          <p class="muted" style="margin:0;">Pick an exam, set the parameters, answer questions.</p>
        </div>
        <button class="btn btn-ghost" id="open-settings" aria-label="Settings">Settings</button>
      </header>

      <section id="stats" class="stat-strip">Loading…</section>

      <button class="card-button mini-exam stack" id="mini-exam" style="gap:8px;">
        <div class="row">
          <strong>Mini Exam</strong>
          <span class="badge badge-accent">timed</span>
          <span class="spacer"></span>
          <span class="mono dim">15 Q · 15 min</span>
        </div>
        <div class="muted" style="font-size:14px;">
          Balanced like the real exam (ECO-weighted). No feedback until the end.
        </div>
      </button>

      <section class="stack">
        <h2>Dynamic exams</h2>
        <div class="stack" id="profiles"></div>
      </section>

      <section class="stack">
        <h2>Saved exams</h2>
        <div class="stack" id="static-exams"></div>
      </section>
    </main>
  `;

  document.getElementById("open-settings")!.addEventListener("click", openSettings);
  document.getElementById("mini-exam")!.addEventListener("click", () => void startMiniExam());

  const [manifest, bank] = await Promise.all([loadManifest(), loadBank()]);
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

  // Dynamic profile cards
  const profiles = document.getElementById("profiles")!;
  profiles.innerHTML = "";
  (Object.keys(PROFILES) as ProfileId[]).forEach((pid) => {
    const p = PROFILES[pid];
    const label = PROFILE_LABELS[pid];
    const btn = document.createElement("button");
    btn.className = "card-button stack";
    btn.style.gap = "6px";
    btn.innerHTML = `
      <div class="row">
        <strong>${label.name}</strong>
        <span class="spacer"></span>
        <span class="mono dim">180 questions</span>
      </div>
      <div class="muted" style="font-size:14px;">${label.blurb}</div>
      <div class="mix-bar" aria-hidden="true">
        <span class="mix-easy"   style="width:${p.easy * 100}%"></span>
        <span class="mix-medium" style="width:${p.medium * 100}%"></span>
        <span class="mix-hard"   style="width:${p.hard * 100}%"></span>
        <span class="mix-expert" style="width:${p.expert * 100}%"></span>
      </div>
    `;
    btn.addEventListener("click", () => {
      location.hash = `#/setup/${pid}`;
    });
    profiles.appendChild(btn);
  });

  // Static exam files
  const staticList = document.getElementById("static-exams")!;
  staticList.innerHTML = "";
  if (!manifest.exams.length) {
    staticList.innerHTML = `<p class="muted">No saved exams found. Run \`npm run sync-data\`.</p>`;
  } else {
    for (const ex of manifest.exams) {
      const btn = document.createElement("button");
      btn.className = "card-button row";
      btn.innerHTML = `
        <span>${prettyExamName(ex.id)}</span>
        <span class="spacer"></span>
        <span class="mono dim">${ex.count} questions</span>
      `;
      btn.addEventListener("click", () => {
        location.hash = `#/setup/${ex.id}`;
      });
      staticList.appendChild(btn);
    }
  }
}

async function startMiniExam(): Promise<void> {
  const bank = await loadBank();
  const rng = defaultRng(null);
  const questions = sampleBalanced(bank, { count: MINI_EXAM_COUNT, seen: getSeen(), rng });
  if (questions.length === 0) return;

  const cfg: SessionConfig = {
    examId: "mini",
    kind: "dynamic",
    profile: "standard",
    count: questions.length,
    domain: null,
    difficulty: null,
    showExplanation: false,
    seed: null,
    examMode: true,
    timeLimitSec: MINI_EXAM_SECONDS,
    label: "Mini Exam",
  };

  setSession({
    config: cfg,
    questions,
    index: 0,
    answers: [],
    startedAt: Date.now(),
  });
  location.hash = "#/play";
}

function prettyExamName(id: string): string {
  return id
    .replace(/^exam_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
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

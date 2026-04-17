import { endActiveStudySession, getActiveStudySession, setSession } from "../session";
import {
  DOMAIN_NAMES,
  aggregateAnswers,
  byConcept,
  byDomain,
  overallAccuracy,
  statusFromPct,
} from "../lib/analytics";
import { formatDuration } from "../lib/format";
import { loadBank, loadExam } from "../lib/data";
import { sampleBalanced, sampleQuestions, filterStaticExam } from "../sampling";
import { defaultRng } from "../lib/prng";
import { getExplanationsDefault, getSeen } from "../state";
import {
  SECTION_LABELS,
  SOURCE_LABELS,
  type Section,
  type SourceFamily,
} from "../lib/sections";
import type { Domain, ProfileId, Question, SessionConfig } from "../types";

type PresetId = "mini" | "practice" | "standard" | "hard" | "full_exam";

type Preset = {
  label: string;
  blurb: string;
  defaultCount: number;
  kind: "dynamic" | "static";
  profile?: ProfileId;
  examId: string;
  examMode: boolean;
  timeLimitSec: number | null;
  allows: { count: boolean; domain: boolean; section: boolean; source: boolean; explanations: boolean };
  forceExplanations?: boolean;
};

const PRESETS: Record<PresetId, Preset> = {
  mini: {
    label: "Mini",
    blurb: "10 questions · 15-min timer",
    defaultCount: 15,
    kind: "dynamic",
    profile: "standard",
    examId: "mini",
    examMode: true,
    timeLimitSec: 15 * 60,
    allows: { count: false, domain: true, section: true, source: true, explanations: true },
  },
  practice: {
    label: "Practice",
    blurb: "Easy–medium · explanations on",
    defaultCount: 25,
    kind: "dynamic",
    profile: "practice",
    examId: "practice",
    examMode: false,
    timeLimitSec: null,
    allows: { count: true, domain: true, section: true, source: true, explanations: true },
  },
  standard: {
    label: "Standard",
    blurb: "Mixed difficulty · ECO-weighted",
    defaultCount: 50,
    kind: "dynamic",
    profile: "standard",
    examId: "standard",
    examMode: false,
    timeLimitSec: null,
    allows: { count: true, domain: true, section: true, source: true, explanations: true },
  },
  hard: {
    label: "Hard",
    blurb: "Hard & expert questions only",
    defaultCount: 50,
    kind: "dynamic",
    profile: "hard",
    examId: "hard",
    examMode: false,
    timeLimitSec: null,
    allows: { count: true, domain: true, section: true, source: true, explanations: true },
  },
  full_exam: {
    label: "Full exam",
    blurb: "180 questions · full exam conditions",
    defaultCount: 180,
    kind: "static",
    examId: "exam_standard",
    examMode: false,
    timeLimitSec: null,
    allows: { count: false, domain: false, section: false, source: true, explanations: false },
    forceExplanations: false,
  },
};

const COUNT_CHIPS = [10, 25, 50, 90, 180];
const PRESET_ORDER: PresetId[] = ["mini", "practice", "standard", "hard", "full_exam"];

export function renderSessionHub(root: HTMLElement): void {
  const active = getActiveStudySession();
  if (!active) {
    location.hash = "#/";
    return;
  }

  const answers = aggregateAnswers(active.quizzes);
  const overall = overallAccuracy(answers);
  const status = answers.length ? statusFromPct(overall.pct) : null;
  const elapsed = (Date.now() - active.startedAt) / 1000;
  const dom = answers.length ? byDomain(answers) : null;
  const con = answers.length ? byConcept(answers) : null;
  const weakest = con && con.weak.length ? con.weak[0] : null;
  const strongest = con && con.strong.length ? con.strong[0] : null;

  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <div class="stack" style="gap:4px;flex:1;">
          <p class="muted" style="margin:0;font-size:13px;">Study session</p>
          <h1>In progress</h1>
        </div>
        <button class="btn btn-ghost" id="abandon" aria-label="Abandon session">Abandon</button>
      </header>

      <section class="stat-strip">
        <span><b>${active.quizzes.length}</b> quizzes</span>
        <span><b>${overall.answered}</b> answered</span>
        ${status ? `<span><b>${overall.pct.toFixed(0)}%</b> <span class="badge ${status.cls}" style="font-size:11px;">${status.label}</span></span>` : ""}
        <span><b>${formatDuration(elapsed)}</b> elapsed</span>
      </section>

      ${
        answers.length
          ? `<p class="muted" style="margin:0;font-size:13px;line-height:1.5;">
              ${buildResumeText(dom!, strongest, weakest)}
              <a href="#" id="preview-report" style="margin-left:6px;">Preview report →</a>
            </p>`
          : `<p class="muted" style="margin:0;font-size:13px;">No quizzes yet. Start one below to begin tracking your readiness.</p>`
      }

      <section class="stack">
        <h2>Launch a quiz</h2>
        <div class="stack" style="gap:6px;">
          <label class="muted" style="font-size:13px;">PRESET</label>
          <div class="seg" id="preset-seg"></div>
          <p class="muted" id="preset-blurb" style="margin:0;font-size:12px;"></p>
        </div>
        <div class="stack" style="gap:6px;" id="count-row">
          <label class="muted" style="font-size:13px;">QUESTIONS</label>
          <div class="row" style="gap:8px;flex-wrap:wrap;">
            <input id="count" type="number" min="1" max="500" value="15"
              style="width:90px;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);" />
            <div class="seg" id="count-chips"></div>
          </div>
        </div>
        <div class="stack" style="gap:6px;" id="domain-row">
          <label class="muted" style="font-size:13px;">DOMAIN</label>
          <div class="seg" id="domain-seg"></div>
        </div>
        <div class="stack" style="gap:6px;" id="section-row">
          <label class="muted" style="font-size:13px;">FORMAT</label>
          <div class="seg" id="section-seg"></div>
        </div>
        <div class="stack" style="gap:6px;" id="source-row">
          <label class="muted" style="font-size:13px;">SOURCE</label>
          <div class="seg" id="source-seg"></div>
        </div>
        <label class="toggle" id="exp-row">
          <input type="checkbox" id="exp" />
          <span class="track"></span>
          <span>Show explanations</span>
        </label>
        <button class="btn btn-primary btn-block" id="start-quiz">Start quiz</button>
      </section>

      <section class="stack">
        <h2>Quizzes in this session</h2>
        <div class="stack" id="quiz-list" style="gap:8px;"></div>
      </section>

      <div class="footer-bar" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" id="end" ${active.quizzes.length === 0 ? "disabled" : ""}>
          End session &amp; see report
        </button>
      </div>
    </main>
  `;

  const list = document.getElementById("quiz-list")!;
  if (active.quizzes.length === 0) {
    list.innerHTML = `<p class="muted">No quizzes completed yet — results will appear here.</p>`;
  } else {
    for (const q of active.quizzes) {
      const pct = q.score.answered ? (q.score.correct / q.score.answered) * 100 : 0;
      const row = document.createElement("div");
      row.className = "card row";
      row.innerHTML = `
        <div class="stack" style="gap:2px;flex:1;">
          <strong>${escapeHtml(prettyExamName(q.config))}</strong>
          <span class="mono muted" style="font-size:12px;">
            ${q.score.correct}/${q.score.answered} · ${pct.toFixed(0)}%
          </span>
        </div>
        <span class="badge ${statusFromPct(pct).cls}">${pct.toFixed(0)}%</span>
      `;
      list.appendChild(row);
    }
  }

  const state = {
    preset: "mini" as PresetId,
    count: PRESETS.mini.defaultCount,
    domain: null as Domain | null,
    section: null as Section,
    source: null as SourceFamily | null,
    showExplanation: getExplanationsDefault(),
  };

  const countInput = document.getElementById("count") as HTMLInputElement;
  const countRow = document.getElementById("count-row")!;
  const blurbEl = document.getElementById("preset-blurb")!;
  const expInput = document.getElementById("exp") as HTMLInputElement;
  expInput.checked = state.showExplanation;
  expInput.addEventListener("change", () => {
    state.showExplanation = expInput.checked;
  });

  const domainRow = document.getElementById("domain-row")!;
  const sectionRow = document.getElementById("section-row")!;
  const sourceRow = document.getElementById("source-row")!;
  const expRow = document.getElementById("exp-row")!;

  const lockRow = (el: HTMLElement, locked: boolean): void => {
    el.style.opacity = locked ? "0.45" : "1";
    el.style.pointerEvents = locked ? "none" : "";
  };

  const applyPreset = (): void => {
    const preset = PRESETS[state.preset];
    state.count = preset.defaultCount;
    countInput.value = String(preset.defaultCount);
    countInput.disabled = !preset.allows.count;
    lockRow(countRow, !preset.allows.count);
    blurbEl.textContent = preset.blurb;

    if (!preset.allows.domain) state.domain = null;
    if (!preset.allows.section) state.section = null;
    if (!preset.allows.source) state.source = null;
    lockRow(domainRow, !preset.allows.domain);
    lockRow(sectionRow, !preset.allows.section);
    lockRow(sourceRow, !preset.allows.source);

    if (preset.forceExplanations !== undefined) state.showExplanation = preset.forceExplanations;
    expInput.checked = state.showExplanation;
    expInput.disabled = !preset.allows.explanations;
    lockRow(expRow, !preset.allows.explanations);

    refreshSegs();
  };

  const segRefreshers: Array<() => void> = [];
  const refreshSegs = (): void => segRefreshers.forEach((fn) => fn());

  countInput.addEventListener("input", () => {
    const v = parseInt(countInput.value, 10);
    if (!Number.isNaN(v)) state.count = Math.max(1, Math.min(v, 500));
  });

  const countChips = document.getElementById("count-chips")!;
  COUNT_CHIPS.forEach((n) => {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.addEventListener("click", () => {
      if (!PRESETS[state.preset].allows.count) return;
      state.count = n;
      countInput.value = String(n);
    });
    countChips.appendChild(b);
  });

  renderSeg<PresetId>(
    "preset-seg",
    PRESET_ORDER.map((id) => ({ label: PRESETS[id].label, value: id })),
    () => state.preset,
    (v) => {
      state.preset = v;
      applyPreset();
    },
  );

  segRefreshers.push(
    renderSeg<Domain | null>(
      "domain-seg",
      [
        { label: "All", value: null },
        { label: "People", value: 1 },
        { label: "Process", value: 2 },
        { label: "Business", value: 3 },
      ],
      () => state.domain,
      (v) => {
        state.domain = v;
      },
    ),
  );

  segRefreshers.push(
    renderSeg<Section>(
      "section-seg",
      [
        { label: "All", value: null },
        { label: SECTION_LABELS.agile, value: "agile" },
        { label: SECTION_LABELS.predictive, value: "predictive" },
        { label: SECTION_LABELS.hybrid, value: "hybrid" },
      ],
      () => state.section,
      (v) => {
        state.section = v;
      },
    ),
  );

  segRefreshers.push(
    renderSeg<SourceFamily | null>(
      "source-seg",
      [
        { label: "All", value: null },
        { label: SOURCE_LABELS.studyhall, value: "studyhall" },
        { label: SOURCE_LABELS.youtube, value: "youtube" },
      ],
      () => state.source,
      (v) => {
        state.source = v;
      },
    ),
  );

  applyPreset();

  document.getElementById("start-quiz")!.addEventListener("click", () => {
    void launchQuiz(state);
  });

  const previewLink = document.getElementById("preview-report") as HTMLAnchorElement | null;
  previewLink?.addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = `#/session-report/${active.id}`;
  });

  document.getElementById("end")!.addEventListener("click", () => {
    if (active.quizzes.length === 0) return;
    endActiveStudySession();
    location.hash = `#/session-report/${active.id}`;
  });

  document.getElementById("abandon")!.addEventListener("click", () => {
    if (confirm("Abandon this session? Completed quizzes are saved, but no session report will be generated.")) {
      endActiveStudySession();
      location.hash = "#/";
    }
  });
}

type LaunchState = {
  preset: PresetId;
  count: number;
  domain: Domain | null;
  section: Section;
  source: SourceFamily | null;
  showExplanation: boolean;
};

async function launchQuiz(state: LaunchState): Promise<void> {
  const active = getActiveStudySession();
  if (!active) return;
  const preset = PRESETS[state.preset];
  const rng = defaultRng(null);
  const excludeIds = new Set(active.seenQuestionIds);
  let questions: Question[] = [];

  if (preset.kind === "static") {
    const exam = await loadExam(preset.examId);
    questions = filterStaticExam(exam, {
      count: state.count,
      domainFilter: state.domain,
      difficultyFilter: null,
      sectionFilter: state.section,
      sourceFilter: state.source,
      rng,
      excludeIds,
    });
  } else {
    const bank = await loadBank();
    if (preset.examId === "mini") {
      let pool = bank;
      if (state.domain != null) pool = pool.filter((q) => q.domain === state.domain);
      questions = sampleBalanced(pool, {
        count: state.count,
        seen: getSeen(),
        rng,
        excludeIds,
        sectionFilter: state.section,
        sourceFilter: state.source,
      });
    } else {
      questions = sampleQuestions(bank, {
        profile: preset.profile!,
        count: state.count,
        seen: getSeen(),
        rng,
        domainFilter: state.domain,
        difficultyFilter: null,
        sectionFilter: state.section,
        sourceFilter: state.source,
        excludeIds,
      });
    }
  }

  if (questions.length === 0) {
    alert("No unseen questions match these filters. Try widening them or end the session.");
    return;
  }

  const labelBits = [
    preset.label,
    state.section ? SECTION_LABELS[state.section] : null,
    state.source ? SOURCE_LABELS[state.source] : null,
    state.domain != null ? ["People", "Process", "Business"][state.domain - 1] : null,
  ].filter(Boolean) as string[];

  const cfg: SessionConfig = {
    examId: preset.examId,
    kind: preset.kind,
    profile: preset.profile,
    count: questions.length,
    domain: state.domain,
    difficulty: null,
    showExplanation: state.showExplanation,
    seed: null,
    examMode: preset.examMode,
    timeLimitSec: preset.timeLimitSec,
    label: labelBits.join(" · "),
  };

  setSession({
    config: cfg,
    questions,
    index: 0,
    answers: [],
    startedAt: Date.now(),
    studySessionId: active.id,
  });
  location.hash = "#/play";
}

function prettyExamName(cfg: { examId: string; label?: string; count: number }): string {
  if (cfg.label) return `${cfg.label} · ${cfg.count} Q`;
  const name = cfg.examId
    .replace(/^exam_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return `${name} · ${cfg.count} Q`;
}

type DomBreakdown = ReturnType<typeof byDomain>;
type ConceptItem = { concept: string; tally: { correct: number; total: number }; pct: number };

function buildResumeText(
  dom: DomBreakdown,
  strongest: ConceptItem | null,
  weakest: ConceptItem | null,
): string {
  const domBits = ([1, 2, 3] as const)
    .filter((d) => dom[d].total > 0)
    .map((d) => `${DOMAIN_NAMES[d]} ${dom[d].pct.toFixed(0)}%`)
    .join(" · ");
  const parts: string[] = [];
  if (domBits) parts.push(`By domain: ${domBits}.`);
  if (strongest) parts.push(`Strongest <b>${escapeHtml(strongest.concept)}</b> (${strongest.pct.toFixed(0)}%).`);
  if (weakest) parts.push(`Focus on <b>${escapeHtml(weakest.concept)}</b> (${weakest.pct.toFixed(0)}%).`);
  return parts.join(" ");
}

function renderSeg<T>(
  id: string,
  items: { label: string; value: T }[],
  get: () => T,
  set: (v: T) => void,
): () => void {
  const el = document.getElementById(id);
  if (!el) return () => {};
  el.innerHTML = "";
  const update = (): void => {
    Array.from(el.children).forEach((c, i) => {
      (c as HTMLElement).setAttribute("aria-pressed", items[i].value === get() ? "true" : "false");
    });
  };
  items.forEach((it) => {
    const b = document.createElement("button");
    b.textContent = it.label;
    b.addEventListener("click", () => {
      set(it.value);
      update();
    });
    el.appendChild(b);
  });
  update();
  return update;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

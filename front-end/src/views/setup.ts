import { loadBank, loadExam, loadManifest } from "../lib/data";
import { getExplanationsDefault, getSeen } from "../state";
import { PROFILES, FULL_EXAM_SIZE, sampleQuestions, filterStaticExam } from "../sampling";
import { defaultRng } from "../lib/prng";
import { getActiveStudySession, setSession } from "../session";
import {
  SECTION_LABELS,
  SOURCE_LABELS,
  type Section,
  type SourceFamily,
} from "../lib/sections";
import type { Difficulty, Domain, ProfileId, SessionConfig } from "../types";

const PROFILE_IDS = new Set<string>(Object.keys(PROFILES));

export async function renderSetup(root: HTMLElement, examId: string): Promise<void> {
  const isDynamic = PROFILE_IDS.has(examId);
  const manifest = await loadManifest();
  const staticMeta = manifest.exams.find((e) => e.id === examId);
  const maxCount = isDynamic ? (staticMeta?.count ?? FULL_EXAM_SIZE) : (staticMeta?.count ?? 50);
  const defaultCount = isDynamic ? FULL_EXAM_SIZE : (staticMeta?.count ?? 25);

  const activeStudySession = getActiveStudySession();
  const inSession = activeStudySession !== null;
  const quizNum = activeStudySession ? activeStudySession.quizzes.length + 1 : null;

  // URL params let upstream views (session-hub) prefill format/source/domain
  const urlParams = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const sectionFromUrl = parseSectionParam(urlParams.get("format"));
  const sourceFromUrl = parseSourceParam(urlParams.get("source"));
  const domainFromUrl = parseDomainParam(urlParams.get("domain"));

  const state = {
    count: Math.min(defaultCount, isDynamic ? 500 : maxCount),
    domain: domainFromUrl,
    difficulty: null as Difficulty | null,
    showExplanation: getExplanationsDefault(),
    section: sectionFromUrl,
    source: sourceFromUrl,
  };

  const baseTitle = isDynamic
    ? `${examId[0].toUpperCase()}${examId.slice(1)} session`
    : prettyExamName(examId);
  const title = inSession ? `Session quiz ${quizNum} · ${baseTitle}` : baseTitle;

  root.innerHTML = `
    <main class="app stack">
      <header class="row">
        <button class="btn btn-ghost" id="back">← Back</button>
        <span class="spacer"></span>
      </header>
      <h1>${title}</h1>
      <p class="muted" style="margin:0;">${isDynamic ? "Samples fresh questions from the full bank, unseen first." : "Fixed question set."}</p>

      <section class="stack">
        <label class="muted" style="font-size:13px;">QUESTIONS</label>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <input id="count" type="number" min="1" max="${isDynamic ? 500 : maxCount}" value="${state.count}"
            style="width:90px;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);" />
          <div class="seg" id="count-chips"></div>
        </div>
      </section>

      <section class="stack">
        <label class="muted" style="font-size:13px;">DOMAIN</label>
        <div class="seg" id="dom-seg"></div>
      </section>

      <section class="stack">
        <label class="muted" style="font-size:13px;">DIFFICULTY</label>
        <div class="seg" id="diff-seg"></div>
      </section>

      <section class="stack">
        <label class="muted" style="font-size:13px;">FORMAT</label>
        <div class="seg" id="section-seg"></div>
      </section>

      <section class="stack">
        <label class="muted" style="font-size:13px;">SOURCE</label>
        <div class="seg" id="source-seg"></div>
      </section>

      <section>
        <label class="toggle">
          <input type="checkbox" id="exp" ${state.showExplanation ? "checked" : ""} />
          <span class="track"></span>
          <span>Show explanations</span>
        </label>
      </section>

      <p id="eco-note" class="muted" style="font-size:13px;"></p>

      <div class="footer-bar">
        <button class="btn btn-primary btn-block" id="start">Start session</button>
      </div>
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", () => {
    location.hash = inSession ? "#/session" : "#/";
  });

  const countInput = document.getElementById("count") as HTMLInputElement;
  countInput.addEventListener("input", () => {
    const v = parseInt(countInput.value, 10);
    if (!Number.isNaN(v)) state.count = Math.max(1, Math.min(v, isDynamic ? 500 : maxCount));
    updateEcoNote();
  });

  const chips = [10, 25, 50, 90, 180].filter((n) => n <= (isDynamic ? 500 : maxCount));
  const countChips = document.getElementById("count-chips")!;
  chips.forEach((n) => {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.addEventListener("click", () => {
      state.count = n;
      countInput.value = String(n);
      updateEcoNote();
    });
    countChips.appendChild(b);
  });

  renderSeg(
    "dom-seg",
    [
      { label: "All", value: null },
      { label: "People", value: 1 },
      { label: "Process", value: 2 },
      { label: "Business", value: 3 },
    ],
    () => state.domain,
    (v) => {
      state.domain = v as Domain | null;
      updateEcoNote();
    },
  );

  renderSeg(
    "diff-seg",
    [
      { label: "All", value: null },
      { label: "Easy", value: "easy" },
      { label: "Medium", value: "medium" },
      { label: "Hard", value: "hard" },
      { label: "Expert", value: "expert" },
    ],
    () => state.difficulty,
    (v) => {
      state.difficulty = v as Difficulty | null;
      updateEcoNote();
    },
  );

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
  );

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
  );

  (document.getElementById("exp") as HTMLInputElement).addEventListener("change", (e) => {
    state.showExplanation = (e.target as HTMLInputElement).checked;
  });

  document.getElementById("start")!.addEventListener("click", () => void startSession());

  function updateEcoNote(): void {
    const note = document.getElementById("eco-note")!;
    if (isDynamic && state.count >= 50 && state.domain == null && state.difficulty == null) {
      note.textContent = "ECO-weighted sampling will apply (People 42% · Process 50% · Business 8%).";
    } else {
      note.textContent = "";
    }
  }
  updateEcoNote();

  async function startSession(): Promise<void> {
    const hashParams = new URLSearchParams(location.hash.split("?")[1] ?? "");
    const qsParams = new URLSearchParams(location.search);
    const seedParam = hashParams.get("seed") ?? qsParams.get("seed");
    const seed = seedParam != null && seedParam !== "" ? Number(seedParam) : null;
    const rng = defaultRng(seed);

    const cfg: SessionConfig = {
      examId,
      kind: isDynamic ? "dynamic" : "static",
      profile: isDynamic ? (examId as ProfileId) : undefined,
      count: state.count,
      domain: state.domain,
      difficulty: state.difficulty,
      showExplanation: state.showExplanation,
      seed,
      examMode: false,
      timeLimitSec: null,
    };

    const excludeIds = activeStudySession
      ? new Set(activeStudySession.seenQuestionIds)
      : undefined;

    let questions;
    if (isDynamic) {
      const bank = await loadBank();
      questions = sampleQuestions(bank, {
        profile: cfg.profile!,
        count: cfg.count,
        seen: getSeen(),
        rng,
        domainFilter: cfg.domain,
        difficultyFilter: cfg.difficulty,
        sectionFilter: state.section,
        sourceFilter: state.source,
        excludeIds,
      });
    } else {
      const exam = await loadExam(examId);
      questions = filterStaticExam(exam, {
        count: cfg.count,
        domainFilter: cfg.domain,
        difficultyFilter: cfg.difficulty,
        sectionFilter: state.section,
        sourceFilter: state.source,
        rng,
        excludeIds,
      });
    }

    if (questions.length === 0) {
      alert(
        activeStudySession
          ? "No new questions match — all of them have been shown in this session already."
          : "No questions match your filters.",
      );
      return;
    }

    setSession({
      config: cfg,
      questions,
      index: 0,
      answers: [],
      startedAt: Date.now(),
      studySessionId: activeStudySession?.id,
    });

    location.hash = "#/play";
  }
}

function renderSeg<T>(
  id: string,
  items: { label: string; value: T }[],
  get: () => T,
  set: (v: T) => void,
): void {
  const el = document.getElementById(id)!;
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
}

function prettyExamName(id: string): string {
  return id
    .replace(/^exam_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseSectionParam(v: string | null): Section {
  if (v === "agile" || v === "predictive" || v === "hybrid") return v;
  return null;
}

function parseSourceParam(v: string | null): SourceFamily | null {
  if (v === "studyhall" || v === "youtube") return v;
  return null;
}

function parseDomainParam(v: string | null): Domain | null {
  if (v === "1" || v === "2" || v === "3") return Number(v) as Domain;
  return null;
}

import type { QuizAttempt, SessionState, StudySession } from "./types";
import { read, remove, uuid, write } from "./lib/storage";
import { supabase } from "./supabase";
import { pushStudySession } from "./sync";

// ─── In-memory per-quiz session (used by play.ts) ───────────────────────────
// Ephemeral. Each quiz renders from this object. Completed quizzes get
// promoted into the active StudySession (below) on finish.

let current: SessionState | null = null;

export function setSession(s: SessionState | null): void {
  current = s;
}

export function getSession(): SessionState | null {
  return current;
}

// ─── Study session (multi-quiz container, persisted to localStorage) ─────────

const ACTIVE_KEY = "pmp.studySession.active";
const HISTORY_KEY = "pmp.studySession.history";
const HISTORY_CAP = 50;

export function getActiveStudySession(): StudySession | null {
  return read<StudySession | null>(ACTIVE_KEY, null);
}

export function setActiveStudySession(s: StudySession | null): void {
  if (s === null) remove(ACTIVE_KEY);
  else write(ACTIVE_KEY, s);
}

export function startStudySession(): StudySession {
  const s: StudySession = {
    id: uuid(),
    startedAt: Date.now(),
    endedAt: null,
    quizzes: [],
    seenQuestionIds: [],
  };
  setActiveStudySession(s);
  return s;
}

/**
 * Build a QuizAttempt snapshot from an in-memory SessionState and persist it
 * onto the active study session.
 */
export function appendFinishedQuiz(sessionState: SessionState): QuizAttempt | null {
  const active = getActiveStudySession();
  if (!active) return null;

  const answered = sessionState.answers.length;
  const correct = sessionState.answers.filter((a) => a.correct).length;
  const attempt: QuizAttempt = {
    id: uuid(),
    config: sessionState.config,
    questions: sessionState.questions,
    answers: sessionState.answers,
    startedAt: sessionState.startedAt,
    finishedAt: sessionState.finishedAt ?? Date.now(),
    score: { correct, answered, total: sessionState.questions.length },
  };

  // Union seen question ids (use questions[], not just answered, so a
  // not-reached question from a previous quiz is still excluded).
  const seen = new Set(active.seenQuestionIds);
  for (const q of sessionState.questions) seen.add(q.id);

  active.quizzes.push(attempt);
  active.seenQuestionIds = Array.from(seen);
  setActiveStudySession(active);
  return attempt;
}

export function endActiveStudySession(): StudySession | null {
  const active = getActiveStudySession();
  if (!active) return null;
  active.endedAt = Date.now();

  const history = read<StudySession[]>(HISTORY_KEY, []);
  history.unshift(active);
  if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
  write(HISTORY_KEY, history);

  remove(ACTIVE_KEY);

  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      void pushStudySession(data.session.user.id, active);
    }
  });

  return active;
}

export function getSessionHistory(): StudySession[] {
  return read<StudySession[]>(HISTORY_KEY, []);
}

export function getHistoricalSession(id: string): StudySession | null {
  return getSessionHistory().find((s) => s.id === id) ?? null;
}

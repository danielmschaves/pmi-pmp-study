import { supabase } from "./supabase";
import { read, write } from "./lib/storage";
import type { StudySession, QuizAttempt } from "./types";

const SEEN_KEY = "pmp.v1";
const HISTORY_KEY = "pmp.studySession.history";
const HISTORY_CAP = 50;

type Persisted = {
  seen: Record<string, string>;
  explanationsByDefault: boolean;
};

// ── Pure merge helpers (tested independently) ─────────────────────────────────

export function mergeSeenRecords(
  local: Record<string, string>,
  remote: Array<{ question_id: string; seen_at: string }>,
): Record<string, string> {
  const merged = { ...local };
  for (const { question_id, seen_at } of remote) {
    if (!merged[question_id] || seen_at < merged[question_id]) {
      merged[question_id] = seen_at;
    }
  }
  return merged;
}

export function mergeSessionHistories(
  local: StudySession[],
  remote: StudySession[],
): StudySession[] {
  const localIds = new Set(local.map((s) => s.id));
  return [...local, ...remote.filter((s) => !localIds.has(s.id))]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, HISTORY_CAP);
}

// ── Remote pull + local merge ─────────────────────────────────────────────────

export async function pullAndMerge(userId: string): Promise<void> {
  await Promise.all([
    syncProgress(userId),
    syncPreferences(userId),
    syncSessions(userId),
  ]);
}

async function syncProgress(userId: string): Promise<void> {
  const { data } = await supabase
    .from("user_progress")
    .select("question_id, seen_at")
    .eq("user_id", userId);

  if (!data || data.length === 0) return;

  const persisted = readPersisted();
  persisted.seen = mergeSeenRecords(persisted.seen, data);
  writePersisted(persisted);
}

async function syncPreferences(userId: string): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();

  if (!data?.preferences) return;
  if (typeof data.preferences.explanationsByDefault !== "boolean") return;

  const persisted = readPersisted();
  persisted.explanationsByDefault = data.preferences.explanationsByDefault;
  writePersisted(persisted);
}

async function syncSessions(userId: string): Promise<void> {
  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(HISTORY_CAP);

  if (!sessions || sessions.length === 0) return;

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("*")
    .in(
      "session_id",
      sessions.map((s: { id: string }) => s.id),
    );

  const remoteSessions: StudySession[] = sessions.map(
    (s: { id: string; started_at: string; ended_at: string | null }) => ({
      id: s.id,
      startedAt: new Date(s.started_at).getTime(),
      endedAt: s.ended_at ? new Date(s.ended_at).getTime() : null,
      quizzes: buildAttempts(s.id, attempts ?? []),
      seenQuestionIds: (attempts ?? [])
        .filter((a: { session_id: string }) => a.session_id === s.id)
        .flatMap((a: { question_ids: string[] }) => a.question_ids),
    }),
  );

  const local = read<StudySession[]>(HISTORY_KEY, []);
  write(HISTORY_KEY, mergeSessionHistories(local, remoteSessions));
}

function buildAttempts(sessionId: string, rows: Record<string, unknown>[]): QuizAttempt[] {
  return rows
    .filter((r) => r["session_id"] === sessionId)
    .map((r) => ({
      id: r["id"] as string,
      config: r["config"] as QuizAttempt["config"],
      questions: (r["question_ids"] as string[]).map((id) => ({
        id,
        question: "",
        options: [],
        answer: "A" as const,
        explanation: "",
        difficulty: "medium" as const,
        topic: "",
        domain: 1 as const,
        source_id: "",
        chunk_index: 0,
        video_segment: "",
      })),
      answers: r["answers"] as QuizAttempt["answers"],
      startedAt: new Date(r["started_at"] as string).getTime(),
      finishedAt: new Date(r["finished_at"] as string).getTime(),
      score: {
        correct: r["score_correct"] as number,
        answered: r["score_answered"] as number,
        total: r["score_total"] as number,
      },
    }));
}

// ── Fire-and-forget push helpers ──────────────────────────────────────────────

export async function pushProgress(
  userId: string,
  questionId: string,
  seenAt: string,
): Promise<void> {
  try {
    await supabase
      .from("user_progress")
      .upsert(
        { user_id: userId, question_id: questionId, seen_at: seenAt },
        { onConflict: "user_id,question_id" },
      );
  } catch {
    // intentionally silent — caller does not await this
  }
}

export async function pushStudySession(
  userId: string,
  session: StudySession,
): Promise<void> {
  try {
    await supabase.from("study_sessions").upsert({
      id: session.id,
      user_id: userId,
      started_at: new Date(session.startedAt).toISOString(),
      ended_at: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    });

    if (session.quizzes.length === 0) return;

    await supabase.from("quiz_attempts").upsert(
      session.quizzes.map((q) => ({
        id: q.id,
        user_id: userId,
        session_id: session.id,
        config: q.config,
        question_ids: q.questions.map((qu) => qu.id),
        answers: q.answers.map((a) => ({ picked: a.picked, correct: a.correct, ms: a.ms })),
        score_correct: q.score.correct,
        score_answered: q.score.answered,
        score_total: q.score.total,
        started_at: new Date(q.startedAt).toISOString(),
        finished_at: new Date(q.finishedAt).toISOString(),
      })),
    );
  } catch {
    // intentionally silent — caller does not await this
  }
}

export async function pushPreferences(
  userId: string,
  prefs: { explanationsByDefault: boolean },
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ preferences: prefs, updated_at: new Date().toISOString() })
      .eq("id", userId);
  } catch {
    // intentionally silent — caller does not await this
  }
}

export async function deleteProgress(userId: string): Promise<void> {
  try {
    await supabase.from("user_progress").delete().eq("user_id", userId);
  } catch {
    // intentionally silent — caller does not await this
  }
}

// ── localStorage helpers (shared key with state.ts) ───────────────────────────

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return { seen: {}, explanationsByDefault: true };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      seen: p.seen ?? {},
      explanationsByDefault: p.explanationsByDefault ?? true,
    };
  } catch {
    return { seen: {}, explanationsByDefault: true };
  }
}

function writePersisted(p: Persisted): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(p));
  } catch {
    // ignore quota errors
  }
}

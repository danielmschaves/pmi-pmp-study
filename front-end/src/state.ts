import { supabase } from "./supabase";
import { deleteProgress, pushPreferences, pushProgress } from "./sync";

const KEY = "pmp.v1";

type Persisted = {
  seen: Record<string, string>;
  explanationsByDefault: boolean;
};

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { seen: {}, explanationsByDefault: true };
    const parsed = JSON.parse(raw);
    return {
      seen: parsed.seen ?? {},
      explanationsByDefault: parsed.explanationsByDefault ?? true,
    };
  } catch {
    return { seen: {}, explanationsByDefault: true };
  }
}

function write(p: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota errors */
  }
}

export function getSeen(): Record<string, string> {
  return read().seen;
}

export function markSeen(id: string): void {
  const p = read();
  p.seen[id] = new Date().toISOString();
  write(p);
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      void pushProgress(data.session.user.id, id, p.seen[id]);
    }
  });
}

export function resetHistory(): void {
  const p = read();
  p.seen = {};
  write(p);
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      void deleteProgress(data.session.user.id);
    }
  });
}

export function getExplanationsDefault(): boolean {
  return read().explanationsByDefault;
}

export function setExplanationsDefault(v: boolean): void {
  const p = read();
  p.explanationsByDefault = v;
  write(p);
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      void pushPreferences(data.session.user.id, { explanationsByDefault: v });
    }
  });
}

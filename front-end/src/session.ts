import type { SessionState } from "./types";

// Ephemeral in-memory session, shared between views. Not persisted.
let current: SessionState | null = null;

export function setSession(s: SessionState | null): void {
  current = s;
}

export function getSession(): SessionState | null {
  return current;
}

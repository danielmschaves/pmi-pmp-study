import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

export type { Session };

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (s: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return data.subscription;
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

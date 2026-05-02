import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co") as string;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key") as string;

export const supabase = createClient(url, key);

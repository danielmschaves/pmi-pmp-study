import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(): Record<string, string> {
  // Prefer process.env (set by Docker / CI), fall back to .env file for local runs
  const fromProcess = {
    VITE_SUPABASE_URL: process.env["VITE_SUPABASE_URL"] ?? "",
    VITE_SUPABASE_ANON_KEY: process.env["VITE_SUPABASE_ANON_KEY"] ?? "",
  };
  if (fromProcess.VITE_SUPABASE_URL) return fromProcess;

  const env: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#\s][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env missing — suite will be skipped
  }
  return env;
}

const env = loadEnv();
const hasCredentials =
  !!env["VITE_SUPABASE_URL"] &&
  !env["VITE_SUPABASE_URL"].includes("placeholder") &&
  !env["VITE_SUPABASE_URL"].includes("your-project") &&
  !!env["VITE_SUPABASE_ANON_KEY"] &&
  !env["VITE_SUPABASE_ANON_KEY"].includes("your-anon-key");

// Skip the whole suite when credentials aren't configured — avoids failures
// in environments that haven't wired up .env yet.
describe.skipIf(!hasCredentials)("Supabase connection (integration)", () => {
  it("env file has non-placeholder values", () => {
    const url = env["VITE_SUPABASE_URL"] ?? "";
    const key = env["VITE_SUPABASE_ANON_KEY"] ?? "";

    expect(url, "VITE_SUPABASE_URL is missing or empty").toBeTruthy();
    expect(key, "VITE_SUPABASE_ANON_KEY is missing or empty").toBeTruthy();
    expect(url, "VITE_SUPABASE_URL still has placeholder value").not.toContain("your-project");
    expect(url, "VITE_SUPABASE_URL still has placeholder value").not.toContain("placeholder");
    expect(key, "VITE_SUPABASE_ANON_KEY still has placeholder value").not.toContain("your-anon-key");
  });

  it("can reach the Supabase project over the network", async () => {
    const url = env["VITE_SUPABASE_URL"];
    const key = env["VITE_SUPABASE_ANON_KEY"];

    // Probe the health endpoint — read-only, creates no DB state.
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
    }).catch((e: Error) => {
      throw new Error(`Network error — check VITE_SUPABASE_URL: ${e.message}`);
    });

    expect(res.ok, `Supabase health endpoint returned ${res.status}`).toBe(true);
  }, 15000);
});

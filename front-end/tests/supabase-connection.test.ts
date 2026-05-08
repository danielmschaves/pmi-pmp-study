import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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
    // .env missing — tests will fail with a clear message below
  }
  return env;
}

describe("Supabase connection (integration)", () => {
  it("env file has non-placeholder values", () => {
    const env = loadEnv();
    const url = env["VITE_SUPABASE_URL"] ?? "";
    const key = env["VITE_SUPABASE_ANON_KEY"] ?? "";

    expect(url, "VITE_SUPABASE_URL is missing or empty").toBeTruthy();
    expect(key, "VITE_SUPABASE_ANON_KEY is missing or empty").toBeTruthy();
    expect(url, "VITE_SUPABASE_URL still has placeholder value").not.toContain("your-project");
    expect(url, "VITE_SUPABASE_URL still has placeholder value").not.toContain("placeholder");
    expect(key, "VITE_SUPABASE_ANON_KEY still has placeholder value").not.toContain("your-anon-key");
  });

  it("can reach the Supabase project over the network", async () => {
    const env = loadEnv();
    const url = env["VITE_SUPABASE_URL"];
    const key = env["VITE_SUPABASE_ANON_KEY"];

    if (!url || !key) {
      throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set in front-end/.env");
    }

    const client = createClient(url, key);
    const testEmail = `ci+${Date.now()}@pmp-test.invalid`;

    let error: { message: string } | null = null;
    try {
      const res = await client.auth.signUp({ email: testEmail, password: "test-password-123!" });
      error = res.error;
    } catch (e: unknown) {
      throw new Error(`Network error — check VITE_SUPABASE_URL: ${(e as Error).message}`);
    }

    // Any Supabase-level error (e.g. "email domain not allowed") means we reached the server.
    // Only fail if the error looks like a DNS / connectivity failure.
    if (error) {
      expect(
        error.message,
        `Supabase returned a network-level error — check VITE_SUPABASE_URL`,
      ).not.toMatch(/fetch|failed to fetch|ERR_NAME_NOT_RESOLVED|ENOTFOUND/i);
    }
  }, 15000);
});

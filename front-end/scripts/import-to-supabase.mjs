/**
 * One-time (and re-runnable) import of question bank + exam sets into Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/002_questions.sql against your Supabase project.
 *   2. Add SUPABASE_SERVICE_ROLE_KEY to front-end/.env.local (never commit this key).
 *   3. VITE_SUPABASE_URL must also be set in .env.local or .env.
 *
 * Usage:
 *   cd front-end
 *   node scripts/import-to-supabase.mjs
 *
 * Re-run after the Python pipeline produces new questions.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── env loading (minimal, no dotenv dep needed) ──────────────────────────────
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  const env = {};
  for (const file of envFiles) {
    const p = join(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── source resolution (Docker mount or local paths) ──────────────────────────
const DOCKER_SRC = "/app/data-src";
const isDocker = existsSync(DOCKER_SRC);

const bankPath = isDocker
  ? join(DOCKER_SRC, "processed", "question_bank.json")
  : (() => {
      // prefer already-generated public/data copy, fall back to pipeline output
      const pub = join(root, "public", "data", "question_bank.json");
      const raw = resolve(root, "..", "data", "processed", "question_bank.json");
      return existsSync(pub) ? pub : raw;
    })();

const quizzesDir = isDocker
  ? join(DOCKER_SRC, "quizzes")
  : resolve(root, "..", "study", "quizzes");

// ── helpers ───────────────────────────────────────────────────────────────────
async function upsertBatch(table, rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert error: ${error.message}`);
    console.log(`  ${table}: upserted rows ${i + 1}–${Math.min(i + chunkSize, rows.length)}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Questions
  if (!existsSync(bankPath)) {
    console.error(`question_bank.json not found at ${bankPath}`);
    process.exit(1);
  }
  const questions = JSON.parse(readFileSync(bankPath, "utf-8"));
  console.log(`Importing ${questions.length} questions...`);
  await upsertBatch("questions", questions);

  // 2. Exams
  if (!existsSync(quizzesDir)) {
    console.warn(`Quizzes dir not found at ${quizzesDir} — skipping exams`);
    return;
  }
  const examFiles = readdirSync(quizzesDir).filter(
    (f) => f.startsWith("exam_") && f.endsWith(".json")
  );
  console.log(`Importing ${examFiles.length} exam sets...`);
  for (const file of examFiles) {
    const examId = file.replace(/\.json$/, "");
    const examQuestions = JSON.parse(
      readFileSync(join(quizzesDir, file), "utf-8")
    );
    const row = { id: examId, question_ids: examQuestions.map((q) => q.id) };
    const { error } = await supabase
      .from("exams")
      .upsert(row, { onConflict: "id" });
    if (error) throw new Error(`exams upsert error (${examId}): ${error.message}`);
    console.log(`  exam: ${examId} (${row.question_ids.length} questions)`);
  }

  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Copies the Python-produced question bank + exam files into front-end/public/data
// and emits a manifest. Runs before `vite dev` and `vite build`.
//
// Works both locally (reads from ../data, ../study) and inside Docker
// (reads from /app/data-src, mounted read-only in docker-compose.yml).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Resolve source locations. Docker mount wins if present.
const DOCKER_SRC = "/app/data-src";
const isDocker = existsSync(DOCKER_SRC);

const bankSrc = isDocker
  ? join(DOCKER_SRC, "processed", "question_bank.json")
  : resolve(root, "..", "data", "processed", "question_bank.json");

const quizzesSrc = isDocker
  ? join(DOCKER_SRC, "quizzes")
  : resolve(root, "..", "study", "quizzes");

const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

const manifest = { generatedAt: new Date().toISOString(), bank: null, exams: [] };

// Bank
if (existsSync(bankSrc)) {
  const dest = join(outDir, "question_bank.json");
  cpSync(bankSrc, dest);
  const bank = JSON.parse(readFileSync(bankSrc, "utf-8"));
  manifest.bank = { path: "/data/question_bank.json", count: bank.length };
  console.log(`[sync-data] bank -> ${dest} (${bank.length} questions)`);
} else {
  console.warn(`[sync-data] bank not found at ${bankSrc}`);
}

// Static exams
if (existsSync(quizzesSrc)) {
  for (const file of readdirSync(quizzesSrc)) {
    if (!file.startsWith("exam_") || !file.endsWith(".json")) continue;
    const src = join(quizzesSrc, file);
    const dest = join(outDir, file);
    cpSync(src, dest);
    const questions = JSON.parse(readFileSync(src, "utf-8"));
    manifest.exams.push({
      id: file.replace(/\.json$/, ""),
      path: `/data/${file}`,
      count: questions.length,
    });
    console.log(`[sync-data] ${file} (${questions.length} questions)`);
  }
} else {
  console.warn(`[sync-data] quizzes dir not found at ${quizzesSrc}`);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(manifest, null, 2));
console.log(`[sync-data] wrote manifest with ${manifest.exams.length} exams`);

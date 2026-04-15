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

const sourcesSrc = isDocker
  ? join(DOCKER_SRC, "sources.yml")
  : resolve(root, "..", "ingestion", "sources.yml");

const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  bank: null,
  exams: [],
  sources: null,
};

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

// Sources — parse ingestion/sources.yml and emit sources.json (id, type, url, topic)
if (existsSync(sourcesSrc)) {
  const sources = parseSourcesYaml(readFileSync(sourcesSrc, "utf-8"));
  const dest = join(outDir, "sources.json");
  writeFileSync(dest, JSON.stringify(sources, null, 2));
  manifest.sources = { path: "/data/sources.json", count: sources.length };
  console.log(`[sync-data] sources -> ${dest} (${sources.length} sources)`);
} else {
  console.warn(`[sync-data] sources.yml not found at ${sourcesSrc}`);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(manifest, null, 2));
console.log(`[sync-data] wrote manifest with ${manifest.exams.length} exams`);

// Minimal parser for the flat sources.yml structure:
//   sources:
//   - id: yt_001
//     type: youtube
//     url: https://...
//     topic: ...
// We only need id, type, url, topic for the frontend.
function parseSourcesYaml(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inList = false;
  let cur = null;
  const flush = () => {
    if (cur && cur.id) out.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line || line.trimStart().startsWith("#")) continue;
    if (/^sources\s*:/.test(line)) { inList = true; continue; }
    if (!inList) continue;
    const listItem = line.match(/^-\s+(.*)$/);
    if (listItem) {
      flush();
      cur = {};
      const rest = listItem[1];
      const kv = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (kv) cur[kv[1]] = cleanValue(kv[2]);
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (kv) cur[kv[1]] = cleanValue(kv[2]);
  }
  flush();
  return out
    .filter((s) => s.id && s.type && s.url)
    .map((s) => ({ id: s.id, type: s.type, url: s.url, topic: s.topic ?? "" }));
}

function cleanValue(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

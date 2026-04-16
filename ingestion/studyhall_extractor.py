"""
studyhall_extractor.py

Ingest PMI practice-exam pastes into the standard question pipeline.

Pipeline position: (manual paste) → [studyhall_extractor] → qa_formatter → quiz_builder

Inputs:  data/raw/<source_id>_paste.txt  (plain-text copy-paste from the exam report page)
Outputs: data/processed/<source_id>_qa.json         (questions in the canonical schema)
         data/processed/<source_id>_skipped.json    (multi-select and malformed blocks for review)

sources.yml entry:
  - id: sh_001
    type: studyhall
    path: data/raw/sh_001_paste.txt
    domain: null           # always null — inferred per question
    topic: PMI Practice Exam — Mini-Exam 1 (Agile)
    exam_section: Agile    # optional; prepended to each question's topic
    mode: studyhall
    status: pending

Cost model:
  - Deterministic parser extracts stem/options/answer/explanation (0 API calls).
  - A single Claude Haiku call per batch of CLASSIFY_BATCH_SIZE questions classifies
    domain + difficulty + topic (tiny input, tiny output, prompt-cached system prompt).

Usage:
  python ingestion/studyhall_extractor.py                 # all pending studyhall sources
  python ingestion/studyhall_extractor.py --source sh_001
  python ingestion/studyhall_extractor.py --parse-only    # parse + emit skipped.json, no API
  python ingestion/studyhall_extractor.py --dry-run       # show parse plan, no writes
"""

import argparse
import json
import re
import time
from pathlib import Path

import anthropic
import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.parent
SOURCES_FILE = ROOT / "ingestion" / "sources.yml"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "claude-haiku-4-5-20251001"
CLASSIFY_BATCH_SIZE = 25
RETRY_LIMIT = 3
INTER_BATCH_DELAY = 1.0

# ─── Parser ──────────────────────────────────────────────────────────────────

SOLUTION_RE = re.compile(r"^Solution:\s*(.+?)\s*$")
OPTION_RE = re.compile(r"^([A-E])\.(.*)$")
TRAILER_MARKER = "This question and rationale were developed in reference to:"


def _is_trailer_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if s.startswith(TRAILER_MARKER):
        return True
    if s.startswith("http://") or s.startswith("https://"):
        return True
    if s.startswith("|"):
        return True
    if s.startswith("[") and "Item" in s:
        return True
    # Bibliography lines that appear in the trailer block but don't start with "|":
    # e.g. "PMBOK Guide Seventh Edition (2022) /// [2.4.7 CHANGES]"
    if s.startswith("PMBOK"):
        return True
    # e.g. "Agile Practice Guide (2017) PMI/PMI/4.2.1.1/ [Item ...]"
    if "[Item" in s:
        return True
    return False


def _extract_answer_letters(solution_body: str) -> list[str]:
    """From the text after 'Solution:' capture the leading answer letter(s).
    Handles 'B. restated text', 'B', 'A, C, and E'."""
    m = re.match(r"^([A-E](?:\s*,\s*(?:and\s+)?[A-E])*)", solution_body.strip())
    if not m:
        return []
    letters = re.findall(r"[A-E]", m.group(1))
    seen: set[str] = set()
    return [l for l in letters if not (l in seen or seen.add(l))]


def _find_options_above(lines: list[str], end_idx: int, floor_idx: int) -> tuple[list[str], int]:
    """Walk backward from end_idx collecting consecutive option lines (A-E).
    Returns (options_in_ABCD_order, first_option_line_index).
    If no options found, returns ([], end_idx + 1)."""
    j = end_idx
    while j >= floor_idx and lines[j].strip() == "":
        j -= 1
    opts: list[str] = []
    first = end_idx + 1
    while j >= floor_idx:
        m = OPTION_RE.match(lines[j].strip())
        if not m:
            break
        opts.insert(0, lines[j].strip())
        first = j
        j -= 1
        while j >= floor_idx and lines[j].strip() == "":
            j -= 1
    return opts, first


_CONTEXT_EXCLUSION_PHRASES = (
    "incorrect",
    "correct answer",
    "the other option",
    "the other answer",
    "the distractor",
    "distractors",
    "not the best",
    "best strategy",
    "best approach",
    "is essential",
    "is vital",
    "is crucial",
    "will need",
    "should have",
    "is not enough",
    "the correct",
    "this is",
    "are correctly written",
)


def _looks_like_context(text: str) -> bool:
    """Heuristic to decide whether a paragraph above the question-mark paragraph
    is scenario context (include in stem) vs. explanation of the prior question (exclude)."""
    if not text:
        return False
    # Sentence-count proxy: >3 sentence boundaries → likely explanation prose, not scenario context.
    # Study Hall contexts are typically 1–3 sentences; explanations are usually 4+.
    sentence_boundaries = len(re.findall(r"[.!?]\s+[A-Z(]", text + " A"))
    if sentence_boundaries > 3:
        return False
    lower = text.lower()
    if any(p in lower for p in _CONTEXT_EXCLUSION_PHRASES):
        return False
    return True


def _find_next_stem_start(lines: list[str], floor: int, opt_start: int) -> int:
    """Find the line index where the next question's stem begins, searching
    backward from its options. Trailer lines short-circuit (everything after the
    trailer is the next stem)."""
    k = opt_start - 1
    while k >= floor and lines[k].strip() == "":
        k -= 1
    if k < floor:
        return opt_start

    # Paragraph 1 (must contain the question mark in typical Study Hall format).
    p1_start = k + 1
    while k >= floor:
        s = lines[k].strip()
        if s == "":
            break
        if _is_trailer_line(lines[k]) or OPTION_RE.match(s) or SOLUTION_RE.match(s):
            return p1_start
        p1_start = k
        k -= 1

    # Walk past blank separator.
    while k >= floor and lines[k].strip() == "":
        k -= 1
    if k < floor:
        return p1_start

    # Paragraph 2 (optional scenario-context paragraph).
    p2_end = k + 1
    p2_start = k + 1
    while k >= floor:
        s = lines[k].strip()
        if s == "":
            break
        if _is_trailer_line(lines[k]) or OPTION_RE.match(s) or SOLUTION_RE.match(s):
            return p1_start
        p2_start = k
        k -= 1

    cand = " ".join(lines[i].strip() for i in range(p2_start, p2_end) if lines[i].strip())
    if _looks_like_context(cand):
        return p2_start
    return p1_start


def _collect_stem(lines: list[str], start: int, end: int) -> str:
    parts: list[str] = []
    for k in range(start, end):
        s = lines[k].strip()
        if not s:
            continue
        if _is_trailer_line(lines[k]):
            continue
        parts.append(s)
    return " ".join(parts).strip()


def _collect_explanation(lines: list[str], start: int, end: int) -> str:
    out: list[str] = []
    in_trailer = False
    for k in range(start, end):
        line = lines[k]
        s = line.strip()
        if s.startswith(TRAILER_MARKER):
            in_trailer = True
            continue
        if in_trailer:
            # Skip URL / citation / bibliography lines inside the trailer block.
            continue
        out.append(s)
    text = "\n".join(out).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def _preprocess_lines(text: str) -> str:
    """Repair a Study Hall paste quirk where an option letter sits alone on a line
    (e.g. 'C.') and its text is on the following non-blank line. Merges them back
    into 'C.<text>' so the main parser sees a single option line."""
    raw = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(raw):
        line = raw[i]
        m = re.match(r"^([A-E])\.\s*$", line.rstrip())
        if m:
            j = i + 1
            while j < len(raw) and raw[j].strip() == "":
                j += 1
            if j < len(raw):
                nxt = raw[j].strip()
                if nxt and not OPTION_RE.match(nxt) and not SOLUTION_RE.match(nxt):
                    out.append(f"{m.group(1)}.{nxt}")
                    i = j + 1
                    continue
        out.append(line)
        i += 1
    return "\n".join(out)


def parse_paste(text: str) -> list[dict]:
    text = _preprocess_lines(text)
    lines = text.splitlines()
    solution_idxs = [i for i, l in enumerate(lines) if SOLUTION_RE.match(l.strip())]
    if not solution_idxs:
        return []

    blocks: list[dict] = []
    cursor = 0  # advances to the start of the NEXT block's stem as we go
    for idx, si in enumerate(solution_idxs):
        options, opt_start = _find_options_above(lines, si - 1, cursor)
        stem = _collect_stem(lines, cursor, opt_start)

        if idx + 1 < len(solution_idxs):
            next_si = solution_idxs[idx + 1]
            _next_opts, next_opt_start = _find_options_above(lines, next_si - 1, si + 1)
            expl_end = _find_next_stem_start(lines, si + 1, next_opt_start)
        else:
            expl_end = len(lines)

        explanation = _collect_explanation(lines, si + 1, expl_end)
        cursor = expl_end

        sol_match = SOLUTION_RE.match(lines[si].strip())
        answer_letters = _extract_answer_letters(sol_match.group(1) if sol_match else "")

        has_min_structure = bool(stem) and len(options) >= 4 and bool(answer_letters)
        if not has_min_structure:
            status = "malformed"
        elif len(answer_letters) > 1:
            status = "multi_answer"
        else:
            status = "ok"

        blocks.append({
            "status": status,
            "solution_line": si + 1,  # 1-indexed for logging
            "stem": stem,
            "options": options,
            "answer_letters": answer_letters,
            "explanation": explanation,
        })

    return blocks


# ─── Option normalization ────────────────────────────────────────────────────


def _normalize_options(options: list[str]) -> list[str] | None:
    """Take A-E raw option lines (without space after the dot) and return exactly
    4 strings in the canonical 'X. text' form (A-D). Returns None if we can't
    produce 4 canonical options (e.g. multi-select with 5 options)."""
    if len(options) < 4:
        return None
    canonical: list[str] = []
    for label in ("A", "B", "C", "D"):
        match = next((o for o in options if o.startswith(f"{label}.")), None)
        if not match:
            return None
        text = match[2:].strip()
        canonical.append(f"{label}. {text}")
    return canonical


# ─── Claude classification ───────────────────────────────────────────────────

CLASSIFY_SYSTEM_PROMPT = """\
You classify PMP exam questions on three axes:

1. domain — ECO 2021:
    1 = People (leadership, teams, stakeholders, conflict, motivation, emotional intelligence)
    2 = Process (schedule, risk, budget, quality, agile/scrum, procurement, EVM, scope, WBS)
    3 = Business Environment (benefits realization, compliance, org change, strategy, OKRs)

2. difficulty:
    easy   — concept recall or a single-step decision
    medium — application in a straightforward scenario
    hard   — analysis in a scenario with competing options or partial information
    expert — synthesis across multiple PM knowledge areas; involves ambiguity or trade-offs

3. topic — a short, specific PM sub-topic string (e.g. "Risk Response Planning",
    "Conflict Resolution", "Agile Transformation", "Resource Management").

You will receive a JSON array of objects {"index": int, "question": "..."}.
Return ONLY a JSON array of objects {"index": int, "domain": int, "difficulty": str, "topic": str},
one per input, in the same order. No markdown, no prose."""


def _parse_json_array(text: str) -> list[dict] | None:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text.strip())
    try:
        data = json.loads(text)
        return data if isinstance(data, list) else None
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
        return None


def classify_batch(client: anthropic.Anthropic, questions: list[str]) -> list[dict]:
    """Send one batch of question stems to Claude for domain/difficulty/topic classification.
    Returns a list aligned to input order. On failure, returns fallback entries."""
    payload = json.dumps(
        [{"index": i, "question": q} for i, q in enumerate(questions)],
        ensure_ascii=False,
    )
    user_prompt = f"Classify these {len(questions)} questions:\n\n{payload}"

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=2048,
                system=[{
                    "type": "text",
                    "text": CLASSIFY_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = response.content[0].text
            parsed = _parse_json_array(raw)
            if parsed is None:
                print(f"      attempt {attempt}: JSON parse failed, retrying...")
                continue

            by_index = {int(item["index"]): item for item in parsed if "index" in item}
            result: list[dict] = []
            for i in range(len(questions)):
                item = by_index.get(i, {})
                result.append({
                    "domain": int(item.get("domain", 2)) if item.get("domain") in (1, 2, 3) else 2,
                    "difficulty": item.get("difficulty") if item.get("difficulty") in {"easy", "medium", "hard", "expert"} else "medium",
                    "topic": str(item.get("topic", "")).strip() or "General PMP",
                })
            return result

        except anthropic.APIError as e:
            print(f"      attempt {attempt}: API error — {e}")
            time.sleep(2 ** attempt)

    print(f"      classification failed after {RETRY_LIMIT} attempts — using fallback defaults")
    return [{"domain": 2, "difficulty": "medium", "topic": "General PMP"} for _ in questions]


# ─── Per-source processing ───────────────────────────────────────────────────


def process_source(source: dict, client: anthropic.Anthropic | None, dry_run: bool, parse_only: bool) -> int:
    source_id = source["id"]
    paste_path = ROOT / source["path"]
    topic_prefix = source.get("topic", "PMI Practice Exam")
    exam_section = source.get("exam_section")

    if not paste_path.exists():
        print(f"[{source_id}] ERROR: paste file not found at {paste_path}")
        return 0

    text = paste_path.read_text(encoding="utf-8")
    blocks = parse_paste(text)
    if not blocks:
        print(f"[{source_id}] No 'Solution:' lines found — is this file a PMI practice exam paste?")
        return 0

    ok_blocks = [b for b in blocks if b["status"] == "ok"]
    multi = [b for b in blocks if b["status"] == "multi_answer"]
    malformed = [b for b in blocks if b["status"] == "malformed"]

    print(
        f"[{source_id}] Parsed {len(blocks)} blocks | "
        f"{len(ok_blocks)} usable | {len(multi)} multi-answer skipped | "
        f"{len(malformed)} malformed"
    )

    skipped_path = PROCESSED_DIR / f"{source_id}_skipped.json"
    if multi or malformed:
        skipped_path.write_text(
            json.dumps(multi + malformed, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"  → {len(multi + malformed)} skipped blocks logged to {skipped_path.name}")

    if dry_run:
        for b in ok_blocks[:3]:
            preview = b["stem"][:80] + ("..." if len(b["stem"]) > 80 else "")
            print(f"    line {b['solution_line']}: [{b['answer_letters'][0]}] {preview}")
        if len(ok_blocks) > 3:
            print(f"    ... ({len(ok_blocks) - 3} more)")
        return 0

    if parse_only:
        # Emit the raw parsed blocks for inspection but don't call the API.
        raw_path = PROCESSED_DIR / f"{source_id}_parsed.json"
        raw_path.write_text(
            json.dumps(ok_blocks, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"  → parsed blocks written to {raw_path.name} (no API calls made)")
        return 0

    # Normalize options (guarantees A-D canonical set for the formatter).
    prepared: list[tuple[dict, list[str]]] = []
    dropped_opts = 0
    for b in ok_blocks:
        canonical = _normalize_options(b["options"])
        if canonical is None:
            dropped_opts += 1
            continue
        prepared.append((b, canonical))
    if dropped_opts:
        print(f"  warning: {dropped_opts} blocks dropped because options did not map to A-D")

    # Batch classify with Claude.
    questions = [b["stem"] for b, _ in prepared]
    metadata: list[dict] = []
    for start in range(0, len(questions), CLASSIFY_BATCH_SIZE):
        batch = questions[start:start + CLASSIFY_BATCH_SIZE]
        print(
            f"  classifying batch {start // CLASSIFY_BATCH_SIZE + 1} "
            f"({len(batch)} questions)...",
            end=" ",
            flush=True,
        )
        meta = classify_batch(client, batch)
        metadata.extend(meta)
        print("done")
        if start + CLASSIFY_BATCH_SIZE < len(questions):
            time.sleep(INTER_BATCH_DELAY)

    # Assemble final questions in the canonical schema.
    forced_domain = source.get("domain")  # if set (1/2/3), override Claude's inference
    out: list[dict] = []
    for i, ((block, options), meta) in enumerate(zip(prepared, metadata)):
        base_topic = meta["topic"]
        full_topic = f"{exam_section} / {base_topic}" if exam_section else base_topic
        out.append({
            "question": block["stem"],
            "options": options,
            "answer": block["answer_letters"][0],
            "explanation": block["explanation"],
            "difficulty": meta["difficulty"],
            "topic": full_topic,
            "domain": int(forced_domain) if forced_domain in (1, 2, 3) else meta["domain"],
            "source_id": source_id,
            "chunk_index": 0,
            "video_segment": f"{topic_prefix} (paste line {block['solution_line']})",
        })

    out_path = PROCESSED_DIR / f"{source_id}_qa.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[{source_id}] Done — {len(out)} questions → {out_path.name}")
    return len(out)


# ─── Entry point ─────────────────────────────────────────────────────────────


def _save_sources(data: dict) -> None:
    SOURCES_FILE.write_text(yaml.dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def run(source_filter: str | None, dry_run: bool, parse_only: bool, force: bool) -> None:
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    sources = data.get("sources") or []

    targets = [
        s for s in sources
        if s.get("type") == "studyhall"
        and (source_filter is None or s["id"] == source_filter)
        and (force or s.get("status", "pending") == "pending")
    ]

    if not targets:
        print("No eligible studyhall sources found.")
        return

    if dry_run:
        print("DRY RUN — parsing only, no writes, no API calls.\n")

    client = anthropic.Anthropic() if (not dry_run and not parse_only) else None
    total = 0
    for source in targets:
        count = process_source(source, client, dry_run=dry_run, parse_only=parse_only)
        total += count
        if count > 0 and not dry_run and not parse_only:
            source["status"] = "processed"

    if not dry_run and not parse_only and total > 0:
        _save_sources(data)
        print(f"\nTotal questions extracted this run: {total}")
        print("Next: run ingestion/qa_formatter.py to rebuild question_bank.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest PMI practice exam pastes.")
    parser.add_argument("--source", default=None, help="Process only this source ID")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print a preview, no writes")
    parser.add_argument("--parse-only", action="store_true", help="Parse and write parsed.json but skip API classification")
    parser.add_argument("--force", action="store_true", help="Reprocess sources already marked 'processed'")
    parser.add_argument("--model", default=None, help="Override model (e.g. claude-sonnet-4-6)")
    args = parser.parse_args()

    if args.model:
        MODEL = args.model

    run(args.source, dry_run=args.dry_run, parse_only=args.parse_only, force=args.force)

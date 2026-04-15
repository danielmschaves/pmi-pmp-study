"""
qa_extractor.py

Two extraction modes:

  generate (default)
    Sends lecture/content transcript chunks to Claude and asks it to WRITE
    new PMP exam-style questions based on the material.

  extract
    Used for videos that already CONTAIN spoken Q&A (e.g. practice exam
    recordings). Parses and structures the questions that exist in the
    transcript rather than generating new ones.

Pipeline position: youtube_extractor → [qa_extractor] → qa_formatter

Inputs:  data/raw/<source_id>_segments.json
Outputs: data/processed/<source_id>/chunk_NNN.json  (per-chunk checkpoint)
         data/processed/<source_id>_qa.json          (merged questions)

Usage:
  python ingestion/qa_extractor.py                   # all pending sources
  python ingestion/qa_extractor.py --source yt_001   # one source
  python ingestion/qa_extractor.py --dry-run         # show plan, no API calls
  python ingestion/qa_extractor.py --force           # reprocess done sources
  python ingestion/qa_extractor.py --model claude-sonnet-4-6
"""

import json
import re
import time
import yaml
import argparse
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.parent
SOURCES_FILE = ROOT / "ingestion" / "sources.yml"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# --- Defaults (overridable per source or via CLI) ---
MODEL = "claude-haiku-4-5-20251001"
CHUNK_MINUTES_GENERATE = 10   # content videos: shorter = more focused questions
CHUNK_MINUTES_EXTRACT = 15    # Q&A videos: wider window avoids splitting a question
QUESTIONS_PER_CHUNK = 10      # generate mode only
RETRY_LIMIT = 3
INTER_CHUNK_DELAY = 1.5

DOMAIN_NAMES = {
    1: "People — leadership, teams, stakeholders, conflict resolution, emotional intelligence",
    2: "Process — schedules, risk, budget, quality, agile, procurement, EVM",
    3: "Business Environment — benefits realization, compliance, org change, strategic alignment",
}

# ─── System prompts (cached by Claude API) ──────────────────────────────────

GENERATE_SYSTEM_PROMPT = """\
You are an expert PMI PMP exam question writer following the ECO 2021 standard.

Rules:
- Write situational, scenario-based questions that test practical judgment, not just recall
- 4 answer choices labeled A, B, C, D
- One clearly best answer; three plausible distractors
- Difficulty levels:
    easy   — concept recall or a single-step decision
    medium — application in a straightforward scenario
    hard   — analysis in a scenario with competing options or partial information
    expert — synthesis across multiple PM knowledge areas; involves ambiguity or trade-offs
- Explanation must state WHY the correct answer is best AND why the main distractor is wrong
- Do NOT reference the transcript directly; write standalone exam questions

Return ONLY a valid JSON array — no markdown fences, no extra text."""

EXTRACT_SYSTEM_PROMPT = """\
You are a PMP exam question parser. The transcript you receive is from a practice exam video \
that contains spoken multiple-choice questions with answer choices and explanations.

Your job:
1. Identify every complete question in the segment (question stem + 4 choices + correct answer)
2. Reconstruct each question in clean written form:
   - Remove spoken artifacts: filler words ("um", "uh", "okay so"), false starts, repetitions
   - Fix punctuation and capitalisation
   - Preserve the exact meaning, scenario details, and wording — do NOT rewrite or simplify
3. Detect which PMP domain the question belongs to:
     1 = People (leadership, teams, stakeholders, conflict, motivation, emotional intelligence)
     2 = Process (schedule, risk, budget, quality, agile/scrum, procurement, EVM, scope, WBS)
     3 = Business Environment (benefits realization, compliance, org change, strategy, OKRs)
4. Mark difficulty as instructed by the caller

SKIP entirely (return nothing for these):
- Channel/video introductions and outros
- Exam strategy or study-tip segments ("in this video we will cover...", "tip number 3...")
- Sponsor segments or channel promotions
- Transition commentary between questions ("great question, let's move on...")
- Any segment where a complete question with 4 choices is not present

Answer detection — the correct answer is usually announced with phrases like:
  "the answer is B", "correct answer is C", "the best answer here is A",
  "so D is correct", "you should have chosen B"
If the answer is not stated explicitly, infer it from the explanation.

Boundary rule: if a question starts near the end of the segment and the choices or answer \
are cut off, skip it — it will be captured in the next chunk.

Return ONLY a valid JSON array — no markdown fences, no extra text. \
Return [] if this segment contains no complete questions."""


# ─── Prompt builders ────────────────────────────────────────────────────────

def _build_generate_prompt(chunk: dict, domain: int, topic: str) -> str:
    easy, medium, hard, expert = (3, 4, 2, 1)
    domain_desc = DOMAIN_NAMES.get(domain, "General Project Management")
    return f"""\
Domain: {domain_desc}
Topic: {topic}
Video segment: {chunk['start_label']} → {chunk['end_label']}

Difficulty mix:
  {easy} easy | {medium} medium | {hard} hard | {expert} expert

Transcript:
{chunk['text']}

Return a JSON array of exactly {QUESTIONS_PER_CHUNK} questions:
[
  {{
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "A",
    "explanation": "...",
    "difficulty": "easy|medium|hard|expert",
    "topic": "specific sub-topic string",
    "domain": {domain}
  }}
]"""


def _build_extract_prompt(chunk: dict, topic: str, difficulty_override: str) -> str:
    return f"""\
Video: {topic}
Segment: {chunk['start_label']} → {chunk['end_label']}
Assign difficulty "{difficulty_override}" to every question you extract.

Common patterns to look for in this transcript:
- Question markers: "question [number]", "number [N]", "question number [N]"
- Choice markers: "A.", "B.", "C.", "D." (or "option A", "choice B")
- Answer reveals: "the answer is", "correct answer is", "best answer is", "so [letter] is correct"
- Explanations follow the answer reveal

Transcript:
{chunk['text']}

Extract ALL complete questions present. Return a JSON array ([] if this segment has no questions):
[
  {{
    "question": "Full clean question stem as a standalone written sentence",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "B",
    "explanation": "Why the correct answer is right, and why the main distractor is wrong.",
    "difficulty": "{difficulty_override}",
    "topic": "specific PM sub-topic (e.g. Risk Response Planning, Conflict Resolution)",
    "domain": 1
  }}
]"""


# ─── Response parsing & validation ──────────────────────────────────────────

def _parse_json_response(text: str) -> list[dict] | None:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text.strip())
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    return None


def _validate_question(q: dict) -> bool:
    for field in ("question", "options", "answer", "explanation", "difficulty", "topic", "domain"):
        if field not in q:
            return False
    if not isinstance(q["options"], list) or len(q["options"]) != 4:
        return False
    if str(q["answer"]).strip().upper() not in {"A", "B", "C", "D"}:
        return False
    if q["difficulty"] not in {"easy", "medium", "hard", "expert"}:
        return False
    if int(q.get("domain", 0)) not in {1, 2, 3}:
        return False
    return True


# ─── API call ────────────────────────────────────────────────────────────────

def _call_api(
    client: anthropic.Anthropic,
    system_prompt: str,
    user_prompt: str,
    chunk_index: int,
    mode: str,
) -> list[dict]:
    # extract mode may return more questions — give it more room
    max_tokens = 8192 if mode == "extract" else 4096

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=[
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = response.content[0].text
            questions = _parse_json_response(raw)

            if questions is None:
                print(f"      attempt {attempt}: JSON parse failed, retrying...")
                continue

            valid = [q for q in questions if _validate_question(q)]
            dropped = len(questions) - len(valid)
            if dropped:
                print(f"      attempt {attempt}: {dropped} malformed question(s) dropped")

            if valid or mode == "extract":
                # For extract mode, an empty list is valid (chunk had no questions)
                return valid

        except anthropic.APIError as e:
            print(f"      attempt {attempt}: API error — {e}")
            time.sleep(2 ** attempt)

    print(f"      all {RETRY_LIMIT} attempts failed for chunk {chunk_index}")
    return []


# ─── Core processing ─────────────────────────────────────────────────────────

def partition_segments(segments: list[dict], chunk_minutes: int) -> list[dict]:
    """Split timestamped transcript segments into time-based chunks."""
    if not segments:
        return []

    threshold = chunk_minutes * 60
    chunks: list[dict] = []
    current_segs: list[dict] = []
    chunk_start = segments[0]["start"]

    for seg in segments:
        current_segs.append(seg)
        if seg["start"] - chunk_start >= threshold:
            end_time = seg["start"] + seg.get("duration", 0)
            text = " ".join(s["text"].strip() for s in current_segs if s["text"].strip())
            chunks.append({
                "chunk_index": len(chunks),
                "start_time": chunk_start,
                "end_time": end_time,
                "start_label": _fmt(chunk_start),
                "end_label": _fmt(end_time),
                "text": text,
                "char_count": len(text),
            })
            chunk_start = end_time
            current_segs = []

    if current_segs:
        end_time = current_segs[-1]["start"] + current_segs[-1].get("duration", 0)
        text = " ".join(s["text"].strip() for s in current_segs if s["text"].strip())
        chunks.append({
            "chunk_index": len(chunks),
            "start_time": chunk_start,
            "end_time": end_time,
            "start_label": _fmt(chunk_start),
            "end_label": _fmt(end_time),
            "text": text,
            "char_count": len(text),
        })

    return chunks


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def process_source(source: dict, client: anthropic.Anthropic, dry_run: bool = False) -> int:
    source_id = source["id"]
    mode = source.get("mode", "generate")
    domain = source.get("domain")         # may be None for mixed-domain extract sources
    topic = source.get("topic", "General Project Management")
    difficulty_override = source.get("difficulty_override", "expert")
    chunk_minutes = source.get("chunk_minutes") or (
        CHUNK_MINUTES_EXTRACT if mode == "extract" else CHUNK_MINUTES_GENERATE
    )

    segments_path = RAW_DIR / f"{source_id}_segments.json"
    if not segments_path.exists():
        print(f"[{source_id}] ERROR: segments file not found — run youtube_extractor.py first.")
        return 0

    segments = json.loads(segments_path.read_text(encoding="utf-8"))
    chunks = partition_segments(segments, chunk_minutes)
    duration = _fmt(segments[-1]["start"] + segments[-1].get("duration", 0)) if segments else "?"

    mode_label = f"mode={mode}" + (f" difficulty={difficulty_override}" if mode == "extract" else "")
    q_estimate = "all found" if mode == "extract" else f"~{len(chunks) * QUESTIONS_PER_CHUNK}"
    print(f"[{source_id}] {duration} | {len(chunks)} chunks ({chunk_minutes}min) | {q_estimate} questions | {mode_label}")

    if dry_run:
        for c in chunks:
            print(f"  chunk {c['chunk_index']:03d}: {c['start_label']} → {c['end_label']} ({c['char_count']:,} chars)")
        return 0

    checkpoint_dir = PROCESSED_DIR / source_id
    checkpoint_dir.mkdir(exist_ok=True)
    all_questions: list[dict] = []

    system_prompt = EXTRACT_SYSTEM_PROMPT if mode == "extract" else GENERATE_SYSTEM_PROMPT

    for chunk in chunks:
        chunk_file = checkpoint_dir / f"chunk_{chunk['chunk_index']:03d}.json"

        if chunk_file.exists():
            cached = json.loads(chunk_file.read_text(encoding="utf-8"))
            n = len(cached["questions"])
            if n or mode == "extract":
                print(f"  chunk {chunk['chunk_index']:03d}: {chunk['start_label']}→{chunk['end_label']} — {n}q (checkpoint)")
                all_questions.extend(cached["questions"])
                continue

        print(f"  chunk {chunk['chunk_index']:03d}: {chunk['start_label']}→{chunk['end_label']} ({chunk['char_count']:,} chars) ...", end=" ", flush=True)

        if mode == "extract":
            user_prompt = _build_extract_prompt(chunk, topic, difficulty_override)
        else:
            user_prompt = _build_generate_prompt(chunk, domain or 1, topic)

        questions = _call_api(client, system_prompt, user_prompt, chunk["chunk_index"], mode)
        print(f"{len(questions)}q")

        # Stamp with source metadata
        for q in questions:
            q["source_id"] = source_id
            q["chunk_index"] = chunk["chunk_index"]
            q["video_segment"] = f"{chunk['start_label']}→{chunk['end_label']}"
            # For generate mode with explicit domain, override whatever Claude put
            if mode == "generate" and domain is not None:
                q["domain"] = domain

        chunk_data = {
            "source_id": source_id,
            "chunk_index": chunk["chunk_index"],
            "start_label": chunk["start_label"],
            "end_label": chunk["end_label"],
            "mode": mode,
            "questions": questions,
        }
        chunk_file.write_text(json.dumps(chunk_data, indent=2, ensure_ascii=False), encoding="utf-8")
        all_questions.extend(questions)
        time.sleep(INTER_CHUNK_DELAY)

    merged_path = PROCESSED_DIR / f"{source_id}_qa.json"
    merged_path.write_text(json.dumps(all_questions, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[{source_id}] Done — {len(all_questions)} questions → {merged_path.name}")
    return len(all_questions)


# ─── Entry point ─────────────────────────────────────────────────────────────

def run(source_filter=None, filter_domain=None, dry_run=False, force=False):
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    sources = data.get("sources") or []

    targets = [
        s for s in sources
        if s["type"] in ("youtube", "youtube_playlist")
        and (source_filter is None or s["id"] == source_filter)
        and (filter_domain is None or s.get("domain") == filter_domain)
        and (force or s.get("status") == "processed")
    ]

    if not targets:
        print("No eligible sources found. Run youtube_extractor.py first.")
        return

    if dry_run:
        print("DRY RUN — no API calls will be made.\n")

    client = anthropic.Anthropic() if not dry_run else None
    total = 0
    for source in targets:
        total += process_source(source, client, dry_run=dry_run)

    if not dry_run:
        print(f"\nTotal questions extracted this run: {total}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=None, help="Process only this source ID")
    parser.add_argument("--domain", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Process sources even if not yet downloaded")
    parser.add_argument("--model", default=None, help="Override model (e.g. claude-sonnet-4-6)")
    parser.add_argument("--chunk-minutes", type=int, default=None, help="Override chunk window")
    parser.add_argument("--questions", type=int, default=None, help="Override questions per chunk (generate mode only)")
    args = parser.parse_args()

    if args.model:
        MODEL = args.model
    if args.chunk_minutes:
        CHUNK_MINUTES_GENERATE = args.chunk_minutes
        CHUNK_MINUTES_EXTRACT = args.chunk_minutes
    if args.questions:
        QUESTIONS_PER_CHUNK = args.questions

    run(source_filter=args.source, filter_domain=args.domain, dry_run=args.dry_run, force=args.force)

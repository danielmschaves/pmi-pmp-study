"""
qa_formatter.py

Validates, normalizes, and deduplicates all extracted questions,
then builds the master question_bank.json.

Pipeline position: qa_extractor → [qa_formatter] → quiz_builder

Input:  data/processed/*_qa.json
Output: data/processed/question_bank.json

Usage:
  python ingestion/qa_formatter.py          # merge all sources
  python ingestion/qa_formatter.py --stats  # print bank statistics only
"""

import json
import hashlib
import argparse
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"

VALID_DIFFICULTIES = {"easy", "medium", "hard", "expert"}
VALID_ANSWERS = {"A", "B", "C", "D"}
DOMAIN_NAMES = {1: "People", 2: "Process", 3: "Business Environment"}


def _question_fingerprint(q: dict) -> str:
    """SHA-1 of the first 120 chars of the question text (case-insensitive)."""
    normalized = q["question"].strip().lower()[:120]
    return hashlib.sha1(normalized.encode()).hexdigest()


def normalize(q: dict, source_id: str, index: int) -> dict | None:
    """
    Validate and normalize one question dict.
    Returns None if the question is unrecoverable.
    """
    # Required fields
    for field in ("question", "options", "answer", "explanation", "difficulty"):
        if field not in q:
            return None

    # Options: must be a 4-item list
    opts = q["options"]
    if not isinstance(opts, list) or len(opts) != 4:
        return None

    # Ensure options start with "A. ", "B. ", etc.
    fixed_opts = []
    for i, label in enumerate(["A", "B", "C", "D"]):
        opt = str(opts[i]).strip()
        if not opt.startswith(f"{label}.") and not opt.startswith(f"{label})"):
            opt = f"{label}. {opt}"
        else:
            # Normalize separator to ". "
            opt = f"{label}. {opt[2:].strip()}"
        fixed_opts.append(opt)

    # Answer must be A-D (uppercase)
    answer = str(q["answer"]).strip().upper()
    if answer not in VALID_ANSWERS:
        return None

    # Difficulty must be one of the four levels
    difficulty = str(q.get("difficulty", "medium")).strip().lower()
    if difficulty not in VALID_DIFFICULTIES:
        difficulty = "medium"

    domain = int(q.get("domain", 1))
    chunk_index = int(q.get("chunk_index", 0))
    seq = f"{chunk_index:03d}_{index:02d}"

    return {
        "id": f"{source_id}_{seq}",
        "question": q["question"].strip(),
        "options": fixed_opts,
        "answer": answer,
        "explanation": q["explanation"].strip(),
        "difficulty": difficulty,
        "topic": str(q.get("topic", "")).strip(),
        "domain": domain,
        "source_id": source_id,
        "chunk_index": chunk_index,
        "video_segment": q.get("video_segment", ""),
    }


def load_source_file(path: Path) -> tuple[str, list[dict]]:
    """Load a *_qa.json file. Returns (source_id, raw question list)."""
    source_id = path.stem.replace("_qa", "")
    questions = json.loads(path.read_text(encoding="utf-8"))
    return source_id, questions


def build_bank(force: bool = False) -> list[dict]:
    """
    Load all *_qa.json files, normalize, deduplicate, and return final bank.
    """
    qa_files = sorted(PROCESSED_DIR.glob("*_qa.json"))
    # Exclude question_bank.json itself
    qa_files = [f for f in qa_files if f.name != "question_bank.json"]

    if not qa_files:
        print("No *_qa.json files found. Run qa_extractor.py first.")
        return []

    bank: list[dict] = []
    seen_fingerprints: set[str] = set()
    stats = defaultdict(int)

    for path in qa_files:
        source_id, raw_questions = load_source_file(path)
        accepted = dropped_invalid = dropped_dupe = 0

        for i, q in enumerate(raw_questions):
            normalized = normalize(q, source_id, i)
            if normalized is None:
                dropped_invalid += 1
                continue

            fp = _question_fingerprint(normalized)
            if fp in seen_fingerprints:
                dropped_dupe += 1
                continue

            seen_fingerprints.add(fp)
            bank.append(normalized)
            accepted += 1
            stats[f"domain_{normalized['domain']}"] += 1
            stats[normalized["difficulty"]] += 1

        print(
            f"  {source_id}: {accepted} accepted | "
            f"{dropped_invalid} invalid | {dropped_dupe} duplicates"
        )

    return bank


def print_stats(bank: list[dict]):
    total = len(bank)
    if total == 0:
        print("Bank is empty.")
        return

    print(f"\n{'='*50}")
    print(f"Question Bank — {total} total questions")
    print(f"{'='*50}")

    print("\nBy domain:")
    for d in [1, 2, 3]:
        count = sum(1 for q in bank if q["domain"] == d)
        pct = count / total * 100
        weight = {1: 42, 2: 50, 3: 8}[d]
        bar = "█" * int(pct / 2)
        print(f"  Domain {d} ({DOMAIN_NAMES[d]:20s}): {count:4d} ({pct:5.1f}%) {bar}  [ECO target: {weight}%]")

    print("\nBy difficulty:")
    for diff in ["easy", "medium", "hard", "expert"]:
        count = sum(1 for q in bank if q["difficulty"] == diff)
        pct = count / total * 100
        bar = "█" * int(pct / 2)
        print(f"  {diff:8s}: {count:4d} ({pct:5.1f}%) {bar}")

    print("\nBy source:")
    sources = sorted(set(q["source_id"] for q in bank))
    for src in sources:
        count = sum(1 for q in bank if q["source_id"] == src)
        print(f"  {src}: {count}")

    # Exam feasibility
    print(f"\nExam feasibility (180 questions each):")
    print(f"  Full exams possible: {total // 180}")
    print(f"  Questions remaining after {total // 180} exams: {total % 180}")


def run(stats_only: bool = False, force: bool = False):
    print("Loading extracted question files...")
    bank = build_bank(force=force)

    if not bank:
        return

    if not stats_only:
        out_path = PROCESSED_DIR / "question_bank.json"
        out_path.write_text(json.dumps(bank, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nSaved {len(bank)} questions → {out_path}")

    print_stats(bank)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build PMP question bank from extracted Q&A files.")
    parser.add_argument("--stats", action="store_true", help="Print stats only, do not write question_bank.json")
    parser.add_argument("--force", action="store_true", help="Rebuild even if question_bank.json exists")
    args = parser.parse_args()

    run(stats_only=args.stats, force=args.force)

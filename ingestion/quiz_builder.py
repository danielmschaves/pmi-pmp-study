"""
quiz_builder.py

Builds exam JSON files from the master question_bank.json.
Produces domain quizzes and three full-exam combinations at different difficulty levels.

Pipeline position: qa_formatter → [quiz_builder]

Input:  data/processed/question_bank.json
Output: study/quizzes/exam_*.json

Exam types:
  exam_domain1_people.json       — Domain 1 only, balanced difficulty
  exam_domain2_process.json      — Domain 2 only, balanced difficulty
  exam_domain3_business_env.json — Domain 3 only, balanced difficulty
  exam_practice.json             — 180q, ECO-weighted, easy+medium focus
  exam_standard.json             — 180q, ECO-weighted, all difficulties (realistic)
  exam_hard.json                 — 180q, ECO-weighted, hard+expert focus

Usage:
  python ingestion/quiz_builder.py           # build all exam files
  python ingestion/quiz_builder.py --stats   # preview question counts only
"""

import json
import random
import argparse
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
BANK_PATH = ROOT / "data" / "processed" / "question_bank.json"
QUIZZES_DIR = ROOT / "study" / "quizzes"
QUIZZES_DIR.mkdir(parents=True, exist_ok=True)

FULL_EXAM_SIZE = 180

# ECO 2021 domain weights — used to allocate questions in full exams
ECO_WEIGHTS = {1: 0.42, 2: 0.50, 3: 0.08}

# Difficulty profiles for full exams
# Format: {difficulty: fraction_of_domain_quota}
PROFILES = {
    "practice": {"easy": 0.45, "medium": 0.40, "hard": 0.12, "expert": 0.03},
    "standard": {"easy": 0.25, "medium": 0.40, "hard": 0.25, "expert": 0.10},
    "hard":     {"easy": 0.05, "medium": 0.20, "hard": 0.45, "expert": 0.30},
}

DOMAIN_NAMES = {
    1: "People",
    2: "Process",
    3: "Business Environment",
}


def load_bank() -> list[dict]:
    if not BANK_PATH.exists():
        raise FileNotFoundError(f"Question bank not found at {BANK_PATH}. Run qa_formatter.py first.")
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def _pool(bank: list[dict], domain: int = None, difficulties: list[str] = None) -> list[dict]:
    """Filter bank by domain and/or difficulty list."""
    result = bank
    if domain is not None:
        result = [q for q in result if q["domain"] == domain]
    if difficulties:
        result = [q for q in result if q["difficulty"] in difficulties]
    return result


def _sample(pool: list[dict], n: int, used_ids: set[str]) -> list[dict]:
    """
    Sample n questions from pool, excluding already-used IDs.
    If pool is too small, returns as many as available.
    """
    available = [q for q in pool if q["id"] not in used_ids]
    random.shuffle(available)
    selected = available[:n]
    used_ids.update(q["id"] for q in selected)
    return selected


def build_domain_quiz(bank: list[dict], domain: int) -> list[dict]:
    """All available questions for one domain, difficulty-shuffled."""
    pool = _pool(bank, domain=domain)
    random.shuffle(pool)
    return pool


def build_full_exam(bank: list[dict], profile_name: str, used_ids: set[str]) -> list[dict]:
    """
    Build a 180-question exam following ECO domain weights and a difficulty profile.
    Draws from questions not already used in previous exams.
    """
    profile = PROFILES[profile_name]
    exam: list[dict] = []

    for domain, domain_weight in ECO_WEIGHTS.items():
        domain_quota = round(FULL_EXAM_SIZE * domain_weight)

        for difficulty, diff_fraction in profile.items():
            n = round(domain_quota * diff_fraction)
            if n == 0:
                continue
            p = _pool(bank, domain=domain, difficulties=[difficulty])
            selected = _sample(p, n, used_ids)
            exam.extend(selected)

        # Top-up if rounding left us short (fill with any difficulty from this domain)
        current_domain_count = sum(1 for q in exam if q["domain"] == domain)
        shortfall = domain_quota - current_domain_count
        if shortfall > 0:
            p = _pool(bank, domain=domain)
            exam.extend(_sample(p, shortfall, used_ids))

    # Final shuffle
    random.shuffle(exam)

    # Trim or warn if over/under
    if len(exam) > FULL_EXAM_SIZE:
        exam = exam[:FULL_EXAM_SIZE]
    elif len(exam) < FULL_EXAM_SIZE:
        # Top-up from remaining bank (any domain, any difficulty)
        exam.extend(_sample(bank, FULL_EXAM_SIZE - len(exam), used_ids))
        random.shuffle(exam)

    return exam[:FULL_EXAM_SIZE]


def _exam_summary(questions: list[dict], name: str):
    total = len(questions)
    by_domain = defaultdict(int)
    by_diff = defaultdict(int)
    for q in questions:
        by_domain[q["domain"]] += 1
        by_diff[q["difficulty"]] += 1

    print(f"  {name}: {total}q", end="")
    domain_parts = [f"D{d}:{by_domain[d]}" for d in [1, 2, 3]]
    diff_parts = [f"{d[0].upper()}:{by_diff[d]}" for d in ["easy", "medium", "hard", "expert"]]
    print(f"  [{' | '.join(domain_parts)}]  [{' '.join(diff_parts)}]")


def run(stats_only: bool = False, seed: int = 42):
    random.seed(seed)
    bank = load_bank()
    print(f"Loaded {len(bank)} questions from bank.\n")

    exams: dict[str, list[dict]] = {}

    # Domain quizzes (no used_ids restriction — they overlap intentionally)
    for d in [1, 2, 3]:
        key = f"exam_domain{d}_{DOMAIN_NAMES[d].lower().replace(' ', '_')}"
        exams[key] = build_domain_quiz(bank, domain=d)

    # Full exams — track used IDs across all three so they don't overlap
    used_ids: set[str] = set()
    for profile_name in ["practice", "standard", "hard"]:
        key = f"exam_{profile_name}"
        exams[key] = build_full_exam(bank, profile_name, used_ids)

    print("Exam breakdown:")
    for name, questions in exams.items():
        _exam_summary(questions, name)

    if stats_only:
        return

    for name, questions in exams.items():
        out_path = QUIZZES_DIR / f"{name}.json"
        out_path.write_text(json.dumps(questions, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  Saved → {out_path.relative_to(ROOT)}")

    print(f"\nAll exam files written to {QUIZZES_DIR.relative_to(ROOT)}/")
    print("Run: python study/quizzes/quiz_runner.py --exam exam_standard")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build PMP exam files from question bank.")
    parser.add_argument("--stats", action="store_true", help="Preview exam composition without writing files")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible shuffling")
    args = parser.parse_args()

    run(stats_only=args.stats, seed=args.seed)

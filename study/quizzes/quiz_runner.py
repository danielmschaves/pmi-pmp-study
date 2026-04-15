"""
quiz_runner.py

Interactive CLI quiz runner with dynamic question sampling and session history.

Dynamic profiles (fresh sample from question bank every run, unseen questions first):
  python study/quizzes/quiz_runner.py --exam practice
  python study/quizzes/quiz_runner.py --exam standard
  python study/quizzes/quiz_runner.py --exam hard

Static exam files (backward compatible):
  python study/quizzes/quiz_runner.py --exam exam_practice

Other options:
  python study/quizzes/quiz_runner.py --list
  python study/quizzes/quiz_runner.py --exam practice --count 50 --domain 2
  python study/quizzes/quiz_runner.py --reset-history
"""

import json
import time
import random
import argparse
import os
from pathlib import Path
from datetime import datetime

QUIZZES_DIR  = Path(__file__).parent
ROOT         = QUIZZES_DIR.parent.parent
BANK_PATH    = ROOT / "data" / "processed" / "question_bank.json"
HISTORY_FILE = ROOT / "data" / "processed" / "quiz_history.json"

FULL_EXAM_SIZE = 180

# Difficulty profiles — used only for full-size exams (≥ 50 questions)
PROFILES = {
    "practice": {"easy": 0.45, "medium": 0.40, "hard": 0.12, "expert": 0.03},
    "standard": {"easy": 0.25, "medium": 0.40, "hard": 0.25, "expert": 0.10},
    "hard":     {"easy": 0.05, "medium": 0.20, "hard": 0.45, "expert": 0.30},
}
PROFILE_NAMES = set(PROFILES.keys())

ECO_WEIGHTS = {1: 0.42, 2: 0.50, 3: 0.08}

# ─── ANSI ────────────────────────────────────────────────────────────────────
RESET   = "\033[0m";  BOLD  = "\033[1m";  DIM   = "\033[2m"
WHITE   = "\033[97m"; GREEN = "\033[32m"; RED   = "\033[31m"
YELLOW  = "\033[33m"; CYAN  = "\033[36m"; BLUE  = "\033[34m"
MAGENTA = "\033[35m"

def c(text, *codes): return "".join(codes) + str(text) + RESET

def _width():
    try:    return os.get_terminal_size().columns
    except: return 120

def clear():  os.system("cls" if os.name == "nt" else "clear")
def rule(ch="─", col=DIM): print(c(ch * _width(), col))
def blank():  print()

DIFF_BADGE = {
    "easy":   c(" EASY   ", DIM),
    "medium": c(" MEDIUM ", YELLOW),
    "hard":   c(" HARD   ", MAGENTA),
    "expert": c(" EXPERT ", BOLD, RED),
}
DOM_COLOR = {1: CYAN, 2: BLUE, 3: MAGENTA}
DOM_NAMES = {1: "People", 2: "Process", 3: "Business Environment"}

def diff_badge(d): return DIFF_BADGE.get(d, f" {d.upper()} ")
def dom_badge(d):  return c(f" {DOM_NAMES.get(d, f'Domain {d}')} ", BOLD, DOM_COLOR.get(d, WHITE))


# ─── History ─────────────────────────────────────────────────────────────────

class QuizHistory:
    def __init__(self):
        self.seen: dict[str, str] = {}
        self._load()

    def _load(self):
        if HISTORY_FILE.exists():
            try:
                self.seen = json.loads(HISTORY_FILE.read_text(encoding="utf-8")).get("seen", {})
            except Exception:
                self.seen = {}

    def record(self, question_id: str):
        """Record one question as seen and persist immediately."""
        self.seen[question_id] = datetime.now().isoformat()
        self._flush()

    def _flush(self):
        try:
            HISTORY_FILE.write_text(
                json.dumps({"seen": self.seen, "updated": datetime.now().isoformat()},
                           indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as e:
            print(c(f"  [warn] Could not write history: {e}", YELLOW))

    def reset(self):
        self.seen = {}
        self._flush()
        print(c("  History cleared — all questions are unseen again.", GREEN))

    def sort_unseen_first(self, questions: list[dict]) -> list[dict]:
        """Shuffle unseen questions randomly, append seen questions oldest-first."""
        unseen = [q for q in questions if q["id"] not in self.seen]
        seen   = sorted(
            [q for q in questions if q["id"] in self.seen],
            key=lambda q: self.seen[q["id"]],
        )
        random.shuffle(unseen)
        return unseen + seen

    def stats(self, bank: list[dict]) -> tuple[int, int]:
        total  = len(bank)
        unseen = sum(1 for q in bank if q["id"] not in self.seen)
        return total, unseen


# ─── Sampling ────────────────────────────────────────────────────────────────

def sample_questions(
    bank: list[dict],
    profile_name: str,
    count: int,
    history: QuizHistory,
    domain_filter: int | None = None,
    difficulty_filter: str | None = None,
) -> list[dict]:
    """
    Draw `count` questions from the bank, prioritising unseen ones.

    For small counts (< 50) or when filters are active: straight unseen-first
    random draw — no ECO weighting (too much rounding error at small N).

    For full exams (≥ 50): apply ECO domain weights + difficulty profile,
    still unseen-first within each bucket.
    """
    pool = bank
    if domain_filter:
        pool = [q for q in pool if q["domain"] == domain_filter]
    if difficulty_filter:
        pool = [q for q in pool if q["difficulty"] == difficulty_filter]

    ordered = history.sort_unseen_first(pool)   # unseen shuffled, then oldest-seen

    # Small count or filtered → just take first N from the unseen-first list
    if count < 50 or domain_filter or difficulty_filter:
        return ordered[:count]

    # Full exam → ECO-weighted + difficulty-profiled sampling
    profile  = PROFILES[profile_name]
    selected: list[dict] = []
    used:     set[str]   = set()

    def pick(subpool: list[dict], n: int) -> list[dict]:
        available = [q for q in subpool if q["id"] not in used]
        chosen    = available[:n]
        used.update(q["id"] for q in chosen)
        return chosen

    for domain, dom_w in ECO_WEIGHTS.items():
        dom_quota   = round(count * dom_w)
        dom_ordered = [q for q in ordered if q["domain"] == domain]

        for diff, diff_frac in profile.items():
            n         = round(dom_quota * diff_frac)
            diff_pool = [q for q in dom_ordered if q["difficulty"] == diff]
            selected.extend(pick(diff_pool, n))

        # Top-up this domain if rounding left us short
        shortfall = dom_quota - sum(1 for q in selected if q["domain"] == domain)
        if shortfall > 0:
            selected.extend(pick(dom_ordered, shortfall))

    # Final top-up from whole ordered pool if still short
    if len(selected) < count:
        selected.extend(pick(ordered, count - len(selected)))

    random.shuffle(selected)
    return selected[:count]


# ─── Exam loading ─────────────────────────────────────────────────────────────

def load_bank() -> list[dict]:
    if not BANK_PATH.exists():
        raise FileNotFoundError("Question bank not found. Run: python ingestion/qa_formatter.py")
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def load_static_exam(name: str) -> list[dict]:
    path = QUIZZES_DIR / (name if name.endswith(".json") else f"{name}.json")
    if not path.exists():
        raise FileNotFoundError(f"Exam file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def list_exams():
    blank()
    rule()
    print(c("  Dynamic profiles  (unseen-first random draw each session)", BOLD + CYAN))
    rule("·", DIM)
    for name in PROFILES:
        print(f"  {c(name, BOLD):<30}  {c('samples from question bank, no repeats until all seen', DIM)}")
    blank()
    print(c("  Static exam files  (fixed question set)", BOLD + CYAN))
    rule("·", DIM)
    for f in sorted(QUIZZES_DIR.glob("exam_*.json")):
        qs = json.loads(f.read_text(encoding="utf-8"))
        print(f"  {c(f.stem, BOLD):<45}  {c(str(len(qs)) + ' questions', DIM)}")
    blank()
    if BANK_PATH.exists():
        bank    = load_bank()
        history = QuizHistory()
        total, unseen = history.stats(bank)
        pct = unseen / total * 100 if total else 0
        bar_w  = 40
        filled = int(pct / 100 * bar_w)
        bar    = c("█" * filled, GREEN) + c("░" * (bar_w - filled), DIM)
        print(f"  {bar}  {c(f'{unseen}/{total} unseen ({pct:.0f}%)', BOLD)}")
    rule()
    blank()


# ─── Quiz session ─────────────────────────────────────────────────────────────

def run_quiz(questions: list[dict], history: QuizHistory, show_explanation: bool = True, is_dynamic: bool = False):
    total      = len(questions)
    score      = 0
    wrong: list[dict] = []
    start_time = time.time()

    clear()
    rule("═", BOLD + CYAN)
    print(c(f"  PMP Study Session  ·  {total} questions", BOLD + CYAN) +
          (c("  ·  unseen-first", DIM) if is_dynamic else ""))
    print(c("  Ctrl+C to quit  ·  progress saved after each answer", DIM))
    rule("═", BOLD + CYAN)
    blank()
    input(c("  Press Enter to start...", DIM))

    answered = 0
    try:
        for i, q in enumerate(questions, 1):
            clear()

            # ── Progress bar ──────────────────────────────────────────────────
            done      = i - 1
            pct       = done / total
            bar_w     = max(20, _width() - 40)
            filled    = int(pct * bar_w)
            bar       = c("█" * filled, GREEN) + c("░" * (bar_w - filled), DIM)
            elapsed   = time.time() - start_time
            avg       = elapsed / done if done else 0
            eta_s     = int(avg * (total - done))
            eta       = f"{eta_s // 60}m{eta_s % 60:02d}s" if eta_s > 60 else f"{eta_s}s"
            score_str = c(f"{score}/{done}", GREEN) if done else ""

            print(f"  {bar}  {c(f'Q{i}/{total}', BOLD)}  {score_str}  {c(f'ETA {eta}', DIM)}")
            blank()

            # ── Question header ───────────────────────────────────────────────
            rule()
            print(f"  {dom_badge(q['domain'])}  {diff_badge(q['difficulty'])}  {c(q.get('topic',''), DIM)}")
            rule()
            blank()

            # ── Question + options ────────────────────────────────────────────
            print(f"  {c(q['question'], BOLD, WHITE)}")
            blank()
            for opt in q["options"]:
                print(f"    {c(opt, WHITE)}")
            blank()
            rule()

            # ── Input ─────────────────────────────────────────────────────────
            while True:
                raw = input(c("  Your answer  A / B / C / D  or  S to skip : ", CYAN)).strip().upper()
                if raw in {"A", "B", "C", "D", "S"}:
                    break
                print(c("  Please enter A, B, C, D, or S.", YELLOW))

            answered += 1

            # ── Feedback ──────────────────────────────────────────────────────
            blank()
            if raw == "S":
                print(c(f"  ⤷  Skipped — correct answer: {q['answer']}", DIM))
            elif raw == q["answer"]:
                score += 1
                print(c("  ✓  CORRECT", BOLD + GREEN))
            else:
                wrong.append(q)
                print(c("  ✗  WRONG", BOLD + RED) +
                      c("  —  correct answer: ", WHITE) +
                      c(q["answer"], BOLD + GREEN))

            if show_explanation and raw != "S":
                blank()
                rule("·", DIM)
                print(f"  {c(q['explanation'], DIM)}")

            # ── Save history immediately after each answer ─────────────────
            if is_dynamic:
                history.record(q["id"])

            blank()
            rule()
            blank()
            input(c("  Press Enter for next question...", DIM))

    except KeyboardInterrupt:
        blank()
        print(c("  Quiz interrupted.", YELLOW))

    elapsed = time.time() - start_time
    _print_results(score, answered, total, elapsed, wrong)


def _print_results(score: int, answered: int, total: int, elapsed: float, wrong: list[dict]):
    if answered == 0:
        return
    clear()
    pct       = score / answered * 100
    mins, sec = divmod(int(elapsed), 60)
    bar_w     = max(20, _width() - 20)
    bar_color = GREEN if pct >= 70 else YELLOW if pct >= 61 else RED
    filled    = int(pct / 100 * bar_w)
    bar       = c("█" * filled, bar_color) + c("░" * (bar_w - filled), DIM)
    status    = ("PASS  ✓", BOLD + GREEN) if pct >= 70 else \
                ("BORDERLINE", BOLD + YELLOW) if pct >= 61 else \
                ("NEEDS IMPROVEMENT", BOLD + RED)

    rule("═", BOLD + CYAN);  print(c("  Results", BOLD + CYAN));  rule("═", BOLD + CYAN);  blank()
    print(f"  {bar}  {c(f'{pct:.1f}%', BOLD + bar_color)}")
    blank()
    print(f"  {c('Score :', DIM)}  {c(f'{score} / {answered}', BOLD)}")
    print(f"  {c('Time  :', DIM)}  {c(f'{mins}m {sec:02d}s', BOLD)}")
    if answered < total:
        print(f"  {c('Left  :', DIM)}  {c(f'{total - answered} not reached', YELLOW)}")
    blank()
    print(f"  {c('Status:', DIM)}  {c(status[0], status[1])}")

    if wrong:
        blank();  rule("·", DIM);  blank()
        print(c("  Topics to review:", BOLD + YELLOW));  blank()
        topics: dict[str, int] = {}
        for q in wrong:
            t = q.get("topic", "General")
            topics[t] = topics.get(t, 0) + 1
        for topic, cnt in sorted(topics.items(), key=lambda x: -x[1])[:10]:
            print(f"  {c('▪' * cnt, RED)}  {c(topic, WHITE)}")

    blank();  rule("═", BOLD + CYAN);  blank()


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PMP Study Quiz Runner")
    parser.add_argument("--exam",           default=None)
    parser.add_argument("--count",          type=int,  default=None)
    parser.add_argument("--domain",         type=int,  default=None)
    parser.add_argument("--difficulty",     default=None)
    parser.add_argument("--no-explanation", action="store_true")
    parser.add_argument("--seed",           type=int,  default=None)
    parser.add_argument("--list",           action="store_true")
    parser.add_argument("--reset-history",  action="store_true")
    args = parser.parse_args()

    if args.reset_history:
        QuizHistory().reset()
        return

    if args.list:
        list_exams()
        return

    if not args.exam:
        print("Specify an exam with --exam, or use --list to see options.")
        return

    if args.seed is not None:
        random.seed(args.seed)

    history    = QuizHistory()
    is_dynamic = args.exam in PROFILE_NAMES

    if is_dynamic:
        bank         = load_bank()
        total, unseen = history.stats(bank)

        if unseen == 0:
            print(c(f"\n  All {total} questions have been seen — resetting for a new cycle.", YELLOW))
            history.reset()
            unseen = total

        print(c(f"\n  Bank: {total} questions  ·  {unseen} unseen  ·  {total - unseen} already seen", DIM))

        count     = args.count or FULL_EXAM_SIZE
        questions = sample_questions(
            bank, args.exam, count, history,
            domain_filter=args.domain,
            difficulty_filter=args.difficulty,
        )
    else:
        questions = load_static_exam(args.exam)
        if args.domain:
            questions = [q for q in questions if q["domain"] == args.domain]
        if args.difficulty:
            questions = [q for q in questions if q["difficulty"] == args.difficulty]
        if args.count:
            questions = questions[:args.count]
        random.shuffle(questions)

    if not questions:
        print("No questions match your filters.")
        return

    run_quiz(questions, history, show_explanation=not args.no_explanation, is_dynamic=is_dynamic)

    if is_dynamic:
        _, unseen = history.stats(load_bank())
        print(c(f"  {unseen} questions unseen remaining in bank.", DIM))
        blank()


if __name__ == "__main__":
    main()

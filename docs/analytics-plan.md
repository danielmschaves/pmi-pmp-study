# Analytics Plan — PMP Study Quiz

Track every quiz session and per-question result in DuckDB, then build a dashboard on top.

---

## Database location

```
data/analytics/quiz_analytics.duckdb
```

---

## Schema

### `quiz_sessions` — one row per quiz run

| Column | Type | Notes |
|---|---|---|
| `session_id` | VARCHAR PK | UUID |
| `started_at` | TIMESTAMP | |
| `ended_at` | TIMESTAMP | |
| `exam_name` | VARCHAR | e.g. `exam_practice` |
| `total_questions` | INT | questions loaded before filters |
| `answered` | INT | questions actually reached |
| `skipped` | INT | answered with S |
| `correct` | INT | |
| `pct_correct` | FLOAT | |
| `elapsed_seconds` | FLOAT | total session time |
| `domain_filter` | INT | NULL if not filtered |
| `difficulty_filter` | VARCHAR | NULL if not filtered |
| `seed` | INT | NULL if not set |
| `interrupted` | BOOLEAN | true on Ctrl+C exit |

### `question_attempts` — one row per question per session

| Column | Type | Notes |
|---|---|---|
| `attempt_id` | VARCHAR PK | UUID |
| `session_id` | VARCHAR FK | → `quiz_sessions` |
| `question_id` | VARCHAR | e.g. `yt_003_001_09` |
| `source_id` | VARCHAR | e.g. `yt_003` |
| `domain` | INT | 1 / 2 / 3 |
| `difficulty` | VARCHAR | easy / medium / hard / expert |
| `topic` | VARCHAR | |
| `answer_given` | VARCHAR | A / B / C / D / S |
| `correct_answer` | VARCHAR | |
| `is_correct` | BOOLEAN | |
| `is_skipped` | BOOLEAN | |
| `elapsed_seconds` | FLOAT | time spent on this question |
| `position` | INT | 1-based order within the session |

---

## New file: `study/analytics.py`

Thin DuckDB wrapper with two public functions:

```python
init_db(db_path: Path) -> duckdb.DuckDBPyConnection
    # Creates both tables if they don't exist. Called once at startup.

log_session(session: dict, attempts: list[dict]) -> None
    # Inserts the session row + all attempt rows in a single transaction.
    # Called after _print_results, even on KeyboardInterrupt.
```

---

## Changes to `quiz_runner.py`

- Add per-question timer — `time.time()` snapshot before and after each `input()` call.
- Collect an `attempts` list during the question loop (currently only `wrong` is tracked).
- After `_print_results`, call `analytics.log_session(session, attempts)` — wrapped so it
  fires even when the quiz is interrupted with Ctrl+C.
- Add `--no-analytics` CLI flag to suppress logging (useful for dry runs / tests).

---

## Dependency

Add to `pyproject.toml`:

```toml
duckdb = ">=1.1"
```

Rebuild the Docker image once after:

```bash
docker compose build
```

---

## Dashboard-ready queries

| Question | Key SQL |
|---|---|
| Score over time | `SELECT started_at, pct_correct FROM quiz_sessions ORDER BY started_at` |
| Weakest domains | `SELECT domain, COUNT(*) FROM question_attempts WHERE NOT is_correct GROUP BY domain` |
| Weakest topics | `SELECT topic, COUNT(*) FROM question_attempts WHERE NOT is_correct GROUP BY topic ORDER BY 2 DESC` |
| Difficulty curve | `SELECT difficulty, AVG(is_correct::INT) FROM question_attempts GROUP BY difficulty` |
| Per-question accuracy | `SELECT question_id, topic, AVG(is_correct::INT) as accuracy FROM question_attempts GROUP BY 1,2 ORDER BY accuracy` |
| Avg time per question | `SELECT exam_name, AVG(elapsed_seconds / answered) FROM quiz_sessions GROUP BY exam_name` |
| Sessions per day | `SELECT started_at::DATE as day, COUNT(*) FROM quiz_sessions GROUP BY day` |

---

## Implementation order

1. Add `duckdb` to `pyproject.toml` and rebuild image.
2. Create `study/analytics.py` with `init_db` and `log_session`.
3. Modify `quiz_runner.py` — per-question timer, attempts list, analytics call.
4. Run a test quiz and inspect the DB with `duckdb data/analytics/quiz_analytics.duckdb`.
5. *(Future)* Build dashboard — candidates: Streamlit, Evidence.dev, or plain DuckDB CLI.

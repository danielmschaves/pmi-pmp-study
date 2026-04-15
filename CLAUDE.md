# CLAUDE.md — PMP Study Repository

## Project purpose
Self-contained PMP certification study tool. Ingests YouTube practice exam videos and
lecture content, extracts questions via Claude API, and serves interactive CLI quizzes.

## Stack
- Python 3.11, uv for dependency management
- Docker / docker compose — everything runs inside the container
- Claude API (Haiku by default) — used only in `ingestion/qa_extractor.py`
- `youtube-transcript-api` v1.x (instance-based API, not static methods)

## Key commands
```bash
docker compose build                          # rebuild image after pyproject.toml changes
docker compose up                             # start Jupyter on :8888

# Pipeline (run in order)
docker compose run --rm jupyter python ingestion/youtube_extractor.py
docker compose run --rm jupyter python ingestion/qa_extractor.py --dry-run
docker compose run --rm jupyter python ingestion/qa_extractor.py
docker compose run --rm jupyter python ingestion/qa_formatter.py
docker compose run --rm jupyter python ingestion/quiz_builder.py

# Quiz
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py --exam exam_practice
```

## Pipeline files
```
ingestion/sources.yml          source registry — add new videos here
ingestion/youtube_extractor.py download transcripts → data/raw/
ingestion/qa_extractor.py      Claude API extraction → data/processed/
ingestion/qa_formatter.py      validate + dedup → question_bank.json
ingestion/quiz_builder.py      build exam JSON files → study/quizzes/
study/quizzes/quiz_runner.py   interactive CLI quiz
```

## Data layout
```
data/raw/<id>_segments.json    timestamped transcript segments (input to qa_extractor)
data/raw/<id>_transcript.txt   flat text (human-readable)
data/processed/<id>/           per-chunk Claude API checkpoints
data/processed/<id>_qa.json    merged questions per source
data/processed/question_bank.json  master question bank (all sources merged)
study/quizzes/exam_*.json      assembled exam files
```

## sources.yml modes
- `mode: extract` — video already contains spoken Q&A; parse and structure them
- `mode: generate` — lecture/content video; Claude writes new questions from the material
- `difficulty_override` — tags all questions from a source with a fixed difficulty (used with extract mode)
- `domain: null` — mixed domains; Claude auto-detects per question

## sources.yml types
- `type: youtube` — single video (existing behaviour)
- `type: youtube_playlist` — all videos in a playlist are merged into one source ID;
  use `url` pointing to the playlist (e.g. `https://www.youtube.com/playlist?list=PLxxx`).
  Downstream pipeline is unchanged — the playlist collapses to a single `_segments.json`.

Example playlist entry:
```yaml
- id: yt_005
  type: youtube_playlist
  url: https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxx
  domain: 1
  topic: PMP People Domain — short lecture series
  mode: generate
  chunk_minutes: 10
  status: pending
```

## ECO 2021 domain weights
| Domain | Name | Target |
|--------|------|--------|
| 1 | People | 42% |
| 2 | Process | 50% |
| 3 | Business Environment | 8% |

## Current question bank (as of last run)
- 343 total: 193 expert (yt_001), 150 hard (yt_002)
- Domain 3 (Business Environment) is under-represented — prioritize adding videos on
  governance, compliance, benefits realization, or org change management

## Adding a new video
1. Add entry to `ingestion/sources.yml` with `status: pending`
2. `docker compose run --rm jupyter python ingestion/youtube_extractor.py`
3. `docker compose run --rm jupyter python ingestion/qa_extractor.py`
4. `docker compose run --rm jupyter python ingestion/qa_formatter.py`
5. `docker compose run --rm jupyter python ingestion/quiz_builder.py`

## Environment
- `ANTHROPIC_API_KEY` must be set in `.env` (see `.env.example`)
- Claude model: `claude-haiku-4-5-20251001` by default; override with `--model claude-sonnet-4-6` for higher quality
- The venv lives at `/opt/venv` inside the container — not inside `/workspace` — so volume mounts don't shadow it

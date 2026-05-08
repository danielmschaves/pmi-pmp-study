# PRD: PMI PMP Study Repository

**Updated:** 2026-05-08

## Overview

A structured, self-contained study repository for the **PMI Project Management Professional (PMP)**
certification exam. Provides two study interfaces — a browser web app (primary) and a terminal CLI
(secondary) — backed by a shared question bank built from YouTube videos via Claude API extraction.

---

## Goals

- Cover all PMP exam domains with structured questions across all difficulty levels
- Ingest and transform external resources (YouTube videos) into quiz-ready content via Claude API
- Provide practice quizzes at domain, full-exam, and hard-mode difficulty levels
- Web app: gated, account-based study with cross-device progress sync
- CLI: Docker-based terminal runner requiring no account or browser

---

## Exam Structure (ECO 2021)

| Domain | Weight |
|--------|--------|
| 1 — People | 42% |
| 2 — Process | 50% |
| 3 — Business Environment | 8% |

**Exam format:** 180 questions, 230 minutes, mix of predictive, agile, and hybrid approaches.

**Pass threshold:** ~61% (PMI uses scaled scoring — aim for 70%+ to be safe)

---

## Current Question Bank

- **343 total** — 193 expert (yt_001), 150 hard (yt_002)
- Covers Domains 1, 2, and 3
- Domain 3 (Business Environment) is under-represented — prioritize governance, compliance,
  benefits realization, and org change management content

---

## System Architecture

```
YouTube / PDFs
     │
     ▼
ingestion pipeline (Python, Docker)
  ├─ youtube_extractor.py   — download transcripts
  ├─ qa_extractor.py        — Claude API Q&A extraction
  ├─ qa_formatter.py        — validate + deduplicate
  └─ quiz_builder.py        — assemble exam JSON files
     │
     ├── CLI interface ──────► quiz_runner.py (terminal, no auth)
     │
     └── Supabase DB ─────────► questions table
                                     │
                                     ▼
                              Web SPA (Vite/TS, Vercel)
                                ├─ landing page
                                ├─ email/password auth
                                ├─ play / results / session views
                                └─ cross-device sync (pullAndMerge)
```

---

## Web App (Implemented)

Full-stack SPA at `/front-end`. See `front-end/PRD.md` for complete specification.

Key capabilities:
- Email/password sign-up with email confirmation (Supabase Auth)
- Question bank loaded from Supabase (`questions` table, paginated)
- Study sessions grouping multiple quiz attempts
- Exam mode (no feedback during quiz) and study mode (explanation after each question)
- Countdown timer or elapsed-time stopwatch
- Cross-device sync — seen questions, preferences, and session history synced on login
- Demo mode — 15 free questions without an account
- Row Level Security on all Supabase tables (`auth.uid() = user_id`)

**DB schema:** `supabase/migrations/001_initial_schema.sql`

---

## CLI (Implemented)

Terminal quiz runner at `study/quizzes/quiz_runner.py`. No account or browser required.

Key capabilities:
- Profile-based sampling: practice / standard / hard difficulty mixes
- Domain filter, difficulty filter, question count, seed
- Unseen-first ordering backed by a per-session run log
- ECO-weighted domain distribution for full 180-question exams
- `--no-explanation` flag, `Ctrl+C` graceful exit with score

---

## Content Ingestion Pipeline

### YouTube Videos
1. Register URL in `ingestion/sources.yml` (`status: pending`)
2. Download transcript via `youtube-transcript-api` (free, no API key)
3. Send transcript chunks to Claude API — `mode: extract` (parse spoken Q&A) or
   `mode: generate` (synthesize new questions from lecture content)
4. Validate, deduplicate, and write to `question_bank.json` via `qa_formatter.py`
5. Assemble exam files with `quiz_builder.py`

### sources.yml entry types

| Type | Description |
|------|-------------|
| `youtube` | Single video |
| `youtube_playlist` | All videos in a playlist merged into one source ID |

### sources.yml modes

| Mode | Description |
|------|-------------|
| `extract` | Video contains spoken Q&A — parse and structure it |
| `generate` | Lecture content — Claude writes new questions from the material |

---

## Repo Structure

```
pmi-pmp-study/
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── .env.example
│
├── ingestion/
│   ├── sources.yml
│   ├── youtube_extractor.py
│   ├── qa_extractor.py
│   ├── qa_formatter.py
│   └── quiz_builder.py
│
├── study/
│   ├── quizzes/
│   │   ├── quiz_runner.py
│   │   └── exam_*.json
│   └── *.ipynb
│
├── data/
│   ├── raw/
│   └── processed/
│       └── question_bank.json
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── front-end/          ← web app (see front-end/PRD.md)
│
└── materials/          ← drop PDFs here
```

---

## Dependencies

**Python (ingestion + CLI):**
- `anthropic` — Claude API for Q&A extraction
- `youtube-transcript-api` — transcript download
- `pyyaml` — sources.yml parsing
- `jupyter`, `notebook` — study notebooks

**Frontend (web app):**
- `@supabase/supabase-js` v2 — auth + database client
- `vite`, `typescript` — build tooling

---

## Success Criteria

- [x] Python ingestion pipeline processes a YouTube URL end-to-end with no manual editing
- [x] 300+ quiz questions across all 3 domains
- [x] CLI quiz runner with ECO-weighted sampling, domain/difficulty filters, and unseen-first ordering
- [x] Web app with auth (sign-up, email confirmation, login, logout)
- [x] Cross-device progress sync via Supabase
- [x] Study sessions with quiz grouping and session reports
- [x] Deployed to Vercel
- [ ] Domain 3 questions expanded to better match 8% ECO weight
- [ ] Google / Apple OAuth
- [ ] Password reset flow
- [ ] Stripe subscription integration

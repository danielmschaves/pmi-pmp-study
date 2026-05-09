# PMP Study Repository

Self-contained PMP certification exam prep tool. Extracts questions from YouTube practice
videos, builds a question bank, and serves interactive quizzes — both in the terminal and
as a full-stack web application.

**Current bank:** 343 questions — `hard` + `expert` difficulty — across all 3 ECO domains.

---

## Web App

The primary study interface is a Vite/TypeScript SPA deployed on Vercel, backed by Supabase
(PostgreSQL + Auth). It requires an account and syncs progress across devices.

**Live:** [pacing.app](https://pacing.app) *(update this with your Vercel URL)*

### Features

- Email/password sign-up and login (email confirmation required)
- Question bank loaded from Supabase (paginated, no bundled JSON)
- Study sessions — group multiple quizzes, track overall progress
- Exam mode (no feedback) and study mode (explanation after each question)
- Timer (countdown with limit, or elapsed-time stopwatch)
- Cross-device sync — progress, seen questions, and session history sync on login
- Demo mode — 15 free questions without an account

### Local dev

```bash
cd front-end

# Copy env template and fill in your Supabase credentials
cp .env.example .env
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Start the dev server (Docker)
docker compose up --build          # first run
docker compose up                  # subsequent runs
# Open http://localhost:5173
```

### Supabase setup (one-time)

1. Create a free project at [supabase.com](https://supabase.com)
2. Settings → Auth → enable Email provider → enable "Confirm email"
3. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor
4. Copy the Project URL and anon key into `front-end/.env`

### Deploy to Vercel

Connect the repo in the Vercel dashboard, set **Root Directory** to `front-end`, then add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Project → Settings → Environment Variables.

---

## CLI Quiz

The original terminal quiz runner still works and doesn't require Supabase.

### Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Anthropic API key (only needed when adding new video sources)

### Setup

```bash
# 1. Copy the env template and add your API key
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 2. Build the container
docker compose build

# 3. Start Jupyter (optional — for study notebooks)
docker compose up
# Open http://localhost:8888
```

### Taking a quiz

```bash
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py --exam exam_practice
```

#### Available exams

| Exam | Questions | Profile |
|------|-----------|---------|
| `exam_practice` | 180 | ECO-weighted, all available questions |
| `exam_standard` | 180 | ECO-weighted, non-overlapping with practice |
| `exam_hard` | 180 | Hard + expert questions only |
| `exam_domain1_people` | all D1 | People domain only |
| `exam_domain2_process` | all D2 | Process domain only |
| `exam_domain3_business_environment` | all D3 | Business Environment only |

List all available exams:
```bash
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py --list
```

#### Filtering by difficulty

```bash
# Expert questions only
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py \
  --exam exam_practice --difficulty expert
```

Difficulty levels:

| Level | Description |
|-------|-------------|
| `easy` | Concept recall, single-step decision |
| `medium` | Application in a straightforward scenario |
| `hard` | Analysis with competing options or partial information |
| `expert` | Synthesis across multiple PM areas; ambiguity and trade-offs |

#### Filtering by domain

```bash
# Process domain only (50% of the real exam)
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py \
  --exam exam_practice --domain 2

# People domain, expert difficulty, 30 questions
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py \
  --exam exam_practice --domain 1 --difficulty expert --count 30
```

Domains:

| # | Name | ECO Weight |
|---|------|-----------|
| 1 | People | 42% |
| 2 | Process | 50% |
| 3 | Business Environment | 8% |

#### All quiz options

```
--exam         Exam file to load (required)
--count        Number of questions to run (default: all)
--domain       Filter to domain 1, 2, or 3
--difficulty   Filter to easy / medium / hard / expert
--no-explanation  Hide explanation after each answer
--seed         Fixed random seed for reproducible question order
--list         List all available exam files
```

#### Quiz controls

During a session:
- Type `A`, `B`, `C`, or `D` and press Enter to answer
- Type `S` to skip a question
- `Ctrl+C` ends the session and shows your score

---

## Adding New Video Sources

### 1. Register the video in `ingestion/sources.yml`

```yaml
# Practice exam / Q&A video — parse existing questions from transcript
- id: yt_003
  type: youtube
  url: https://www.youtube.com/watch?v=XXXXXXXXXXX
  domain: null                 # null = mixed; Claude detects domain per question
  topic: "PMP Practice Exam"
  mode: extract
  difficulty_override: hard    # tags all extracted questions with this difficulty
  chunk_minutes: 15
  status: pending

# Lecture / content video — Claude generates new questions from the material
- id: yt_004
  type: youtube
  url: https://www.youtube.com/watch?v=XXXXXXXXXXX
  domain: 2                    # set domain explicitly for content videos
  topic: "Earned Value Management"
  mode: generate
  status: pending
```

### 2. Run the pipeline

```bash
# Download transcript (free, no API key needed)
docker compose run --rm jupyter python ingestion/youtube_extractor.py

# Preview chunk plan before spending API credits
docker compose run --rm jupyter python ingestion/qa_extractor.py --dry-run

# Extract questions (Claude API — ~$0.10–0.15 per 7h video with Haiku)
docker compose run --rm jupyter python ingestion/qa_extractor.py

# Merge, validate, deduplicate
docker compose run --rm jupyter python ingestion/qa_formatter.py

# Rebuild exam files
docker compose run --rm jupyter python ingestion/quiz_builder.py
```

The extractor checkpoints each chunk to `data/processed/<id>/chunk_NNN.json` — resumable if interrupted.

### Processing a single source

```bash
docker compose run --rm jupyter python ingestion/qa_extractor.py --source yt_003
```

### Using a higher-quality model

```bash
docker compose run --rm jupyter python ingestion/qa_extractor.py --model claude-sonnet-4-6
```

---

## Exam Structure (ECO 2021)

| Domain | Weight | Topics |
|--------|--------|--------|
| 1 — People | 42% | Leadership styles, team building, stakeholder engagement, conflict resolution, emotional intelligence, motivation |
| 2 — Process | 50% | Predictive & agile lifecycles, risk management, schedule (CPM, float), budget (EVM), quality, procurement |
| 3 — Business Environment | 8% | Benefits realization, organizational change, compliance, governance, strategic alignment |

**Exam format:** 180 questions · 230 minutes · mix of predictive, agile, and hybrid

**Pass threshold:** ~61% (PMI uses scaled scoring — aim for 70%+ to be safe)

---

## Project Structure

```
pmi-pmp-study/
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── .env                         # API key (not committed)
├── .env.example
│
├── ingestion/
│   ├── sources.yml              # source registry
│   ├── youtube_extractor.py    # step 1 — download transcripts
│   ├── qa_extractor.py         # step 2 — Claude API Q&A extraction
│   ├── qa_formatter.py         # step 3 — validate + build question bank
│   └── quiz_builder.py         # step 4 — assemble exam files
│
├── study/
│   ├── quizzes/
│   │   ├── quiz_runner.py      # interactive CLI quiz
│   │   └── exam_*.json         # generated exam files
│   └── *.ipynb                 # domain study notebooks
│
├── data/
│   ├── raw/                    # transcripts and segments
│   └── processed/              # question bank and chunk checkpoints
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # DB schema + RLS policies
│
├── front-end/                  # Vite/TS web app (see front-end/PRD.md)
│   ├── src/
│   │   ├── main.ts             # router + auth guard
│   │   ├── supabase.ts         # Supabase client singleton
│   │   ├── auth.ts             # signIn / signUp / signOut / onAuthChange
│   │   ├── sync.ts             # pullAndMerge + fire-and-forget push helpers
│   │   ├── state.ts            # localStorage + sync hooks
│   │   ├── session.ts          # study session management
│   │   ├── sampling.ts         # ECO-weighted question sampling
│   │   ├── types.ts
│   │   ├── views/
│   │   │   ├── landing.ts      # public landing page
│   │   │   ├── auth.ts         # login / signup form
│   │   │   ├── home.ts         # post-login home
│   │   │   ├── setup.ts        # quiz configurator
│   │   │   ├── play.ts         # question player
│   │   │   ├── results.ts      # quiz results
│   │   │   ├── session-hub.ts  # study session dashboard
│   │   │   └── session-report.ts
│   │   └── lib/
│   │       ├── data.ts         # paginated Supabase question bank loader
│   │       ├── format.ts       # time / percent helpers
│   │       ├── keys.ts         # keyboard shortcut dispatcher
│   │       └── ...
│   └── ...
│
└── materials/                  # drop PDFs here for ingestion
```

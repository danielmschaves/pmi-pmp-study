# PMP Study Repository

Self-contained PMP certification exam prep tool. Extracts questions from YouTube practice
videos, builds a question bank, and runs interactive timed quizzes — in the terminal **or
in a browser**.

**Current bank:** 343 questions — `hard` + `expert` difficulty — across all 3 ECO domains.

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An Anthropic API key (only needed when adding new video sources)

---

## Setup

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

---

## Taking a Quiz

```bash
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py --exam exam_practice
```

### Available exams

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

### Filtering by difficulty

```bash
# Expert questions only
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py \
  --exam exam_practice --difficulty expert

# Hard questions only
docker compose run --rm -it jupyter python study/quizzes/quiz_runner.py \
  --exam exam_practice --difficulty hard
```

Difficulty levels (in order):

| Level | Description |
|-------|-------------|
| `easy` | Concept recall, single-step decision |
| `medium` | Application in a straightforward scenario |
| `hard` | Analysis with competing options or partial information |
| `expert` | Synthesis across multiple PM areas; ambiguity and trade-offs |

### Filtering by domain

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

### All quiz options

```
--exam         Exam file to load (required)
--count        Number of questions to run (default: all)
--domain       Filter to domain 1, 2, or 3
--difficulty   Filter to easy / medium / hard / expert
--no-explanation  Hide explanation after each answer
--seed         Fixed random seed for reproducible question order
--list         List all available exam files
```

### Quiz controls

During a session:
- Type `A`, `B`, `C`, or `D` and press Enter to answer
- Type `S` to skip a question
- `Ctrl+C` ends the session and shows your score

---

## Web UI (alternative to the terminal)

A static browser app that mirrors every feature of `quiz_runner.py` — no Docker required
after the first data sync. Deploy to Vercel or run locally.

### Local dev

```bash
cd front-end
docker compose up --build          # first run: installs deps, starts Vite on :5173
docker compose up                  # subsequent runs
```

Open http://localhost:5173. The container mounts `../data/processed` and
`../study/quizzes` read-only and runs `scripts/sync-data.mjs` on startup, so the
browser always reads the latest question bank built by the Python pipeline.

### Production build (smoke test before deploy)

```bash
cd front-end
docker compose run --rm web npm run build
docker compose run --rm -p 4173:4173 web npm run preview
```

### Deploy to Vercel

Connect the repo on [vercel.com](https://vercel.com), set **Root Directory** to
`front-end`. Vercel auto-detects Vite and runs `sync-data.mjs` as a `prebuild` hook
(the repo checkout makes the data files available without the Docker mount).

### What the web UI offers vs the CLI

| Feature | CLI (`quiz_runner.py`) | Web UI |
|---|---|---|
| Exam profiles (practice / standard / hard) | `--exam` flag | Cards on home screen |
| Count, domain, difficulty filters | CLI flags | Setup screen |
| Unseen-first sampling + ECO weights | Python | Identical TS port |
| Live progress bar + ETA + running score | Terminal | Sticky top bar |
| Explanations toggle | `--no-explanation` | Toggle on setup screen |
| Reproducible seed | `--seed N` | `?seed=N` query param |
| Per-domain results + topics to review | End-of-session summary | Results screen |
| Retry missed questions | — | "Retry missed" button |
| History persistence | Session only | `localStorage` (survives refresh) |
| Keyboard shortcuts | Required | Supported + touch gestures |

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

The extractor checkpoints each chunk to `data/processed/<id>/chunk_NNN.json` — if it
is interrupted, re-running it resumes from where it stopped.

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
├── .env                        # API key (not committed)
├── .env.example
│
├── ingestion/
│   ├── sources.yml             # source registry
│   ├── youtube_extractor.py    # step 1 — download transcripts
│   ├── qa_extractor.py         # step 2 — Claude API Q&A extraction
│   ├── qa_formatter.py         # step 3 — validate + build question bank
│   └── quiz_builder.py         # step 4 — assemble exam files
│
├── study/
│   ├── quizzes/
│   │   ├── quiz_runner.py      # interactive CLI quiz
│   │   └── exam_*.json         # generated exam files
│   └── *.ipynb                 # domain study notebooks (coming soon)
│
├── data/
│   ├── raw/                    # transcripts and segments
│   └── processed/              # question bank and chunk checkpoints
│
├── materials/                  # drop PDFs here for ingestion
│
└── front-end/                  # static web UI (Vite + TypeScript)
    ├── docker-compose.yml      # dev server on :5173
    ├── Dockerfile.dev
    ├── package.json
    ├── vite.config.ts
    ├── vercel.json
    ├── scripts/
    │   └── sync-data.mjs       # copies question bank into public/data/
    └── src/
        ├── main.ts             # router + mount
        ├── state.ts            # session state + localStorage
        ├── sampling.ts         # TS port of quiz_runner sampling logic
        └── views/              # home / setup / play / results
```

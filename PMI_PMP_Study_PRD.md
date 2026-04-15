# PRD: PMI PMP Study Repository

## Overview

A structured, self-contained study repository for the **PMI Project Management Professional (PMP)** certification exam. Mirrors the architecture of the Claude Certified Architect study repo — domain notebooks, hands-on examples, and progressive quizzes — with an additional content ingestion pipeline for extracting Q&A from YouTube videos and other external materials.

---

## Goals

- Cover all PMP exam domains with structured theory notebooks
- Ingest and transform external resources (videos, PDFs, slides) into quiz-ready content
- Provide practice quizzes at domain, full-exam, and hard-mode difficulty levels
- Run fully inside a Docker container with no local setup required

---

## Exam Structure (ECO 2021)

| Domain | Weight |
|---|---|
| 1. People | 42% |
| 2. Process | 50% |
| 3. Business Environment | 8% |

**Exam format**: 180 questions, 230 minutes, mix of predictive, agile, and hybrid approaches.

---

## Repo Structure

```
pmi-pmp-study/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── requirements.txt
├── README.md
│
├── study/
│   ├── 00_exam_overview.ipynb          # Exam metadata, domain weights, ECO breakdown
│   ├── 01_domain1_people.ipynb         # Leadership, teams, stakeholders, conflict
│   ├── 02_domain2_process.ipynb        # Schedules, risk, budget, quality, procurement
│   ├── 03_domain3_business_env.ipynb   # Benefits realization, compliance, org change
│   └── quizzes/
│       ├── quiz_domain1_people.py
│       ├── quiz_domain2_process.py
│       ├── quiz_domain3_business_env.py
│       ├── quiz_full_exam.py           # 180-question simulated exam
│       └── quiz_hard_exam.py           # Situational / scenario-based hard questions
│
└── ingestion/
    ├── youtube_extractor.py            # Download transcript → extract Q&A via Claude API
    ├── pdf_extractor.py                # Parse PDF/slides → extract Q&A via Claude API
    ├── qa_formatter.py                 # Normalize all Q&A to standard quiz format
    └── sources.yml                     # Registry of all source materials
```

---

## Content Domains

### Domain 1 — People (42%)
- Leadership styles (servant, transformational, situational)
- Team building, virtual teams, conflict resolution
- Stakeholder engagement and communication planning
- Emotional intelligence, negotiation, motivation theories

### Domain 2 — Process (50%)
- Predictive (waterfall): initiation → planning → execution → monitoring → closing
- Agile/Scrum: sprints, ceremonies, roles, velocity, burndown
- Hybrid approaches
- Risk management (identify, qualify, quantify, respond, monitor)
- Schedule (CPM, float, crashing, fast-tracking)
- Budget (EVM: CPI, SPI, EAC, ETC, BAC)
- Quality (Kaizen, Six Sigma, control charts, Pareto)
- Procurement and contracts

### Domain 3 — Business Environment (8%)
- Business case and benefits realization
- Organizational change management
- Compliance and governance
- Strategic alignment and OKRs

---

## Content Ingestion Pipeline

### YouTube Videos
1. Accept a YouTube URL in `sources.yml`
2. Download transcript via `youtube-transcript-api`
3. Send transcript to Claude API with prompt:
   > "Extract 10 PMP exam-style questions with 4 answer choices, the correct answer, and a 2-sentence explanation. Return as JSON."
4. Validate and normalize output via `qa_formatter.py`
5. Append to the relevant domain quiz file

### PDFs / Slides / Text
1. Accept a file path or URL in `sources.yml`
2. Extract text via `pypdf` or `pdfplumber`
3. Chunk by section/page, send to Claude API for Q&A extraction
4. Same normalization and append flow as above

### sources.yml Format
```yaml
sources:
  - id: yt_001
    type: youtube
    url: https://youtube.com/watch?v=...
    domain: 2
    topic: "Earned Value Management"
    status: pending   # pending | processed | skipped

  - id: pdf_001
    type: pdf
    path: ./materials/pmbok7.pdf
    domain: 1
    topic: "Leadership Styles"
    status: pending
```

---

## Quiz Format (Standard)

All quizzes share a consistent format inherited from the Claude cert repo:

```python
{
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "B",
    "explanation": "...",
    "domain": 2,
    "source": "yt_001"   # traceability back to source material
}
```

---

## Docker Setup

Same pattern as the Claude cert repo:

- Base image: `python:3.11-slim`
- Jupyter on port `8888`, no token, live volume mount
- Additional dependencies: `youtube-transcript-api`, `pypdf`, `anthropic`, `pyyaml`, `pdfplumber`
- `docker-compose.yml` for one-command startup

---

## Dependencies

```
anthropic
jupyter
notebook
youtube-transcript-api
pypdf
pdfplumber
pyyaml
python-dotenv
matplotlib
ipywidgets
```

---

## Out of Scope (v1)

- Web UI for quiz-taking (CLI only)
- Spaced repetition / flashcard system
- Automated scoring persistence
- Multi-user support

---

## Success Criteria

- All 3 domain notebooks complete with theory + worked examples
- At least 300 quiz questions total across domain + full + hard exams
- Ingestion pipeline processes a YouTube URL end-to-end with no manual editing
- Container starts with a single `docker compose up` command

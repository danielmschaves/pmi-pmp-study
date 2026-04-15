# PRD — PMP Quiz (Web)

**Status:** Draft · **Owner:** danielmschaves · **Date:** 2026-04-14
**Scope:** Static web frontend that plays the existing PMP question bank. Modern,
minimal, mostly monochrome. No ingestion, no backend, no auth. Deploys to Vercel.

---

## 1. Goal

Replace the Docker + CLI friction (`quiz_runner.py`) with a browser app that keeps
**every feature** of the Python runner but replaces the terminal look with a clean,
modern interface. Study on any device, share by URL, no server.

**Keep from Python:** profile-based sampling (practice / standard / hard), static exam
files, question-count picker, domain filter, difficulty filter, unseen-first history,
skip, explanations on/off, live progress + ETA + running score, results with pass
thresholds (70% / 61%) and a "topics to review" list.

**Drop:** terminal aesthetic (ANSI colors, ASCII bars, monospace everywhere), Docker
requirement, CLI arg parsing.

**Out of scope:** ingestion pipeline, Claude API, accounts, cloud sync, SRS scheduling.

---

## 2. Primary flow

1. **Home** — choose an exam type, then configure the session.
2. **Configure** — pick count, domain filter, difficulty filter, explanations on/off.
3. **Play** — answer, optionally skip, see explanation, continue.
4. **Results** — score, pass banner, time, topics to review, retry missed or start over.

All four are routes under a single SPA. No loading screens beyond the first paint — all
data is bundled.

---

## 3. Feature parity with `quiz_runner.py`

| CLI feature | Web equivalent |
|---|---|
| `--exam practice / standard / hard` | "Dynamic exam" cards on home with difficulty mix preview |
| `--exam exam_practice.json` (static) | "Saved exams" section below the dynamic cards |
| `--count N` | Number input + quick chips (10 / 25 / 50 / 90 / 180) |
| `--domain 1\|2\|3` | Segmented control: All · People · Process · Business Env |
| `--difficulty easy\|medium\|hard\|expert` | Segmented control |
| `--no-explanation` | Toggle on setup screen |
| `--seed N` | `?seed=` query param (power user, no UI) |
| `--list` | Home screen itself |
| `--reset-history` | Settings drawer → "Reset progress" (with confirm) |
| Unseen-first sampling | Same algorithm in TS, backed by `localStorage` |
| ECO-weighted + difficulty profile for ≥50 | Same algorithm in TS |
| Running progress bar + ETA + score | Top bar during play |
| Pass thresholds 70 / 61 | Same thresholds, colored status chip |
| "Topics to review" ranked list | Results screen section |
| History persisted after every answer | `localStorage.setItem` after each answer |

---

## 4. Data

Bundled as static JSON inside `front-end/public/data/`:

- `question_bank.json` — master bank (required for dynamic profiles)
- `exam_practice.json`, `exam_standard.json`, `exam_hard.json`,
  `exam_domain1_people.json`, `exam_domain2_process.json`,
  `exam_domain3_business_environment.json`
- `index.json` — manifest written by the build script

Shape unchanged from Python:

```ts
type Question = {
  id: string; question: string; options: string[];
  answer: "A" | "B" | "C" | "D"; explanation: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  topic: string; domain: 1 | 2 | 3;
  source_id: string; chunk_index: number; video_segment: string;
};
```

**Build step:** `front-end/scripts/sync-data.mjs` copies the JSON files from
`../data/processed/question_bank.json` and `../study/quizzes/exam_*.json` into
`front-end/public/data/` and emits `index.json`. Runs before `vite build`. The Python
pipeline stays the source of truth and is not touched.

**Persistence:** `localStorage` key `pmp.v1` — `{ seen: { [qid]: isoTimestamp }, lastSession: {...} }`.

---

## 5. Stack (kept minimal)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Vite + vanilla TypeScript** | Zero runtime deps, smallest footprint. Vercel auto-detects. |
| Styling | Single `styles.css` with CSS custom properties | No Tailwind, no CSS-in-JS. A design system in ~150 lines. |
| Fonts | **Inter Tight** (display/body) + **IBM Plex Mono** (numbers, badges) — self-hosted woff2 | Modern, professional, distinct enough to avoid generic Inter. |
| Routing | Hash routing (`#/play`) | No Vercel rewrites required. |
| State | One module + `localStorage` | No Redux, no query lib. |
| Icons | 5–6 inline SVGs in a `lib/icons.ts` | No icon library. |
| Deploy | Vercel static | `vercel.json` with `outputDirectory: dist`. |

Runtime dependencies: **zero**. Dev: `vite`, `typescript`.

---

## 6. Design

A basic quiz UI. Dark, modern, nothing clever.

- **Colors:** background `#0F0F10`, card `#18191C`, border `#2A2B30`, text `#F4F4F5`
  (primary) / `#A1A1AA` (secondary). One accent `#4ADE80` (green) for correct +
  progress, `#F87171` (red) for wrong. That's the whole palette.
- **Type:** Inter for everything, one weight for body (400), one for emphasis (600).
  System mono for score/ETA numerics so digits don't jitter. 16 px body, 20 px question.
- **Layout:** centered column, 640 px max. 8-pt spacing scale. Cards with 12 px radius
  and a 1 px border — no shadows, no gradients.
- **Buttons:** solid green for primary, outlined for secondary, ghost for tertiary.
  Same 44 px height everywhere.
- **Options:** four stacked rows in a card. Letter tag on the left, text next to it.
  Hover/press = lighter surface. Selected = green border. Correct post-lock = green
  border + check. Wrong = red border + ×.
- **Progress:** thin 2 px bar across the top during play, green fill.
- **Motion:** 150 ms ease-out on hover and selection. Nothing else.
- **Accessibility:** 4.5:1 contrast, visible focus rings, keyboard support, respects
  `prefers-reduced-motion`.

---

## 7. Screens

### 7.1 Home — `#/`

- Heading `PMP Study` + one-line subtitle
- Stat strip (mono): `343 questions · 127 unseen · 63% covered` with a 2px progress line
- **Dynamic exams** — three cards (Practice / Standard / Hard). Each shows the
  difficulty mix as a single 4-segment bar (easy/medium/hard/expert widths proportional
  to profile) plus copy like "180 questions · ECO-weighted"
- **Saved exams** — compact list of static exam files, name + count
- Settings icon top-right → drawer with "Reset progress", "Toggle explanations by
  default", "Seed (advanced)"

### 7.2 Configure — `#/setup/:examId`

A single form, not a wizard:

- **Count** — number input 1–300 + quick chips (10, 25, 50, 90, 180). Default = exam's
  native count (180 for dynamic, file length for static)
- **Domain** — segmented: All · People · Process · Business Env
- **Difficulty** — segmented: All · Easy · Medium · Hard · Expert
- **Show explanations** — toggle, default on
- Primary button `Start session` (full width, lime). Secondary `Back`.
- Small note when ECO weighting will apply (count ≥ 50 and no filters).

### 7.3 Play — `#/play`

- **Top bar** (sticky): left = `Q 12 / 50` (mono), center = 2px progress line spanning
  full width, right = score `9 · ETA 8m` (mono). Exit button (×) far right.
- **Meta row**: outlined badges — domain name, difficulty, topic
- **Question**: H2, plenty of breathing room above/below
- **Options**: four rows. Each row = letter tag (mono) + text + trailing selectable
  area. Hover = surface lift. Selected = left rail + stronger border. Locked correct =
  lime rail + tiny check glyph. Locked wrong = red rail + tiny × glyph. The correct one
  is always revealed post-lock.
- **Explanation** (when shown): slides in below options in a muted surface block,
  1.2× body line-height for readability. Includes video timestamp as a small mono
  string at the bottom-right.
- **Footer bar**: `Skip (S)` · `Lock (Enter)` · `Next (N)` — subtle, text buttons.

### 7.4 Results — `#/results`

- Big score (`82%` H1 weight 600), status chip next to it (`PASS` lime / `BORDERLINE`
  amber / `NEEDS WORK` red)
- Mono summary line: `41 / 50 correct · 38m 12s · avg 45s/q`
- **Per-domain accuracy**: three thin horizontal bars, labeled, mono percentage on the
  right. Black track, lime/red fill depending on ≥70%.
- **Topics to review**: ranked list (topic name + tiny count bubble). Clicking a topic
  starts a 10-question session filtered to that topic (stretch; v1 can be a no-op link).
- Primary action `Retry missed` (creates an ad-hoc session from `wrong[]`). Secondary
  `New session` (back to home).

---

## 7a. Mobile

Primary use case is **phone in hand between meetings** — the design is mobile-first,
not "responsive as an afterthought". Everything on desktop is a widened version of the
mobile layout, never the reverse.

**Breakpoints:** `≤640px` phone, `641–960px` tablet, `>960px` desktop. The centered
column grows from 16px side padding (phone) → 32px (tablet) → 680px max column
(desktop).

**Touch targets:** every interactive element is ≥ 44×44 px (Apple HIG) and spaced at
least 8 px apart. Option rows expand to full tap-height (~ 64 px) so the whole row is
tappable, not just the letter tag.

**Screen-specific adjustments:**

- **Home:** dynamic exam cards stack vertically full-width. The stat strip wraps to two
  lines on < 380 px and drops the percentage.
- **Setup:** count chips wrap to two rows; domain/difficulty segmented controls become
  **horizontally scrollable pill groups** with a subtle fade mask on the right edge.
  The `Start session` button is full-width and anchored at the bottom with safe-area
  padding.
- **Play:** top bar drops the ETA on < 480 px (keeps `Q x/y` + progress line + exit).
  Running score moves into the bottom footer bar on mobile. The explanation block
  appears inline (no side-panel fantasy). Footer becomes a 3-button segmented control
  (`Skip` · `Lock` · `Next`), full-width, sticky above the keyboard/safe-area.
- **Results:** per-domain bars stack tight; "Retry missed" and "New session" become
  stacked full-width buttons, primary on top.

**Interaction model on touch:**

- Tap an option to **select** (doesn't lock). Tap `Lock` in the footer — or tap the
  selected option a second time — to commit. The confirm-before-lock prevents fat-
  finger misfires that would be instant on keyboard.
- Swipe left anywhere on the play screen = next question (post-lock only). Swipe right
  = show/hide explanation. Both are extras; every swipe has a button equivalent.
- `active:` states replace `hover:` — a 80 ms background dim on press.
- `-webkit-tap-highlight-color: transparent` set globally; we draw our own press state.

**Viewport & chrome:**

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `env(safe-area-inset-*)` respected on sticky top/bottom bars (iPhone notch + home
  indicator).
- `theme-color` meta set to `#0E0E10` so iOS/Android status bar matches the app.
- No horizontal scroll anywhere, ever (lint rule: no element allowed wider than 100vw).

**Performance on mobile:**

- Total JS budget: < 30 KB gzipped. Total CSS: < 10 KB.
- Fonts subset to Latin basic + numbers; `font-display: swap`.
- `question_bank.json` (~400 KB) lazy-loaded **only** when a dynamic profile is picked;
  static exam files loaded on demand too. Home screen JSON is just the manifest.
- Lighthouse mobile target: Performance ≥ 95, Accessibility = 100.

**What mobile does NOT get:** the keybind cheatsheet (`?` overlay) is hidden on touch
devices via `(pointer: coarse)`. Keyboard shortcuts still fire if an external keyboard
is attached.

---

## 8. File layout

```
front-end/
├── PRD.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── index.html
├── public/
│   ├── fonts/           ← InterTight-*.woff2, IBMPlexMono-*.woff2
│   └── data/            ← populated by sync-data.mjs
├── scripts/
│   └── sync-data.mjs
└── src/
    ├── main.ts          ← router + mount
    ├── state.ts         ← session + localStorage (pmp.v1)
    ├── sampling.ts      ← port of sample_questions() + sort_unseen_first()
    ├── views/
    │   ├── home.ts
    │   ├── setup.ts
    │   ├── play.ts
    │   └── results.ts
    ├── lib/
    │   ├── keys.ts      ← keybind dispatcher
    │   ├── icons.ts
    │   └── format.ts    ← eta, percent, etc.
    └── styles.css
```

---

## 9. Sampling logic (direct TS port of Python)

Constants mirror `quiz_runner.py`:

```ts
const PROFILES = {
  practice: { easy: 0.45, medium: 0.40, hard: 0.12, expert: 0.03 },
  standard: { easy: 0.25, medium: 0.40, hard: 0.25, expert: 0.10 },
  hard:     { easy: 0.05, medium: 0.20, hard: 0.45, expert: 0.30 },
};
const ECO = { 1: 0.42, 2: 0.50, 3: 0.08 };
const FULL_EXAM_SIZE = 180;
```

Behavior:
- `count < 50` or any filter active → unseen-first random draw, take first N.
- Otherwise → ECO-weighted domain buckets × difficulty fractions, then top-up.
- `sort_unseen_first` matches Python: unseen shuffled, then seen sorted oldest-first.

Seed support via `?seed=N` feeds a small mulberry32 PRNG so a given URL is reproducible.

---

## 10. Non-goals / deferred

- No PWA or offline manifest v1 (browser cache is enough).
- No analytics, no telemetry.
- No multi-device sync.
- No question editing UI — Python pipeline remains the author.
- No light theme. Dark only, by design.

---

## 10a. Local dev (Docker)

The frontend has its own compose file scoped to `/front-end` so it doesn't collide
with the Python `jupyter` service.

```bash
cd front-end
docker compose up --build          # first run installs deps, starts Vite on :5173
docker compose up                  # subsequent runs
docker compose down                # stop
```

Open http://localhost:5173 — live reload works via bind mount + polling
(`CHOKIDAR_USEPOLLING=true`, needed on Windows/WSL).

The compose file mounts `../data/processed` and `../study/quizzes` read-only into
`/app/data-src`. The `npm run sync-data` script (run automatically before `dev` and
`build` via `pre` hooks) copies `question_bank.json` + `exam_*.json` into
`public/data/` and writes `index.json`. Result: the Python pipeline stays the source
of truth, and the frontend always reads the latest bank on container start.

**Files added to `/front-end`:**
- `Dockerfile.dev` — node:20-alpine + `npm install` + `vite --host 0.0.0.0`
- `docker-compose.yml` — dev service on :5173 with bind mounts
- `.dockerignore`, `.gitignore`
- `package.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json`
- `index.html`, `src/main.ts`, `src/styles.css` — minimal scaffold
- `scripts/sync-data.mjs` — copy bank + exams into `public/data/`

**Build for production (local smoke test before Vercel):**
```bash
docker compose run --rm web npm run build
docker compose run --rm -p 4173:4173 web npm run preview
```

**Deploy to Vercel:** connect the repo, set **Root Directory** to `front-end`. Vercel
auto-detects Vite; `vercel.json` pins `buildCommand` and `outputDirectory`. The
`prebuild` hook runs `sync-data.mjs` there too — Vercel's build env has the repo
checked out so `../data/processed` and `../study/quizzes` resolve without the Docker
mount.

---

## 11. Milestones

1. **M1 — Scaffold (½ day):** Vite + TS, `vercel.json`, `sync-data.mjs`, home screen
   renders manifest + bank stats from localStorage.
2. **M2 — Configure + play loop (1 day):** setup screen, question renderer, keybinds,
   lock/skip/next, localStorage updates per answer.
3. **M3 — Sampling port (½ day):** TS port of `sample_questions` + unseen-first + ECO
   weights, including unit sanity checks against the Python output on a fixed seed.
4. **M4 — Results (½ day):** score, pass bands, per-domain bars, topics to review,
   retry-missed.
5. **M5 — Design polish (½ day):** fonts wired, spacing/typography pass, motion, focus
   states, reduced-motion. The product should feel *designed* before shipping.
6. **M6 — Deploy:** `vercel --prod` from `/front-end`.

---

## 12. Open questions

- **Bank size on Vercel:** `question_bank.json` is currently ~343 questions — well under
  1 MB, fine to ship as a single asset. Revisit if the bank grows past ~2 MB.
- **Topic-filtered retry** from the results screen: keep for v1 or defer? Recommendation:
  defer — `Retry missed` from the wrong list covers 90% of the value.
- **Video deep-links:** bank stores `video_segment` (timestamp range) but not the URL.
  Show as plain mono text for v1; wire URLs in a later pass if `sources.yml` starts
  shipping with the bank.

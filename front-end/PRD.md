# PRD — PMP Quiz (Web)

**Status:** Implemented · **Owner:** danielmschaves · **Updated:** 2026-05-08
**Scope:** Full-stack web SPA — Vite/TypeScript frontend, Supabase backend (PostgreSQL + Auth).
Deploys to Vercel.

---

## 1. Goal

Replace the Docker + CLI friction (`quiz_runner.py`) with a browser app that keeps
**every feature** of the Python runner but replaces the terminal look with a clean,
modern interface. Study on any device, progress syncs across devices automatically.

**Delivered from Python:** profile-based sampling (practice / standard / hard), static exam
files, question-count picker, domain filter, difficulty filter, unseen-first history,
skip, explanations on/off, live progress + ETA + running score, results with pass
thresholds (70% / 61%) and a "topics to review" list.

**Added beyond Python:** gated landing page, email/password auth, cross-device sync via
Supabase, study sessions (group multiple quizzes), exam mode, timer (countdown or
stopwatch), demo mode (15 free questions without an account).

---

## 2. Auth model

Login is required for all quiz routes. Supabase Auth handles email/password sign-up with
mandatory email confirmation. On login, the app pulls remote state and merges it into
localStorage. All quiz data is associated with `auth.uid()` via Row Level Security.

Public routes: `#/landing`, `#/login`, `#/signup`, `#/demo`.

Demo mode: a single 15-question quiz that works without an account. Gated so it clears
immediately after sign-in (config.demo flag on the quiz session).

---

## 3. Primary flow

1. **Landing** — hero page with "Get Started" and "Log In" CTAs, plus a "Try it free" demo link.
2. **Auth** — single view that renders in login or signup mode based on the route.
3. **Home** — stat strip (total / unseen / % covered), session banner (resume or start new).
4. **Session hub** — configure a study session: domain focus, question count, format.
5. **Play** — answer, optionally skip, see explanation, continue.
6. **Results** — score, pass banner, time, per-domain accuracy, topics to review.
7. **Session report** — full history of a completed study session across all its quizzes.

All routes live under a single hash-routed SPA. The auth guard in `main.ts` redirects
unauthenticated users to `#/landing` before any quiz route renders.

---

## 4. Data

### Backend (source of truth when logged in)

Questions live in a Supabase `questions` table. `src/lib/data.ts` fetches them with
1 000-row pagination so the full bank is always available regardless of table size.

Other Supabase tables:

| Table | Purpose |
|-------|---------|
| `profiles` | Display name, preferences (explanationsByDefault) |
| `user_progress` | One row per (user, question) — replaces `seen{}` in localStorage |
| `study_sessions` | Groups multiple quiz attempts |
| `quiz_attempts` | Question IDs + answer records (answers stored as JSONB) |
| `subscriptions` | Stripe placeholder — write via service_role only |

All tables have Row Level Security: every policy restricts to `auth.uid() = user_id`.

### Local cache (fast path, works offline)

`localStorage` key `pmp.v1` — `{ seen: Record<qId, isoTimestamp>, explanationsByDefault: boolean }`.
Active and completed study sessions live in `pmp.studySession.active` and
`pmp.studySession.history` (capped at 50).

### Sync strategy

- Writes go to localStorage first (zero latency).
- Fire-and-forget push to Supabase follows each write (`markSeen`, `endActiveStudySession`,
  `setExplanationsDefault`).
- On login: `pullAndMerge(userId)` fetches remote state and merges it into localStorage
  (union of seen IDs, earliest `seen_at` wins; remote sessions prepended to history).
- All push functions swallow errors silently so they never block the UI.

---

## 5. Stack

| Layer | Choice |
|-------|--------|
| Framework | Vite + vanilla TypeScript |
| Styling | Single `styles.css` with CSS custom properties |
| Fonts | Inter Tight (display/body) + IBM Plex Mono (numbers) — self-hosted woff2 |
| Routing | Hash routing (`#/play`, `#/login`, etc.) |
| State | `state.ts` + `session.ts` + localStorage |
| Backend | Supabase (PostgreSQL + Auth) |
| Client | `@supabase/supabase-js` v2 |
| Deploy | Vercel static |

Runtime dependencies: `@supabase/supabase-js`. Dev: `vite`, `typescript`, `vitest`.

---

## 6. Design

Dark, minimal, purposeful.

- **Colors:** background `#0F0F10`, card `#18191C`, border `#2A2B30`, text `#F4F4F5`
  (primary) / `#A1A1AA` (muted). Accent `oklch(70% 0.19 280)` (iris/indigo) for primary
  actions. `#4ADE80` for correct, `#F87171` for wrong.
- **Type:** Inter Tight for display headings, Inter for body, IBM Plex Mono for scores
  and counters. 16 px body, 20 px question.
- **Layout:** centered column, `app-shell` wrapper, `sticky-foot` for bottom action bars.
  8-pt spacing scale. Cards with 12 px radius, 1 px border — no shadows, no gradients.
- **Components:** `btn`, `chip`, `letter-glyph`, `dot-progress`, `stat-strip`, `toggle`.
- **Accessibility:** 4.5:1 contrast, visible focus rings, keyboard support,
  `prefers-reduced-motion` respected.

---

## 7. Screens

### Landing — `#/landing`
Hero with value prop, "Get Started" → `#/signup`, "Log In" → `#/login`, and
"Try a free demo" → `#/demo`.

### Auth — `#/login` · `#/signup`
Email + password fields, social placeholders (Google / Apple — not yet functional),
loading state, error banner, "Forgot?" placeholder, link to switch between modes.
On signup success: "Check your email" confirmation message.
On login success: `pullAndMerge()` then redirect to `#/`.

### Home — `#/`
Stat strip (`N questions · N unseen · N% covered`), session banner (resume active
session or start new), recent sessions list.

### Session hub — `#/session`
Configure a study session: domain, question count, exam mode toggle, explanations
toggle. Displays active session progress; can end the session to view the report.

### Play — `#/play`
Dot-progress bar, timer (countdown or stopwatch), question with four option buttons,
letter-glyph indicators, explanation block (study mode), Skip + Next footer.

### Results — `#/results`
Score, pass/borderline/needs-work chip, per-domain accuracy bars, topics to review,
"Retry missed" and "New session" actions.

### Session report — `#/session-report/:id`
Full history of a completed study session: total score, per-quiz breakdown, all
questions with picked answer and correct answer.

---

## 7a. Mobile

Primary use case is phone in hand — design is mobile-first.

- Touch targets ≥ 44×44 px everywhere.
- Option rows expand to full tap-height.
- Sticky footer with action buttons above safe-area.
- `env(safe-area-inset-*)` respected on top/bottom bars.
- `theme-color` meta matches app background.

---

## 8. File layout

```
front-end/
├── PRD.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── vercel.json
├── index.html
├── .env.example
├── public/
│   └── fonts/           ← InterTight-*.woff2, IBMPlexMono-*.woff2
├── scripts/
│   └── sync-data.mjs    ← copies exam JSON into public/data/ for CLI-compat fallback
├── tests/
│   ├── auth.test.ts
│   ├── play.test.ts
│   ├── render.test.ts
│   ├── sampling.test.ts
│   ├── session.test.ts
│   ├── state.test.ts
│   ├── sync.test.ts
│   ├── supabase-connection.test.ts   ← integration, skipped without credentials
│   ├── format.test.ts
│   └── fixtures.ts
└── src/
    ├── main.ts              ← router + async auth guard + onAuthChange listener
    ├── supabase.ts          ← Supabase client singleton (fail-fast on missing env)
    ├── auth.ts              ← signIn / signUp / signOut / getSession / onAuthChange
    ├── sync.ts              ← pullAndMerge + pushProgress/StudySession/Preferences/deleteProgress
    ├── state.ts             ← seen{} + explanationsByDefault (localStorage + sync hooks)
    ├── session.ts           ← StudySession / QuizAttempt lifecycle + sync on end
    ├── sampling.ts          ← ECO-weighted sampling, unseen-first, PRNG seed
    ├── types.ts
    └── views/
    │   ├── landing.ts       ← public hero page
    │   ├── auth.ts          ← login / signup form (shared component)
    │   ├── home.ts          ← post-login home with stats + session banner
    │   ├── setup.ts         ← quiz configurator
    │   ├── play.ts          ← question player
    │   ├── results.ts       ← quiz results
    │   ├── session-hub.ts   ← study session dashboard
    │   └── session-report.ts
    └── lib/
        ├── data.ts          ← paginated Supabase question bank loader + cache
        ├── format.ts        ← ETA, time, percent formatters
        ├── keys.ts          ← keyboard shortcut dispatcher
        ├── analytics.ts
        ├── prng.ts          ← mulberry32 PRNG for seed support
        ├── sections.ts
        ├── source_links.ts
        └── storage.ts
```

---

## 9. Sampling logic (direct TS port of Python)

```ts
const PROFILES = {
  practice: { easy: 0.45, medium: 0.40, hard: 0.12, expert: 0.03 },
  standard: { easy: 0.25, medium: 0.40, hard: 0.25, expert: 0.10 },
  hard:     { easy: 0.05, medium: 0.20, hard: 0.45, expert: 0.30 },
};
const ECO = { 1: 0.42, 2: 0.50, 3: 0.08 };
const FULL_EXAM_SIZE = 180;
```

- `count < 50` or any filter active → unseen-first random draw, take first N.
- Otherwise → ECO-weighted domain buckets × difficulty fractions, then top-up.
- `sort_unseen_first` matches Python: unseen shuffled, then seen sorted oldest-first.
- Seed via `?seed=N` feeds a mulberry32 PRNG for reproducible question order.

---

## 10. Environment variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Both must be set or the app throws on startup (`supabase.ts` fail-fast). The anon key is
safe in the frontend — RLS enforces per-user data access. Never put the service role key
in the frontend.

---

## 11. Local dev (Docker)

```bash
cd front-end
cp .env.example .env          # fill in Supabase credentials
docker compose up --build     # first run: installs deps, starts Vite on :5173
docker compose up             # subsequent runs
docker compose down
```

Open http://localhost:5173 — live reload via bind mount + polling
(`CHOKIDAR_USEPOLLING=true`, needed on Windows/WSL).

**Tests:**
```bash
docker compose run --rm web npm test
```
110 unit tests via Vitest + jsdom. The Supabase integration test (`supabase-connection.test.ts`)
is skipped automatically when credentials aren't configured.

**Production build (local smoke test):**
```bash
docker compose run --rm web npm run build
docker compose run --rm -p 4173:4173 web npm run preview
```

**Deploy to Vercel:** connect the repo, set Root Directory to `front-end`, add Supabase
env vars in Project → Settings → Environment Variables.

---

## 12. Non-goals / deferred

- No PWA or offline manifest (browser cache is sufficient for now).
- Google / Apple OAuth — placeholders exist in the auth view; implementation deferred.
- Password reset — "Forgot?" shows "not yet available"; full flow deferred.
- Stripe billing integration — `subscriptions` table exists but no checkout flow yet.
- Light theme — dark only, by design.
- Question editing UI — Python pipeline remains the author.

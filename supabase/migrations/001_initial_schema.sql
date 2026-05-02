-- ── profiles ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text,
  avatar_url  text,
  preferences jsonb default '{"explanationsByDefault": true}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- ── user_progress ─────────────────────────────────────────────────────────────
-- One row per (user, question). Mirrors seen{} in localStorage / pmp.v1.
create table public.user_progress (
  user_id     uuid references auth.users(id) on delete cascade,
  question_id text         not null,
  seen_at     timestamptz  not null,
  primary key (user_id, question_id)
);

alter table public.user_progress enable row level security;
create policy "own progress select" on public.user_progress for select using (auth.uid() = user_id);
create policy "own progress insert" on public.user_progress for insert with check (auth.uid() = user_id);
create policy "own progress update" on public.user_progress for update using (auth.uid() = user_id);

-- ── study_sessions ────────────────────────────────────────────────────────────
-- Mirrors pmp.studySession.history in localStorage (capped at 50).
create table public.study_sessions (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  started_at timestamptz not null,
  ended_at   timestamptz,
  created_at timestamptz default now()
);

alter table public.study_sessions enable row level security;
create policy "own sessions select" on public.study_sessions for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.study_sessions for insert with check (auth.uid() = user_id);
create policy "own sessions update" on public.study_sessions for update using (auth.uid() = user_id);

-- ── quiz_attempts ─────────────────────────────────────────────────────────────
-- Lightweight: question IDs + answer records only. Full question text stays in
-- the bundled JSON; the frontend reconstructs QuizAttempt by joining on id.
create table public.quiz_attempts (
  id             text primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  session_id     text references public.study_sessions(id) on delete cascade,
  config         jsonb   not null,   -- SessionConfig
  question_ids   text[]  not null,   -- ordered question ids
  answers        jsonb   not null,   -- [{picked, correct, ms}] parallel array
  score_correct  int     not null,
  score_answered int     not null,
  score_total    int     not null,
  started_at     timestamptz not null,
  finished_at    timestamptz not null,
  created_at     timestamptz default now()
);

alter table public.quiz_attempts enable row level security;
create policy "own attempts select" on public.quiz_attempts for select using (auth.uid() = user_id);
create policy "own attempts insert" on public.quiz_attempts for insert with check (auth.uid() = user_id);

-- ── subscriptions (Stripe placeholder) ───────────────────────────────────────
-- Written only via service_role (Stripe webhook). Users can read their own row.
create table public.subscriptions (
  id                   text primary key,  -- Stripe subscription ID
  user_id              uuid references auth.users(id) on delete cascade not null,
  status               text check (status in ('active','trialing','past_due','canceled','incomplete')),
  price_id             text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table public.subscriptions enable row level security;
create policy "own subscription select" on public.subscriptions for select using (auth.uid() = user_id);

-- ── auto-create profile on signup ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

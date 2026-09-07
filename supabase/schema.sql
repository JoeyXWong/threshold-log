-- Threshold Log — run once in Supabase → SQL Editor.
-- One row per user holding the whole app state as JSON.

create table if not exists public.training_logs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.training_logs enable row level security;

-- Each user can only see and write their own row.
create policy "own row: select" on public.training_logs
  for select using (auth.uid() = user_id);

create policy "own row: insert" on public.training_logs
  for insert with check (auth.uid() = user_id);

create policy "own row: update" on public.training_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row: delete" on public.training_logs
  for delete using (auth.uid() = user_id);

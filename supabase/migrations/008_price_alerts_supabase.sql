-- ============================================================
-- Migration 008: Move price alerts from localStorage to Supabase
-- ============================================================
create table if not exists price_alerts_db (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  ticker text not null,
  target_price decimal(15, 4) not null,
  direction text not null check (direction in ('above', 'below')),
  note text default '',
  triggered boolean not null default false,
  created_at timestamptz not null default now()
);
alter table price_alerts_db enable row level security;
create policy "Users manage their own alerts" on price_alerts_db
  for all using (auth.uid() = user_id);
create policy "Club members view club alerts" on price_alerts_db
  for select using (is_club_member(club_id));

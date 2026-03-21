-- ============================================================
-- Migration 006: Proposal discussion comments
-- ============================================================
create table if not exists proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade not null,
  club_id uuid references clubs(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  user_name text,
  content text not null,
  created_at timestamptz not null default now()
);
alter table proposal_comments enable row level security;
create policy "Members view proposal comments" on proposal_comments
  for select using (is_club_member(club_id));
create policy "Members post proposal comments" on proposal_comments
  for insert with check (is_club_member(club_id) and auth.uid() = user_id);

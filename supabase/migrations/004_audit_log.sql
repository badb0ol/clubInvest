-- ============================================================
-- Migration 004: Audit log
-- ============================================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade not null,
  user_id uuid references auth.users(id),
  user_name text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table audit_log enable row level security;
create policy "Members can view audit log" on audit_log
  for select using (is_club_member(club_id));
create policy "Members can insert audit entries" on audit_log
  for insert with check (is_club_member(club_id) and auth.uid() = user_id);

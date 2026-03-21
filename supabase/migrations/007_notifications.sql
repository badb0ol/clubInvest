-- ============================================================
-- Migration 007: In-app notification center
-- ============================================================
create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table app_notifications enable row level security;
create policy "Users see own notifications" on app_notifications
  for select using (auth.uid() = user_id);
create policy "Members insert notifications" on app_notifications
  for insert with check (is_club_member(club_id));
create policy "Users mark own as read" on app_notifications
  for update using (auth.uid() = user_id);

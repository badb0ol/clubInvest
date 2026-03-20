
-- ============================================================
-- RLS SECURITY SCRIPT - ClubInvest
-- Run this AFTER schema.sql
-- Safe to re-run: uses CREATE OR REPLACE and DROP IF EXISTS
-- ============================================================

-- 1. HELPER FUNCTIONS

create or replace function is_club_admin(check_club_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from club_members
    where club_id = check_club_id
      and user_id = auth.uid()
      and role = 'admin'
  );
end;
$$ language plpgsql security definer;

create or replace function is_club_member(check_club_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from club_members
    where club_id = check_club_id
      and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;


-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================

alter table profiles enable row level security;

drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
on profiles for select
using ( auth.uid() = id );

-- Members need to see each other's profiles (for name display)
drop policy if exists "Members can view club peers profiles" on profiles;
create policy "Members can view club peers profiles"
on profiles for select
using (
  exists (
    select 1 from club_members cm1
    join club_members cm2 on cm1.club_id = cm2.club_id
    where cm1.user_id = auth.uid()
      and cm2.user_id = profiles.id
  )
);

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
on profiles for insert
with check ( auth.uid() = id );

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
on profiles for update
using ( auth.uid() = id );


-- ============================================================
-- 3. CLUBS TABLE
-- ============================================================

alter table clubs enable row level security;

drop policy if exists "Clubs are viewable by members" on clubs;
create policy "Clubs are viewable by members"
on clubs for select
using (
  exists (
    select 1 from club_members
    where club_members.club_id = id
      and club_members.user_id = auth.uid()
  )
);

-- Allows invite-code lookup before joining (OnboardingScreen.handleJoin)
drop policy if exists "Anyone authenticated can look up club by invite code" on clubs;
create policy "Anyone authenticated can look up club by invite code"
on clubs for select
using ( auth.role() = 'authenticated' );

drop policy if exists "Users can create clubs" on clubs;
create policy "Users can create clubs"
on clubs for insert
with check ( auth.role() = 'authenticated' );

drop policy if exists "Admins can update their club" on clubs;
create policy "Admins can update their club"
on clubs for update
using ( is_club_admin(id) );


-- ============================================================
-- 4. CLUB_MEMBERS TABLE
-- ============================================================

alter table club_members enable row level security;

drop policy if exists "Members viewable by peers" on club_members;
create policy "Members viewable by peers"
on club_members for select
using ( is_club_member(club_id) );

drop policy if exists "Users can join clubs" on club_members;
create policy "Users can join clubs"
on club_members for insert
with check ( auth.uid() = user_id );

drop policy if exists "Admins manage members" on club_members;
create policy "Admins manage members"
on club_members for update
using ( is_club_admin(club_id) );

drop policy if exists "Admins remove members" on club_members;
create policy "Admins remove members"
on club_members for delete
using ( is_club_admin(club_id) );


-- ============================================================
-- 5. ASSETS TABLE
-- ============================================================

alter table assets enable row level security;

drop policy if exists "Members view assets" on assets;
create policy "Members view assets"
on assets for select
using ( is_club_member(club_id) );

-- "for all" covers INSERT, UPDATE, DELETE for admins
drop policy if exists "Admins manage assets" on assets;
create policy "Admins manage assets"
on assets for all
using ( is_club_admin(club_id) )
with check ( is_club_admin(club_id) );


-- ============================================================
-- 6. TRANSACTIONS TABLE
-- ============================================================

alter table transactions enable row level security;

drop policy if exists "Members view transactions" on transactions;
create policy "Members view transactions"
on transactions for select
using ( is_club_member(club_id) );

drop policy if exists "Admins create transactions" on transactions;
create policy "Admins create transactions"
on transactions for insert
with check ( is_club_admin(club_id) );


-- ============================================================
-- 7. NAV_HISTORY TABLE
-- ============================================================

alter table nav_history enable row level security;

drop policy if exists "Members view history" on nav_history;
create policy "Members view history"
on nav_history for select
using ( is_club_member(club_id) );

drop policy if exists "Admins snapshot nav" on nav_history;
create policy "Admins snapshot nav"
on nav_history for insert
with check ( is_club_admin(club_id) );

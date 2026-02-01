
-- --- RLS SECURITY SCRIPT ---

-- 1. Helper Function to check Admin Status
-- Returns true if the current user is an admin of the specified club
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

-- 2. Helper Function to check Membership
-- Returns true if the current user is a member of the specified club
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

-- 3. CLUBS TABLE
-- Read: Anyone can read basic club info (for joining) - OR strict: only members. 
-- Let's stick to "Only members can see full details", but we need to see invite code to join? 
-- Actually, usually you join by code blindly, or you need to see it to check if it's the right one.
-- For simplicity & security: Only members can select rows.
-- Create: Authenticated users can create a club.
-- Update: Only Admins.

alter table clubs enable row level security;

create policy "Clubs are viewable by members"
on clubs for select
using (
  exists (
    select 1 from club_members
    where club_members.club_id = id
    and club_members.user_id = auth.uid()
  )
  -- Optional: OR allow seeing club by invite code lookup (requires specific query structure)
);

create policy "Users can create clubs"
on clubs for insert
with check ( auth.role() = 'authenticated' );

create policy "Admins can update their club"
on clubs for update
using ( is_club_admin(id) );


-- 4. CLUB MEMBERS
-- Read: Members can see other members of their club.
-- Insert: Users can join (insert themselves).
-- Update: Admins can update roles/shares.

alter table club_members enable row level security;

create policy "Members viewable by peers"
on club_members for select
using ( is_club_member(club_id) );

create policy "Users can join clubs"
on club_members for insert
with check ( auth.uid() = user_id );

create policy "Admins manage members"
on club_members for update
using ( is_club_admin(club_id) );

create policy "Admins remove members"
on club_members for delete
using ( is_club_admin(club_id) );


-- 5. ASSETS
-- Read: Members.
-- Write: Admins only.

alter table assets enable row level security;

create policy "Members view assets"
on assets for select
using ( is_club_member(club_id) );

create policy "Admins manage assets"
on assets for all
using ( is_club_admin(club_id) );


-- 6. TRANSACTIONS
-- Read: Members.
-- Write: Admins only.

alter table transactions enable row level security;

create policy "Members view transactions"
on transactions for select
using ( is_club_member(club_id) );

create policy "Admins create transactions"
on transactions for insert
with check ( is_club_admin(club_id) );

-- 7. NAV HISTORY
-- Read: Members.
-- Write: Admins only.

alter table nav_history enable row level security;

create policy "Members view history"
on nav_history for select
using ( is_club_member(club_id) );

create policy "Admins snapshot nav"
on nav_history for insert
with check ( is_club_admin(club_id) );

-- ============================================================
-- Patch 002b : Allow members to update vote counts on proposals
-- Run this in Supabase SQL Editor if you already ran 002
-- ============================================================

-- Members can update vote counts on pending proposals
drop policy if exists "Members update vote counts" on proposals;
create policy "Members update vote counts" on proposals
  for update using (
    is_club_member(club_id)
    and status in ('pending', 'approved', 'rejected')
  )
  with check (
    is_club_member(club_id)
  );

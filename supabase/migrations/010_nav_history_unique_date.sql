-- ============================================================
-- Migration 010: Unique constraint on nav_history (club_id, date)
-- Allows upsert by date so auto-snapshots don't duplicate entries
-- ============================================================

-- Add unique constraint if not already present
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_history_club_id_date_key'
  ) then
    alter table nav_history add constraint nav_history_club_id_date_key unique (club_id, date);
  end if;
end $$;

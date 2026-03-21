-- ============================================================
-- Migration 009: Ticker metadata cache (sector, country, name)
-- ============================================================
create table if not exists ticker_metadata (
  ticker text primary key,
  company_name text,
  sector text,
  industry text,
  country text,
  exchange text,
  fetched_at timestamptz not null default now()
);
alter table ticker_metadata enable row level security;
create policy "Authenticated users can read metadata" on ticker_metadata
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert metadata" on ticker_metadata
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update metadata" on ticker_metadata
  for update using (auth.role() = 'authenticated');

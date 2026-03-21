-- ============================================================
-- Migration 003: Price cache, quorum voting, club dissolution
-- ============================================================

-- Price cache
create table if not exists asset_prices (
  ticker text primary key,
  price decimal(15, 4) not null,
  fetched_at timestamptz not null default now()
);
alter table asset_prices enable row level security;
create policy "Authenticated users can read prices" on asset_prices
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can upsert prices" on asset_prices
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update prices" on asset_prices
  for update using (auth.role() = 'authenticated');

-- Quorum on clubs
alter table clubs add column if not exists quorum_pct integer not null default 60 check (quorum_pct between 1 and 100);

-- Club dissolution status
alter table clubs add column if not exists status text not null default 'active' check (status in ('active', 'dissolving', 'dissolved'));
alter table clubs add column if not exists dissolved_at timestamptz;

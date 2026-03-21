-- ============================================================
-- Migration 002 : Système de vote / Propositions d'investissement
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Table des propositions de trade
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade not null,
  proposer_id uuid references auth.users(id) not null,
  proposer_name text,
  type text not null check (type in ('BUY', 'SELL')),
  ticker text not null,
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'USD')),
  thesis text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed')),
  votes_for integer not null default 0,
  votes_against integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- Table des votes
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  vote text not null check (vote in ('for', 'against')),
  created_at timestamptz not null default now(),
  unique(proposal_id, user_id)
);

-- RLS
alter table proposals enable row level security;
alter table votes enable row level security;

-- Policies proposals
drop policy if exists "Members view proposals" on proposals;
create policy "Members view proposals" on proposals
  for select using ( is_club_member(club_id) );

drop policy if exists "Members create proposals" on proposals;
create policy "Members create proposals" on proposals
  for insert with check ( is_club_member(club_id) and auth.uid() = proposer_id );

drop policy if exists "Admins update proposals" on proposals;
create policy "Admins update proposals" on proposals
  for update using ( is_club_admin(club_id) );

-- Policies votes
drop policy if exists "Members cast votes" on votes;
create policy "Members cast votes" on votes
  for insert with check (
    exists (
      select 1 from proposals p
      where p.id = proposal_id
        and is_club_member(p.club_id)
        and p.status = 'pending'
    )
    and auth.uid() = user_id
  );

drop policy if exists "Members view votes" on votes;
create policy "Members view votes" on votes
  for select using (
    exists (
      select 1 from proposals p
      where p.id = proposal_id and is_club_member(p.club_id)
    )
  );

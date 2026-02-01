-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. CLUBS TABLE
create table clubs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text not null unique,
  currency text default 'EUR' check (currency in ('EUR', 'USD')),
  cash_balance decimal(15, 2) default 0.00,
  total_shares decimal(15, 4) default 0.0000,
  created_at timestamp with time zone default now()
);

-- 2. PROFILES (Users)
-- Assumes auth.users exists from Supabase Auth
create table profiles (
  id uuid primary key references auth.users(id),
  email text,
  full_name text,
  avatar_url text
);

-- 3. CLUB MEMBERS (Join Table)
create table club_members (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  user_id uuid references profiles(id),
  role text default 'member' check (role in ('admin', 'member')),
  shares_owned decimal(15, 4) default 0.0000,
  total_invested_fiat decimal(15, 2) default 0.00,
  joined_at timestamp with time zone default now(),
  unique(club_id, user_id)
);

-- 4. ASSETS
create table assets (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  ticker text not null,
  quantity decimal(15, 4) default 0.0000,
  avg_buy_price decimal(15, 2) default 0.00,
  currency text default 'USD' check (currency in ('EUR', 'USD')),
  updated_at timestamp with time zone default now()
);

-- 5. TRANSACTIONS (The Journal)
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  user_id uuid references profiles(id), -- Nullable for system actions
  type text not null check (type in ('DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL')),
  amount_fiat decimal(15, 2), -- The cash impact
  shares_change decimal(15, 4), -- The shares impact (for deposit/withdraw)
  asset_ticker text,
  price_at_transaction decimal(15, 2),
  realized_gain decimal(15, 2), -- Capital Gain on Sell
  tax_estimate decimal(15, 2), -- Estimated PFU (Flat Tax) on Withdrawal
  created_at timestamp with time zone default now()
);

-- 6. NAV HISTORY (For Charts)
create table nav_history (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid references clubs(id) on delete cascade,
  date date default current_date,
  nav_per_share decimal(15, 4) not null,
  total_net_assets decimal(15, 2) not null,
  recorded_at timestamp with time zone default now()
);

-- ROW LEVEL SECURITY (RLS) POLICIES
alter table clubs enable row level security;
alter table club_members enable row level security;
alter table assets enable row level security;
alter table transactions enable row level security;
alter table nav_history enable row level security;

-- Example Policy: Members can only see their own club data
create policy "Members can see data for their club"
on assets
for select
using (
  exists (
    select 1 from club_members
    where club_members.club_id = assets.club_id
    and club_members.user_id = auth.uid()
  )
);
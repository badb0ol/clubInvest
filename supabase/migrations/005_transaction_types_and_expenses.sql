-- ============================================================
-- Migration 005: Extend transaction types (DIVIDEND, EXPENSE)
-- and add description column
-- ============================================================
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'SNAPSHOT', 'DIVIDEND', 'EXPENSE'));
alter table transactions add column if not exists description text;

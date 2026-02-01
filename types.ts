
export type Currency = 'EUR' | 'USD';
export type Role = 'admin' | 'member';
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL';

export interface Club {
  id: string;
  name: string;
  invite_code: string;
  currency: Currency;
  cash_balance: number;
  total_shares: number;
  tax_liability: number; // Provision pour Flat Tax (30%)
  linked_bank?: string; // Name of connected bank (e.g. "Trade Republic")
}

export interface Member {
  id: string; // Internal ID
  user_id: string; // Link to profile
  club_id: string;
  full_name: string;
  role: Role;
  shares_owned: number;
  total_invested_fiat: number;
  joined_at: string;
}

export interface Asset {
  id: string;
  club_id: string;
  ticker: string;
  quantity: number;
  avg_buy_price: number;
  currency: Currency;
}

export interface Transaction {
  id: string;
  club_id: string;
  user_id?: string;
  user_name?: string; // Denormalized for display
  type: TransactionType;
  amount_fiat: number;
  shares_change?: number;
  asset_ticker?: string;
  price_at_transaction?: number;
  realized_gain?: number; // For SELL orders (P&L)
  tax_estimate?: number; // For WITHDRAWALS (30% PFU on gains)
  created_at: string;
}

export interface NavEntry {
  id: string;
  club_id: string;
  date: string;
  nav_per_share: number;
  total_net_assets: number;
}

export interface PortfolioSummary {
  totalNetAssets: number;
  navPerShare: number;
  totalLatentPL: number; // Profit/Loss
  dayVariationPercent: number;
  totalShares: number;
  totalTaxLiability: number;
  cashBalance: number;
}

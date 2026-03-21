export type Currency = 'EUR' | 'USD';
export type Role = 'admin' | 'member';
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'DIVIDEND' | 'EXPENSE';

export interface Club {
  id: string;
  name: string;
  invite_code: string;
  currency: Currency;
  cash_balance: number;
  total_shares: number;
  tax_liability: number;
  linked_bank?: string;
  quorum_pct: number; // Min participation % for vote to close (default 60)
  status: 'active' | 'dissolving' | 'dissolved';
  dissolved_at?: string;
}

export interface Member {
  id: string;
  user_id: string;
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
  user_name?: string;
  type: TransactionType;
  amount_fiat: number;
  shares_change?: number;
  asset_ticker?: string;
  price_at_transaction?: number;
  realized_gain?: number;
  tax_estimate?: number;
  description?: string; // For EXPENSE and DIVIDEND transactions
  created_at: string;
}

export interface NavEntry {
  id: string;
  club_id: string;
  date: string;
  nav_per_share: number;
  total_net_assets: number;
}

export interface Message {
  id: string;
  club_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  type: 'message' | 'announcement';
  created_at: string;
}

export interface PortfolioSummary {
  totalNetAssets: number;
  navPerShare: number;
  totalLatentPL: number;
  dayVariationPercent: number;
  totalShares: number;
  totalTaxLiability: number;
  cashBalance: number;
}

export interface Proposal {
  id: string;
  club_id: string;
  proposer_id: string;
  proposer_name?: string;
  type: 'BUY' | 'SELL';
  ticker: string;
  quantity: number;
  price: number;
  currency: Currency;
  thesis: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  votes_for: number;
  votes_against: number;
  created_at: string;
  expires_at: string;
}

export interface ProposalComment {
  id: string;
  proposal_id: string;
  club_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  created_at: string;
}

export interface PriceAlert {
  id: string;
  club_id?: string;
  user_id?: string;
  ticker: string;
  targetPrice: number;
  direction: 'above' | 'below';
  note: string;
  triggered: boolean;
  createdAt: string;
}

export interface DividendEntry {
  ticker: string;
  amount: number;
  date: string;
  currency: string;
}

export interface AuditEntry {
  id: string;
  club_id: string;
  user_id?: string;
  user_name?: string;
  action: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  club_id: string;
  user_id: string;
  type: 'PRICE_ALERT' | 'VOTE_RESULT' | 'NEW_PROPOSAL' | 'DIVIDEND' | 'EXPENSE' | 'MEMBER_JOINED' | 'DISSOLUTION';
  title: string;
  body?: string;
  read: boolean;
  created_at: string;
}

export interface TickerMetadata {
  ticker: string;
  company_name?: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  fetched_at: string;
}

export interface TickerSearchResult {
  symbol: string;
  instrument_name: string;
  exchange: string;
  country: string;
  type: string;
}

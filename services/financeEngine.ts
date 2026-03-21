
import { Asset, Club, Currency, DividendEntry, PortfolioSummary } from '../types';

// API Configuration
const API_KEY = import.meta.env.VITE_TWELVE_DATA_API_KEY; 
const BASE_URL = 'https://api.twelvedata.com/price';

// Mock Exchange Rates (For demo purposes, in prod fetch this too)
const EXCHANGE_RATES: Record<string, number> = {
  'USD-EUR': 0.95, 
  'EUR-USD': 1.05, 
  'EUR-EUR': 1,
  'USD-USD': 1,
};

export const convertCurrency = (amount: number, from: Currency, to: Currency): number => {
  if (from === to) return amount;
  const key = `${from}-${to}`;
  const rate = EXCHANGE_RATES[key] || 1;
  return amount * rate;
};

/**
 * Real API Call to Twelve Data
 */
export const fetchAssetPrice = async (ticker: string): Promise<number> => {
  try {
      const cleanTicker = ticker.trim().toUpperCase();
      
      // Call API
      const response = await fetch(`${BASE_URL}?symbol=${cleanTicker}&apikey=${API_KEY}`);
      const data = await response.json();

      // Check for valid price in response
      if (data.price) {
          return parseFloat(data.price);
      }

      // Error Handling (Rate limit or invalid ticker)
      console.warn(`[FinanceEngine] API Error for ${cleanTicker}:`, data);
      
      // Fallback strategies for demo stability if API fails
      if (data.code === 429) {
          console.warn("API Rate Limit Reached. Using fallback.");
          return 0; 
      }

      return 0;

  } catch (error) {
      console.error("[FinanceEngine] Network Error:", error);
      return 0;
  }
};

/**
 * Fetch historical benchmark data (normalized to 100 at start)
 * Returns [{date, value}] where value is % performance from start
 */
export const fetchBenchmarkHistory = async (symbol: string): Promise<{ date: string; value: number }[]> => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=2y`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const timestamps: number[] = json?.chart?.result?.[0]?.timestamp || [];
    const closes: number[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    if (!timestamps.length || !closes.length) return [];
    const base = closes.find(c => c != null) || closes[0];
    if (!base) return [];
    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      value: closes[i] != null ? parseFloat(((closes[i] / base) * 100).toFixed(2)) : NaN
    })).filter(d => !isNaN(d.value));
  } catch {
    return [];
  }
};

/**
 * Fetch recent dividend history for a ticker via Yahoo Finance
 */
export const fetchDividendHistory = async (ticker: string): Promise<DividendEntry[]> => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=2y&events=div`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const currency = json?.chart?.result?.[0]?.meta?.currency || 'USD';
    const divEvents = json?.chart?.result?.[0]?.events?.dividends || {};
    return Object.values(divEvents).map((d: any) => ({
      ticker: ticker.toUpperCase(),
      amount: parseFloat(d.amount?.toFixed(4) || '0'),
      date: new Date(d.date * 1000).toISOString().split('T')[0],
      currency
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
};

/**
 * Calculate NAV (Quote-part) based on real prices
 */
export const calculateNav = (
  club: Club,
  assets: Asset[],
  prices: Record<string, number>
): PortfolioSummary => {
  let totalAssetValueEur = 0;
  let totalCostBasisEur = 0;

  assets.forEach((asset) => {
    // Use real price if available, otherwise fallback to buy price to prevent crash
    const currentPrice = prices[asset.ticker] || asset.avg_buy_price; 
    
    // Convert Value to Club Currency
    const assetValueNative = asset.quantity * currentPrice;
    const assetValueEur = convertCurrency(assetValueNative, asset.currency, club.currency);
    
    // Convert Cost Basis
    const costBasisNative = asset.quantity * asset.avg_buy_price;
    const costBasisEur = convertCurrency(costBasisNative, asset.currency, club.currency);

    totalAssetValueEur += assetValueEur;
    totalCostBasisEur += costBasisEur;
  });

  // Net Assets = Assets + Cash - Liabilities (Tax)
  const totalNetAssets = (totalAssetValueEur + club.cash_balance) - club.tax_liability;
  
  // NAV per Share
  const navPerShare = club.total_shares > 0 
    ? totalNetAssets / club.total_shares 
    : 100; // Baseline

  const totalLatentPL = totalAssetValueEur - totalCostBasisEur;
  
  // Variation Calculation
  const dayVariationPercent = totalCostBasisEur > 0
    ? (totalLatentPL / totalCostBasisEur) * 100
    : 0;

  return {
    totalNetAssets: parseFloat(totalNetAssets.toFixed(2)),
    navPerShare: parseFloat(navPerShare.toFixed(4)),
    totalLatentPL: parseFloat(totalLatentPL.toFixed(2)),
    dayVariationPercent: parseFloat(dayVariationPercent.toFixed(2)),
    totalShares: club.total_shares,
    totalTaxLiability: club.tax_liability,
    cashBalance: club.cash_balance
  };
};

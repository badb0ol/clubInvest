import { Asset, Club, Currency, DividendEntry, PortfolioSummary, TickerSearchResult, TickerMetadata } from '../types';
import { supabase } from '../lib/supabaseClient';

// API Configuration
const TWELVE_DATA_KEY = import.meta.env.VITE_TWELVE_DATA_API_KEY;
const TWELVE_BASE = 'https://api.twelvedata.com';

// ─── EXCHANGE RATES ──────────────────────────────────────────────────────────

let cachedRates: Record<string, number> = {
  'USD-EUR': 0.92,
  'EUR-USD': 1.09,
  'EUR-EUR': 1,
  'USD-USD': 1,
};

export const fetchLiveExchangeRates = async (): Promise<void> => {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    if (!res.ok) return;
    const data = await res.json();
    const usdToEur = data?.rates?.EUR;
    if (usdToEur) {
      cachedRates['USD-EUR'] = usdToEur;
      cachedRates['EUR-USD'] = parseFloat((1 / usdToEur).toFixed(6));
    }
  } catch {
    // Silently fall back to cached rates
  }
};

export const convertCurrency = (amount: number, from: Currency, to: Currency): number => {
  if (from === to) return amount;
  const key = `${from}-${to}`;
  return amount * (cachedRates[key] || 1);
};

// ─── LIVE PRICE WITH SUPABASE CACHE ──────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const fetchAssetPrice = async (ticker: string): Promise<number> => {
  const clean = ticker.trim().toUpperCase();

  // 1. Check Supabase cache
  try {
    const { data } = await supabase
      .from('asset_prices')
      .select('price, fetched_at')
      .eq('ticker', clean)
      .maybeSingle();

    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_TTL_MS) {
      return parseFloat(data.price);
    }
  } catch {
    // Cache unavailable — proceed to API
  }

  // 2. Fetch from Twelve Data
  try {
    const res = await fetch(`${TWELVE_BASE}/price?symbol=${clean}&apikey=${TWELVE_DATA_KEY}`);
    const json = await res.json();
    if (!json.price) {
      console.warn(`[FinanceEngine] No price for ${clean}:`, json);
      return 0;
    }
    const price = parseFloat(json.price);

    // 3. Upsert into cache
    await supabase.from('asset_prices').upsert({ ticker: clean, price, fetched_at: new Date().toISOString() });

    return price;
  } catch (err) {
    console.error('[FinanceEngine] Network error:', err);
    return 0;
  }
};

// Batch fetch with cache — replaces Promise.all calls in App.tsx
export const fetchPricesWithCache = async (tickers: string[]): Promise<Record<string, number>> => {
  const results: Record<string, number> = {};
  await Promise.all(tickers.map(async t => {
    results[t] = await fetchAssetPrice(t);
  }));
  return results;
};

// ─── HISTORICAL DATA (via Edge Function proxy) ───────────────────────────────

export const fetchBenchmarkHistory = async (symbol: string): Promise<{ date: string; value: number }[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('get-chart-data', {
      body: { symbol, interval: '1mo', range: '2y' }
    });
    if (error || !data) return [];
    const timestamps: number[] = data?.chart?.result?.[0]?.timestamp || [];
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    if (!timestamps.length) return [];
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

export const fetchDividendHistory = async (ticker: string): Promise<DividendEntry[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('get-chart-data', {
      body: { symbol: ticker, interval: '1mo', range: '2y', events: 'div' }
    });
    if (error || !data) return [];
    const currency = data?.chart?.result?.[0]?.meta?.currency || 'USD';
    const divEvents = data?.chart?.result?.[0]?.events?.dividends || {};
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

export const fetchAssetHistory = async (ticker: string, range: string = '1y'): Promise<{ date: string; close: number }[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('get-chart-data', {
      body: { symbol: ticker, interval: '1d', range }
    });
    if (error || !data) return [];
    const timestamps: number[] = data?.chart?.result?.[0]?.timestamp || [];
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i] ?? 0
    })).filter(d => d.close > 0);
  } catch {
    return [];
  }
};

// ─── TICKER SEARCH & METADATA ─────────────────────────────────────────────────

export const searchTickers = async (query: string): Promise<TickerSearchResult[]> => {
  if (!query || query.length < 1) return [];
  try {
    const res = await fetch(`${TWELVE_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${TWELVE_DATA_KEY}`);
    const json = await res.json();
    return (json?.data || []).slice(0, 8).map((item: any) => ({
      symbol: item.symbol,
      instrument_name: item.instrument_name,
      exchange: item.exchange,
      country: item.country,
      type: item.instrument_type
    }));
  } catch {
    return [];
  }
};

export const fetchTickerMetadata = async (ticker: string): Promise<TickerMetadata | null> => {
  const clean = ticker.trim().toUpperCase();
  const META_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Check Supabase cache first
  try {
    const { data } = await supabase
      .from('ticker_metadata')
      .select('*')
      .eq('ticker', clean)
      .maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < META_TTL_MS) {
      return data as TickerMetadata;
    }
  } catch { /* ignore */ }

  // Fetch from Twelve Data profile
  try {
    const res = await fetch(`${TWELVE_BASE}/profile?symbol=${clean}&apikey=${TWELVE_DATA_KEY}`);
    const json = await res.json();
    if (!json || json.status === 'error') return null;
    const meta: TickerMetadata = {
      ticker: clean,
      company_name: json.name,
      sector: json.sector,
      industry: json.industry,
      country: json.country,
      exchange: json.exchange,
      fetched_at: new Date().toISOString()
    };
    await supabase.from('ticker_metadata').upsert(meta);
    return meta;
  } catch {
    return null;
  }
};

// ─── PORTFOLIO ANALYTICS ─────────────────────────────────────────────────────

export const calculateNav = (
  club: Club,
  assets: Asset[],
  prices: Record<string, number>
): PortfolioSummary => {
  let totalAssetValueEur = 0;
  let totalCostBasisEur = 0;

  assets.forEach((asset) => {
    const currentPrice = prices[asset.ticker] || asset.avg_buy_price;
    const assetValueEur = convertCurrency(asset.quantity * currentPrice, asset.currency, club.currency);
    const costBasisEur = convertCurrency(asset.quantity * asset.avg_buy_price, asset.currency, club.currency);
    totalAssetValueEur += assetValueEur;
    totalCostBasisEur += costBasisEur;
  });

  const totalNetAssets = (totalAssetValueEur + club.cash_balance) - club.tax_liability;
  const navPerShare = club.total_shares > 0 ? totalNetAssets / club.total_shares : 100;
  const totalLatentPL = totalAssetValueEur - totalCostBasisEur;
  const dayVariationPercent = totalCostBasisEur > 0 ? (totalLatentPL / totalCostBasisEur) * 100 : 0;

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

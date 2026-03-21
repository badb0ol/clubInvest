import { Asset, TickerMetadata } from '../types';
import { PortfolioMetrics } from './geminiService';

// ─── DIVERSIFICATION (Herfindahl-Hirschman Index) ────────────────────────────

export const computeHHI = (weights: number[]): number => {
  // weights are fractions (0-1), HHI = sum of squared weights * 10000
  return weights.reduce((sum, w) => sum + (w * 100) ** 2, 0);
};

export const computeDiversificationScore = (hhi: number): number => {
  // 10000 = single stock (0%), 100 = perfect (100%)
  return Math.max(0, Math.min(100, 100 - (hhi / 10000) * 100));
};

// ─── WEIGHTS ─────────────────────────────────────────────────────────────────

export const computeAssetWeights = (
  assets: Asset[],
  prices: Record<string, number>,
  convertFn: (amount: number, from: any, to: any) => number,
  clubCurrency: any,
  cashBalance: number
): Array<{ ticker: string; value: number; weight: number }> => {
  const values = assets.map(a => {
    const price = prices[a.ticker] || a.avg_buy_price;
    const value = convertFn(a.quantity * price, a.currency, clubCurrency);
    return { ticker: a.ticker, value };
  });

  const totalPortfolio = values.reduce((s, v) => s + v.value, 0) + cashBalance;
  if (totalPortfolio <= 0) return [];

  return [
    ...values.map(v => ({ ...v, weight: v.value / totalPortfolio })),
    { ticker: 'CASH', value: cashBalance, weight: cashBalance / totalPortfolio }
  ];
};

// ─── SECTOR / COUNTRY CONCENTRATION ─────────────────────────────────────────

export const computeConcentration = (
  weights: Array<{ ticker: string; weight: number }>,
  metadataMap: Record<string, TickerMetadata>,
  field: 'sector' | 'country'
): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const { ticker, weight } of weights) {
    if (ticker === 'CASH') {
      const key = field === 'sector' ? 'Liquidités' : 'N/A';
      result[key] = (result[key] || 0) + weight * 100;
      continue;
    }
    const meta = metadataMap[ticker];
    const key = (meta?.[field]) || 'Inconnu';
    result[key] = (result[key] || 0) + weight * 100;
  }
  return result;
};

// ─── SHARPE RATIO ────────────────────────────────────────────────────────────

const RISK_FREE_ANNUAL = 0.0365; // ECB deposit rate ~3.65%
const RISK_FREE_DAILY = RISK_FREE_ANNUAL / 252;

export const computeSharpeRatio = (navHistory: Array<{ nav_per_share: number }>): number | null => {
  if (navHistory.length < 10) return null;

  const dailyReturns: number[] = [];
  for (let i = 1; i < navHistory.length; i++) {
    const prev = navHistory[i - 1].nav_per_share;
    const curr = navHistory[i].nav_per_share;
    if (prev > 0) dailyReturns.push((curr - prev) / prev);
  }

  if (dailyReturns.length < 5) return null;

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;

  const sharpe = ((mean - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252);
  return parseFloat(sharpe.toFixed(2));
};

// ─── CORRELATION MATRIX ──────────────────────────────────────────────────────

const pearsonCorrelation = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : parseFloat((num / den).toFixed(3));
};

const toReturns = (prices: number[]): number[] => {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
};

export const computeCorrelationMatrix = (
  histories: Record<string, Array<{ date: string; close: number }>>
): { matrix: Record<string, Record<string, number>>; highPairs: Array<{ a: string; b: string; correlation: number }> } => {
  const tickers = Object.keys(histories);
  const returnsMap: Record<string, number[]> = {};

  for (const ticker of tickers) {
    returnsMap[ticker] = toReturns(histories[ticker].map(h => h.close));
  }

  const matrix: Record<string, Record<string, number>> = {};
  const highPairs: Array<{ a: string; b: string; correlation: number }> = [];

  for (let i = 0; i < tickers.length; i++) {
    matrix[tickers[i]] = {};
    for (let j = 0; j < tickers.length; j++) {
      if (i === j) {
        matrix[tickers[i]][tickers[j]] = 1;
      } else if (j < i) {
        matrix[tickers[i]][tickers[j]] = matrix[tickers[j]][tickers[i]];
      } else {
        const corr = pearsonCorrelation(returnsMap[tickers[i]], returnsMap[tickers[j]]);
        matrix[tickers[i]][tickers[j]] = corr;
        if (corr > 0.8) {
          highPairs.push({ a: tickers[i], b: tickers[j], correlation: corr });
        }
      }
    }
  }

  return { matrix, highPairs };
};

// ─── FULL METRICS BUILDER ────────────────────────────────────────────────────

export const buildPortfolioMetrics = (
  weights: Array<{ ticker: string; weight: number }>,
  metadataMap: Record<string, TickerMetadata>,
  navHistory: Array<{ nav_per_share: number }>,
  correlationHistories: Record<string, Array<{ date: string; close: number }>>
): PortfolioMetrics => {
  const nonCashWeights = weights.filter(w => w.ticker !== 'CASH').map(w => w.weight);
  const hhi = computeHHI(nonCashWeights);
  const diversificationScore = computeDiversificationScore(hhi);
  const sectorConcentration = computeConcentration(weights, metadataMap, 'sector');
  const countryConcentration = computeConcentration(weights, metadataMap, 'country');
  const sharpeRatio = computeSharpeRatio(navHistory);
  const { highPairs } = computeCorrelationMatrix(correlationHistories);

  return {
    assets: weights.filter(w => w.ticker !== 'CASH').map(w => ({
      ticker: w.ticker,
      weight: w.weight * 100,
      sector: metadataMap[w.ticker]?.sector,
      country: metadataMap[w.ticker]?.country,
    })),
    hhi,
    diversificationScore,
    sectorConcentration,
    countryConcentration,
    sharpeRatio,
    highCorrelationPairs: highPairs,
  };
};

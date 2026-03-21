import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Asset, NavEntry, TickerMetadata } from '../types';
import { Card, Button, Badge } from './ui';
import { fetchAssetHistory, fetchTickerMetadata, convertCurrency } from '../services/financeEngine';
import { generatePortfolioRecommendations, PortfolioMetrics } from '../services/geminiService';
import {
  computeAssetWeights,
  computeConcentration,
  computeHHI,
  computeDiversificationScore,
  computeSharpeRatio,
  computeCorrelationMatrix,
  buildPortfolioMetrics,
} from '../services/portfolioAnalytics';

interface Props {
  assets: Asset[];
  assetPrices: Record<string, number>;
  navHistory: NavEntry[];
  clubCurrency: 'EUR' | 'USD';
  cashBalance: number;
  darkMode: boolean;
}

const SECTOR_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

const CorrelationCell: React.FC<{ value: number }> = ({ value }) => {
  const abs = Math.abs(value);
  const bg = value > 0.8
    ? 'bg-red-500 text-white'
    : value > 0.5
    ? 'bg-orange-300 text-slate-900'
    : value < -0.3
    ? 'bg-emerald-400 text-white'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
  return (
    <td className={`w-16 h-12 text-center text-xs font-mono font-bold border border-slate-200 dark:border-slate-700 ${bg}`}>
      {value === 1 ? '—' : value.toFixed(2)}
    </td>
  );
};

export const PortfolioAnalysis: React.FC<Props> = ({
  assets, assetPrices, navHistory, clubCurrency, cashBalance, darkMode
}) => {
  const [metadataMap, setMetadataMap] = useState<Record<string, TickerMetadata>>({});
  const [assetHistories, setAssetHistories] = useState<Record<string, { date: string; close: number }[]>>({});
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLoadingCorr, setIsLoadingCorr] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sectors' | 'geography' | 'correlation' | 'ai'>('overview');

  // Load metadata for all tickers
  useEffect(() => {
    if (!assets.length) return;
    setIsLoadingMeta(true);
    Promise.all(assets.map(a => fetchTickerMetadata(a.ticker).then(meta => ({ ticker: a.ticker, meta }))))
      .then(results => {
        const map: Record<string, TickerMetadata> = {};
        results.forEach(({ ticker, meta }) => { if (meta) map[ticker] = meta; });
        setMetadataMap(map);
      })
      .finally(() => setIsLoadingMeta(false));
  }, [assets.map(a => a.ticker).join(',')]);

  // Load history for correlation (only when correlation tab active)
  const loadCorrelation = async () => {
    if (!assets.length) return;
    setIsLoadingCorr(true);
    const histories: Record<string, { date: string; close: number }[]> = {};
    await Promise.all(assets.slice(0, 10).map(async a => {
      const hist = await fetchAssetHistory(a.ticker, '1y');
      if (hist.length) histories[a.ticker] = hist;
    }));
    setAssetHistories(histories);
    setIsLoadingCorr(false);
  };

  // Weights
  const weights = useMemo(() => computeAssetWeights(
    assets, assetPrices, convertCurrency, clubCurrency, cashBalance
  ), [assets, assetPrices, cashBalance, clubCurrency]);

  // HHI & diversification score
  const nonCashWeights = weights.filter(w => w.ticker !== 'CASH').map(w => w.weight);
  const hhi = useMemo(() => computeHHI(nonCashWeights), [nonCashWeights.join(',')]);
  const diversificationScore = computeDiversificationScore(hhi);

  // Sector & country breakdowns
  const sectorData = useMemo(() => {
    const conc = computeConcentration(weights, metadataMap, 'sector');
    return Object.entries(conc).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(1)) }));
  }, [weights, metadataMap]);

  const countryData = useMemo(() => {
    const conc = computeConcentration(weights, metadataMap, 'country');
    return Object.entries(conc).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(1)) }));
  }, [weights, metadataMap]);

  // Sharpe ratio
  const sharpeRatio = useMemo(() => computeSharpeRatio(navHistory), [navHistory]);

  // Correlation matrix
  const { matrix: corrMatrix, highPairs } = useMemo(() => {
    if (!Object.keys(assetHistories).length) return { matrix: {}, highPairs: [] };
    return computeCorrelationMatrix(assetHistories);
  }, [assetHistories]);
  const corrTickers = Object.keys(corrMatrix);

  // Full metrics for AI
  const portfolioMetrics: PortfolioMetrics = useMemo(() => buildPortfolioMetrics(
    weights, metadataMap, navHistory,
    Object.keys(assetHistories).length ? assetHistories : {}
  ), [weights, metadataMap, navHistory, assetHistories]);

  const handleGenerateAI = async () => {
    setIsAnalyzing(true);
    setAiRecommendations(null);
    const result = await generatePortfolioRecommendations(portfolioMetrics);
    setAiRecommendations(result);
    setIsAnalyzing(false);
  };

  const TABS = [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'sectors', label: 'Secteurs' },
    { id: 'geography', label: 'Géographie' },
    { id: 'correlation', label: 'Corrélation' },
    { id: 'ai', label: '✨ IA' },
  ] as const;

  if (!assets.length) {
    return (
      <Card className="text-center py-16 text-slate-400">
        <p className="font-medium">Aucun actif en portefeuille.</p>
        <p className="text-sm mt-1">Achetez votre premier actif pour accéder à l'analyse.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analyse du Portefeuille</h2>
          <p className="text-sm text-slate-500 mt-1">Diversification, risque, corrélation et recommandations IA.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === 'correlation' && !Object.keys(assetHistories).length) loadCorrelation(); }}
            className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Score cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="text-center p-6">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Diversification</p>
              <div className={`text-3xl font-black mb-1 ${diversificationScore > 60 ? 'text-emerald-500' : diversificationScore > 30 ? 'text-amber-500' : 'text-red-500'}`}>
                {diversificationScore.toFixed(0)}
                <span className="text-lg">/100</span>
              </div>
              <Badge type={diversificationScore > 60 ? 'positive' : diversificationScore > 30 ? 'neutral' : 'negative'}>
                {diversificationScore > 60 ? 'Bon' : diversificationScore > 30 ? 'Moyen' : 'Faible'}
              </Badge>
            </Card>

            <Card className="text-center p-6">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Concentration HHI</p>
              <div className={`text-3xl font-black mb-1 ${hhi < 1500 ? 'text-emerald-500' : hhi < 2500 ? 'text-amber-500' : 'text-red-500'}`}>
                {hhi.toFixed(0)}
              </div>
              <Badge type={hhi < 1500 ? 'positive' : hhi < 2500 ? 'neutral' : 'negative'}>
                {hhi < 1500 ? 'Diversifié' : hhi < 2500 ? 'Modéré' : 'Concentré'}
              </Badge>
            </Card>

            <Card className="text-center p-6">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Sharpe Ratio</p>
              {sharpeRatio != null ? (
                <>
                  <div className={`text-3xl font-black mb-1 ${sharpeRatio > 1 ? 'text-emerald-500' : sharpeRatio > 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
                    {sharpeRatio.toFixed(2)}
                  </div>
                  <Badge type={sharpeRatio > 1 ? 'positive' : sharpeRatio > 0.5 ? 'neutral' : 'negative'}>
                    {sharpeRatio > 1 ? 'Excellent' : sharpeRatio > 0.5 ? 'Correct' : 'Faible'}
                  </Badge>
                </>
              ) : (
                <>
                  <div className="text-2xl font-black mb-1 text-slate-300 dark:text-slate-600">N/A</div>
                  <p className="text-xs text-slate-400">Données insuffisantes</p>
                </>
              )}
            </Card>

            <Card className="text-center p-6">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Actifs</p>
              <div className="text-3xl font-black mb-1 text-slate-900 dark:text-white">{assets.length}</div>
              <p className="text-xs text-slate-400">{sectorData.filter(s => s.name !== 'Liquidités' && s.name !== 'Inconnu').length} secteurs</p>
            </Card>
          </div>

          {/* Allocation table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Allocation du portefeuille</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {weights.map(w => (
                <div key={w.ticker} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-24 shrink-0">
                    <span className={`font-mono font-bold text-sm ${w.ticker === 'CASH' ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>{w.ticker}</span>
                    {metadataMap[w.ticker]?.sector && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">{metadataMap[w.ticker].sector}</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${w.weight * 100}%` }} />
                    </div>
                  </div>
                  <div className="w-16 text-right">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{(w.weight * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-24 text-right text-xs text-slate-400 font-mono hidden md:block">
                    {w.value.toFixed(0)} {clubCurrency}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* High correlation warning */}
          {highPairs.length > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">⚠️ Paires fortement corrélées</p>
              <div className="flex flex-wrap gap-2">
                {highPairs.map(p => (
                  <span key={`${p.a}-${p.b}`} className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full font-mono">
                    {p.a} / {p.b} ({(p.correlation * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">Ces actifs évoluent souvent ensemble — peu de diversification entre eux.</p>
            </div>
          )}
        </div>
      )}

      {/* SECTORS TAB */}
      {activeTab === 'sectors' && (
        <Card>
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Répartition sectorielle</h3>
          {isLoadingMeta ? (
            <div className="h-48 flex items-center justify-center text-slate-400 animate-pulse">Chargement des données sectorielles...</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" outerRadius={110} dataKey="value" nameKey="name" label={({ name, value }) => `${value}%`} labelLine={false}>
                    {sectorData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ backgroundColor: darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: '1px solid #334155' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {sectorData.sort((a, b) => b.value - a.value).map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    <div className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700 dark:text-slate-300">{s.name}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white w-12 text-right">{s.value}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sectorData.some(s => s.name === 'Inconnu' && s.value > 20) && (
            <p className="text-xs text-slate-400 mt-4">Certains actifs n'ont pas de métadonnées disponibles. Vérifiez votre clé API Twelve Data.</p>
          )}
        </Card>
      )}

      {/* GEOGRAPHY TAB */}
      {activeTab === 'geography' && (
        <Card>
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Répartition géographique</h3>
          {isLoadingMeta ? (
            <div className="h-48 flex items-center justify-center text-slate-400 animate-pulse">Chargement...</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={countryData} cx="50%" cy="50%" outerRadius={110} dataKey="value" nameKey="name" label={({ name, value }) => `${value}%`} labelLine={false}>
                    {countryData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ backgroundColor: darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: '1px solid #334155' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {countryData.sort((a, b) => b.value - a.value).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    <div className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700 dark:text-slate-300">{c.name}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white w-12 text-right">{c.value}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* CORRELATION TAB */}
      {activeTab === 'correlation' && (
        <Card>
          <h3 className="font-bold text-slate-900 dark:text-white mb-2">Matrice de corrélation</h3>
          <p className="text-xs text-slate-400 mb-6">Corrélation de Pearson sur les rendements quotidiens (1 an). Rouge = corrélé (risque groupé), Vert = décorrélé (diversification).</p>
          {isLoadingCorr ? (
            <div className="h-48 flex items-center justify-center text-slate-400 animate-pulse">Chargement des données historiques...</div>
          ) : corrTickers.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">Données non chargées.</p>
              <Button variant="secondary" className="mt-3" onClick={loadCorrelation}>Charger les données</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse mx-auto">
                <thead>
                  <tr>
                    <th className="w-16 h-12" />
                    {corrTickers.map(t => (
                      <th key={t} className="w-16 h-12 text-xs font-mono font-bold text-slate-500 text-center">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrTickers.map(rowT => (
                    <tr key={rowT}>
                      <td className="w-16 h-12 text-xs font-mono font-bold text-slate-500 pr-2 text-right">{rowT}</td>
                      {corrTickers.map(colT => (
                        <CorrelationCell key={colT} value={corrMatrix[rowT]?.[colT] ?? 0} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> &gt; 0.8 (très corrélé)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-300 inline-block" /> 0.5–0.8 (corrélé)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400 inline-block" /> &lt; -0.3 (décorrélé)</span>
          </div>
        </Card>
      )}

      {/* AI TAB */}
      {activeTab === 'ai' && (
        <Card>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Recommandations IA</h3>
              <p className="text-xs text-slate-400 mt-1">Analyse structurelle uniquement — sans données de marché.</p>
            </div>
            <Button onClick={handleGenerateAI} disabled={isAnalyzing} variant="primary">
              {isAnalyzing ? 'Analyse en cours...' : '✨ Analyser'}
            </Button>
          </div>
          {aiRecommendations ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {aiRecommendations}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-3">✨</div>
              <p className="text-sm font-medium">Analyse structurelle de votre portefeuille</p>
              <p className="text-xs mt-2 text-slate-300 dark:text-slate-600 max-w-sm mx-auto">
                Recommandations basées sur la diversification, les secteurs, la géographie et les corrélations — pas sur les tendances du marché.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("VITE_GEMINI_API_KEY manquant. Ajoutez-le dans votre fichier .env");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const getAssetInsight = async (ticker: string): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Clé API Gemini manquante. Configurez VITE_GEMINI_API_KEY dans votre .env";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Provide a very brief (2-3 sentences) financial sentiment summary for ${ticker} stock based on recent news. Be professional and concise. Focus on recent performance or major news events.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text || "Aucune information disponible pour le moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Impossible de récupérer les informations de marché pour le moment.";
  }
};

export const analyzePortfolioDistribution = async (assets: string[]): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Clé API manquante.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `I have a portfolio with these assets: ${assets.join(', ')}. Give me one single short, witty, and insightful sentence about this diversification strategy.`,
    });
    return response.text || "Analyse de portefeuille indisponible.";
  } catch {
    return "Impossible d'analyser le portefeuille.";
  }
};

export interface PortfolioMetrics {
  assets: Array<{ ticker: string; weight: number; sector?: string; country?: string }>;
  hhi: number; // Herfindahl-Hirschman Index (0-10000)
  diversificationScore: number; // 0-100
  sectorConcentration: Record<string, number>; // sector -> %
  countryConcentration: Record<string, number>; // country -> %
  sharpeRatio: number | null;
  highCorrelationPairs: Array<{ a: string; b: string; correlation: number }>;
}

export const generatePortfolioRecommendations = async (metrics: PortfolioMetrics): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Clé API Gemini manquante.";

  const assetList = metrics.assets.map(a =>
    `${a.ticker} (${a.weight.toFixed(1)}%${a.sector ? ', ' + a.sector : ''}${a.country ? ', ' + a.country : ''})`
  ).join(', ');

  const topSectors = Object.entries(metrics.sectorConcentration)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 3)
    .map(([s, w]) => `${s}: ${w.toFixed(1)}%`).join(', ');

  const topCountries = Object.entries(metrics.countryConcentration)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 3)
    .map(([c, w]) => `${c}: ${w.toFixed(1)}%`).join(', ');

  const correlationNote = metrics.highCorrelationPairs.length > 0
    ? `Highly correlated pairs (>0.8): ${metrics.highCorrelationPairs.map(p => `${p.a}/${p.b} (${p.correlation.toFixed(2)})`).join(', ')}.`
    : 'No highly correlated pairs detected.';

  const prompt = `Tu es un analyste de portefeuille pour un club d'investissement français. Tu dois analyser la composition du portefeuille ET utiliser ta recherche web pour contextualiser avec les données de marché actuelles.

Portefeuille: ${assetList}
Score de diversification: ${metrics.diversificationScore.toFixed(0)}/100 (plus élevé = mieux)
Indice HHI de concentration: ${metrics.hhi.toFixed(0)}/10000 (plus faible = mieux)
Top secteurs: ${topSectors || 'Inconnu'}
Top pays: ${topCountries || 'Inconnu'}
Ratio de Sharpe: ${metrics.sharpeRatio != null ? metrics.sharpeRatio.toFixed(2) : 'données insuffisantes'}
${correlationNote}

Instructions:
1. Utilise Google Search pour vérifier les dernières performances et actualités des actifs listés
2. Fournis 4-5 recommandations spécifiques et actionnables pour améliorer la diversification et réduire le risque
3. Écris en français, sois direct et quantitatif
4. Intègre le contexte de marché actuel (valorisation sectorielle, taux d'intérêt, cycle économique) dans tes recommandations
5. Concentre-toi sur: équilibre sectoriel, diversification géographique, dimensionnement des positions, risques de corrélation, et niveau de liquidités optimal
6. Si le portefeuille est majoritairement en liquidités, explique quelles classes d'actifs méritent d'être considérées selon le contexte macro actuel`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text || "Analyse indisponible.";
  } catch {
    return "Impossible de générer les recommandations.";
  }
};

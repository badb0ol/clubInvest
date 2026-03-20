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
  } catch (e) {
    return "Impossible d'analyser le portefeuille.";
  }
};

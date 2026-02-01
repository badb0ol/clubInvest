import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("No API_KEY provided for Gemini");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const getAssetInsight = async (ticker: string): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Gemini API Key missing. Please set process.env.API_KEY.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide a very brief (2-3 sentences) financial sentiment summary for ${ticker} stock based on recent news. Be professional and concise. Focus on recent performance or major news events.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text || "No insights available currently.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Unable to fetch market insights at this time.";
  }
};

export const analyzePortfolioDistribution = async (assets: string[]): Promise<string> => {
    const ai = getClient();
    if (!ai) return "API Key missing.";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `I have a portfolio with these assets: ${assets.join(', ')}. Give me one single short, witty, and insightful sentence about this diversification strategy.`,
        });
        return response.text || "Portfolio analysis unavailable.";
    } catch (e) {
        return "Could not analyze portfolio.";
    }
}
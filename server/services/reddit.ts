import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkQuotaCooldown } from "./openai";

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 2500): Promise<T> {
  let lastErr: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delayMs));
    try { return await fn(); } catch (err) {
      lastErr = err as Error;
      const is503 = lastErr.message.includes("503") || (lastErr as any).status === 503;
      if (!is503) throw lastErr;
    }
  }
  throw lastErr;
}

async function analyzeRedditDataWithAI(productName: string, brand: string, summary: string) {
  checkQuotaCooldown(); // fast-fail if a 429 was seen in the last 60s
  console.log("Initializing Google Generative AI for Reddit reviews...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = `Product review analyst. Summarize real user opinions about "${productName}" by ${brand} from your training data.

Context: ${summary}

Return ONLY JSON — no markdown, no extra text:
{"pros":["specific benefit"],"cons":["specific complaint"],"averageRating":4.1,"totalMentions":0,"reviews":[]}

Rules:
- pros/cons: 3–5 items each, specific user complaints/benefits (not generic marketing)
- averageRating: 1.0–5.0 based on known sentiment; 0 if product is obscure or unknown
- If product unknown/obscure: {"pros":[],"cons":[],"averageRating":0,"totalMentions":0,"reviews":[]}`;

  try {
    const result = await withRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      })
    );

    const content = result.response.text();
    console.log("Reddit AI raw content (first 400):", content.substring(0, 400));

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn("Reddit: could not parse JSON from response");
      return { pros: [], cons: [], averageRating: 0, totalMentions: 0, reviews: [] };
    }

    if (!parsed) {
      return { pros: [], cons: [], averageRating: 0, totalMentions: 0, reviews: [] };
    }

    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros.filter(Boolean).slice(0, 5) : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons.filter(Boolean).slice(0, 5) : [],
      averageRating: typeof parsed.averageRating === "number"
        ? Math.min(Math.max(parsed.averageRating, 0), 5.0) : 0,
      totalMentions: 0,
      reviews: []
    };
  } catch (error) {
    console.error("Error in Reddit AI analysis:", error);
    return null;
  }
}

export async function searchRedditReviews(productName: string, brand: string, summary: string): Promise<any> {
  try {
    console.log("Searching Reddit reviews for product:", productName);

    const aiResponse = await analyzeRedditDataWithAI(productName, brand, summary);
    if (aiResponse === null) return null;

    aiResponse.reviews = [];
    aiResponse.totalMentions = 0;

    console.log("Reddit analysis successful:", aiResponse);
    return aiResponse;

  } catch (error) {
    console.error("Error in searchRedditReviews:", error);
    return null;
  }
}
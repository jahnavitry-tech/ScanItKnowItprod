import Groq from "groq-sdk";

// Process 1 — Vision: reads images, identifies products
const VISION_MODEL = "llama-3.2-11b-vision-preview";
// Process 2 — Analysis: text reasoning for all 4 analysis cards
const ANALYSIS_MODEL = "llama-3.3-70b-versatile";

// Separate cooldown timestamps for per-minute vs per-day quota errors
let lastPerMinute429 = 0;
let lastPerDay429    = 0;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  return new Groq({ apiKey });
}

export function checkGroqCooldown(): void {
  const now = Date.now();
  const dayElapsed = now - lastPerDay429;
  if (dayElapsed < 23 * 60 * 60 * 1000) {
    const remaining = Math.ceil((23 * 60 * 60 * 1000 - dayElapsed) / 1000 / 60);
    throw Object.assign(
      new Error(`Groq daily quota exhausted — retry in ~${remaining}min`),
      { status: 429, retryAfter: remaining * 60, isRateLimit: true },
    );
  }
  const minElapsed = now - lastPerMinute429;
  if (minElapsed < 65_000) {
    const remaining = Math.ceil((65_000 - minElapsed) / 1000);
    throw Object.assign(
      new Error(`Groq rate limit active — ${remaining}s remaining`),
      { status: 429, retryAfter: remaining, isRateLimit: true },
    );
  }
}

function recordGroqError(err: unknown): void {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const is429 = (err as any)?.status === 429 || msg.includes("429") || msg.includes("rate_limit");
  if (!is429) return;
  if (msg.includes("day") || msg.includes("per_day") || msg.includes("daily")) {
    lastPerDay429 = Date.now();
    console.warn("Groq DAILY quota hit — cooldown 23h");
  } else {
    lastPerMinute429 = Date.now();
    console.warn("Groq per-minute rate limit hit — cooldown 65s");
  }
}

async function withGroqRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 2500): Promise<T> {
  let lastErr: Error = new Error("Unknown Groq error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`Groq retry ${attempt}/${maxRetries} after ${delayMs}ms…`);
      await new Promise(r => setTimeout(r, delayMs));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      recordGroqError(err);
      const is429 = (lastErr as any).status === 429 || lastErr.message.includes("429");
      if (is429) throw lastErr;
      const is503 = lastErr.message.includes("503") || (lastErr as any).status === 503;
      if (!is503) throw lastErr;
      console.warn(`Groq 503 attempt ${attempt + 1}:`, lastErr.message);
    }
  }
  throw lastErr;
}

// ─── PROCESS 1: Image Vision — ARA ───────────────────────────────────────────

export async function scanProductWithGroqVision(base64Image: string): Promise<Array<{
  productName: string;
  productCategory: string;
  productContext: { what: string; who: string; when: string };
  extractedText: { ingredients: string; brand: string };
  summary: string;
}>> {
  checkGroqCooldown();
  const groq = getGroqClient();

  const prompt = `You are an Autonomous Report Agent (ARA). Return ONLY a valid JSON array — no markdown, no extra text.

OUTPUT SCHEMA: [{"productName":"string","productCategory":"string","productContext":{"what":"string","who":"string","when":"string"},"extractedText":{"ingredients":"string","brand":"string"},"summary":"string"}]

One object per distinct product or scene subject.

EXAMPLES:
Input: photo of Doritos Nacho Cheese bag
Output: [{"productName":"Doritos Nacho Cheese","productCategory":"Snack Chip","productContext":{"what":"Corn tortilla chips with nacho cheese coating","who":"Snack lovers and party hosts, all ages","when":"Any time as a snack or at parties"},"extractedText":{"ingredients":"Corn, Vegetable Oil, Maltodextrin, Salt, Cheddar Cheese, Whey...","brand":"Doritos / Frito-Lay / 028400064057"},"summary":"Crunchy corn tortilla chips with nacho cheese flavoring. 140 cal/oz. Party snack for all ages."}]

Input: photo of CeraVe Foaming Facial Cleanser
Output: [{"productName":"CeraVe Foaming Facial Cleanser","productCategory":"Face Cleanser","productContext":{"what":"Foaming cleanser with ceramides and niacinamide","who":"Adults with normal to oily skin","when":"Morning and evening skincare routine"},"extractedText":{"ingredients":"Water, Sodium Lauroyl Sarcosinate, Niacinamide, Ceramide NP, Ceramide AP...","brand":"CeraVe / 301871220032"},"summary":"Dermatologist-recommended foaming cleanser. Removes excess oil without disrupting skin barrier. Fragrance-free."}]

FIELD RULES:
- productCategory: 1-3 word type label (e.g., "Granola Bar", "Face Moisturizer", "Energy Drink")
- productContext.what: what the product is — max 10 words
- productContext.who: intended user or audience — max 10 words
- productContext.when: when to use or consume it — max 10 words

BRANDED PRODUCT rules:
- ingredients: FULL verbatim list from the label, comma-separated
- brand: brand name + product name + all barcodes/QR codes found
- summary: max 3 lines — key features + purpose + typical user

NON-BRANDED SCENE rules:
- ingredients: list every visible component WITH estimated quantity/portion
- brand: "Not applicable"
- summary: describe the scene + estimated total calories + macros

EDGE CASES:
- Blurry/partial label: extract what is visible; prefix with "partial: "
- Multiple products: one object per product, never merge
- No text visible: set ingredients and brand to "Not visible"`;

  const result = await withGroqRetry(() =>
    groq.chat.completions.create({
      model: VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          { type: "text", text: prompt },
        ],
      }],
      temperature: 0.1,
      max_tokens: 2048,
    })
  );

  const content = result.choices[0]?.message?.content ?? "";
  console.log("Groq ARA response (first 300):", content.substring(0, 300));

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (Array.isArray(data) && data.length > 0) {
        console.log("Groq ARA: parsed", data.length, "product(s)");
        return data;
      }
    }
  } catch (err) {
    console.error("Groq ARA: failed to parse JSON:", (err as Error).message);
  }
  throw new Error("Groq ARA returned unparseable response");
}

// ─── PROCESS 2: Text Analysis ─────────────────────────────────────────────────
// All four functions below receive text-only context (no image).
// Input comes from the stored ProductAnalysis record: name, category, context,
// ingredients, brand, and the summary written by Process 1 (image description).

// Helper: build shared product context block for all analysis prompts
function buildProductContext(
  productName: string,
  brand: string,
  summary: string,
  extractedText: any,
  productCategory?: string,
  productContext?: { what?: string; who?: string; when?: string },
): string {
  return [
    `Product: ${productName}`,
    brand && brand !== "Not applicable" ? `Brand: ${brand}` : "",
    productCategory ? `Category: ${productCategory}` : "",
    productContext?.what ? `What: ${productContext.what}` : "",
    productContext?.who  ? `Who:  ${productContext.who}`  : "",
    productContext?.when ? `When: ${productContext.when}` : "",
    `Description: ${summary}`,
    extractedText?.ingredients ? `Ingredients: ${extractedText.ingredients}` : "",
  ].filter(Boolean).join("\n");
}

// ── Nutrition Facts / Product Highlights (UPCA) ───────────────────────────────

export async function analyzeCompositionGroq(
  productName: string,
  brand: string,
  summary: string,
  extractedText: any,
  productCategory?: string,
  productContext?: { what?: string; who?: string; when?: string },
): Promise<any> {
  checkGroqCooldown();
  const groq = getGroqClient();

  const context = buildProductContext(productName, brand, summary, extractedText, productCategory, productContext);

  const prompt = `Product composition analyst. Analyse the product below and return a single structured JSON object.

${context}

RULES:
- Food/Consumable: extract calories, fat, protein as numbers; fill compositionalDetails with all nutrition label values.
- Non-food/Topical (cosmetic, cleaning, etc.): set calories/totalFat/totalProtein to 0; fill compositionalDetails with chemical/material components.
- General scene (brand = "Not applicable"): estimate nutrition for the whole meal; list each visible component as a separate compositionalDetail entry with notes = estimated portion.
- categoryBadges: ONLY badges confirmed by the data (max 6).
  Food: vegan|vegetarian|non-gmo|gluten-free|no-added-sugar|organic|no-artificial|high-protein|high-fiber|dairy-free|keto-friendly|low-sodium
  Cosmetic: fragrance-free|paraben-free|sulfate-free|derm-tested|hypoallergenic|cruelty-free|vegan-formula|spf-protected|for-sensitive|for-dry-skin|for-acne|non-comedogenic
- nutritionHighlights: EXACTLY 3 objects — the most significant metrics for this product type.

FOOD EXAMPLE (partial):
{"productCategory":"Granola Bar","calories":190,"totalFat":6,"totalProtein":4,"productType":"food","productContext":{"what":"Whole grain oat snack bar","who":"Active adults, hikers","when":"On-the-go snack or hike fuel"},"categoryBadges":["non-gmo","no-artificial"],"nutritionHighlights":[{"label":"Calories","value":"190","unit":"kcal","level":"medium","levelLabel":"Moderate","arcPercent":38,"lucideIcon":"Flame","iconColor":"text-orange-500","iconBg":"bg-orange-50","arcColor":"#f97316"},{"label":"Protein","value":"4","unit":"g","level":"low","levelLabel":"Low","arcPercent":8,"lucideIcon":"Dumbbell","iconColor":"text-blue-500","iconBg":"bg-blue-50","arcColor":"#3b82f6"},{"label":"Sugar","value":"11","unit":"g","level":"high","levelLabel":"High","arcPercent":22,"lucideIcon":"Cookie","iconColor":"text-pink-500","iconBg":"bg-pink-50","arcColor":"#ec4899"}]}

COSMETIC EXAMPLE (partial):
{"productCategory":"Face Cleanser","calories":0,"totalFat":0,"totalProtein":0,"productType":"cosmetic","categoryBadges":["fragrance-free","paraben-free"],"nutritionHighlights":[{"label":"Niacinamide","value":"Present","unit":null,"level":"excellent","levelLabel":"Active","arcPercent":100,"lucideIcon":"Sparkles","iconColor":"text-purple-500","iconBg":"bg-purple-50","arcColor":"#a855f7"},{"label":"Ceramides","value":"3","unit":"types","level":"excellent","levelLabel":"Barrier","arcPercent":90,"lucideIcon":"Shield","iconColor":"text-teal-500","iconBg":"bg-teal-50","arcColor":"#14b8a6"},{"label":"Fragrance","value":"Free","unit":null,"level":"low","levelLabel":"Safe","arcPercent":0,"lucideIcon":"Wind","iconColor":"text-green-500","iconBg":"bg-green-50","arcColor":"#22c55e"}]}

Return ONLY valid JSON — no markdown, no code fences:
{"productCategory":"string","netQuantity":0,"unitType":"string","servingSize":"string or null","servingsPerContainer":0,"calories":0,"totalFat":0,"totalProtein":0,"totalCarbs":0,"compositionalDetails":[{"key":"string","value":"numeric string","unit":"g|mg|kcal|mcg|%|etc","notes":"context or null","category":"macronutrients|sugars|vitamins|minerals|keyComponents|warnings|other","dailyValuePct":0}],"productType":"food|beverage|cosmetic|supplement|household|other","productContext":{"what":"max 10 words","who":"max 10 words","when":"max 10 words"},"categoryBadges":[],"nutritionHighlights":[{"label":"string","value":"string","unit":"string or null","level":"low|medium|high|excellent|none","levelLabel":"string","arcPercent":0,"lucideIcon":"Flame|Droplets|Zap|Dumbbell|Sparkles|Sun|Cookie|Shield|Wind","iconColor":"text-orange-500","iconBg":"bg-orange-50","arcColor":"#f97316"}],"dataSource":"groq"}`;

  const result = await withGroqRetry(() =>
    groq.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2048,
    })
  );

  const content = result.choices[0]?.message?.content ?? "";
  console.log("Groq UPCA response (first 300):", content.substring(0, 300));
  try {
    return JSON.parse(content);
  } catch {
    console.error("Groq UPCA: could not parse JSON");
    return { productCategory: "", netQuantity: 0, unitType: "", calories: 0, totalFat: 0, totalProtein: 0, compositionalDetails: [] };
  }
}

// ── Ingredient Safety (UISA) ──────────────────────────────────────────────────

export async function analyzeIngredientsGroq(
  productName: string,
  brand: string,
  summary: string,
  extractedText: any,
): Promise<any> {
  checkGroqCooldown();
  const groq = getGroqClient();

  const rawIngredients = extractedText?.ingredients ?? "";
  const ingredientsMissing = !rawIngredients || rawIngredients.length < 10 ||
    /n\/a|not\s+available|not\s+visible|not\s+applicable|unable|fallback|no\s+ingredient/i.test(rawIngredients);

  const prompt = `Ingredient safety analyst. Rate every ingredient using FDA, EWG, WHO, and CDC classifications.

Product: ${productName} by ${brand}
Description: ${summary}
${ingredientsMissing
  ? `Ingredients not extracted from label. Use your training knowledge of typical ingredients in "${productName}" by "${brand}".`
  : `Ingredients: ${rawIngredients}`
}

Rate each ingredient: Safe | Moderate | Harmful
- Moderate/Harmful: include a one-line reason with the source authority in parentheses (e.g. "linked to skin irritation (EWG)")
- Safe: write "Safe" or "Safe (unless allergic)"

Return ONLY valid JSON — no markdown:
{"ingredients_analysis":[{"name":"string","safety_status":"Safe|Moderate|Harmful","reason_with_source":"string"}]}

If the product is unknown or no data exists:
{"ingredients_analysis":[{"name":"Unknown","safety_status":"Safe","reason_with_source":"No ingredient data available — cannot assess"}]}`;

  const result = await withGroqRetry(() =>
    groq.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2048,
    })
  );

  const content = result.choices[0]?.message?.content ?? "";
  console.log("Groq UISA response (first 200):", content.substring(0, 200));
  try {
    return JSON.parse(content);
  } catch {
    return { ingredients_analysis: [] };
  }
}

// ── Reddit Reviews ─────────────────────────────────────────────────────────────

export async function searchRedditReviewsGroq(
  productName: string,
  brand: string,
  summary: string,
): Promise<any> {
  checkGroqCooldown();
  const groq = getGroqClient();

  const prompt = `Community sentiment analyst. Based on your training knowledge, summarise what people say online about the product below.

Product: ${productName}
Brand: ${brand}
Description: ${summary}

Provide an honest, balanced summary of community opinions. If the product is too obscure or niche to have meaningful community feedback, return null for the entire response.

Return ONLY valid JSON — no markdown:
{"averageRating":4.2,"totalMentions":1240,"pros":["Great texture","Long-lasting","Value for money"],"cons":["Strong scent","Packaging could be better"],"reviews":[]}

If the product is too obscure: {"averageRating":null,"totalMentions":0,"pros":[],"cons":[],"reviews":[]}`;

  const result = await withGroqRetry(() =>
    groq.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1024,
    })
  );

  const content = result.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content);
    // Return null when model has no meaningful data (totalMentions = 0 and no pros/cons)
    if (!parsed.averageRating && (!parsed.pros?.length) && (!parsed.cons?.length)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Chat Response ──────────────────────────────────────────────────────────────

export async function generateChatResponseGroq(
  question: string,
  productData: { productName: string; productSummary: string; extractedText: any },
): Promise<string> {
  checkGroqCooldown();
  const groq = getGroqClient();

  const prompt = `You are a product analysis expert. Answer the user's question about the product below concisely.

Rules:
- Plain text only. No JSON. No markdown fences.
- Under 3 lines → single paragraph. Over 3 lines → bullet points.
- If you cannot verify something, say so in one sentence.

Product: ${productData.productName}
Description: ${productData.productSummary}
Ingredients: ${productData.extractedText?.ingredients ?? "Not available"}

Question: ${question}`;

  const result = await withGroqRetry(() =>
    groq.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 512,
    })
  );

  return result.choices[0]?.message?.content?.trim()
    ?? "Sorry, I couldn't generate a response. Please try again.";
}

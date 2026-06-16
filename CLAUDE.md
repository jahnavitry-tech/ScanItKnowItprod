# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (Express + Vite HMR together via tsx)
npm run dev

# Type checking only (no emit)
npm run check

# Production build (Vite client + esbuild server + copy assets)
npm run build

# Run production build
npm start
```

No test suite. No lint script — use `npm run check` for TypeScript errors.

## Architecture

Monorepo: React SPA (Vite) served by Express. In development, Vite is mounted inside Express (`server/vite.ts`). In production, Express serves `dist/public/`.

### Full request lifecycle

#### Phase 1 — Image capture → product identification

1. `CameraScreen` captures from live camera or file picker.
2. `compressImage()` resizes to max 512px, quality 0.80, JPEG:
   - **Worker path** (preferred): zero-copy transfer to `OffscreenCanvas` Web Worker at `/workers/image-compressor.worker.js` via `Transferable` bitmap (`maxDim: 512, quality: 0.80`).
   - **Main-thread fallback**: `<canvas>` resize + `toBlob`.
3. XHR `POST /api/analyze-product` (multipart, 50 MB limit). XHR `upload.onprogress` drives 0→30%; a `setInterval` simulates 30→90% during Gemini processing.
4. Server converts buffer to `base64`, saves raw bytes to `data/images/img-{ts}.jpg` (served at `/api/images/{name}`), then calls Gemini Vision (**ARA prompt**).
5. Each detected product stored in `MemStorage` with a UUID; all deep-analysis fields start `null`.
6. Response: `[{ analysisId, productName, productSummary, extractedText, imageUrl, allergens, isFallbackMode, compositionData:null, ingredientsData:null, redditData:null }]`
7. `CameraScreen` internal view states: `camera → loading → identification → selection`. On single product: skips selection. `home.tsx` `AppState` has only two values: `"camera" | "analysis"`.
8. `ProductIdentificationScreen` shows the image with colored bounding boxes (fake client-side coordinates from `BOX_LAYOUTS[]`) and a product list. User picks one or taps "Analyze All".
9. `home.tsx` transitions `AppState → "analysis"`, passes `analysisIds: string[]` to `AnalysisScreen`.

#### Phase 2 — Analysis page

`AnalysisScreen` accepts `analysisIds: string[]`. For a single ID it renders normally; for multiple IDs it renders a horizontal scroll-snap container.

Each panel calls `GET /api/analysis/:analysisId` on mount to hydrate `ProductHeaderCard`. Allergen badges and dietary filter tags are computed **client-side** from `extractedText.ingredients` with no API call.

`detectProductType()` uses a 5-priority heuristic until composition loads: calories > compositionCategory > nutritionText > productSummary > productName. Once `compositionData` loads, `productType` from UPCA is authoritative.

#### Phase 3 — Lazy deep analysis (on card expand)

Four accordion cards in `AnalysisPanel` using three TanStack Query hooks in `client/src/hooks/useAnalysisData.ts`:

| Card | Title (food) | Title (non-food) | Endpoint |
|---|---|---|---|
| `calories` | Nutrition Facts | Product Highlights | `POST /api/analyze-composition` |
| `ingredients` | Ingredient Safety | Ingredient Safety | `POST /api/analyze-ingredients` |
| `reddit` | Reddit Reviews | Reddit Reviews | `POST /api/analyze-reddit` |
| `qa` | Ask the AI | Ask the AI | `POST /api/chat/:analysisId` |

Composition auto-starts for the active panel on mount (via `compositionAutoStartedRef` — fires once only). Ingredients and Reddit fire only when user expands them. All hooks use `staleTime: Infinity`, `gcTime: 30min`.

### API endpoints

```
POST /api/analyze-product          → initial vision scan, returns ProductAnalysis[]
GET  /api/analysis/:analysisId     → fetch base analysis (no AI calls)
POST /api/analyze-composition      → UPCA prompt → ICompositionAnalysis
POST /api/analyze-ingredients      → UISA prompt → IngredientsData
POST /api/analyze-reddit           → Reddit prompt → RedditData | 503
POST /api/chat/:analysisId         → Chat prompt → plain text
GET  /api/chat/:analysisId         → chat history
GET  /api/images/:filename         → serve uploaded image from data/images/
```

### Prompts (all use `gemini-2.5-flash-lite`)

Both `VISION_MODEL` and `ANALYSIS_MODEL` constants in `server/services/openai.ts` are `gemini-1.5-flash` (1500 req/day free tier on AI Studio keys; `gemini-2.0-flash` requires billing — limit:0 on free projects). **`server/services/openai.ts` is misnamed — it uses `@google/generative-ai`, not OpenAI.**

- **ARA** (`identifyProductAndExtractText`): JSON array of products — verbatim ingredients, calories/serving, brand+barcodes. For non-branded scenes, lists visible components as ingredients.
- **UPCA** (`analyzeComposition`): Food: calories/fat/protein + all nutrition as `compositionalDetails`. Non-food: macros=0, details = chemical/material components. Returns `productType`, `productContext` (what/who/how, 10 words each), `categoryBadges` (up to 6), `nutritionHighlights` (exactly 3 arc metrics). No web grounding.
- **UISA** (`analyzeIngredients`): Per-ingredient: `Safe|Moderate|Harmful` + source (FDA/EWG/WHO/CDC). Falls back to training knowledge if ingredients text is missing/placeholder.
- **Reddit** (`searchRedditReviews`): NOT a real Reddit API — calls Gemini for training-knowledge sentiment. Returns `null` → server sends 503 for obscure products.
- **Chat** (`generateChatResponse`): Plain text only. Uses `tools: [{ googleSearch: {} }]` for live grounding. Falls back to `gemini-1.5-flash` without grounding if primary call fails.

### Client-side utilities

| File | Exports | Purpose |
|---|---|---|
| `client/src/lib/dietary-filters.ts` | `detectAllergens()`, `getDietaryTags()` | Pure string matching — no API |
| `client/src/lib/nutrient-score.ts` | `computeNutrientDensityScore()` | Scores 0–100 from protein/fiber/vitamins vs calories |
| `client/src/lib/top-metrics.ts` | `getTopThreeMetrics()` | Picks 3 most meaningful metrics for any product type |
| `client/src/hooks/useAnalysisData.ts` | `useCompositionQuery`, `useIngredientsQuery`, `useRedditQuery` | TanStack Query wrappers with rate-limit error propagation + `forceRefetch()` |

### Key design decisions & non-obvious patterns

**Rate-limit system:** `last429Timestamp` in `openai.ts` is a module-level var. After any 429/RESOURCE_EXHAUSTED, `checkQuotaCooldown()` fast-fails ALL Gemini calls for 60 s. `withGeminiRetry()` retries 503 but immediately throws 429 — never retries quota exhaustion.

**Reddit 503 ≠ rate-limit:** `useRedditQuery` calls `postRedditAnalysis()` (not `postAnalysis()`) — a deliberate isolation so Reddit's 503 does not set `isRateLimit:true` and trigger the global cooldown banner for other cards.

**forceRefresh bypass:** POST bodies with `{ forceRefresh: true }` tell route handlers to skip cached `compositionData`/`ingredientsData`/`redditData` and re-call Gemini. Used by each card's Refresh button.

**Image on disk, not in MemStorage:** `imageUrl` is `/api/images/{name}`, not base64. On disk-write failure, falls back to inline `data:image/jpeg;base64,...` (functional but memory-heavy).

**Multi-product UI:** `AnalysisPanelMemo` uses `React.memo` to prevent re-renders when the parent updates `activeIndex` during horizontal scroll.

**Scan Another cleanup:** `handleScanAnother()` in `home.tsx` eagerly calls `queryClient.removeQueries` for all four cache key types immediately — doesn't wait for gcTime expiry.

**No database.** `MemStorage` (`server/storage.ts`) holds three `Map` instances — all data lost on server restart. Same product scanned twice costs two full Gemini calls.

**Fallback mode:** When Gemini fails, `isFallbackMode: true`. Ingredients/composition fall back to Open Food Facts / USDA FDC / `fallbackGrounding.ts`. Reddit returns 503. Chat returns a static string.

### Dead code (safe to ignore)

- `USE_HUGGINGFACE = false`, `DEMO_MODE = false` — hardcoded in `openai.ts`; HuggingFace/demo paths are unreachable
- `openai` npm package — installed but unused; `@google/generative-ai` is the actual SDK
- `@tensorflow-models/mobilenet` + `@tensorflow/tfjs` — installed but unused
- `analyzeFeatures()` / UPSA endpoint — dead code in `openai.ts`

### Known performance bottlenecks (priority order)

1. **Only composition auto-starts** — ingredients and Reddit fire on expand, not mount. Fix: enable ingredients in parallel with composition on panel mount.
2. **Initial scan + composition are two round-trips** — `/api/analyze-product` returns `compositionData: null`; client immediately fires a second call. Fix: run `analyzeComposition()` inside the initial route handler in parallel with storage write via `Promise.all`.
3. ~~Image input was 1024px~~ — **already fixed**: worker uses `maxDim: 512, quality: 0.80`.
4. **No persistent cache** — restart loses all analysis data; same product scanned twice hits Gemini again.
5. **Reddit is Gemini hallucination** — lowest value/cost ratio; real alternatives: Serper, Tavily, SerpApi.
6. **Gemini JSON mode not used** — prompts say "Return ONLY valid JSON" but `safeResponseText()` + `extractFirstJson()` exist as markdown-unwrapping workarounds. Fix: add `generationConfig: { responseMimeType: "application/json" }` to all UPCA/UISA/Reddit calls.

### TanStack Query cache keys

```
["composition",  analysisId]   staleTime: Infinity, gcTime: 30min
["ingredients",  analysisId]   staleTime: Infinity, gcTime: 30min
["reddit",       analysisId]   staleTime: Infinity, gcTime: 30min, retry: false
["/api/chat/{id}"]             loaded by ChatInterface on mount
["analysis",     analysisId]   invalidated on "Scan Another"
```

### Design system

Brand colors (hardcoded, not Tailwind defaults):
- Primary blue: `#4A6BFF`
- Lime green (bounding box): `#B2F746`
- Electric blue (bounding box): `#4466FA`
- Pink (bounding box / cosmetics): `#FF86C3`
- App background: `#0E0E0E`

Camera and processing screens are **always dark** (`#0E0E0E`) regardless of theme — they overlay a live camera feed. Analysis and sheet surfaces respond to `useTheme()`.

Brand assets (`AppIconDark`, `AppIconLight`, `AppTitle`, `Logo`) are in `client/src/components/`. Theme-aware SVGs are in `client/public/assets/`.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | All vision + deep analysis |
| `HUGGINGFACE_API_KEY` | No | Dead code |
| `OCR_API_KEY` | No | Defaults to hardcoded key in `ocrFallback.ts` |
| `USDA_API_KEY` | No | Defaults to hardcoded key in `usdaFdc.ts` |
| `PORT` | No | Defaults to 10000 (Render-compatible) |

## graphify

This project has a graphify knowledge graph at `graphify-out/`.

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure.
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost).

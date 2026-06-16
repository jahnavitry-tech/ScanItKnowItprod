import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import type { ICompositionAnalysis, IngredientsData, RedditData } from "@/types/analysis";

// gcTime: 30 min — freed after navigation away, preventing unbounded memory
// growth when scanning multiple products in a session.
const GC_TIME = 30 * 60 * 1000;

// Attach rate-limit metadata to thrown errors so the UI can show a countdown.
interface RateLimitError extends Error {
  status: number;
  retryAfter: number;
  isRateLimit: true;
}

async function postAnalysis(url: string, body: object, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 429 || res.status === 503) {
    let retryAfter = 60;
    try {
      const json = await res.json();
      if (typeof json.retryAfter === "number") retryAfter = json.retryAfter;
    } catch {}
    const err = Object.assign(
      new Error(`Rate limited (${res.status}) — retry in ${retryAfter}s`),
      { status: res.status, retryAfter, isRateLimit: true as const },
    ) as RateLimitError;
    throw err;
  }

  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

// Reddit-specific fetch: 503 = "service unavailable" (not a Gemini quota error).
// Using postAnalysis for Reddit would set isRateLimit:true on 503, triggering a
// false "daily quota reached" banner that blocks all card refreshes for 60 s.
async function postRedditAnalysis(url: string, body: object, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 429) {
    let retryAfter = 60;
    try {
      const json = await res.json();
      if (typeof json.retryAfter === "number") retryAfter = json.retryAfter;
    } catch {}
    const err = Object.assign(
      new Error(`Rate limited (429) — retry in ${retryAfter}s`),
      { status: 429, retryAfter, isRateLimit: true as const },
    ) as RateLimitError;
    throw err;
  }

  if (!res.ok) throw new Error(`Reddit reviews unavailable (${res.status})`);
  const json = await res.json();
  return json.data ?? json;
}

// Only retry non-rate-limit errors (transient network hiccups).
function shouldRetry(failureCount: number, error: unknown): boolean {
  if ((error as any)?.isRateLimit) return false;
  return failureCount < 2;
}

export function useCompositionQuery(analysisId: string, enabled: boolean) {
  const forceRef = useRef(false);
  const query = useQuery<ICompositionAnalysis>({
    queryKey: ["composition", analysisId],
    queryFn: async ({ signal }) => {
      const isForced = forceRef.current;
      forceRef.current = false;
      return postAnalysis(
        "/api/analyze-composition",
        { analysisId, forceRefresh: isForced },
        signal,
      ) as Promise<ICompositionAnalysis>;
    },
    enabled,
    staleTime: Infinity,
    gcTime: GC_TIME,
    retry: shouldRetry,
    retryDelay: 2000,
  });

  const forceRefetch = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, forceRefetch };
}

export function useIngredientsQuery(analysisId: string, enabled: boolean) {
  const forceRef = useRef(false);
  const query = useQuery<IngredientsData>({
    queryKey: ["ingredients", analysisId],
    queryFn: async ({ signal }) => {
      const isForced = forceRef.current;
      forceRef.current = false;
      return postAnalysis(
        "/api/analyze-ingredients",
        { analysisId, forceRefresh: isForced },
        signal,
      ) as Promise<IngredientsData>;
    },
    enabled,
    staleTime: Infinity,
    gcTime: GC_TIME,
    retry: shouldRetry,
    retryDelay: 2000,
  });

  const forceRefetch = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, forceRefetch };
}

export function useRedditQuery(analysisId: string, enabled: boolean) {
  const forceRef = useRef(false);
  const query = useQuery<RedditData>({
    queryKey: ["reddit", analysisId],
    queryFn: async ({ signal }) => {
      const isForced = forceRef.current;
      forceRef.current = false;
      return postRedditAnalysis(
        "/api/analyze-reddit",
        { analysisId, forceRefresh: isForced },
        signal,
      ) as Promise<RedditData>;
    },
    enabled,
    staleTime: Infinity,
    gcTime: GC_TIME,
    retry: false,
  });

  const forceRefetch = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, forceRefetch };
}

import { useState, useEffect } from "react";
import type { IngredientsData } from "@/types/analysis";

const STORAGE_KEY = "siki-scan-history";
const MAX_ENTRIES = 10;

export interface ScanHistoryEntry {
  analysisId: string;
  productName: string;
  productSummary: string;
  imageUrl: string;
  timestamp: number;
  healthScore?: number;  // 0–100, filled after ingredients load
  category?: "food" | "cosmetic" | "supplement" | "other";
}

export function computeHealthScore(ingredientsData: IngredientsData): number {
  const items = ingredientsData.ingredients_analysis;
  if (!items.length) return 50;
  const safe     = items.filter(i => i.safety_status === "Safe").length;
  const moderate = items.filter(i => i.safety_status === "Moderate").length;
  const total    = items.length;
  return Math.round(((safe * 100) + (moderate * 50)) / total);
}

export function guessCategory(summary: string, name: string): ScanHistoryEntry["category"] {
  const text = (summary + " " + name).toLowerCase();
  if (/cream|serum|lotion|shampoo|conditioner|moistur|sunscreen|spf|skin|lip|mascara|foundation|makeup|cosmetic|deodorant|perfume|cologne|body wash|face wash|soap/.test(text))
    return "cosmetic";
  if (/supplement|vitamin|capsule|tablet|omega|probiotic|zinc|magnesium|protein powder/.test(text))
    return "supplement";
  if (/calorie|nutrition|ingredient|fat|protein|carb|sugar|sodium|snack|food|drink|beverage|cereal|bar|chip|sauce|candy|chocolate|coffee|tea|dairy|grain|yogurt|cheese/.test(text))
    return "food";
  return "other";
}

export function getHistory(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addScan(entry: ScanHistoryEntry): void {
  const history = getHistory().filter(e => e.analysisId !== entry.analysisId);
  history.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  window.dispatchEvent(new Event("siki-history-update"));
}

export function updateScanScore(analysisId: string, healthScore: number): void {
  const history = getHistory();
  const idx = history.findIndex(e => e.analysisId === analysisId);
  if (idx !== -1) {
    history[idx] = { ...history[idx], healthScore };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event("siki-history-update"));
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("siki-history-update"));
}

/** Returns scan counts per day for the last 7 days, oldest first. */
export function getTrends(): { date: string; label: string; count: number }[] {
  const history = getHistory();
  const days: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toLocaleDateString("en-CA")] = 0;
  }
  history.forEach(e => {
    const key = new Date(e.timestamp).toLocaleDateString("en-CA");
    if (key in days) days[key]++;
  });
  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return Object.entries(days).map(([date, count]) => ({
    date,
    label: dayLabels[new Date(date + "T12:00:00").getDay()],
    count,
  }));
}

export function useScanHistory(): ScanHistoryEntry[] {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
    const refresh = () => setHistory(getHistory());
    window.addEventListener("siki-history-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("siki-history-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return history;
}

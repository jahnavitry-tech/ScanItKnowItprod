import { createPortal } from "react-dom";
import { useCallback } from "react";
import { X, Trash2, Clock, TrendingUp, Package } from "lucide-react";
import { useScanHistory, clearHistory, getTrends } from "@/hooks/use-scan-history";
import type { ScanHistoryEntry } from "@/hooks/use-scan-history";

interface HistorySheetProps {
  open: boolean;
  onClose: () => void;
  onReopen?: (analysisId: string) => void;
}

const BG        = "rgba(14,14,14,0.98)";
const SURFACE   = "rgba(255,255,255,0.05)";
const BORDER    = "rgba(255,255,255,0.08)";
const ACCENT    = "#94aaff";
const TEXT      = "rgba(255,255,255,0.88)";
const MUTED     = "rgba(255,255,255,0.38)";

function scoreColor(score?: number): string {
  if (score === undefined) return "rgba(255,255,255,0.18)";
  if (score >= 75) return "#4ade80";
  if (score >= 45) return "#facc15";
  return "#f87171";
}

function scoreLabel(score?: number): string {
  if (score === undefined) return "–";
  if (score >= 75) return "Safe";
  if (score >= 45) return "Mixed";
  return "Concern";
}

function categoryColor(cat?: ScanHistoryEntry["category"]): string {
  switch (cat) {
    case "food":       return "#60a5fa";
    case "cosmetic":   return "#f472b6";
    case "supplement": return "#a78bfa";
    default:           return "#6b7280";
  }
}

function formatRelTime(ts: number): string {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(diff / 3_600_000);
  const day  = Math.floor(diff / 86_400_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr  < 24) return `${hr}h ago`;
  if (day < 7)  return `${day}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BarChart() {
  const trends = getTrends();
  const max    = Math.max(...trends.map(t => t.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56 }}>
      {trends.map(({ label, count }) => (
        <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%",
            height: Math.max(4, Math.round((count / max) * 44)),
            borderRadius: 4,
            background: count > 0
              ? `linear-gradient(180deg, ${ACCENT}, ${ACCENT}88)`
              : SURFACE,
            transition: "height 0.3s ease",
          }} />
          <span style={{ fontSize: 9, color: MUTED, fontFamily: "Inter, sans-serif" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryBreakdown({ history }: { history: ScanHistoryEntry[] }) {
  if (!history.length) return null;
  const counts: Record<string, number> = { food: 0, cosmetic: 0, supplement: 0, other: 0 };
  history.forEach(e => counts[e.category ?? "other"]++);
  const total = history.length;

  const cats = [
    { key: "food",       label: "Food",        color: "#60a5fa" },
    { key: "cosmetic",   label: "Cosmetic",     color: "#f472b6" },
    { key: "supplement", label: "Supplement",   color: "#a78bfa" },
    { key: "other",      label: "Other",        color: "#6b7280" },
  ].filter(c => counts[c.key] > 0);

  let cumPct = 0;
  const segments = cats.map(c => {
    const pct  = (counts[c.key] / total) * 100;
    const seg  = { ...c, pct, start: cumPct };
    cumPct += pct;
    return seg;
  });

  const R = 18, C = 22, strokeW = 7;
  const circ = 2 * Math.PI * R;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={C * 2} height={C * 2} viewBox={`0 0 ${C * 2} ${C * 2}`} style={{ flexShrink: 0 }}>
        {segments.map(s => (
          <circle
            key={s.key}
            cx={C} cy={C} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeDasharray={`${(s.pct / 100) * circ} ${circ}`}
            strokeDashoffset={-((s.start / 100) * circ)}
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        ))}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: MUTED, fontFamily: "Inter, sans-serif" }}>
              {s.label} <span style={{ color: TEXT, fontWeight: 600 }}>{counts[s.key]}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanCard({ entry, onReopen }: { entry: ScanHistoryEntry; onReopen?: (id: string) => void }) {
  const sc = scoreColor(entry.healthScore);
  return (
    <div
      onClick={() => onReopen?.(entry.analysisId)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px",
        borderRadius: 14,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        cursor: onReopen ? "pointer" : "default",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={e => (e.currentTarget.style.background = SURFACE)}
    >
      {/* Thumbnail */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        overflow: "hidden", background: "rgba(255,255,255,0.06)",
        border: `1px solid ${BORDER}`,
      }}>
        {entry.imageUrl ? (
          <img src={entry.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={18} color={MUTED} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: TEXT, fontSize: 13, fontWeight: 600,
          fontFamily: "Manrope, sans-serif",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          margin: 0,
        }}>
          {entry.productName}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {entry.category && (
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: "Inter, sans-serif",
              color: categoryColor(entry.category),
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {entry.category}
            </span>
          )}
          <span style={{ fontSize: 11, color: MUTED, fontFamily: "Inter, sans-serif" }}>
            {formatRelTime(entry.timestamp)}
          </span>
        </div>
      </div>

      {/* Health badge */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        flexShrink: 0, gap: 1,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: `2.5px solid ${sc}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontSize: entry.healthScore !== undefined ? 11 : 14,
            fontWeight: 700, color: sc,
            fontFamily: "Inter, sans-serif",
          }}>
            {entry.healthScore !== undefined ? entry.healthScore : "–"}
          </span>
        </div>
        <span style={{ fontSize: 9, color: sc, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
          {scoreLabel(entry.healthScore)}
        </span>
      </div>
    </div>
  );
}

export function HistorySheet({ open, onClose, onReopen }: HistorySheetProps) {
  const history = useScanHistory();

  const handleClear = useCallback(() => {
    if (confirm("Clear all scan history?")) clearHistory();
  }, []);

  if (!open) return null;

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 10000,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          maxHeight: "88vh",
          background: BG,
          borderTop: `1px solid ${BORDER}`,
          borderRadius: "24px 24px 0 0",
          zIndex: 10001,
          display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 60px rgba(0,0,0,0.7)",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 20px 12px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: `${ACCENT}18`, color: ACCENT,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Clock size={15} />
            </div>
            <div>
              <h2 style={{ color: TEXT, fontSize: 16, fontWeight: 700, fontFamily: "Manrope, sans-serif", margin: 0 }}>
                Scan History
              </h2>
              <p style={{ color: MUTED, fontSize: 11, fontFamily: "Inter, sans-serif", margin: 0 }}>
                {history.length} of 10 recent scans
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {history.length > 0 && (
              <button
                onClick={handleClear}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#f87171", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                aria-label="Clear history"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: SURFACE, border: `1px solid ${BORDER}`,
                color: MUTED, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 24px" }}>
          {history.length === 0 ? (
            /* Empty state */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 12, padding: "48px 0",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: SURFACE, border: `1px solid ${BORDER}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Package size={22} color={MUTED} />
              </div>
              <p style={{ color: MUTED, fontSize: 14, fontFamily: "Inter, sans-serif", margin: 0 }}>
                No scans yet — scan a product to get started
              </p>
            </div>
          ) : (
            <>
              {/* 7-day activity section */}
              <section style={{
                background: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 16, padding: "14px 16px", marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                  <TrendingUp size={13} color={ACCENT} />
                  <span style={{ color: ACCENT, fontSize: 11, fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    7-Day Activity
                  </span>
                </div>
                <BarChart />
              </section>

              {/* Category breakdown */}
              <section style={{
                background: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 16, padding: "14px 16px", marginBottom: 14,
              }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
                  Categories
                </span>
                <CategoryBreakdown history={history} />
              </section>

              {/* Scan list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map(entry => (
                  <ScanCard key={entry.analysisId} entry={entry} onReopen={onReopen} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

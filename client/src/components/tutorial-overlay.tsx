import { createPortal } from "react-dom";
import { useEffect, useState, useCallback } from "react";
import { X, ChevronRight, Scan, LayoutGrid, BarChart3, List, History } from "lucide-react";

const STORAGE_KEY = "siki-tutorial-done";
const PAD = 14;
const ARROW = 9;
const CARD_H_EST = 180;

interface Step {
  targetId?: string;
  title: string;
  body: string;
  tipPos: "above" | "below" | "center";
}

const STEPS: Step[] = [
  {
    targetId: "tutorial-viewfinder",
    title: "Aim & Scan",
    body: "Center any product label or barcode in the frame, then tap the glowing capture button to start instant AI analysis.",
    tipPos: "above",
  },
  {
    targetId: "tutorial-gallery",
    title: "Upload from Gallery",
    body: "Already have a photo? Tap the grid icon to pick any image from your device instead of using the camera.",
    tipPos: "above",
  },
  {
    title: "Deep Analysis Cards",
    body: "After scanning, swipe through four cards — Nutrition Facts, Ingredient Safety, Reddit Reviews, and AI Chat — for a full product breakdown.",
    tipPos: "center",
  },
  {
    title: "Smart Filter Tabs",
    body: "Inside each card, tap the filter tabs to focus on specific data: macros, sugars, vitamins, minerals, or just the highlights.",
    tipPos: "center",
  },
  {
    targetId: "tutorial-history",
    title: "History",
    body: "Revisit any previously scanned product any time using the History button.",
    tipPos: "below",
  },
];

const STEP_ICONS = [
  <Scan key="0" size={15} />,
  <LayoutGrid key="1" size={15} />,
  <BarChart3 key="2" size={15} />,
  <List key="3" size={15} />,
  <History key="4" size={15} />,
];

interface SRect { x: number; y: number; w: number; h: number }

function getRect(targetId: string | undefined): SRect | null {
  if (!targetId) return null;
  const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: Math.max(0, r.left - PAD),
    y: Math.max(0, r.top - PAD),
    w: r.width + PAD * 2,
    h: r.height + PAD * 2,
  };
}

export function TutorialOverlay() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<SRect | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setActive(true);
  }, []);

  const cur = STEPS[step];

  const measure = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    setRect(getRect(cur.targetId));
  }, [cur.targetId]);

  useEffect(() => {
    if (!active) return;
    // Defer one frame so elements have rendered
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [active, measure]);

  const finish = (completed: boolean) => {
    if (completed) localStorage.setItem(STORAGE_KEY, "true");
    setActive(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish(true);
  };

  if (!active || vw === 0) return null;

  // Clamp spotlight bounds
  const rx = rect ? rect.x : 0;
  const ry = rect ? rect.y : 0;
  const rw = rect ? rect.w : 0;
  const rh = rect ? rect.h : 0;
  const rb = ry + rh;
  const rr = rx + rw;

  // Card sizing & position
  const cardW = Math.min(340, vw - 32);
  const cardX = Math.round((vw - cardW) / 2);

  let cardY: number;
  let arrowDir: "up" | "down" | null = null;
  let arrowOffset = 0;

  if (rect && cur.tipPos !== "center") {
    if (cur.tipPos === "above") {
      cardY = ry - CARD_H_EST - 10;
      if (cardY < 80) { cardY = rb + 10; arrowDir = "up"; }
      else arrowDir = "down";
    } else {
      cardY = rb + 10;
      if (cardY + CARD_H_EST > vh - 20) { cardY = ry - CARD_H_EST - 10; arrowDir = "down"; }
      else arrowDir = "up";
    }
    // Clamp arrow to card width
    const center = Math.round(rx + rw / 2);
    arrowOffset = Math.max(16, Math.min(cardW - 16, center - cardX)) - ARROW;
  } else {
    cardY = Math.round((vh - CARD_H_EST) / 2);
  }

  const DIM = "rgba(0,0,0,0.78)";
  const BORDER = "rgba(148,170,255,0.2)";
  const ACCENT = "#94aaff";

  const overlay = (
    <>
      {/* ── Spotlight (4-rect technique) ── */}
      {rect ? (
        <>
          {/* Top strip */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: ry, background: DIM, zIndex: 9998 }} />
          {/* Bottom strip */}
          <div style={{ position: "fixed", top: rb, left: 0, right: 0, bottom: 0, background: DIM, zIndex: 9998 }} />
          {/* Left strip */}
          <div style={{ position: "fixed", top: ry, left: 0, width: rx, height: rh, background: DIM, zIndex: 9998 }} />
          {/* Right strip */}
          <div style={{ position: "fixed", top: ry, left: rr, right: 0, height: rh, background: DIM, zIndex: 9998 }} />
          {/* Highlight ring */}
          <div style={{
            position: "fixed", top: ry, left: rx, width: rw, height: rh,
            border: `2px solid ${ACCENT}99`,
            borderRadius: 16,
            boxShadow: `0 0 0 1px ${ACCENT}22, 0 0 20px ${ACCENT}20`,
            zIndex: 9998,
            pointerEvents: "none",
          }} />
        </>
      ) : (
        /* Full dim when no spotlight target */
        <div style={{ position: "fixed", inset: 0, background: DIM, zIndex: 9998 }} />
      )}

      {/* ── Tooltip card ── */}
      <div style={{
        position: "fixed",
        top: cardY,
        left: cardX,
        width: cardW,
        zIndex: 9999,
      }}>
        {/* Arrow pointing down toward element below card */}
        {arrowDir === "down" && (
          <div style={{
            position: "absolute", bottom: -ARROW,
            left: arrowOffset,
            width: 0, height: 0,
            borderLeft: `${ARROW}px solid transparent`,
            borderRight: `${ARROW}px solid transparent`,
            borderTop: `${ARROW}px solid rgba(18,20,32,0.98)`,
          }} />
        )}
        {/* Arrow pointing up toward element above card */}
        {arrowDir === "up" && (
          <div style={{
            position: "absolute", top: -ARROW,
            left: arrowOffset,
            width: 0, height: 0,
            borderLeft: `${ARROW}px solid transparent`,
            borderRight: `${ARROW}px solid transparent`,
            borderBottom: `${ARROW}px solid rgba(18,20,32,0.98)`,
          }} />
        )}

        <div style={{
          background: "rgba(18,20,32,0.98)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          padding: "18px 18px 14px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
        }}>
          {/* Icon · Title · Skip */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                background: `${ACCENT}22`, color: ACCENT,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {STEP_ICONS[step]}
              </div>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "Manrope, sans-serif" }}>
                {cur.title}
              </span>
            </div>
            <button
              onClick={() => finish(false)}
              aria-label="Skip tutorial"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.32)", padding: 4, lineHeight: 1,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <p style={{
            color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.6,
            fontFamily: "Inter, sans-serif", margin: "0 0 16px",
          }}>
            {cur.body}
          </p>

          {/* Progress dots · Next button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  height: 6, borderRadius: 3,
                  width: i === step ? 18 : 6,
                  background: i === step ? ACCENT : "rgba(255,255,255,0.18)",
                  transition: "width 0.22s ease, background 0.22s ease",
                }} />
              ))}
            </div>
            <button
              onClick={next}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "8px 16px", borderRadius: 20,
                background: `linear-gradient(135deg, ${ACCENT}, hsl(228,100%,65%))`,
                color: "#fff", fontWeight: 600, fontSize: 13,
                fontFamily: "Inter, sans-serif",
                border: "none", cursor: "pointer",
                boxShadow: `0 2px 12px ${ACCENT}44`,
              }}
            >
              {step < STEPS.length - 1
                ? <><span>Next</span><ChevronRight size={14} /></>
                : <span>Get Started</span>
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}

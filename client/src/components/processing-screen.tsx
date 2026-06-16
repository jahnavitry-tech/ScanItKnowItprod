import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Sparkles } from "lucide-react";

interface ProcessingScreenProps {
  capturedImageUrl: string;
  onCancel: () => void;
  /** 0-100 upload+processing progress from XHR. When provided, drives step
   *  state directly. When absent (undefined), falls back to the original
   *  timer-based cosmetic progression for backward compatibility. */
  progress?: number;
}

const STEPS = [
  "Image captured",
  "Identifying product…",
  "Fetching data…",
];

/** Map 0-100 progress value to the active step index (0 | 1 | 2). */
function progressToStep(pct: number): number {
  if (pct >= 70) return 2;
  if (pct >= 30) return 1;
  return 0;
}

export function ProcessingScreen({ capturedImageUrl, onCancel, progress }: ProcessingScreenProps) {
  // Timer-based step state — only used when `progress` prop is absent
  const [timerStep, setTimerStep] = useState(0);

  useEffect(() => {
    if (progress !== undefined) return; // real progress drives the UI — no timer needed
    const t1 = setTimeout(() => setTimerStep(1), 1400);
    const t2 = setTimeout(() => setTimerStep(2), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [progress]);

  const activeStep = progress !== undefined ? progressToStep(progress) : timerStep;

  return (
    <div className="fixed inset-0 bg-[#0e0e0e] overflow-hidden" data-testid="processing-screen">

      {/* Background: blurred captured image */}
      <div className="absolute inset-0 z-0">
        {capturedImageUrl && (
          <img
            src={capturedImageUrl}
            alt=""
            className="w-full h-full object-cover scale-[1.1]"
            style={{ filter: "blur(24px)" }}
          />
        )}
        <div className="absolute inset-0 bg-[rgba(8,9,14,0.75)]" />
      </div>

      {/* Top bar */}
      <header className="absolute top-0 w-full z-10 flex justify-between items-center px-5 pt-12 pb-4">
        <Logo dark size="md" />
      </header>

      {/* Main content */}
      <main className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-6 gap-10">

        {/* Progress ring */}
        <div className="relative flex items-center justify-center">
          {/* Outer pulsing ring */}
          <div
            className="absolute animate-scan-pulse"
            style={{ width: 96, height: 96, border: "1.5px solid rgba(148,170,255,0.2)", borderRadius: "50%" }}
          />
          {/* Spinning arc */}
          <div
            className="absolute animate-spin-slow"
            style={{ width: 80, height: 80, border: "2px solid transparent", borderTopColor: "#94aaff", borderRadius: "50%" }}
          />
          {/* Inner circle */}
          <div
            className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
            style={{ background: "rgba(148,170,255,0.08)", border: "1px solid rgba(148,170,255,0.4)" }}
          >
            <Sparkles className="w-5 h-5 text-[#94aaff]" />
          </div>
        </div>

        {/* Progress bar (only shown when real progress is available) */}
        {progress !== undefined && (
          <div className="w-full max-w-sm">
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #94aaff, #d674ff)" }}
              />
            </div>
            <p className="text-center text-[10px] text-white/30 mt-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
              {progress < 30 ? "Uploading…" : progress < 70 ? "Analyzing…" : "Finishing…"}
            </p>
          </div>
        )}

        {/* Step pills */}
        <div className="w-full max-w-sm space-y-2.5">
          {STEPS.map((label, i) => {
            const isDone    = activeStep > i;
            const isActive  = activeStep === i;
            const isPending = activeStep < i;

            return (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-500"
                style={{
                  background: isDone
                    ? "rgba(74,222,128,0.06)"
                    : isActive
                    ? "rgba(148,170,255,0.08)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    isDone
                      ? "rgba(74,222,128,0.20)"
                      : isActive
                      ? "rgba(148,170,255,0.25)"
                      : "rgba(255,255,255,0.07)"
                  }`,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* State dot */}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "animate-step-pulse" : ""}`}
                    style={{
                      background: isDone ? "#4ade80" : isActive ? "#94aaff" : "rgba(255,255,255,0.2)",
                      boxShadow: isActive ? "0 0 8px #94aaff" : "none",
                    }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ fontFamily: "Inter, sans-serif", color: isPending ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)" }}
                  >
                    {label}
                  </span>
                </div>

                {/* Badge */}
                {isDone && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}
                  >
                    Done
                  </span>
                )}
                {isActive && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(148,170,255,0.15)", color: "#94aaff" }}
                  >
                    Running
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Bottom dock */}
      <nav className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
        <div
          className="px-8 py-3"
          style={{ backdropFilter: "blur(20px)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 40 }}
        >
          <button
            onClick={onCancel}
            className="text-white/60 text-sm font-medium hover:text-white transition-colors"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Cancel
          </button>
        </div>
      </nav>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/use-camera";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { ProductSelectionScreen } from "./product-selection-screen";
import { ProductIdentificationScreen } from "./product-identification-screen";
import { ProcessingScreen } from "./processing-screen";
import { Logo } from "./Logo";
import { HistorySheet } from "./history";
import { addScan, guessCategory } from "@/hooks/use-scan-history";
import { Camera, LayoutGrid, FlipHorizontal2, Sun, Moon, History } from "lucide-react";
import type { ProductAnalysis } from "@/types/analysis";

// ─── Image compression ──────────────────────────────────────────────────────
// Tries OffscreenCanvas Web Worker first (off-thread, no UI jank).
// Falls back to main-thread canvas if Worker / createImageBitmap unavailable.

async function compressImage(source: Blob): Promise<Blob> {
  // Worker path — non-blocking
  if (
    typeof Worker !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  ) {
    try {
      const bitmap = await createImageBitmap(source);
      return await new Promise<Blob>((resolve, reject) => {
        const worker = new Worker("/workers/image-compressor.worker.js");
        worker.onmessage = (e: MessageEvent) => {
          resolve(new Blob([e.data.arrayBuffer], { type: "image/jpeg" }));
          worker.terminate();
        };
        worker.onerror = (err) => {
          reject(err);
          worker.terminate();
        };
        // Transfer bitmap ownership — zero-copy
        worker.postMessage(
          { imageBitmap: bitmap, maxDim: 512, quality: 0.80 },
          [bitmap as unknown as Transferable]
        );
      });
    } catch {
      // Fall through to main-thread path
    }
  }

  // Main-thread fallback
  const MAX_SIDE = 512;
  const QUALITY = 0.80;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width >= height) {
          height = Math.round((height * MAX_SIDE) / width);
          width = MAX_SIDE;
        } else {
          width = Math.round((width * MAX_SIDE) / height);
          height = MAX_SIDE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(source); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob ?? source), "image/jpeg", QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CameraScreenProps {
  onProductAnalysisStart: (analysisId: string | string[]) => void;
}

type CameraView = "camera" | "loading" | "identification" | "selection";

// ─── Component ──────────────────────────────────────────────────────────────

export function CameraScreen({ onProductAnalysisStart }: CameraScreenProps) {
  const { videoRef, isStreaming, error, startCamera, stopCamera, switchCamera, capturePhoto } = useCamera();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [view, setView]                       = useState<CameraView>("camera");
  const [detectedProducts, setDetectedProducts] = useState<ProductAnalysis[]>([]);
  const [imageThumbnailUrl, setImageThumbnailUrl] = useState("");
  const [uploadProgress, setUploadProgress]   = useState(0);
  const [historyOpen, setHistoryOpen]          = useState(false);

  // Track current object URL so we can revoke it on every transition
  const thumbnailUrlRef = useRef<string>("");

  // Helper: create & track a new object URL, revoking any previous one
  const setTrackedUrl = (url: string) => {
    if (thumbnailUrlRef.current) URL.revokeObjectURL(thumbnailUrlRef.current);
    thumbnailUrlRef.current = url;
    setImageThumbnailUrl(url);
  };

  // Revoke URL on component unmount
  useEffect(() => {
    return () => {
      if (thumbnailUrlRef.current) {
        URL.revokeObjectURL(thumbnailUrlRef.current);
        thumbnailUrlRef.current = "";
      }
    };
  }, []);

  useEffect(() => { startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);
  useEffect(() => {
    if (error) toast({ title: "Camera Error", description: error, variant: "destructive" });
  }, [error, toast]);

  // ── Navigation helpers ──────────────────────────────────────────────────
  const handleProductSelect = (id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    ids.forEach(aid => {
      const p = detectedProducts.find(d => d.analysisId === aid);
      if (p) {
        addScan({
          analysisId: p.analysisId,
          productName: p.productName,
          productSummary: p.productSummary,
          imageUrl: p.imageUrl,
          timestamp: Date.now(),
          category: guessCategory(p.productSummary, p.productName),
        });
      }
    });
    onProductAnalysisStart(id);
  };

  const handleClose = () => {
    if (thumbnailUrlRef.current) {
      URL.revokeObjectURL(thumbnailUrlRef.current);
      thumbnailUrlRef.current = "";
    }
    setImageThumbnailUrl("");
    setView("camera");
  };

  const handleRescan = () => {
    if (thumbnailUrlRef.current) {
      URL.revokeObjectURL(thumbnailUrlRef.current);
      thumbnailUrlRef.current = "";
    }
    setDetectedProducts([]);
    setImageThumbnailUrl("");
    setUploadProgress(0);
    setView("camera");
  };

  const handleAnalyzeAll = () => {
    if (detectedProducts.length === 0) return;
    detectedProducts.forEach(p => {
      addScan({
        analysisId: p.analysisId,
        productName: p.productName,
        productSummary: p.productSummary,
        imageUrl: p.imageUrl,
        timestamp: Date.now(),
        category: guessCategory(p.productSummary, p.productName),
      });
    });
    onProductAnalysisStart(detectedProducts.map((p) => p.analysisId));
  };

  // ── API upload with XHR (real upload progress + simulated AI progress) ──
  const uploadAndAnalyze = (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("image", file);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let processingTimer: ReturnType<typeof setInterval> | null = null;

      // Upload phase: 0 → 30 %
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 30));
        }
      };

      xhr.onload = () => {
        if (processingTimer) clearInterval(processingTimer);
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          try {
            const data = JSON.parse(xhr.responseText);
            const list = Array.isArray(data) ? data : data.analysisId ? [data] : null;
            if (!list) { reject(new Error("No product identified.")); return; }
            setDetectedProducts(list);
            setView("identification");
            resolve();
          } catch {
            reject(new Error("Invalid server response"));
          }
        } else {
          reject(new Error("Server error"));
        }
      };

      xhr.onerror = () => {
        if (processingTimer) clearInterval(processingTimer);
        reject(new Error("Network error"));
      };

      xhr.open("POST", "/api/analyze-product");
      xhr.send(formData);

      // After upload completes, simulate AI processing: 30 → 90 %
      // We advance in small random increments so the bar looks alive
      let pct = 30;
      processingTimer = setInterval(() => {
        pct = Math.min(90, pct + Math.random() * 2.5 + 0.5);
        setUploadProgress(Math.round(pct));
      }, 350);

      // Stop simulation timer whenever the XHR finishes (success or error)
      xhr.onloadend = () => {
        if (processingTimer) { clearInterval(processingTimer); processingTimer = null; }
      };
    });
  };

  // ── Capture from live camera ────────────────────────────────────────────
  const handleCapture = async () => {
    try {
      setUploadProgress(0);
      const blob       = await capturePhoto();
      const compressed = await compressImage(blob);
      const file       = new File([compressed], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setTrackedUrl(URL.createObjectURL(file));
      setView("loading");
      await uploadAndAnalyze(file);
    } catch {
      toast({ title: "Analysis Failed", description: "Failed to analyze. Please try again.", variant: "destructive" });
      setUploadProgress(0);
      setView("camera");
    }
  };

  // ── Pick from gallery / file system ────────────────────────────────────
  const handleGalleryClick = () => {
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploadProgress(0);
      setView("loading");
      try {
        const compressed = await compressImage(file);
        const f          = new File([compressed], file.name, { type: "image/jpeg" });
        setTrackedUrl(URL.createObjectURL(f));
        await uploadAndAnalyze(f);
      } catch {
        toast({ title: "Analysis Failed", description: "Failed to analyze. Please try again.", variant: "destructive" });
        setUploadProgress(0);
        setView("camera");
      }
    };
    input.click();
  };

  // ── Non-camera overlays ─────────────────────────────────────────────────
  if (view === "loading") {
    return (
      <ProcessingScreen
        capturedImageUrl={imageThumbnailUrl}
        onCancel={handleRescan}
        progress={uploadProgress}
      />
    );
  }
  if (view === "identification") {
    return (
      <ProductIdentificationScreen
        detectedProducts={detectedProducts}
        capturedImageUrl={imageThumbnailUrl}
        onProductSelect={handleProductSelect}
        onAnalyzeAll={handleAnalyzeAll}
        onClose={handleClose}
      />
    );
  }
  if (view === "selection") {
    return (
      <div className="fixed inset-0 z-50 bg-md-surface">
        <ProductSelectionScreen
          detectedProducts={detectedProducts}
          imageThumbnailUrl={imageThumbnailUrl}
          onProductSelect={handleProductSelect}
          onRescan={handleRescan}
          onClose={handleClose}
        />
      </div>
    );
  }

  // ── Main camera view ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black overflow-hidden" data-testid="camera-screen">

      {/* Live camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${!isStreaming ? "hidden" : ""}`}
        data-testid="camera-video"
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/85 to-transparent" />
      </div>

      {/* No-camera placeholder */}
      {!isStreaming && (
        <div className="absolute inset-0 bg-[#0e0e0e] flex flex-col items-center justify-center gap-4 px-8">
          <Camera className="w-12 h-12 text-white/20" />
          <p className="text-white/40 text-sm text-center">{error ?? "Starting camera…"}</p>
          {error && (
            <button
              onClick={handleGalleryClick}
              className="mt-2 px-6 py-3 bg-[#2d3a8c] text-white rounded-full font-medium text-sm"
              data-testid="button-upload-fallback"
            >
              Upload Photo Instead
            </button>
          )}
        </div>
      )}

      {/* ── Top floating nav bar ── */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 pt-12 pb-4">
        <Logo dark size="md" />

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/8 border border-white/12 text-white/80 hover:text-white hover:bg-white/15 transition-all active:scale-90 duration-150"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/8 border border-white/12 text-white/80 hover:text-white hover:bg-white/15 transition-all active:scale-90 duration-150"
            aria-label="History"
            data-tutorial-id="tutorial-history"
            data-tutorial="history-button"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Scanner frame — centred ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
        <div className="relative" data-tutorial-id="tutorial-viewfinder" data-tutorial="camera-viewfinder" style={{ width: 220, height: 220 }}>
          {/* Corner brackets */}
          <div className="absolute top-0 left-0 w-7 h-7 border-l-[3px] border-t-[3px] border-[#94aaff] rounded-tl-[6px]" />
          <div className="absolute top-0 right-0 w-7 h-7 border-r-[3px] border-t-[3px] border-[#94aaff] rounded-tr-[6px]" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-l-[3px] border-b-[3px] border-[#94aaff] rounded-bl-[6px]" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-r-[3px] border-b-[3px] border-[#94aaff] rounded-br-[6px]" />
          {/* Animated scan line */}
          <div
            className="absolute animate-scan-line"
            style={{ left: 3, right: 3, height: 2, background: "linear-gradient(90deg, transparent, #94aaff, transparent)" }}
          />
          {/* Glow rings */}
          <div className="absolute animate-scan-pulse" style={{ inset: -20, border: "1px solid rgba(148,170,255,0.15)", borderRadius: "50%" }} />
          <div className="absolute animate-scan-pulse" style={{ inset: -36, border: "1px solid rgba(148,170,255,0.08)", borderRadius: "50%", animationDelay: "0.6s" }} />
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em", fontFamily: "Inter, sans-serif" }}>
          Point at a product label
        </p>
      </div>

      {/* History sheet */}
      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* ── Bottom floating dock ── */}
      <nav className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
        <div
          className="flex items-center gap-6 px-7 py-3"
          style={{ backdropFilter: "blur(20px)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 40 }}
        >
          {/* Gallery */}
          <button
            onClick={handleGalleryClick}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90 duration-150"
            aria-label="Gallery"
            data-testid="button-gallery"
            data-tutorial-id="tutorial-gallery"
            data-tutorial="gallery-button"
          >
            <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />
          </button>

          {/* Scan / Capture — elevated */}
          <button
            onClick={handleCapture}
            disabled={!isStreaming}
            className="relative -mt-5 disabled:opacity-40"
            aria-label="Scan"
            data-testid="button-capture"
          >
            <div className="w-16 h-16 rounded-full bg-white/12 border-2 border-white/20 flex items-center justify-center">
              <div
                className="w-[52px] h-[52px] rounded-full flex items-center justify-center active:scale-90 transition-all duration-150"
                style={{ background: "linear-gradient(135deg, #94aaff, hsl(228,100%,65%))", boxShadow: "0 0 20px rgba(148,170,255,0.4)" }}
              >
                <Camera className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
            </div>
          </button>

          {/* Flip camera */}
          <button
            onClick={switchCamera}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90 duration-150"
            aria-label="Flip camera"
            data-testid="button-switch-camera-bottom"
          >
            <FlipHorizontal2 className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </nav>
    </div>
  );
}

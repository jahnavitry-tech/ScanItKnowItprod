import { useState, useRef, useCallback } from "react";

export function useCamera() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (newFacingMode?: "user" | "environment") => {
    const targetFacingMode = newFacingMode || facingMode;
    
    try {
      setIsStreaming(false);
      setError(null);
      
      // Check if camera is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera not supported in this browser");
      }

      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Define constraints with the target facing mode
      const constraints = {
        video: {
          facingMode: targetFacingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 960, max: 1080 }
        },
        audio: false
      };

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (specificErr) {
        // Try with basic constraints if specific ones fail
        const basicConstraints = {
          video: { facingMode: targetFacingMode },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video metadata to load before marking as streaming
        videoRef.current.onloadedmetadata = () => {
          setIsStreaming(true);
        };
      }
    } catch (err) {
      let errorMessage = "Camera unavailable";
      
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMessage = "Camera permission denied. Please allow camera access and try again.";
        } else if (err.name === "NotFoundError") {
          errorMessage = "No camera found. Use the upload button instead.";
        } else if (err.name === "NotReadableError") {
          errorMessage = "Camera in use by another app. Use upload instead.";
        } else if (err.name === "OverconstrainedError") {
          errorMessage = "Camera constraints not supported. Use upload instead.";
        } else {
          errorMessage = err.message || "Camera access denied or device is busy.";
        }
      }
      
      setError(errorMessage);
      setIsStreaming(false);
      console.error("Camera error:", err);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
  }, []);

  const switchCamera = useCallback(() => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    startCamera(newMode);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current || !isStreaming) {
        reject(new Error("Camera not ready"));
        return;
      }

      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;

      if (videoWidth === 0 || videoHeight === 0) {
        reject(new Error("Video not loaded yet. Please wait a moment and try again."));
        return;
      }

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Failed to create canvas context"));
        return;
      }

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      context.drawImage(videoRef.current, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to capture photo"));
        }
      }, "image/jpeg", 0.8);
    });
  }, [isStreaming]);

  return {
    videoRef,
    isStreaming,
    error,
    facingMode,
    startCamera,
    stopCamera,
    switchCamera,
    capturePhoto
  };
}

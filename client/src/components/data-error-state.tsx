import { AlertTriangle } from "lucide-react";

interface DataErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function DataErrorState({ message, onRetry }: DataErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 text-center">
      <AlertTriangle className="w-5 h-5 text-amber-500" />
      <p className="text-xs text-gray-500" style={{ fontFamily: "Inter, sans-serif" }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-semibold underline"
          style={{ color: "#2d3a8c" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

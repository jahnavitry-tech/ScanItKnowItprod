import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    // Original: className="h-11 w-11 p-0" (44x44px)
    // MODERN HEADER UPDATE - Design Request 001: Maintaining 48dp touch target with proper icon sizing
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="h-12 w-12 p-0" // 48dp x 48dp touch target as per Material Design
      data-testid="button-theme-toggle"
    >
      {/* Original: className="h-5 w-5" (20x20px) */}
      {/* MODERN HEADER UPDATE - Design Request 001: 24dp x 24dp icon size for Material Design compliance */}
      {theme === "light" ? (
        <Sun className="h-6 w-6" /> // 24dp x 24dp
      ) : (
        <Moon className="h-6 w-6" /> // 24dp x 24dp
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
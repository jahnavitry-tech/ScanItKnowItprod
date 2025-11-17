import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Function to update favicons based on theme
function updateFavicons(theme: Theme) {
  const faviconSuffix = theme === 'dark' ? 'dark' : 'light';
  
  // Update all favicons
  const favicon16 = document.getElementById('favicon-16');
  const favicon32 = document.getElementById('favicon-32');
  const favicon48 = document.getElementById('favicon-48');
  const favicon96 = document.getElementById('favicon-96');
  const favicon180 = document.getElementById('favicon-180');
  const favicon192 = document.getElementById('favicon-192');
  const favicon512 = document.getElementById('favicon-512');
  const appleTouchIcon = document.getElementById('apple-touch-icon');
  
  if (favicon16) favicon16.setAttribute('href', `/assets/favicon-${faviconSuffix}-16x16.png`);
  if (favicon32) favicon32.setAttribute('href', `/assets/favicon-${faviconSuffix}-32x32.png`);
  if (favicon48) favicon48.setAttribute('href', `/assets/favicon-${faviconSuffix}-48x48.png`);
  if (favicon96) favicon96.setAttribute('href', `/assets/favicon-${faviconSuffix}-96x96.png`);
  if (favicon180) favicon180.setAttribute('href', `/assets/favicon-${faviconSuffix}-180x180.png`);
  if (favicon192) favicon192.setAttribute('href', `/assets/favicon-${faviconSuffix}-192x192.png`);
  if (favicon512) favicon512.setAttribute('href', `/assets/favicon-${faviconSuffix}-512x512.png`);
  
  // Update Apple touch icon
  if (appleTouchIcon) appleTouchIcon.setAttribute('href', `/assets/favicon-${faviconSuffix}-180x180.png`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const savedTheme = localStorage.getItem("theme") as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const systemPreference = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      setTheme(systemPreference);
    }
  }, []);

  useEffect(() => {
    // Apply theme to document
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
    
    // Update favicons when theme changes
    updateFavicons(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
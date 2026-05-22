import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('sentinel_theme');
    return (saved as Theme) || 'dark';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('sentinel_theme', newTheme);
  };

  useEffect(() => {
    const updateEffectiveTheme = () => {
      if (theme === 'auto') {
        const hour = new Date().getHours();
        // Day: 6am to 6pm (18:00)
        const isDay = hour >= 6 && hour < 18;
        setEffectiveTheme(isDay ? 'light' : 'dark');
      } else {
        setEffectiveTheme(theme as 'light' | 'dark');
      }
    };

    updateEffectiveTheme();

    // In auto mode, check every minute if we need to switch
    const interval = setInterval(() => {
      if (theme === 'auto') {
        updateEffectiveTheme();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    
    // Also update style for body for full coverage
    if (effectiveTheme === 'dark') {
      root.style.colorScheme = 'dark';
    } else {
      root.style.colorScheme = 'light';
    }
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

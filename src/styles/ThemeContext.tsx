import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { COLOR, type ColorTokens } from "./tokens";

export interface ThemeValue {
  isDark: boolean;
  /** 當前明暗那組色票 */
  tokens: ColorTokens;
}

const ThemeContext = createContext<ThemeValue>({ isDark: true, tokens: COLOR.dark });

/** 明暗仍由底圖決定（App 的 isDarkTheme）；同時把 data-theme 寫到 <html> 供 tokens.css 使用。 */
export function ThemeProvider({ isDark, children }: { isDark: boolean; children: ReactNode }) {
  const value = useMemo<ThemeValue>(
    () => ({ isDark, tokens: isDark ? COLOR.dark : COLOR.light }),
    [isDark],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

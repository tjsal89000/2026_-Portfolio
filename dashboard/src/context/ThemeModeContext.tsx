import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider, CssBaseline, type PaletteMode } from "@mui/material";
import { createAppTheme } from "../theme";

interface ThemeModeContextValue {
  mode: PaletteMode;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

const STORAGE_KEY = "aiops-dashboard-theme-mode";

function readInitialMode(): PaletteMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "dark" ? "dark" : "light"; // 기본값은 라이트
}

// main.tsx에서 App 전체를 이걸로 한 번만 감싸면, 어떤 컴포넌트에서든
// useThemeMode()로 현재 모드를 읽고 toggleMode()로 바꿀 수 있다.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(readInitialMode);

  const toggleMode = () => {
    setMode((prev) => {
      const next: PaletteMode = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next); // 새로고침해도 마지막 선택 유지
      return next;
    });
  };

  // mode가 바뀔 때만 테마를 새로 계산 (매 렌더마다 createTheme 다시 만들지 않도록)
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode()는 AppThemeProvider 안에서만 쓸 수 있음");
  }
  return ctx;
}

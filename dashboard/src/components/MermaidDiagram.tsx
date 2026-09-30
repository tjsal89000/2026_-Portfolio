import { useEffect, useId, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { useThemeMode } from "../context/ThemeModeContext";
import { awsColors } from "../theme";

interface MermaidDiagramProps {
  definition: string;
}

// mermaid는 용량이 꽤 커서(파서+렌더러) 이 페이지를 아예 안 보는 사용자까지 초기 번들에
// 끼워 넣을 이유가 없다 - 이 컴포넌트가 실제로 마운트될 때(=이 메뉴에 들어왔을 때)만
// 동적 import로 불러온다.
export default function MermaidDiagram({ definition }: MermaidDiagramProps) {
  const { mode } = useThemeMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: mode === "dark" ? "dark" : "base",
          themeVariables: {
            primaryColor: mode === "dark" ? "#2A3441" : "#FFF3E0",
            primaryBorderColor: awsColors.orange,
            primaryTextColor: mode === "dark" ? "#E9EBED" : "#16191F",
            lineColor: mode === "dark" ? "#9BA7B4" : "#5A6B7A",
            fontFamily: "Amazon Ember, -apple-system, Roboto, Segoe UI, sans-serif",
          },
        });
        const { svg } = await mermaid.render(`mermaid-${id}`, definition);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [definition, mode, id]);

  if (error) {
    return (
      <Box sx={{ color: "error.main", fontSize: 13 }}>
        다이어그램을 그리지 못했습니다: {error}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        overflowX: "auto",
        minHeight: 120,
        display: "flex",
        justifyContent: "center",
        "& svg": { maxWidth: "none" },
      }}
    >
      <CircularProgress size={20} />
    </Box>
  );
}

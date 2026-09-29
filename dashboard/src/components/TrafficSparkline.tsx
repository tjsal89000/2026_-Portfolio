import { useRef, useState, type MouseEvent } from "react";
import { Box, useTheme } from "@mui/material";

interface TrafficSparklineProps {
  values: number[]; // 초당 건수, 배열 왼쪽=과거 / 오른쪽=현재
  height?: number;
}

// 단일 시계열 스파크라인 - 항목이 하나뿐이라 범례는 필요 없음(제목이 곧 범례).
// 얇은 2px 선 + 끝을 둥글게, 축/그리드는 생략(스파크라인의 관례)하되 hover 시
// 크로스헤어+툴팁은 표시한다("플롯은 기본적으로 상호작용 가능해야 한다"는 원칙).
export default function TrafficSparkline({ values, height = 64 }: TrafficSparklineProps) {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 100;
  const max = Math.max(1, ...values);
  const stepX = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * stepX,
    y: height - (v / max) * (height - 8) - 4,
    v,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (values.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), values.length - 1));
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <Box sx={{ position: "relative", width: "100%", height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <path
          d={pathD}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={0}
              y2={height}
              stroke={theme.palette.divider}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hovered.x} cy={hovered.y} r={3} fill={theme.palette.primary.main} />
          </>
        )}
      </svg>
      {hovered && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: `${(hovered.x / width) * 100}%`,
            transform: "translate(-50%, -100%)",
            bgcolor: "background.paper",
            border: (t) => `1px solid ${t.palette.divider}`,
            borderRadius: 1,
            px: 1,
            py: 0.25,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: 1,
            zIndex: 1,
          }}
        >
          {hovered.v.toFixed(0)}건/초
        </Box>
      )}
    </Box>
  );
}

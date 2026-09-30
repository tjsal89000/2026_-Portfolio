import { useRef, useState, type MouseEvent } from "react";
import { Box, useTheme } from "@mui/material";

interface TpsPoint {
  second: number; // epoch seconds
  count: number;
}

interface TrafficSparklineProps {
  points: TpsPoint[]; // 왼쪽=과거 / 오른쪽=현재, 1초 간격
  height?: number;
}

// 내부 좌표계를 고정 픽셀 단위로 두고 viewBox의 기본 비율 유지(preserveAspectRatio 기본값)로
// 스케일한다 - 이전 버전처럼 "none"으로 축 비율을 무시하면 안에 들어가는 축 눈금 텍스트가
// 가로/세로로 다르게 늘어나 찌그러져 보인다.
const VIEW_WIDTH = 640;
const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 };

function formatTime(second: number): string {
  return new Date(second * 1000).toLocaleTimeString("ko-KR", { hour12: false });
}

// 단일 시계열이라 범례는 필요 없음(패널 제목이 곧 범례) - 대신 X축(시각)/Y축(건수) 눈금을
// 옅은 색으로("recessive") 넣어서 그래프 혼자서도 값을 읽을 수 있게 한다.
export default function TrafficSparkline({ points, height = 180 }: TrafficSparklineProps) {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  // "보기 좋은" 상한(1, 2, 5, 10, 20, 50 ...) 중 실제 최댓값보다 큰 첫 값을 골라서, 그래프가
  // 매 순간 최댓값에 딱 붙어 출렁이지 않고 y축 상단에 약간의 여백을 두게 한다.
  const niceMax = (() => {
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    return steps.find((s) => s >= maxCount) ?? maxCount;
  })();

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xAt = (i: number) => MARGIN.left + i * stepX;
  const yAt = (count: number) => MARGIN.top + plotHeight - (count / niceMax) * plotHeight;

  const linePoints = points.map((p, i) => ({ x: xAt(i), y: yAt(p.count), ...p }));
  const pathD = linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const yTicks = [0, niceMax / 2, niceMax];

  // X축 라벨은 60개(60초) 점을 전부 찍으면 서로 겹치니, 일정 간격으로만 뽑는다.
  const xTickEvery = Math.max(1, Math.round(points.length / 6));
  const xTickIndices = points
    .map((_, i) => i)
    .filter((i) => i % xTickEvery === 0 || i === points.length - 1);

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const svgX = ratioX * VIEW_WIDTH;
    const index = Math.round((svgX - MARGIN.left) / (stepX || 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  };

  const hovered = hoverIndex !== null ? linePoints[hoverIndex] : null;
  const axisColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        width="100%"
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        {/* Y축 그리드/눈금 - 옅게, 값 읽기용이지 강조용이 아님 */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={VIEW_WIDTH - MARGIN.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke={axisColor}
              strokeWidth={1}
              opacity={0.5}
            />
            <text x={MARGIN.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={textColor}>
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* X축 시각 눈금 */}
        {xTickIndices.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fill={textColor}
          >
            {formatTime(points[i].second)}
          </text>
        ))}

        {/* 데이터 라인 */}
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
              y1={MARGIN.top}
              y2={height - MARGIN.bottom}
              stroke={axisColor}
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={3.5} fill={theme.palette.primary.main} />
          </>
        )}
      </svg>

      {hovered && (
        <Box
          sx={{
            position: "absolute",
            left: `${(hovered.x / VIEW_WIDTH) * 100}%`,
            top: 0,
            transform: "translate(-50%, -4px)",
            bgcolor: "background.paper",
            border: (t) => `1px solid ${t.palette.divider}`,
            borderRadius: 1,
            px: 1,
            py: 0.5,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: 1,
            zIndex: 1,
          }}
        >
          <Box sx={{ fontWeight: 700 }}>{formatTime(hovered.second)}</Box>
          <Box sx={{ color: "text.secondary" }}>{hovered.count}건/초</Box>
        </Box>
      )}
    </Box>
  );
}

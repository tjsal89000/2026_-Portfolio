import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Box, useTheme } from "@mui/material";

interface TpsPoint {
  second: number; // epoch seconds
  count: number;
}

interface TrafficSparklineProps {
  points: TpsPoint[]; // 왼쪽=과거 / 오른쪽=현재, 1초 간격
  height?: number;
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 };

// 이상탐지 에이전트(agents/anomaly-detector/redis_watcher.py)가 실제로 쓰는 "TPS 급증" 판정
// 배율과 정확히 같은 값. 그래프의 임계선이 실제 백엔드 로직과 숫자가 어긋나면 그래프를 못
// 믿게 되므로, 하드코딩된 상수 하나로 양쪽이 항상 같은 값을 보게 맞춘다.
const TPS_SPIKE_MULTIPLIER = 3.0;

function formatTime(second: number): string {
  return new Date(second * 1000).toLocaleTimeString("ko-KR", { hour12: false });
}

// 단일 시계열이라 범례는 필요 없음(패널 제목이 곧 범례) - 대신 X축(시각)/Y축(건수) 눈금을
// 옅은 색으로("recessive") 넣어서 그래프 혼자서도 값을 읽을 수 있게 한다.
export default function TrafficSparkline({ points, height = 180 }: TrafficSparklineProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // viewBox 너비를 실제 컨테이너 픽셀 너비에 정확히 맞춘다 - 고정 숫자(예: 640)를 쓰면
  // preserveAspectRatio 기본 동작("xMidYMid meet")이 종횡비를 맞추려고 좌우에 여백을 남겨서
  // 그래프가 가운데에만 작게 떠 보이는 문제가 있었다. 컨테이너 너비 = viewBox 너비로 맞추면
  // 스케일링 자체가 필요 없어져서 항상 꽉 차고, 안의 텍스트도 늘어나 찌그러지지 않는다.
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const meanCount = points.length > 0 ? points.reduce((sum, p) => sum + p.count, 0) / points.length : 0;
  const threshold = meanCount * TPS_SPIKE_MULTIPLIER;

  // "보기 좋은" 상한(1, 2, 5, 10, 20, 50 ...) 중 실제 최댓값과 임계선보다 큰 첫 값을 골라서,
  // 그래프가 매 순간 최댓값에 딱 붙어 출렁이지 않고 임계선도 항상 화면 안에 들어오게 한다.
  const niceMax = (() => {
    const target = Math.max(maxCount, threshold);
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    return steps.find((s) => s >= target) ?? target;
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
    const svgX = e.clientX - rect.left;
    const index = Math.round((svgX - MARGIN.left) / (stepX || 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  };

  const hovered = hoverIndex !== null ? linePoints[hoverIndex] : null;
  const axisColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;
  // 급증 판정 임계값이라 "위험/경고" 계열 색으로 데이터 라인(primary)과 확실히 구분한다.
  const thresholdColor = theme.palette.error.main;

  return (
    <Box ref={containerRef} sx={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
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
              x2={width - MARGIN.right}
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
          <text key={i} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize={10} fill={textColor}>
            {formatTime(points[i].second)}
          </text>
        ))}

        {/* 이상탐지 임계선 - "평소(60초 평균) 대비 3배" 지점. 실제 평소 트래픽이 0에 가까우면
            임계선도 0 근처라 의미가 없으므로 그 경우엔 그리지 않는다. */}
        {threshold > 0.5 && (
          <g>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={yAt(threshold)}
              y2={yAt(threshold)}
              stroke={thresholdColor}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.8}
            />
            <text
              x={width - MARGIN.right}
              y={yAt(threshold) - 5}
              textAnchor="end"
              fontSize={10}
              fill={thresholdColor}
            >
              이상탐지 임계선 (1분 평균×{TPS_SPIKE_MULTIPLIER.toFixed(0)})
            </text>
          </g>
        )}

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
            left: `${(hovered.x / width) * 100}%`,
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

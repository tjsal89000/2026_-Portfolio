import { useState } from "react";
import { Box, Tooltip, useTheme } from "@mui/material";

// mermaid(자동 배치 라이브러리)가 노드 16개짜리 그래프를 어떻게 그릴지 미리 볼 수 없어서
// 실제로는 지저분하게 나왔다 - 그 대신 진행 상황 페이지의 PhaseFlow.tsx와 같은 방식으로,
// 좌표를 전부 직접 계산해서 겹치거나 꼬이지 않는다는 걸 코드만 보고 보장한다.
export type FlowCategory = "java" | "ts" | "python" | "ext";

export interface FlowNode {
  id: string;
  label: string;
  category: FlowCategory;
  col: number;
  row: number;
  // 호버 시 보여줄 설명 - 이 컴포넌트 하나가 여러 노드를 그리는 목적 없이 순수 렌더러 역할만
  // 하도록, "무슨 역할이고 왜 이 기술을 썼는지"는 데이터로 여기 들어오게 한다.
  tooltip?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  // 화살표 여러 개가 한 노드의 같은 변(edge)에 몰릴 때 겹치지 않도록 살짝 위/아래로 벌려주는 값
  fromOffset?: number;
  toOffset?: number;
  // 지정하면 from/to 좌표 계산을 무시하고 이 점들을 그대로 잇는다 (되돌아가는 화살표처럼
  // 격자 규칙(같은 행/열)을 벗어나는 경우에만 사용)
  waypoints?: { x: number; y: number }[];
}

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeWidth?: number;
  nodeHeight?: number;
  colGap?: number;
  rowGap?: number;
}

const CATEGORY_COLOR: Record<FlowCategory, { fill: string; stroke: string; text: string }> = {
  java: { fill: "#FFF3E0", stroke: "#EF6C00", text: "#E65100" },
  ts: { fill: "#E3F2FD", stroke: "#1565C0", text: "#0D47A1" },
  python: { fill: "#E8F5E9", stroke: "#2E7D32", text: "#1B5E20" },
  ext: { fill: "#F3E5F5", stroke: "#7B1FA2", text: "#4A148C" },
};

export default function FlowDiagram({ nodes, edges, nodeWidth = 130, nodeHeight = 50, colGap = 70, rowGap = 34 }: FlowDiagramProps) {
  const theme = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const colX = (col: number) => col * (nodeWidth + colGap);
  const rowY = (row: number) => row * (nodeHeight + rowGap);
  // 노드 + 우회 경로(waypoints) 좌표를 전부 포함해서 실제 내용물 크기를 구한다. 렌더 폭에
  // 맞춰 viewBox를 늘리지 않는 게 핵심 - 그렇게 하면 컨테이너가 내용보다 넓을 때 우측에
  // 빈 캔버스만 남는데(전에 그랬음), 대신 내용 크기 그대로 viewBox를 잡고 SVG가 컨테이너
  // 폭에 맞춰 통째로 확대되게(preserveAspectRatio 기본값) 두면 빈 공간 없이 꽉 찬다.
  const contentWidth = Math.max(
    ...nodes.map((n) => colX(n.col) + nodeWidth),
    ...edges.flatMap((e) => e.waypoints?.map((p) => p.x) ?? []),
  );
  const contentHeight = Math.max(
    ...nodes.map((n) => rowY(n.row) + nodeHeight),
    ...edges.flatMap((e) => e.waypoints?.map((p) => p.y) ?? []),
  );

  // 경로를 문자열이 아니라 점(point) 배열로 만들어서, "d" 속성(전체를 잇는 선)과 라벨
  // 위치(중간 세그먼트의 중점) 둘 다 같은 좌표에서 정확히 계산되게 한다.
  function edgePoints(edge: FlowEdge): { x: number; y: number }[] {
    if (edge.waypoints) return edge.waypoints;
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const fromOffset = edge.fromOffset ?? 0;
    const toOffset = edge.toOffset ?? 0;

    if (from.col === to.col) {
      // 같은 열 - 세로로만 연결 (방향에 따라 아래/위 어느 쪽이든)
      const goingDown = to.row > from.row;
      const x = colX(from.col) + nodeWidth / 2;
      const y1 = goingDown ? rowY(from.row) + nodeHeight : rowY(from.row);
      const y2 = goingDown ? rowY(to.row) : rowY(to.row) + nodeHeight;
      return [
        { x, y: y1 },
        { x, y: y2 },
      ];
    }
    if (from.row === to.row) {
      // 같은 행 - 가로로만 연결
      const goingRight = to.col > from.col;
      const y = rowY(from.row) + nodeHeight / 2;
      const x1 = goingRight ? colX(from.col) + nodeWidth : colX(from.col);
      const x2 = goingRight ? colX(to.col) : colX(to.col) + nodeWidth;
      return [
        { x: x1, y },
        { x: x2, y },
      ];
    }
    // 행·열이 둘 다 다름(하나가 여러 곳으로 갈라지는 경우) - 가로로 나간 뒤 중간 지점에서
    // 꺾어 세로로 이동하고, 마지막에 다시 가로로 들어간다 (ㄱ자 두 번, 항상 옆 열 사이로만
    // 지나가서 다른 노드를 가로지르지 않음)
    const goingRight = to.col > from.col;
    const x1 = goingRight ? colX(from.col) + nodeWidth : colX(from.col);
    const x2 = goingRight ? colX(to.col) : colX(to.col) + nodeWidth;
    const xMid = (x1 + x2) / 2;
    const y1 = rowY(from.row) + nodeHeight / 2 + fromOffset;
    const y2 = rowY(to.row) + nodeHeight / 2 + toOffset;
    return [
      { x: x1, y: y1 },
      { x: xMid, y: y1 },
      { x: xMid, y: y2 },
      { x: x2, y: y2 },
    ];
  }

  // 라벨을 놓을 자리: 세그먼트가 2개(직선)면 그 하나뿐인 세그먼트의 중점, 3개 이상(꺾은선)이면
  // 가장 가운데 있는 세그먼트의 중점 - 항상 노드 박스에서 떨어진 "선 위 중앙"에 놓이게 된다.
  function labelPosition(points: { x: number; y: number }[]): { x: number; y: number } {
    const segments = points.length - 1;
    const mid = Math.floor(segments / 2);
    const a = points[mid];
    const b = points[mid + 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`-10 -10 ${contentWidth + 20} ${contentHeight + 20}`}
        width="100%"
        style={{ display: "block", minWidth: 480 }}
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.text.secondary} />
          </marker>
        </defs>

        {edges.map((edge, i) => {
          const points = edgePoints(edge);
          const d = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const label = labelPosition(points);
          const highlighted = hoveredId === edge.from || hoveredId === edge.to;

          return (
            <g key={`${edge.from}-${edge.to}-${i}`}>
              <path
                d={d}
                stroke={highlighted ? theme.palette.primary.main : theme.palette.text.secondary}
                strokeWidth={highlighted ? 2 : 1.5}
                strokeDasharray={edge.dashed ? "5 4" : undefined}
                fill="none"
                markerEnd="url(#flow-arrow)"
                opacity={highlighted ? 1 : 0.75}
              />
              {edge.label && (
                <text
                  x={label.x}
                  y={label.y - 6}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={theme.palette.text.secondary}
                  style={{ paintOrder: "stroke", stroke: theme.palette.background.paper, strokeWidth: 4 }}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node) => {
          const colors = CATEGORY_COLOR[node.category];
          const x = colX(node.col);
          const y = rowY(node.row);
          const lines = node.label.split("\n");
          const nodeEl = (
            <g
              transform={`translate(${x}, ${y})`}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: node.tooltip ? "help" : "default" }}
            >
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={8}
                fill={colors.fill}
                stroke={hoveredId === node.id ? theme.palette.primary.main : colors.stroke}
                strokeWidth={hoveredId === node.id ? 2.5 : 1.5}
              />
              {lines.map((line, i) => (
                <text
                  key={i}
                  x={nodeWidth / 2}
                  y={nodeHeight / 2 - ((lines.length - 1) * 12) / 2 + i * 12 + 4}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={600}
                  fill={colors.text}
                >
                  {line}
                </text>
              ))}
            </g>
          );

          return node.tooltip ? (
            <Tooltip key={node.id} title={node.tooltip} arrow placement="top">
              {nodeEl}
            </Tooltip>
          ) : (
            <g key={node.id}>{nodeEl}</g>
          );
        })}
      </svg>
    </Box>
  );
}

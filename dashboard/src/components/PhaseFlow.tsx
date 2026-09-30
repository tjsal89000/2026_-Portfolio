import { useState } from "react";
import { Box, useTheme } from "@mui/material";
import type { Phase, PhaseStatus } from "../data/phases";

interface PhaseFlowProps {
  phases: Phase[];
}

const COLUMNS = 7;
const NODE_W = 118;
const NODE_H = 52;
const GAP_X = 18;
const GAP_Y = 56;

// 14개(Phase 0~13)를 한 줄로 그리면 너무 길어져서, 로드맵 다이어그램에서 흔히 쓰는
// "지그재그(스네이크)" 배치로 2줄에 나눠 담는다 - 첫 줄은 왼쪽→오른쪽, 둘째 줄은
// 오른쪽→왼쪽으로 흘러서 줄이 바뀌는 지점(Phase 6→7)에서 선이 그대로 아래로 떨어지게 만든다.
function nodePosition(index: number) {
  const row = Math.floor(index / COLUMNS);
  const colInRow = index % COLUMNS;
  const col = row % 2 === 0 ? colInRow : COLUMNS - 1 - colInRow;
  return {
    x: col * (NODE_W + GAP_X),
    y: row * (NODE_H + GAP_Y),
    row,
    col,
  };
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "완료",
  "in-progress": "진행중",
  pending: "예정",
};

export default function PhaseFlow({ phases }: PhaseFlowProps) {
  const theme = useTheme();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const statusColor: Record<PhaseStatus, string> = {
    done: theme.palette.success.main,
    "in-progress": theme.palette.warning.main,
    pending: theme.palette.mode === "dark" ? "#3A4552" : "#C4CDD5",
  };
  const statusTextColor: Record<PhaseStatus, string> = {
    done: theme.palette.mode === "dark" ? "#0F1416" : "#FFFFFF",
    "in-progress": theme.palette.mode === "dark" ? "#0F1416" : "#16191F",
    pending: theme.palette.text.secondary,
  };

  const positions = phases.map((_, i) => nodePosition(i));
  const maxRow = Math.max(...positions.map((p) => p.row));
  const width = COLUMNS * NODE_W + (COLUMNS - 1) * GAP_X;
  const height = (maxRow + 1) * NODE_H + maxRow * GAP_Y;

  const hovered = hoverIndex !== null ? phases[hoverIndex] : null;
  const hoveredPos = hoverIndex !== null ? positions[hoverIndex] : null;

  return (
    // 바깥 Box는 overflow를 지정하지 않는다(=visible) - 안쪽 스크롤 Box에만 overflowX를
    // 주는 이유: 이 Box에 overflowX:auto를 직접 걸면 CSS 스펙상 overflowY도 자동으로
    // auto로 강제돼서(둘 중 하나가 visible이 아니면 나머지도 visible일 수 없음), 절대
    // 위치로 떠 있는 툴팁이 이 Box 경계를 넘어가는 순간(Phase 7~13이 있는 아랫줄, 또는
    // 우측 끝 노드) 그대로 잘려서 안 보이거나 스크롤바가 튀어나오는 문제가 있었다.
    <Box sx={{ position: "relative", width: "100%" }}>
      <Box sx={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 640, display: "block" }}>
          {/* 화살표 마커 정의 - 화살촉 하나를 정의해두고 모든 연결선에서 재사용 */}
          <defs>
          <marker id="phase-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.divider} />
          </marker>
        </defs>

        {/* 연결선: 같은 줄이면 수평, 줄이 바뀌면 오른쪽/왼쪽 끝에서 수직으로 */}
        {positions.slice(0, -1).map((from, i) => {
          const to = positions[i + 1];
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const sameRow = from.row === to.row;
          const d = sameRow
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${from.x + NODE_W / 2} ${from.y + NODE_H} L ${to.x + NODE_W / 2} ${to.y}`;
          return (
            <path
              key={i}
              d={d}
              stroke={theme.palette.divider}
              strokeWidth={2}
              fill="none"
              markerEnd="url(#phase-arrow)"
            />
          );
        })}

        {phases.map((phase, i) => {
          const pos = positions[i];
          const isHovered = hoverIndex === i;
          return (
            <g
              key={phase.number}
              transform={`translate(${pos.x}, ${pos.y})`}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={statusColor[phase.status]}
                stroke={isHovered ? theme.palette.text.primary : "transparent"}
                strokeWidth={2}
              />
              <text
                x={NODE_W / 2}
                y={20}
                textAnchor="middle"
                fontSize={10}
                fill={statusTextColor[phase.status]}
                opacity={0.85}
              >
                {`Phase ${phase.number}`}
              </text>
              <text
                x={NODE_W / 2}
                y={36}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={statusTextColor[phase.status]}
              >
                {phase.shortLabel}
              </text>
            </g>
          );
        })}
        </svg>
      </Box>

      {hovered && hoveredPos && (
        <Box
          sx={{
            position: "absolute",
            left: `${((hoveredPos.x + NODE_W / 2) / width) * 100}%`,
            top: `${((hoveredPos.y + NODE_H) / height) * 100}%`,
            transform: "translate(-50%, 8px)",
            bgcolor: "background.paper",
            border: (t) => `1px solid ${t.palette.divider}`,
            borderRadius: 1,
            p: 1.5,
            width: 260,
            fontSize: 13,
            boxShadow: 3,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <Box sx={{ fontWeight: 700, mb: 0.5 }}>
            Phase {hovered.number} · {hovered.title} ({STATUS_LABEL[hovered.status]})
          </Box>
          <Box sx={{ color: "text.secondary" }}>{hovered.summary}</Box>
        </Box>
      )}
    </Box>
  );
}

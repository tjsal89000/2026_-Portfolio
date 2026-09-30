import { Box, Chip, List, ListItem, ListItemText, Paper, Toolbar, Typography } from "@mui/material";
import PhaseFlow from "../components/PhaseFlow";
import { PHASES, type PhaseStatus } from "../data/phases";
import { IMPROVEMENTS, type Priority } from "../data/improvements";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "완료",
  "in-progress": "진행중",
  pending: "예정",
};
const STATUS_COLOR: Record<PhaseStatus, "success" | "warning" | "default"> = {
  done: "success",
  "in-progress": "warning",
  pending: "default",
};

const PRIORITY_LABEL: Record<Priority, string> = { high: "우선순위 높음", medium: "우선순위 중간" };
const PRIORITY_COLOR: Record<Priority, "error" | "warning"> = { high: "error", medium: "warning" };

export default function ProgressPage() {
  const doneCount = PHASES.filter((p) => p.status === "done").length;

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          프로젝트 진행 상황
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          전체 {PHASES.length}개 Phase 중 {doneCount}개 완료. 노드에 마우스를 올리면 각 Phase의 상세 내용이 보입니다.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <PhaseFlow phases={PHASES} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Phase별 상세
          </Typography>
          <List dense>
            {PHASES.map((phase) => (
              <ListItem key={phase.number} disableGutters divider>
                <ListItemText
                  primary={`Phase ${phase.number} · ${phase.title}`}
                  secondary={phase.summary}
                />
                <Chip
                  size="small"
                  label={STATUS_LABEL[phase.status]}
                  color={STATUS_COLOR[phase.status]}
                  variant="outlined"
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            아쉬운 부분 / 보완점
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            "다 끝났다"가 아니라 지금 상태에서 뭐가 더 필요한지 스스로 정리해둔 목록.
          </Typography>
          <List dense>
            {IMPROVEMENTS.map((item) => (
              <ListItem key={item.title} disableGutters divider>
                <ListItemText primary={item.title} secondary={item.description} />
                <Chip
                  size="small"
                  label={PRIORITY_LABEL[item.priority]}
                  color={PRIORITY_COLOR[item.priority]}
                  variant="outlined"
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    </>
  );
}

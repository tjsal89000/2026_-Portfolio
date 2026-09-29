import { Box, Chip, List, ListItem, ListItemText, Paper, Toolbar, Typography } from "@mui/material";
import PhaseFlow from "../components/PhaseFlow";
import { PHASES, type PhaseStatus } from "../data/phases";

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
      </Box>
    </>
  );
}

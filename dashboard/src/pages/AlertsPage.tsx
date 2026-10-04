import { Box, Chip, List, ListItem, ListItemText, Paper, Toolbar, Typography } from "@mui/material";
import { useLiveFeed } from "../hooks/useLiveFeed";

export default function AlertsPage() {
  const { alerts, activeAlerts } = useLiveFeed();

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">이상탐지 알림</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          이상탐지 에이전트가 고액 결제, 같은 계좌의 반복 요청, 특정 국가·결제수단 쏠림, TPS 급증 같은 패턴을
          감지하면 여기에 쌓인다. 최근 5분 이내 알림 {activeAlerts}건.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <List dense>
            {alerts.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                감시 중 · 이상 패턴이 감지되면 여기에 표시됩니다
              </Typography>
            )}
            {alerts.map((a) => (
              <ListItem key={a.receivedAt} disableGutters divider>
                <ListItemText
                  primary={a.type}
                  secondary={
                    Object.entries(a.detail ?? {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ") + ` · ${new Date(a.receivedAt).toLocaleTimeString()}`
                  }
                />
                <Chip size="small" label="경고" color="warning" variant="outlined" />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    </>
  );
}

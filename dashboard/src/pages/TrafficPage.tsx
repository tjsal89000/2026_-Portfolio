import { Box, Chip, List, ListItem, ListItemText, Paper, Toolbar, Typography } from "@mui/material";
import TrafficSparkline from "../components/TrafficSparkline";
import { useLiveFeed } from "../hooks/useLiveFeed";

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "승인",
  DUPLICATE: "중복",
  FAILED: "실패",
};
const STATUS_COLOR: Record<string, "success" | "warning" | "error"> = {
  APPROVED: "success",
  DUPLICATE: "warning",
  FAILED: "error",
};

export default function TrafficPage() {
  const { payments, connected, tpsHistory, currentTps, errorRate } = useLiveFeed();

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">실시간 트래픽</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          결제 요청이 초당 몇 건 들어오는지(TPS)와 최근 결제 내역을 실시간으로 보여준다. 현재 TPS{" "}
          {currentTps.toFixed(1)}, 최근 1분 에러율 {errorRate.toFixed(1)}%.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              최근 60초 TPS
            </Typography>
            <Chip
              size="small"
              label={connected ? "연결됨" : "연결 안 됨"}
              color={connected ? "success" : "default"}
              variant="outlined"
            />
          </Box>
          <TrafficSparkline points={tpsHistory} height={240} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            최근 결제 내역
          </Typography>
          <List dense>
            {payments.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                결제 이벤트 대기 중...
              </Typography>
            )}
            {payments.map((p) => (
              <ListItem key={`${p.idempotencyKey}-${p.receivedAt}`} disableGutters divider>
                <ListItemText
                  primary={`${p.accountId} · ${p.amount.toLocaleString()}원 · ${p.country}/${p.paymentMethod}`}
                  secondary={new Date(p.receivedAt).toLocaleTimeString()}
                />
                <Chip
                  size="small"
                  label={STATUS_LABEL[p.status] ?? p.status}
                  color={STATUS_COLOR[p.status] ?? "default"}
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

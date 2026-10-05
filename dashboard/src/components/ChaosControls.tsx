import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { API_ORIGIN } from "../apiOrigin";

interface ChaosStatus {
  enabled: boolean;
  running: boolean;
  cooldownSeconds: number;
  remainingSeconds: number;
  maxTps: number;
  maxSeconds: number;
}

type ChaosMode = "burst" | "lag";

const OPS_CHAOS = `${API_ORIGIN}/ws-server/ops/chaos`;

const MODE_TITLE: Record<ChaosMode, string> = {
  burst: "트래픽 급증",
  lag: "Kafka 소비 지연",
};

// 실시간 모니터링 상단의 시연 제어 바. 버튼은 누구에게나 보이지만 실행은 비밀번호를 맞춰야 한다.
// 서버에서 장애 주입이 꺼져 있으면 아무것도 그리지 않는다.
export default function ChaosControls() {
  const [status, setStatus] = useState<ChaosStatus | null>(null);
  const [mode, setMode] = useState<ChaosMode | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus(await (await fetch(`${OPS_CHAOS}/status`)).json());
      } catch {
        setStatus(null);
      }
    };
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  if (!status?.enabled) return null;

  const close = () => {
    setMode(null);
    setPassword("");
    setError(null);
  };

  const start = async () => {
    if (!mode) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = mode === "burst" ? { password, tps: status.maxTps, seconds: 30 } : { password, seconds: 30 };
      const res = await fetch(`${OPS_CHAOS}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.started) {
        setMessage(
          mode === "burst"
            ? `트래픽 급증을 ${json.seconds}초 동안 주입 중입니다`
            : `결제 저장을 ${json.seconds}초 동안 멈췄습니다. Kafka Consumer Lag 변화를 보세요`,
        );
        setStatus((s) => (s && mode === "burst" ? { ...s, running: true, remainingSeconds: json.seconds } : s));
        close();
      } else {
        setError(json.reason ?? "실행에 실패했습니다");
      }
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            시연 제어
          </Typography>
          <Typography variant="caption" color="text.secondary">
            실행에는 비밀번호가 필요합니다. 각 주입은 자동으로 끝나고 원래 상태로 돌아갑니다.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ maxWidth: 300 }}>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={() => setMode("burst")}
              disabled={status.running || status.cooldownSeconds > 0}
            >
              {status.running
                ? `트래픽 급증 중 (${status.remainingSeconds}초)`
                : status.cooldownSeconds > 0
                  ? `쿨다운 ${status.cooldownSeconds}초`
                  : MODE_TITLE.burst}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              30초 동안 결제 요청을 몰아 보냅니다. TPS가 올라가고 이상탐지가 고액·반복 요청 알림을 띄우는지 확인하세요.
            </Typography>
          </Box>
          <Box sx={{ maxWidth: 300 }}>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={() => setMode("lag")}
              disabled={status.cooldownSeconds > 0}
            >
              {status.cooldownSeconds > 0 ? `쿨다운 ${status.cooldownSeconds}초` : MODE_TITLE.lag}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              30초 동안 DB 저장을 멈춥니다. 요청은 Kafka에 쌓여 Consumer Lag이 올라가고, 재개되면 0으로 돌아옵니다. 트래픽 급증과 함께 누르면 더 뚜렷합니다.
            </Typography>
          </Box>
        </Box>
      </Box>

      {message && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Dialog open={mode !== null} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>{mode ? `${MODE_TITLE[mode]} · 비밀번호 입력` : ""}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password && !submitting) start();
            }}
            margin="dense"
            autoComplete="off"
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>취소</Button>
          <Button variant="contained" color="warning" onClick={start} disabled={!password || submitting}>
            실행
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

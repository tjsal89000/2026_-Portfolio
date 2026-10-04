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
  remainingSeconds: number;
  maxTps: number;
  maxSeconds: number;
}

type ChaosMode = "burst" | "lag";

const OPS_CHAOS = `${API_ORIGIN}/ws-server/ops/chaos`;

const MODE_TITLE: Record<ChaosMode, string> = {
  burst: "트래픽 급증 주입",
  lag: "Kafka 소비 지연 주입",
};
const MODE_HINT: Record<ChaosMode, string> = {
  burst: "짧은 시간 동안 결제 요청을 몰아서 보낸다. 이상탐지가 감지하는지 확인하는 용도다.",
  lag: "결제 이벤트 저장(consumer)을 30초 멈춘다. 밀린 메시지가 lag 그래프에 쌓였다가 재개 후 0으로 돌아오는 것을 보여주는 용도다.",
};

// 두 장애 주입 모두 비밀번호를 맞춰야 실행된다. 비밀번호는 입력한 순간 서버로만 보내고 브라우저에는 남기지 않는다.
// 서버에서 장애 주입이 꺼져 있으면 이 패널은 아무것도 그리지 않는다.
export default function ChaosPanel({ onStarted }: { onStarted?: () => void }) {
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
      const body =
        mode === "burst"
          ? { password, tps: status.maxTps, seconds: 30 }
          : { password, seconds: 30 };
      const path = mode === "burst" ? "burst" : "lag";
      const res = await fetch(`${OPS_CHAOS}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.started) {
        setMessage(
          mode === "burst"
            ? `${json.tps} TPS로 ${json.seconds}초 동안 트래픽을 주입합니다`
            : `결제 저장을 ${json.seconds}초 동안 멈췄습니다. 실시간 모니터링에서 lag 변화를 확인하세요`,
        );
        close();
        onStarted?.();
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
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6">장애 주입 (시연용)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        실행에는 비밀번호가 필요하다. 각 주입은 자동으로 끝나고 원래 상태로 돌아간다.
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(["burst", "lag"] as ChaosMode[]).map((m) => (
          <Box key={m} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
              {MODE_HINT[m]}
            </Typography>
            <Button variant="contained" color="warning" onClick={() => setMode(m)} disabled={m === "burst" && status.running}>
              {m === "burst" && status.running ? `실행 중 (${status.remainingSeconds}초)` : MODE_TITLE[m]}
            </Button>
          </Box>
        ))}
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

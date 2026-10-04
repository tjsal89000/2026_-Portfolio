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

const OPS_CHAOS = `${API_ORIGIN}/ws-server/ops/chaos`;

// 버튼은 누구에게나 보이지만, 실행은 비밀번호를 맞춰야 한다. 비밀번호는 입력한 순간 서버로만 보내고
// 브라우저에는 저장하지 않는다. 서버가 장애 주입을 꺼 둔 상태라면 이 패널은 아무것도 그리지 않는다.
export default function ChaosPanel() {
  const [status, setStatus] = useState<ChaosStatus | null>(null);
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const start = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${OPS_CHAOS}/burst`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, tps: status.maxTps, seconds: 30 }),
      });
      const json = await res.json();
      if (json.started) {
        setMessage(`${json.tps} TPS로 ${json.seconds}초 동안 트래픽을 주입합니다`);
        setStatus((s) => (s ? { ...s, running: true, remainingSeconds: json.seconds } : s));
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
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h6">장애 주입 (트래픽 급증 시연)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            짧은 시간 동안 결제 요청을 몰아서 보낸다. 이상탐지가 이를 감지하는지, 알림과 리포트가 쌓이는지 확인하는 용도다.
            실행에는 비밀번호가 필요하고, 최대 {status.maxTps} TPS·{status.maxSeconds}초로 제한되며 끝나면 자동으로 멈춘다.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="warning"
          onClick={() => setOpen(true)}
          disabled={status.running}
        >
          {status.running ? `실행 중 (${status.remainingSeconds}초)` : "트래픽 급증 주입"}
        </Button>
      </Box>
      {message && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>비밀번호 입력</DialogTitle>
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

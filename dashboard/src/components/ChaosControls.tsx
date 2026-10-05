import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Typography } from "@mui/material";
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

// 버튼을 누르면 무엇이 일어나는지 설명하고, 예/아니오로 확인받은 뒤에만 실행한다.
const MODE_INFO: Record<ChaosMode, { title: string; button: string; body: string }> = {
  burst: {
    title: "트래픽 급증을 실행할까요?",
    button: "트래픽 급증",
    body: "30초 동안 결제 요청을 초당 최대 100건까지 몰아서 보냅니다. TPS 그래프가 올라가고, 이상탐지가 알림을 띄우는지 확인할 수 있습니다. 끝나면 자동으로 멈추고, 이후 1분 동안은 두 기능 모두 다시 실행할 수 없습니다.",
  },
  lag: {
    title: "Kafka 소비 지연을 실행할까요?",
    button: "Kafka 소비 지연",
    body: "30초 동안 결제 저장(DB 기록)을 멈춥니다. 요청은 Kafka에 쌓여서 Consumer Lag이 올라가고, 재개되면 0으로 돌아옵니다. 끝나면 자동으로 재개되며, 이후 1분 동안은 다시 실행할 수 없습니다.",
  },
};

// 장애 주입은 서버 설정(CHAOS_ENABLED)이 꺼져 있으면 아무것도 그리지 않는다.
export default function ChaosControls() {
  const [status, setStatus] = useState<ChaosStatus | null>(null);
  const [mode, setMode] = useState<ChaosMode | null>(null);
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

  const blocked = status.running || status.cooldownSeconds > 0;

  const close = () => {
    setMode(null);
    setError(null);
  };

  const run = async () => {
    if (!mode) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = mode === "burst" ? { tps: status.maxTps, seconds: 30 } : { seconds: 30 };
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
        setStatus((s) => (s ? { ...s, running: mode === "burst", cooldownSeconds: 60 + json.seconds, remainingSeconds: json.seconds } : s));
        close();
      } else {
        setError(json.reason ?? "실행에 실패했습니다");
      }
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel = (m: ChaosMode) => {
    if (status.running && m === "burst") return `트래픽 급증 중 (${status.remainingSeconds}초)`;
    if (status.cooldownSeconds > 0) return `쿨다운 ${status.cooldownSeconds}초`;
    return MODE_INFO[m].button;
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            시연 제어
          </Typography>
          <Typography variant="caption" color="text.secondary">
            버튼을 누르면 설명이 뜨고, 확인하면 실행됩니다. 실행 후 1분 동안은 다시 누를 수 없습니다.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ maxWidth: 300 }}>
            <Button size="small" variant="contained" color="warning" onClick={() => setMode("burst")} disabled={blocked}>
              {buttonLabel("burst")}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              30초 동안 결제 요청을 몰아 보냅니다. TPS와 이상탐지 알림의 변화를 보세요.
            </Typography>
          </Box>
          <Box sx={{ maxWidth: 300 }}>
            <Button size="small" variant="contained" color="warning" onClick={() => setMode("lag")} disabled={blocked}>
              {buttonLabel("lag")}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              30초 동안 DB 저장을 멈춥니다. Consumer Lag이 올라갔다가 0으로 돌아옵니다.
            </Typography>
          </Box>
        </Box>
      </Box>

      {message && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Dialog open={mode !== null} onClose={submitting ? undefined : close} fullWidth maxWidth="xs">
        <DialogTitle>{mode ? MODE_INFO[mode].title : ""}</DialogTitle>
        <DialogContent>
          <DialogContentText>{mode ? MODE_INFO[mode].body : ""}</DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={submitting}>
            아니오
          </Button>
          <Button variant="contained" color="warning" onClick={run} disabled={submitting}>
            예, 실행합니다
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

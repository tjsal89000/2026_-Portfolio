import { useEffect, useState } from "react";
import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import { API_ORIGIN } from "../apiOrigin";

interface ChaosStatus {
  enabled: boolean;
  running: boolean;
  remainingSeconds: number;
  maxTps: number;
  maxSeconds: number;
}

const OPS_CHAOS = `${API_ORIGIN}/ws-server/ops/chaos`;

// 장애 주입은 서버에서 켜졌을 때만 이 패널이 보인다. 꺼져 있으면 아무것도 그리지 않는다.
export default function ChaosPanel() {
  const [status, setStatus] = useState<ChaosStatus | null>(null);
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

  const start = async () => {
    setMessage(null);
    try {
      const res = await fetch(`${OPS_CHAOS}/burst?tps=${status.maxTps}&seconds=30`, { method: "POST" });
      const json = await res.json();
      setMessage(json.started ? `${json.tps} TPS로 ${json.seconds}초 동안 트래픽을 주입합니다` : json.reason);
      setStatus((s) => (s ? { ...s, running: json.started } : s));
    } catch {
      setMessage("요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h6">장애 주입 (트래픽 급증 시연)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            버튼을 누르면 짧은 시간 동안 결제 요청을 몰아서 보낸다. 이상탐지가 이를 감지하는지, 알림과 리포트가 쌓이는지 확인하는 용도다.
            최대 {status.maxTps} TPS, {status.maxSeconds}초로 제한되고 끝나면 자동으로 멈춘다.
          </Typography>
        </Box>
        <Button variant="contained" color="warning" onClick={start} disabled={status.running}>
          {status.running ? `실행 중 (${status.remainingSeconds}초)` : "트래픽 급증 주입"}
        </Button>
      </Box>
      {message && <Chip size="small" variant="outlined" label={message} sx={{ mt: 2 }} />}
    </Paper>
  );
}

import { useEffect, useState } from "react";
import { Box, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Toolbar, Typography } from "@mui/material";

interface Ec2Instance {
  instanceId: string;
  name: string;
  instanceType: string;
  state: string;
  publicIp: string | null;
  launchTime: string | null;
}

interface PodStatus {
  name: string;
  phase: string;
  ready: string;
  restarts: number;
  node: string;
  startTime: string | null;
}

const EC2_STATE_COLOR: Record<string, "success" | "warning" | "default" | "error"> = {
  running: "success",
  pending: "warning",
  stopping: "warning",
  stopped: "default",
  "shutting-down": "error",
};

const POD_PHASE_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  Running: "success",
  Pending: "warning",
  Failed: "error",
  Succeeded: "default",
};

export default function InfraPage() {
  const [instances, setInstances] = useState<Ec2Instance[]>([]);
  const [ec2Error, setEc2Error] = useState<string | null>(null);
  const [pods, setPods] = useState<PodStatus[]>([]);
  const [podsError, setPodsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEc2 = async () => {
      try {
        const res = await fetch("http://localhost/ws-server/infra/ec2");
        const json = await res.json();
        setInstances(json.instances ?? []);
        setEc2Error(json.error ?? null);
      } catch {
        setEc2Error("ws-server에 연결할 수 없습니다.");
      }
    };
    fetchEc2();
    const id = setInterval(fetchEc2, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const fetchPods = async () => {
      try {
        const res = await fetch("http://localhost/ws-server/infra/pods");
        const json = await res.json();
        setPods(json.pods ?? []);
        setPodsError(json.error ?? null);
      } catch {
        setPodsError("ws-server에 연결할 수 없습니다.");
      }
    };
    fetchPods();
    const id = setInterval(fetchPods, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          인프라 현황
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          EC2 인스턴스는 AWS SDK(인스턴스 프로파일 기반), Pod는 Kubernetes API를 15초마다 직접 조회합니다.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            EC2 인스턴스
          </Typography>
          {ec2Error && (
            <Typography variant="body2" color="text.secondary">
              조회 불가: {ec2Error}
            </Typography>
          )}
          {!ec2Error && instances.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              조회된 인스턴스가 없습니다.
            </Typography>
          )}
          {!ec2Error && instances.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>이름</TableCell>
                  <TableCell>인스턴스 ID</TableCell>
                  <TableCell>타입</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>퍼블릭 IP</TableCell>
                  <TableCell>시작 시각</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {instances.map((inst) => (
                  <TableRow key={inst.instanceId}>
                    <TableCell>{inst.name || "-"}</TableCell>
                    <TableCell>{inst.instanceId}</TableCell>
                    <TableCell>{inst.instanceType}</TableCell>
                    <TableCell>
                      <Chip size="small" label={inst.state} color={EC2_STATE_COLOR[inst.state] ?? "default"} variant="outlined" />
                    </TableCell>
                    <TableCell>{inst.publicIp ?? "-"}</TableCell>
                    <TableCell>{inst.launchTime ? new Date(inst.launchTime).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Pod (컨테이너) 현황 — aiops 네임스페이스
          </Typography>
          {podsError && (
            <Typography variant="body2" color="text.secondary">
              조회 불가: {podsError}
            </Typography>
          )}
          {!podsError && pods.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              조회된 Pod가 없습니다.
            </Typography>
          )}
          {!podsError && pods.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>이름</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>Ready</TableCell>
                  <TableCell>재시작</TableCell>
                  <TableCell>노드</TableCell>
                  <TableCell>시작 시각</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pods.map((pod) => (
                  <TableRow key={pod.name}>
                    <TableCell>{pod.name}</TableCell>
                    <TableCell>
                      <Chip size="small" label={pod.phase} color={POD_PHASE_COLOR[pod.phase] ?? "default"} variant="outlined" />
                    </TableCell>
                    <TableCell>{pod.ready}</TableCell>
                    <TableCell>{pod.restarts}</TableCell>
                    <TableCell>{pod.node}</TableCell>
                    <TableCell>{pod.startTime ? new Date(pod.startTime).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Box>
    </>
  );
}

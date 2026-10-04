import { Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

// 같은 서비스를 어떤 인프라에 올렸는지 비교한다. 값은 실제 terraform/, terraform-failover/, terraform-oci/
// 구성과 ADR 결정에서 가져온 사실만 적는다 (수치 추정은 넣지 않음).
const ROWS: { label: string; cells: [string, string, string, string] }[] = [
  {
    label: "구성 위치",
    cells: [
      "기존 온디맨드 인스턴스 (terraform/)",
      "Spot 인스턴스 + 고정 IP (terraform-failover/)",
      "Oracle Cloud 무료 A1 (terraform-oci/)",
      "EKS 관리형 클러스터 (미채택)",
    ],
  },
  {
    label: "현재 상태",
    cells: ["정지됨 · 장애 전환 시 대기용", "운영 중 · 공개 데모", "네트워크만 생성, 인스턴스 생성 실패", "구성 안 함"],
  },
  {
    label: "비용 특성",
    cells: ["상시 과금 (정지 중에는 저장 비용만)", "Spot 할인가, 중단 가능성 있음", "무료 한도 (재고가 있을 때만 생성 가능)", "컨트롤플레인 시간당 과금이 상시 발생"],
  },
  {
    label: "장애 대응",
    cells: ["Lambda가 이 인스턴스를 켜서 고정 IP 이전", "중단 2분 전 경고를 받아 대기 인스턴스로 자동 전환", "수동 생성만 가능 (자동 전환 없음)", "관리형 복구 (규모가 필요해서 미채택)"],
  },
  {
    label: "선택 이유",
    cells: ["전환 대상 확보용", "비용과 자동 전환을 같이 잡음", "비용 0원 실험용, 재고 문제로 보류", "단일 노드 데모에 과함 (ADR-3과 같은 논리)"],
  },
];

const HEADERS = ["항목", "AWS 온디맨드", "AWS Spot (현재 운영)", "OCI 무료 A1", "AWS EKS"];

export default function CloudComparison() {
  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6">인프라 선택 비교</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        같은 서비스를 올릴 수 있는 후보 4가지를 비교하고, 지금 어떤 걸 쓰는지와 그 이유를 정리했다.
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {HEADERS.map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.label}>
                <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{row.label}</TableCell>
                {row.cells.map((cell, i) => (
                  <TableCell key={i} sx={{ minWidth: 160 }}>
                    {i === 1 ? (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <Chip size="small" color="success" variant="outlined" label="현재 운영" sx={{ alignSelf: "flex-start" }} />
                        <Typography variant="body2">{cell}</Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2">{cell}</Typography>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

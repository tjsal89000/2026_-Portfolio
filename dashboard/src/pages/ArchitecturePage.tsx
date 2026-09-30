import { Box, Chip, Paper, Tooltip, Toolbar, Typography } from "@mui/material";
import { TOPOLOGY, type Tech } from "../data/infraTopology";

const TECH_COLOR: Record<Tech, "warning" | "info" | "success" | "default"> = {
  Java: "warning",
  TypeScript: "info",
  Python: "success",
  Infra: "default",
};

export default function ArchitecturePage() {
  const totalCount = TOPOLOGY.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          인프라 구성도
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          지금 EC2 위에 실제로 떠 있는 컨테이너 {totalCount}개 (k8s/*.yaml 기준). "인프라 현황"
          메뉴가 이것들의 실시간 상태(러닝 여부·재시작 횟수)를 보여준다면, 여기는 애초에 뭐가
          왜 떠 있는지를 보여준다. 박스에 마우스를 올리면 역할이 나온다.
        </Typography>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="overline" color="text.secondary">
            EC2 인스턴스 (Terraform 프로비저닝, t3.large)
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, sm: 3 },
              mt: 1.5,
              bgcolor: (t) => (t.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "#FAFAFA"),
            }}
          >
            <Typography variant="overline" color="text.secondary">
              k3s 클러스터 (단일 노드, Docker 런타임)
            </Typography>

            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 3 }}>
              {TOPOLOGY.map((group) => (
                <Box key={group.title}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                    {group.title}
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}>
                    {group.items.map((item) => (
                      <Tooltip key={item.name} title={item.description} arrow placement="top">
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 0.5,
                            px: 1.5,
                            py: 1,
                            minWidth: 140,
                            border: (t) => `1px solid ${t.palette.divider}`,
                            borderRadius: 1,
                            bgcolor: "background.paper",
                            cursor: "help",
                            "&:hover": {
                              borderColor: "primary.main",
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.name}
                          </Typography>
                          <Chip size="small" label={item.tech} color={TECH_COLOR[item.tech]} variant="outlined" />
                        </Box>
                      </Tooltip>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Paper>
      </Box>
    </>
  );
}

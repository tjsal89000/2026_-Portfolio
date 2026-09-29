import { useEffect, useState, type ReactElement } from "react";
import DashboardIcon from "@mui/icons-material/DashboardOutlined";
import TimelineIcon from "@mui/icons-material/TimelineOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOffOutlined";
import SummarizeIcon from "@mui/icons-material/SummarizeOutlined";
import ChecklistIcon from "@mui/icons-material/ChecklistOutlined";
import InsightsIcon from "@mui/icons-material/InsightsOutlined";
import AccountTreeIcon from "@mui/icons-material/AccountTreeOutlined";
import QueryStatsIcon from "@mui/icons-material/QueryStatsOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Box,
  Switch,
} from "@mui/material";
import { awsColors } from "../theme";
import type { ViewKey } from "../viewKey";

// 이상탐지 에이전트(Python)의 제어 서버를 nginx가 이 경로로 묶어준 것.
// EXTERNAL_TOOLS와 같은 이유로 절대경로(http://localhost) 고정 - 대시보드를
// Vite(5173) 직접 접속으로 열어도 항상 nginx 게이트웨이를 거치게 함.
const ALERTS_API_BASE = "http://localhost/alerts";

const DRAWER_WIDTH = 240;

// 개요 화면 안의 세 패널(트래픽/알림/리포트)은 각자 별도 페이지가 아니라 한 화면 안의
// 섹션이라, 이 셋을 눌러도 전부 "개요"로 이동한다 - react-router 없이 App.tsx가 들고 있는
// view 상태 하나로 전환하는 가벼운 방식 (화면이 지금보다 훨씬 늘어나면 그때 라우터를 붙인다).
const NAV_ITEMS: { label: string; icon: ReactElement; view: ViewKey }[] = [
  { label: "개요", icon: <DashboardIcon />, view: "overview" },
  { label: "실시간 트래픽", icon: <TimelineIcon />, view: "overview" },
  { label: "이상탐지 알림", icon: <NotificationsIcon />, view: "overview" },
  { label: "AI 리포트", icon: <SummarizeIcon />, view: "overview" },
  { label: "진행 상황", icon: <ChecklistIcon />, view: "progress" },
];

// 이 대시보드 안의 화면이 아니라, nginx가 같은 http://localhost 아래로 묶어준
// 별개의 도구(운영 대시보드/워크플로우/메트릭)로 나가는 링크. 그래서 새 탭으로 열리게 함.
//
// href를 "/grafana/"처럼 상대경로로 쓰면, 지금 이 페이지를 어느 포트로 보고 있느냐에 따라
// 링크가 엉뚱한 곳으로 감 - 예를 들어 nginx(80번 포트)가 아니라 Vite 개발서버(5173번)로
// 대시보드를 직접 열어본 경우, "/grafana/"는 5173번 포트 자신에게 요청이 가버려서
// (Vite가 그 경로를 모르니) Vite의 "base URL 안 맞음" 에러 페이지가 떴었다.
// 그래서 nginx가 떠 있는 80번 포트를 절대경로로 명시해 항상 게이트웨이를 거치게 고정한다.
const EXTERNAL_TOOLS = [
  // /grafana/만 열면 우리 대시보드가 아니라 Grafana 기본 홈 화면이 뜨므로, 대시보드 UID까지 직접 지정
  { label: "Grafana", icon: <InsightsIcon />, href: "http://localhost/grafana/d/payment-aiops-platform/payment-aiops-platform" },
  // n8n은 서브패스(reverse proxy) 배포 자체가 n8n 공식 이슈로 깨지는 경우가 많아
  // (github.com/n8n-io/n8n issues #18596, #19635) nginx를 거치지 않고 자기 포트로 바로 연결
  { label: "n8n 워크플로우", icon: <AccountTreeIcon />, href: "http://localhost:5678/" },
  { label: "Prometheus", icon: <QueryStatsIcon />, href: "http://localhost/prometheus/" },
];

interface SidebarProps {
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
}

export default function Sidebar({ view, onNavigate }: SidebarProps) {
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useEffect(() => {
    fetch(`${ALERTS_API_BASE}/status`)
      .then((res) => res.json())
      .then((data) => setAlertsEnabled(data.enabled))
      .catch(() => {
        // 이상탐지 에이전트가 아직 안 떠있어도 대시보드 자체는 그대로 보여야 함
      });
  }, []);

  const handleToggle = async (checked: boolean) => {
    setAlertsEnabled(checked); // 낙관적 업데이트
    try {
      await fetch(`${ALERTS_API_BASE}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
    } catch {
      setAlertsEnabled(!checked); // 요청 실패 시 원래 상태로 되돌림
    }
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          backgroundColor: awsColors.squidInk,
          color: "#FFFFFF",
        },
      }}
    >
      <Toolbar>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
          AIOps 결제 플랫폼
        </Typography>
      </Toolbar>
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.label}
            selected={item.view === view}
            onClick={() => onNavigate(item.view)}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              color: "#D5DBDB",
              "&.Mui-selected": {
                backgroundColor: "rgba(255, 153, 0, 0.16)",
                color: "#FFFFFF",
                borderLeft: "3px solid #FF9900",
              },
              "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mx: 2, my: 1 }} />
      <Typography
        variant="caption"
        sx={{ px: 3, py: 0.5, color: "#8B98A5", letterSpacing: ".05em" }}
      >
        운영 도구
      </Typography>
      <List sx={{ px: 1 }}>
        {EXTERNAL_TOOLS.map((item) => (
          <ListItemButton
            key={item.label}
            component="a"
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              borderRadius: 1,
              mb: 0.5,
              color: "#D5DBDB",
              "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
            <OpenInNewIcon sx={{ fontSize: 16, color: "#8B98A5" }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mx: 2, my: 1 }} />
      <Typography
        variant="caption"
        sx={{ px: 3, py: 0.5, color: "#8B98A5", letterSpacing: ".05em" }}
      >
        알림 설정
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 0.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#D5DBDB" }}>
          {alertsEnabled ? (
            <NotificationsIcon sx={{ fontSize: 18 }} />
          ) : (
            <NotificationsOffIcon sx={{ fontSize: 18, color: "#8B98A5" }} />
          )}
          <Typography variant="body2">Slack 알림</Typography>
        </Box>
        <Switch
          size="small"
          checked={alertsEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
      </Box>
    </Drawer>
  );
}

export { DRAWER_WIDTH };

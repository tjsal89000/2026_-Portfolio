import { lazy, Suspense, useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import Sidebar, { DRAWER_WIDTH } from "./layout/Sidebar";
import TopBar from "./layout/TopBar";
import OverviewPage from "./pages/OverviewPage";
import AboutPage from "./pages/AboutPage";
import type { ViewKey } from "./viewKey";

// 기본 화면(실시간 모니터링)만 바로 불러오고, 나머지 메뉴는 누를 때 따로 받는다.
// 이전에는 모든 화면과 차트 라이브러리가 한 파일(620kB)로 묶여서 첫 화면이 무겁게 떴다.
const OpsPage = lazy(() => import("./pages/OpsPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const InfraPage = lazy(() => import("./pages/InfraPage"));
const TestsPage = lazy(() => import("./pages/TestsPage"));
const ArchitecturePage = lazy(() => import("./pages/ArchitecturePage"));
const TroubleshootingPage = lazy(() => import("./pages/TroubleshootingPage"));

const VIEW_KEYS: ViewKey[] = ["about", "overview", "ops", "stats", "progress", "tests", "infra", "architecture", "troubleshooting"];

const VIEW_LABELS: Record<ViewKey, string> = {
  about: "소개",
  overview: "실시간 모니터링",
  ops: "운영 지표",
  stats: "통계",
  progress: "진행 상황",
  tests: "테스트 코드",
  infra: "인프라 현황",
  architecture: "인프라 구성도",
  troubleshooting: "트러블슈팅",
};

function viewFromHash(): ViewKey {
  const key = window.location.hash.replace("#", "");
  return (VIEW_KEYS as string[]).includes(key) ? (key as ViewKey) : "about";
}

export default function App() {
  // 메뉴 상태를 주소 해시(#ops 등)와 맞춘다. 새로고침하거나 링크를 공유해도 같은 메뉴가 열린다.
  // 해시가 없거나 모르는 값이면 소개 화면을 보여준다.
  const [view, setViewState] = useState<ViewKey>(viewFromHash);

  useEffect(() => {
    const onHashChange = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setView = (next: ViewKey) => {
    window.location.hash = next; // hashchange 이벤트가 상태를 갱신한다
  };
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar
        view={view}
        onNavigate={setView}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <TopBar onMenuClick={() => setMobileOpen(true)} title={VIEW_LABELS[view]} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: { xs: 0, sm: `${DRAWER_WIDTH}px` },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", mt: 12 }}>
              <CircularProgress />
            </Box>
          }
        >
          {view === "about" && <AboutPage />}
          {view === "overview" && <OverviewPage />}
          {view === "ops" && <OpsPage />}
          {view === "stats" && <StatsPage />}
          {view === "progress" && <ProgressPage />}
          {view === "tests" && <TestsPage />}
          {view === "infra" && <InfraPage />}
          {view === "architecture" && <ArchitecturePage />}
          {view === "troubleshooting" && <TroubleshootingPage />}
        </Suspense>

        <Box component="footer" sx={{ borderTop: (t) => `1px solid ${t.palette.divider}`, py: 2, px: 3, textAlign: "right" }}>
          <Typography variant="caption" color="text.secondary">
            Copyright © 2026 윤경록 · ygrhash
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

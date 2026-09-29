import { AppBar, Box, Chip, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import { DRAWER_WIDTH } from "./Sidebar";
import { useThemeMode } from "../context/ThemeModeContext";

export default function TopBar() {
  const { mode, toggleMode } = useThemeMode();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: `calc(100% - ${DRAWER_WIDTH}px)`,
        ml: `${DRAWER_WIDTH}px`,
        // 하드코딩된 색 대신 theme.palette를 참조 -> 다크모드로 바뀌면 자동으로 같이 바뀜
        backgroundColor: "background.paper",
        color: "text.primary",
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Toolbar sx={{ justifyContent: "space-between" }}>
        <Typography variant="h6">개요</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {/* 지금은 목업 데이터 기반 표시라는 걸 명확히 함 - 백엔드가 붙기 전까지는 항상 이 문구 */}
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: 10, color: "#FF9900 !important" }} />}
            label="목업 데이터"
            variant="outlined"
          />
          <Tooltip title={mode === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}>
            <IconButton onClick={toggleMode} color="inherit">
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

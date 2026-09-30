import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Toolbar,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import { GITHUB_BRANCH, GITHUB_REPO, TEST_SUITES } from "../data/testSuites";

const LANGUAGE_COLOR: Record<string, "warning" | "info" | "success"> = {
  Java: "warning",
  TypeScript: "info",
  Python: "success",
};

// 아코디언을 펼칠 때만 그 파일의 원문을 가져온다 - 파일 수가 늘어나도 페이지 진입 시
// 한꺼번에 전부 fetch하지 않도록 하기 위한 지연 로딩.
function TestFileAccordion({ path, testCount, summary }: { path: string; testCount: number; summary: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileName = path.split("/").pop();

  const handleChange = async (_: unknown, expanded: boolean) => {
    if (!expanded || source !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSource(await res.text());
    } catch {
      setError("GitHub에서 파일을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Accordion onChange={handleChange} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", pr: 1 }}>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>{fileName}</Typography>
          <Chip size="small" label={`테스트 ${testCount}건`} variant="outlined" />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {summary}
        </Typography>
        <Link
          href={`https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${path}`}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 1.5, fontSize: 13 }}
        >
          GitHub에서 보기 <OpenInNewIcon sx={{ fontSize: 14 }} />
        </Link>
        {loading && <CircularProgress size={20} />}
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {source !== null && (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 1,
              bgcolor: (t) => (t.palette.mode === "dark" ? "#0F1416" : "#F6F8FA"),
              border: (t) => `1px solid ${t.palette.divider}`,
              overflowX: "auto",
              fontSize: 12.5,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {source}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function TestsPage() {
  const totalTests = TEST_SUITES.flatMap((s) => s.files).reduce((sum, f) => sum + f.testCount, 0);
  const totalFiles = TEST_SUITES.flatMap((s) => s.files).length;

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          테스트 코드
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          현재 {TEST_SUITES.length}개 서비스에 파일 {totalFiles}개, 테스트 {totalTests}건. 파일을 펼치면 GitHub의
          최신 원문을 그대로 불러와 보여줍니다 (대시보드 재배포 없이 항상 최신 커밋 기준).
        </Typography>

        {TEST_SUITES.map((suite) => (
          <Paper key={suite.service} variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Typography variant="h6">{suite.service}</Typography>
              <Chip size="small" label={suite.language} color={LANGUAGE_COLOR[suite.language]} variant="outlined" />
            </Box>
            {suite.files.map((file) => (
              <TestFileAccordion key={file.path} {...file} />
            ))}
          </Paper>
        ))}
      </Box>
    </>
  );
}

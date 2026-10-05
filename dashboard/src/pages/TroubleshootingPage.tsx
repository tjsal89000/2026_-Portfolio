import { useEffect, useState } from "react";
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
import { GITHUB_BRANCH, GITHUB_REPO } from "../data/testSuites";
import { PROJECT_CASES } from "../data/troubleshooting";
import MarkdownLite from "../components/MarkdownLite";

const LOG_PATH = "docs/문제해결_로그.md";

// 로그 파일 하나에 사례 11건이 다 들어있으므로, 전문을 한 번만 fetch해서 "## [번호]" 기준으로
// 쪼개 캐싱해둔다 - 아코디언을 열 때마다 같은 파일을 또 받아올 필요가 없게.
function splitByCase(fullText: string): Map<number, string> {
  const map = new Map<number, string>();
  const blocks = fullText.split(/^## \[(\d+)\]/m);
  // split 결과: [머리말, "11", 본문1, "10", 본문2, ...] 형태 - 홀수 인덱스가 번호, 그다음이 본문
  for (let i = 1; i < blocks.length; i += 2) {
    const num = Number(blocks[i]);
    const body = `## [${blocks[i]}]${blocks[i + 1]}`.split(/\n---\n/)[0].trim();
    map.set(num, body);
  }
  return map;
}

function ProjectCaseAccordion({ number, title, tags }: { number: number; title: string; tags: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || content !== null || loading) return;
    setLoading(true);
    fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${LOG_PATH}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const byCase = splitByCase(text);
        setContent(byCase.get(number) ?? "(해당 항목을 찾지 못했습니다)");
      })
      .catch(() => setError("GitHub에서 로그를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [expanded, content, loading, number]);

  return (
    <Accordion expanded={expanded} onChange={(_, next) => setExpanded(next)} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", pr: 1 }}>
          <Chip size="small" label={`#${number}`} color="primary" variant="outlined" />
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.5 }}>
          {tags.map((tag) => (
            <Chip key={tag} size="small" label={tag} variant="outlined" />
          ))}
        </Box>
        <Link
          href={`https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${LOG_PATH}`}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 1.5, fontSize: 13 }}
        >
          GitHub에서 전문 보기 <OpenInNewIcon sx={{ fontSize: 14 }} />
        </Link>
        {loading && <CircularProgress size={20} />}
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {content && <MarkdownLite markdown={content} />}
      </AccordionDetails>
    </Accordion>
  );
}

export default function TroubleshootingPage() {
  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          트러블슈팅
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          면접에서 "이거 왜 이렇게 했어요"에 바로 답할 수 있어야 하는 부분만 모아둠. 실제로
          겪은 문제 - 상황 - 원인 분석 - 해결 - 배운 점 - 예상 질문까지 STAR 형식으로 정리.
        </Typography>

        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
          이 프로젝트에서 실제로 겪은 문제 ({PROJECT_CASES.length}건)
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, mb: 4 }}>
          {PROJECT_CASES.map((c) => (
            <ProjectCaseAccordion key={c.number} {...c} />
          ))}
        </Paper>

      </Box>
    </>
  );
}

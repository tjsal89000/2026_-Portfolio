import { Box, Typography } from "@mui/material";

// 문제해결 로그처럼 구조가 단순한(###/-/**bold** 정도만 쓰는) 마크다운 하나 때문에 정식
// 마크다운 파서 라이브러리를 새로 넣을 필요는 없어서, 이 문서에서 실제로 쓰는 패턴만
// 처리하는 최소한의 렌더러. 범용 마크다운 파서가 아님 - 이 프로젝트 문서 전용.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <b key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</b>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

export default function MarkdownLite({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");

  return (
    <Box sx={{ "& > *": { mb: 1 } }}>
      {lines.map((line, i) => {
        const key = `line-${i}`;
        if (!line.trim() || line.trim() === "---") return null;

        if (line.startsWith("### ")) {
          return (
            <Typography key={key} variant="subtitle2" sx={{ fontWeight: 700, mt: 2 }}>
              {line.slice(4)}
            </Typography>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <Typography key={key} variant="subtitle1" sx={{ fontWeight: 700, mt: 2 }}>
              {line.slice(3)}
            </Typography>
          );
        }
        if (line.trimStart().startsWith("- ")) {
          const indent = line.length - line.trimStart().length;
          return (
            <Typography
              key={key}
              variant="body2"
              color="text.secondary"
              sx={{ pl: 2 + indent / 2, "&::before": { content: '"– "' } }}
            >
              {renderInline(line.trim().slice(2), key)}
            </Typography>
          );
        }
        return (
          <Typography key={key} variant="body2" color="text.secondary">
            {renderInline(line, key)}
          </Typography>
        );
      })}
    </Box>
  );
}

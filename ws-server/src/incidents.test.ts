import { describe, expect, it } from "vitest";
import { mapTimelineRow } from "./incidents.js";

describe("mapTimelineRow", () => {
  it("알림 행은 종류·제목·시각(ISO)을 화면용 모양으로 바꾼다", () => {
    const event = mapTimelineRow({
      kind: "alert",
      title: "고액 결제",
      detail: '{"type":"고액 결제"}',
      at: new Date("2026-10-05T01:02:03.000Z"),
    });
    expect(event).toEqual({
      kind: "alert",
      title: "고액 결제",
      detail: '{"type":"고액 결제"}',
      at: "2026-10-05T01:02:03.000Z",
    });
  });

  it("detail이 null이면 빈 문자열로 채운다", () => {
    const event = mapTimelineRow({
      kind: "report",
      title: "AI 리포트",
      detail: null,
      at: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(event.detail).toBe("");
  });
});

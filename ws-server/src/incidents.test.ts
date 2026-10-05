import { describe, expect, it } from "vitest";
import { describeAlert, mapTimelineRow } from "./incidents.js";

describe("mapTimelineRow", () => {
  it("리포트 제목의 마크다운 기호(##)는 떼고 글자만 남긴다", () => {
    const event = mapTimelineRow({
      kind: "report",
      title: "## 결제 플랫폼 운영 리포트",
      detail: "본문",
      at: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(event.title).toBe("결제 플랫폼 운영 리포트");
    expect(event.summary).toBe("본문");
  });

  it("리포트 detail이 null이면 본문은 빈 문자열", () => {
    const event = mapTimelineRow({
      kind: "report",
      title: "AI 리포트",
      detail: null,
      at: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(event.summary).toBe("");
  });

  it("알림 본문(JSON)을 풀어서 원인, 근거, 조치를 붙이고 n8n 경유 여부를 표시한다", () => {
    const event = mapTimelineRow({
      kind: "alert",
      title: "고액이상치",
      detail: JSON.stringify({
        type: "고액이상치",
        detail: { amount: 7678309, country: "US", accountId: "acct-00042" },
        via: "n8n",
      }),
      at: new Date("2026-10-05T01:02:03.000Z"),
    });
    expect(event.kind).toBe("alert");
    expect(event.title).toBe("고액이상치");
    expect(event.cause).toContain("7,678,309원");
    expect(event.evidence).toContain("계좌 acct-00042");
    expect(event.viaN8n).toBe(true);
    expect(event.at).toBe("2026-10-05T01:02:03.000Z");
  });

  it("알림 본문이 깨져 있어도 화면이 죽지 않는다", () => {
    const event = mapTimelineRow({
      kind: "alert",
      title: "반복요청",
      detail: "{not json",
      at: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(event.title).toBe("반복요청");
    expect(event.viaN8n).toBe(false);
  });
});

describe("describeAlert", () => {
  it("고액이상치는 500만원 기준과 금액을 근거로 든다", () => {
    const e = describeAlert("고액이상치", { amount: 6000000, accountId: "acct-1", country: "KR" });
    expect(e.cause).toContain("기준 500만원");
    expect(e.evidence).toEqual(["계좌 acct-1", "국가 KR"]);
  });

  it("반복요청은 10초 안의 요청 수와 기준 5건을 말한다", () => {
    const e = describeAlert("반복요청", { accountId: "acct-2", "최근10초_요청수": 7 });
    expect(e.cause).toContain("10초 안에 7건");
    expect(e.cause).toContain("기준 5건");
  });

  it("쏠림은 구분, 값, 비중을 근거로 든다", () => {
    const e = describeAlert("쏠림", { 구분: "국가", 값: "DE", "최근20건_비중": "50%" });
    expect(e.cause).toContain("DE(국가)");
    expect(e.evidence).toContain("비중 50%");
  });

  it("TPS 급증은 현재와 평소 TPS를 근거로 든다", () => {
    const e = describeAlert("TPS_급증", { 현재TPS: 35.2, 평소TPS: 10.28 });
    expect(e.evidence).toEqual(["현재 35.2 TPS", "평소 10.28 TPS"]);
  });

  it("에러율 상승은 에러율과 처리/에러 건수를 근거로 든다", () => {
    const e = describeAlert("에러율_상승", { "최근10초_에러율(%)": 12.5, 처리건수: 40, 에러건수: 5 });
    expect(e.cause).toContain("12.5%");
    expect(e.evidence).toEqual(["처리 40건", "에러 5건"]);
  });

  it("모르는 유형은 기본 설명을 준다", () => {
    const e = describeAlert("새로운유형", {});
    expect(e.cause).toContain("정의되지 않은");
  });
});

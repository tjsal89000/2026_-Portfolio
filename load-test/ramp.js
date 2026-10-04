// 결제 API 점진 부하 테스트 (k6)
//
// 실행 예시 (프로필 3종 중 하나를 골라 실행):
//   k6 run -e PROFILE=low    -e TARGET=https://aiops.ygrhash.dev/api/payments ramp.js
//   k6 run -e PROFILE=normal -e TARGET=... ramp.js
//   k6 run -e PROFILE=high   -e TARGET=... ramp.js
//
// 프로필마다 TPS를 단계적으로 올리고, 단계마다 HOLD_SECONDS(기본 120초)만큼 유지한다.
//   low    : 5 -> 10 -> 20              (먼저 안전하게 확인할 때)
//   normal : 5 -> 10 -> 20 -> 40        (기본 권장)
//   high   : 5 -> 20 -> 40 -> 80        (한계를 찾을 때, 중단 기준에 걸리면 자동 종료)
//
// 중단 기준은 thresholds의 abortOnFail로 자동 적용된다 - 에러율 1% 초과 또는 p95 500ms 초과가
// 30초 이상 지속되면 k6가 테스트를 멈추고 그 직전 단계가 "안정 구간"이 된다.

import http from "k6/http";
import { check } from "k6";

const TARGET = __ENV.TARGET || "http://localhost/api/payments";
const PROFILE = __ENV.PROFILE || "normal";
const HOLD = Number(__ENV.HOLD_SECONDS || 120);

const PROFILES = {
  low: [5, 10, 20],
  normal: [5, 10, 20, 40],
  high: [5, 20, 40, 80],
};

const steps = PROFILES[PROFILE];
if (!steps) {
  throw new Error(`알 수 없는 PROFILE=${PROFILE} (low | normal | high 중 선택)`);
}

// 단계마다 TPS를 바꾸는 ramping-arrival-rate: 요청 개수가 아니라 "초당 요청 수"를 고정해서 올린다
export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-arrival-rate",
      startRate: steps[0],
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: steps.flatMap((tps) => [
        { target: tps, duration: "10s" }, // 단계 전환 구간
        { target: tps, duration: `${HOLD}s` }, // 이 TPS를 유지하고 지표를 본다
      ]),
    },
  },
  thresholds: {
    // 실패율 1%를 넘는 상태가 30초 이상 이어지면 테스트를 자동 중단
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
    // p95가 500ms를 넘는 상태가 30초 이상 이어지면 자동 중단
    http_req_duration: [{ threshold: "p(95)<500", abortOnFail: true, delayAbortEval: "30s" }],
  },
};

const COUNTRIES = ["KR", "KR", "KR", "KR", "KR", "KR", "KR", "US", "GB", "AE", "JP", "DE"];
const METHODS = ["CARD", "CARD", "CARD", "CARD", "CARD", "CARD", "CARD", "WALLET", "WALLET", "BANK_TRANSFER"];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// k6 기본 환경에서 쓸 수 있는 가벼운 UUID v4 (idempotencyKey는 요청마다 달라야 중복 처리를 피한다)
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function () {
  const payload = JSON.stringify({
    idempotencyKey: uuid(),
    merchantId: `merchant-${String(Math.floor(Math.random() * 20)).padStart(3, "0")}`,
    accountId: `acct-${String(Math.floor(Math.random() * 100)).padStart(5, "0")}`,
    amount: 1000 + Math.floor(Math.random() * 499000),
    currency: "KRW",
    country: pick(COUNTRIES),
    paymentMethod: pick(METHODS),
  });

  const res = http.post(TARGET, payload, { headers: { "Content-Type": "application/json" } });
  check(res, { "202 Accepted": (r) => r.status === 202 });
}

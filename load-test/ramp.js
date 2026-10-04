// 결제 API 단계별 부하 테스트 (k6)
//
// 실행 예시 (프로필 3종 중 하나를 골라 실행):
//   k6 run -e PROFILE=low    -e TARGET=https://aiops.ygrhash.dev/api/payments ramp.js
//   k6 run -e PROFILE=normal -e TARGET=... ramp.js
//   k6 run -e PROFILE=high   -e TARGET=... ramp.js
//
// 프로필마다 TPS 단계를 순서대로 실행하고, 단계마다 HOLD_SECONDS(기본 120초) 동안 그 TPS를 고정한다.
//   low    : 5 -> 10 -> 20              (먼저 안전하게 확인할 때)
//   normal : 5 -> 10 -> 20 -> 40        (기본 권장)
//   high   : 5 -> 20 -> 40 -> 80        (한계를 찾을 때)
//   limit  : 40 -> 50 -> 60 -> 70       (40 TPS 이상에서 한계를 좁힐 때)
//
// 단계마다 지표를 따로 기록한다(태그 stage=20tps 등). 그래서 "40 TPS 구간의 p95"처럼 구간별 수치를 본다.
// 중단 기준도 단계별로 적용된다 - 어느 단계든 p95 500ms 초과 또는 실패율 1% 초과가 30초 이상 이어지면
// k6가 그 시점에 테스트를 멈추고, 그 이전 단계들의 결과는 그대로 남는다.

import http from "k6/http";
import { check } from "k6";

const TARGET = __ENV.TARGET || "http://localhost/api/payments";
const PROFILE = __ENV.PROFILE || "normal";
const HOLD = Number(__ENV.HOLD_SECONDS || 120);

const PROFILES = {
  low: [5, 10, 20],
  normal: [5, 10, 20, 40],
  high: [5, 20, 40, 80],
  limit: [40, 50, 60, 70],
  // 50 TPS 한 구간만 끝까지 재는 확인용. 중단 기준을 끄고 2분을 다 채워서 p95를 정확히 본다
  confirm50: [50],
  // 60 TPS 한 구간을 끝까지 재는 확인용 (50 TPS 다음 한계 구간)
  confirm60: [60],
};

// confirm으로 시작하는 프로필은 확인용이라 중간에 멈추지 않는다. 나머지 프로필은 기준을 넘으면 자동 중단.
const ABORT_ON_FAIL = !PROFILE.startsWith("confirm");

const steps = PROFILES[PROFILE];
if (!steps) {
  throw new Error(`알 수 없는 PROFILE=${PROFILE} (low | normal | high 중 선택)`);
}

// 단계마다 시나리오 하나. 시작 시각을 HOLD만큼 밀어서 순서대로 실행되고, 각 시나리오에 stage 태그를 붙인다.
// constant-arrival-rate는 초당 요청 수를 고정한다 - 단계 안에서 TPS가 흔들리지 않게 하려는 것.
const scenarios = {};
const thresholds = {};
steps.forEach((tps, i) => {
  const stage = `${tps}tps`;
  scenarios[`stage_${stage}`] = {
    executor: "constant-arrival-rate",
    rate: tps,
    timeUnit: "1s",
    duration: `${HOLD}s`,
    startTime: `${i * HOLD}s`,
    preAllocatedVUs: 50,
    maxVUs: 300,
    exec: "payment",
    tags: { stage },
  };
  thresholds[`http_req_duration{stage:${stage}}`] = [
    { threshold: "p(95)<500", abortOnFail: ABORT_ON_FAIL, delayAbortEval: "30s" },
  ];
  thresholds[`http_req_failed{stage:${stage}}`] = [
    { threshold: "rate<0.01", abortOnFail: ABORT_ON_FAIL, delayAbortEval: "30s" },
  ];
});

export const options = { scenarios, thresholds };

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

export function payment() {
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

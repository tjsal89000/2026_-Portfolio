"""
결제 트래픽 생성 에이전트

평소엔 정상적인 결제 패턴을 계속 흘려보내다가, 가끔 이상 패턴 3가지 중 하나를 섞어 넣는다.
목적은 두 가지:
  1) Grafana 대시보드/커스텀 대시보드에 계속 움직이는 실제 데이터를 채워준다 (Phase 3에서 만든 관측성 스택이
     "그래프가 평평해서 심심한" 상태에서 벗어나게).
  2) Phase 6(이상탐지 에이전트)가 감지할 "진짜 이상한 상황"을 실제로 만들어준다.

이상 패턴 3가지:
  - 반복요청: 짧은 시간에 같은 계좌로 몰아서 요청 (카드 도용 시도, 또는 클라이언트 재시도 폭주와 비슷한 모양)
  - 고액이상치: 평소(최대 50만원) 대비 10~50배 큰 금액
  - 쏠림: 특정 국가/결제수단에 짧은 시간 동안 요청이 몰림 (특정 지역 프로모션 악용, 특정 결제수단 장애 등과 비슷한 모양)
"""

import argparse
import asyncio
import os
import random
import uuid

import httpx

# Phase 9부터는 payment-api를 직접 호출하지 않고 API 게이트웨이(nginx -> 8095)를 거친다.
# 라우팅/회복력 같은 공통 관심사를 게이트웨이 한 곳에 모으는 게 API Gateway 패턴의 핵심.
# k8s에서는 GATEWAY_URL 환경변수로 게이트웨이 Service 주소를 주입한다.
DEFAULT_API_URL = os.environ.get("GATEWAY_URL", "http://localhost/api/payments")

# 계좌 100개 범위에서 순환 - 실제 서비스라면 훨씬 많겠지만, 포트폴리오 규모에서는
# 이 정도가 "같은 계좌가 반복해서 나타나는 정상적인 패턴"도 자연스럽게 만들어준다.
ACCOUNT_POOL = [f"acct-{i:05d}" for i in range(100)]

# 리스트에 같은 값을 여러 번 넣어서 random.choice()가 그 값을 더 자주 뽑게 하는 방식으로 가중치를 준다.
# (별도 라이브러리 없이 표준 random 모듈만으로 간단하게 가중 분포를 흉내내는 방법)
COUNTRIES_WEIGHTED = ["KR"] * 7 + ["US", "GB", "AE", "JP", "DE"]
METHODS_WEIGHTED = ["CARD"] * 7 + ["WALLET"] * 2 + ["BANK_TRANSFER"]

NORMAL_AMOUNT_RANGE = (1_000, 500_000)


def normal_payload(account_id: str | None = None, amount: int | None = None,
                    country: str | None = None, method: str | None = None) -> dict:
    """정상 패턴 결제 요청 하나를 만든다. 인자를 넘기면 그 값으로 고정하고, 나머지는 랜덤."""
    return {
        "idempotencyKey": str(uuid.uuid4()),
        "merchantId": f"merchant-{random.randint(0, 19):03d}",
        "accountId": account_id or random.choice(ACCOUNT_POOL),
        "amount": amount if amount is not None else random.randint(*NORMAL_AMOUNT_RANGE),
        "currency": "KRW",
        "country": country or random.choice(COUNTRIES_WEIGHTED),
        "paymentMethod": method or random.choice(METHODS_WEIGHTED),
    }


async def send(client: httpx.AsyncClient, api_url: str, payload: dict, label: str = "정상") -> None:
    try:
        resp = await client.post(api_url, json=payload, timeout=5.0)
        print(f"[{resp.status_code}] {label} account={payload['accountId']} amount={payload['amount']:,}")
    except httpx.HTTPError as e:
        print(f"[에러] {label} account={payload['accountId']} - {e}")


async def anomaly_repeated_account(client: httpx.AsyncClient, api_url: str) -> None:
    """짧은 시간에 같은 계좌로 몰아서 요청 - 이상탐지 에이전트가 "동일 계좌 반복"으로 잡을 패턴"""
    account = random.choice(ACCOUNT_POOL)
    count = random.randint(8, 15)
    print(f"\n=== [이상패턴] 반복요청 시작 - account={account}, {count}건 ===")
    tasks = [send(client, api_url, normal_payload(account_id=account), label="반복요청") for _ in range(count)]
    await asyncio.gather(*tasks)


async def anomaly_large_amount(client: httpx.AsyncClient, api_url: str) -> None:
    """평소 최대(50만원) 대비 10~50배 큰 금액 - "비정상 금액"으로 잡을 패턴"""
    amount = random.randint(NORMAL_AMOUNT_RANGE[1] * 10, NORMAL_AMOUNT_RANGE[1] * 50)
    print(f"\n=== [이상패턴] 고액 결제 - amount={amount:,} ===")
    await send(client, api_url, normal_payload(amount=amount), label="고액이상치")


async def anomaly_concentration(client: httpx.AsyncClient, api_url: str) -> None:
    """특정 국가/결제수단에 짧은 시간 동안 쏠림 - "특정 조건 집중"으로 잡을 패턴"""
    country = random.choice(["US", "GB", "AE", "JP", "DE"])
    method = random.choice(["WALLET", "BANK_TRANSFER"])
    count = random.randint(5, 10)
    print(f"\n=== [이상패턴] 쏠림 - country={country}, method={method}, {count}건 ===")
    tasks = [
        send(client, api_url, normal_payload(country=country, method=method), label="쏠림")
        for _ in range(count)
    ]
    await asyncio.gather(*tasks)


ANOMALY_SCENARIOS = [anomaly_repeated_account, anomaly_large_amount, anomaly_concentration]


async def main(tps: float, anomaly_probability: float, api_url: str) -> None:
    print(f"트래픽 생성 시작 - 기준 TPS={tps}, 이상패턴 확률={anomaly_probability * 100:.0f}%/초, 대상={api_url}")

    async with httpx.AsyncClient() as client:
        tick = 0
        while True:
            tick_start = asyncio.get_event_loop().time()

            # 매 초 tps개를 고정으로 보내면 그래프가 평평해서 심심하다 - 정규분포로 흔들어서
            # 자연스러운 변동폭을 준다. 표준편차를 tps의 40%로 잡아 평소엔 tps 근처지만 가끔
            # 크게 튀기도 하는 정도로 - 이상탐지 에이전트의 TPS 급증 임계치(평소 대비 3배)보다는
            # 충분히 낮게 유지되도록 설계함(오탐 방지).
            count = max(0, round(random.gauss(tps, tps * 0.4)))
            tasks = [send(client, api_url, normal_payload()) for _ in range(count)]

            # 그리고 낮은 확률로 이상 패턴 하나를 추가로 섞음 (정상 트래픽을 대체하지 않고 "더해짐")
            if random.random() < anomaly_probability:
                scenario = random.choice(ANOMALY_SCENARIOS)
                tasks.append(scenario(client, api_url))

            await asyncio.gather(*tasks)

            elapsed = asyncio.get_event_loop().time() - tick_start
            await asyncio.sleep(max(0.0, 1.0 - elapsed))
            tick += 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="결제 트래픽 생성 에이전트")
    parser.add_argument("--tps", type=float, default=3, help="초당 정상 요청 수 (기본 3)")
    parser.add_argument(
        "--anomaly-probability", type=float, default=0.1,
        help="매 초마다 이상 패턴 하나가 섞일 확률 (기본 0.1 = 10%%, 평균 10초에 한 번꼴)"
    )
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="결제 API 엔드포인트")
    args = parser.parse_args()

    try:
        asyncio.run(main(args.tps, args.anomaly_probability, args.api_url))
    except KeyboardInterrupt:
        print("\n트래픽 생성 중단됨")

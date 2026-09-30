import { describe, expect, it, vi } from "vitest";

const query = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("pg", () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      return { query };
    }),
  },
}));

// LLM 에이전트가 채워 넣는 값(accountId/country)이 SQL 문자열에 직접 이어붙지 않고 항상
// $n 파라미터 바인딩으로만 들어가는지가 이 파일의 핵심 - SQL 인젝션 방지의 실질적인 증거라
// "어떤 값이 몇 번째 파라미터로 갔는가"를 정확히 검증한다.
describe("queryRecentPayments", () => {
  it("필터가 없으면 WHERE 없이 limit만 파라미터로 바인딩한다", async () => {
    query.mockClear();
    const { queryRecentPayments } = await import("./db.js");

    await queryRecentPayments(20);

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toMatch(/WHERE/);
    expect(params).toEqual([20]);
  });

  it("accountId만 있으면 $1로 바인딩하고 limit은 $2로 밀린다", async () => {
    query.mockClear();
    const { queryRecentPayments } = await import("./db.js");

    await queryRecentPayments(10, "acc-1");

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE account_id = \$1/);
    expect(sql).not.toMatch(/country = /);
    expect(params).toEqual(["acc-1", 10]);
  });

  it("accountId와 country가 모두 있으면 AND로 묶고 limit은 $3이 된다", async () => {
    query.mockClear();
    const { queryRecentPayments } = await import("./db.js");

    await queryRecentPayments(5, "acc-1", "KR");

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE account_id = \$1 AND country = \$2/);
    expect(params).toEqual(["acc-1", "KR", 5]);
  });
});

import { describe, expect, it } from "vitest";
import { formatGeo, isPrivateIp } from "./admin.js";

describe("isPrivateIp", () => {
  it("내부망과 루프백 주소를 구분한다", () => {
    expect(isPrivateIp("10.42.0.1")).toBe(true);
    expect(isPrivateIp("192.168.0.10")).toBe(true);
    expect(isPrivateIp("172.20.1.1")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.1.2.3")).toBe(true);
  });

  it("공인 IP는 내부망이 아니다", () => {
    expect(isPrivateIp("118.36.239.249")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });
});

describe("formatGeo", () => {
  it("국가, 지역, 도시를 중복 없이 이어 붙인다", () => {
    expect(formatGeo({ country: "대한민국", region: "서울특별시", city: "서울" })).toBe("대한민국 · 서울특별시 · 서울");
  });

  it("정보가 없으면 알 수 없음", () => {
    expect(formatGeo(undefined)).toBe("알 수 없음");
  });

  it("내부망은 내부망으로 표시", () => {
    expect(formatGeo({ country: "내부망", region: "", city: "" })).toBe("내부망");
  });
});

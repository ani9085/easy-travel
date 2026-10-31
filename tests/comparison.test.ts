import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBundles, demoHotelsFor, fatigueFor, rankBundles, recommendedPackages, totalCostFor, warningsFor } from "../lib/comparison.ts";
import { DEFAULT_PROFILE, buildDemoFlightOffers, effectiveFlightPrice, type TripProfile } from "../lib/trip.ts";

const NOW = "2026-10-31T00:00:00.000Z";
const tokyo: TripProfile = { ...DEFAULT_PROFILE, destination: "도쿄, 일본", travelers: 2, startDate: "2026-11-06", endDate: "2026-11-10" };
const flights = buildDemoFlightOffers(tokyo, NOW);
const hotels = demoHotelsFor(tokyo);
const byAirline = (name: string) => flights.find((flight) => flight.airlineNames.includes(name))!;
const hotel = (id: string) => hotels.find((item) => item.id === id)!;

describe("예시 숙소", () => {
  it("1차 테스트 지역(일본)만 예시 숙소가 있고 모두 mock으로 표시된다", () => {
    assert.equal(hotels.length, 3);
    assert.ok(hotels.every((item) => item.dataMode === "mock" && item.name.includes("예시")));
    assert.deepEqual(demoHotelsFor({ destination: "파리, 프랑스" }), []);
  });
});

describe("이동 피로도", () => {
  it("이른 출발 + 먼 공항(나리타) 조합이 아침 하네다 직항보다 피로도가 높다", () => {
    const early = fatigueFor(byAirline("제주항공"), hotel("demo-shinjuku"));
    const easy = fatigueFor(byAirline("대한항공"), hotel("demo-shinjuku"));
    assert.ok(early.score > easy.score);
    assert.equal(easy.level, "낮음");
    assert.ok(early.reasons.some((reason) => reason.includes("이른 출발")));
  });

  it("이유는 최대 3개, 점수는 0–10", () => {
    for (const flight of flights) for (const item of hotels) {
      const fatigue = fatigueFor(flight, item);
      assert.ok(fatigue.score >= 0 && fatigue.score <= 10);
      assert.ok(fatigue.reasons.length <= 3);
    }
  });
});

describe("총비용 (항공+수하물+숙박+공항 왕복)", () => {
  it("항목 합이 총액과 같고, 2명은 1실·4박으로 계산한다", () => {
    const cost = totalCostFor(byAirline("대한항공"), hotel("demo-shinjuku"), tokyo)!;
    assert.equal(cost.nights, 4);
    assert.equal(cost.rooms, 1);
    assert.equal(cost.total, cost.flight + cost.baggage + cost.hotel + cost.airportTransfer);
    assert.equal(cost.airportTransfer, 13_000 * 2 * 2);
  });

  it("수하물 별도 운임은 추가 요금을 더한다", () => {
    const lcc = byAirline("제주항공");
    const cost = totalCostFor(lcc, hotel("demo-ueno"), tokyo)!;
    assert.equal(cost.baggage, (effectiveFlightPrice(lcc) - lcc.totalPrice) * 2);
    assert.ok(cost.baggage > 0);
  });

  it("3명이면 방 2개", () => {
    assert.equal(totalCostFor(byAirline("대한항공"), hotel("demo-asakusa"), { ...tokyo, travelers: 3 })!.rooms, 2);
  });

  it("날짜가 잘못됐으면 계산하지 않는다", () => {
    assert.equal(totalCostFor(byAirline("대한항공"), hotel("demo-asakusa"), { ...tokyo, endDate: "2026-11-01" }), null);
  });
});

describe("확인할 점 (T05)", () => {
  it("늦게 도착하는 항공 + 밤에 프런트가 닫히는 숙소면 늦은 체크인 확인을 요구한다", () => {
    const warnings = warningsFor(byAirline("일본항공"), hotel("demo-ueno"));
    assert.ok(warnings.some((warning) => warning.includes("늦은 체크인")));
    assert.ok(!warnings.some((warning) => warning.includes("보장")));
  });

  it("체크인 전에 도착하면 짐 맡기기를 확인하라고 한다", () => {
    assert.ok(warningsFor(byAirline("대한항공"), hotel("demo-shinjuku")).some((warning) => warning.includes("짐")));
  });
});

describe("묶음 비교 (T04)", () => {
  const bundles = buildBundles(flights, hotels, tokyo);

  it("항공 3 × 숙소 3 = 9개 묶음", () => {
    assert.equal(bundles.length, 9);
  });

  it("비용 우선 1위는 가장 싼 묶음, 편안함 우선 1위는 피로도가 가장 낮은 묶음", () => {
    const cheapest = Math.min(...bundles.map((bundle) => bundle.cost.total));
    const calmest = Math.min(...bundles.map((bundle) => bundle.fatigue.score));
    assert.equal(rankBundles(bundles, "budget")[0].cost.total, cheapest);
    assert.equal(rankBundles(bundles, "comfort")[0].fatigue.score, calmest);
  });

  it("추천 패키지 3종은 서로 다른 묶음이다", () => {
    const packages = recommendedPackages(bundles);
    assert.deepEqual(packages.map((item) => item.label), ["편안한 이동", "균형 추천", "예산 절감"]);
    assert.equal(new Set(packages.map((item) => item.bundle.id)).size, 3);
  });

  it("균형 추천은 다른 추천보다 더 피곤하면서 더 비싼 묶음이 아니다", () => {
    const packages = recommendedPackages(bundles);
    const balanced = packages.find((item) => item.label === "균형 추천")!.bundle;
    for (const other of packages.filter((item) => item.label !== "균형 추천")) {
      assert.ok(!(other.bundle.fatigue.score <= balanced.fatigue.score && other.bundle.cost.total <= balanced.cost.total));
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTripPlan, parseTripPlanText } from "../lib/tripPlan.ts";

describe("AI 여행 계획 결과", () => {
  it("필수 장소가 있는 날만 안전하게 정규화한다", () => {
    const plan = normalizeTripPlan({ title: "도쿄 초안", days: [{ day: 1, title: "느긋하게", places: ["센소지", "우에노 공원"], note: "쉬는 시간" }, { day: 2, places: [] }], stays: [{ area: "아사쿠사", style: "역 근처", reason: "이동이 쉬움", cautions: ["실제 재고 확인"] }], warnings: ["영업시간 확인"] });
    assert.ok(plan);
    assert.equal(plan.days.length, 1);
    assert.equal(plan.stays[0].area, "아사쿠사");
  });

  it("JSON 코드 펜스를 벗겨 읽는다", () => {
    const plan = parseTripPlanText("```json\n{\"days\":[{\"day\":1,\"places\":[\"도쿄역\"]}]}\n```");
    assert.ok(plan);
    assert.equal(plan.days[0].places[0], "도쿄역");
  });

  it("형식이 아닌 응답은 거절한다", () => {
    assert.equal(parseTripPlanText("여행 계획입니다"), null);
  });
});

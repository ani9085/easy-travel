import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessCodeMatches, checkOrigin, clientKey, createRateLimiter, validateAiRequest } from "../lib/server/aiGuard.ts";

const headers = (values: Record<string, string>) => new Headers(values);

describe("AI 요청 검증 (T15)", () => {
  it("모르는 작업과 화면에서 쓰지 않는 itinerary_import를 거절한다", () => {
    assert.equal(validateAiRequest({ task: "itinerary_import", text: "1일차 에펠탑" }).ok, false);
    assert.equal(validateAiRequest({ task: "anything" }).ok, false);
    assert.equal(validateAiRequest(null).ok, false);
    assert.equal(validateAiRequest([1, 2]).ok, false);
  });

  it("번역 문장은 비어 있거나 1000자를 넘으면 거절한다", () => {
    assert.equal(validateAiRequest({ task: "translate", text: "   " }).ok, false);
    const tooLong = validateAiRequest({ task: "translate", text: "가".repeat(1001) });
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.equal(tooLong.status, 413);
  });

  it("제어 문자를 지우고 목적지는 120자로 자른다", () => {
    const result = validateAiRequest({ task: "translate", text: "안녕\u0007하세요", destination: "도".repeat(300) });
    assert.ok(result.ok);
    if (result.ok && result.value.task === "translate") {
      assert.equal(result.value.text, "안녕하세요");
      assert.equal(result.value.destination.length, 120);
    }
  });

  it("번역 방향 기본값은 한→현지어, 언어는 목록에 있는 것만", () => {
    const basic = validateAiRequest({ task: "translate", text: "안녕하세요" });
    assert.ok(basic.ok && basic.value.task === "translate" && basic.value.direction === "to_local" && basic.value.language === null);
    const reverse = validateAiRequest({ task: "translate", text: "トイレはどこ", direction: "to_korean", language: "ja" });
    assert.ok(reverse.ok && reverse.value.task === "translate" && reverse.value.direction === "to_korean" && reverse.value.language === "ja");
    assert.equal(validateAiRequest({ task: "translate", text: "hi", language: "klingon" }).ok, false);
  });

  it("사진은 JPEG·PNG·WEBP data URL만 받는다", () => {
    assert.equal(validateAiRequest({ task: "photo_location", image: "data:image/jpeg;base64,AAAA" }).ok, true);
    assert.equal(validateAiRequest({ task: "photo_location", image: "data:image/svg+xml;base64,AAAA" }).ok, false);
    assert.equal(validateAiRequest({ task: "photo_location", image: "https://example.com/a.jpg" }).ok, false);
  });

  it("일정 추천은 여행지를 요구하고 구조화된 프로필만 통과시킨다", () => {
    assert.equal(validateAiRequest({ task: "trip_plan", profile: {} }).ok, false);
    const result = validateAiRequest({ task: "trip_plan", profile: { destination: "도쿄", travelers: 99, startDate: "2026-11-01", endDate: "2026-11-03", flexibleDates: false, budget: "균형형", preference: "느긋한 일정" }, flightBooked: true });
    assert.ok(result.ok && result.value.task === "trip_plan");
    if (result.ok && result.value.task === "trip_plan") {
      assert.equal(result.value.profile.travelers, 12);
      assert.equal(result.value.flightBooked, true);
    }
  });
});

describe("같은 출처 확인", () => {
  it("같은 사이트에서 온 요청은 통과", () => {
    assert.equal(checkOrigin(headers({ origin: "https://easy-travel.example", host: "easy-travel.example" }), false), null);
    assert.equal(checkOrigin(headers({ origin: "https://easy-travel.example", host: "internal:3000", "x-forwarded-host": "easy-travel.example" }), false), null);
  });

  it("다른 사이트에서 온 요청은 접속 코드가 있어도 막는다", () => {
    assert.equal(checkOrigin(headers({ origin: "https://evil.example", host: "easy-travel.example" }), true)?.status, 403);
  });

  it("Origin 없는 요청(스크립트)은 접속 코드가 맞을 때만 허용", () => {
    assert.equal(checkOrigin(headers({ host: "easy-travel.example" }), false)?.status, 403);
    assert.equal(checkOrigin(headers({ host: "easy-travel.example" }), true), null);
    assert.equal(checkOrigin(headers({ host: "easy-travel.example", "sec-fetch-site": "same-origin" }), false), null);
  });

  it("허용 목록에 등록한 네이티브 WebView Origin은 통과", () => {
    assert.equal(checkOrigin(headers({ origin: "capacitor://localhost", host: "easy-travel.example" }), false, ["capacitor://localhost"]), null);
  });
});

describe("가족 접속 코드", () => {
  it("코드를 설정하지 않으면 검사하지 않는다", () => {
    assert.equal(accessCodeMatches(null, undefined), true);
    assert.equal(accessCodeMatches(null, ""), true);
  });

  it("설정하면 정확히 같은 코드만 통과(앞뒤 공백 무시)", () => {
    assert.equal(accessCodeMatches("우리가족-2026", "우리가족-2026"), true);
    assert.equal(accessCodeMatches(" 우리가족-2026 ", "우리가족-2026"), true);
    assert.equal(accessCodeMatches("우리가족", "우리가족-2026"), false);
    assert.equal(accessCodeMatches(null, "우리가족-2026"), false);
  });
});

describe("요청 횟수 제한", () => {
  it("한 사람 한도를 넘으면 남은 시간을 알려주고, 창이 지나면 다시 허용", () => {
    const take = createRateLimiter({ windowMs: 60_000, maxPerClient: 5, maxTotal: 100 });
    assert.equal(take("a", 4, 0).ok, true);
    const blocked = take("a", 4, 1_000);
    assert.deepEqual(blocked, { ok: false, retryAfterSeconds: 59 });
    assert.equal(take("b", 4, 1_000).ok, true);
    assert.equal(take("a", 4, 60_000).ok, true);
  });

  it("여러 사람이 나눠 보내도 인스턴스 전체 한도에서 막는다", () => {
    const take = createRateLimiter({ windowMs: 60_000, maxPerClient: 10, maxTotal: 12 });
    assert.equal(take("a", 6, 0).ok, true);
    assert.equal(take("b", 6, 0).ok, true);
    assert.equal(take("c", 1, 0).ok, false);
  });

  it("프록시 헤더의 첫 IP를 사용자 키로 쓴다", () => {
    assert.equal(clientKey(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
    assert.equal(clientKey(headers({})), "unknown");
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { appIntentUrl, buildSharePayload, decodeSharePayload, shareLink } from "../lib/shareLink.ts";
import { createDefaultTrip } from "../lib/trip.ts";

const NOW = "2026-11-01T00:00:00.000Z";

function sampleTrip() {
  const trip = createDefaultTrip(NOW);
  trip.profile = { ...trip.profile, destination: "도쿄, 일본", originIata: "ICN", destinationIata: "HND", startDate: "2026-11-06", endDate: "2026-11-10", travelers: 2, hotel: "신주쿠 호텔", emergencyNumber: "110", travelerName: "엄마" };
  trip.itinerary = [
    { id: "b", day: 2, name: "센소지", note: "오전", status: "planned", statusAt: null, source: "user" },
    { id: "a", day: 1, name: "신주쿠 교엔", note: "", status: "completed", statusAt: NOW, source: "user" }
  ];
  trip.journal.events = [{ id: "e1", type: "checkin", at: NOW, location: { lat: 35.6, lng: 139.7, accuracy: 20 }, shareOpened: true }];
  return trip;
}

describe("부모님 앱으로 보내기 링크", () => {
  it("한글 여행 정보를 그대로 되살리고, 일정은 날짜순·상태 없이 담는다", () => {
    const payload = buildSharePayload(sampleTrip(), NOW);
    assert.match(payload, /^[A-Za-z0-9_-]+$/);
    const data = decodeSharePayload(payload);
    assert.ok(data);
    assert.equal(data.profile.destination, "도쿄, 일본");
    assert.equal(data.profile.travelerName, "엄마");
    assert.deepEqual(data.itinerary, [{ day: 1, name: "신주쿠 교엔", note: "" }, { day: 2, name: "센소지", note: "오전" }]);
  });

  it("위치·기록은 링크에 넣지 않는다", () => {
    const decoded = Buffer.from(buildSharePayload(sampleTrip(), NOW), "base64url").toString("utf8");
    assert.ok(!decoded.includes("35.6"));
    assert.ok(!decoded.includes("journal"));
  });

  it("링크·앱 열기 주소 모양", () => {
    assert.equal(shareLink("https://example.app/", "abc"), "https://example.app/send#abc");
    assert.equal(appIntentUrl("abc"), "intent://import?d=abc#Intent;scheme=easytravel;package=com.ani9085.easytravel;end");
  });

  it("깨진 payload는 거절한다", () => {
    assert.equal(decodeSharePayload("not-base64!"), null);
    assert.equal(decodeSharePayload(Buffer.from(JSON.stringify({ v: 2, profile: { destination: "x" } })).toString("base64url")), null);
  });

  it("안드로이드 테스트용 고정 payload가 지금 형식과 맞다", () => {
    const fixture = readFileSync(new URL("../android/app/src/test/resources/share-fixture.txt", import.meta.url), "utf8").trim();
    assert.equal(decodeSharePayload(fixture)?.profile.destination, "도쿄, 일본");
  });
});

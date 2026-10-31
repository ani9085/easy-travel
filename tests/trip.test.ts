import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OTHER_DESTINATION, profileForDestination } from "../lib/destinations.ts";
import {
  DEFAULT_PROFILE,
  DEMO_HOTEL,
  applyProfilePatch,
  buildDemoFlightOffers,
  buildPlanningSummary,
  checkTripDates,
  createDefaultTrip,
  addJournalEvent,
  effectiveFlightPrice,
  lastJournalEvent,
  markJournalShared,
  nextItineraryItem,
  offerBadge,
  offersAreStale,
  setItineraryStatus,
  tripTimeline,
  type TripProfile
} from "../lib/trip.ts";

const NOW = "2026-10-31T00:00:00.000Z";
const profile = (patch: Partial<TripProfile> = {}): TripProfile => ({ ...DEFAULT_PROFILE, ...patch });

describe("목적지 프로필", () => {
  it("도시·국가·영문 이름으로 프로필을 찾는다", () => {
    assert.equal(profileForDestination("도쿄, 일본").id, "japan");
    assert.equal(profileForDestination("Tokyo").id, "japan");
    assert.equal(profileForDestination("방콕").currency, "THB");
    assert.equal(profileForDestination("다낭, 베트남").timeZone, "Asia/Ho_Chi_Minh");
  });

  it("모르는 목적지는 영어 문장을 쓰고 통화·시간대를 정하지 않는다", () => {
    const other = profileForDestination("로마, 이탈리아");
    assert.equal(other, OTHER_DESTINATION);
    assert.equal(other.currency, null);
    assert.equal(other.timeZone, null);
  });

  it("일본 문장에 프랑스어가 섞이지 않는다", () => {
    const japan = profileForDestination("오사카");
    assert.ok(japan.phrases.every((phrase) => !/s'il vous plaît|toilettes/.test(phrase.local)));
  });
});

describe("여행 날짜 검증 (T02)", () => {
  it("귀국일이 출발일보다 빠르면 1일로 덮어쓰지 않고 오류를 낸다", () => {
    const check = checkTripDates(profile({ startDate: "2026-11-10", endDate: "2026-11-06" }));
    assert.equal(check.ok, false);
    assert.equal(buildPlanningSummary(profile({ startDate: "2026-11-10", endDate: "2026-11-06" })), null);
  });

  it("같은 날 출발·귀국은 1일, 기본 계획은 5일", () => {
    assert.deepEqual(checkTripDates(profile({ startDate: "2026-11-06", endDate: "2026-11-06" })), { ok: true, days: 1, assumed: false });
    assert.deepEqual(checkTripDates(profile()), { ok: true, days: 5, assumed: false });
  });

  it("30일을 넘으면 잘라내지 않고 오류를 낸다", () => {
    const check = checkTripDates(profile({ startDate: "2026-11-01", endDate: "2026-12-15" }));
    assert.equal(check.ok, false);
  });

  it("날짜 하나만 비었거나 존재하지 않는 날짜면 오류", () => {
    assert.equal(checkTripDates(profile({ endDate: "" })).ok, false);
    assert.equal(checkTripDates(profile({ startDate: "2026-02-30" })).ok, false);
  });

  it("유연한 날짜·날짜 미정은 3일 기준임을 표시한다", () => {
    assert.deepEqual(checkTripDates(profile({ flexibleDates: true })), { ok: true, days: 3, assumed: true });
    assert.deepEqual(checkTripDates(profile({ startDate: "", endDate: "" })), { ok: true, days: 3, assumed: true });
  });
});

describe("목적지 변경 (T01)", () => {
  it("목적지를 바꾸면 이전 데모 장소·데모 숙소가 남지 않는다", () => {
    const trip = createDefaultTrip(NOW);
    const withUserPlace = { ...trip, itinerary: [...trip.itinerary, { id: "u1", day: 2, name: "가족이 넣은 곳", note: "", status: "planned" as const, statusAt: null, source: "user" as const }] };
    const { trip: next, clearedDemo } = applyProfilePatch(withUserPlace, { destination: "오사카, 일본" }, NOW);
    assert.equal(clearedDemo, true);
    assert.deepEqual(next.itinerary.map((item) => item.name), ["가족이 넣은 곳"]);
    assert.equal(next.profile.hotel, "");
  });

  it("목적지가 그대로면 데모 값을 지우지 않는다", () => {
    const trip = createDefaultTrip(NOW);
    const { trip: next, clearedDemo } = applyProfilePatch(trip, { travelers: 3 }, NOW);
    assert.equal(clearedDemo, false);
    assert.equal(next.itinerary.length, 4);
    assert.equal(next.profile.hotel, DEMO_HOTEL);
  });

  it("사용자가 넣은 숙소는 목적지를 바꿔도 지우지 않는다", () => {
    const trip = createDefaultTrip(NOW);
    trip.profile.hotel = "신주쿠 호텔";
    const { trip: next } = applyProfilePatch(trip, { destination: "오사카" }, NOW);
    assert.equal(next.profile.hotel, "신주쿠 호텔");
  });

  it("인원은 1–12명으로 제한한다", () => {
    const trip = createDefaultTrip(NOW);
    assert.equal(applyProfilePatch(trip, { travelers: 40 }, NOW).trip.profile.travelers, 12);
    assert.equal(applyProfilePatch(trip, { travelers: 0 }, NOW).trip.profile.travelers, 1);
  });
});

describe("데모 항공 후보", () => {
  it("도쿄 후보에 에어프랑스가 나오지 않고, 모든 후보가 mock으로 표시된다", () => {
    const offers = buildDemoFlightOffers(profile({ destination: "도쿄, 일본" }), NOW);
    assert.equal(offers.length, 3);
    assert.ok(offers.every((offer) => offer.dataMode === "mock" && offer.provider === "demo"));
    assert.ok(!offers.some((offer) => offer.airlineNames.includes("에어프랑스")));
    assert.deepEqual(Array.from(new Set(offers.map((offer) => offer.arrivalAirport))).sort(), ["HND", "NRT"]);
  });

  it("‘가장 낮음’은 수하물 추가 요금까지 더한 가격으로 정한다", () => {
    const offers = buildDemoFlightOffers(profile({ destination: "도쿄" }), NOW);
    const best = offers.find((offer) => offerBadge(offer, offers).tone === "good")!;
    assert.equal(effectiveFlightPrice(best), Math.min(...offers.map(effectiveFlightPrice)));
  });

  it("‘가장 낮음’ 배지는 실제 최저가 후보 하나에만 붙는다", () => {
    const offers = buildDemoFlightOffers(profile(), NOW);
    const cheapest = offers.filter((offer) => offerBadge(offer, offers).tone === "good");
    assert.equal(cheapest.length, 1);
    assert.equal(effectiveFlightPrice(cheapest[0]), Math.min(...offers.map(effectiveFlightPrice)));
  });

  it("목적지가 바뀌면 저장된 후보를 오래된 것으로 표시한다", () => {
    const offers = buildDemoFlightOffers(profile(), NOW);
    assert.equal(offersAreStale(offers, profile()), false);
    assert.equal(offersAreStale(offers, profile({ destination: "파리" })), true);
  });

  it("예상 비용은 목적지 비용 계수를 따른다", () => {
    const paris = buildPlanningSummary(profile({ destination: "파리" }));
    const tokyo = buildPlanningSummary(profile());
    assert.ok(paris && tokyo && tokyo.estimatedCost < paris.estimatedCost);
  });
});

describe("오늘 계산은 목적지 시간대 기준 (T18)", () => {
  // 한국 11/06 01:30 = 파리 11/05 17:30 = 도쿄 11/06 01:30
  const now = new Date("2026-11-05T16:30:00Z");
  const dates = { startDate: "2026-11-06", endDate: "2026-11-10" };

  it("파리는 아직 출발 전날", () => {
    assert.deepEqual(tripTimeline(profile({ ...dates, destination: "파리" }), now, "Europe/Paris"), { stage: "before", daysUntil: 1 });
  });

  it("도쿄는 이미 여행 첫날", () => {
    assert.deepEqual(tripTimeline(profile({ ...dates, destination: "도쿄" }), now, "Asia/Tokyo"), { stage: "during", day: 1, totalDays: 5 });
  });

  it("귀국일 다음 날은 귀국 후, 날짜 미정은 계산하지 않는다", () => {
    assert.deepEqual(tripTimeline(profile(dates), new Date("2026-11-11T12:00:00Z"), "Europe/Paris"), { stage: "after" });
    assert.deepEqual(tripTimeline(profile({ flexibleDates: true }), now, "Europe/Paris"), { stage: "undated" });
  });

  it("여행 중에는 오늘 Day의 장소를 다음 일정으로 고른다", () => {
    const items = createDefaultTrip(NOW).itinerary;
    assert.equal(nextItineraryItem(items, { stage: "during", day: 2, totalDays: 5 })?.name, "센소지");
    assert.equal(nextItineraryItem(items, { stage: "before", daysUntil: 3 })?.name, "신주쿠 교엔");
    const done = items.map((item) => (item.day === 1 ? { ...item, status: "completed" as const } : item));
    assert.equal(nextItineraryItem(done, null)?.name, "센소지");
  });
});

describe("여행 중 기록 (EX-05·EX-06)", () => {
  it("부모님이 누른 상태와 시각만 기록하고 다른 장소는 건드리지 않는다", () => {
    const trip = createDefaultTrip(NOW);
    const next = setItineraryStatus(trip, "demo-2", "arrived", "2026-11-07T01:00:00.000Z");
    assert.equal(next.itinerary.find((item) => item.id === "demo-2")?.status, "arrived");
    assert.equal(next.itinerary.find((item) => item.id === "demo-2")?.statusAt, "2026-11-07T01:00:00.000Z");
    assert.ok(next.itinerary.filter((item) => item.id !== "demo-2").every((item) => item.status === "planned" && item.statusAt === null));
  });

  it("숙소 도착 기록은 안부 시각을 바꾸지 않고, 가족 알림은 ‘공유 창 열림’만 표시한다", () => {
    let trip = createDefaultTrip(NOW);
    trip = addJournalEvent(trip, { id: "e1", type: "hotel_arrival", at: "2026-11-06T12:10:00.000Z", location: null, shareOpened: false });
    assert.equal(trip.journal.lastCheckinAt, null);
    trip = markJournalShared(trip, "e1");
    assert.equal(lastJournalEvent(trip, "hotel_arrival")?.shareOpened, true);
    trip = addJournalEvent(trip, { id: "e2", type: "checkin", at: "2026-11-06T13:00:00.000Z", location: { lat: 35.69, lng: 139.7, accuracy: 30 }, shareOpened: false });
    assert.equal(trip.journal.lastCheckinAt, "2026-11-06T13:00:00.000Z");
    assert.equal(trip.journal.events.length, 2);
  });
});

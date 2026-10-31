import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultTrip } from "../lib/trip.ts";
import { LEGACY_DEMO_KEY, LEGACY_PLANNING_KEY, TRIP_STORAGE_KEY, loadTrip, saveTrip, type KeyValueStore } from "../lib/tripStorage.ts";

const NOW = "2026-10-31T00:00:00.000Z";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
  return store;
}

describe("여행 저장소", () => {
  it("아무것도 없으면 빈 여행 계획", () => {
    const { trip, source } = loadTrip(memoryStore(), NOW);
    assert.equal(source, "default");
    assert.equal(trip.profile.destination, "");
    assert.equal(trip.itinerary.length, 0);
    assert.equal(trip.flightOffers.length, 0);
  });

  it("저장한 여행을 그대로 다시 읽는다", () => {
    const store = memoryStore();
    const trip = createDefaultTrip(NOW);
    trip.profile.destination = "오사카, 일본";
    assert.equal(saveTrip(store, trip), true);
    assert.deepEqual(loadTrip(store, NOW), { trip, source: "stored" });
  });

  it("깨진 JSON이면 기본 여행으로 계속한다", () => {
    const { source } = loadTrip(memoryStore({ [TRIP_STORAGE_KEY]: "{not json" }), NOW);
    assert.equal(source, "default");
  });

  it("모양이 이상한 필드는 기본값·안전한 값으로 바꾼다", () => {
    const raw = JSON.stringify({ schemaVersion: 1, profile: { destination: 42, travelers: 99, budget: "사치형" }, itinerary: [{ name: "", day: 3 }, { name: "센소지", day: 99, status: "teleported" }] });
    const { trip } = loadTrip(memoryStore({ [TRIP_STORAGE_KEY]: raw }), NOW);
    assert.equal(trip.profile.destination, "");
    assert.equal(trip.profile.travelers, 12);
    assert.equal(trip.profile.budget, "균형형");
    assert.deepEqual(trip.itinerary.map((item) => [item.name, item.day, item.status]), [["센소지", 30, "planned"]]);
  });

  it("예전 두 저장소를 하나로 옮기고 예전 값은 지우지 않는다", () => {
    const legacyDemo = JSON.stringify({
      destination: "도쿄, 일본",
      hotel: "신주쿠 호텔",
      familyCode: "EASY-7J3K",
      places: [{ id: 1, day: 1, name: "에펠탑", note: "데모" }, { id: 99, day: 2, name: "센소지", note: "가족이 추가" }],
      lastCheckin: "2026-10-30T10:00:00.000Z",
      emergencyNumber: "110"
    });
    const legacyPlanning = JSON.stringify({
      form: { destination: "파리, 프랑스", departure: "김포 (GMP)", startDate: "2026-12-01", endDate: "2026-12-04", flexibleDates: false, travelers: 3, budget: "여유형", preference: "먹거리 중심" },
      flightCandidates: [{ id: "x", price: "₩1,000,000" }],
      priceMonitoring: true,
      savedAt: "2026-10-29T00:00:00.000Z"
    });
    const store = memoryStore({ [LEGACY_DEMO_KEY]: legacyDemo, [LEGACY_PLANNING_KEY]: legacyPlanning });
    const { trip, source } = loadTrip(store, NOW);

    assert.equal(source, "migrated");
    assert.equal(trip.profile.destination, "도쿄, 일본");
    assert.equal(trip.profile.departure, "김포 (GMP)");
    assert.equal(trip.profile.travelers, 3);
    assert.equal(trip.profile.hotel, "신주쿠 호텔");
    assert.equal(trip.profile.emergencyNumber, "110");
    assert.equal(trip.journal.lastCheckinAt, "2026-10-30T10:00:00.000Z");
    assert.equal(trip.priceWatch.mode, "off");
    assert.deepEqual(trip.flightOffers, []);
    assert.deepEqual(trip.itinerary.map((item) => [item.name, item.source]), [["센소지", "user"]]);
    assert.equal(store.data.get(LEGACY_DEMO_KEY), legacyDemo);
    assert.equal(store.data.get(LEGACY_PLANNING_KEY), legacyPlanning);
    assert.ok(store.data.has(TRIP_STORAGE_KEY));
    assert.equal(loadTrip(store, NOW).source, "stored");
  });

  it("기록·상태 필드의 이상한 값은 버리고 정상 기록만 남긴다", () => {
    const raw = JSON.stringify({ schemaVersion: 1, itinerary: [{ name: "센소지", day: 2, status: "arrived", statusAt: "어제" }], journal: { events: [{ type: "hotel_arrival", at: "2026-11-06T12:00:00.000Z", location: { lat: "x" } }, { type: "teleport", at: "2026-11-06T12:00:00.000Z" }] } });
    const { trip } = loadTrip(memoryStore({ [TRIP_STORAGE_KEY]: raw }), NOW);
    assert.equal(trip.itinerary[0].statusAt, null);
    assert.equal(trip.itinerary[0].status, "arrived");
    assert.equal(trip.journal.events.length, 1);
    assert.equal(trip.journal.events[0].location, null);
    assert.equal(trip.profile.travelerName, "");
  });

  it("저장이 막힌 브라우저에서는 false를 돌려준다", () => {
    const blocked: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    assert.equal(saveTrip(blocked, createDefaultTrip(NOW)), false);
  });
});

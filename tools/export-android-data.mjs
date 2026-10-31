// 웹이 원본인 데이터를 안드로이드 앱으로 내보냅니다. 실행: npm run android:data (Node 22.18+)
// 1) lib/destinations.ts → android/app/src/main/assets/destinations.json (목적지·자주 쓰는 말·언어)
// 2) lib/shareLink.ts 형식의 고정 payload → android/app/src/test/resources/share-fixture.txt (앱 TripCodec 호환성 테스트용)
import { mkdirSync, writeFileSync } from "node:fs";
import { LANGUAGE_OPTIONS, OTHER_DESTINATION, profileForDestination } from "../lib/destinations.ts";
import { buildSharePayload } from "../lib/shareLink.ts";
import { createDefaultTrip } from "../lib/trip.ts";

const probes = ["파리", "도쿄", "방콕", "다낭"];
const profiles = probes.map((name) => profileForDestination(name));
const data = { generatedFrom: "lib/destinations.ts", profiles, other: OTHER_DESTINATION, languages: LANGUAGE_OPTIONS };
writeFileSync(new URL("../android/app/src/main/assets/destinations.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");

const trip = createDefaultTrip("2026-11-01T00:00:00.000Z");
trip.profile = { ...trip.profile, destination: "도쿄, 일본", departure: "인천", originIata: "ICN", destinationIata: "HND", startDate: "2026-11-06", endDate: "2026-11-10", travelers: 2, hotel: "신주쿠 호텔", emergencyNumber: "110", travelerName: "엄마" };
trip.itinerary = [
  { id: "a", day: 1, name: "신주쿠 교엔", note: "오후 산책", status: "planned", statusAt: null, source: "user" },
  { id: "b", day: 2, name: "센소지", note: "", status: "planned", statusAt: null, source: "user" }
];
const fixtureDir = new URL("../android/app/src/test/resources/", import.meta.url);
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(new URL("share-fixture.txt", fixtureDir), buildSharePayload(trip, "2026-11-01T00:00:00.000Z") + "\n");
console.log(`wrote ${profiles.length} profiles + other, ${LANGUAGE_OPTIONS.length} languages, share fixture`);

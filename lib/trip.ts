// ---------------------------------------------------------------------------
// Trip — 계획·여행 중·귀가 후가 같은 여행 데이터를 씁니다.
// 상태 이름은 docs/ARCHITECTURE_KO.md의 계약을 따릅니다.
// 이 파일은 순수 함수만 둡니다(브라우저 저장은 tripStorage.ts).
// ---------------------------------------------------------------------------

import { profileForDestination } from "./destinations.ts";

export type TripState = "draft" | "comparing" | "planned" | "booked" | "upcoming" | "in_progress" | "returned" | "reviewing" | "archived";
export type BudgetStyle = "절약형" | "균형형" | "여유형";
export type TravelPreference = "느긋한 일정" | "먹거리 중심" | "관광 중심" | "가족 휴식 중심";
export type ItineraryStatus = "planned" | "in_progress" | "arrived" | "completed" | "skipped" | "delayed";
export type DataSource = "demo" | "user" | "import";

export const BUDGET_STYLES: BudgetStyle[] = ["절약형", "균형형", "여유형"];
export const TRAVEL_PREFERENCES: TravelPreference[] = ["느긋한 일정", "먹거리 중심", "관광 중심", "가족 휴식 중심"];
export const MAX_TRIP_DAYS = 30;
export const MAX_TRAVELERS = 12;
/** 날짜를 정하지 않았을 때 일정·비용을 계산하는 기준 일수 */
export const ASSUMED_TRIP_DAYS = 3;

export type TripProfile = {
  destination: string;
  departure: string;
  /** 실제 항공 조회에 쓸 IATA 3글자 코드. 목적지 텍스트를 자동 지오코딩하지 않습니다. */
  originIata: string;
  destinationIata: string;
  /** YYYY-MM-DD, 목적지 현지 날짜 */
  startDate: string;
  endDate: string;
  flexibleDates: boolean;
  travelers: number;
  budget: BudgetStyle;
  preference: TravelPreference;
  hotel: string;
  emergencyNumber: string;
  /** 알림 문구에 쓸 여행자 호칭(예: 엄마). 비우면 “부모님” */
  travelerName: string;
};

export type ItineraryItem = {
  id: string;
  day: number;
  name: string;
  note: string;
  status: ItineraryStatus;
  /** 상태를 마지막으로 바꾼 시각(사용자가 직접 누른 기록) */
  statusAt: string | null;
  source: DataSource;
};

/** 항공 후보 스냅샷. 실제 공급자가 붙어도 같은 모양을 씁니다. */
export type FlightOffer = {
  id: string;
  provider: string;
  dataMode: "mock" | "live";
  fetchedAt: string;
  originLabel: string;
  destinationLabel: string;
  airlineNames: string[];
  stops: number;
  /** 1인 왕복, KRW */
  totalPrice: number;
  currency: string;
  arrivalAirport?: string;
  departLocal?: string;
  arriveLocal?: string;
  durationMinutes?: number;
  baggageIncluded?: boolean;
  /** 수하물 별도 운임의 1인 왕복 추가 요금(KRW) */
  baggageFeeKrw?: number;
};

/** 여행 중 사용자가 직접 남긴 기록. 위치는 사용자가 고른 경우에만 들어갑니다. */
export type JournalEventType = "checkin" | "hotel_arrival";
export type JournalEvent = {
  id: string;
  type: JournalEventType;
  at: string;
  location: { lat: number; lng: number; accuracy: number } | null;
  /** 가족에게 알리기 화면을 열었는지. 실제로 보냈는지는 앱이 알 수 없습니다. */
  shareOpened: boolean;
};

export type PriceWatch = {
  mode: "off" | "configured";
  targetPrice: number | null;
  checkTimes: string[];
  checksPerDay: 2;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  updatedAt: string | null;
};

export type FlightSelection = {
  offerId: string;
  status: "selected" | "booked";
  updatedAt: string;
};

export type Trip = {
  schemaVersion: 1;
  id: string;
  state: TripState;
  profile: TripProfile;
  itinerary: ItineraryItem[];
  flightOffers: FlightOffer[];
  priceWatch: PriceWatch;
  flightSelection: FlightSelection | null;
  journal: { lastCheckinAt: string | null; events: JournalEvent[] };
  createdAt: string;
  updatedAt: string;
};

// 1차 테스트 지역은 일본(도쿄)입니다. 데모 숙소는 길찾기가 되도록 실제 역 이름을 씁니다.
export const DEMO_DESTINATION = "도쿄, 일본";
export const DEMO_HOTEL = "신주쿠역";
export const DEMO_FETCHED_AT = "2026-10-24T09:30:00+09:00";

// 이동 시간은 지도 API 없이 지어내지 않습니다(요청서 PL-05).
export const DEMO_ITINERARY: ItineraryItem[] = [
  { id: "demo-1", day: 1, name: "신주쿠 교엔", note: "오후 · 첫날은 숙소 근처에서 가볍게 산책", status: "planned", statusAt: null, source: "demo" },
  { id: "demo-2", day: 2, name: "센소지", note: "오전 · 사람이 적은 이른 시간 추천", status: "planned", statusAt: null, source: "demo" },
  { id: "demo-3", day: 3, name: "도쿄역 마루노우치", note: "오후 · 실내 위주라 비 오는 날 대체 가능", status: "planned", statusAt: null, source: "demo" },
  { id: "demo-4", day: 4, name: "우에노 공원", note: "오전 · 벤치가 많아 쉬어 가기 좋음", status: "planned", statusAt: null, source: "demo" }
];

/** 예전(파리 데모) 저장소를 옮길 때 데모 장소를 알아보는 이름 */
export const LEGACY_DEMO_NAMES = ["에펠탑", "루브르 박물관", "몽마르트르"];

export const DEFAULT_PROFILE: TripProfile = {
  destination: DEMO_DESTINATION,
  departure: "인천국제공항 (ICN)",
  originIata: "ICN",
  destinationIata: "NRT",
  startDate: "2026-11-06",
  endDate: "2026-11-10",
  flexibleDates: false,
  travelers: 2,
  budget: "균형형",
  preference: "느긋한 일정",
  hotel: DEMO_HOTEL,
  emergencyNumber: "",
  travelerName: ""
};

/** 새 설치에서 보여 줄 빈 여행. 저장된 가짜 일정·가격을 사실처럼 보이지 않게 합니다. */
export const EMPTY_PROFILE: TripProfile = {
  destination: "",
  departure: "",
  originIata: "",
  destinationIata: "",
  startDate: "",
  endDate: "",
  flexibleDates: false,
  travelers: 1,
  budget: "균형형",
  preference: "느긋한 일정",
  hotel: "",
  emergencyNumber: "",
  travelerName: ""
};

export function emptyPriceWatch(): PriceWatch {
  return {
    mode: "off",
    targetPrice: null,
    checkTimes: ["08:00", "20:00"],
    checksPerDay: 2,
    lastCheckedAt: null,
    nextCheckAt: null,
    updatedAt: null
  };
}

export function createDefaultTrip(now: string = new Date().toISOString()): Trip {
  return {
    schemaVersion: 1,
    id: "local-trip",
    state: "draft",
    profile: { ...EMPTY_PROFILE },
    itinerary: [],
    flightOffers: [],
    priceWatch: emptyPriceWatch(),
    flightSelection: null,
    journal: { lastCheckinAt: null, events: [] },
    createdAt: now,
    updatedAt: now
  };
}

// --- 날짜 -------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateToUtc(value: string) {
  if (!DATE_PATTERN.test(value)) return NaN;
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? time : NaN;
}

export type DateCheck =
  | { ok: true; days: number; assumed: boolean }
  | { ok: false; message: string };

/** 여행 기간을 확인합니다. 잘못된 입력을 다른 값으로 덮어쓰지 않고 이유를 돌려줍니다. */
export function checkTripDates(profile: Pick<TripProfile, "startDate" | "endDate" | "flexibleDates">): DateCheck {
  if (profile.flexibleDates || (!profile.startDate && !profile.endDate)) return { ok: true, days: ASSUMED_TRIP_DAYS, assumed: true };
  if (!profile.startDate || !profile.endDate) return { ok: false, message: "출발일과 귀국일을 모두 넣거나, 날짜 미정을 선택해 주세요." };
  const start = dateToUtc(profile.startDate);
  const end = dateToUtc(profile.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, message: "날짜 형식을 확인해 주세요." };
  if (end < start) return { ok: false, message: "귀국일이 출발일보다 빨라요. 날짜를 다시 확인해 주세요." };
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > MAX_TRIP_DAYS) return { ok: false, message: `여행 기간은 ${MAX_TRIP_DAYS}일 이하로 넣어 주세요. (지금 ${days}일)` };
  return { ok: true, days, assumed: false };
}

function dateLabel(value: string) {
  return value ? value.replaceAll("-", ".") : "날짜 미정";
}

export function periodLabel(profile: Pick<TripProfile, "startDate" | "endDate" | "flexibleDates">) {
  if (profile.flexibleDates) return `날짜 유연 · ${ASSUMED_TRIP_DAYS}일 기준`;
  if (!profile.startDate && !profile.endDate) return `날짜 미정 · ${ASSUMED_TRIP_DAYS}일 기준`;
  return `${dateLabel(profile.startDate)} ~ ${dateLabel(profile.endDate)}`;
}

/** now 시점의 해당 시간대 날짜(YYYY-MM-DD). timeZone이 없으면 기기 시간대를 씁니다. */
export function localDateIn(now: Date, timeZone: string | null) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type TripTimeline =
  | { stage: "undated" }
  | { stage: "before"; daysUntil: number }
  | { stage: "during"; day: number; totalDays: number }
  | { stage: "after" };

/** 목적지 현지 날짜 기준으로 여행 전/중/후와 오늘이 몇째 날인지 계산합니다. */
export function tripTimeline(profile: TripProfile, now: Date, timeZone: string | null): TripTimeline {
  const check = checkTripDates(profile);
  if (!check.ok || check.assumed) return { stage: "undated" };
  const today = dateToUtc(localDateIn(now, timeZone));
  const start = dateToUtc(profile.startDate);
  const end = dateToUtc(profile.endDate);
  if (today < start) return { stage: "before", daysUntil: Math.round((start - today) / 86_400_000) };
  if (today > end) return { stage: "after" };
  return { stage: "during", day: Math.round((today - start) / 86_400_000) + 1, totalDays: check.days };
}

/** “다음 일정”: 여행 중이면 오늘 Day의 끝나지 않은 첫 장소, 아니면 가장 이른 Day의 첫 장소. */
export function nextItineraryItem(itinerary: ItineraryItem[], timeline: TripTimeline | null) {
  const open = itinerary.filter((item) => item.status !== "completed" && item.status !== "skipped");
  if (timeline?.stage === "during") {
    const today = open.find((item) => item.day === timeline.day);
    if (today) return today;
    const later = open.filter((item) => item.day > timeline.day).sort((a, b) => a.day - b.day)[0];
    if (later) return later;
  }
  return [...open].sort((a, b) => a.day - b.day)[0] || null;
}

// --- 프로필 변경 --------------------------------------------------------------

export function clampTravelers(value: number) {
  return Math.min(MAX_TRAVELERS, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));
}

/**
 * 프로필을 고칩니다. 목적지가 바뀌면 이전 목적지의 데모 장소·데모 숙소를 비워
 * 도쿄로 바꿔도 파리 데모 값이 남지 않게 합니다. 사용자가 넣은 장소는 지우지 않습니다.
 */
export function applyProfilePatch(trip: Trip, patch: Partial<TripProfile>, now: string): { trip: Trip; clearedDemo: boolean } {
  const profile = { ...trip.profile, ...patch };
  if (patch.travelers !== undefined) profile.travelers = clampTravelers(patch.travelers);
  const destinationChanged = patch.destination !== undefined && patch.destination.trim() !== trip.profile.destination.trim();
  let itinerary = trip.itinerary;
  let clearedDemo = false;
  if (destinationChanged) {
    const kept = itinerary.filter((item) => item.source !== "demo");
    clearedDemo = kept.length !== itinerary.length || profile.hotel === DEMO_HOTEL;
    itinerary = kept;
    if (profile.hotel === DEMO_HOTEL) profile.hotel = "";
  }
  return { trip: { ...trip, profile, itinerary, updatedAt: now }, clearedDemo };
}

// --- 계획 요약·항공 데모 --------------------------------------------------------

export type PlanningDay = { day: number; title: string; detail: string };
export type PlanningSummary = {
  destination: string;
  period: string;
  travelers: number;
  dayCount: number;
  assumedDays: boolean;
  estimatedCost: number;
  days: PlanningDay[];
};

const BUDGET_FACTOR: Record<BudgetStyle, number> = { 절약형: 0.82, 균형형: 1, 여유형: 1.25 };
export const SUMMARY_PREVIEW_DAYS = 7;

/** 날짜가 잘못됐으면 null — 화면은 요약 대신 오류를 보여줍니다. */
export function buildPlanningSummary(profile: TripProfile): PlanningSummary | null {
  const check = checkTripDates(profile);
  if (!check.ok) return null;
  const destination = profile.destination.trim() || "여행지";
  const travelers = clampTravelers(profile.travelers);
  const place = profileForDestination(destination);
  const estimatedCost = Math.round(((place.flightPerPersonKrw + place.dailyPerPersonKrw * check.days) * travelers * BUDGET_FACTOR[profile.budget]) / 10_000) * 10_000;
  const focus = profile.preference;
  const templates: Array<[string, string]> = [
    ["도착하고 천천히 적응하기", `${destination} 중심 산책 · ${focus}`],
    ["대표 장소 한 곳 즐기기", `무리하지 않고 ${destination}의 대표 명소와 식사`],
    ["동네처럼 하루 보내기", `${destination}의 시장·공원·카페를 천천히 둘러보기`],
    ["가족 취향에 맞춰 쉬기", "예약한 활동과 충분한 휴식 시간을 함께 배치하기"],
    ["남은 곳 한 곳 고르기", "날씨와 체력에 맞춰 가까운 장소를 선택하기"],
    ["좋았던 곳 다시 보기", "아침 여유 · 기념품 · 가벼운 산책"]
  ];
  const lastDay: [string, string] = ["귀국 준비하기", "짐 정리 · 공항 이동 · 마지막 식사"];
  const previewDays = Math.min(check.days, SUMMARY_PREVIEW_DAYS);
  const days = Array.from({ length: previewDays }, (_, index) => {
    const isLast = index === check.days - 1 && check.days > 1;
    const [title, detail] = isLast ? lastDay : templates[index % templates.length];
    return { day: index + 1, title, detail };
  });
  return { destination, period: periodLabel(profile), travelers, dayCount: check.days, assumedDays: check.assumed, estimatedCost, days };
}

export function buildDemoFlightOffers(profile: TripProfile, fetchedAt: string): FlightOffer[] {
  const originLabel = profile.departure.trim() || "출발 지역";
  const destinationLabel = profile.destination.trim() || "여행지";
  const place = profileForDestination(destinationLabel);
  return place.demoFlights.map((flight, index) => ({
    id: `demo-${place.id}-${index}`,
    provider: "demo",
    dataMode: "mock",
    fetchedAt,
    originLabel,
    destinationLabel,
    airlineNames: [flight.airline],
    stops: flight.stops,
    totalPrice: Math.round((place.flightPerPersonKrw * flight.priceFactor) / 1_000) * 1_000,
    currency: "KRW",
    arrivalAirport: flight.arrivalAirport,
    departLocal: flight.departLocal,
    arriveLocal: flight.arriveLocal,
    durationMinutes: flight.durationMinutes,
    baggageIncluded: flight.baggageIncluded,
    baggageFeeKrw: flight.baggageFeeKrw
  }));
}

/** 수하물 별도 요금까지 더한 1인 왕복 실지불 예상액 */
export function effectiveFlightPrice(offer: FlightOffer) {
  return offer.totalPrice + (offer.baggageIncluded === false ? offer.baggageFeeKrw ?? 0 : 0);
}

export type OfferBadge = { label: string; tone: "good" | "steady" | "watch" };

/** 표시용 배지는 고정 문구가 아니라 수하물까지 더한 실제 후보 가격으로 계산합니다. */
export function offerBadge(offer: FlightOffer, offers: FlightOffer[]): OfferBadge {
  const cheapest = Math.min(...offers.map(effectiveFlightPrice));
  const price = effectiveFlightPrice(offer);
  if (price === cheapest) return { label: "이 후보 중 가장 낮음", tone: "good" };
  if (offer.stops === 0) return price > cheapest * 1.15 ? { label: "직항 · 조금 높음", tone: "watch" } : { label: "직항", tone: "steady" };
  return { label: `${offer.stops}회 경유`, tone: "steady" };
}

/** 저장된 후보가 지금 입력한 출발지·목적지와 다르면 다시 조회해야 합니다. */
export function offersAreStale(offers: FlightOffer[], profile: TripProfile) {
  if (!offers.length) return false;
  const originLabels = [profile.originIata.trim().toUpperCase(), profile.departure.trim()].filter(Boolean);
  const destinationLabels = [profile.destinationIata.trim().toUpperCase(), profile.destination.trim()].filter(Boolean);
  return offers.some((offer) => !originLabels.includes(offer.originLabel) || !destinationLabels.includes(offer.destinationLabel));
}

// --- 여행 중 기록 ---------------------------------------------------------------

/** 부모님이 누른 일정 상태를 기록합니다. 자동으로 판단하지 않습니다. */
export function setItineraryStatus(trip: Trip, id: string, status: ItineraryStatus, now: string): Trip {
  return { ...trip, itinerary: trip.itinerary.map((item) => (item.id === id ? { ...item, status, statusAt: now } : item)), updatedAt: now };
}

export const MAX_JOURNAL_EVENTS = 200;

export function addJournalEvent(trip: Trip, event: JournalEvent): Trip {
  const events = [...trip.journal.events, event].slice(-MAX_JOURNAL_EVENTS);
  const lastCheckinAt = event.type === "checkin" ? event.at : trip.journal.lastCheckinAt;
  return { ...trip, journal: { lastCheckinAt, events }, updatedAt: event.at };
}

export function markJournalShared(trip: Trip, id: string): Trip {
  return { ...trip, journal: { ...trip.journal, events: trip.journal.events.map((event) => (event.id === id ? { ...event, shareOpened: true } : event)) } };
}

export function lastJournalEvent(trip: Trip, type: JournalEventType) {
  for (let index = trip.journal.events.length - 1; index >= 0; index -= 1) {
    if (trip.journal.events[index].type === type) return trip.journal.events[index];
  }
  return null;
}

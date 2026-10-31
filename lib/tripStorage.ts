// ---------------------------------------------------------------------------
// 여행 데이터 저장 — 지금은 브라우저 localStorage 하나(`easy-travel:trip`)에 둡니다.
// 예전 저장소(`easy-travel-demo`, `easy-travel-planning`)가 있으면 한 번 옮기고,
// 되돌릴 수 있도록 예전 값은 지우지 않습니다.
// 서버 저장으로 바꿀 때는 이 파일의 load/save만 갈아 끼웁니다.
// ---------------------------------------------------------------------------

import {
  BUDGET_STYLES,
  DEMO_ITINERARY,
  MAX_TRIP_DAYS,
  TRAVEL_PREFERENCES,
  clampTravelers,
  createDefaultTrip,
  type BudgetStyle,
  type DataSource,
  type FlightOffer,
  type ItineraryItem,
  type ItineraryStatus,
  type TravelPreference,
  type Trip,
  type TripProfile,
  type TripState
} from "./trip.ts";

export const TRIP_STORAGE_KEY = "easy-travel:trip";
export const LEGACY_DEMO_KEY = "easy-travel-demo";
export const LEGACY_PLANNING_KEY = "easy-travel-planning";

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const TRIP_STATES: TripState[] = ["draft", "comparing", "planned", "booked", "upcoming", "in_progress", "returned", "reviewing", "archived"];
const ITINERARY_STATUSES: ItineraryStatus[] = ["planned", "in_progress", "arrived", "completed", "skipped", "delayed"];
const SOURCES: DataSource[] = ["demo", "user", "import"];

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max = 200) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function isoOrNull(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function coerceProfile(value: unknown, base: TripProfile): TripProfile {
  const data = isObject(value) ? value : {};
  return {
    destination: text(data.destination, base.destination, 120),
    departure: text(data.departure, base.departure, 120),
    startDate: text(data.startDate, base.startDate, 10),
    endDate: text(data.endDate, base.endDate, 10),
    flexibleDates: typeof data.flexibleDates === "boolean" ? data.flexibleDates : base.flexibleDates,
    travelers: typeof data.travelers === "number" ? clampTravelers(data.travelers) : base.travelers,
    budget: oneOf<BudgetStyle>(data.budget, BUDGET_STYLES, base.budget),
    preference: oneOf<TravelPreference>(data.preference, TRAVEL_PREFERENCES, base.preference),
    hotel: text(data.hotel, base.hotel, 160),
    emergencyNumber: text(data.emergencyNumber, base.emergencyNumber, 20)
  };
}

function coerceItinerary(value: unknown, fallbackSource: DataSource): ItineraryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).flatMap((item, index) => {
    const name = text(item.name, "", 120).trim();
    if (!name) return [];
    const day = typeof item.day === "number" && Number.isFinite(item.day) ? Math.min(MAX_TRIP_DAYS, Math.max(1, Math.round(item.day))) : 1;
    const id = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : `item-${index}`;
    return [{
      id,
      day,
      name,
      note: text(item.note, "", 200),
      status: oneOf<ItineraryStatus>(item.status, ITINERARY_STATUSES, "planned"),
      source: oneOf<DataSource>(item.source, SOURCES, fallbackSource)
    }];
  });
}

function coerceOffers(value: unknown): FlightOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).flatMap((offer) => {
    if (typeof offer.totalPrice !== "number" || !Number.isFinite(offer.totalPrice) || !isoOrNull(offer.fetchedAt)) return [];
    return [{
      id: text(offer.id, "offer", 80),
      provider: text(offer.provider, "demo", 40),
      dataMode: offer.dataMode === "live" ? "live" : "mock",
      fetchedAt: offer.fetchedAt as string,
      originLabel: text(offer.originLabel, "", 120),
      destinationLabel: text(offer.destinationLabel, "", 120),
      airlineNames: Array.isArray(offer.airlineNames) ? offer.airlineNames.filter((name): name is string => typeof name === "string").slice(0, 4) : [],
      stops: typeof offer.stops === "number" ? Math.max(0, Math.round(offer.stops)) : 0,
      totalPrice: offer.totalPrice,
      currency: "KRW"
    }];
  });
}

/** 저장된 v1 Trip을 검증합니다. 모양이 깨진 필드는 기본값으로 채웁니다. */
export function parseStoredTrip(value: unknown, now: string): Trip | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null;
  const base = createDefaultTrip(now);
  const priceWatch = isObject(value.priceWatch) ? value.priceWatch : {};
  const journal = isObject(value.journal) ? value.journal : {};
  return {
    schemaVersion: 1,
    id: text(value.id, base.id, 80),
    state: oneOf<TripState>(value.state, TRIP_STATES, base.state),
    profile: coerceProfile(value.profile, base.profile),
    itinerary: coerceItinerary(value.itinerary, "user"),
    flightOffers: coerceOffers(value.flightOffers),
    priceWatch: { mode: priceWatch.mode === "demo" ? "demo" : "off", updatedAt: isoOrNull(priceWatch.updatedAt) },
    journal: { lastCheckinAt: isoOrNull(journal.lastCheckinAt) },
    createdAt: isoOrNull(value.createdAt) || now,
    updatedAt: isoOrNull(value.updatedAt) || now
  };
}

const DEMO_NAMES = new Set(DEMO_ITINERARY.map((item) => item.name));

/** 예전 두 저장소를 하나의 Trip으로 합칩니다. 둘 다 없으면 null. */
export function migrateLegacy(demo: unknown, planning: unknown, now: string): Trip | null {
  if (!isObject(demo) && !isObject(planning)) return null;
  const base = createDefaultTrip(now);
  const demoData = isObject(demo) ? demo : {};
  const planningData = isObject(planning) ? planning : {};
  const form = isObject(planningData.form) ? planningData.form : {};
  // 여행 설정의 목적지가 계획 저장 때마다 갱신되던 값이라 우선합니다.
  const profile = coerceProfile({ ...form, destination: demoData.destination ?? form.destination, hotel: demoData.hotel, emergencyNumber: demoData.emergencyNumber }, base.profile);
  const itinerary = isObject(demo) && Array.isArray(demoData.places)
    ? coerceItinerary(demoData.places, "user").map((item) => ({ ...item, source: DEMO_NAMES.has(item.name) ? ("demo" as const) : item.source }))
    : base.itinerary;
  return {
    ...base,
    profile,
    itinerary,
    // 예전 항공 후보는 가격이 문자열인 데모라 옮기지 않고 비워 둡니다(다시 조회하면 새로 만듭니다).
    flightOffers: [],
    priceWatch: { mode: planningData.priceMonitoring === true ? "demo" : "off", updatedAt: isoOrNull(planningData.savedAt) },
    journal: { lastCheckinAt: isoOrNull(demoData.lastCheckin) }
  };
}

export type LoadResult = { trip: Trip; source: "stored" | "migrated" | "default" };

export function loadTrip(store: KeyValueStore, now: string): LoadResult {
  const stored = parseStoredTrip(readJson(store, TRIP_STORAGE_KEY), now);
  if (stored) return { trip: stored, source: "stored" };
  const migrated = migrateLegacy(readJson(store, LEGACY_DEMO_KEY), readJson(store, LEGACY_PLANNING_KEY), now);
  if (migrated) {
    saveTrip(store, migrated);
    return { trip: migrated, source: "migrated" };
  }
  return { trip: createDefaultTrip(now), source: "default" };
}

/** 저장 실패(사생활 보호 모드·용량 초과)는 false로 알려 화면이 안내할 수 있게 합니다. */
export function saveTrip(store: KeyValueStore, trip: Trip): boolean {
  try {
    store.setItem(TRIP_STORAGE_KEY, JSON.stringify(trip));
    return true;
  } catch {
    return false;
  }
}

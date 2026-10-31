// ---------------------------------------------------------------------------
// 여행 데이터 저장 — 지금은 브라우저 localStorage 하나(`easy-travel:trip`)에 둡니다.
// 예전 저장소(`easy-travel-demo`, `easy-travel-planning`)가 있으면 한 번 옮기고,
// 되돌릴 수 있도록 예전 값은 지우지 않습니다.
// 서버 저장으로 바꿀 때는 이 파일의 load/save만 갈아 끼웁니다.
// ---------------------------------------------------------------------------

import {
  BUDGET_STYLES,
  DEFAULT_PROFILE,
  LEGACY_DEMO_NAMES,
  MAX_JOURNAL_EVENTS,
  MAX_TRIP_DAYS,
  TRAVEL_PREFERENCES,
  clampTravelers,
  createDefaultTrip,
  emptyPriceWatch,
  type BudgetStyle,
  type DataSource,
  type FlightOffer,
  type FlightSelection,
  type ItineraryItem,
  type ItineraryStatus,
  type JournalEvent,
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
    originIata: text(data.originIata, base.originIata, 3).toUpperCase(),
    destinationIata: text(data.destinationIata, base.destinationIata, 3).toUpperCase(),
    startDate: text(data.startDate, base.startDate, 10),
    endDate: text(data.endDate, base.endDate, 10),
    flexibleDates: typeof data.flexibleDates === "boolean" ? data.flexibleDates : base.flexibleDates,
    travelers: typeof data.travelers === "number" ? clampTravelers(data.travelers) : base.travelers,
    budget: oneOf<BudgetStyle>(data.budget, BUDGET_STYLES, base.budget),
    preference: oneOf<TravelPreference>(data.preference, TRAVEL_PREFERENCES, base.preference),
    hotel: text(data.hotel, base.hotel, 160),
    emergencyNumber: text(data.emergencyNumber, base.emergencyNumber, 20),
    travelerName: text(data.travelerName, base.travelerName, 20)
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
      statusAt: isoOrNull(item.statusAt),
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
      currency: typeof offer.currency === "string" ? offer.currency.slice(0, 3).toUpperCase() : "KRW",
      arrivalAirport: typeof offer.arrivalAirport === "string" ? offer.arrivalAirport.slice(0, 8) : undefined,
      departLocal: typeof offer.departLocal === "string" ? offer.departLocal.slice(0, 40) : undefined,
      arriveLocal: typeof offer.arriveLocal === "string" ? offer.arriveLocal.slice(0, 40) : undefined,
      durationMinutes: typeof offer.durationMinutes === "number" ? Math.max(0, Math.round(offer.durationMinutes)) : undefined,
      baggageIncluded: typeof offer.baggageIncluded === "boolean" ? offer.baggageIncluded : undefined,
      baggageFeeKrw: typeof offer.baggageFeeKrw === "number" ? Math.max(0, offer.baggageFeeKrw) : undefined
    }];
  });
}

function coerceLocation(value: unknown): JournalEvent["location"] {
  if (!isObject(value)) return null;
  const { lat, lng, accuracy } = value;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : 0 };
}

function coerceEvents(value: unknown): JournalEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).flatMap((event, index) => {
    const at = isoOrNull(event.at);
    if (!at || (event.type !== "checkin" && event.type !== "hotel_arrival")) return [];
    const type: JournalEvent["type"] = event.type;
    return [{ id: text(event.id, `event-${index}`, 80), type, at, location: coerceLocation(event.location), shareOpened: event.shareOpened === true }];
  }).slice(-MAX_JOURNAL_EVENTS);
}

/** 저장된 v1 Trip을 검증합니다. 모양이 깨진 필드는 기본값으로 채웁니다. */
export function parseStoredTrip(value: unknown, now: string): Trip | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null;
  const base = createDefaultTrip(now);
  const priceWatch = isObject(value.priceWatch) ? value.priceWatch : {};
  const selection = isObject(value.flightSelection) ? value.flightSelection : null;
  const journal = isObject(value.journal) ? value.journal : {};
  const storedItinerary = coerceItinerary(value.itinerary, "user");
  const storedOffers = coerceOffers(value.flightOffers);
  const parsedProfile = coerceProfile(value.profile, base.profile);
  const isSeedProfile = parsedProfile.destination === DEFAULT_PROFILE.destination
    && parsedProfile.departure === DEFAULT_PROFILE.departure
    && parsedProfile.startDate === DEFAULT_PROFILE.startDate
    && parsedProfile.endDate === DEFAULT_PROFILE.endDate
    && parsedProfile.flexibleDates === DEFAULT_PROFILE.flexibleDates
    && parsedProfile.travelers === DEFAULT_PROFILE.travelers
    && parsedProfile.budget === DEFAULT_PROFILE.budget
    && parsedProfile.preference === DEFAULT_PROFILE.preference
    && parsedProfile.hotel === DEFAULT_PROFILE.hotel
    && !storedItinerary.some((item) => item.source === "user" || item.source === "import")
    && !storedOffers.some((offer) => offer.dataMode === "live");
  const storedPriceWatch = emptyPriceWatch();
  const checkTimes = Array.isArray(priceWatch.checkTimes)
    ? priceWatch.checkTimes.filter((time): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 2)
    : storedPriceWatch.checkTimes;
  const normalizedCheckTimes = checkTimes.length === 2 ? checkTimes : [...checkTimes, ...storedPriceWatch.checkTimes].slice(0, 2);
  const normalizedSelection: FlightSelection | null = selection && typeof selection.offerId === "string" && (selection.status === "selected" || selection.status === "booked") && isoOrNull(selection.updatedAt)
    ? { offerId: selection.offerId.slice(0, 80), status: selection.status, updatedAt: selection.updatedAt as string }
    : null;
  return {
    schemaVersion: 1,
    id: text(value.id, base.id, 80),
    state: isSeedProfile ? "draft" : oneOf<TripState>(value.state, TRIP_STATES, base.state),
    profile: isSeedProfile ? base.profile : parsedProfile,
    // 이전 버전의 데모 장소·모의 항공 후보는 실제 계획으로 승격하지 않습니다.
    itinerary: storedItinerary.filter((item) => item.source !== "demo"),
    flightOffers: storedOffers.filter((offer) => offer.dataMode === "live"),
    priceWatch: {
      mode: priceWatch.mode === "configured" ? "configured" : "off",
      targetPrice: typeof priceWatch.targetPrice === "number" && Number.isFinite(priceWatch.targetPrice) && priceWatch.targetPrice > 0 ? Math.round(priceWatch.targetPrice) : null,
      checkTimes: normalizedCheckTimes,
      checksPerDay: 2,
      lastCheckedAt: isoOrNull(priceWatch.lastCheckedAt),
      nextCheckAt: isoOrNull(priceWatch.nextCheckAt),
      updatedAt: isoOrNull(priceWatch.updatedAt)
    },
    flightSelection: normalizedSelection,
    journal: { lastCheckinAt: isoOrNull(journal.lastCheckinAt), events: coerceEvents(journal.events) },
    createdAt: isoOrNull(value.createdAt) || now,
    updatedAt: isoOrNull(value.updatedAt) || now
  };
}

const DEMO_NAMES = new Set(LEGACY_DEMO_NAMES);

/** 예전 두 저장소를 하나의 Trip으로 합칩니다. 둘 다 없으면 null. */
export function migrateLegacy(demo: unknown, planning: unknown, now: string): Trip | null {
  if (!isObject(demo) && !isObject(planning)) return null;
  const base = createDefaultTrip(now);
  const demoData = isObject(demo) ? demo : {};
  const planningData = isObject(planning) ? planning : {};
  const form = isObject(planningData.form) ? planningData.form : {};
  // 여행 설정의 목적지가 계획 저장 때마다 갱신되던 값이라 우선합니다.
  const profile = coerceProfile({ ...form, destination: demoData.destination ?? form.destination, hotel: demoData.hotel, emergencyNumber: demoData.emergencyNumber }, base.profile);
  // 예전 저장소에는 파리 데모 값만 있었으므로, 저장된 장소가 없으면 빈 일정으로 시작합니다.
  const itinerary = isObject(demo) && Array.isArray(demoData.places)
    ? coerceItinerary(demoData.places, "user").filter((item) => !DEMO_NAMES.has(item.name))
    : [];
  return {
    ...base,
    profile,
    itinerary,
    // 예전 항공 후보는 가격이 문자열인 데모라 옮기지 않고 비워 둡니다(다시 조회하면 새로 만듭니다).
    flightOffers: [],
    priceWatch: emptyPriceWatch(),
    flightSelection: null,
    journal: { lastCheckinAt: isoOrNull(demoData.lastCheckin), events: [] }
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

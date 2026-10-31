// ---------------------------------------------------------------------------
// 항공 + 숙소 묶음 비교 — 이동 피로도와 총비용(항공·수하물·숙박·공항 왕복 교통)
// 숙소·공항 이동 값은 1차 테스트 지역(도쿄)의 예시 데이터(Mock)이며 실제 요금·소요 시간이 아닙니다.
// 실제 공급자가 붙으면 HotelOffer를 같은 모양으로 돌려주는 어댑터만 바꿉니다.
// ---------------------------------------------------------------------------

import { profileForDestination } from "./destinations.ts";
import { checkTripDates, clampTravelers, effectiveFlightPrice, type FlightOffer, type TripProfile } from "./trip.ts";

export type AirportTransfer = { mode: string; minutes: number; transfers: number; costPerPersonKrw: number };

export type HotelOffer = {
  id: string;
  name: string;
  area: string;
  provider: string;
  dataMode: "mock" | "live";
  /** 2인 1실 1박 요금(KRW) */
  nightlyPriceKrw: number;
  checkInTime: string;
  frontDesk24h: boolean;
  elevator: boolean;
  stationWalkMinutes: number;
  /** 도착 공항(IATA)별 숙소까지 이동 */
  airportTransfers: Record<string, AirportTransfer>;
  notes: string[];
};

const TOKYO_DEMO_HOTELS: HotelOffer[] = [
  {
    id: "demo-shinjuku",
    name: "신주쿠역 도보 5분 호텔 (예시)",
    area: "신주쿠",
    provider: "demo",
    dataMode: "mock",
    nightlyPriceKrw: 210_000,
    checkInTime: "15:00",
    frontDesk24h: true,
    elevator: true,
    stationWalkMinutes: 5,
    airportTransfers: {
      HND: { mode: "리무진버스", minutes: 60, transfers: 0, costPerPersonKrw: 13_000 },
      NRT: { mode: "리무진버스", minutes: 100, transfers: 0, costPerPersonKrw: 33_000 }
    },
    notes: ["큰 역이라 출구가 복잡해요", "공항 리무진버스가 근처에 서요(예시)"]
  },
  {
    id: "demo-asakusa",
    name: "아사쿠사역 앞 호텔 (예시)",
    area: "아사쿠사",
    provider: "demo",
    dataMode: "mock",
    nightlyPriceKrw: 170_000,
    checkInTime: "15:00",
    frontDesk24h: true,
    elevator: true,
    stationWalkMinutes: 2,
    airportTransfers: {
      HND: { mode: "직통 전철", minutes: 45, transfers: 0, costPerPersonKrw: 6_000 },
      NRT: { mode: "직통 전철", minutes: 65, transfers: 0, costPerPersonKrw: 13_000 }
    },
    notes: ["센소지와 가까워요", "역 안에 계단 구간이 있을 수 있어요"]
  },
  {
    id: "demo-ueno",
    name: "우에노역 앞 비즈니스호텔 (예시)",
    area: "우에노",
    provider: "demo",
    dataMode: "mock",
    nightlyPriceKrw: 120_000,
    checkInTime: "15:00",
    frontDesk24h: false,
    elevator: true,
    stationWalkMinutes: 3,
    airportTransfers: {
      HND: { mode: "모노레일+JR", minutes: 50, transfers: 1, costPerPersonKrw: 6_500 },
      NRT: { mode: "공항 특급열차", minutes: 45, transfers: 0, costPerPersonKrw: 24_000 }
    },
    notes: ["객실이 작아요", "밤늦게는 프런트가 닫힐 수 있어요(예시)"]
  }
];

/** 지금은 일본만 예시 숙소가 있습니다. 다른 지역은 빈 목록 → 화면이 “준비 중”을 보여줍니다. */
export function demoHotelsFor(profile: Pick<TripProfile, "destination">): HotelOffer[] {
  return profileForDestination(profile.destination).id === "japan" ? TOKYO_DEMO_HOTELS.map((hotel) => ({ ...hotel })) : [];
}

function toMinutes(value: string | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`;
}

export type FatigueLevel = "낮음" | "보통" | "높음";
export type Fatigue = { score: number; level: FatigueLevel; reasons: string[] };

export const EARLY_DEPARTURE = "08:00";
export const LATE_ARRIVAL = "21:00";

/**
 * 이동 피로도(0–10). 비행시간·경유·이른 출발·늦은 도착·공항→숙소 이동·역 도보·엘리베이터를 봅니다.
 * 점수에 크게 기여한 이유부터 최대 3개를 돌려줍니다.
 */
export function fatigueFor(flight: FlightOffer, hotel: HotelOffer): Fatigue {
  const parts: Array<[number, string]> = [];
  if (flight.durationMinutes) parts.push([(flight.durationMinutes / 60) * 0.7, `비행 약 ${durationLabel(flight.durationMinutes)}`]);
  if (flight.stops > 0) parts.push([flight.stops * 1.5, `${flight.stops}회 경유`]);
  const depart = toMinutes(flight.departLocal);
  if (depart !== null && depart < (toMinutes(EARLY_DEPARTURE) as number)) parts.push([1.5, `이른 출발(${flight.departLocal}) · 새벽에 집을 나서야 해요`]);
  const arrive = toMinutes(flight.arriveLocal);
  if (arrive !== null && arrive >= (toMinutes(LATE_ARRIVAL) as number)) parts.push([1.5, `늦은 도착(${flight.arriveLocal})`]);
  const transfer = flight.arrivalAirport ? hotel.airportTransfers[flight.arrivalAirport] : undefined;
  if (transfer) parts.push([(transfer.minutes / 30) * 0.8 + transfer.transfers * 0.7, `공항→숙소 ${transfer.mode} 약 ${durationLabel(transfer.minutes)}${transfer.transfers ? ` · 환승 ${transfer.transfers}회` : ""}`]);
  if (hotel.stationWalkMinutes >= 8) parts.push([0.5, `역에서 숙소까지 도보 ${hotel.stationWalkMinutes}분`]);
  if (!hotel.elevator) parts.push([1, "엘리베이터 없음"]);
  const score = Math.min(10, Math.max(0, Math.round(parts.reduce((sum, [weight]) => sum + weight, 0) * 10) / 10));
  const level: FatigueLevel = score <= 3.5 ? "낮음" : score <= 5.5 ? "보통" : "높음";
  const reasons = [...parts].sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, reason]) => reason);
  return { score, level, reasons };
}

export type CostBreakdown = { flight: number; baggage: number; hotel: number; airportTransfer: number; total: number; nights: number; rooms: number; travelers: number };

/** 항공(수하물 포함)·숙박·공항 왕복 교통의 여행 전체 예상액. 날짜가 잘못됐으면 null. */
export function totalCostFor(flight: FlightOffer, hotel: HotelOffer, profile: TripProfile): CostBreakdown | null {
  const check = checkTripDates(profile);
  if (!check.ok) return null;
  const travelers = clampTravelers(profile.travelers);
  const nights = Math.max(1, check.days - 1);
  const rooms = Math.ceil(travelers / 2);
  const transfer = flight.arrivalAirport ? hotel.airportTransfers[flight.arrivalAirport] : undefined;
  const flightCost = flight.totalPrice * travelers;
  const baggage = (effectiveFlightPrice(flight) - flight.totalPrice) * travelers;
  const hotelCost = hotel.nightlyPriceKrw * nights * rooms;
  const airportTransfer = transfer ? transfer.costPerPersonKrw * travelers * 2 : 0;
  return { flight: flightCost, baggage, hotel: hotelCost, airportTransfer, total: flightCost + baggage + hotelCost + airportTransfer, nights, rooms, travelers };
}

/** 사용자가 확인해야 할 점. “보장” 대신 확인할 행동으로 씁니다. */
export function warningsFor(flight: FlightOffer, hotel: HotelOffer): string[] {
  const warnings: string[] = [];
  const transfer = flight.arrivalAirport ? hotel.airportTransfers[flight.arrivalAirport] : undefined;
  const arrive = toMinutes(flight.arriveLocal);
  const checkIn = toMinutes(hotel.checkInTime);
  if (arrive !== null && arrive >= (toMinutes(LATE_ARRIVAL) as number)) {
    warnings.push(hotel.frontDesk24h ? `늦은 도착 · 숙소에 도착 예정 시간을 미리 알려 두세요` : `늦은 도착 · 늦은 체크인이 되는지 숙소에 꼭 확인하세요(프런트가 닫힐 수 있어요)`);
  } else if (arrive !== null && checkIn !== null && arrive + (transfer?.minutes ?? 0) < checkIn) {
    warnings.push(`체크인(${hotel.checkInTime}) 전에 도착해요 · 짐을 먼저 맡길 수 있는지 확인하세요`);
  }
  if (flight.baggageIncluded === false) warnings.push("위탁 수하물이 포함되지 않은 운임이라 추가 요금을 더해 계산했어요");
  if (flight.arrivalAirport && !transfer) warnings.push(`${flight.arrivalAirport} 공항에서 숙소까지 이동 정보가 없어요`);
  return warnings;
}

export type Bundle = {
  id: string;
  flight: FlightOffer;
  hotel: HotelOffer;
  transfer: AirportTransfer | null;
  fatigue: Fatigue;
  cost: CostBreakdown;
  warnings: string[];
};

export function buildBundles(flights: FlightOffer[], hotels: HotelOffer[], profile: TripProfile): Bundle[] {
  return flights.flatMap((flight) =>
    hotels.flatMap((hotel) => {
      const cost = totalCostFor(flight, hotel, profile);
      if (!cost) return [];
      const transfer = flight.arrivalAirport ? hotel.airportTransfers[flight.arrivalAirport] ?? null : null;
      return [{ id: `${flight.id}+${hotel.id}`, flight, hotel, transfer, fatigue: fatigueFor(flight, hotel), cost, warnings: warningsFor(flight, hotel) }];
    })
  );
}

export type Priority = "comfort" | "balanced" | "budget";
export const PRIORITY_LABEL: Record<Priority, string> = { comfort: "편안함 우선", balanced: "균형", budget: "비용 우선" };
const WEIGHTS: Record<Priority, { fatigue: number; cost: number }> = {
  comfort: { fatigue: 1, cost: 0.1 },
  balanced: { fatigue: 0.6, cost: 0.6 },
  budget: { fatigue: 0.1, cost: 1 }
};

/** 피로도와 (0–10으로 맞춘) 총비용을 가중합해 낮은 순으로 정렬합니다. */
export function rankBundles(bundles: Bundle[], priority: Priority): Bundle[] {
  if (!bundles.length) return [];
  const totals = bundles.map((bundle) => bundle.cost.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const weight = WEIGHTS[priority];
  const score = (bundle: Bundle) => weight.fatigue * bundle.fatigue.score + weight.cost * (max > min ? ((bundle.cost.total - min) / (max - min)) * 10 : 0);
  return [...bundles].sort((a, b) => score(a) - score(b) || a.cost.total - b.cost.total);
}

export type PackageLabel = "편안한 이동" | "균형 추천" | "예산 절감";

/** a가 b보다 피로도도 높지 않고 비용도 높지 않으면(둘 다 같지는 않게) b는 고를 이유가 없습니다. */
function dominates(a: Bundle, b: Bundle) {
  return a.fatigue.score <= b.fatigue.score && a.cost.total <= b.cost.total && (a.fatigue.score < b.fatigue.score || a.cost.total < b.cost.total);
}

/**
 * 요청서 PL-04의 추천 패키지 3종. 같은 묶음이 겹치면 다음 순위를 쓰고,
 * 이미 고른 묶음보다 더 피곤하면서 더 비싼 묶음은 추천하지 않습니다.
 */
export function recommendedPackages(bundles: Bundle[]): Array<{ label: PackageLabel; bundle: Bundle }> {
  const picks: Array<{ label: PackageLabel; bundle: Bundle }> = [];
  const order: Array<[PackageLabel, Priority]> = [["편안한 이동", "comfort"], ["예산 절감", "budget"], ["균형 추천", "balanced"]];
  for (const [label, priority] of order) {
    const bundle = rankBundles(bundles, priority).find((candidate) => !picks.some((pick) => pick.bundle.id === candidate.id || dominates(pick.bundle, candidate)));
    if (bundle) picks.push({ label, bundle });
  }
  const rank: Record<PackageLabel, number> = { "편안한 이동": 0, "균형 추천": 1, "예산 절감": 2 };
  return picks.sort((a, b) => rank[a.label] - rank[b.label]);
}

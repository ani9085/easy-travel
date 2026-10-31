import { NextResponse } from "next/server";
import { accessCodeMatches, checkOrigin, clientKey, createRateLimiter } from "../../../../lib/server/aiGuard.ts";
import type { FlightOffer } from "../../../../lib/trip.ts";

export const runtime = "nodejs";
export const maxDuration = 25;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 항공 조회는 공급자 검색 한도·초과 요금이 있어 사람(IP)당 10분에 10번, 인스턴스 전체 60번까지만 받습니다.
const takeQuota = createRateLimiter({ windowMs: 10 * 60_000, maxPerClient: 10, maxTotal: 60 });

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function code(value: unknown) {
  return text(value).trim().toUpperCase();
}

function reject(error: string, status: number, codeValue: string) {
  return NextResponse.json({ error, code: codeValue, mode: "error" }, { status });
}

function allowedOrigins() {
  return (process.env.EASY_TRAVEL_APP_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
}

function mapOffer(value: unknown, fetchedAt: string): FlightOffer | null {
  const offer = object(value);
  if (!offer || typeof offer.id !== "string") return null;
  const amount = Number(offer.total_amount);
  const currency = code(offer.total_currency);
  if (!Number.isFinite(amount) || !currency) return null;
  const slices = Array.isArray(offer.slices) ? offer.slices : [];
  const segments = slices.flatMap((slice) => {
    const data = object(slice);
    return data && Array.isArray(data.segments) ? data.segments : [];
  }).map(object).filter((segment): segment is Record<string, unknown> => Boolean(segment));
  const first = segments[0];
  const last = segments[segments.length - 1];
  const firstOrigin = object(first?.origin);
  const lastDestination = object(last?.destination);
  const owner = object(offer.owner);
  const airlineNames = [text(owner?.name), ...segments.map((segment) => text(object(segment.operating_carrier)?.name) || text(object(segment.marketing_carrier)?.name))].filter(Boolean).filter((name, index, all) => all.indexOf(name) === index).slice(0, 4);
  const stops = slices.reduce((total, slice) => {
    const data = object(slice);
    return total + (Array.isArray(data?.segments) ? Math.max(0, data.segments.length - 1) : 0);
  }, 0);
  return {
    id: offer.id,
    provider: "duffel",
    dataMode: "live",
    fetchedAt,
    originLabel: code(firstOrigin?.iata_code) || text(firstOrigin?.name),
    destinationLabel: code(lastDestination?.iata_code) || text(lastDestination?.name),
    airlineNames: airlineNames.length ? airlineNames : ["항공사 정보 없음"],
    stops,
    totalPrice: amount,
    currency,
    arrivalAirport: code(lastDestination?.iata_code),
    departLocal: text(first?.departing_at),
    arriveLocal: text(last?.arriving_at),
    baggageIncluded: undefined
  };
}

export async function POST(request: Request) {
  const expectedCode = process.env.EASY_TRAVEL_ACCESS_CODE;
  const codeOk = accessCodeMatches(request.headers.get("x-easy-travel-code"), expectedCode);
  if (!codeOk) return reject("가족 접속 코드가 필요해요.", 401, "access_code_required");
  const originRejection = checkOrigin(request.headers, Boolean(expectedCode) && codeOk, allowedOrigins());
  if (originRejection) return reject(originRejection.error, originRejection.status, originRejection.code);

  const quota = takeQuota(clientKey(request.headers), 1, Date.now());
  if (!quota.ok) return NextResponse.json({ error: "항공 조회가 많아 잠시 쉬고 있어요. 조금 뒤에 다시 해 주세요.", code: "rate_limited", mode: "error" }, { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } });

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return reject("실제 항공 조회를 쓰려면 서버에 DUFFEL_ACCESS_TOKEN을 설정해 주세요.", 503, "flight_provider_not_configured");

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return reject("항공 조회 요청이 너무 커요.", 413, "body_too_large");
    body = JSON.parse(raw);
  } catch {
    return reject("항공 조회 요청 형식이 올바르지 않아요.", 400, "bad_request");
  }
  const data = object(body);
  const origin = code(data?.originIata);
  const destination = code(data?.destinationIata);
  const departureDate = text(data?.departureDate);
  const returnDate = text(data?.returnDate);
  const adults = typeof data?.adults === "number" && Number.isFinite(data.adults) ? Math.min(12, Math.max(1, Math.round(data.adults))) : 1;
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return reject("출발지와 목적지의 IATA 공항 코드 3글자를 확인해 주세요.", 400, "bad_airport_code");
  if (!DATE_PATTERN.test(departureDate) || !DATE_PATTERN.test(returnDate) || returnDate < departureDate) return reject("출발일과 귀국일을 확인해 주세요.", 400, "bad_dates");

  const passengers = Array.from({ length: adults }, () => ({ type: "adult" }));
  try {
    const upstream = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Duffel-Version": "v2"
      },
      body: JSON.stringify({ data: { slices: [{ origin, destination, departure_date: departureDate }, { origin: destination, destination: origin, departure_date: returnDate }], passengers, cabin_class: "economy" } })
    });
    if (!upstream.ok) return reject("항공 공급자가 조회에 실패했어요. 공항 코드와 날짜를 확인해 주세요.", 502, "flight_provider_error");
    const payload = object(await upstream.json());
    const payloadData = object(payload?.data);
    const rawOffers = Array.isArray(payloadData?.offers) ? payloadData.offers : Array.isArray(payload?.offers) ? payload.offers : [];
    const fetchedAt = new Date().toISOString();
    const offers = rawOffers.map((offer) => mapOffer(offer, fetchedAt)).filter((offer): offer is FlightOffer => Boolean(offer)).slice(0, 30);
    return NextResponse.json({ offers, fetchedAt, source: "duffel", dataMode: "live", limitations: ["가격과 좌석은 조회 시점의 공급자 결과입니다.", "예약은 항공사 또는 공식 예약 화면에서 직접 완료해야 합니다."] });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return reject(timedOut ? "항공 조회가 너무 오래 걸렸어요." : "항공 공급자에 연결하지 못했어요.", timedOut ? 504 : 502, timedOut ? "flight_provider_timeout" : "flight_provider_unreachable");
  }
}

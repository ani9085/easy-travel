"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Place = { id: number; day: number; name: string; note: string };
type Candidate = { key: number; name: string; day: number; selected: boolean; duplicate: boolean };
type PlanningForm = {
  destination: string;
  departure: string;
  startDate: string;
  endDate: string;
  flexibleDates: boolean;
  travelers: number;
  budget: string;
  preference: string;
};
type FlightCandidate = {
  id: string;
  airline: string;
  route: string;
  price: string;
  status: string;
  tone: "good" | "steady" | "watch";
  viewedAt: string;
};
type PlanningDay = { day: number; title: string; detail: string };
type PlanningSummary = {
  destination: string;
  period: string;
  travelers: number;
  dayCount: number;
  estimatedCost: number;
  days: PlanningDay[];
};
type PlanningSnapshot = {
  form: PlanningForm;
  flightCandidates: FlightCandidate[];
  summary: PlanningSummary;
  priceMonitoring: boolean;
  savedAt: string;
};

const PLANNING_STORAGE_KEY = "easy-travel-planning";
const DEMO_VIEWED_AT = "2026-10-24T09:30:00+09:00";
const DEFAULT_PLANNING: PlanningForm = {
  destination: "파리, 프랑스",
  departure: "인천국제공항 (ICN)",
  startDate: "2026-11-06",
  endDate: "2026-11-10",
  flexibleDates: false,
  travelers: 2,
  budget: "균형형",
  preference: "느긋한 일정"
};

const starterPlaces: Place[] = [
  { id: 1, day: 1, name: "에펠탑", note: "오후 3시 · 호텔에서 지하철 25분" },
  { id: 2, day: 2, name: "루브르 박물관", note: "오전 10시 · 예약 확인 필요" },
  { id: 3, day: 3, name: "몽마르트르", note: "오전 11시 · 걷는 양 보통" }
];

const phrases = [
  { ko: "화장실이 어디예요?", local: "Où sont les toilettes ?" },
  { ko: "이 주소로 가 주세요.", local: "À cette adresse, s'il vous plaît." },
  { ko: "천천히 말해 주세요.", local: "Parlez lentement, s'il vous plaît." },
  { ko: "도와주세요.", local: "Aidez-moi, s'il vous plaît." }
];

// ---------------------------------------------------------------------------
// Google Maps URLs — 이 블록에서만 지도 URL을 만듭니다.
// https://developers.google.com/maps/documentation/urls/get-started
// API 키 없이 Android/iOS/웹에서 Google Maps 앱 또는 브라우저를 엽니다.
// 앱 안에 지도·경로를 넣는 것은 Maps JavaScript/Routes API 키가 필요한 후속 범위입니다.
// ---------------------------------------------------------------------------
type TravelMode = "" | "walking" | "transit" | "driving";

const travelModes: Array<{ value: TravelMode; label: string }> = [
  { value: "", label: "이동수단 자동" },
  { value: "walking", label: "🚶 걸어서" },
  { value: "transit", label: "🚇 대중교통" },
  { value: "driving", label: "🚕 자동차·택시" }
];

function buildMapsUrl(path: "search" | "dir", params: Record<string, string | undefined>) {
  const query = Object.entries({ api: "1", ...params })
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `https://www.google.com/maps/${path}/?${query}`;
}

/** 장소·지역을 지도에서 검색합니다. 정확한 장소를 알면 Place ID를 함께 넘깁니다. */
function mapsSearchUrl(query: string, placeId?: string) {
  return buildMapsUrl("search", { query: query.trim(), query_place_id: placeId });
}

/** 현재 위치에서 목적지까지 길찾기를 엽니다. 이동수단을 비우면 Google Maps가 고릅니다. */
function mapsDirectionsUrl(destination: string, travelMode: TravelMode = "", placeId?: string) {
  return buildMapsUrl("dir", { destination: destination.trim(), destination_place_id: placeId, travelmode: travelMode || undefined });
}

function openMapsUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// 환율 — 데모 값 · 직접 입력 · ECB 기준환율(Frankfurter) · 마지막 조회값
// ECB 기준환율은 정보 제공용이며 거래용 보장값이 아닙니다.
// ---------------------------------------------------------------------------
const currencyRates: Record<string, { label: string; unit: string; defaultRate: number; ecb: boolean }> = {
  EUR: { label: "유로", unit: "€", defaultRate: 1550, ecb: true },
  USD: { label: "달러", unit: "$", defaultRate: 1400, ecb: true },
  JPY: { label: "엔", unit: "¥", defaultRate: 9.3, ecb: true },
  VND: { label: "동", unit: "₫", defaultRate: 0.055, ecb: false }
};

type KnownRate = { rate: number; refDate: string; fetchedAt: string };
type RateSource = { kind: "demo" } | { kind: "manual" } | ({ kind: "ecb" | "last-known" } & KnownRate);

const RATE_STORAGE_KEY = "easy-travel-rates";

const rateSourceLabel: Record<RateSource["kind"], string> = {
  demo: "데모 환율",
  manual: "직접 입력",
  ecb: "ECB 기준",
  "last-known": "마지막 조회값"
};

// ---------------------------------------------------------------------------
// 긴급전화 — 앱이 나라별 긴급번호를 정하지 않습니다. 가족이 확인해 넣은 번호만 씁니다.
// 전화는 항상 확인 단계를 거친 뒤에만 겁니다.
// 영사콜센터 번호 출처: 외교부 해외안전여행 https://0404.go.kr/
// ---------------------------------------------------------------------------
type CallTarget = { label: string; display: string; href: string };

const CONSULAR_CALL: CallTarget = { label: "외교부 영사콜센터", display: "+82-2-3210-0404", href: "tel:+82232100404" };

/** 입력한 현지 긴급번호를 tel: 링크로 바꿉니다. 숫자 2–15자리(앞의 + 허용)가 아니면 null입니다. */
function localEmergencyCall(value: string): CallTarget | null {
  const display = value.trim();
  const dial = display.replace(/[\s().-]/g, "");
  if (!/^\+?\d{2,15}$/.test(dial)) return null;
  return { label: "현지 긴급번호", display, href: `tel:${dial}` };
}

// 서버(app/api/ai/route.ts)의 MAX_IMAGE_CHARS와 같은 값입니다.
const MAX_IMAGE_CHARS = 4_000_000;
const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;
const MAX_CANDIDATES = 12;

function formatTime(value: string | null) {
  if (!value) return "아직 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function planningDateToUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function planningDays(form: PlanningForm) {
  if (form.flexibleDates || !form.startDate || !form.endDate) return 3;
  const difference = Math.round((planningDateToUtc(form.endDate) - planningDateToUtc(form.startDate)) / 86_400_000) + 1;
  return Math.min(30, Math.max(1, Number.isFinite(difference) ? difference : 3));
}

function planningDateLabel(value: string) {
  return value ? value.replaceAll("-", ".") : "날짜 미정";
}

function planningPeriodLabel(form: PlanningForm) {
  if (form.flexibleDates) return "날짜 유연 · 3일 일정";
  if (!form.startDate || !form.endDate) return "날짜 미정 · 3일 기준";
  return `${planningDateLabel(form.startDate)} ~ ${planningDateLabel(form.endDate)}`;
}

function buildDemoFlightCandidates(form: PlanningForm, viewedAt: string): FlightCandidate[] {
  const departure = form.departure.trim() || "출발 지역";
  const destination = form.destination.trim() || "여행지";
  const route = `${departure} → ${destination}`;
  return [
    { id: "demo-korean-air", airline: "대한항공", route: `${route} · 직항`, price: "₩1,248,000", status: "직항 선호", tone: "steady", viewedAt },
    { id: "demo-asiana", airline: "아시아나항공", route: `${route} · 1회 경유`, price: "₩1,106,000", status: "현재 후보 중 최저가", tone: "good", viewedAt },
    { id: "demo-air-france", airline: "에어프랑스", route: `${route} · 직항`, price: "₩1,390,000", status: "직항·조금 높음", tone: "watch", viewedAt }
  ];
}

function buildPlanningSummary(form: PlanningForm): PlanningSummary {
  const destination = form.destination.trim() || "여행지";
  const travelers = Math.max(1, form.travelers || 1);
  const days = planningDays(form);
  const lowerDestination = destination.toLowerCase();
  const isJapan = lowerDestination.includes("도쿄") || lowerDestination.includes("오사카") || lowerDestination.includes("일본");
  const isSoutheastAsia = lowerDestination.includes("방콕") || lowerDestination.includes("다낭") || lowerDestination.includes("베트남") || lowerDestination.includes("태국");
  const flightPerPerson = isJapan ? 650_000 : isSoutheastAsia ? 480_000 : 1_200_000;
  const dailyPerPerson = isJapan ? 130_000 : isSoutheastAsia ? 90_000 : 180_000;
  const budgetFactor = form.budget === "절약형" ? 0.82 : form.budget === "여유형" ? 1.25 : 1;
  const estimatedCost = Math.round(((flightPerPerson + dailyPerPerson * days) * travelers * budgetFactor) / 10_000) * 10_000;
  const focus = form.preference || "느긋한 일정";
  const previewDays = Math.min(days, 7);
  const dayTemplates = [
    ["도착하고 천천히 적응하기", `${destination} 중심 산책 · ${focus}`],
    ["대표 장소 한 곳 즐기기", `무리하지 않고 ${destination}의 대표 명소와 식사`],
    ["좋았던 곳 다시 보기", "아침 여유 · 기념품 · 귀가 준비"],
    ["동네처럼 하루 보내기", `${destination}의 시장·공원·카페를 천천히 둘러보기`],
    ["가족 취향에 맞춰 쉬기", "예약한 활동과 충분한 휴식 시간을 함께 배치하기"],
    ["남은 곳 한 곳 고르기", "날씨와 체력에 맞춰 가까운 장소를 선택하기"],
    ["귀국 준비하기", "짐 정리 · 공항 이동 · 마지막 식사"]
  ] as const;

  return {
    destination,
    period: planningPeriodLabel(form),
    travelers,
    dayCount: days,
    estimatedCost,
    days: Array.from({ length: previewDays }, (_, index) => ({
      day: index + 1,
      title: dayTemplates[index][0],
      detail: dayTemplates[index][1]
    }))
  };
}

function formatWon(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function getPosition(): Promise<string> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve("위치 확인 불가 (이 기기에서 위치 기능을 쓸 수 없어요)");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(`위치 ${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`),
      () => resolve("위치 확인 불가 (권한·신호 상태를 확인해 주세요)"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/** 사진을 긴 변 1280px JPEG로 줄입니다. 다시 그리면서 EXIF(촬영 위치 등) 정보도 빠집니다. */
function resizeImage(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error("canvas"));
        return;
      }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/** 붙여넣은 계획서에서 장소 후보를 뽑습니다. 등록은 사용자가 고른 뒤에만 합니다. */
function parseItinerary(text: string, existingNames: string[]) {
  const seen = existingNames.map((name) => name.trim().toLowerCase());
  const candidates: Candidate[] = [];
  let currentDay: number | undefined;
  let total = 0;
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const dayMatch = line.match(/^(?:day\s*(\d{1,2})|(\d{1,2})\s*일\s*차?)\s*[:.)·\-]?\s*/i);
    const day = dayMatch ? Number(dayMatch[1] || dayMatch[2]) : undefined;
    const name = (dayMatch ? line.slice(dayMatch[0].length) : line).replace(/^(?:[-*•]+|\d{1,2}[.)])\s*/, "").trim();
    if (day) currentDay = day;
    if (!name) return;
    total += 1;
    if (candidates.length >= MAX_CANDIDATES) return;
    const key = name.toLowerCase();
    const duplicate = seen.indexOf(key) !== -1;
    seen.push(key);
    candidates.push({
      key: Date.now() + candidates.length,
      name,
      day: Math.min(30, Math.max(1, day || currentDay || Math.floor(candidates.length / 2) + 1)),
      selected: !duplicate,
      duplicate
    });
  });
  return { candidates, skipped: Math.max(0, total - candidates.length) };
}

export default function Home() {
  const [destination, setDestination] = useState("파리, 프랑스");
  const [hotel, setHotel] = useState("Hôtel Mercure Paris Centre Tour Eiffel");
  const [familyCode, setFamilyCode] = useState("EASY-7J3K");
  const [places, setPlaces] = useState<Place[]>(starterPlaces);
  const [newPlace, setNewPlace] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode>("");
  const [itineraryText, setItineraryText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [skippedCandidates, setSkippedCandidates] = useState(0);
  const [saved, setSaved] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [sosMessage, setSosMessage] = useState("");
  const [sosBusy, setSosBusy] = useState(false);
  const [emergencyNumber, setEmergencyNumber] = useState("");
  const [pendingCall, setPendingCall] = useState<CallTarget | null>(null);
  const [callNotice, setCallNotice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState(String(currencyRates.EUR.defaultRate));
  const [rateSource, setRateSource] = useState<RateSource>({ kind: "demo" });
  const [knownRates, setKnownRates] = useState<Record<string, KnownRate>>({});
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMessage, setRateMessage] = useState("");
  const [translateText, setTranslateText] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationBusy, setTranslationBusy] = useState(false);
  const [photoData, setPhotoData] = useState("");
  const [photoResult, setPhotoResult] = useState("");
  const [photoMode, setPhotoMode] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [manualPlace, setManualPlace] = useState("");
  const [planning, setPlanning] = useState<PlanningForm>(DEFAULT_PLANNING);
  const [flightCandidates, setFlightCandidates] = useState<FlightCandidate[]>(() => buildDemoFlightCandidates(DEFAULT_PLANNING, DEMO_VIEWED_AT));
  const [planningSummary, setPlanningSummary] = useState<PlanningSummary>(() => buildPlanningSummary(DEFAULT_PLANNING));
  const [planningSaved, setPlanningSaved] = useState(false);
  const [planningNotice, setPlanningNotice] = useState("");
  const [priceMonitoring, setPriceMonitoring] = useState(false);
  const currencyRef = useRef(currency);

  useEffect(() => {
    const stored = window.localStorage.getItem("easy-travel-demo");
    if (stored) {
      try {
        const data = JSON.parse(stored) as { destination?: string; hotel?: string; familyCode?: string; places?: Place[]; lastCheckin?: string; emergencyNumber?: unknown };
        if (data.destination) setDestination(data.destination);
        if (data.hotel) setHotel(data.hotel);
        if (data.familyCode) setFamilyCode(data.familyCode);
        if (data.places?.length) setPlaces(data.places);
        if (data.lastCheckin) setLastCheckin(data.lastCheckin);
        if (typeof data.emergencyNumber === "string") setEmergencyNumber(data.emergencyNumber);
      } catch {
        // Demo storage may be cleared without affecting the app.
      }
    }
    try {
      const rates = JSON.parse(window.localStorage.getItem(RATE_STORAGE_KEY) || "{}") as Record<string, KnownRate>;
      setKnownRates(rates);
      const last = rates[currencyRef.current];
      if (last) {
        setRate(String(last.rate));
        setRateSource({ kind: "last-known", ...last });
      }
    } catch {
      // 저장된 환율이 깨져 있으면 데모 값으로 계속합니다.
    }
    try {
      const planningStored = window.localStorage.getItem(PLANNING_STORAGE_KEY);
      if (planningStored) {
        const data = JSON.parse(planningStored) as Partial<PlanningSnapshot> & { form?: Partial<PlanningForm> };
        const nextForm = { ...DEFAULT_PLANNING, ...data.form };
        setPlanning(nextForm);
        setFlightCandidates(data.flightCandidates?.length ? data.flightCandidates : buildDemoFlightCandidates(nextForm, DEMO_VIEWED_AT));
        setPlanningSummary(data.summary ? { ...buildPlanningSummary(nextForm), ...data.summary } : buildPlanningSummary(nextForm));
        const storedMonitoring = Boolean(data.priceMonitoring);
        setPriceMonitoring(storedMonitoring);
        if (storedMonitoring) setPlanningNotice("저장된 가격 모니터링 데모가 있어요. 실제 가격 조회·알림은 아직 연결되지 않았어요.");
      }
    } catch {
      // 저장된 계획이 깨져 있으면 기본 데모 계획으로 계속합니다.
    }
  }, []);

  const convertedAmount = useMemo(() => {
    const parsed = Number(amount) * Number(rate);
    return Number.isFinite(parsed) ? parsed.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "0";
  }, [amount, rate]);

  function persist(next?: Partial<{ destination: string; hotel: string; familyCode: string; places: Place[]; lastCheckin: string; emergencyNumber: string }>) {
    const current = { destination, hotel, familyCode, places, lastCheckin, emergencyNumber, ...next };
    window.localStorage.setItem("easy-travel-demo", JSON.stringify(current));
  }

  function updatePlanning(patch: Partial<PlanningForm>) {
    setPlanning((current) => ({ ...current, ...patch }));
    setPlanningNotice("");
  }

  function savePlanningSnapshot(overrides: Partial<Pick<PlanningSnapshot, "flightCandidates" | "summary" | "priceMonitoring">> = {}) {
    const snapshot: PlanningSnapshot = {
      form: planning,
      flightCandidates,
      summary: planningSummary,
      priceMonitoring,
      savedAt: new Date().toISOString(),
      ...overrides
    };
    window.localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(snapshot));
  }

  function savePlanning() {
    const nextSummary = buildPlanningSummary(planning);
    const nextCandidates = buildDemoFlightCandidates(planning, new Date().toISOString());
    setPlanningSummary(nextSummary);
    setFlightCandidates(nextCandidates);
    savePlanningSnapshot({ summary: nextSummary, flightCandidates: nextCandidates });
    if (planning.destination.trim()) {
      setDestination(planning.destination.trim());
      persist({ destination: planning.destination.trim() });
    }
    setPlanningSaved(true);
    setPlanningNotice("계획을 이 기기에 저장했어요.");
    window.setTimeout(() => setPlanningSaved(false), 2400);
  }

  function showFlightCandidates() {
    const nextCandidates = buildDemoFlightCandidates(planning, new Date().toISOString());
    setFlightCandidates(nextCandidates);
    setPlanningNotice("항공권 데모 후보를 준비했어요. 실제 조회나 예약으로 이어지지 않아요.");
  }

  function makeRecommendedPlan() {
    setPlanningSummary(buildPlanningSummary(planning));
    setPlanningNotice(`목적지와 기간을 바탕으로 ${planningDays(planning)}일 데모 일정을 만들었어요.`);
  }

  function togglePriceMonitoring() {
    const next = !priceMonitoring;
    const nextSummary = buildPlanningSummary(planning);
    const nextCandidates = buildDemoFlightCandidates(planning, new Date().toISOString());
    setPriceMonitoring(next);
    setPlanningSummary(nextSummary);
    setFlightCandidates(nextCandidates);
    savePlanningSnapshot({ summary: nextSummary, flightCandidates: nextCandidates, priceMonitoring: next });
    setPlanningNotice(next ? "가격 모니터링을 시작했어요. 실제 가격 조회·알림은 연결되지 않은 데모예요." : "가격 모니터링을 잠시 멈췄어요. 실제 알림은 아직 연결되지 않았어요.");
  }

  const localCall = localEmergencyCall(emergencyNumber);

  // 전화 버튼은 바로 걸지 않고 확인 단계를 띄웁니다. 번호가 없으면 설정으로 안내합니다.
  function requestCall(target: CallTarget | null) {
    if (!target) {
      setPendingCall(null);
      setCallNotice("현지 긴급번호가 아직 없어요. 위 '가족 여행 설정'에서 여행 국가의 긴급번호를 확인해 넣어 주세요.");
      document.getElementById("emergencyNumber")?.focus();
      return;
    }
    setCallNotice("");
    setPendingCall(target);
  }

  function saveTrip() {
    persist({ emergencyNumber });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  function addPlace(name = newPlace, note = "가족이 추가한 장소") {
    const value = name.trim();
    if (!value) return;
    const next = [...places, { id: Date.now(), day: Math.min(3, places.length + 1), name: value, note }];
    setPlaces(next);
    persist({ places: next });
  }

  function removePlace(id: number) {
    const next = places.filter((place) => place.id !== id);
    setPlaces(next);
    persist({ places: next });
  }

  function previewItinerary() {
    const { candidates: parsed, skipped } = parseItinerary(itineraryText, places.map((place) => place.name));
    setCandidates(parsed);
    setSkippedCandidates(skipped);
  }

  function updateCandidate(key: number, patch: Partial<Candidate>) {
    setCandidates((current) => current && current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function commitCandidates() {
    if (!candidates) return;
    const chosen = candidates.filter((item) => item.selected && item.name.trim());
    if (!chosen.length) return;
    const imported = chosen.map((item, index) => ({ id: Date.now() + index, day: item.day, name: item.name.trim(), note: "계획서에서 골라 등록한 장소 · 시간 확인 필요" }));
    const next = [...places, ...imported];
    setPlaces(next);
    persist({ places: next });
    setCandidates(null);
    setSkippedCandidates(0);
    setItineraryText("");
  }

  function changeCurrency(code: string) {
    currencyRef.current = code;
    setCurrency(code);
    setRateMessage("");
    const last = knownRates[code];
    if (last) {
      setRate(String(last.rate));
      setRateSource({ kind: "last-known", ...last });
    } else {
      setRate(String(currencyRates[code].defaultRate));
      setRateSource({ kind: "demo" });
    }
  }

  function editRate(value: string) {
    setRate(value);
    setRateSource({ kind: "manual" });
  }

  async function fetchReferenceRate() {
    const code = currency;
    if (!currencyRates[code].ecb) {
      setRateMessage(`${code}는 ECB 기준환율에 없는 통화예요. 환전소나 카드 앱에서 본 환율을 직접 입력해 주세요.`);
      return;
    }
    setRateBusy(true);
    setRateMessage("");
    try {
      const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${code}&symbols=KRW`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { date?: unknown; rates?: { KRW?: unknown } };
      const value = data.rates?.KRW;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || typeof data.date !== "string") throw new Error("shape");
      const entry: KnownRate = { rate: Number(value.toFixed(4)), refDate: data.date, fetchedAt: new Date().toISOString() };
      const nextRates = { ...knownRates, [code]: entry };
      setKnownRates(nextRates);
      window.localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(nextRates));
      if (currencyRef.current === code) {
        setRate(String(entry.rate));
        setRateSource({ kind: "ecb", ...entry });
      }
    } catch {
      const last = knownRates[code];
      if (currencyRef.current !== code) return;
      if (last && rateSource.kind !== "manual") {
        setRate(String(last.rate));
        setRateSource({ kind: "last-known", ...last });
        setRateMessage("기준 환율을 새로 불러오지 못해 마지막으로 받은 값으로 계산해요.");
      } else {
        setRateMessage(`기준 환율을 불러오지 못했어요. 지금 보이는 ${rateSourceLabel[rateSource.kind]} 값으로 계산해요.`);
      }
    } finally {
      setRateBusy(false);
    }
  }

  async function checkIn() {
    setCheckinBusy(true);
    const locationText = await getPosition();
    const now = new Date().toISOString();
    setLastCheckin(now);
    setCheckinMessage(`${locationText} · 이 기기에 안부를 기록했어요. 데모 버전이라 보호자에게 자동으로 전송되지는 않아요.`);
    persist({ lastCheckin: now });
    setCheckinBusy(false);
  }

  async function sendSos() {
    setSosBusy(true);
    const locationText = await getPosition();
    setSosMessage(`${formatTime(new Date().toISOString())} SOS 요청을 이 화면에 기록했어요 · ${locationText}. 데모 버전이라 보호자 푸시 알림은 연결되어 있지 않아요. 위급하면 아래 긴급전화로 바로 연락하세요.`);
    setSosBusy(false);
  }

  async function translate() {
    const value = translateText.trim();
    if (!value) return;
    setTranslationBusy(true);
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate", text: value, destination }) });
      const data = (await response.json()) as { result?: string; error?: string };
      setTranslation(data.result || data.error || "번역 결과를 받지 못했어요.");
    } catch {
      setTranslation("데모 모드: OpenRouter 키를 연결하면 자유 번역이 작동해요.");
    } finally {
      setTranslationBusy(false);
    }
  }

  function selectPhrase(phrase: (typeof phrases)[number]) {
    setTranslateText(phrase.ko);
    setTranslation(phrase.local);
  }

  function clearPhoto() {
    setPhotoData("");
    setPhotoResult("");
    setPhotoMode("");
    setPhotoError("");
  }

  // 사진을 고르면 미리보기만 합니다. 전송은 안내를 본 뒤 "AI로 분석하기"를 눌러야 합니다.
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearPhoto();
    if (!file.type.startsWith("image/")) {
      setPhotoError("사진 파일만 올릴 수 있어요. 아래에 장소 이름을 직접 입력해도 돼요.");
      return;
    }
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      setPhotoError("사진이 너무 커요(20MB 초과). 다른 사진을 고르거나 아래에 직접 입력해 주세요.");
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      if (dataUrl.length > MAX_IMAGE_CHARS) {
        setPhotoError("사진을 줄여도 너무 커요. 다른 사진을 고르거나 아래에 직접 입력해 주세요.");
        return;
      }
      setPhotoData(dataUrl);
    } catch {
      setPhotoError("이 사진 형식은 열 수 없어요. JPEG·PNG 사진으로 다시 시도하거나 아래에 직접 입력해 주세요.");
    }
  }

  async function analyzePhoto() {
    if (!photoData) return;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoResult("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "photo_location", image: photoData, destination }) });
      const data = (await response.json()) as { result?: string; error?: string; mode?: string };
      if (!response.ok || !data.result) {
        setPhotoError(`${data.error || "사진을 분석하지 못했어요."} 아래에 간판 글자나 장소 이름을 직접 입력해 주세요.`);
        return;
      }
      setPhotoResult(data.result);
      setPhotoMode(data.mode || "");
    } catch {
      setPhotoError("AI 연결에 실패했어요. 아래에 간판 글자나 장소 이름을 직접 입력해 주세요.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function copyFamilyLink() {
    const value = `${window.location.origin}/family/${familyCode}`;
    try {
      await navigator.clipboard.writeText(value);
      setLinkNotice("링크를 복사했어요. 가족 화면은 아직 준비 중이라 열리지 않을 수 있어요.");
      window.setTimeout(() => setLinkNotice(""), 4000);
    } catch {
      setLinkNotice("링크를 복사하지 못했어요. 이 브라우저에서는 복사가 막혀 있어요.");
    }
  }

  function submitNewPlace() {
    addPlace();
    setNewPlace("");
  }

  const travelModeSelect = (id: string) => (
    <select id={id} className="select inline-select" value={travelMode} onChange={(e) => setTravelMode(e.target.value as TravelMode)} aria-label="길찾기 이동수단">
      {travelModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
    </select>
  );

  const selectedCount = candidates ? candidates.filter((item) => item.selected && item.name.trim()).length : 0;
  const photoResultLabel = photoMode === "demo" ? "데모 결과 · 실제 분석 아님" : photoMode === "openrouter" ? "AI 추정 결과 · 틀릴 수 있어요" : "AI 연결 상태";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✈</div><div><strong>easy-travel</strong><span>부모님 여행 도우미</span></div></div>
        <nav className="nav" aria-label="주 메뉴">
          <a className="active" href="#today">오늘</a>
          <a href="#planning">여행 전 계획</a>
          <a href="#trip">여행 설정</a>
          <a href="#plan">내 여행</a>
          <a href="#tools">여행 도구</a>
          <a href="#safety">안심 확인</a>
        </nav>
        <div className="sidebar-note"><strong>데모 모드로 시작했어요</strong>OpenRouter·Upstash 키가 없어도 가족 여행 흐름을 먼저 체험할 수 있어요. 안부·SOS는 이 기기에만 기록되고 보호자에게 실제 알림이 가지 않아요.</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><div className="eyebrow">Family trip companion</div><h1>오늘도 편안한<br />여행 되세요.</h1><p className="lede">지금 필요한 것만 크게 보여드려요. 안부·SOS는 데모라 보호자에게 자동 전송되지 않아요.</p></div>
          <div className="top-actions"><a className="button secondary" href="#planning">여행 전 계획</a><button className="button secondary" onClick={copyFamilyLink}>가족 링크 복사</button><div className="avatar" aria-hidden="true">김</div>{linkNotice && <div className="notice" role="status">{linkNotice}</div>}</div>
        </div>

        <section id="today" className="grid hero-grid">
          <div className="card hero-card"><div className="hero-content"><div className="eyebrow">오늘 · {destination}</div><h2 className="hero-title">다음 일정</h2>{places[0] ? <><div className="hero-next">{places[0].name}</div><p className="hero-note">Day {places[0].day} · {places[0].note}</p></> : <p className="hero-note">아직 등록된 일정이 없어요. 아래 '내 여행'에서 장소를 추가해 주세요.</p>}<div className="hero-actions">{places[0] && <button className="button big light" onClick={() => openMapsUrl(mapsDirectionsUrl(places[0].name, travelMode))}>↗ {places[0].name} 길찾기</button>}<button className="button big outline" onClick={() => openMapsUrl(mapsDirectionsUrl(hotel, travelMode))}>🏨 호텔로 돌아가기</button></div><div className="hero-mode"><label htmlFor="travelModeQuick">이동수단</label>{travelModeSelect("travelModeQuick")}</div><div className="hero-meta"><span className="pill">📅 10월 18–22일</span><span className="pill">👨‍👩‍👧 가족 3명</span><span className="pill">데모 화면</span></div></div></div>
          <div className="card status-card"><div className="card-header"><div><h2>오늘의 상태</h2><p>이 기기에 기록된 요약이에요. 보호자 실시간 공유는 아직 연결 전이에요.</p></div><span className="pill">데모</span></div><div><div className="status-row"><div className="status-icon">📍</div><div><strong>마지막 안부</strong><span>{formatTime(lastCheckin)}</span></div></div><div className="status-row"><div className="status-icon">🧳</div><div><strong>다음 일정</strong><span>{places[0]?.name || "일정 없음"}</span></div></div><div className="status-row"><div className="status-icon">🔋</div><div><strong>휴대폰 상태</strong><span>배터리와 위치 권한을 확인해 주세요</span></div></div></div></div>
        </section>

        <section className="section"><div className="section-title"><div><h2>지금 필요한 기능</h2><p>누르면 바로 열리거나 해당 화면으로 이동해요.</p></div></div><div className="quick-grid">
          <button className="quick-button" onClick={() => openMapsUrl(mapsDirectionsUrl(hotel, travelMode))}><span className="emoji">🏨</span><strong>호텔로 돌아가기</strong><span>Google Maps 길찾기</span></button>
          <button className="quick-button" onClick={() => openMapsUrl(mapsSearchUrl(destination))}><span className="emoji">🗺️</span><strong>여행지 지도</strong><span>Google Maps에서 보기</span></button>
          <button className="quick-button" onClick={() => document.getElementById("translate")?.scrollIntoView()}><span className="emoji">🗣️</span><strong>통역하기</strong><span>문장·자주 쓰는 말</span></button>
          <button className="quick-button" onClick={() => document.getElementById("currency")?.scrollIntoView()}><span className="emoji">💱</span><strong>환전 계산</strong><span>현지 돈 ↔ 원화</span></button>
          <button className="quick-button" onClick={() => document.getElementById("checkin")?.scrollIntoView()}><span className="emoji">🟢</span><strong>안부 기록</strong><span>이 기기에만 기록</span></button>
          <button className="quick-button danger" onClick={() => document.getElementById("sos")?.scrollIntoView()}><span className="emoji">🆘</span><strong>SOS · 긴급전화</strong><span>도움 요청 화면으로</span></button>
        </div></section>

        <section id="planning" className="section planning-section">
          <div className="section-title">
            <div><div className="eyebrow">BEFORE THE TRIP</div><h2>여행 전 계획</h2><p>목적지와 기간을 넣으면 항공권·일정·예상 비용을 데모로 보여드려요.</p></div>
            <span className="pill">데모 · 실제 예약 아님</span>
          </div>
          <div className="planning-layout">
            <div className="card planning-form-card">
              <div className="card-header"><div><h3>먼저 여행 정보를 알려 주세요</h3><p>아직 정하지 않은 항목은 비워 두거나 유연하게 선택해도 괜찮아요.</p></div></div>
              <div className="form-row">
                <div className="field"><label htmlFor="planning-destination">목적지 (선택 입력)</label><input id="planning-destination" className="input" list="planning-destination-options" value={planning.destination} onChange={(e) => updatePlanning({ destination: e.target.value })} placeholder="예: 파리, 프랑스" /><datalist id="planning-destination-options"><option value="파리, 프랑스" /><option value="도쿄, 일본" /><option value="방콕, 태국" /><option value="다낭, 베트남" /></datalist></div>
                <div className="field"><label htmlFor="planning-departure">출발 공항·지역</label><input id="planning-departure" className="input" value={planning.departure} onChange={(e) => updatePlanning({ departure: e.target.value })} placeholder="예: 인천국제공항 (ICN)" /></div>
              </div>
              <div className="form-row">
                <div className="field"><label htmlFor="planning-start-date">출발일</label><input id="planning-start-date" className="input" type="date" value={planning.startDate} disabled={planning.flexibleDates} onChange={(e) => updatePlanning({ startDate: e.target.value })} /></div>
                <div className="field"><label htmlFor="planning-end-date">귀국일</label><input id="planning-end-date" className="input" type="date" value={planning.endDate} disabled={planning.flexibleDates} onChange={(e) => updatePlanning({ endDate: e.target.value })} /></div>
              </div>
              <label className="planning-check"><input type="checkbox" checked={planning.flexibleDates} onChange={(e) => updatePlanning({ flexibleDates: e.target.checked })} /><span>날짜가 아직 정해지지 않았어요 · 유연한 날짜로 보기</span></label>
              <div className="form-row">
                <div className="field"><label htmlFor="planning-travelers">여행 인원</label><input id="planning-travelers" className="input" type="number" min="1" max="12" value={planning.travelers} onChange={(e) => updatePlanning({ travelers: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} /></div>
                <div className="field"><label htmlFor="planning-budget">예산</label><select id="planning-budget" className="select" value={planning.budget} onChange={(e) => updatePlanning({ budget: e.target.value })}><option>절약형</option><option>균형형</option><option>여유형</option></select></div>
              </div>
              <div className="field"><label htmlFor="planning-preference">여행 선호</label><select id="planning-preference" className="select" value={planning.preference} onChange={(e) => updatePlanning({ preference: e.target.value })}><option>느긋한 일정</option><option>먹거리 중심</option><option>관광 중심</option><option>가족 휴식 중심</option></select></div>
              <div className="button-row planning-actions">
                <button className="button" type="button" onClick={showFlightCandidates}>항공권 후보 보기</button>
                <button className="button secondary" type="button" onClick={makeRecommendedPlan}>추천 일정 만들기</button>
                <button className={priceMonitoring ? "button green" : "button secondary"} type="button" onClick={togglePriceMonitoring} aria-pressed={priceMonitoring}>{priceMonitoring ? "가격 모니터링 중지" : "가격 모니터링 시작"}</button>
                <button className="button ghost" type="button" onClick={savePlanning}>계획 저장</button>
              </div>
              {planningNotice && <div className="notice" role="status">{planningNotice}</div>}
              {planningSaved && <div className="notice success" role="status">계획과 데모 결과를 이 기기에 저장했어요.</div>}
            </div>

            <div className="card planning-summary-card">
              <div className="card-header"><div><h3>{planningSummary.dayCount}일 추천 일정 요약</h3><p>목적지와 기간을 바탕으로 만든 참고용 데모예요.</p></div><span className="pill">{planningSummary.travelers}명 기준</span></div>
              <div className="planning-facts"><span>📍 {planningSummary.destination}</span><span>📅 {planningSummary.period}</span><span>💰 {planningSummary.estimatedCost.toLocaleString("ko-KR")}원 예상</span></div>
              <div className="planning-cost"><span>{planningSummary.dayCount}일 데모 예상 비용</span><strong>{formatWon(planningSummary.estimatedCost)}</strong><small>항공·숙박·현지 비용을 단순 가정한 참고용 금액이에요.</small></div>
              <div className="planning-days">{planningSummary.days.map((day) => <div className="planning-day" key={day.day}><div className="place-num">{day.day}</div><div><strong>{day.title}</strong><span>{day.detail}</span></div></div>)}</div>
              {planningSummary.dayCount > planningSummary.days.length && <div className="small planning-overflow">전체 {planningSummary.dayCount}일 중 앞 {planningSummary.days.length}일을 먼저 보여드려요.</div>}
            </div>
          </div>

          <div className="card planning-results">
            <div className="card-header"><div><h3>항공권 후보</h3><p>항공사·경로·왕복 가격을 한눈에 비교해요.</p></div><span className="pill">{flightCandidates.length}개 데모 후보</span></div>
            <div className="notice planning-disclaimer">실시간 예약/가격 보장 아님 · 실제 항공권 API나 스크래핑을 호출하지 않는 데모입니다.</div>
            <div className="flight-grid">{flightCandidates.map((candidate) => <article className="flight-card" key={candidate.id}><div className="flight-card-top"><strong>{candidate.airline}</strong><span className={`flight-status ${candidate.tone}`}>{candidate.status}</span></div><div className="flight-route">{candidate.route}</div><div className="flight-meta"><span>왕복 · 데모 후보</span><span>조회 {formatTime(candidate.viewedAt)}</span></div><div className="flight-price">{candidate.price}</div><button className="button secondary" type="button" onClick={() => setPlanningNotice(`${candidate.airline} 공식 예약 링크는 데모 자리예요. 외부 예약 페이지를 열지 않아요.`)}>공식 예약 링크</button></article>)}</div>
          </div>
        </section>

        <section id="trip" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>가족 여행 설정</h2><p>가족이 미리 넣어두면 부모님은 누르기만 하면 돼요.</p></div><span className="pill">공유 코드 {familyCode}</span></div><div className="form-row"><div className="field"><label htmlFor="destination">여행지</label><input id="destination" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} /></div><div className="field"><label htmlFor="hotel">호텔·숙소</label><input id="hotel" className="input" value={hotel} onChange={(e) => setHotel(e.target.value)} /></div></div><div className="field"><label htmlFor="familyCode">가족 코드</label><input id="familyCode" className="input" value={familyCode} onChange={(e) => setFamilyCode(e.target.value)} /></div><div className="field"><label htmlFor="emergencyNumber">현지 긴급번호</label><input id="emergencyNumber" className="input" type="tel" inputMode="tel" maxLength={20} value={emergencyNumber} onChange={(e) => { const value = e.target.value; setEmergencyNumber(value); persist({ emergencyNumber: value }); setCallNotice(""); setPendingCall(null); }} onBlur={(e) => persist({ emergencyNumber: e.currentTarget.value })} placeholder="예: 112 (유럽 공통)" /><span className="small">{emergencyNumber.trim() && !localCall ? "숫자로만 입력해 주세요 (예: 112, +33 1 23 45 67 89)." : "앱이 나라별 번호를 대신 정하지 않아요. 출발 전에 여행 국가의 긴급번호를 확인해 넣어 주세요. 이 기기에만 저장돼요."}</span></div><div className="button-row"><button className="button" onClick={saveTrip}>설정 저장</button><button className="button secondary" onClick={copyFamilyLink}>공유 링크 복사</button></div>{saved && <div className="notice success" role="status">이 기기에 저장했어요. 가족 화면 공유는 아직 연결 전이에요.</div>}{linkNotice && <div className="notice" role="status">{linkNotice}</div>}</div>
          <div className="card"><div className="card-header"><div><h2>여행 전 체크리스트</h2><p>예약번호나 여권 원본은 기본 저장하지 않아요.</p></div></div><div className="place-list"><div className="place-item"><div className="place-num">✓</div><div><strong>호텔 주소 등록</strong><span>{hotel}</span></div></div><div className="place-item"><div className="place-num">✓</div><div><strong>가족 공유 범위 확인</strong><span>공유 기능은 아직 데모 · 위치는 직접 누를 때만 기록</span></div></div><div className="place-item"><div className="place-num">{localCall ? "✓" : "3"}</div><div><strong>현지 긴급 연락처 확인</strong><span>{localCall ? `현지 긴급번호 ${localCall.display} · ` : "아직 현지 긴급번호가 없어요 · "}앱은 긴급 구조를 대신하지 않아요.</span></div></div></div></div>
        </section>

        <section id="plan" className="section grid two-grid">
          <div className="card">
            <div className="card-header"><div><h2>오늘의 일정</h2><p>↗는 Google Maps 길찾기, 🔍는 지도에서 장소 보기예요.</p></div><span className="pill">{places.length}곳</span></div>
            <div className="field"><label htmlFor="travelModePlan">길찾기 이동수단</label>{travelModeSelect("travelModePlan")}</div>
            <div className="place-list">{places.length ? places.map((place, index) => <div className="place-item" key={place.id}><div className="place-num">{index + 1}</div><div><strong>Day {place.day} · {place.name}</strong><span>{place.note}</span></div><div className="place-actions"><button className="icon-button" title="길찾기" aria-label={`${place.name} 길찾기`} onClick={() => openMapsUrl(mapsDirectionsUrl(place.name, travelMode))}>↗</button><button className="icon-button" title="지도에서 보기" aria-label={`${place.name} 지도에서 보기`} onClick={() => openMapsUrl(mapsSearchUrl(place.name))}>🔍</button><button className="icon-button" title="삭제" aria-label={`${place.name} 삭제`} onClick={() => removePlace(place.id)}>×</button></div></div>) : <div className="empty">아직 등록된 장소가 없어요.</div>}</div>
            <div className="button-row" style={{ marginTop: 12 }}><input className="input" aria-label="장소 직접 추가" placeholder="장소 직접 추가" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNewPlace()} /><button className="button" onClick={submitNewPlace}>추가</button></div>
          </div>
          <div className="card">
            <div className="card-header"><div><h2>여행계획서 가져오기</h2><p>텍스트를 붙여 넣으면 장소 후보를 먼저 보여주고, 고른 장소만 일정에 등록해요.</p></div><span className="pill">미리보기 후 등록</span></div>
            {candidates === null ? (
              <>
                <textarea className="textarea" aria-label="여행계획서 붙여넣기" placeholder={'예시\n1일차 에펠탑\n2일차 루브르 박물관\n3일차 몽마르트르'} value={itineraryText} onChange={(e) => setItineraryText(e.target.value)} />
                <div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={previewItinerary} disabled={!itineraryText.trim()}>장소 후보 미리보기</button><span className="small">이 단계에서는 일정에 추가되지 않아요</span></div>
              </>
            ) : (
              <>
                {candidates.length ? (
                  <div className="place-list">
                    {candidates.map((item) => (
                      <div className={`place-item candidate${item.selected ? "" : " unselected"}`} key={item.key}>
                        <input type="checkbox" className="check-input" checked={item.selected} onChange={(e) => updateCandidate(item.key, { selected: e.target.checked })} aria-label={`${item.name} 등록 선택`} />
                        <select className="select day-select" value={item.day} onChange={(e) => updateCandidate(item.key, { day: Number(e.target.value) })} aria-label={`${item.name} 날짜`}>
                          {Array.from({ length: Math.max(10, item.day) }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
                        </select>
                        <div className="candidate-name">
                          <input className="input" value={item.name} onChange={(e) => updateCandidate(item.key, { name: e.target.value })} aria-label="장소 이름" />
                          {item.duplicate && <span>이미 일정에 있거나 중복된 장소예요</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="empty">장소 후보를 찾지 못했어요. 한 줄에 장소 하나씩 적어 주세요.</div>}
                {skippedCandidates > 0 && <div className="notice">후보가 많아 처음 {MAX_CANDIDATES}곳만 보여줘요. 나머지 {skippedCandidates}곳은 등록 후 다시 붙여 넣어 주세요.</div>}
                <div className="notice">아직 일정에 등록되지 않았어요. 날짜와 이름을 확인하고 등록할 장소만 골라 주세요.</div>
                <div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={commitCandidates} disabled={!selectedCount}>선택한 {selectedCount}곳 일정에 등록</button><button className="button secondary" onClick={() => setCandidates(null)}>다시 입력</button></div>
              </>
            )}
          </div>
        </section>

        <section id="tools" className="section grid three-grid">
          <div id="currency" className="card">
            <div className="card-header"><div><h2>환전 계산</h2><p>기준 환율을 불러오거나 직접 수정할 수 있어요.</p></div><span className="pill">{rateSourceLabel[rateSource.kind]}</span></div>
            <div className="rate-box"><div className="field"><label htmlFor="currencySelect">현지 통화</label><select id="currencySelect" className="select" value={currency} onChange={(e) => changeCurrency(e.target.value)}>{Object.entries(currencyRates).map(([key, value]) => <option key={key} value={key}>{key} · {value.label}</option>)}</select></div><button className="swap" onClick={() => changeCurrency(currency === "EUR" ? "USD" : "EUR")} aria-label="통화 바꾸기">↔</button><div className="field"><label htmlFor="rate">1 {currency} = 원</label><input id="rate" className="input" value={rate} onChange={(e) => editRate(e.target.value)} inputMode="decimal" /></div></div>
            <div className="button-row" style={{ marginTop: 10 }}><button className="button secondary" onClick={fetchReferenceRate} disabled={rateBusy}>{rateBusy ? "불러오는 중…" : "ECB 기준 환율 불러오기"}</button></div>
            <div className="field" style={{ marginTop: 12 }}><label htmlFor="amount">현지 금액 ({currencyRates[currency].unit})</label><input id="amount" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
            <div className="rate-result">
              <span className="small">예상 원화</span><strong>₩ {convertedAmount}</strong>
              <div className="source-line">
                {rateSource.kind === "demo" && "출처: 앱에 넣어 둔 데모 값 · 실제 환율이 아니에요"}
                {rateSource.kind === "manual" && "출처: 직접 입력한 환율"}
                {(rateSource.kind === "ecb" || rateSource.kind === "last-known") && `출처: ECB 기준환율(Frankfurter 경유) · 기준일 ${rateSource.refDate} · 조회 ${formatTime(rateSource.fetchedAt)}${rateSource.kind === "last-known" ? " · 마지막 성공값이라 최신이 아닐 수 있어요" : ""}`}
              </div>
            </div>
            {rateMessage && <div className="notice">{rateMessage}</div>}
            <div className="notice">참고용 계산이에요. ECB 기준환율은 정보 제공용이며, 실제 환전소·카드 결제 환율과 수수료는 다를 수 있어요.</div>
          </div>
          <div id="translate" className="card"><div className="card-header"><div><h2>통역 도우미</h2><p>자주 쓰는 말을 크게 보여줘요.</p></div><span className="pill">AI 키 필요 · 없으면 데모</span></div><div className="phrase-list">{phrases.map((phrase) => <button className="phrase" key={phrase.ko} onClick={() => selectPhrase(phrase)}>{phrase.ko}</button>)}</div><div className="field" style={{ marginTop: 14 }}><label htmlFor="translateText">번역할 문장</label><textarea id="translateText" className="textarea" style={{ minHeight: 75 }} value={translateText} onChange={(e) => setTranslateText(e.target.value)} maxLength={1000} placeholder="번역할 문장을 입력하세요" /></div><button className="button" onClick={translate} disabled={translationBusy}>{translationBusy ? "번역 중…" : "번역하기"}</button>{translation && <div className="result-card"><span className="small">현지어 표시</span><strong>{translation}</strong></div>}</div>
          <div className="card">
            <div className="card-header"><div><h2>사진으로 장소 확인</h2><p>간판·건물을 보고 장소 후보를 알려줘요.</p></div><span className="pill">AI 선택 기능</span></div>
            <div className="photo-drop">{photoData ? <img src={photoData} alt="고른 여행 사진" style={{ maxWidth: "100%", maxHeight: 100, borderRadius: 10 }} /> : <div><div style={{ fontSize: 28 }}>📷</div><div className="muted">여행 사진을 골라 주세요 · 바로 보내지 않아요</div></div>}<input type="file" accept="image/*" onChange={handlePhoto} aria-label="여행 사진 고르기" /></div>
            {photoData && !photoResult && (
              <>
                <div className="notice">“AI로 분석하기”를 누르면 이 사진이 easy-travel 서버를 거쳐 외부 AI 서비스(OpenRouter)로 전송돼요. 사진은 긴 변 1280px로 줄이고 촬영 위치 정보(EXIF)를 지운 뒤 보내며, easy-travel은 사진을 저장하지 않아요. 얼굴이나 개인정보가 보이면 보내지 마세요.</div>
                <div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={analyzePhoto} disabled={photoBusy}>{photoBusy ? "사진을 살펴보는 중…" : "AI로 분석하기"}</button><button className="button secondary" onClick={clearPhoto} disabled={photoBusy}>사진 지우기</button></div>
              </>
            )}
            {photoError && <div className="notice">{photoError}</div>}
            {photoResult && <div className="result-card"><span className="small">{photoResultLabel}</span><strong>{photoResult}</strong><div><button className="button ghost" onClick={clearPhoto}>사진 지우기</button></div></div>}
            <div className="field" style={{ marginTop: 12 }}><label htmlFor="manualPlace">직접 입력 · 간판 글자나 장소 이름</label><input id="manualPlace" className="input" value={manualPlace} onChange={(e) => setManualPlace(e.target.value)} placeholder="예: Café de Flore" /></div>
            <div className="button-row"><button className="button secondary" onClick={() => openMapsUrl(mapsSearchUrl(manualPlace))} disabled={!manualPlace.trim()}>지도에서 찾기</button><button className="button secondary" onClick={() => { addPlace(manualPlace, "사진·직접 입력으로 찾은 장소 · 확인 필요"); setManualPlace(""); }} disabled={!manualPlace.trim()}>일정에 추가</button></div>
          </div>
        </section>

        <section id="safety" className="section grid two-grid">
          <div id="checkin" className="card"><div className="card-header"><div><h2>오늘의 안부</h2><p>부모님이 직접 누른 순간의 시간과 위치를 기록해요.</p></div><span className="pill">수동 · 데모</span></div><div className="checkin"><div className="checkin-icon">🟢</div><div><strong>{lastCheckin ? "마지막 안부가 기록됐어요" : "아직 오늘 안부가 없어요"}</strong><span>{formatTime(lastCheckin)}</span></div><button className="button green" onClick={checkIn} disabled={checkinBusy}>{checkinBusy ? "위치 확인 중…" : "안부 기록하기"}</button></div>{checkinMessage && <div className="notice success" role="status">{checkinMessage}</div>}<div className="notice">직접 누른 시각과 위치를 이 기기에 기록하는 기능이에요. 보호자에게 전달되지 않고, 자동·주기적 위치 추적이나 안전을 보장하지 않아요. 위치 권한·배터리·통신 상태에 따라 위치가 빠질 수 있어요.</div></div>
          <div id="sos" className="card safety-card"><div className="card-header"><div><h2>SOS / 도움 요청</h2><p>도움이 필요할 때 상황을 기록하고 긴급전화로 연결해요.</p></div><span className="pill">데모 · 알림 미연결</span></div><div className="sos-row"><div><strong>긴급 상황인가요?</strong><p className="muted">먼저 아래 긴급전화로 연락하세요. SOS 버튼은 현재 위치를 확인해 이 화면에 기록만 하며, 보호자에게 실제 알림은 아직 가지 않아요.</p></div><button className="button danger" onClick={sendSos} disabled={sosBusy}>{sosBusy ? "위치 확인 중…" : "SOS 기록 (데모)"}</button></div>{sosMessage && <div className="notice" role="status">{sosMessage}</div>}
            <div className="button-row" style={{ marginTop: 13 }}><button className="button secondary" onClick={() => requestCall(localCall)}>{localCall ? `현지 긴급전화 ${localCall.display}` : "현지 긴급전화 · 번호 미설정"}</button><button className="button secondary" onClick={() => requestCall(CONSULAR_CALL)}>영사콜센터 {CONSULAR_CALL.display}</button></div>
            {callNotice && <div className="notice">{callNotice}</div>}
            {pendingCall && (
              <div className="notice call-confirm" aria-live="polite">
                <strong>{pendingCall.label} {pendingCall.display}(으)로 전화를 걸까요?</strong>
                <span>{pendingCall === CONSULAR_CALL ? "해외에서 거는 한국 번호라 국제전화·로밍 요금이 나올 수 있어요. 출처: 외교부 해외안전여행(0404.go.kr)." : "가족이 설정에 넣은 번호예요. 앱이 맞는 번호인지 확인하지 않아요."} 전화 앱이 없는 기기에서는 이 번호를 직접 눌러 주세요.</span>
                <div className="button-row"><a className="button danger" href={pendingCall.href}>전화 걸기</a><button className="button secondary" onClick={() => setPendingCall(null)}>취소</button></div>
              </div>
            )}
          </div>
        </section>

        <div className="footer">easy-travel MVP · 가격·위치·번역 결과는 참고용이며, 예약·긴급 대응을 대신하지 않습니다.</div>
      </main>
      <a className="sos-fab" href="#sos" aria-label="SOS·긴급전화 화면으로 이동">🆘 SOS</a>
    </div>
  );
}

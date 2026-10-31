"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlanRecommendations } from "../../components/PlanRecommendations.tsx";
import { LocalTime, useHashView, useHydrated, useTrip } from "../../components/hooks.tsx";
import { ACCESS_CODE_STORAGE_KEY, formatWon, localEmergencyCall, mapsDirectionsUrl, mapsSearchUrl, openMapsUrl, readAccessCode } from "../../components/shared.ts";
import { profileForDestination } from "../../lib/destinations.ts";
import {
  BUDGET_STYLES,
  MAX_TRAVELERS,
  TRAVEL_PREFERENCES,
  checkTripDates,
  effectiveFlightPrice,
  nextItineraryItem,
  offerBadge,
  offersAreStale,
  periodLabel,
  tripTimeline,
  type BudgetStyle,
  type FlightOffer,
  type ItineraryItem,
  type ItineraryStatus,
  type TravelPreference,
  type TripProfile
} from "../../lib/trip.ts";
import type { SuggestedDay } from "../../lib/tripPlan.ts";

type Candidate = { key: number; name: string; day: number; selected: boolean; duplicate: boolean };
const MAX_CANDIDATES = 12;
const VIEWS = ["status", "planning", "flights", "recommendations", "plan", "settings"] as const;
type View = (typeof VIEWS)[number];
const MENU: Array<{ id: View; label: string }> = [
  { id: "status", label: "여행 현황" },
  { id: "planning", label: "여행 계획" },
  { id: "flights", label: "항공 가격" },
  { id: "recommendations", label: "일정·숙소 추천" },
  { id: "plan", label: "확정 일정" },
  { id: "settings", label: "여행 설정" }
];

const STATUS_LABEL: Record<ItineraryStatus, string> = { planned: "예정", in_progress: "가는 중", arrived: "도착", completed: "다 봤어요", skipped: "건너뜀", delayed: "늦어짐" };

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
    candidates.push({ key: Date.now() + candidates.length, name, day: Math.min(30, Math.max(1, day || currentDay || Math.floor(candidates.length / 2) + 1)), selected: !duplicate, duplicate });
  });
  return { candidates, skipped: Math.max(0, total - candidates.length) };
}

function formatOfferPrice(offer: FlightOffer) {
  const price = effectiveFlightPrice(offer);
  if (offer.currency === "KRW") return formatWon(price);
  return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${offer.currency}`;
}

export default function GuardianPage() {
  const hydrated = useHydrated();
  const { trip, updateTrip, updateProfile, migrated, storageBlocked } = useTrip();
  const [view, go] = useHashView(VIEWS);
  const [planningNotice, setPlanningNotice] = useState("");
  const [tripNotice, setTripNotice] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [newPlaceDay, setNewPlaceDay] = useState(1);
  const [itineraryText, setItineraryText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [watchPrice, setWatchPrice] = useState("");
  const [flightSearchBusy, setFlightSearchBusy] = useState(false);
  const [flightSearchNotice, setFlightSearchNotice] = useState("");

  // localStorage는 브라우저에서만 읽을 수 있습니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽습니다.
  useEffect(() => setAccessCode(readAccessCode()), []);
  useEffect(() => {
    // 저장된 여행이 마운트 후 복원될 때 입력값을 채웁니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원 값과 화면 입력을 동기화합니다.
    if (trip.priceWatch.targetPrice) setWatchPrice(String(trip.priceWatch.targetPrice));
  }, [trip.priceWatch.targetPrice]);

  const activeView: View = view || "status";
  const profile = trip.profile;
  const destination = profile.destination.trim() || "아직 정하지 않은 여행";
  const place = useMemo(() => profileForDestination(profile.destination), [profile.destination]);
  const dateCheck = checkTripDates(profile);
  const timeline = hydrated ? tripTimeline(profile, new Date(), place.timeZone) : null;
  const nextItem = nextItineraryItem(trip.itinerary, timeline);
  const itinerary = useMemo(() => [...trip.itinerary].sort((a, b) => a.day - b.day), [trip.itinerary]);
  const stale = offersAreStale(trip.flightOffers, profile);
  const maxDay = Math.max(1, dateCheck.ok ? dateCheck.days : 1, ...trip.itinerary.map((item) => item.day));
  const localCall = localEmergencyCall(profile.emergencyNumber);
  const done = trip.itinerary.filter((item) => item.status === "completed" || item.status === "skipped").length;
  const events = [...trip.journal.events].reverse().slice(0, 8);
  const statusRecords = trip.itinerary.filter((item) => item.statusAt).sort((a, b) => (b.statusAt || "").localeCompare(a.statusAt || "")).slice(0, 8);
  const stage = !timeline ? "" : !dateCheck.ok ? "날짜 확인 필요" : timeline.stage === "before" ? `출발까지 ${timeline.daysUntil}일` : timeline.stage === "during" ? `여행 ${timeline.day}일째` : timeline.stage === "after" ? "귀국 후" : "날짜 미정";

  function changeProfile(patch: Partial<TripProfile>) {
    const cleared = updateProfile(patch);
    if (cleared) setTripNotice("이전 데모 장소·숙소를 비웠어요. 새 여행지의 숙소와 장소를 넣어 주세요.");
  }

  function changePlanning(patch: Partial<TripProfile>) {
    changeProfile(patch);
    setPlanningNotice("");
  }

  function requireValidDates() {
    if (dateCheck.ok) return true;
    go("planning");
    return false;
  }

  function savePriceWatch() {
    const target = Number(watchPrice.replaceAll(",", ""));
    if (!Number.isFinite(target) || target <= 0) {
      updateTrip((current) => ({ ...current, priceWatch: { ...current.priceWatch, mode: "off", targetPrice: null, updatedAt: new Date().toISOString() } }));
      setPlanningNotice("목표 금액을 넣으면 가격 확인 조건을 저장할 수 있어요.");
      return;
    }
    updateTrip((current) => ({ ...current, priceWatch: { ...current.priceWatch, mode: "configured", targetPrice: Math.round(target), checkTimes: ["08:00", "20:00"], checksPerDay: 2, updatedAt: new Date().toISOString() } }));
    setPlanningNotice("목표 금액과 하루 2회 확인 시간을 저장했어요. APK에서는 Android 백그라운드 작업이 이 조건으로 알림을 보냅니다.");
  }

  function updateAccessCode(value: string) {
    setAccessCode(value);
    try {
      window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, value.trim());
    } catch {
      // 저장이 막힌 브라우저에서는 이번 방문 동안만 씁니다.
    }
  }

  async function searchFlights() {
    if (!requireValidDates()) return;
    setFlightSearchBusy(true);
    setFlightSearchNotice("");
    try {
      const response = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessCode ? { "x-easy-travel-code": accessCode } : {}) },
        body: JSON.stringify({ originIata: profile.originIata, destinationIata: profile.destinationIata, departureDate: profile.startDate, returnDate: profile.endDate, adults: profile.travelers })
      });
      const data = await response.json() as { offers?: FlightOffer[]; error?: string };
      if (!response.ok) throw new Error(data.error || "항공권을 조회하지 못했어요.");
      updateTrip((current) => ({ ...current, state: "comparing", flightOffers: data.offers || [], flightSelection: null }));
      setFlightSearchNotice(data.offers?.length ? `${data.offers.length}개 실제 조회 결과를 불러왔어요. 가격과 좌석은 조회 시점 기준입니다.` : "공급자가 반환한 항공권이 없어요.");
    } catch (error) {
      setFlightSearchNotice(error instanceof Error ? error.message : "항공권을 조회하지 못했어요.");
    } finally {
      setFlightSearchBusy(false);
    }
  }

  function selectFlight(id: string) {
    updateTrip((current) => ({ ...current, flightSelection: { offerId: id, status: "selected", updatedAt: new Date().toISOString() } }));
    setFlightSearchNotice("항공권을 선택했어요. 공식 예약 화면에서 예약한 뒤 예약 완료로 표시해 주세요.");
  }

  function markBooked() {
    if (!trip.flightSelection) return;
    updateTrip((current) => ({ ...current, state: "booked", flightSelection: { ...current.flightSelection!, status: "booked", updatedAt: new Date().toISOString() } }));
    setFlightSearchNotice("예약 완료 상태를 기록했어요. 앱이 항공권을 대신 결제하거나 예약한 것은 아닙니다.");
    go("recommendations");
  }

  function markManualBooked() {
    updateTrip((current) => ({ ...current, state: "booked", flightSelection: { offerId: "manual-booking", status: "booked", updatedAt: new Date().toISOString() } }));
    setFlightSearchNotice("외부에서 예약한 항공권이 있다고 기록했어요. 실제 예약 여부는 앱이 확인하지 않습니다.");
    go("recommendations");
  }

  function addPlace(name: string, day: number, note = "가족이 추가한 장소", source: ItineraryItem["source"] = "user") {
    const value = name.trim();
    if (!value) return;
    const item: ItineraryItem = { id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, day, name: value, note, status: "planned", statusAt: null, source };
    updateTrip((current) => ({ ...current, itinerary: [...current.itinerary, item], state: "planned" }));
  }

  function removePlace(id: string) {
    updateTrip((current) => ({ ...current, itinerary: current.itinerary.filter((item) => item.id !== id) }));
  }

  function confirmRecommendation(days: SuggestedDay[]) {
    const stamp = Date.now();
    const items = days.flatMap((day) => day.places.map((name, index) => ({ id: `ai-${stamp}-${day.day}-${index}`, day: day.day, name: name.trim(), note: `${day.title}${day.note ? ` · ${day.note}` : ""} · AI 초안에서 확정`, status: "planned" as const, statusAt: null, source: "user" as const }))).filter((item) => item.name);
    updateTrip((current) => ({ ...current, state: "planned", itinerary: [...current.itinerary, ...items] }));
  }

  function commitCandidates() {
    if (!candidates) return;
    const stamp = Date.now();
    const chosen: ItineraryItem[] = candidates.filter((item) => item.selected && item.name.trim()).map((item, index) => ({ id: `import-${stamp}-${index}`, day: item.day, name: item.name.trim(), note: "계획서에서 골라 등록한 장소 · 시간 확인 필요", status: "planned", statusAt: null, source: "import" }));
    if (!chosen.length) return;
    updateTrip((current) => ({ ...current, state: "planned", itinerary: [...current.itinerary, ...chosen] }));
    setCandidates(null);
    setSkipped(0);
    setItineraryText("");
  }

  const selectedCount = candidates ? candidates.filter((item) => item.selected && item.name.trim()).length : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✈</div><div><strong>easy-travel</strong><span>함께 계획하는 보호자 화면</span></div></div>
        <nav className="nav" aria-label="보호자 메뉴">
          {MENU.map((item) => <a key={item.id} href={`#${item.id}`} aria-current={activeView === item.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); go(item.id); }}>{item.label}</a>)}
          <Link href="/traveler">부모님 화면</Link>
        </nav>
        <div className="sidebar-note"><strong>부모님도 함께 계획할 수 있어요.</strong> 같은 여행 데이터가 이 기기와 부모님 화면에 저장됩니다. 가족 공유 서버는 아직 연결 전입니다.</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><div className="eyebrow">Guardian · {MENU.find((item) => item.id === activeView)?.label}</div><h1>부모님 여행을<br />함께 준비해요.</h1><p className="lede">계획을 저장하고, 실제 조회 결과와 AI 초안을 확인한 뒤 가족이 함께 확정합니다.</p></div>
          <div className="top-actions"><Link className="button" href="/traveler">부모님 화면 열기</Link><button type="button" className="button secondary" onClick={() => setShareNotice("가족 공유는 준비 중이에요. 지금은 이 기기에만 저장되고, 다른 가족 기기에서는 볼 수 없어요.")}>가족 공유 안내</button>{shareNotice && <div className="notice" role="status">{shareNotice}</div>}</div>
        </div>

        {activeView === "status" && <section id="status" className="grid hero-grid">
          <div className="card hero-card"><div className="hero-content"><div className="eyebrow">{destination}{stage && ` · ${stage}`}</div><h2 className="hero-title">부모님의 다음 일정</h2>{nextItem ? <><div className="hero-next">{nextItem.name}</div><p className="hero-note">Day {nextItem.day} · {STATUS_LABEL[nextItem.status]}{nextItem.statusAt ? " · 기록 있음" : ""}</p></> : <p className="hero-note">아직 확정된 일정이 없어요. 여행 계획부터 시작해 주세요.</p>}<div className="hero-meta"><span className="pill">📅 {periodLabel(profile)}</span><span className="pill">👨‍👩‍👧 {profile.travelers}명</span><span className="pill">진행 {done}/{trip.itinerary.length}</span>{!place.timeZone && <span className="pill">기기 시간 기준</span>}</div></div></div>
          <div className="card status-card"><div className="card-header"><div><h2>최근 기록</h2><p>부모님이 이 기기에서 직접 누른 기록이에요. 기록이 없다고 위험하다는 뜻은 아니에요.</p></div></div>{events.length || statusRecords.length ? <div className="place-list">{events.map((event) => <div className="place-item" key={event.id}><div className="place-num">{event.type === "hotel_arrival" ? "🛎️" : "🟢"}</div><div><strong>{event.type === "hotel_arrival" ? "숙소 도착을 직접 알림" : "안부 기록"}</strong><span><LocalTime value={event.at} /> · {event.location ? `위치 기록(오차 약 ${event.location.accuracy}m)` : "위치 미제공"} · {event.shareOpened ? "가족 공유 창 열림" : "공유 안 함"}</span></div></div>)}{statusRecords.map((item) => <div className="place-item" key={`s-${item.id}`}><div className="place-num">✓</div><div><strong>{item.name} · {STATUS_LABEL[item.status]}</strong><span><LocalTime value={item.statusAt} /></span></div></div>)}</div> : <div className="empty">아직 기록이 없어요(확인 불가).</div>}{storageBlocked && <div className="notice">이 브라우저에서는 저장이 막혀 있어요(사생활 보호 모드 등).</div>}{migrated && <div className="notice">이전 데모 데이터는 실제 계획에 섞이지 않도록 정리했어요.</div>}</div>
        </section>}

        {activeView === "planning" && <section id="planning" className="section">
          <div className="section-title"><div><div className="eyebrow">BEFORE THE TRIP</div><h2>여행 계획</h2><p>부모님과 보호자 누구나 목적지·기간·취향을 입력할 수 있어요. 입력할 때마다 이 기기에 저장됩니다.</p></div><span className="pill">빈 계획에서 시작</span></div>
          <div className="card planning-form-card">
            <div className="form-row"><div className="field"><label htmlFor="planning-destination">목적지</label><input id="planning-destination" className="input" list="planning-destination-options" value={profile.destination} onChange={(e) => changePlanning({ destination: e.target.value })} placeholder="예: 도쿄, 일본" /><datalist id="planning-destination-options"><option value="도쿄, 일본" /><option value="오사카, 일본" /><option value="후쿠오카, 일본" /><option value="파리, 프랑스" /><option value="방콕, 태국" /><option value="다낭, 베트남" /></datalist></div><div className="field"><label htmlFor="planning-departure">출발 공항·지역</label><input id="planning-departure" className="input" value={profile.departure} onChange={(e) => changePlanning({ departure: e.target.value })} placeholder="예: 인천국제공항" /></div></div>
            <div className="form-row"><div className="field"><label htmlFor="planning-origin-iata">출발 공항 코드</label><input id="planning-origin-iata" className="input" maxLength={3} value={profile.originIata} onChange={(e) => changePlanning({ originIata: e.target.value.toUpperCase() })} placeholder="ICN" /></div><div className="field"><label htmlFor="planning-destination-iata">도착 공항 코드</label><input id="planning-destination-iata" className="input" maxLength={3} value={profile.destinationIata} onChange={(e) => changePlanning({ destinationIata: e.target.value.toUpperCase() })} placeholder="NRT" /></div></div>
            <div className="form-row"><div className="field"><label htmlFor="planning-start-date">출발일</label><input id="planning-start-date" className="input" type="date" value={profile.startDate} disabled={profile.flexibleDates} aria-invalid={!dateCheck.ok} onChange={(e) => changePlanning({ startDate: e.target.value })} /></div><div className="field"><label htmlFor="planning-end-date">귀국일</label><input id="planning-end-date" className="input" type="date" value={profile.endDate} min={profile.startDate || undefined} disabled={profile.flexibleDates} aria-invalid={!dateCheck.ok} onChange={(e) => changePlanning({ endDate: e.target.value })} /></div></div>
            {!dateCheck.ok && <div className="notice danger-notice" role="alert">{dateCheck.message}</div>}
            <label className="planning-check"><input type="checkbox" checked={profile.flexibleDates} onChange={(e) => changePlanning({ flexibleDates: e.target.checked })} /><span>날짜가 아직 정해지지 않았어요 · 유연한 날짜로 보기</span></label>
            <div className="form-row"><div className="field"><label htmlFor="planning-travelers">여행 인원</label><input id="planning-travelers" className="input" type="number" min="1" max={MAX_TRAVELERS} value={profile.travelers} onChange={(e) => changePlanning({ travelers: Number(e.target.value) || 1 })} /></div><div className="field"><label htmlFor="planning-budget">예산</label><select id="planning-budget" className="select" value={profile.budget} onChange={(e) => changePlanning({ budget: e.target.value as BudgetStyle })}>{BUDGET_STYLES.map((style) => <option key={style}>{style}</option>)}</select></div></div>
            <div className="field"><label htmlFor="planning-preference">여행 선호</label><select id="planning-preference" className="select" value={profile.preference} onChange={(e) => changePlanning({ preference: e.target.value as TravelPreference })}>{TRAVEL_PREFERENCES.map((preference) => <option key={preference}>{preference}</option>)}</select></div>
            <div className="notice">현재 계획: {profile.destination.trim() || "목적지 미정"} · {dateCheck.ok ? periodLabel(profile) : "날짜 확인 필요"} · {profile.travelers}명. 비용은 실제 항공·숙소 조회 후에만 계산합니다.</div>
            <div className="button-row planning-actions"><button className="button" type="button" onClick={() => go("flights")}>항공권 찾기</button><button className="button secondary" type="button" onClick={() => go("recommendations")}>일정·숙소 추천 메뉴</button></div>
          </div>
          <div className="card planning-results"><div className="card-header"><div><h3>항공 가격 감시</h3><p>목표 금액을 정하면 APK가 하루 두 번 확인하도록 설정합니다.</p></div><span className="pill">08:00 · 20:00</span></div><div className="form-row"><div className="field"><label htmlFor="watch-price">1인 목표 왕복 금액</label><input id="watch-price" className="input" inputMode="numeric" value={watchPrice} onChange={(e) => setWatchPrice(e.target.value)} placeholder="예: 450000" /></div><div className="field"><label>현재 상태</label><div className="notice">{trip.priceWatch.mode === "configured" ? `₩${(trip.priceWatch.targetPrice || 0).toLocaleString("ko-KR")} 목표로 설정됨` : "아직 설정하지 않음"}</div></div></div><div className="button-row"><button type="button" className="button" onClick={savePriceWatch}>하루 2회 확인 조건 저장</button><span className="small">웹 브라우저만으로는 백그라운드 실행을 보장하지 않아요. APK의 Android 작업이 실제 확인·알림을 담당합니다.</span></div>{planningNotice && <div className="notice" role="status">{planningNotice}</div>}</div>
        </section>}

        {activeView === "flights" && <section id="flights" className="section">
          <div className="section-title"><div><div className="eyebrow">LIVE SEARCH</div><h2>항공 가격</h2><p>연결된 항공 공급자의 결과만 표시합니다. 키가 없으면 가짜 후보를 만들지 않아요.</p></div><span className="pill">실시간 공급자 연동 준비</span></div>
          <div className="card planning-form-card"><div className="form-row"><div className="field"><label htmlFor="flight-origin">출발 공항 코드</label><input id="flight-origin" className="input" maxLength={3} value={profile.originIata} onChange={(e) => changeProfile({ originIata: e.target.value.toUpperCase() })} placeholder="ICN" /></div><div className="field"><label htmlFor="flight-destination">도착 공항 코드</label><input id="flight-destination" className="input" maxLength={3} value={profile.destinationIata} onChange={(e) => changeProfile({ destinationIata: e.target.value.toUpperCase() })} placeholder="NRT" /></div></div><div className="button-row"><button type="button" className="button" onClick={searchFlights} disabled={flightSearchBusy}>{flightSearchBusy ? "조회 중…" : "실제 항공권 조회"}</button><span className="small">DUFFEL_ACCESS_TOKEN이 서버에 설정되어야 합니다. 예약은 외부 공식 사이트에서 직접 합니다.</span></div>{flightSearchNotice && <div className="notice" role="status">{flightSearchNotice}</div>}</div>
          <div className="card planning-results"><div className="card-header"><div><h3>조회 결과</h3><p>1인 왕복 기준으로 받은 공급자 결과입니다.</p></div><span className="pill">{trip.flightOffers.length}개 결과</span></div>{stale && <div className="notice">출발지나 목적지가 바뀌었어요. 다시 조회해 주세요.</div>}{trip.flightOffers.length ? <div className="flight-grid">{trip.flightOffers.map((offer) => { const badge = offerBadge(offer, trip.flightOffers); const selected = trip.flightSelection?.offerId === offer.id; return <article className="flight-card" key={offer.id}><div className="flight-card-top"><strong>{offer.airlineNames.join(" · ")}</strong><span className={`flight-status ${badge.tone}`}>{badge.label}</span></div><div className="flight-route">{offer.originLabel} → {offer.destinationLabel}{offer.arrivalAirport ? ` (${offer.arrivalAirport})` : ""} · {offer.stops === 0 ? "직항" : `${offer.stops}회 경유`}</div>{offer.departLocal && <div className="flight-route">출발 {offer.departLocal} · 도착 {offer.arriveLocal || "정보 없음"}</div>}<div className="flight-meta"><span>조회 <LocalTime value={offer.fetchedAt} /></span><span>{offer.provider}</span></div><div className="flight-price">{formatOfferPrice(offer)}</div><button type="button" className={selected ? "button green" : "button secondary"} onClick={() => selectFlight(offer.id)}>{selected ? "선택됨" : "이 항공 선택"}</button></article>; })}</div> : <div className="empty">아직 실제 조회 결과가 없어요. DUFFEL_ACCESS_TOKEN 설정 후 조회해 주세요. 데모 가격은 표시하지 않습니다.</div>}</div>
          <div className="card"><div className="card-header"><div><h3>예약 상태</h3><p>앱은 결제·예약을 대신하지 않습니다. 공식 예약을 마친 뒤에만 다음 단계로 넘어가세요.</p></div></div>{trip.flightSelection ? <div className="notice success">{trip.flightSelection.status === "booked" ? "외부 예약 완료로 기록됨" : "항공권을 선택함"}<div className="button-row"><button type="button" className="button" onClick={markBooked} disabled={trip.flightSelection.status === "booked"}>외부 예약 후 완료로 표시</button><button type="button" className="button secondary" onClick={() => go("recommendations")}>일정·숙소 추천으로 이동</button></div></div> : <div className="button-row"><button type="button" className="button secondary" onClick={markManualBooked}>실제 예약을 마쳤어요(수동 기록)</button><span className="small">조회 공급자가 없을 때도 외부에서 예약한 뒤에만 누르세요.</span></div>}</div>
        </section>}

        {activeView === "recommendations" && <section id="recommendations" className="section"><div className="card"><PlanRecommendations profile={profile} flightBooked={trip.flightSelection?.status === "booked"} accessCode={accessCode} onConfirm={confirmRecommendation} /></div></section>}

        {activeView === "plan" && <section id="plan" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>확정 일정</h2><p>부모님 화면의 “다음에 갈 곳”이 이 순서로 보여요.</p></div><span className="pill">{itinerary.length}곳</span></div><div className="place-list">{itinerary.length ? itinerary.map((item, index) => <div className="place-item" key={item.id}><div className="place-num">{index + 1}</div><div><strong>Day {item.day} · {item.name}</strong><span>{STATUS_LABEL[item.status]} · {item.note}</span></div><div className="place-actions"><button className="icon-button" title="길찾기" aria-label={`${item.name} 길찾기`} onClick={() => openMapsUrl(mapsDirectionsUrl(item.name))}>↗</button><button className="icon-button" title="지도에서 보기" aria-label={`${item.name} 지도에서 보기`} onClick={() => openMapsUrl(mapsSearchUrl(item.name))}>🔍</button><button className="icon-button" title="삭제" aria-label={`${item.name} 삭제`} onClick={() => removePlace(item.id)}>×</button></div></div>) : <div className="empty">아직 등록된 장소가 없어요. 계획서 가져오기나 AI 추천에서 확정해 주세요.</div>}</div><div className="button-row" style={{ marginTop: 12 }}><select className="select day-select" aria-label="추가할 장소의 날짜" value={Math.min(newPlaceDay, maxDay)} onChange={(e) => setNewPlaceDay(Number(e.target.value))}>{Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}</select><input className="input" aria-label="장소 직접 추가" placeholder="장소 직접 추가" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addPlace(newPlace, Math.min(newPlaceDay, maxDay)); setNewPlace(""); } }} /><button className="button" onClick={() => { addPlace(newPlace, Math.min(newPlaceDay, maxDay)); setNewPlace(""); }}>추가</button></div></div>
          <div className="card"><div className="card-header"><div><h2>여행계획서 가져오기</h2><p>텍스트를 붙여 넣으면 장소 후보를 먼저 보여주고, 고른 장소만 일정에 등록해요.</p></div><span className="pill">미리보기 후 등록</span></div>{candidates === null ? <><textarea className="textarea" aria-label="여행계획서 붙여넣기" placeholder={"예시\n1일차 신주쿠 교엔\n2일차 센소지"} value={itineraryText} onChange={(e) => setItineraryText(e.target.value)} /><div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={() => { const parsed = parseItinerary(itineraryText, trip.itinerary.map((item) => item.name)); setCandidates(parsed.candidates); setSkipped(parsed.skipped); }} disabled={!itineraryText.trim()}>장소 후보 미리보기</button><span className="small">이 단계에서는 일정에 추가되지 않아요</span></div></> : <>{candidates.length ? <div className="place-list">{candidates.map((item) => <div className={`place-item candidate${item.selected ? "" : " unselected"}`} key={item.key}><input type="checkbox" className="check-input" checked={item.selected} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, selected: e.target.checked } : entry)))} aria-label={`${item.name} 등록 선택`} /><select className="select day-select" value={item.day} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, day: Number(e.target.value) } : entry)))} aria-label={`${item.name} 날짜`}>{Array.from({ length: Math.max(10, item.day) }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}</select><div className="candidate-name"><input className="input" value={item.name} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, name: e.target.value } : entry)))} aria-label="장소 이름" />{item.duplicate && <span>이미 일정에 있거나 중복된 장소예요</span>}</div></div>)}</div> : <div className="empty">장소 후보를 찾지 못했어요. 한 줄에 장소 하나씩 적어 주세요.</div>}{skipped > 0 && <div className="notice">후보가 많아 처음 {MAX_CANDIDATES}곳만 보여줘요. 나머지 {skipped}곳은 등록 후 다시 붙여 넣어 주세요.</div>}<div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={commitCandidates} disabled={!selectedCount}>선택한 {selectedCount}곳 일정에 등록</button><button className="button secondary" onClick={() => setCandidates(null)}>다시 입력</button></div></>}</div>
        </section>}

        {activeView === "settings" && <section id="settings" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>여행 설정</h2><p>미리 넣어 두면 부모님은 누르기만 하면 돼요.</p></div></div><div className="form-row"><div className="field"><label htmlFor="hotel">호텔·숙소</label><input id="hotel" className="input" value={profile.hotel} onChange={(e) => changeProfile({ hotel: e.target.value })} placeholder="숙소 이름이나 주소" /></div><div className="field"><label htmlFor="traveler-name">여행자 호칭</label><input id="traveler-name" className="input" maxLength={20} value={profile.travelerName} onChange={(e) => changeProfile({ travelerName: e.target.value })} placeholder="예: 엄마" /></div></div><div className="field"><label htmlFor="emergencyNumber">현지 긴급번호</label><input id="emergencyNumber" className="input" type="tel" inputMode="tel" maxLength={20} value={profile.emergencyNumber} onChange={(e) => changeProfile({ emergencyNumber: e.target.value })} placeholder="여행 국가의 번호를 확인해 넣어 주세요" /><span className="small">앱이 나라별 번호를 대신 정하지 않아요. 출발 전에 확인해 넣어 주세요.</span></div><div className="field"><label htmlFor="accessCode">AI 접속 코드 (설정된 경우)</label><input id="accessCode" className="input" type="password" autoComplete="off" maxLength={64} value={accessCode} onChange={(e) => updateAccessCode(e.target.value)} placeholder="코드가 없으면 비워 두세요" /><span className="small">번역·사진·일정 AI를 쓸 때 필요해요. 부모님 휴대폰에도 넣어 주세요.</span></div>{tripNotice && <div className="notice" role="status">{tripNotice}</div>}</div>
          <div className="card"><div className="card-header"><div><h2>출발 전 체크리스트</h2><p>예약번호나 여권 원본은 저장하지 않아요.</p></div></div><div className="place-list"><div className="place-item"><div className="place-num">{profile.hotel.trim() ? "✓" : "1"}</div><div><strong>숙소 등록</strong><span>{profile.hotel.trim() || "아직 숙소가 없어요"}</span></div></div><div className="place-item"><div className="place-num">{localCall ? "✓" : "2"}</div><div><strong>현지 긴급번호</strong><span>{localCall ? localCall.display : "아직 없어요"} · 앱은 긴급 구조를 대신하지 않아요</span></div></div><div className="place-item"><div className="place-num">{profile.travelerName.trim() ? "✓" : "3"}</div><div><strong>알림 문구 호칭</strong><span>{profile.travelerName.trim() || "비우면 ‘부모님’으로 보내요"}</span></div></div><div className="place-item"><div className="place-num">4</div><div><strong>부모님 휴대폰 준비</strong><span>부모님 화면을 열고 홈 화면에 추가해 주세요. 다른 기기로 옮기는 기능은 준비 중이에요.</span></div></div></div></div>
        </section>}

        <div className="footer">easy-travel · 가격·위치·번역·AI 추천은 참고용이며, 예약·결제·긴급 대응을 대신하지 않습니다.</div>
      </main>
    </div>
  );
}

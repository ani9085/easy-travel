"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BundleComparison } from "../../components/BundleComparison.tsx";
import { LocalTime, useHydrated, useTrip } from "../../components/hooks.tsx";
import { ACCESS_CODE_STORAGE_KEY, formatWon, localEmergencyCall, mapsDirectionsUrl, mapsSearchUrl, openMapsUrl, readAccessCode } from "../../components/shared.ts";
import { profileForDestination } from "../../lib/destinations.ts";
import {
  BUDGET_STYLES,
  MAX_TRAVELERS,
  TRAVEL_PREFERENCES,
  buildDemoFlightOffers,
  buildPlanningSummary,
  checkTripDates,
  effectiveFlightPrice,
  nextItineraryItem,
  offerBadge,
  offersAreStale,
  periodLabel,
  tripTimeline,
  type BudgetStyle,
  type ItineraryItem,
  type ItineraryStatus,
  type TravelPreference,
  type TripProfile
} from "../../lib/trip.ts";

type Candidate = { key: number; name: string; day: number; selected: boolean; duplicate: boolean };
const MAX_CANDIDATES = 12;

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

export default function GuardianPage() {
  const hydrated = useHydrated();
  const { trip, updateTrip, updateProfile, migrated, storageBlocked } = useTrip();
  const [planningNotice, setPlanningNotice] = useState("");
  const [tripNotice, setTripNotice] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [newPlaceDay, setNewPlaceDay] = useState(1);
  const [itineraryText, setItineraryText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  // 접속 코드는 이 기기 설정이라 마운트 후에 읽습니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있습니다.
  useEffect(() => setAccessCode(readAccessCode()), []);

  const profile = trip.profile;
  const destination = profile.destination.trim() || "여행지";
  const place = useMemo(() => profileForDestination(profile.destination), [profile.destination]);
  const dateCheck = checkTripDates(profile);
  const summary = useMemo(() => buildPlanningSummary(profile), [profile]);
  const timeline = hydrated ? tripTimeline(profile, new Date(), place.timeZone) : null;
  const nextItem = nextItineraryItem(trip.itinerary, timeline);
  const itinerary = useMemo(() => [...trip.itinerary].sort((a, b) => a.day - b.day), [trip.itinerary]);
  const stale = offersAreStale(trip.flightOffers, profile);
  const maxDay = Math.max(summary?.dayCount ?? 10, ...trip.itinerary.map((item) => item.day));
  const localCall = localEmergencyCall(profile.emergencyNumber);
  const done = trip.itinerary.filter((item) => item.status === "completed" || item.status === "skipped").length;
  const events = [...trip.journal.events].reverse().slice(0, 8);
  const statusRecords = trip.itinerary.filter((item) => item.statusAt).sort((a, b) => (b.statusAt || "").localeCompare(a.statusAt || "")).slice(0, 8);
  const stage = !timeline ? "" : !dateCheck.ok ? "날짜 확인 필요" : timeline.stage === "before" ? `출발까지 ${timeline.daysUntil}일` : timeline.stage === "during" ? `여행 ${timeline.day}일째` : timeline.stage === "after" ? "귀국 후" : "날짜 미정";

  function changeProfile(patch: Partial<TripProfile>) {
    const cleared = updateProfile(patch);
    if (cleared) setTripNotice("목적지가 바뀌어 이전 데모 장소·숙소를 비웠어요. 새 여행지의 숙소와 장소를 넣어 주세요.");
  }

  function changePlanning(patch: Partial<TripProfile>) {
    changeProfile(patch);
    setPlanningNotice("");
  }

  function requireValidDates() {
    if (dateCheck.ok) return true;
    document.getElementById("planning-end-date")?.focus();
    return false;
  }

  function showFlightCandidates() {
    if (!requireValidDates()) return;
    updateTrip((current) => ({ ...current, flightOffers: buildDemoFlightOffers(current.profile, new Date().toISOString()) }));
    setPlanningNotice("항공권 데모 후보를 준비했어요. 실제 조회나 예약으로 이어지지 않아요.");
  }

  function togglePriceWatch() {
    const next = trip.priceWatch.mode === "demo" ? "off" : "demo";
    updateTrip((current) => ({ ...current, priceWatch: { mode: next, updatedAt: new Date().toISOString() } }));
    setPlanningNotice(next === "demo" ? "가격 감시 조건만 저장했어요(하루 1회 확인 예정 · 아직 데모라 실제 조회·알림 없음)." : "가격 감시 설정(데모)을 해제했어요.");
  }

  function updateAccessCode(value: string) {
    setAccessCode(value);
    try {
      window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, value.trim());
    } catch {
      // 저장이 막힌 브라우저에서는 이번 방문 동안만 씁니다.
    }
  }

  function addPlace(name: string, day: number) {
    const value = name.trim();
    if (!value) return;
    const item: ItineraryItem = { id: `user-${Date.now()}`, day, name: value, note: "가족이 추가한 장소", status: "planned", statusAt: null, source: "user" };
    updateTrip((current) => ({ ...current, itinerary: [...current.itinerary, item] }));
  }

  function removePlace(id: string) {
    updateTrip((current) => ({ ...current, itinerary: current.itinerary.filter((item) => item.id !== id) }));
  }

  function commitCandidates() {
    if (!candidates) return;
    const stamp = Date.now();
    const chosen: ItineraryItem[] = candidates.filter((item) => item.selected && item.name.trim()).map((item, index) => ({ id: `import-${stamp}-${index}`, day: item.day, name: item.name.trim(), note: "계획서에서 골라 등록한 장소 · 시간 확인 필요", status: "planned", statusAt: null, source: "import" }));
    if (!chosen.length) return;
    updateTrip((current) => ({ ...current, itinerary: [...current.itinerary, ...chosen] }));
    setCandidates(null);
    setSkipped(0);
    setItineraryText("");
  }

  const selectedCount = candidates ? candidates.filter((item) => item.selected && item.name.trim()).length : 0;
  const priceWatchOn = trip.priceWatch.mode === "demo";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✈</div><div><strong>easy-travel</strong><span>보호자 화면</span></div></div>
        <nav className="nav" aria-label="보호자 메뉴">
          <a href="#status">여행 현황</a>
          <a href="#planning">여행 계획</a>
          <a href="#compare">항공+숙소 비교</a>
          <a href="#plan">일정</a>
          <a href="#trip">설정</a>
          <Link href="/traveler">부모님 화면</Link>
        </nav>
        <div className="sidebar-note"><strong>이 기기에만 저장돼요</strong>가족 공유·보호자 알림은 아직 준비 중이에요. 부모님 기록은 같은 휴대폰에서만 보이고, 카카오톡 공유로 받은 메시지로 확인할 수 있어요.</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><div className="eyebrow">Guardian</div><h1>부모님 여행을<br />함께 준비해요.</h1><p className="lede">계획·비교·일정을 정리하면 부모님 화면에 그대로 보여요.</p></div>
          <div className="top-actions"><Link className="button" href="/traveler">부모님 화면 열기</Link><button type="button" className="button secondary" onClick={() => setShareNotice("가족 공유는 준비 중이에요. 지금은 이 기기에만 저장되고, 다른 가족 기기에서는 볼 수 없어요.")}>가족 공유 (준비 중)</button>{shareNotice && <div className="notice" role="status">{shareNotice}</div>}</div>
        </div>

        <section id="status" className="grid hero-grid">
          <div className="card hero-card"><div className="hero-content"><div className="eyebrow">{destination}{stage && ` · ${stage}`}</div><h2 className="hero-title">부모님의 다음 일정</h2>{nextItem ? <><div className="hero-next">{nextItem.name}</div><p className="hero-note">Day {nextItem.day} · {STATUS_LABEL[nextItem.status]}{nextItem.statusAt ? " · 기록 있음" : ""}</p></> : <p className="hero-note">남은 일정이 없어요.</p>}<div className="hero-meta"><span className="pill">📅 {periodLabel(profile)}</span><span className="pill">👨‍👩‍👧 {profile.travelers}명</span><span className="pill">진행 {done}/{trip.itinerary.length}</span>{!place.timeZone && <span className="pill">기기 시간 기준</span>}</div></div></div>
          <div className="card status-card">
            <div className="card-header"><div><h2>최근 기록</h2><p>부모님이 이 기기에서 직접 누른 기록이에요. 기록이 없다고 위험하다는 뜻은 아니에요.</p></div></div>
            {events.length || statusRecords.length ? (
              <div className="place-list">
                {events.map((event) => <div className="place-item" key={event.id}><div className="place-num">{event.type === "hotel_arrival" ? "🛎️" : "🟢"}</div><div><strong>{event.type === "hotel_arrival" ? "숙소 도착을 직접 알림" : "안부 기록"}</strong><span><LocalTime value={event.at} /> · {event.location ? `위치 기록(오차 약 ${event.location.accuracy}m)` : "위치 미제공"} · {event.shareOpened ? "가족 공유 창 열림" : "공유 안 함"}</span></div></div>)}
                {statusRecords.map((item) => <div className="place-item" key={`s-${item.id}`}><div className="place-num">✓</div><div><strong>{item.name} · {STATUS_LABEL[item.status]}</strong><span><LocalTime value={item.statusAt} /></span></div></div>)}
              </div>
            ) : <div className="empty">아직 기록이 없어요(확인 불가).</div>}
            {storageBlocked && <div className="notice">이 브라우저에서는 저장이 막혀 있어요(사생활 보호 모드 등).</div>}
            {migrated && <div className="notice">예전에 저장한 여행 정보를 새 저장 방식으로 옮겼어요.</div>}
          </div>
        </section>

        <section id="planning" className="section planning-section">
          <div className="section-title"><div><div className="eyebrow">BEFORE THE TRIP</div><h2>여행 계획</h2><p>목적지와 기간을 넣으면 항공권·일정·예상 비용을 데모로 보여드려요. 입력한 내용은 바로 저장돼요.</p></div><span className="pill">데모 · 실제 예약 아님</span></div>
          <div className="planning-layout">
            <div className="card planning-form-card">
              <div className="form-row">
                <div className="field"><label htmlFor="planning-destination">목적지</label><input id="planning-destination" className="input" list="planning-destination-options" value={profile.destination} onChange={(e) => changePlanning({ destination: e.target.value })} placeholder="예: 도쿄, 일본" /><datalist id="planning-destination-options"><option value="도쿄, 일본" /><option value="오사카, 일본" /><option value="후쿠오카, 일본" /><option value="파리, 프랑스" /><option value="방콕, 태국" /><option value="다낭, 베트남" /></datalist></div>
                <div className="field"><label htmlFor="planning-departure">출발 공항·지역</label><input id="planning-departure" className="input" value={profile.departure} onChange={(e) => changePlanning({ departure: e.target.value })} placeholder="예: 인천국제공항 (ICN)" /></div>
              </div>
              <div className="form-row">
                <div className="field"><label htmlFor="planning-start-date">출발일</label><input id="planning-start-date" className="input" type="date" value={profile.startDate} disabled={profile.flexibleDates} aria-invalid={!dateCheck.ok} aria-describedby="planning-date-error" onChange={(e) => changePlanning({ startDate: e.target.value })} /></div>
                <div className="field"><label htmlFor="planning-end-date">귀국일</label><input id="planning-end-date" className="input" type="date" value={profile.endDate} min={profile.startDate || undefined} disabled={profile.flexibleDates} aria-invalid={!dateCheck.ok} aria-describedby="planning-date-error" onChange={(e) => changePlanning({ endDate: e.target.value })} /></div>
              </div>
              {!dateCheck.ok && <div id="planning-date-error" className="notice danger-notice" role="alert">{dateCheck.message}</div>}
              <label className="planning-check"><input type="checkbox" checked={profile.flexibleDates} onChange={(e) => changePlanning({ flexibleDates: e.target.checked })} /><span>날짜가 아직 정해지지 않았어요 · 유연한 날짜로 보기</span></label>
              <div className="form-row">
                <div className="field"><label htmlFor="planning-travelers">여행 인원</label><input id="planning-travelers" className="input" type="number" min="1" max={MAX_TRAVELERS} value={profile.travelers} onChange={(e) => changePlanning({ travelers: Number(e.target.value) || 1 })} /></div>
                <div className="field"><label htmlFor="planning-budget">예산</label><select id="planning-budget" className="select" value={profile.budget} onChange={(e) => changePlanning({ budget: e.target.value as BudgetStyle })}>{BUDGET_STYLES.map((style) => <option key={style}>{style}</option>)}</select></div>
              </div>
              <div className="field"><label htmlFor="planning-preference">여행 선호</label><select id="planning-preference" className="select" value={profile.preference} onChange={(e) => changePlanning({ preference: e.target.value as TravelPreference })}>{TRAVEL_PREFERENCES.map((preference) => <option key={preference}>{preference}</option>)}</select></div>
              <div className="button-row planning-actions">
                <button className="button" type="button" onClick={showFlightCandidates}>항공권 후보 보기</button>
                <button className={priceWatchOn ? "button green" : "button secondary"} type="button" onClick={togglePriceWatch} aria-pressed={priceWatchOn}>{priceWatchOn ? "가격 감시 설정 해제 (데모)" : "가격 감시 설정 (데모·하루 1회)"}</button>
              </div>
              {planningNotice && <div className="notice" role="status">{planningNotice}</div>}
            </div>
            <div className="card planning-summary-card">
              {summary ? (
                <>
                  <div className="card-header"><div><h3>{summary.dayCount}일 추천 일정 요약</h3><p>목적지와 기간을 바탕으로 만든 참고용 데모예요.</p></div><span className="pill">{summary.travelers}명 기준</span></div>
                  <div className="planning-cost"><span>{summary.dayCount}일 데모 예상 비용</span><strong>{formatWon(summary.estimatedCost)}</strong><small>항공·숙박·현지 비용을 단순 가정한 참고용 금액이에요. 항공+숙소 비교에서 더 자세히 볼 수 있어요.{summary.assumedDays ? " 날짜를 정하지 않아 3일 기준으로 계산했어요." : ""}</small></div>
                  <div className="planning-days">{summary.days.map((day) => <div className="planning-day" key={day.day}><div className="place-num">{day.day}</div><div><strong>{day.title}</strong><span>{day.detail}</span></div></div>)}</div>
                </>
              ) : <div className="empty">{dateCheck.ok ? "" : dateCheck.message}</div>}
            </div>
          </div>
          <div className="card planning-results">
            <div className="card-header"><div><h3>항공권 후보</h3><p>1인 왕복 · 수하물 추가 요금까지 더해 비교해요.</p></div><span className="pill">{trip.flightOffers.length}개 데모 후보</span></div>
            <div className="notice planning-disclaimer">실시간 예약/가격 보장 아님 · 실제 항공권 API나 스크래핑을 호출하지 않는 데모입니다.</div>
            {stale && <div className="notice" role="status">출발지나 목적지가 바뀌었어요. ‘항공권 후보 보기’를 눌러 다시 만들어 주세요.</div>}
            {trip.flightOffers.length ? (
              <div className="flight-grid">{trip.flightOffers.map((offer) => { const badge = offerBadge(offer, trip.flightOffers); return <article className="flight-card" key={offer.id}><div className="flight-card-top"><strong>{offer.airlineNames.join(" · ")}</strong><span className={`flight-status ${badge.tone}`}>{badge.label}</span></div><div className="flight-route">{offer.originLabel} → {offer.destinationLabel}{offer.arrivalAirport ? ` (${offer.arrivalAirport})` : ""} · {offer.stops === 0 ? "직항" : `${offer.stops}회 경유`}</div>{offer.departLocal && <div className="flight-route">{offer.departLocal} 출발 → {offer.arriveLocal} 도착 · 예시 시각</div>}<div className="flight-meta"><span>{offer.baggageIncluded === false ? `수하물 별도 +${formatWon(offer.baggageFeeKrw ?? 0)}` : "수하물 포함"}</span><span>조회 <LocalTime value={offer.fetchedAt} /></span></div><div className="flight-price">{formatWon(effectiveFlightPrice(offer))}</div></article>; })}</div>
            ) : <div className="empty">아직 후보가 없어요. ‘항공권 후보 보기’를 눌러 주세요.</div>}
          </div>
        </section>

        <section id="compare" className="section">
          <div className="section-title"><div><h2>항공 + 숙소 비교</h2><p>총비용(항공·수하물·숙박·공항 왕복)과 부모님의 이동 피로도를 함께 봐요.</p></div><span className="pill">Mock · 일본</span></div>
          <div className="card"><BundleComparison profile={profile} offers={trip.flightOffers} stale={stale} /></div>
        </section>

        <section id="plan" className="section grid two-grid">
          <div className="card">
            <div className="card-header"><div><h2>여행 일정</h2><p>부모님 화면의 “다음에 갈 곳”이 이 순서로 보여요.</p></div><span className="pill">{itinerary.length}곳</span></div>
            <div className="place-list">{itinerary.length ? itinerary.map((item, index) => <div className="place-item" key={item.id}><div className="place-num">{index + 1}</div><div><strong>Day {item.day} · {item.name}</strong><span>{STATUS_LABEL[item.status]} · {item.note}{item.source === "demo" ? " · 데모 장소" : ""}</span></div><div className="place-actions"><button className="icon-button" title="길찾기" aria-label={`${item.name} 길찾기`} onClick={() => openMapsUrl(mapsDirectionsUrl(item.name))}>↗</button><button className="icon-button" title="지도에서 보기" aria-label={`${item.name} 지도에서 보기`} onClick={() => openMapsUrl(mapsSearchUrl(item.name))}>🔍</button><button className="icon-button" title="삭제" aria-label={`${item.name} 삭제`} onClick={() => removePlace(item.id)}>×</button></div></div>) : <div className="empty">아직 등록된 장소가 없어요.</div>}</div>
            <div className="button-row" style={{ marginTop: 12 }}><select className="select day-select" aria-label="추가할 장소의 날짜" value={Math.min(newPlaceDay, maxDay)} onChange={(e) => setNewPlaceDay(Number(e.target.value))}>{Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}</select><input className="input" aria-label="장소 직접 추가" placeholder="장소 직접 추가" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addPlace(newPlace, Math.min(newPlaceDay, maxDay)); setNewPlace(""); } }} /><button className="button" onClick={() => { addPlace(newPlace, Math.min(newPlaceDay, maxDay)); setNewPlace(""); }}>추가</button></div>
          </div>
          <div className="card">
            <div className="card-header"><div><h2>여행계획서 가져오기</h2><p>텍스트를 붙여 넣으면 장소 후보를 먼저 보여주고, 고른 장소만 일정에 등록해요.</p></div><span className="pill">미리보기 후 등록</span></div>
            {candidates === null ? (
              <>
                <textarea className="textarea" aria-label="여행계획서 붙여넣기" placeholder={"예시\n1일차 신주쿠 교엔\n2일차 센소지\n3일차 도쿄역"} value={itineraryText} onChange={(e) => setItineraryText(e.target.value)} />
                <div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={() => { const parsed = parseItinerary(itineraryText, trip.itinerary.map((item) => item.name)); setCandidates(parsed.candidates); setSkipped(parsed.skipped); }} disabled={!itineraryText.trim()}>장소 후보 미리보기</button><span className="small">이 단계에서는 일정에 추가되지 않아요</span></div>
              </>
            ) : (
              <>
                {candidates.length ? <div className="place-list">{candidates.map((item) => <div className={`place-item candidate${item.selected ? "" : " unselected"}`} key={item.key}><input type="checkbox" className="check-input" checked={item.selected} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, selected: e.target.checked } : entry)))} aria-label={`${item.name} 등록 선택`} /><select className="select day-select" value={item.day} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, day: Number(e.target.value) } : entry)))} aria-label={`${item.name} 날짜`}>{Array.from({ length: Math.max(10, item.day) }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}</select><div className="candidate-name"><input className="input" value={item.name} onChange={(e) => setCandidates((current) => current && current.map((entry) => (entry.key === item.key ? { ...entry, name: e.target.value } : entry)))} aria-label="장소 이름" />{item.duplicate && <span>이미 일정에 있거나 중복된 장소예요</span>}</div></div>)}</div> : <div className="empty">장소 후보를 찾지 못했어요. 한 줄에 장소 하나씩 적어 주세요.</div>}
                {skipped > 0 && <div className="notice">후보가 많아 처음 {MAX_CANDIDATES}곳만 보여줘요. 나머지 {skipped}곳은 등록 후 다시 붙여 넣어 주세요.</div>}
                <div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={commitCandidates} disabled={!selectedCount}>선택한 {selectedCount}곳 일정에 등록</button><button className="button secondary" onClick={() => setCandidates(null)}>다시 입력</button></div>
              </>
            )}
          </div>
        </section>

        <section id="trip" className="section grid two-grid">
          <div className="card">
            <div className="card-header"><div><h2>여행 설정</h2><p>미리 넣어 두면 부모님은 누르기만 하면 돼요.</p></div></div>
            <div className="form-row"><div className="field"><label htmlFor="hotel">호텔·숙소</label><input id="hotel" className="input" value={profile.hotel} onChange={(e) => changeProfile({ hotel: e.target.value })} placeholder="숙소 이름이나 주소" /></div><div className="field"><label htmlFor="traveler-name">여행자 호칭 (알림 문구용)</label><input id="traveler-name" className="input" maxLength={20} value={profile.travelerName} onChange={(e) => changeProfile({ travelerName: e.target.value })} placeholder="예: 엄마" /></div></div>
            <div className="field"><label htmlFor="emergencyNumber">현지 긴급번호</label><input id="emergencyNumber" className="input" type="tel" inputMode="tel" maxLength={20} value={profile.emergencyNumber} onChange={(e) => changeProfile({ emergencyNumber: e.target.value })} placeholder="여행 국가의 번호를 확인해 넣어 주세요" /><span className="small">{profile.emergencyNumber.trim() && !localCall ? "숫자로만 입력해 주세요." : "앱이 나라별 번호를 대신 정하지 않아요. 출발 전에 여행 국가의 긴급번호를 확인해 넣어 주세요."}</span></div>
            <div className="field"><label htmlFor="accessCode">AI 접속 코드 (설정된 경우)</label><input id="accessCode" className="input" type="password" autoComplete="off" maxLength={64} value={accessCode} onChange={(e) => updateAccessCode(e.target.value)} placeholder="코드가 없으면 비워 두세요" /><span className="small">번역·사진 AI를 쓸 때만 필요해요. 이 기기에만 저장돼요. 부모님 휴대폰에도 한 번 넣어 주세요.</span></div>
            {tripNotice && <div className="notice" role="status">{tripNotice}</div>}
          </div>
          <div className="card">
            <div className="card-header"><div><h2>출발 전 체크리스트</h2><p>예약번호나 여권 원본은 저장하지 않아요.</p></div></div>
            <div className="place-list">
              <div className="place-item"><div className="place-num">{profile.hotel.trim() ? "✓" : "1"}</div><div><strong>숙소 등록</strong><span>{profile.hotel.trim() || "아직 숙소가 없어요"}</span></div></div>
              <div className="place-item"><div className="place-num">{localCall ? "✓" : "2"}</div><div><strong>현지 긴급번호</strong><span>{localCall ? localCall.display : "아직 없어요"} · 앱은 긴급 구조를 대신하지 않아요</span></div></div>
              <div className="place-item"><div className="place-num">{profile.travelerName.trim() ? "✓" : "3"}</div><div><strong>알림 문구 호칭</strong><span>{profile.travelerName.trim() || "비우면 ‘부모님’으로 보내요"}</span></div></div>
              <div className="place-item"><div className="place-num">4</div><div><strong>부모님 휴대폰 준비</strong><span>이 기기에서 ‘부모님 화면’을 열어 홈 화면에 추가해 주세요. 다른 기기로 옮기는 기능은 준비 중이에요.</span></div></div>
            </div>
          </div>
        </section>

        <div className="footer">easy-travel MVP · 가격·위치·번역 결과는 참고용이며, 예약·긴급 대응을 대신하지 않습니다.</div>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CurrencyCalculator } from "../../components/CurrencyCalculator.tsx";
import { LocalTime, useHashView, useHydrated, useTrip } from "../../components/hooks.tsx";
import { PhotoPlace } from "../../components/PhotoPlace.tsx";
import {
  CONSULAR_CALL,
  formatTime,
  getPositionOnce,
  localEmergencyCall,
  mapsDirectionsUrl,
  openMapsUrl,
  positionLink,
  shareOutcomeMessage,
  shareText,
  subjectOf,
  type CallTarget
} from "../../components/shared.ts";
import { Translator } from "../../components/Translator.tsx";
import { profileForDestination } from "../../lib/destinations.ts";
import {
  BUDGET_STYLES,
  MAX_TRAVELERS,
  TRAVEL_PREFERENCES,
  addJournalEvent,
  checkTripDates,
  lastJournalEvent,
  markJournalShared,
  nextItineraryItem,
  setItineraryStatus,
  tripTimeline,
  type ItineraryItem,
  type ItineraryStatus,
  type JournalEvent,
  type BudgetStyle,
  type TravelPreference,
  type TripProfile
} from "../../lib/trip.ts";

const VIEWS = ["plan", "setup", "translate", "money", "photo", "arrival", "help"] as const;
type View = (typeof VIEWS)[number];

const VIEW_TITLE: Record<View, string> = {
  plan: "오늘 일정",
  setup: "여행 계획 세우기",
  translate: "통역",
  money: "돈 계산",
  photo: "여기 어디?",
  arrival: "숙소 도착 알리기",
  help: "도움 · 연락"
};

const STATUS_LABEL: Record<ItineraryStatus, string> = {
  planned: "예정",
  in_progress: "가는 중",
  arrived: "도착",
  completed: "다 봤어요",
  skipped: "건너뜀",
  delayed: "늦어짐"
};

type Undo = { id: string; status: ItineraryStatus; statusAt: string | null; message: string };

export default function TravelerPage() {
  const hydrated = useHydrated();
  const { trip, updateTrip, updateProfile, storageBlocked } = useTrip();
  const [view, go] = useHashView(VIEWS);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [pendingCall, setPendingCall] = useState<CallTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [withLocation, setWithLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<JournalEvent | null>(null);
  const [fallbackText, setFallbackText] = useState("");

  const profile = trip.profile;
  const destination = profile.destination.trim() || "여행지";
  const place = useMemo(() => profileForDestination(profile.destination), [profile.destination]);
  const dateCheck = checkTripDates(profile);
  const timeline = hydrated ? tripTimeline(profile, new Date(), place.timeZone) : null;
  const current = nextItineraryItem(trip.itinerary, timeline);
  const todayDay = timeline?.stage === "during" ? timeline.day : current?.day ?? 1;
  const todayItems = trip.itinerary.filter((item) => item.day === todayDay);
  const afterCurrent = current ? trip.itinerary.filter((item) => item.id !== current.id && item.day >= current.day && item.status !== "completed" && item.status !== "skipped").sort((a, b) => a.day - b.day)[0] : null;
  const localCall = localEmergencyCall(profile.emergencyNumber);
  const lastArrival = lastJournalEvent(trip, "hotel_arrival");
  const stage = !timeline ? "" : timeline.stage === "before" ? `출발까지 ${timeline.daysUntil}일` : timeline.stage === "during" ? `여행 ${timeline.day}일째` : timeline.stage === "after" ? "귀국 후" : "날짜 미정";

  function changePlan(patch: Partial<TripProfile>) {
    const cleared = updateProfile(patch);
    setNotice(cleared ? "이전 예시 일정은 새 여행에 섞이지 않도록 비웠어요." : "여행 계획을 저장했어요.");
  }

  function open(next: View | "") {
    setNotice("");
    setPendingCall(null);
    setRecorded(null);
    setFallbackText("");
    go(next);
  }

  function mark(item: ItineraryItem, status: ItineraryStatus, message: string) {
    setUndo({ id: item.id, status: item.status, statusAt: item.statusAt, message });
    updateTrip((currentTrip) => setItineraryStatus(currentTrip, item.id, status, new Date().toISOString()));
  }

  function revert() {
    if (!undo) return;
    updateTrip((currentTrip) => ({ ...currentTrip, itinerary: currentTrip.itinerary.map((item) => (item.id === undo.id ? { ...item, status: undo.status, statusAt: undo.statusAt } : item)) }));
    setUndo(null);
  }

  function goToHotel() {
    if (!profile.hotel.trim()) {
      setNotice("숙소가 아직 없어요. 보호자에게 숙소 이름이나 주소를 넣어 달라고 해 주세요.");
      return;
    }
    openMapsUrl(mapsDirectionsUrl(profile.hotel));
  }

  async function record(type: JournalEvent["type"]) {
    setBusy(true);
    setNotice("");
    const location = withLocation ? await getPositionOnce() : null;
    const event: JournalEvent = { id: `${type}-${Date.now()}`, type, at: new Date().toISOString(), location, shareOpened: false };
    updateTrip((currentTrip) => addJournalEvent(currentTrip, event));
    setRecorded(event);
    if (withLocation && !location) setNotice("위치를 받지 못했어요(권한·신호를 확인해 주세요). 기록은 남겼어요.");
    setBusy(false);
    return event;
  }

  function messageFor(event: JournalEvent | null, kind: "arrival" | "checkin" | "help") {
    const who = subjectOf(profile.travelerName);
    const time = event ? formatTime(event.at) : formatTime(new Date().toISOString());
    const body = kind === "arrival"
      ? `${who} ${time}에 숙소${profile.hotel.trim() ? `(${profile.hotel.trim()})` : ""} 도착을 직접 알렸어요.`
      : kind === "checkin"
        ? `${who} ${time}에 ‘잘 지내고 있어요’ 안부를 보냈어요.`
        : `${who} ${time}에 도움이 필요하다고 알렸어요. 전화 부탁해요.`;
    const where = event?.location ? `\n위치(오차 약 ${event.location.accuracy}m): ${positionLink(event.location)}` : "";
    return `[easy-travel] ${body}${where}`;
  }

  async function share(event: JournalEvent | null, kind: "arrival" | "checkin" | "help") {
    const text = messageFor(event, kind);
    const outcome = await shareText(text);
    if (event && (outcome === "shared" || outcome === "copied")) updateTrip((currentTrip) => markJournalShared(currentTrip, event.id));
    // 공유도 복사도 막힌 기기에서는 글을 보여 주고 직접 복사하게 합니다.
    setFallbackText(outcome === "failed" ? text : "");
    setNotice(outcome === "failed" ? "이 기기에서는 공유가 막혀 있어요. 아래 글을 길게 눌러 복사해 카카오톡에 붙여넣거나, 가족에게 전화로 알려 주세요." : shareOutcomeMessage(outcome));
  }

  const fallbackBox = fallbackText ? <textarea className="textarea share-fallback" readOnly value={fallbackText} aria-label="가족에게 보낼 글" onFocus={(e) => e.currentTarget.select()} /> : null;

  async function askForHelp() {
    const location = withLocation ? await getPositionOnce() : null;
    const event: JournalEvent | null = location ? { id: `help-${Date.now()}`, type: "checkin", at: new Date().toISOString(), location, shareOpened: false } : null;
    await share(event, "help");
  }

  const locationLine = (event: JournalEvent) => (event.location ? `위치도 함께 기록했어요(오차 약 ${event.location.accuracy}m). 숙소 위치와 비교하지는 않아요.` : "위치는 기록하지 않았어요.");

  return (
    <div className="traveler-shell">
      <header className="traveler-header">
        <div><strong>easy-travel</strong><span>{destination}{stage && ` · ${stage}`}</span></div>
        <Link className="traveler-switch" href="/?choose=1">화면 바꾸기</Link>
      </header>

      <main className="traveler-main">
        {view && <button type="button" className="back-button" onClick={() => open("")}>← 처음으로</button>}
        {view && <h1 className="traveler-title">{VIEW_TITLE[view]}</h1>}

        {!view && (
          <>
            <section className="now-card" aria-live="polite">
              {current ? (
                <>
                  <span className="now-label">{current.status === "arrived" ? "지금 있는 곳" : "다음에 갈 곳"} · Day {current.day}</span>
                  <div className="now-name">{current.name}</div>
                  {current.note && <p className="now-note">{current.note}</p>}
                  {current.status === "arrived" ? (
                    <button type="button" className="button huge" onClick={() => mark(current, "completed", `${current.name}을(를) 다 봤다고 기록했어요.`)}>✓ 다 봤어요, 다음으로</button>
                  ) : (
                    <>
                      <button type="button" className="button huge" onClick={() => openMapsUrl(mapsDirectionsUrl(current.name))}>↗ 길찾기</button>
                      <button type="button" className="button big light" onClick={() => mark(current, "arrived", `${current.name}에 도착했다고 기록했어요.`)}>도착했어요</button>
                    </>
                  )}
                  <button type="button" className="text-button" onClick={() => mark(current, "skipped", `${current.name}은(는) 오늘 건너뛰었어요.`)}>오늘은 건너뛰기</button>
                  {afterCurrent && <p className="now-after">그다음: Day {afterCurrent.day} · {afterCurrent.name}</p>}
                </>
              ) : (
                <>
                  <span className="now-label">오늘 일정</span>
                  <div className="now-name small-name">남은 일정이 없어요</div>
                  <p className="now-note">숙소로 돌아가거나 쉬어 가세요. 일정은 보호자 화면에서 넣을 수 있어요.</p>
                </>
              )}
            </section>
            {undo && <div className="notice success" role="status">{undo.message} <button type="button" className="text-button inline" onClick={revert}>되돌리기</button></div>}
            {notice && <div className="notice" role="status">{notice}</div>}
            <nav className="tile-grid" aria-label="여행 도구">
              <button type="button" className="tile" onClick={goToHotel}><span aria-hidden="true">🏨</span>숙소로 가기</button>
              <button type="button" className="tile" onClick={() => open("arrival")}><span aria-hidden="true">🛎️</span>숙소 도착 알리기</button>
              <button type="button" className="tile" onClick={() => open("translate")}><span aria-hidden="true">🗣️</span>통역</button>
              <button type="button" className="tile" onClick={() => open("money")}><span aria-hidden="true">💱</span>돈 계산</button>
              <button type="button" className="tile" onClick={() => open("photo")}><span aria-hidden="true">📷</span>여기 어디?</button>
              <button type="button" className="tile danger" onClick={() => open("help")}><span aria-hidden="true">🆘</span>도움 · 연락</button>
              <button type="button" className="tile" onClick={() => open("setup")}><span aria-hidden="true">🗺️</span>여행 계획 세우기</button>
            </nav>
            <button type="button" className="button big secondary wide" onClick={() => open("plan")}>오늘 일정 전체 보기</button>
            {storageBlocked && <div className="notice">이 브라우저에서는 저장이 막혀 있어요. 창을 닫으면 기록이 사라질 수 있어요.</div>}
          </>
        )}

        {view === "plan" && (
          <section>
            <p className="lead">Day {todayDay} · {todayItems.length}곳</p>
            <div className="plan-list">
              {todayItems.length ? todayItems.map((item) => (
                <article className={`plan-item status-${item.status}`} key={item.id}>
                  <div className="plan-item-head"><strong>{item.name}</strong><span className="chip">{STATUS_LABEL[item.status]}</span></div>
                  {item.note && <p>{item.note}</p>}
                  {item.statusAt && <p className="small">기록 <LocalTime value={item.statusAt} /></p>}
                  <div className="button-row">
                    <button type="button" className="button secondary" onClick={() => openMapsUrl(mapsDirectionsUrl(item.name))}>↗ 길찾기</button>
                    {item.status !== "arrived" && item.status !== "completed" && <button type="button" className="button secondary" onClick={() => mark(item, "arrived", `${item.name}에 도착했다고 기록했어요.`)}>도착</button>}
                    {item.status !== "completed" && <button type="button" className="button secondary" onClick={() => mark(item, "completed", `${item.name}을(를) 다 봤다고 기록했어요.`)}>다 봤어요</button>}
                  </div>
                </article>
              )) : <div className="empty">오늘 일정이 없어요.</div>}
            </div>
            {undo && <div className="notice success" role="status">{undo.message} <button type="button" className="text-button inline" onClick={revert}>되돌리기</button></div>}
          </section>
        )}

        {view === "setup" && (
          <section className="stack">
            <p className="lead">부모님이 직접 목적지와 원하는 여행 스타일을 정하면 보호자 화면에도 같은 계획이 보여요.</p>
            <div className="card planning-form-card">
              <div className="field"><label htmlFor="traveler-destination">어디로 갈까요?</label><input id="traveler-destination" className="input" value={profile.destination} onChange={(e) => changePlan({ destination: e.target.value })} placeholder="예: 오사카, 일본" /></div>
              <div className="form-row"><div className="field"><label htmlFor="traveler-start-date">출발일</label><input id="traveler-start-date" className="input" type="date" disabled={profile.flexibleDates} value={profile.startDate} onChange={(e) => changePlan({ startDate: e.target.value })} /></div><div className="field"><label htmlFor="traveler-end-date">귀국일</label><input id="traveler-end-date" className="input" type="date" disabled={profile.flexibleDates} min={profile.startDate || undefined} value={profile.endDate} onChange={(e) => changePlan({ endDate: e.target.value })} /></div></div>
              {!dateCheck.ok && <div className="notice danger-notice" role="alert">{dateCheck.message}</div>}
              <label className="check-row"><input type="checkbox" checked={profile.flexibleDates} onChange={(e) => changePlan({ flexibleDates: e.target.checked })} /><span>날짜는 아직 정하지 않았어요</span></label>
              <div className="form-row"><div className="field"><label htmlFor="traveler-travelers">몇 명이 갈까요?</label><input id="traveler-travelers" className="input" type="number" min="1" max={MAX_TRAVELERS} value={profile.travelers} onChange={(e) => changePlan({ travelers: Number(e.target.value) || 1 })} /></div><div className="field"><label htmlFor="traveler-budget">예산 느낌</label><select id="traveler-budget" className="select" value={profile.budget} onChange={(e) => changePlan({ budget: e.target.value as BudgetStyle })}>{BUDGET_STYLES.map((budget) => <option key={budget}>{budget}</option>)}</select></div></div>
              <div className="field"><label htmlFor="traveler-preference">어떤 여행이 좋아요?</label><select id="traveler-preference" className="select" value={profile.preference} onChange={(e) => changePlan({ preference: e.target.value as TravelPreference })}>{TRAVEL_PREFERENCES.map((preference) => <option key={preference}>{preference}</option>)}</select></div>
              {notice && <div className="notice success" role="status">{notice}</div>}
              <p className="small">입력할 때마다 이 기기에 자동 저장돼요. 실제 항공 가격은 보호자 화면에서 공항 코드를 확인한 뒤 조회합니다.</p>
              <Link className="button secondary" href="/guardian#flights">항공권 조회 화면 열기</Link>
            </div>
          </section>
        )}

        {view === "translate" && <Translator destination={destination} />}
        {view === "money" && <CurrencyCalculator defaultCurrency={place.currency} large />}
        {view === "photo" && <PhotoPlace destination={destination} onAddPlace={(name) => updateTrip((currentTrip) => ({ ...currentTrip, itinerary: [...currentTrip.itinerary, { id: `user-${Date.now()}`, day: todayDay, name, note: "사진으로 찾은 장소 · 확인 필요", status: "planned", statusAt: null, source: "user" }] }))} />}

        {view === "arrival" && (
          <section className="stack">
            <p className="lead">숙소에 도착하면 아래 버튼을 눌러 주세요. 이 휴대폰에 기록하고, 원하면 카카오톡으로 가족에게 알릴 수 있어요.</p>
            <p className="muted">숙소: {profile.hotel.trim() || "아직 없음"}</p>
            <label className="check-row"><input type="checkbox" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} /><span>지금 위치도 함께 기록하기 (선택)</span></label>
            {!recorded && <button type="button" className="button huge" onClick={() => record("hotel_arrival")} disabled={busy}>{busy ? "기록하는 중…" : "🛎️ 숙소에 도착했어요"}</button>}
            {recorded && (
              <div className="notice success" role="status">
                <strong><LocalTime value={recorded.at} />에 숙소 도착을 기록했어요.</strong>
                <span>{locationLine(recorded)}</span>
              </div>
            )}
            {(recorded || lastArrival) && <button type="button" className="button huge kakao" onClick={() => share(recorded || lastArrival, "arrival")}>카카오톡으로 가족에게 알리기</button>}
            {notice && <div className="notice" role="status">{notice}</div>}
            {fallbackBox}
            {!recorded && lastArrival && <p className="small">마지막 숙소 도착 기록: <LocalTime value={lastArrival.at} />{lastArrival.shareOpened ? " · 공유 창을 열었어요" : ""}</p>}
            <p className="small">‘보내기’를 눌러야 가족에게 전달돼요. 앱은 실제로 전달됐는지 알 수 없어요. 가족이 확인하지 못해도 위험하다는 뜻은 아니에요.</p>
          </section>
        )}

        {view === "help" && (
          <section className="stack">
            <p className="lead">위급하면 <strong>먼저 현지 긴급전화</strong>를 거세요. 이 앱은 구조 요청을 대신하지 않아요.</p>
            <button type="button" className="button huge danger" onClick={() => (localCall ? setPendingCall(localCall) : setNotice("현지 긴급번호가 아직 없어요. 보호자에게 넣어 달라고 해 주세요. 영사콜센터는 바로 걸 수 있어요."))}>📞 현지 긴급전화{localCall ? ` ${localCall.display}` : " · 번호 없음"}</button>
            <button type="button" className="button big secondary" onClick={() => setPendingCall(CONSULAR_CALL)}>📞 영사콜센터 {CONSULAR_CALL.display}</button>
            {pendingCall && (
              <div className="notice call-confirm" aria-live="polite">
                <strong>{pendingCall.label} {pendingCall.display}(으)로 전화를 걸까요?</strong>
                <span>{pendingCall === CONSULAR_CALL ? "해외에서 거는 한국 번호라 국제전화·로밍 요금이 나올 수 있어요. 출처: 외교부 해외안전여행(0404.go.kr)." : "가족이 넣은 번호예요. 앱이 맞는 번호인지 확인하지 않아요."}</span>
                <div className="button-row"><a className="button danger" href={pendingCall.href}>전화 걸기</a><button type="button" className="button secondary" onClick={() => setPendingCall(null)}>취소</button></div>
              </div>
            )}
            <hr />
            <label className="check-row"><input type="checkbox" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} /><span>가족에게 보낼 때 지금 위치도 함께 (선택)</span></label>
            <button type="button" className="button big kakao" onClick={askForHelp}>가족에게 도움 요청 보내기 (카톡)</button>
            <button type="button" className="button big secondary" onClick={async () => { const event = await record("checkin"); await share(event, "checkin"); }} disabled={busy}>가족에게 ‘잘 지내요’ 안부 보내기</button>
            {notice && <div className="notice" role="status">{notice}</div>}
            {fallbackBox}
            <p className="small">마지막 안부 기록: <LocalTime value={trip.journal.lastCheckinAt} /></p>
          </section>
        )}
      </main>
    </div>
  );
}

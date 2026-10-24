"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Place = { id: number; day: number; name: string; note: string };

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

const currencyRates: Record<string, { label: string; unit: string; defaultRate: number }> = {
  EUR: { label: "유로", unit: "€", defaultRate: 1550 },
  USD: { label: "달러", unit: "$", defaultRate: 1400 },
  JPY: { label: "엔", unit: "¥", defaultRate: 9.3 },
  VND: { label: "동", unit: "₫", defaultRate: 0.055 }
};

function formatTime(value: string | null) {
  if (!value) return "아직 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function Home() {
  const [destination, setDestination] = useState("파리, 프랑스");
  const [hotel, setHotel] = useState("Hôtel Mercure Paris Centre Tour Eiffel");
  const [familyCode, setFamilyCode] = useState("EASY-7J3K");
  const [places, setPlaces] = useState<Place[]>(starterPlaces);
  const [newPlace, setNewPlace] = useState("");
  const [itineraryText, setItineraryText] = useState("");
  const [saved, setSaved] = useState(false);
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [sosMessage, setSosMessage] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState(String(currencyRates.EUR.defaultRate));
  const [translateText, setTranslateText] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationBusy, setTranslationBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoResult, setPhotoResult] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("easy-travel-demo");
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as { destination?: string; hotel?: string; familyCode?: string; places?: Place[]; lastCheckin?: string };
      if (data.destination) setDestination(data.destination);
      if (data.hotel) setHotel(data.hotel);
      if (data.familyCode) setFamilyCode(data.familyCode);
      if (data.places?.length) setPlaces(data.places);
      if (data.lastCheckin) setLastCheckin(data.lastCheckin);
    } catch {
      // Demo storage may be cleared without affecting the app.
    }
  }, []);

  useEffect(() => {
    setRate(String(currencyRates[currency].defaultRate));
  }, [currency]);

  const convertedAmount = useMemo(() => {
    const parsed = Number(amount) * Number(rate);
    return Number.isFinite(parsed) ? parsed.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "0";
  }, [amount, rate]);

  function persist(next?: Partial<{ destination: string; hotel: string; familyCode: string; places: Place[]; lastCheckin: string }>) {
    const current = { destination, hotel, familyCode, places, lastCheckin, ...next };
    window.localStorage.setItem("easy-travel-demo", JSON.stringify(current));
  }

  function saveTrip() {
    persist();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  function openMaps(query: string) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function addPlace() {
    const value = newPlace.trim();
    if (!value) return;
    const next = [...places, { id: Date.now(), day: Math.min(3, places.length + 1), name: value, note: "가족이 추가한 장소" }];
    setPlaces(next);
    setNewPlace("");
    persist({ places: next });
  }

  function removePlace(id: number) {
    const next = places.filter((place) => place.id !== id);
    setPlaces(next);
    persist({ places: next });
  }

  function importItinerary() {
    const lines = itineraryText.split(/\r?\n/).map((line) => line.replace(/^[-*•\d.)]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    const imported = lines.slice(0, 8).map((line, index) => ({ id: Date.now() + index, day: Math.floor(index / 2) + 1, name: line, note: "계획서에서 가져온 장소 · 확인 필요" }));
    const next = [...places, ...imported];
    setPlaces(next);
    setItineraryText("");
    persist({ places: next });
  }

  function checkIn() {
    const now = new Date().toISOString();
    const finish = (locationText: string) => {
      setLastCheckin(now);
      setCheckinMessage(`${locationText} · 보호자 공유용으로 기록했어요.`);
      persist({ lastCheckin: now });
    };
    if (!navigator.geolocation) {
      finish("위치 권한 없이 안부만 기록");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => finish(`위치 ${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`),
      () => finish("위치 권한 없이 안부만 기록")
    );
  }

  function sendSos() {
    const finish = (locationText: string) => setSosMessage(`SOS 기록 완료 · ${locationText} · 보호자 알림 연결 대기`);
    if (!navigator.geolocation) {
      finish("현재 위치 확인 불가");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => finish(`현재 위치 ${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`),
      () => finish("현재 위치 확인 불가")
    );
  }

  async function translate() {
    const value = translateText.trim();
    if (!value) return;
    setTranslationBusy(true);
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate", text: value, destination }) });
      const data = (await response.json()) as { result?: string };
      setTranslation(data.result || "번역 결과를 받지 못했어요.");
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

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setPhotoPreview(dataUrl);
      setPhotoBusy(true);
      try {
        const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "photo_location", image: dataUrl, destination }) });
        const data = (await response.json()) as { result?: string };
        setPhotoResult(data.result || "사진에서 장소를 확인하지 못했어요. 간판이나 건물이 잘 보이게 다시 찍어 주세요.");
      } catch {
        setPhotoResult("데모 모드: OpenRouter 키를 연결하면 사진 속 간판·건물·랜드마크를 분석해요.");
      } finally {
        setPhotoBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function copyFamilyLink() {
    const value = `${window.location.origin}/family/${familyCode}`;
    try {
      await navigator.clipboard.writeText(value);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaved(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✈</div><div><strong>easy-travel</strong><span>부모님 여행 도우미</span></div></div>
        <nav className="nav" aria-label="주 메뉴">
          <a className="active" href="#today">오늘</a>
          <a href="#trip">여행 설정</a>
          <a href="#plan">내 여행</a>
          <a href="#tools">여행 도구</a>
          <a href="#safety">안심 확인</a>
        </nav>
        <div className="sidebar-note"><strong>데모 모드로 시작했어요</strong>OpenRouter·Upstash 키가 없어도 가족 여행 흐름을 먼저 체험할 수 있어요.</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><div className="eyebrow">Family trip companion</div><h1>오늘도 안심하고<br />여행하세요.</h1><p className="lede">부모님은 지금 필요한 것만 보고, 가족은 여행 준비와 안부를 함께 확인해요.</p></div>
          <div className="top-actions"><button className="button secondary" onClick={copyFamilyLink}>가족 링크 복사</button><div className="avatar">김</div></div>
        </div>

        <section id="today" className="grid hero-grid">
          <div className="card hero-card"><div className="hero-content"><div className="eyebrow">이번 여행 · {destination}</div><h2>여행 중에도<br />가족이 같은 화면을 봅니다.</h2><p className="lede">오늘 일정과 호텔 주소를 크게 보여주고, 필요할 때 지도·통역·SOS를 바로 열 수 있어요.</p><div className="hero-meta"><span className="pill">📅 10월 18–22일</span><span className="pill">👨‍👩‍👧 가족 3명</span><span className="pill">🟢 데모 준비 완료</span></div></div></div>
          <div className="card status-card"><div className="card-header"><div><h2>오늘의 상태</h2><p>보호자에게 공유되는 여행 요약</p></div><span className="pill">정상</span></div><div><div className="status-row"><div className="status-icon">📍</div><div><strong>마지막 안부</strong><span>{formatTime(lastCheckin)}</span></div></div><div className="status-row"><div className="status-icon">🧳</div><div><strong>다음 일정</strong><span>{places[0]?.name || "일정 없음"} · 오후 3:00</span></div></div><div className="status-row"><div className="status-icon">🔋</div><div><strong>휴대폰 상태</strong><span>배터리와 위치 권한을 확인해 주세요</span></div></div></div></div>
        </section>

        <section className="section"><div className="section-title"><div><h2>자주 쓰는 기능</h2><p>부모님 화면에서 가장 크게 보여줄 기능이에요.</p></div></div><div className="quick-grid">
          <button className="quick-button" onClick={() => openMaps(destination)}><span className="emoji">🗺️</span><strong>길 찾기</strong><span>Google Maps로 이동</span></button>
          <button className="quick-button" onClick={() => openMaps(hotel)}><span className="emoji">🏨</span><strong>호텔로 돌아가기</strong><span>기사님께 주소 보여주기</span></button>
          <button className="quick-button" onClick={() => document.getElementById("currency")?.scrollIntoView()}><span className="emoji">💱</span><strong>환전 계산</strong><span>현지 돈 ↔ 원화</span></button>
          <button className="quick-button" onClick={() => document.getElementById("translate")?.scrollIntoView()}><span className="emoji">🗣️</span><strong>통역하기</strong><span>문장·자주 쓰는 말</span></button>
          <button className="quick-button danger" onClick={() => document.getElementById("safety")?.scrollIntoView()}><span className="emoji">🆘</span><strong>SOS / 안부</strong><span>가족에게 알림 보내기</span></button>
        </div></section>

        <section id="trip" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>가족 여행 설정</h2><p>가족이 미리 넣어두면 부모님은 누르기만 하면 돼요.</p></div><span className="pill">공유 코드 {familyCode}</span></div><div className="form-row"><div className="field"><label htmlFor="destination">여행지</label><input id="destination" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} /></div><div className="field"><label htmlFor="hotel">호텔·숙소</label><input id="hotel" className="input" value={hotel} onChange={(e) => setHotel(e.target.value)} /></div></div><div className="field"><label htmlFor="familyCode">가족 코드</label><input id="familyCode" className="input" value={familyCode} onChange={(e) => setFamilyCode(e.target.value)} /></div><div className="button-row"><button className="button" onClick={saveTrip}>설정 저장</button><button className="button secondary" onClick={copyFamilyLink}>공유 링크 복사</button></div>{saved && <div className="notice success">저장했어요. 가족 화면에도 같은 설정을 보여줄 수 있어요.</div>}</div>
          <div className="card"><div className="card-header"><div><h2>여행 전 체크리스트</h2><p>예약번호나 여권 원본은 기본 저장하지 않아요.</p></div></div><div className="place-list"><div className="place-item"><div className="place-num">✓</div><div><strong>호텔 주소 등록</strong><span>{hotel}</span></div></div><div className="place-item"><div className="place-num">✓</div><div><strong>가족 공유 범위 확인</strong><span>일정 공유 · 위치는 필요할 때만</span></div></div><div className="place-item"><div className="place-num">3</div><div><strong>현지 긴급 연락처 확인</strong><span>앱은 긴급 구조를 대신하지 않아요.</span></div></div></div></div>
        </section>

        <section id="plan" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>오늘의 일정</h2><p>장소를 누르면 Google Maps 길찾기를 열어요.</p></div><span className="pill">{places.length}곳</span></div><div className="place-list">{places.length ? places.map((place, index) => <div className="place-item" key={place.id}><div className="place-num">{index + 1}</div><div><strong>Day {place.day} · {place.name}</strong><span>{place.note}</span></div><div className="place-actions"><button className="icon-button" title="길찾기" onClick={() => openMaps(place.name)}>↗</button><button className="icon-button" title="삭제" onClick={() => removePlace(place.id)}>×</button></div></div>) : <div className="empty">아직 등록된 장소가 없어요.</div>}</div><div className="button-row" style={{ marginTop: 12 }}><input className="input" placeholder="장소 직접 추가" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlace()} /><button className="button" onClick={addPlace}>추가</button></div></div>
          <div className="card"><div className="card-header"><div><h2>여행계획서 가져오기</h2><p>텍스트를 붙여 넣으면 장소 후보를 일정에 추가해요.</p></div><span className="pill">AI 준비</span></div><textarea className="textarea" placeholder={'예시\n1일차 에펠탑\n2일차 루브르 박물관\n3일차 몽마르트르'} value={itineraryText} onChange={(e) => setItineraryText(e.target.value)} /><div className="button-row" style={{ marginTop: 10 }}><button className="button" onClick={importItinerary}>장소 후보 등록</button><span className="small">사진 분석은 OpenRouter 연결 시 활성화</span></div><div className="notice">등록 전 미리보기와 확인 단계를 두는 것이 안전해요. 이 데모는 붙여넣은 장소를 바로 추가합니다.</div></div>
        </section>

        <section id="tools" className="section grid three-grid">
          <div id="currency" className="card"><div className="card-header"><div><h2>환전 계산</h2><p>환율은 직접 수정할 수 있어요.</p></div><span className="pill">데모 환율</span></div><div className="rate-box"><div className="field"><label htmlFor="currency">현지 통화</label><select id="currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{Object.entries(currencyRates).map(([key, value]) => <option key={key} value={key}>{key} · {value.label}</option>)}</select></div><button className="swap" onClick={() => setCurrency(currency === "EUR" ? "USD" : "EUR")} aria-label="통화 바꾸기">↔</button><div className="field"><label htmlFor="rate">1 {currency} = 원</label><input id="rate" className="input" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></div></div><div className="field" style={{ marginTop: 12 }}><label htmlFor="amount">현지 금액 ({currencyRates[currency].unit})</label><input id="amount" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div><div className="rate-result"><span className="small">예상 원화</span><strong>₩ {convertedAmount}</strong></div></div>
          <div id="translate" className="card"><div className="card-header"><div><h2>통역 도우미</h2><p>자주 쓰는 말을 크게 보여줘요.</p></div><span className="pill">OpenRouter 연동</span></div><div className="phrase-list">{phrases.map((phrase) => <button className="phrase" key={phrase.ko} onClick={() => selectPhrase(phrase)}>{phrase.ko}</button>)}</div><div className="field" style={{ marginTop: 14 }}><label htmlFor="translateText">번역할 문장</label><textarea id="translateText" className="textarea" style={{ minHeight: 75 }} value={translateText} onChange={(e) => setTranslateText(e.target.value)} placeholder="번역할 문장을 입력하세요" /></div><button className="button" onClick={translate} disabled={translationBusy}>{translationBusy ? "번역 중…" : "번역하기"}</button>{translation && <div className="result-card"><span className="small">현지어 표시</span><strong>{translation}</strong></div>}</div>
          <div className="card"><div className="card-header"><div><h2>사진으로 장소 확인</h2><p>간판·건물을 보고 장소 후보를 알려줘요.</p></div><span className="pill">AI 선택 기능</span></div><div className="photo-drop">{photoPreview ? <img src={photoPreview} alt="업로드한 여행 사진" style={{ maxWidth: "100%", maxHeight: 100, borderRadius: 10 }} /> : <div><div style={{ fontSize: 28 }}>📷</div><div className="muted">여행 사진을 올려보세요</div></div>}<input type="file" accept="image/*" onChange={handlePhoto} /></div>{photoBusy && <div className="notice">사진을 살펴보는 중이에요…</div>}{photoResult && <div className="result-card"><span className="small">장소 추정 결과</span><strong>{photoResult}</strong></div>}</div>
        </section>

        <section id="safety" className="section grid two-grid">
          <div className="card"><div className="card-header"><div><h2>오늘의 안부</h2><p>부모님이 직접 누르면 시간과 위치를 가족에게 공유해요.</p></div><span className="pill">수동 확인</span></div><div className="checkin"><div className="checkin-icon">🟢</div><div><strong>{lastCheckin ? "오늘 안부가 기록됐어요" : "아직 오늘 안부가 없어요"}</strong><span>{formatTime(lastCheckin)}</span></div><button className="button green" onClick={checkIn}>안부 보내기</button></div>{checkinMessage && <div className="notice success">{checkinMessage}</div>}<div className="notice">자동 위치 추적이나 구조를 보장하지 않아요. 위치 권한·배터리·통신 상태에 따라 확인이 늦을 수 있어요.</div></div>
          <div className="card safety-card"><div className="card-header"><div><h2>SOS / 도움 요청</h2><p>보호자에게 현재 상황을 알려요.</p></div><span className="pill">보조 기능</span></div><div className="sos-row"><div><strong>긴급 상황인가요?</strong><p className="muted">현재 위치를 확인해 보호자 알림을 준비합니다.</p></div><button className="button danger" onClick={sendSos}>SOS 알림</button></div>{sosMessage && <div className="notice">{sosMessage}</div>}<div className="button-row" style={{ marginTop: 13 }}><button className="button secondary" onClick={() => window.open("tel:112")}>현지 긴급전화</button><button className="button secondary" onClick={() => window.open("tel:1335")}>영사콜센터</button></div></div>
        </section>

        <div className="footer">easy-travel MVP · 가격·위치·번역 결과는 참고용이며, 예약·긴급 대응을 대신하지 않습니다.</div>
      </main>
    </div>
  );
}

# easy-travel 아키텍처

> 기준일: 2026-10-31 · 원칙: 기존 Next.js·Vercel·OpenRouter를 재사용하는 **모듈형 모놀리스**. 외부 연동은 Mock/Live 어댑터로 명확히 나눕니다.

## 1. 지금 구조 (P0 브랜치)

```text
app/
  page.tsx               역할 선택
  traveler/page.tsx      부모님 화면: 실행 도구 + 여행 계획 입력
  guardian/page.tsx      보호자 화면: 메뉴별 계획·항공·추천·일정·설정
  api/ai/route.ts        AI 게이트웨이: 접속 코드 → 같은 출처 → 크기 → 검증 → 횟수 제한 → OpenRouter
  api/flights/search/route.ts  Duffel 실제 항공 검색 어댑터
  globals.css
lib/
  trip.ts                Trip 타입·빈 기본값·날짜 검증·오늘 계산 (순수 함수)
  tripPlan.ts            구조화 AI 일정 결과 검증
  tripStorage.ts         localStorage 저장·스키마 검증·예전 저장소 이전
  destinations.ts        목적지 프로필(언어·통화·시간대·문장·데모 항공사·비용 계수)
  server/aiGuard.ts      출처·접속 코드·횟수 제한·AI 입력 검증 (서버 전용)
tests/                   node --test (TypeScript 그대로 실행, Node 22.18+)
docs/                    이 문서들
```

- `lib/*`는 React·Next에 의존하지 않아 테스트와 이후 서버 코드에서 그대로 씁니다.
- 모듈 간 import는 `.ts` 확장자를 붙입니다(`allowImportingTsExtensions`). Node 테스트 러너가 빌드 없이 실행하기 위해서입니다.

## 2. 하나의 여행 데이터(Trip)

```ts
type Trip = {
  schemaVersion: 1;
  id: string;
  state: TripState;                 // draft → comparing → planned → booked → upcoming → in_progress → returned → reviewing → archived
  profile: TripProfile;             // 목적지·출발지·날짜(현지)·인원·예산·선호·숙소·현지 긴급번호
  itinerary: ItineraryItem[];       // day·name·note·status(planned|in_progress|arrived|completed|skipped|delayed)·source(demo|user|import)
  flightOffers: FlightOffer[];      // provider·dataMode(mock|live)·fetchedAt·노선·항공사·경유·1인 왕복 KRW
  priceWatch: { mode: "off" | "configured"; targetPrice: number | null; checkTimes: string[]; checksPerDay: 2; ... };
  flightSelection: { offerId: string; status: "selected" | "booked"; updatedAt: string } | null;
  journal: { lastCheckinAt: string | null };
  createdAt: string; updatedAt: string;
};
```

- **계획 → 실행**: 계획 폼이 고친 `profile`이 그대로 “오늘” 화면(날짜·인원·숙소·통화·언어)과 다음 일정 계산에 쓰입니다.
- **실행 → 리뷰**: 일정 `status`, `journal`(안부·도착), 이후 추가될 `expenses`·`review`가 귀가 후 화면의 입력이 됩니다.
- **가짜 결과 차단**: 새 Trip은 목적지·일정·항공 후보가 비어 있습니다. 저장소를 읽을 때 이전 `source: "demo"` 장소와 `dataMode: "mock"` 항공 후보는 실제 계획으로 복원하지 않습니다. 사용자가 직접 넣거나 AI 초안을 확인해 확정한 장소만 일정에 들어갑니다.
- **오늘 계산**: `tripTimeline(profile, now, timeZone)`이 목적지 IANA 시간대 기준으로 여행 전/중(N일째)/후를 정합니다. 프로필에 없는 목적지는 기기 시간대로 계산하고 “기기 시간 기준”이라고 표시합니다.
- **기기 설정은 분리**: 환율 캐시(`easy-travel-rates`)와 AI 접속 코드(`easy-travel:ai-access-code`)는 여행 데이터가 아니라서 Trip에 넣지 않습니다.

### 앞으로 붙일 필드 (스키마 v2 이후, 각 PR에서 마이그레이션 추가)

| 필드 | 용도 | 단계 |
|---|---|---|
| `itinerary[].plannedTime`, `placeRef{placeId, lat, lng}` | 시간표·근접 확인 | P1 |
| `journal.events[]` (`checkin`·`arrived_hotel`·`sos_logged`, `userConfirmedAt`, `location?`, `accuracy?`, `deliveryStatus`) | 숙소 도착·안부 기록 | P1 기록 / P2 전송 |
| `hotelOffers[]`, `bundles[]` | 항공+숙소 묶음 비교 | P1(Mock) / P3(Live) |
| `expenses[]` (금액·통화·참고 환율·분류·결제자·`confirmed`) | 실제 비용 | P1 |
| `review` (평가·체감 피로도·선택 사진·다음 여행 조건 초안) | 회고 | P1 |
| `members[]`, `sharing` | 가족 초대·공유 범위 | P2(서버) |

## 3. 상태 계약 (요청서 §6 반영)

- Trip: `draft → comparing → planned → booked → upcoming → in_progress → returned → reviewing → archived`. P0에서는 값만 저장하고 화면은 날짜로 계산한 단계(여행 전/중/후)를 씁니다.
- 검색: `idle → loading → partial → ready | empty | stale | error`. P0에서는 `stale`(입력이 바뀐 후보)만 표시합니다.
- AI 결과: `processing → candidate → user_confirmed | rejected`. 일정·지출에는 사용자가 확인한 뒤에만 반영합니다.
- 체크인: `user_confirmed → server_recorded → notification_queued → delivered | failed`. 웹 단독 단계에서는 `user_confirmed`(이 기기 기록)까지만 있습니다.
- 가격 감시: `draft → active → paused → expired`. 현재는 `off | configured` 조건만 저장하고, 실제 하루 2회 실행은 Android WorkManager 단계입니다.

## 4. 저장 전략

| 단계 | 저장소 | 비고 |
|---|---|---|
| P0–P1 | `localStorage` `easy-travel:trip` (v1) | 기기 1대. 예전 키는 지우지 않음 |
| P1 | “여행 보내기” 링크(URL 조각 `#trip=` 압축 JSON, 서버 미전송) | 보호자 기기에서 부모님 기기로 한 번 복사. 받는 쪽에서 확인 후 가져오기 |
| P2 | 관리형 PostgreSQL(Neon 권장) + `TripRepository` 서버 구현 | 인증·멤버 권한·철회·삭제/내보내기 |

화면 코드는 `loadTrip`/`saveTrip`만 부르므로, P2에서는 이 두 함수를 서버 API 호출로 바꾸면 됩니다.

## 5. AI 게이트웨이

```text
요청 → 접속 코드(설정 시) → 같은 출처(Origin/x-forwarded-host) → 본문 크기 → 작업별 스키마 검증
     → 횟수 제한(IP 40단위/10분, 인스턴스 320단위/10분; 번역 1·사진 4)
     → 키 없음: 503 설정 오류 / 키 있음: OpenRouter (20초 타임아웃, 작업별 max_tokens, system/user 분리)
     → 실패: 502/504 + 직접 입력 안내
```

- 작업을 추가할 때(`translate` 방향 추가, `transcribe`, `price_tag`, `receipt`)는 `validateAiRequest`에 스키마를, `TASK_COST`에 무게를 추가합니다. 결과는 JSON으로 받아 서버에서 검증합니다.
- 로그에는 키·문장·사진 원문을 남기지 않습니다.

## 6. 화면 구조 (P1 목표)

```text
/            역할 선택(이 기기에 기억) → /traveler 또는 /guardian
/traveler    지금 할 일 · 여행 계획 세우기 · 길찾기 · 통역 · 환전 · 사진 · 안부/도움
/guardian    #status #planning #flights #recommendations #plan #settings
```

- 같은 Trip을 쓰며 부모님과 보호자 모두 계획 프로필을 편집할 수 있습니다. 부모님 실행 화면의 일정 상태 버튼은 계획을 바꾸지 않습니다.
- AI 추천은 구조화 결과를 검증한 뒤에도 초안으로만 보여 주고, 사용자가 수정·확정해야 일정에 들어갑니다.

## 7. 외부 연동 Port/Adapter

```text
lib/integrations/
  flights/   FlightPriceProvider  — duffel(현재 API 어댑터) · mock(레거시 테스트 전용)
  hotels/    HotelProvider        — mock · liteapi · 검색 링크
  places/    PlacesProvider       — google-urls(현재) · google-places
  notify/    Notifier             — none(현재) · web-push · email
  ai/        AiGateway            — openrouter(현재)
```

모든 결과에는 `source`·`fetchedAt`·`dataMode`·`limitations`를 붙이고, 화면은 이 값을 지우지 않습니다.

## 8. 현재 main 반영

```text
app/page.tsx              역할 선택(easy-travel:role 기억, ?choose=1로 다시 고르기)
app/traveler/page.tsx     부모님 화면 — #plan #translate #money #photo #arrival #help (휴대폰 뒤로 버튼 동작)
app/guardian/page.tsx     보호자 화면 — 메뉴별 현황·계획·항공 가격·AI 추천·확정 일정·설정
components/hooks.tsx      useTrip(로드·저장·다른 탭 동기화), useHashView, LocalTime
components/shared.ts      지도 URL, 전화, AI 호출, 카카오톡 공유(Web Share → 복사 → 화면 표시)
components/Translator.tsx · CurrencyCalculator.tsx · PhotoPlace.tsx · PlanRecommendations.tsx
lib/comparison.ts         예시 숙소(일본), 피로도, 총비용, 경고, 묶음 정렬·추천
```

- Trip v1에 하위 호환 필드 추가: `profile.travelerName`, `itinerary[].statusAt`, `journal.events[]`(checkin·hotel_arrival, 위치 선택, shareOpened), `FlightOffer`의 도착 공항·예시 시각·수하물. 저장된 예전 값은 기본값으로 채워 읽습니다(스키마 버전 유지).
- 새 설치 기본 여행은 빈 계획입니다. 레거시 테스트용 도쿄/파리 Mock 생성 함수는 실제 화면에서 호출하지 않습니다.
- `/api/ai` 번역은 `direction`(to_local | to_korean)과 `language`(목록 안 코드)를 받습니다.
- `/api/ai` `trip_plan`은 일정·숙소 후보 지역 JSON을 서버에서 검증합니다. `DUFFEL_ACCESS_TOKEN`이 없으면 `/api/flights/search`는 실제 결과 대신 설정 오류를 돌려줍니다.
- 네이티브 전환 결정은 [NATIVE_APK_PLAN_KO.md](./NATIVE_APK_PLAN_KO.md)에 기록했습니다.

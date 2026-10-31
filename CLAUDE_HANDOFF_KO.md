# Claude 작업 인수인계

> easy-travel을 이어서 개발하기 위한 현재 상태 문서입니다. 기준일: 2026-10-31 (Asia/Seoul)

## 0. 한 줄 요약

easy-travel은 부모님·가족·친구가 여행을 함께 계획하고, 여행자는 여행 중 필요한 행동을 크게 확인하며, 동행자와 보호자는 동의된 일정과 상태를 참고할 수 있게 하는 여행 도우미입니다.

현재 저장소에는 **여행 전 계획·여행 중 보조 MVP**가 있습니다. 초기 여행은 빈 초안으로 시작하며, 실항공 검색은 Duffel 토큰이 있을 때만 동작합니다. 예약·가족 서버 공유·푸시 알림·실제 APK 패키징은 후속 연결 대상입니다.

> **2026-10-31 갱신 (Claude Opus, 브랜치 `claude/p0-hardening`, main 병합 전)**
> 전면 감사와 P0 안정화를 마쳤습니다. 이제 기준 문서는 `docs/`입니다. [AUDIT](./docs/AUDIT_KO.md) · [ARCHITECTURE](./docs/ARCHITECTURE_KO.md) · [PRODUCT_REQUIREMENTS](./docs/PRODUCT_REQUIREMENTS_KO.md) · [ROADMAP](./docs/ROADMAP_KO.md) · [TEST_PLAN](./docs/TEST_PLAN_KO.md) · [EXTERNAL_API_DECISIONS](./docs/EXTERNAL_API_DECISIONS_KO.md)
> - 앱은 Next.js 16.4.3 / React 19.3.1입니다. 계획·여행·리뷰 데이터는 `lib/trip.ts`의 Trip 하나로 합쳤고, `localStorage` 키는 `easy-travel:trip`입니다.
> - `/api/ai`에는 같은 출처 확인, `EASY_TRAVEL_ACCESS_CODE`(선택), 횟수 제한, 타임아웃이 들어갔습니다. `itinerary_import` 작업은 제거했습니다.
> - 이 아래 §1–§6의 버전·파일·우선순위 설명은 이전 기록입니다. 다음 작업은 [ROADMAP](./docs/ROADMAP_KO.md)의 P1(PR-05~)부터 이어 갑니다.

## 1. 저장소와 실행

- GitHub: <https://github.com/ani9085/easy-travel>
- 로컬 경로: C:/Users/dream/OneDrive/문서/easy-travel (P0 작업 트리: C:/Users/dream/Downloads/easy-travel-p0, git worktree)
- 기본 브랜치: main
- 앱: Next.js 14.2.35 / React 18.3.1 / TypeScript 5.7.2 (P0 브랜치: Next.js 16.4.3 / React 19.3.1)
- 개발 실행:

~~~powershell
cd C:/Users/dream/OneDrive/문서/easy-travel
npm install
npm run dev
~~~

개발 서버 포트가 3101이면 http://localhost:3101/#planning 에서 계획 화면을 바로 확인할 수 있습니다. 포트는 실행 환경에 따라 달라질 수 있습니다.

검증 명령:

~~~powershell
npm run build
git diff --check
~~~

## 2. 제품 방향과 역할

제품 흐름은 다음을 목표로 합니다.

~~~text
여행 조건 입력 → 후보 비교 → 추천 일정·예산 → 가족 공유 → 예약 준비
→ 여행 중 오늘 일정·길찾기·환전·통역 → 수동 안부/SOS → 귀가 후 정산·기록
~~~

- 부모님/여행자: 큰 글씨로 오늘 할 일, 다음 이동, 연락처를 확인하고 필요한 행동을 직접 확정합니다.
- 보호자: 여행 조건과 계획을 돕고, 공유된 정보만 확인합니다.
- Claude: 이 문서와 제품 지도를 기준으로 코딩하고, 변경 후 빌드·화면·안전 경계를 확인합니다.
- Codex: 기획, 범위 판단, 최종 검토를 담당합니다.
- 자료조사/검토: 공식 문서에서 확인한 제약을 RESEARCH_BRIEF_KO.md에 남깁니다.

이번 세션에서는 저장소에서 직접 확인 가능한 작업을 기준으로 정리했습니다. Claude/Antigravity를 직접 호출할 수 있는지는 실행 환경에 따라 다르므로, 도구가 연결되지 않으면 이 문서를 작업 계약으로 사용합니다.

## 3. 현재 구현된 기능과 정확한 경계

| 영역 | 현재 상태 | 반드시 유지할 설명 |
|---|---|---|
| 여행 전 계획 | 목적지, 출발지, 날짜/유연한 날짜, 인원, 예산, 선호 입력. 기간에 맞춘 데모 일정·예상비용·항공 후보 표시 | 데모 후보이며 실시간 최저가·예약이 아님 |
| 항공 가격 모니터링 | 시작/중지 상태를 저장하고 화면에 표시 | 실제 가격 조회·백그라운드 알림·공급자 API 미연결 |
| 계획 저장 | easy-travel-planning이라는 브라우저 localStorage에 저장 | 이 기기에만 저장되며 가족과 자동 공유되지 않음 |
| 일정표 가져오기 | 텍스트를 붙여 넣으면 장소 후보를 미리 보고 선택한 장소만 등록 | AI 결과나 추출 결과를 사용자 확인 전 확정하지 않음 |
| 지도/길찾기 | Google Maps URL로 검색·길찾기·도보/대중교통/자동차 이동을 외부 앱 또는 브라우저에서 열기 | Google Maps API 키·직접 내장 지도·지오코딩 미사용 |
| 위치/안부 | 브라우저 GPS 권한을 받아 수동 체크인 또는 SOS 기록 | 자동·시간별 백그라운드 GPS가 아니며 보호자 알림도 아님 |
| SOS/긴급전화 | 현재 화면에 기록하고 확인 단계 후 tel: 링크 사용 | 구조 요청을 보장하지 않음. 실제 위급 시 현지 긴급전화 사용 |
| 환전 | Frankfurter/ECB 기준환율 조회, 조회 시각·출처 표시, 실패 시 수동/마지막 값 사용 | 거래용 환율이나 결제 기능이 아님 |
| 통역/사진 | /api/ai를 통해 OpenRouter 번역·사진 장소 추정 경계 제공 | 키가 없으면 데모 응답. AI 결과는 참고용이며 확정하지 않음 |
| 가족 공유 | 가족 링크/코드 UI와 데모 흐름 | 현재 서버 DB·인증·권한·실시간 공유·푸시 미연결 |
| 배포 | Vercel 가입은 사용자가 완료 | GitHub import, 환경변수 입력, 실제 배포·도메인 연결은 후속 작업 |

## 4. 주요 파일

- app/page.tsx: 현재 화면 전체. 여행 전 계획 폼, 데모 항공 후보, 일정/비용 요약, localStorage, Google Maps URL, 환전, 번역/사진 호출, 체크인/SOS가 들어 있습니다.
- app/globals.css: 부모님용 큰 글씨·터치 영역·고대비·키보드 포커스·모바일/태블릿 반응형 스타일입니다.
- app/api/ai/route.ts: 서버에서만 OpenRouter를 호출합니다. translate, photo_location, itinerary_import 작업과 요청 크기 제한, 이미지 형식 제한, 데모/fallback 응답을 담당합니다.
- EASY_TRAVEL_PRODUCT_MAP_KO.md: 전체 서비스 맵, 사용자 여정, MVP 범위, 기술 구조, 개인정보·안전 가드레일, 로드맵입니다.
- RESEARCH_BRIEF_KO.md: Google Maps URL, OpenRouter, GPS/백그라운드 위치, FCM/APNs, 환율 관련 조사 결과와 금지 범위입니다.
- WORK_LOG_KO.md: 시작부터 현재까지의 작업 흐름과 검증 결과입니다.
- .gitignore: .env, .env.local, .vercel, 빌드 산출물 등을 제외합니다.

## 5. 환경변수와 보안

로컬 .env.local 또는 Vercel 프로젝트 환경변수에만 넣습니다. GitHub 소스와 브라우저 번들에는 API 키를 넣지 않습니다.

~~~text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_VISION_MODEL=...
OPENROUTER_SITE_URL=http://localhost:3101
~~~

Vercel에서는 OPENROUTER_SITE_URL을 실제 배포 주소로 바꿉니다. 부모님이 API 키를 직접 입력하는 구조로 만들지 말고 서버 환경변수에서만 읽도록 유지합니다.

Google Maps는 현재 URL 호출 방식이라 Google Maps API 키가 필요하지 않습니다. 앱 안에 지도를 직접 넣거나 장소·경로 데이터를 서버에서 계산하려면 별도 Google API 검토와 과금·쿼터 관리가 필요합니다.

## 6. Claude가 이어서 할 우선순위

### 1순위: 계획 데이터와 실제 검색 경계 정리

1. PlanningForm, PlanningSummary, FlightCandidate를 UI 내부 타입에서 분리하고 서버 API 응답 타입을 정합니다.
2. 항공 검색은 스크래핑하지 말고 공식 공급자 API 또는 제휴 API를 하나 선정해 Adapter 뒤에 둡니다.
3. 결과에 source, checkedAt, 통화, 수하물/환불 조건, 검색 조건을 저장하고 화면에 표시합니다.
4. 실제 결과가 없는 동안에는 현재 데모 문구와 “실시간 최저가 아님” 경계를 유지합니다.
5. 로딩·실패·오래된 결과·부분 결과를 부모님이 이해할 수 있는 문구로 처리합니다.

### 2순위: 저장과 가족 공유

1. localStorage 데모를 서버 DB로 바꾸되, 여행자·보호자 역할과 초대/철회 권한을 먼저 정합니다.
2. 일정·예약번호·위치·비용·사진의 공유 범위를 각각 선택하게 합니다.
3. 사용자 확인 없이 AI 추출 일정, 위치, 지출을 확정하거나 공유하지 않습니다.

### 3순위: 모니터링과 알림

1. 가격 모니터링을 DB에 저장하고 중복 요청·요금·실패 재시도를 관리합니다.
2. Vercel Hobby의 실행 주기 제약을 확인합니다. “한 시간마다”를 제품 약속으로 만들기 전에 별도 worker/스케줄러가 필요한지 결정합니다.
3. 실제 알림은 FCM/APNs 또는 승인된 알림 제공자를 연결하고, 알림 권한·철회·재전송 실패를 기록합니다.
4. SOS는 안전 보장 문구를 사용하지 않고, 실제 긴급전화와 보호자 알림의 성공/실패 상태를 분리합니다.

### 4순위: 여행계획서와 비용

- OpenRouter 응답을 JSON 스키마로 검증하고 장소·날짜·이동을 사용자가 수정/확정하게 합니다.
- 공식 예약 링크를 제공하되 자동 예약·결제는 하지 않습니다.
- 영수증·결제 문자 기능은 선택한 자료만 분석하고, 금액·통화·상호를 사용자가 확인한 뒤 지출로 확정합니다.

## 7. 안전·품질 가드레일

- API 키, 개인 연락처, 여권·카드·문자 전문을 커밋하지 않습니다.
- “최저가 보장”, “안전 확인 완료”, “구조 요청 완료”처럼 실제 시스템이 보장하지 않는 문구를 사용하지 않습니다.
- 가격·항공·환율 결과에는 출처와 조회 시각을 표시합니다.
- 위치 권한 거부·오프라인·AI 실패 시 수동 입력 또는 공식 연락처로 이어지는 경로를 남깁니다.
- 부모님 화면은 48px 수준의 터치 영역, 큰 글씨, 높은 대비, 키보드 포커스를 유지합니다.
- 변경 후 npm run build와 실제 브라우저 화면을 확인합니다. 모바일 폭 390px, 태블릿 폭 900px에서 가로 스크롤이 없어야 합니다.

## 8. Claude 시작 프롬프트

아래 문장을 그대로 Claude에게 전달해도 됩니다.

~~~text
easy-travel을 이어서 작업해줘.

1) 먼저 CLAUDE_HANDOFF_KO.md, WORK_LOG_KO.md, EASY_TRAVEL_PRODUCT_MAP_KO.md, RESEARCH_BRIEF_KO.md를 읽어.
2) 현재 앱의 여행 전 계획은 빈 초안에서 시작한다. 실제 최저가·예약·푸시·가족 서버 공유가 연결됐다고 표현하지 말고, 실데이터와 목업을 반드시 구분해.
3) 이번 작업은 항공 검색을 바로 스크래핑하지 말고, 공식 공급자 API를 붙일 수 있는 Adapter/API 계약과 로딩·실패·조회시각 상태를 설계하는 것부터 시작해.
4) API 키는 서버 환경변수에서만 읽고 GitHub와 브라우저에 노출하지 마.
5) 계획·항공 결과·AI 결과는 사용자가 확인하기 전 자동 확정하지 마.
6) 변경 후 npm run build를 실행하고, 390px/900px 화면에서 가로 스크롤과 부모님용 가독성을 확인해.
7) 작업 결과와 남은 제한을 한국어 문서에 갱신하고, 커밋/push 전에는 supervisor(Codex)에게 최종 검토를 요청해.
~~~

## 9. Codex 최신 반영 상태 (2026-10-31)

현재 `main`의 최신 커밋은 `e631cfc docs: record current planning and native app state`이며, 핵심 구현 커밋은 `e4396dc feat: replace planning mocks with real workflow`입니다.

- 초기 여행은 빈 초안입니다. 기존 레거시 도쿄·에펠탑 목업은 저장소 로딩 시 제거합니다.
- 보호자와 부모님 모두 여행 계획을 입력할 수 있습니다.
- 보호자 화면은 해시 앵커 스크롤이 아니라 메뉴별 독립 화면으로 렌더링합니다.
- 항공 결과는 Duffel API가 설정된 경우에만 표시하며, 토큰이 없을 때 가짜 항공권을 보여주지 않습니다.
- 가격 감시는 목표가와 하루 2회 시각을 저장하지만, 실제 백그라운드 실행은 네이티브 APK의 WorkManager 구현이 남아 있습니다.
- 항공권 예약 상태가 된 뒤 OpenRouter로 일정·숙소 초안을 생성하고, 사용자가 수정·확정해야 일정에 반영합니다.
- `npm run check`와 `npm run build`가 통과했습니다. 현재 개발 환경에는 Android SDK/ADB/Gradle이 없어 APK 자체는 아직 빌드하지 않았습니다.
- GitHub push는 완료했습니다. Vercel 공개 URL은 Vercel 로그인 화면으로 보호되어 있으므로 Deployment Protection 설정을 확인해야 합니다.

다음 작업자는 먼저 `docs/NATIVE_APK_PLAN_KO.md`를 읽고 Android Studio/SDK 설치 후 Capacitor Android 프로젝트와 WorkManager 브리지를 추가하세요. API 키는 계속 서버 환경변수에만 두고, 실제 항공·AI 결과가 없을 때 목업으로 대체하지 마세요.

## 10. 공동여행 벤치마킹 반영 (2026-10-31)

`docs/BENCHMARK_TRAVEL_SERVICES_KO.md`를 새 기준 문서로 추가했습니다.

- easy-travel의 대상은 부모님·자녀뿐 아니라 친구·커플·다세대 동행자까지 포함합니다.
- 여행 단위에 소유자, 공동 계획자, 여행자, 보호자/관찰자, 보기 전용 초대자 권한을 둡니다.
- 여행 시작은 목적지·날짜 입력, 목적지 탐색, 항공권·계획서 가져오기 세 경로를 지원하는 방향입니다.
- 후보 제안·댓글·투표·확정과 예약정보 확인을 분리하고, AI 결과는 사용자 확정 전 일정에 반영하지 않습니다.
- 가족·친구 협업을 위해 현재 localStorage 구조를 서버 Trip 저장소와 초대·권한 모델로 확장해야 합니다.
- 벤치마킹 자료는 Google Flights, Skyscanner, Hopper, TripIt, Wanderlog, Google Maps/Translate, Life360 공식 문서를 바탕으로 정리했습니다.

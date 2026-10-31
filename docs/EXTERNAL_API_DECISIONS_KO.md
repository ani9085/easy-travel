# easy-travel 외부 API 결정 문서

> 기준일: 2026-10-31. 가격과 정책은 공개 자료 기준이며, 계약·연동 전에 공식 페이지에서 다시 확인해야 합니다. 이 문서의 “권장”은 의견이고, 확정은 사용자 승인으로 합니다.

## 1. 현재 사용 중

| 영역 | 서비스 | 비용 | 메모 |
|---|---|---|---|
| 호스팅 | Vercel Hobby | $0 | 비상업용 한정. Cron은 하루 1회. 상업화하면 Pro($20/월) 검토 |
| AI | OpenRouter(번역·사진) | 월 $1 미만 예상 | 번역 1회 ≈ 수백 토큰, 사진 1회 ≈ 1–2천 토큰. gpt-4o-mini급 입력 $0.15 / 출력 $0.60 per 1M 토큰. **키별 사용 한도 설정 필수** |
| 지도 | Google Maps URLs | $0 | 키 불필요. Place ID·좌표·ETA가 필요하면 Places/Routes API(결제 계정 필요) |
| 환율 | Frankfurter(ECB 기준) | $0 | 정보 제공용. 카드 실제 환율·수수료 아님. VND 미지원 |

## 2. 후보 비교

### 항공

| 후보 | 특징 | 자동 감시 | 비용 | 판단 |
|---|---|---|---|---|
| Amadeus Self-Service | — | — | — | **사용 불가**: 2026-07-17 종료(엔터프라이즈 계약만 가능) |
| Skyscanner Live Prices | 노선·날짜 실시간 가격, create/poll | **사용자 클릭 없는 자동 호출 금지** 지침 | 파트너 승인 필요 | 감시용 부적합. 사용자가 누르는 검색에만 |
| Skyscanner Indicative Prices | 날짜 유연 탐색용 참고 가격(캐시) | 지침 확인 필요 | 파트너 승인 | 유연한 날짜 추천 후보 |
| Travelpayouts(Aviasales) Data API | 사용자 검색 캐시 가격(최대 7일), 제휴 링크 | 데이터 API라 정기 조회 가능성 높음(약관 확인 필요) | 무료 가입 | **감시 1순위 후보**: “추세·하락 감지”용, 예약 페이지에서 재확인 표시 |
| Duffel Flights | 실시간 오퍼, 판매 전제 | 약관 확인 필요 | 검색은 예약 대비 1500:1까지 무과금, 초과분 건당 $0.005 | 실시간 확인용 2순위. 판매하지 않으면 초과 과금이 생김 |
| SerpApi(Google Flights) | 스크래핑 기반 | 가능 | 월 $75부터 | 비권장 |

### 숙소

| 후보 | 특징 | 비용 | 판단 |
|---|---|---|---|
| 검색 링크(Booking·Agoda 등) | 키 불필요, 조건을 URL로 넘김 | $0 | **P1 Mock 단계 기본값** |
| LiteAPI | 숙소 검색·요금, 판매 마진 모델 | 무료 가입, 검색:예약 5000:1 초과분만 과금 | P3 1순위 후보 |
| Skyscanner Stays Live Prices | 날짜·위치·인원별 숙소 옵션 | 파트너 승인 | 항공을 Skyscanner로 갈 때 함께 검토 |
| Duffel Stays | 숙소 검색 | 별도 접근 신청 | 항공을 Duffel로 갈 때 함께 검토 |

### 음성·비전

| 용도 | 1순위 | 대안 | 메모 |
|---|---|---|---|
| 음성 인식(STT) | Web Speech API(무료, 부분 지원, iOS는 `webkitSpeechRecognition`) | OpenRouter `/api/v1/audio/transcriptions` | 언어별 정확도와 iOS 동작은 실기기 테스트 필요 |
| 읽어주기(TTS) | `speechSynthesis`(무료, 기기 음성) | OpenRouter `/api/v1/audio/speech` | 해당 언어 음성이 없는 기기 대비 |
| 사진·가격표·영수증 | OpenRouter 비전 모델(기존 키) | — | 결과는 JSON 스키마로 검증하고 사용자 확인 후 확정 |
| 현지 상품 시세 | **미선정** | — | 같은 상품의 가격을 믿을 수 있게 주는 공급자를 찾지 못함. 근거가 없으면 “판단 불가” |

### 저장·알림·작업

| 용도 | 권장 | 대안 | 메모 |
|---|---|---|---|
| DB | Neon(무료, 비활성 자동 일시정지 없음) | Supabase(무료는 1주 비활성 시 일시정지) | 여행 사이 공백이 긴 가족 앱이라 일시정지가 불리 |
| 로그인 | 미정(질문 4) | 카카오·Google·이메일 매직링크 | 부모님 기기는 로그인 없이 보호자 초대 링크로 연결하는 안도 가능 |
| 보호자 알림 | Web Push(VAPID, 무료) | 이메일, 카카오 “나에게 보내기”(보호자 본인만, 무료) | iOS Web Push는 16.4+에서 홈 화면 추가가 필요 |
| 정기 작업 | Vercel Cron(Hobby 하루 1회) | GitHub Actions 예약 작업(공개 저장소 무료) | 시간 단위 감시는 외부 스케줄러가 필요하고, 그것도 공급자 약관이 허용할 때만 |
| 요청 제한 저장소 | 지금은 인스턴스 메모리 | Upstash Redis 무료 / DB | 서버 DB가 생기면 사용자별 한도로 |

## 3. 예상 월 비용 (가족 1팀, 연 2–3회 여행)

| 단계 | 예상 |
|---|---|
| P0–P1 | $0 + OpenRouter 소액(월 $1 미만) |
| P2 | $0(Neon·Web Push 무료) + OpenRouter 소액 |
| P3 | 공급자 대부분 무료 가입이지만 약관·과금 구조를 확인해야 함. 음성·비전 사용이 늘면 OpenRouter 월 수 달러 |

## 4. 결정 기록 (2026-10-31 사용자 답변)

| # | 질문 | 결정 |
|---|---|---|
| 1 | 1차 테스트 여행지 | **일본(도쿄)**. 데모 기본값·자주 쓰는 말·예시 숙소·하네다/나리타 항공 예시를 일본 기준으로 맞춤 |
| 2 | 가격 감시 빈도 | **하루 1회**(Vercel Hobby Cron 범위). 공급자 약관 확인 전까지는 설정만 저장하는 데모 |
| 3 | 보호자 알림 채널 | **카카오톡**. P1: 휴대폰 공유 창(Web Share)으로 카카오톡에 미리 채운 글 보내기(무료·심사 없음, 받는 사람은 부모님이 고름). P2: 보호자 카카오 로그인 + “나에게 보내기”로 자동 기록(서버·토큰 보관 필요, 알림 울림은 실기기 확인 필요). 알림톡은 사업자·건당 과금이라 제외 |
| 4 | 서버 DB·로그인 | 사용자가 판단을 맡김. **제안**: DB는 Neon, 보호자는 카카오 로그인(3번 P2와 연결), 부모님은 로그인 없이 보호자가 보낸 초대 링크로 연결. P2 시작 전에 한 번 더 확인 |
| 5 | 다음 범위 | **P1 바로 진행** — 브랜치 `claude/p1-traveler-guardian` |

## 4-1. 처음 올린 질문 (요청서 §12-E, 기록용)

1. **1차 테스트 여행지**: 일본(도쿄)부터 할까요, 유럽(파리)도 함께 할까요? 음성 언어, 숙소 공급자 범위, 실기기 테스트 범위가 달라집니다.
2. **가격 감시 빈도**: 하루 1회면 될까요? Vercel Hobby로 가능한 최대 빈도입니다. 더 자주 보려면 외부 스케줄러가 필요하고, 공급자 약관도 허용해야 합니다.
3. **보호자 알림 채널**: Web Push, 이메일, 카카오 “나에게 보내기” 중 무엇을 먼저 할까요?
4. **서버 DB·로그인**: Neon으로 할까요? 보호자 로그인은 카카오·Google·이메일 중 무엇으로 할까요? 부모님은 로그인 없이 초대 링크로 연결할까요?
5. **다음 승인 범위**: P0 병합 뒤 P1(PR-05 ~ PR-08: 화면 분리, 텍스트 양방향 통역, 일정 진행·숙소 도착 기록, Mock 계획 품질)까지 진행할까요?

## 참고 자료

- Amadeus Self-Service 종료: <https://airlabs.co/amadeus-self-service-api-shutdown>, <https://ignav.com/docs/amadeus-self-service-shutdown>
- Skyscanner 이용 지침: <https://developers.skyscanner.net/docs/getting-started/usage-guidelines>
- Travelpayouts Data API: <https://support.travelpayouts.com/hc/en-us/articles/203956163>
- Duffel 가격: <https://duffel.com/pricing>
- LiteAPI FAQ: <https://docs.liteapi.travel/docs/faq>
- OpenRouter 오디오 API: <https://openrouter.ai/blog/announcements/announcing-audio-apis/>
- Google Maps Platform 가격: <https://developers.google.com/maps/billing-and-pricing/pricing>
- Vercel 제한: <https://vercel.com/docs/limits>, Cron: <https://vercel.com/docs/cron-jobs/usage-and-pricing>
- Web Speech API 지원: <https://caniuse.com/speech-recognition>
- Neon 무료 플랜: <https://neon.com/faqs/free-plan-limits-and-quotas>

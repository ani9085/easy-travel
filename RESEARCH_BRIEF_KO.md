# easy-travel 자료조사 브리프

이 문서는 자료조사 담당 결과를 Claude Code 코딩 담당에게 넘기는 핸드오프다. 공식 문서에서 확인한 제약만 반영하며, 기능이 실제로 보장된다고 과장하지 않는다.

## 조사 결론

### Google Maps

- MVP는 Google Maps URL로 외부 앱/브라우저를 여는 방식이 적절하다.
- `https://www.google.com/maps/dir/?api=1&destination=...` 형식은 API 키 없이 사용할 수 있고 Android/iOS/웹에서 동작한다.
- `api=1`은 필수이며 목적지 문자열은 URL 인코딩해야 한다.
- `travelmode=walking|transit|driving`을 선택적으로 붙일 수 있다.
- 정확한 장소 연결이 필요하면 Place ID를 함께 보낸다.
- 앱 안에 지도와 경로를 직접 넣는 것은 Maps JavaScript/Routes/Places API와 키·과금·쿼터 관리가 필요한 후속 범위다.

출처: https://developers.google.com/maps/documentation/urls/get-started

### OpenRouter AI

- OpenRouter 호출은 브라우저가 아니라 서버 라우트에서 수행한다.
- 모델은 환경변수로 선택하고, 이미지 입력은 지원 모델인지 확인할 수 있도록 모델 설정을 외부화한다.
- 사진은 전송 전 사용자에게 분석 사실을 알리고, 실패하면 직접 입력으로 돌아간다.
- 이미지 크기·작업 종류·응답 길이를 제한하고, 키·원본 사진을 로그에 남기지 않는다.

출처: https://openrouter.ai/docs/api/api-reference/models/get-models

### 위치·안부·SOS

- 웹 MVP의 안부 버튼은 사용자가 누른 순간의 위치를 기록하는 데 집중한다.
- Android 백그라운드 위치는 배터리 절약을 위해 시간당 몇 번 정도로 제한될 수 있으므로 “정확히 1시간마다 GPS”를 약속하지 않는다.
- iOS 백그라운드 위치는 권한·Background Modes·시스템 상태에 영향을 받으며 Always 권한은 꼭 필요할 때만 요청한다.
- 보호자 푸시는 FCM/APNs 같은 모바일 알림 인프라와 알림 권한이 필요하다. 현재 웹 데모의 SOS는 실제 푸시가 아니라 요청 상태를 보여주는 단계다.
- 화면 문구는 “안전 보장”이 아니라 “마지막 확인 시각·위치 공유 보조”로 제한한다.

출처:
- https://developer.android.com/develop/sensors-and-location/location/battery
- https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- https://developer.apple.com/documentation/CoreLocation/requesting-authorization-to-use-location-services
- https://firebase.google.com/docs/cloud-messaging/android/receive-messages

### 환율

- 환율은 조회 시각과 출처를 함께 표시한다.
- ECB 기준 환율은 정보 제공용이며 거래용 보장값이 아니다.
- 지원하지 않는 통화나 API 오류에는 수동 환율과 마지막 성공값을 fallback으로 제공한다.

출처: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html

## 이번 Claude 작업 범위

1. Google Maps URL 생성을 한 곳으로 모으고 검색/길찾기/이동수단 선택을 구분한다.
2. 환전 결과에 출처·조회 시각·참고용 경고를 넣고 기존 수동 환율을 유지한다.
3. 사진 AI 전송 전 안내와 이미지 크기 제한, AI 실패 시 수동 입력 fallback을 강화한다.
4. 안부/SOS UI에서 실제 푸시가 연결되지 않은 데모 상태를 명확히 표시한다.
5. 여행계획서 장소는 바로 확정하지 않고 미리보기·선택 후 등록 흐름으로 보완한다.
6. 기존 데모 모드와 `OPENROUTER_API_KEY` 서버 경계를 깨뜨리지 않는다.

## 이번 작업에서 하지 않을 것

- Google Maps API 키를 코드에 추가하지 않는다.
- 자동 예약·결제, 전체 문자 수집, 24시간 위치 추적을 구현하지 않는다.
- 실제 FCM/APNs·Upstash를 키 없이 가짜로 구현하지 않는다.
- 사용자가 확인하지 않은 AI 결과를 일정·지출로 확정하지 않는다.
- 커밋·push는 하지 않는다. Claude는 코드만 수정하고 최종 판단은 supervisor가 한다.

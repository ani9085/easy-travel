# easy-travel 네이티브 안드로이드 앱

기준일: 2026-11-01

## 결론 (변경)

Codex가 만든 Capacitor 프로젝트(웹 화면을 WebView로 여는 껍데기)는 사용자 요청에 따라 **Kotlin·Jetpack Compose 네이티브 앱으로 교체**했습니다.

- **부모님 앱(안드로이드, 네이티브)**: 일정·숙소 길찾기·긴급전화·자주 쓰는 말·환율·기록이 앱 안에 있어 해외에서 데이터가 끊겨도 열립니다. 서버는 AI(통역·사진)와 항공 가격 조회에만 씁니다.
- **보호자 웹(Next.js/Vercel)**: 계획·AI 추천·항공 조회·비교는 지금처럼 웹에서 하고, **‘부모님 앱으로 보내기’ 링크**로 여행을 앱에 넣습니다.
- 로그인 없음. 정식 주소의 Vercel 배포 보호는 2026-11-01에 껐습니다(미리보기 주소도 함께 공개됨). AI·항공 API는 같은 출처 확인·가족 접속 코드·요청 횟수 제한으로 보호합니다.

## 앱 구성 (`android/`)

```text
android/app/src/main/java/com/ani9085/easytravel/
  data/Models.kt          Trip·일정·기록·가격 감시 모델 (웹 lib/trip.ts와 같은 뜻)
  data/TripLogic.kt       날짜 검증, 목적지 시간대 기준 '오늘', 다음 일정, 기록
  data/TripCodec.kt       저장 JSON, 보호자 웹 링크(payload) 해석
  data/Destinations.kt    assets/destinations.json(웹 lib/destinations.ts에서 내보냄)
  data/TripStore.kt       SharedPreferences 저장(이 휴대폰만)
  net/Api.kt              /api/ai, /api/flights/search, Frankfurter 환율
  util/Device.kt          구글 지도·전화·카톡 공유·읽어주기(TTS)·사진 축소·1회 위치
  work/PriceWatchWorker   WorkManager 12시간 간격 가격 확인 → 목표가 이하 알림
  ui/                     Compose 화면: 처음·일정·통역·돈 계산·여기 어디?·숙소 도착·도움·설정·가져오기
```

| 기능 | 앱에서 | 서버 필요 |
|---|---|---|
| 다음에 갈 곳 · 도착/다 봤어요/건너뛰기 · 되돌리기 | ✅ | 아니오 |
| 숙소로 가기 · 장소 길찾기 | Google 지도 앱으로 | 아니오 |
| 통역(한↔현지어) | ✅ 말로 넣기(휴대폰 음성 인식) · 읽어주기(기기 음성) · 크게 보기 · 자주 쓰는 말 | 번역만 |
| 돈 계산 | ✅ 마지막 환율 저장 | 환율 새로 받을 때만 |
| 여기 어디? | ✅ 카메라·갤러리 → 1280px·EXIF 제거 | AI 분석 |
| 숙소 도착 알리기 · 도움 요청 · 안부 | ✅ 기록 + 카카오톡으로 바로 공유(없으면 공유 창) · 위치는 고를 때만 | 아니오 |
| 긴급전화 | 전화 앱에 번호만 채움(통화는 사용자가 누름) | 아니오 |
| 항공 가격 감시 | ✅ 하루 두 번쯤 확인 · 알림 | `DUFFEL_ACCESS_TOKEN` 필요 |
| 보호자 웹 여행 가져오기 | ✅ 링크 탭 또는 붙여넣기 | 아니오(링크에 담김) |

## 보호자 웹 → 앱 링크

`lib/shareLink.ts`가 여행 요약(목적지·날짜·인원·숙소·긴급번호·호칭·공항 코드·일정 이름)을 base64url JSON으로 만들어 `https://<사이트>/send#<payload>`로 보냅니다. `#` 뒤라 서버로 전송·저장되지 않습니다. `/send` 화면의 ‘앱에서 열기’는 `intent://import?d=…;scheme=easytravel;package=com.ani9085.easytravel`로 앱을 엽니다. 기록·위치·항공 결과는 링크에 넣지 않습니다. 형식이 바뀌면 웹 테스트(`tests/shareLink.test.ts`)와 앱 테스트(`TripCodecTest`)가 같은 고정 payload로 함께 깨집니다.

## 빌드

```powershell
npm run android:data      # 웹 → 앱 데이터(목적지, 테스트 payload) 내보내기
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat testDebugUnitTest assembleDebug        # 디버그 APK
.\gradlew.bat bundleRelease assembleRelease          # 플레이 콘솔용 AAB + 서명된 APK
```

- `android/local.properties`(커밋하지 않음): `sdk.dir`, `API_BASE_URL`(기본 운영 주소), `FAMILY_ACCESS_CODE`(서버에 접속 코드를 설정한 경우).
- `android/keystore.properties` + `android/easytravel-upload.jks`(커밋하지 않음): 업로드 키. **잃어버리면 플레이 콘솔에서 업로드 키 재설정을 요청해야 하므로 안전한 곳에 따로 백업**합니다.
- 툴체인: AGP 8.5.2 · Kotlin 1.9.24 · Gradle 8.9 · Compose BOM 2024.06.00 · compileSdk/targetSdk 36 · minSdk 26 (진실판별기와 같은 조합).

## 배포 (가족만)

플레이 콘솔 → 앱 만들기(`com.ani9085.easytravel`) → **테스트 > 내부 테스트**에 `app-release.aab` 업로드 → 테스터(가족 Google 계정) 추가 → 참여 링크를 가족에게 보냄. 정식 공개 없이 가족만 플레이스토어로 설치·자동 업데이트됩니다. 개인정보처리방침 URL과 데이터 보안 양식(위치: 사용자가 고를 때 1회, 공유 글에만 포함 · 사진: AI 분석용 전송, 저장 안 함)이 필요합니다.

## 남은 일

- 실기기 검증(카톡 바로 공유, 음성 인식·읽어주기, 카메라, 위치 권한 거부, 가격 감시 알림, 절전 모드)
- 플레이 콘솔 업로드·내부 테스트 구성, 개인정보처리방침 페이지
- App Links(https 링크가 브라우저 없이 바로 앱으로) — 플레이 앱 서명 키 SHA-256을 `assetlinks.json`에 등록한 뒤
- 서버 공유(가족 여러 기기 동기화)·카카오 로그인은 P2

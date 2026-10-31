# easy-travel 네이티브 APK 전환 계획

기준일: 2026-10-31

## 결론

현재 Next.js 화면과 Vercel API는 유지하고, Android 앱은 Capacitor 기반 APK로 감쌉니다. 화면과 Trip 모델을 다시 만들지 않고 재사용하되, 다음 기능은 Android 네이티브 계층에서 담당합니다.

- Android WorkManager: 항공 가격을 하루 2회 확인하고 로컬 알림 표시
- 위치 권한·GPS: 사용자가 누른 안부/SOS 때만 현재 위치를 읽음. 자동 추적은 별도 동의와 정책 검토 뒤에 추가
- Android 알림: 가격 목표 도달, 가족 확인 요청 등 기기 알림
- 외부 지도 앱: 목적지 길찾기는 Google Maps URL을 열어 처리

## 현재 로컬 빌드 상태

- Android Studio: 설치됨
- Android SDK: 설치됨(API 36 계열, Build Tools 34.0.0 포함)
- Android Studio 내장 JDK: 21.0.10
- Capacitor: `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` 설치 완료
- Android 프로젝트: `android/` 생성 완료
- Debug APK: 빌드 성공. `android/app/build/outputs/apk/debug/app-debug.apk`
- 실기기/에뮬레이터: 현재 `adb devices`에 연결된 장치 없음

현재 APK는 테스트용으로 `CAPACITOR_SERVER_URL`에 지정한 웹 서버를 WebView에서 엽니다. 이번 검증 APK는 에뮬레이터에서 호스트의 개발 서버를 보기 위해 `http://10.0.2.2:51234`를 사용했습니다. 부모님 배포용 APK는 Vercel Deployment Protection을 정리한 운영 URL로 다시 빌드해야 합니다.

## 현재와 APK의 경계

```text
Android APK (Capacitor)
  ├─ 부모님/보호자 메뉴와 Trip local cache
  ├─ GPS·알림·WorkManager 네이티브 플러그인
  └─ HTTPS
       └─ Next.js/Vercel API
            ├─ /api/ai       → OpenRouter
            └─ /api/flights/search → Duffel(서버 Secret)
```

OpenRouter와 Duffel 키는 APK 안에 넣지 않습니다. APK에 키를 넣으면 추출할 수 있으므로, 서버 환경변수에만 보관합니다. 부모님이 입력하는 AI 접속 코드는 키가 아니라 서버가 허용 여부를 확인하기 위한 보조 코드입니다.

## 가격 감시

여행 계획에서 목표 금액과 `08:00`, `20:00`을 저장합니다. 현재 웹 화면은 조건을 저장하는 단계이고, APK에서 다음 순서로 실제 동작하게 합니다.

1. WorkManager가 배터리·네트워크 조건을 확인합니다.
2. `/api/flights/search`를 호출합니다.
3. 결과가 목표 금액 이하이면 로컬 알림을 표시합니다.
4. 마지막 확인 시각과 결과를 Trip에 저장합니다.

정확히 08:00/20:00에 실행된다고 보장하면 안 됩니다. Android 절전 정책에 따라 지연될 수 있고, 항공 가격·좌석도 조회 시점의 결과입니다. Vercel Hobby Cron을 이 기능의 기준으로 쓰지 않습니다. Hobby 플랜의 Cron 빈도 제한 때문에 하루 2회 보장이 되지 않으므로, APK의 WorkManager가 주 실행자가 되어야 합니다.

## 단계

### A. 지금 반영된 웹 단계

- 새 여행은 빈 계획에서 시작
- 부모님 화면에 `여행 계획 세우기` 메뉴 추가
- 보호자 화면을 스크롤형 단일 화면이 아닌 메뉴별 화면으로 분리
- Mock 항공·숙소 묶음을 기본 화면에서 제거
- OpenRouter 구조화 일정·숙소 후보 추천 및 사용자 수정/확정 흐름 추가
- Duffel 실제 항공 검색 API 어댑터 추가(토큰이 없으면 명확한 설정 오류)

### B. APK 골격

- Android Studio와 Android SDK 설치 완료
- Capacitor Android 프로젝트 생성 및 Gradle wrapper 빌드 완료
- `CAPACITOR_SERVER_URL` 기반 WebView 주소 설정 완료
- debug APK 생성 확인 완료
- Android 권한 문구와 개인정보 처리방침 작성
- WorkManager 네이티브 플러그인 또는 전용 Kotlin 브리지 추가
- 실기기에서 백그라운드 실행·알림·저전력 모드 검증

### Debug APK 빌드

```powershell
$env:CAPACITOR_SERVER_URL = "https://운영-주소"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx cap sync android
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

생성 파일은 `android/app/build/outputs/apk/debug/app-debug.apk`다. `android/`의 Gradle·build 산출물과 Capacitor 동기화 assets는 `.gitignore` 정책을 따른다.

### C. 서버 공유

현재 Trip은 `localStorage` 한 기기에만 있습니다. 부모님과 자녀가 서로 다른 휴대폰에서 같은 계획과 안부를 보려면 다음 단계에서 서버 DB·가족 권한·초대/철회·삭제 기능이 필요합니다. APK를 먼저 만든다고 이 권한 문제가 자동으로 해결되지는 않습니다.

## 배포 전 체크

- Vercel Deployment Protection을 부모님이 접근할 수 있는 방식으로 조정
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`은 Secret 환경변수
- `DUFFEL_ACCESS_TOKEN`은 항공 공급자 Secret 환경변수
- APK WebView를 허용할 때만 `EASY_TRAVEL_APP_ORIGINS=capacitor://localhost`를 추가하고, 다른 Origin은 넣지 않음
- API 사용량·월 한도·실패 시 재시도 정책 설정
- 실시간 가격·숙소 재고·AI 추천에 “참고용/예약 대체 아님” 표시 유지
- 위치는 기본적으로 수집하지 않고, 사용자가 안부/SOS 화면에서 선택한 경우에만 요청

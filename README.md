# easy-travel
부모님 여행 도우미 앱

- [제품 지도 및 MVP 범위](./EASY_TRAVEL_PRODUCT_MAP_KO.md)

## 현재 MVP

가족이 부모님의 해외여행을 함께 준비하고 확인하는 웹 MVP입니다.

- Google Maps 길찾기와 호텔 복귀 주소
- 현지 통화·원화 환전 계산
- 자주 쓰는 말과 OpenRouter 기반 통역 경계
- 사진으로 장소 확인하는 AI 경계
- 여행계획서 텍스트에서 장소 후보 등록
- 가족 코드 기반 공유 링크 데모
- 수동 안부 체크인과 SOS 보조 화면

현재는 외부 키 없이도 데모 모드로 실행됩니다. 실제 AI 기능은 서버에서만 `OPENROUTER_API_KEY`를 읽도록 구성했습니다.

## 실행

```bash
npm install
npm run dev
```

선택 환경변수:

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_SITE_URL=http://localhost:3000
```

가격·위치·AI 결과는 참고용입니다. 이 MVP는 예약·결제·긴급 구조를 대신하지 않습니다.

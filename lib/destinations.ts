// ---------------------------------------------------------------------------
// 목적지 프로필 — 문장·통화·언어·시간대·데모 항공사·비용 계수를 한 곳에서 정합니다.
// 화면(page.tsx)과 서버(api/ai)가 같은 프로필을 씁니다.
// 비용 계수와 항공사는 데모용 가정이며 실제 시세가 아닙니다.
// 긴급번호는 일부러 넣지 않습니다. 가족이 직접 확인해 입력합니다(README 참고).
// ---------------------------------------------------------------------------

export type DestinationId = "france" | "japan" | "thailand" | "vietnam" | "other";

export type Phrase = { ko: string; local: string };

export type DestinationProfile = {
  id: DestinationId;
  country: string;
  keywords: string[];
  /** 화면에 보여줄 언어 이름 */
  languageName: string;
  /** AI 프롬프트에 넣을 영어 언어 이름 */
  languageEnglish: string;
  /** Web Speech·TTS용 BCP 47 코드 */
  speechLang: string;
  /** 기본 현지 통화. 알 수 없는 목적지는 null(사용자 선택 유지) */
  currency: string | null;
  /** "오늘"을 계산할 IANA 시간대. 알 수 없으면 null(기기 시간 사용) */
  timeZone: string | null;
  phrases: Phrase[];
  demoAirlines: [string, string, string];
  flightPerPersonKrw: number;
  dailyPerPersonKrw: number;
};

const PROFILES: DestinationProfile[] = [
  {
    id: "france",
    country: "프랑스",
    keywords: ["프랑스", "파리", "니스", "리옹", "마르세유", "france", "paris", "nice", "lyon"],
    languageName: "프랑스어",
    languageEnglish: "French",
    speechLang: "fr-FR",
    currency: "EUR",
    timeZone: "Europe/Paris",
    phrases: [
      { ko: "화장실이 어디예요?", local: "Où sont les toilettes ?" },
      { ko: "이 주소로 가 주세요.", local: "À cette adresse, s'il vous plaît." },
      { ko: "천천히 말해 주세요.", local: "Parlez lentement, s'il vous plaît." },
      { ko: "도와주세요.", local: "Aidez-moi, s'il vous plaît." }
    ],
    demoAirlines: ["대한항공", "아시아나항공", "에어프랑스"],
    flightPerPersonKrw: 1_200_000,
    dailyPerPersonKrw: 180_000
  },
  {
    id: "japan",
    country: "일본",
    keywords: ["일본", "도쿄", "오사카", "교토", "후쿠오카", "삿포로", "오키나와", "나고야", "japan", "tokyo", "osaka", "kyoto", "fukuoka", "sapporo"],
    languageName: "일본어",
    languageEnglish: "Japanese",
    speechLang: "ja-JP",
    currency: "JPY",
    timeZone: "Asia/Tokyo",
    phrases: [
      { ko: "화장실이 어디예요?", local: "お手洗いはどこですか？" },
      { ko: "이 주소로 가 주세요.", local: "この住所までお願いします。" },
      { ko: "천천히 말해 주세요.", local: "ゆっくり話してください。" },
      { ko: "도와주세요.", local: "助けてください。" }
    ],
    demoAirlines: ["대한항공", "아시아나항공", "일본항공"],
    flightPerPersonKrw: 650_000,
    dailyPerPersonKrw: 130_000
  },
  {
    id: "thailand",
    country: "태국",
    keywords: ["태국", "방콕", "치앙마이", "푸켓", "파타야", "thailand", "bangkok", "chiang mai", "phuket"],
    languageName: "태국어",
    languageEnglish: "Thai",
    speechLang: "th-TH",
    currency: "THB",
    timeZone: "Asia/Bangkok",
    phrases: [
      { ko: "화장실이 어디예요?", local: "ห้องน้ำอยู่ที่ไหนครับ/คะ" },
      { ko: "이 주소로 가 주세요.", local: "ไปที่อยู่นี้ครับ/ค่ะ" },
      { ko: "천천히 말해 주세요.", local: "พูดช้าๆ หน่อยครับ/ค่ะ" },
      { ko: "도와주세요.", local: "ช่วยด้วยครับ/ค่ะ" }
    ],
    demoAirlines: ["대한항공", "아시아나항공", "타이항공"],
    flightPerPersonKrw: 480_000,
    dailyPerPersonKrw: 90_000
  },
  {
    id: "vietnam",
    country: "베트남",
    keywords: ["베트남", "다낭", "하노이", "호치민", "나트랑", "푸꾸옥", "vietnam", "da nang", "danang", "hanoi", "ho chi minh", "nha trang"],
    languageName: "베트남어",
    languageEnglish: "Vietnamese",
    speechLang: "vi-VN",
    currency: "VND",
    timeZone: "Asia/Ho_Chi_Minh",
    phrases: [
      { ko: "화장실이 어디예요?", local: "Nhà vệ sinh ở đâu ạ?" },
      { ko: "이 주소로 가 주세요.", local: "Cho tôi đến địa chỉ này." },
      { ko: "천천히 말해 주세요.", local: "Xin nói chậm lại." },
      { ko: "도와주세요.", local: "Xin giúp tôi với." }
    ],
    demoAirlines: ["대한항공", "베트남항공", "비엣젯항공"],
    flightPerPersonKrw: 480_000,
    dailyPerPersonKrw: 90_000
  }
];

/** 프로필에 없는 목적지: 영어 문장으로 대신하고 통화·시간대는 정하지 않습니다. */
export const OTHER_DESTINATION: DestinationProfile = {
  id: "other",
  country: "기타 지역",
  keywords: [],
  languageName: "영어",
  languageEnglish: "",
  speechLang: "en-US",
  currency: null,
  timeZone: null,
  phrases: [
    { ko: "화장실이 어디예요?", local: "Where is the restroom?" },
    { ko: "이 주소로 가 주세요.", local: "Please take me to this address." },
    { ko: "천천히 말해 주세요.", local: "Please speak slowly." },
    { ko: "도와주세요.", local: "Please help me." }
  ],
  demoAirlines: ["대한항공", "아시아나항공", "외국 항공사"],
  flightPerPersonKrw: 1_200_000,
  dailyPerPersonKrw: 180_000
};

export function profileForDestination(destination: string): DestinationProfile {
  const value = destination.trim().toLowerCase();
  if (!value) return OTHER_DESTINATION;
  return PROFILES.find((profile) => profile.keywords.some((keyword) => value.includes(keyword))) || OTHER_DESTINATION;
}

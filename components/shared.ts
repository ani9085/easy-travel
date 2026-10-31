// 부모님·보호자 화면이 함께 쓰는 브라우저 도우미(지도 링크·전화·AI 헤더·공유).

// ---------------------------------------------------------------------------
// Google Maps URLs — 이 블록에서만 지도 URL을 만듭니다.
// https://developers.google.com/maps/documentation/urls/get-started
// API 키 없이 Android/iOS/웹에서 Google Maps 앱 또는 브라우저를 엽니다.
// ---------------------------------------------------------------------------
export type TravelMode = "" | "walking" | "transit" | "driving";

export const travelModes: Array<{ value: TravelMode; label: string }> = [
  { value: "", label: "이동수단 자동" },
  { value: "walking", label: "🚶 걸어서" },
  { value: "transit", label: "🚇 대중교통" },
  { value: "driving", label: "🚕 자동차·택시" }
];

function buildMapsUrl(path: "search" | "dir", params: Record<string, string | undefined>) {
  const query = Object.entries({ api: "1", ...params })
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `https://www.google.com/maps/${path}/?${query}`;
}

/** 장소·지역을 지도에서 검색합니다. */
export function mapsSearchUrl(query: string) {
  return buildMapsUrl("search", { query: query.trim() });
}

/** 현재 위치에서 목적지까지 길찾기를 엽니다. 이동수단을 비우면 Google Maps가 고릅니다. */
export function mapsDirectionsUrl(destination: string, travelMode: TravelMode = "") {
  return buildMapsUrl("dir", { destination: destination.trim(), travelmode: travelMode || undefined });
}

export function openMapsUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// 긴급전화 — 앱이 나라별 긴급번호를 정하지 않습니다. 가족이 확인해 넣은 번호만 씁니다.
// 영사콜센터 번호 출처: 외교부 해외안전여행 https://0404.go.kr/
// ---------------------------------------------------------------------------
export type CallTarget = { label: string; display: string; href: string };

export const CONSULAR_CALL: CallTarget = { label: "외교부 영사콜센터", display: "+82-2-3210-0404", href: "tel:+82232100404" };

/** 입력한 현지 긴급번호를 tel: 링크로 바꿉니다. 숫자 2–15자리(앞의 + 허용)가 아니면 null입니다. */
export function localEmergencyCall(value: string): CallTarget | null {
  const display = value.trim();
  const dial = display.replace(/[\s().-]/g, "");
  if (!/^\+?\d{2,15}$/.test(dial)) return null;
  return { label: "현지 긴급번호", display, href: `tel:${dial}` };
}

// ---------------------------------------------------------------------------
// AI 호출 — 접속 코드는 여행 데이터가 아니라 이 기기 설정입니다.
// ---------------------------------------------------------------------------
export const ACCESS_CODE_STORAGE_KEY = "easy-travel:ai-access-code";

export function readAccessCode() {
  try {
    return window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function aiHeaders(accessCode: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessCode.trim()) headers["x-easy-travel-code"] = accessCode.trim();
  return headers;
}

export type AiResponse = { result?: string; error?: string; mode?: string };

export async function postAi(body: Record<string, unknown>): Promise<{ ok: boolean; data: AiResponse }> {
  try {
    const response = await fetch("/api/ai", { method: "POST", headers: aiHeaders(readAccessCode()), body: JSON.stringify(body) });
    const data = (await response.json()) as AiResponse;
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: { error: "AI 서버에 연결하지 못했어요." } };
  }
}

// ---------------------------------------------------------------------------
// 시각·문장
// ---------------------------------------------------------------------------
export function formatTime(value: string | null) {
  if (!value) return "아직 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatWon(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

/** 이름 뒤 조사(이/가). 받침이 있으면 “이”. 이름이 없으면 “부모님이”. */
export function subjectOf(name: string) {
  const value = name.trim() || "부모님";
  const last = value.charCodeAt(value.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${value}${hasFinal ? "이" : "가"}`;
}

// ---------------------------------------------------------------------------
// 가족에게 알리기 — 카카오톡 등 휴대폰 공유 창을 엽니다(서버·카카오 키 불필요).
// 실제로 보냈는지는 앱이 알 수 없으므로 “공유 창을 열었어요”까지만 말합니다.
// ---------------------------------------------------------------------------
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function shareOutcomeMessage(outcome: ShareOutcome) {
  if (outcome === "shared") return "공유 창을 열었어요. 카카오톡에서 가족 채팅방을 고르고 ‘보내기’를 눌러야 전달돼요.";
  if (outcome === "copied") return "알림 글을 복사했어요. 카카오톡을 열어 가족 채팅방에 붙여넣어 보내 주세요.";
  if (outcome === "cancelled") return "보내지 않았어요. 필요하면 다시 눌러 주세요.";
  return "이 기기에서는 공유가 막혀 있어요. 가족에게 전화로 알려 주세요.";
}

export type Position = { lat: number; lng: number; accuracy: number };

/** 사용자가 고른 순간에만 한 번 위치를 받습니다. 실패하면 null. */
export function getPositionOnce(): Promise<Position | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: Number(position.coords.latitude.toFixed(5)), lng: Number(position.coords.longitude.toFixed(5)), accuracy: Math.round(position.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export function positionLink(position: Position) {
  return mapsSearchUrl(`${position.lat},${position.lng}`);
}

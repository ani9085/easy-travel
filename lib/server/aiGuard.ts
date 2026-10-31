// ---------------------------------------------------------------------------
// /api/ai 보호 — 같은 출처 확인 · 가족 접속 코드(선택) · 요청 횟수 제한 · 입력 검증
// 횟수 제한은 서버 인스턴스 메모리 기준이라 여러 인스턴스에 걸친 정확한 상한은 아닙니다.
// 확실한 비용 상한은 OpenRouter 키의 사용 한도(credit limit)로 겁니다.
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from "node:crypto";
import { languageOption } from "../destinations.ts";

export type AiTask = "translate" | "photo_location";

export type TranslateDirection = "to_local" | "to_korean";

export type AiRequest =
  | { task: "translate"; text: string; destination: string; direction: TranslateDirection; language: string | null }
  | { task: "photo_location"; image: string; destination: string };

export const MAX_BODY_BYTES = 4_500_000;
/** base64 data URL 기준, 원본 약 3MB. 클라이언트(page.tsx)와 같은 값입니다. */
export const MAX_IMAGE_CHARS = 4_000_000;
export const MAX_TRANSLATE_CHARS = 1000;
export const MAX_DESTINATION_CHARS = 120;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** 작업마다 비용이 달라 횟수 제한에 다른 무게를 줍니다. */
export const TASK_COST: Record<AiTask, number> = { translate: 1, photo_location: 4 };

export type Rejection = { status: number; error: string; code: string };

// 제어 문자(줄바꿈·탭 제외)는 프롬프트에 넣지 않습니다.
function stripControl(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function validateAiRequest(body: unknown): { ok: true; value: AiRequest } | ({ ok: false } & Rejection) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, status: 400, error: "요청 형식이 올바르지 않습니다.", code: "bad_request" };
  const data = body as Record<string, unknown>;
  const destination = typeof data.destination === "string" ? stripControl(data.destination).trim().slice(0, MAX_DESTINATION_CHARS) : "";
  if (data.task === "translate") {
    if (typeof data.text !== "string" || !data.text.trim()) return { ok: false, status: 400, error: "번역할 문장이 비어 있어요.", code: "empty_text" };
    if (data.text.length > MAX_TRANSLATE_CHARS) return { ok: false, status: 413, error: `문장이 너무 길어요. ${MAX_TRANSLATE_CHARS.toLocaleString("ko-KR")}자 이내로 줄여 주세요.`, code: "text_too_long" };
    const direction: TranslateDirection = data.direction === "to_korean" ? "to_korean" : "to_local";
    if (data.language !== undefined && !languageOption(typeof data.language === "string" ? data.language : undefined)) return { ok: false, status: 400, error: "지원하지 않는 언어예요.", code: "bad_language" };
    const language = typeof data.language === "string" ? data.language : null;
    return { ok: true, value: { task: "translate", text: stripControl(data.text).trim(), destination, direction, language } };
  }
  if (data.task === "photo_location") {
    if (typeof data.image !== "string") return { ok: false, status: 400, error: "분석할 사진이 없어요.", code: "no_image" };
    if (data.image.length > MAX_IMAGE_CHARS) return { ok: false, status: 413, error: "사진이 너무 커요. 더 작은 사진으로 다시 시도해 주세요.", code: "image_too_large" };
    if (!IMAGE_DATA_URL.test(data.image)) return { ok: false, status: 400, error: "JPEG·PNG·WEBP 사진만 분석할 수 있어요.", code: "bad_image" };
    return { ok: true, value: { task: "photo_location", image: data.image, destination } };
  }
  return { ok: false, status: 400, error: "지원하지 않는 AI 작업입니다.", code: "unknown_task" };
}

/** 프록시 뒤(Vercel)에서는 x-forwarded-host가 실제 주소입니다. */
function requestHost(headers: Headers) {
  return (headers.get("x-forwarded-host") || headers.get("host") || "").split(",")[0].trim().toLowerCase();
}

/**
 * 브라우저는 POST에 Origin을 붙입니다. 다른 사이트에서 온 요청은 막고,
 * Origin이 없는 요청(스크립트·curl)은 접속 코드가 맞을 때만 허용합니다.
 */
export function checkOrigin(headers: Headers, hasValidAccessCode: boolean): Rejection | null {
  const origin = headers.get("origin");
  const host = requestHost(headers);
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      originHost = "";
    }
    if (originHost && originHost === host) return null;
    return { status: 403, error: "이 사이트에서만 AI 기능을 쓸 수 있어요.", code: "cross_origin" };
  }
  if (headers.get("sec-fetch-site") === "same-origin" || hasValidAccessCode) return null;
  return { status: 403, error: "이 사이트에서만 AI 기능을 쓸 수 있어요.", code: "missing_origin" };
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** 접속 코드가 설정되지 않았으면 항상 true. 비교는 길이·내용이 새지 않게 해시로 합니다. */
export function accessCodeMatches(provided: string | null, expected: string | undefined) {
  if (!expected) return true;
  if (!provided) return false;
  return timingSafeEqual(digest(provided.trim()), digest(expected.trim()));
}

export function clientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}

export type RateLimitOptions = { windowMs: number; maxPerClient: number; maxTotal: number; maxClients?: number };
export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

/** 고정 시간 창 방식의 메모리 제한. 사람당 한도와 인스턴스 전체 한도를 함께 봅니다. */
export function createRateLimiter(options: RateLimitOptions) {
  const clients = new Map<string, { used: number; resetAt: number }>();
  let total = { used: 0, resetAt: 0 };
  const maxClients = options.maxClients ?? 5000;

  return function take(key: string, cost: number, now: number): RateDecision {
    if (now >= total.resetAt) total = { used: 0, resetAt: now + options.windowMs };
    if (clients.size > maxClients) {
      clients.forEach((entry, entryKey) => {
        if (now >= entry.resetAt) clients.delete(entryKey);
      });
    }
    let entry = clients.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { used: 0, resetAt: now + options.windowMs };
      clients.set(key, entry);
    }
    if (entry.used + cost > options.maxPerClient) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    if (total.used + cost > options.maxTotal) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((total.resetAt - now) / 1000)) };
    entry.used += cost;
    total.used += cost;
    return { ok: true };
  };
}

// ---------------------------------------------------------------------------
// 보호자 웹 → 부모님 안드로이드 앱으로 여행 보내기.
// 서버에 저장하지 않고, 링크의 # 뒤(서버로 전송되지 않는 부분)에 여행 요약을 담습니다.
// 형식은 앱의 TripCodec.decodeShare와 같습니다: base64url(UTF-8 JSON {v:1, profile, itinerary, sentAt})
// ---------------------------------------------------------------------------

import type { Trip } from "./trip.ts";

export const ANDROID_PACKAGE = "com.ani9085.easytravel";
export const MAX_SHARE_PLACES = 60;

export type SharePayload = {
  v: 1;
  profile: {
    destination: string;
    departure: string;
    originIata: string;
    destinationIata: string;
    startDate: string;
    endDate: string;
    travelers: number;
    hotel: string;
    emergencyNumber: string;
    travelerName: string;
  };
  itinerary: Array<{ day: number; name: string; note: string }>;
  sentAt: string;
};

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** 여행에서 부모님 앱에 필요한 것만 담습니다. 기록·위치·항공 결과는 넣지 않습니다. */
export function buildSharePayload(trip: Trip, now: string): string {
  const p = trip.profile;
  const payload: SharePayload = {
    v: 1,
    profile: {
      destination: p.destination,
      departure: p.departure,
      originIata: p.originIata,
      destinationIata: p.destinationIata,
      startDate: p.startDate,
      endDate: p.endDate,
      travelers: p.travelers,
      hotel: p.hotel,
      emergencyNumber: p.emergencyNumber,
      travelerName: p.travelerName
    },
    itinerary: [...trip.itinerary].sort((a, b) => a.day - b.day).slice(0, MAX_SHARE_PLACES).map((item) => ({ day: item.day, name: item.name, note: item.note })),
    sentAt: now
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSharePayload(value: string): SharePayload | null {
  try {
    const data = JSON.parse(fromBase64Url(value.trim())) as Partial<SharePayload>;
    if (data.v !== 1 || !data.profile || typeof data.profile.destination !== "string" || !data.profile.destination.trim()) return null;
    return { v: 1, profile: data.profile, itinerary: Array.isArray(data.itinerary) ? data.itinerary : [], sentAt: typeof data.sentAt === "string" ? data.sentAt : "" };
  } catch {
    return null;
  }
}

export function shareLink(origin: string, payload: string) {
  return `${origin.replace(/\/$/, "")}/send#${payload}`;
}

/** 크롬·카카오톡 브라우저에서 부모님 앱을 바로 여는 주소. */
export function appIntentUrl(payload: string) {
  return `intent://import?d=${payload}#Intent;scheme=easytravel;package=${ANDROID_PACKAGE};end`;
}

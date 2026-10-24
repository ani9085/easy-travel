import { NextResponse } from "next/server";

type AiRequest = {
  task?: "translate" | "photo_location" | "itinerary_import";
  text?: string;
  destination?: string;
  image?: string;
};

// 요청 크기 제한: 클라이언트는 사진을 1280px JPEG로 줄여 보내므로 보통 수백 KB입니다.
const MAX_BODY_BYTES = 4_500_000;
const MAX_IMAGE_CHARS = 4_000_000; // base64 data URL 기준, 원본 약 3MB
const MAX_TEXT_CHARS = { translate: 1000, itinerary_import: 6000, photo_location: 0 } as const;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_TOKENS = { translate: 200, itinerary_import: 800, photo_location: 400 } as const;

const demoResults = {
  translate: "데모 모드입니다. OpenRouter API 키를 연결하면 여행지 언어로 번역해 드려요.",
  photo_location: "데모 모드입니다. OpenRouter API 키를 연결하면 간판·건물·랜드마크를 분석해 장소 후보를 알려 드려요.",
  itinerary_import: "데모 모드입니다. OpenRouter API 키를 연결하면 계획서에서 날짜별 장소를 추출해요."
};

function promptFor(task: AiRequest["task"], body: AiRequest) {
  if (task === "translate") {
    return `You are a careful travel interpreter. Translate the following Korean sentence into the most useful local language for a traveler in ${body.destination || "the destination"}. Return only the translation, with no explanation. Korean sentence: ${body.text || ""}`;
  }
  if (task === "itinerary_import") {
    return `Extract travel places from this itinerary text. Return JSON only as an array of objects with day (number), name (string), and note (string). Do not invent places. Text: ${body.text || ""}`;
  }
  return `Identify likely places in this travel photo for a traveler currently visiting ${body.destination || "an unknown destination"}. Return a short Korean answer with up to three candidate places and a confidence note. Never claim certainty from visual clues alone.`;
}

function reject(error: string, status: number) {
  return NextResponse.json({ error, mode: "error" }, { status });
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return reject("요청이 너무 커요. 사진을 더 작게 해서 다시 시도해 주세요.", 413);

  let body: AiRequest;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reject("요청이 너무 커요. 사진을 더 작게 해서 다시 시도해 주세요.", 413);
    body = JSON.parse(raw) as AiRequest;
    if (!body || typeof body !== "object") throw new Error("body");
  } catch {
    return reject("요청 형식이 올바르지 않습니다.", 400);
  }

  const task = body.task;
  if (!task || !["translate", "photo_location", "itinerary_import"].includes(task)) {
    return reject("지원하지 않는 AI 작업입니다.", 400);
  }

  if (task === "photo_location") {
    if (typeof body.image !== "string") return reject("분석할 사진이 없어요.", 400);
    if (body.image.length > MAX_IMAGE_CHARS) return reject("사진이 너무 커요. 더 작은 사진으로 다시 시도해 주세요.", 413);
    if (!IMAGE_DATA_URL.test(body.image)) return reject("JPEG·PNG·WEBP 사진만 분석할 수 있어요.", 400);
  } else if (typeof body.text !== "string" || !body.text.trim()) {
    return reject("분석할 문장이 비어 있어요.", 400);
  } else if (body.text.length > MAX_TEXT_CHARS[task]) {
    return reject(`문장이 너무 길어요. ${MAX_TEXT_CHARS[task].toLocaleString("ko-KR")}자 이내로 줄여 주세요.`, 413);
  }
  if (typeof body.destination === "string") body.destination = body.destination.slice(0, 120);

  // 키는 서버 환경변수에서만 읽고, 키·원본 사진은 로그에 남기지 않습니다.
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ result: demoResults[task], mode: "demo" });

  // 사진 작업은 이미지 입력을 지원하는 모델이어야 하므로 별도 환경변수로 바꿀 수 있습니다.
  const model = (task === "photo_location" && process.env.OPENROUTER_VISION_MODEL) || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const content = task === "photo_location" && body.image
    ? [
        { type: "text", text: promptFor(task, body) },
        { type: "image_url", image_url: { url: body.image } }
      ]
    : promptFor(task, body);

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": "easy-travel"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: MAX_TOKENS[task],
        messages: [{ role: "user", content }]
      })
    });

    if (!upstream.ok) return NextResponse.json({ result: "AI 서비스가 잠시 쉬고 있어요. 직접 입력으로 계속할 수 있어요.", mode: "fallback" });
    const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) return NextResponse.json({ result: "AI가 답을 주지 않았어요. 직접 입력으로 계속할 수 있어요.", mode: "fallback" });
    return NextResponse.json({ result, mode: "openrouter" });
  } catch {
    return NextResponse.json({ result: "AI 연결에 실패했어요. 직접 입력으로 계속할 수 있어요.", mode: "fallback" });
  }
}

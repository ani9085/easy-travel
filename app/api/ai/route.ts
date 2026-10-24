import { NextResponse } from "next/server";

type AiRequest = {
  task?: "translate" | "photo_location" | "itinerary_import";
  text?: string;
  destination?: string;
  image?: string;
};

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

export async function POST(request: Request) {
  let body: AiRequest;
  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const task = body.task;
  if (!task || !["translate", "photo_location", "itinerary_import"].includes(task)) {
    return NextResponse.json({ error: "지원하지 않는 AI 작업입니다." }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ result: demoResults[task], mode: "demo" });

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
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 500,
        messages: [{ role: "user", content }]
      })
    });

    if (!upstream.ok) return NextResponse.json({ result: "AI 서비스가 잠시 쉬고 있어요. 직접 입력으로 계속할 수 있어요.", mode: "fallback" });
    const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const result = data.choices?.[0]?.message?.content?.trim();
    return NextResponse.json({ result: result || demoResults[task], mode: "openrouter" });
  } catch {
    return NextResponse.json({ result: "AI 연결에 실패했어요. 직접 입력으로 계속할 수 있어요.", mode: "fallback" });
  }
}

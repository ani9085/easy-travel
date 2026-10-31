export type SuggestedDay = {
  day: number;
  title: string;
  places: string[];
  note: string;
};

export type SuggestedStay = {
  area: string;
  style: string;
  reason: string;
  cautions: string[];
};

export type TripPlanRecommendation = {
  title: string;
  summary: string;
  days: SuggestedDay[];
  stays: SuggestedStay[];
  budgetNote: string;
  warnings: string[];
};

const MAX_TEXT = 500;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_TEXT) : fallback;
}

function strings(value: unknown, max: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => text(item)).filter(Boolean).slice(0, max) : [];
}

/** OpenRouter 결과를 화면과 저장소에 넣기 전에 작고 예측 가능한 형태로 정리합니다. */
export function normalizeTripPlan(value: unknown): TripPlanRecommendation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const days = Array.isArray(data.days)
    ? data.days.flatMap((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const day = item as Record<string, unknown>;
      const places = strings(day.places, 8);
      if (!places.length) return [];
      return [{
        day: Math.min(30, Math.max(1, typeof day.day === "number" && Number.isFinite(day.day) ? Math.round(day.day) : index + 1)),
        title: text(day.title, `Day ${index + 1}`),
        places,
        note: text(day.note)
      }];
    }).slice(0, 14)
    : [];
  if (!days.length) return null;

  const stays = Array.isArray(data.stays)
    ? data.stays.flatMap((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const stay = item as Record<string, unknown>;
      const area = text(stay.area);
      if (!area) return [];
      return [{ area, style: text(stay.style, "숙소 유형"), reason: text(stay.reason), cautions: strings(stay.cautions, 4) }];
    }).slice(0, 5)
    : [];

  return {
    title: text(data.title, "AI 여행 계획 초안"),
    summary: text(data.summary),
    days,
    stays,
    budgetNote: text(data.budgetNote),
    warnings: strings(data.warnings, 6)
  };
}

export function parseTripPlanText(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return normalizeTripPlan(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

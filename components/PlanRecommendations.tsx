"use client";

import { useState } from "react";
import { parseTripPlanText, type SuggestedDay, type TripPlanRecommendation } from "../lib/tripPlan.ts";
import type { TripProfile } from "../lib/trip.ts";

type Props = {
  profile: TripProfile;
  flightBooked: boolean;
  accessCode: string;
  onConfirm: (days: SuggestedDay[]) => void;
};

export function PlanRecommendations({ profile, flightBooked, accessCode, onConfirm }: Props) {
  const [recommendation, setRecommendation] = useState<TripPlanRecommendation | null>(null);
  const [draftDays, setDraftDays] = useState<SuggestedDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function generate() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessCode ? { "x-easy-travel-code": accessCode } : {}) },
        body: JSON.stringify({
          task: "trip_plan",
          profile: {
            destination: profile.destination,
            departure: profile.departure,
            originIata: profile.originIata,
            destinationIata: profile.destinationIata,
            startDate: profile.startDate,
            endDate: profile.endDate,
            flexibleDates: profile.flexibleDates,
            travelers: profile.travelers,
            budget: profile.budget,
            preference: profile.preference
          },
          flightBooked
        })
      });
      const data = await response.json() as { result?: string; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "추천을 만들지 못했어요.");
      const parsed = parseTripPlanText(data.result);
      if (!parsed) throw new Error("AI 추천 결과를 읽지 못했어요. 다시 시도해 주세요.");
      setRecommendation(parsed);
      setDraftDays(parsed.days.map((day) => ({ ...day, places: [...day.places] })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "추천을 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function updateDay(index: number, patch: Partial<SuggestedDay>) {
    setDraftDays((current) => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day));
  }

  function saveDraft() {
    const usable = draftDays.map((day) => ({ ...day, places: day.places.map((place) => place.trim()).filter(Boolean) })).filter((day) => day.places.length);
    if (!usable.length) return;
    onConfirm(usable);
    setDraftDays(usable);
    setSaved(true);
  }

  return (
    <div className="stack">
      <div className="card-header">
        <div>
          <h3>일정·숙소 추천 만들기</h3>
          <p>항공권 예약 뒤 목적지와 여행 취향을 바탕으로 AI 초안을 만들고, 수정한 뒤 일정에 확정합니다.</p>
        </div>
        <span className="pill">OpenRouter AI 초안</span>
      </div>
      {!flightBooked && <div className="notice">항공권을 외부 공식 사이트에서 예약한 뒤 ‘예약 완료로 표시’를 해 주세요. 예약 전에는 실제 항공 시간과 맞지 않을 수 있어 추천 버튼을 잠갔어요.</div>}
      {flightBooked && <div className="notice success">예약 완료 상태예요. 아래 추천은 예약을 대신하지 않고, 사용자가 확인·수정해야 하는 계획 초안입니다.</div>}
      <button type="button" className="button" onClick={generate} disabled={!flightBooked || busy || !profile.destination.trim()}>{busy ? "AI가 여행 계획을 만드는 중…" : recommendation ? "추천 다시 만들기" : "일정·숙소 추천 받기"}</button>
      {error && <div className="notice danger-notice" role="alert">{error}</div>}
      {recommendation && (
        <>
          <div className="notice"><strong>{recommendation.title}</strong>{recommendation.summary && <span> · {recommendation.summary}</span>}</div>
          <div className="planning-days">
            {draftDays.map((day, index) => (
              <div className="planning-day" key={`${day.day}-${index}`}>
                <div className="place-num">{day.day}</div>
                <div className="stack compact-stack">
                  <input className="input" value={day.title} onChange={(event) => updateDay(index, { title: event.target.value })} aria-label={`Day ${day.day} 제목`} />
                  <textarea className="textarea" value={day.places.join("\n")} onChange={(event) => updateDay(index, { places: event.target.value.split(/\r?\n/) })} aria-label={`Day ${day.day} 장소`} />
                  {day.note && <span>{day.note}</span>}
                </div>
              </div>
            ))}
          </div>
          {!!recommendation.stays.length && (
            <div>
              <h4>숙소 후보 지역</h4>
              <div className="place-list">{recommendation.stays.map((stay, index) => <div className="place-item" key={`${stay.area}-${index}`}><div className="place-num">⌂</div><div><strong>{stay.area} · {stay.style}</strong><span>{stay.reason}{stay.cautions.length ? ` · 확인: ${stay.cautions.join(", ")}` : ""}</span></div></div>)}</div>
            </div>
          )}
          {recommendation.budgetNote && <div className="notice">예산 참고: {recommendation.budgetNote} · 실시간 가격과 재고는 공식 예약 사이트에서 확인해 주세요.</div>}
          {!!recommendation.warnings.length && <div className="notice">확인할 점: {recommendation.warnings.join(" · ")}</div>}
          <button type="button" className="button green" onClick={saveDraft} disabled={!draftDays.some((day) => day.places.some(Boolean))}>{saved ? "수정한 일정이 저장됐어요" : "수정한 추천을 여행 일정에 확정"}</button>
        </>
      )}
    </div>
  );
}

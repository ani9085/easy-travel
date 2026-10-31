"use client";

import { useMemo, useState } from "react";
import { PRIORITY_LABEL, buildBundles, demoHotelsFor, rankBundles, recommendedPackages, type Bundle, type Priority } from "../lib/comparison.ts";
import { type FlightOffer, type TripProfile } from "../lib/trip.ts";
import { formatWon } from "./shared.ts";

function BundleCard({ bundle, label }: { bundle: Bundle; label?: string }) {
  const { flight, hotel, transfer, fatigue, cost, warnings } = bundle;
  return (
    <article className="bundle-card">
      {label && <span className="bundle-label">{label}</span>}
      <div className="bundle-head">
        <strong>{flight.airlineNames.join(" · ")} + {hotel.area}</strong>
        <span className={`fatigue fatigue-${fatigue.level}`}>피로도 {fatigue.level} · {fatigue.score}</span>
      </div>
      <div className="bundle-total">{formatWon(cost.total)}<small> · {cost.travelers}명 · {cost.nights}박 · 방 {cost.rooms}개</small></div>
      <ul className="bundle-lines">
        <li>항공 {formatWon(cost.flight)}{cost.baggage ? ` + 수하물 ${formatWon(cost.baggage)}` : ""} · {flight.departLocal ?? "--"} 출발 → {flight.arriveLocal ?? "--"} {flight.arrivalAirport ?? ""} 도착</li>
        <li>숙박 {formatWon(cost.hotel)} · {hotel.name} · 체크인 {hotel.checkInTime}</li>
        <li>공항 왕복 {formatWon(cost.airportTransfer)}{transfer ? ` · ${transfer.mode} 약 ${transfer.minutes}분(예시)` : ""}</li>
      </ul>
      <p className="bundle-reasons">왜 이 피로도인가요? {fatigue.reasons.join(" · ") || "특별한 부담 요인 없음"}</p>
      {warnings.length > 0 && <ul className="bundle-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    </article>
  );
}

/** 항공 후보 × 예시 숙소를 묶어 총비용과 이동 피로도를 비교합니다(요청서 PL-02·PL-04). */
export function BundleComparison({ profile, offers, stale }: { profile: TripProfile; offers: FlightOffer[]; stale: boolean }) {
  const [priority, setPriority] = useState<Priority>("comfort");
  const [showAll, setShowAll] = useState(false);
  const hotels = useMemo(() => demoHotelsFor(profile), [profile]);
  const bundles = useMemo(() => buildBundles(offers, hotels, profile), [offers, hotels, profile]);
  const packages = useMemo(() => recommendedPackages(bundles), [bundles]);
  const ranked = useMemo(() => rankBundles(bundles, priority), [bundles, priority]);

  if (!hotels.length) return <div className="empty">숙소 연계 예시는 1차 테스트 지역(일본)만 준비돼 있어요. 다른 지역은 실제 숙소 공급자를 붙인 뒤 비교할 수 있어요.</div>;
  if (stale || !offers.length) return <div className="empty">‘항공권 후보 보기’를 눌러 지금 조건의 항공 후보를 먼저 만들어 주세요.</div>;
  if (!bundles.length) return <div className="empty">날짜를 확인하면 비교할 수 있어요.</div>;

  return (
    <div className="bundle-compare">
      <div className="notice planning-disclaimer">예시 데이터(Mock)예요. 숙소 요금·공항 이동 시간은 실제 재고·요금이 아니며, 예약 전에 공식 사이트에서 다시 확인해야 해요.</div>
      <div className="bundle-grid">{packages.map(({ label, bundle }) => <BundleCard key={label} label={label} bundle={bundle} />)}</div>
      <div className="button-row">
        <label htmlFor="bundle-priority" className="small">전체 순서</label>
        <select id="bundle-priority" className="select inline-select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABEL[key]}</option>)}
        </select>
        <button type="button" className="button secondary" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>{showAll ? "접기" : `전체 ${bundles.length}개 보기`}</button>
      </div>
      {showAll && <div className="bundle-grid">{ranked.map((bundle, index) => <BundleCard key={bundle.id} bundle={bundle} label={`${index + 1}위`} />)}</div>}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHydrated, useTrip } from "../components/hooks.tsx";
import { profileForDestination } from "../lib/destinations.ts";
import { periodLabel, tripTimeline } from "../lib/trip.ts";

// 이 기기에서 마지막으로 고른 화면. 부모님 휴대폰은 다음부터 바로 부모님 화면이 열립니다.
const ROLE_STORAGE_KEY = "easy-travel:role";
type Role = "traveler" | "guardian";

function readRole(): Role | null {
  try {
    const value = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return value === "traveler" || value === "guardian" ? value : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { trip } = useTrip();
  const [remembered, setRemembered] = useState<Role | null>(null);

  // 화면 바꾸기(?choose=1)로 온 게 아니면, 기억한 화면으로 바로 보냅니다.
  useEffect(() => {
    const role = readRole();
    const choosing = new URLSearchParams(window.location.search).has("choose");
    if (role && !choosing) router.replace(`/${role}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있습니다.
    else setRemembered(role);
  }, [router]);

  function choose(role: Role) {
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      // 저장이 막혀도 이번에는 이동합니다.
    }
    router.push(`/${role}`);
  }

  const profile = trip.profile;
  const place = profileForDestination(profile.destination);
  const timeline = hydrated ? tripTimeline(profile, new Date(), place.timeZone) : null;
  const stage = !timeline ? "" : timeline.stage === "before" ? `출발까지 ${timeline.daysUntil}일` : timeline.stage === "during" ? `여행 ${timeline.day}일째` : timeline.stage === "after" ? "귀국 후" : "날짜 미정";

  return (
    <div className="role-shell">
      <header className="role-header">
        <div className="brand-mark" aria-hidden="true">✈</div>
        <div><strong>easy-travel</strong><span>부모님 여행 도우미</span></div>
      </header>
      <main className="role-main">
        <h1>누가 쓰시나요?</h1>
        <p className="lead">{profile.destination.trim() || "여행지"} · {periodLabel(profile)}{stage && ` · ${stage}`}</p>
        <button type="button" className={`role-card${remembered === "traveler" ? " remembered" : ""}`} onClick={() => choose("traveler")}>
          <span className="role-emoji" aria-hidden="true">🧳</span>
          <strong>여행하는 부모님</strong>
          <span>오늘 갈 곳 · 숙소 가기 · 통역 · 도움 요청</span>
        </button>
        <button type="button" className={`role-card${remembered === "guardian" ? " remembered" : ""}`} onClick={() => choose("guardian")}>
          <span className="role-emoji" aria-hidden="true">👨‍👩‍👧</span>
          <strong>도와주는 가족(보호자)</strong>
          <span>계획 · 항공+숙소 비교 · 일정 · 설정</span>
        </button>
        <p className="small">고른 화면을 이 기기에 기억해요. 각 화면 위의 ‘화면 바꾸기’로 언제든 바꿀 수 있어요. 여행 정보는 이 기기에만 저장되고, 가족 공유는 준비 중이에요.</p>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { appIntentUrl, decodeSharePayload, type SharePayload } from "../../lib/shareLink.ts";

// 보호자가 카카오톡으로 보낸 '부모님 앱으로 보내기' 링크가 열리는 화면.
// 여행 정보는 주소의 # 뒤에만 있어 서버로 전송되지 않습니다.
export default function SendPage() {
  const [payload, setPayload] = useState("");
  const [data, setData] = useState<SharePayload | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const value = window.location.hash.replace(/^#/, "");
    /* eslint-disable react-hooks/set-state-in-effect -- 주소의 # 부분은 브라우저에서만 읽을 수 있습니다. */
    setPayload(value);
    setData(value ? decodeSharePayload(value) : null);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("링크를 복사했어요. 이지트래블 앱 → 설정 → ‘보호자가 보낸 링크로 가져오기’에 붙여넣어 주세요.");
    } catch {
      setCopied("복사가 막혀 있어요. 주소창의 링크를 길게 눌러 복사해 주세요.");
    }
  }

  return (
    <div className="role-shell">
      <header className="role-header"><div className="brand-mark" aria-hidden="true">✈</div><div><strong>이지트래블</strong><span>부모님 앱으로 여행 받기</span></div></header>
      <main className="role-main stack">
        {!ready ? <p className="lead">여행 정보를 읽는 중…</p> : data ? (
          <>
            <h1>{data.profile.destination}</h1>
            <p className="lead">{data.profile.startDate && data.profile.endDate ? `${data.profile.startDate} ~ ${data.profile.endDate}` : "날짜 미정"} · {data.profile.travelers}명 · 일정 {data.itinerary.length}곳</p>
            <p className="muted">숙소: {data.profile.hotel || "미정"}</p>
            <a className="button huge" href={appIntentUrl(payload)}>이지트래블 앱에서 열기</a>
            <p className="small">앱이 열리면 ‘이 여행으로 시작하기’를 눌러 주세요. 앱이 없으면 먼저 설치해 주세요.</p>
            <button type="button" className="button big secondary" onClick={copyLink}>링크 복사 (앱에 붙여넣기용)</button>
            {copied && <div className="notice" role="status">{copied}</div>}
          </>
        ) : (
          <>
            <h1>링크를 읽지 못했어요</h1>
            <p className="lead">보호자에게 ‘부모님 앱으로 보내기’ 링크를 다시 보내 달라고 해 주세요.</p>
          </>
        )}
      </main>
    </div>
  );
}

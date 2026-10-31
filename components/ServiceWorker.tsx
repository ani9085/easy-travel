"use client";

import { useEffect } from "react";

/** 프로덕션 빌드에서만 서비스 워커를 등록합니다(개발 중에는 옛 파일이 남지 않게). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

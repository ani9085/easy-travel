"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { applyProfilePatch, createDefaultTrip, type Trip, type TripProfile } from "../lib/trip.ts";
import { loadTrip, saveTrip } from "../lib/tripStorage.ts";
import { formatTime } from "./shared.ts";

// 서버 렌더링(Vercel은 UTC)과 브라우저(KST 등)의 시간대가 달라 시각은 브라우저에서만 그립니다.
const subscribeNothing = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export function LocalTime({ value }: { value: string | null }) {
  const hydrated = useHydrated();
  if (!value) return <>{formatTime(null)}</>;
  return <>{hydrated ? formatTime(value) : "…"}</>;
}

function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export type TripStore = {
  trip: Trip;
  loaded: boolean;
  migrated: boolean;
  storageBlocked: boolean;
  updateTrip: (change: (current: Trip) => Trip) => void;
  /** 목적지가 바뀌면 이전 목적지의 데모 장소·숙소를 비웁니다. 비웠으면 true. */
  updateProfile: (patch: Partial<TripProfile>) => boolean;
};

/** 이 기기에 저장된 여행 하나를 읽고, 바뀔 때마다 저장합니다. 부모님·보호자 화면이 함께 씁니다. */
export function useTrip(): TripStore {
  const [trip, setTrip] = useState<Trip>(() => createDefaultTrip());
  const [loaded, setLoaded] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  // 저장된 여행은 브라우저에서만 읽을 수 있어 마운트 후 한 번 불러옵니다.
  useEffect(() => {
    const storage = deviceStorage();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있습니다. */
    if (storage) {
      const result = loadTrip(storage, new Date().toISOString());
      setTrip(result.trip);
      setMigrated(result.source === "migrated");
    } else {
      setStorageBlocked(true);
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 다른 탭(예: 보호자 화면)에서 바꾼 여행을 이 탭에도 반영합니다.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "easy-travel:trip" || !event.newValue) return;
      const storage = deviceStorage();
      if (storage) setTrip(loadTrip(storage, new Date().toISOString()).trip);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const storage = deviceStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장 실패 안내는 저장 시도 직후에만 알 수 있습니다.
    setStorageBlocked(!storage || !saveTrip(storage, trip));
  }, [trip, loaded]);

  const updateTrip = useCallback((change: (current: Trip) => Trip) => {
    setTrip((current) => ({ ...change(current), updatedAt: new Date().toISOString() }));
  }, []);

  const updateProfile = useCallback((patch: Partial<TripProfile>) => {
    const result = applyProfilePatch(trip, patch, new Date().toISOString());
    setTrip(result.trip);
    return result.clearedDemo;
  }, [trip]);

  return { trip, loaded, migrated, storageBlocked, updateTrip, updateProfile };
}

/** 주소 뒤 #이름으로 부모님 화면의 단계를 나눕니다. 휴대폰 ‘뒤로’ 버튼이 그대로 동작합니다. */
export function useHashView<T extends string>(views: readonly T[]): [T | "", (view: T | "") => void] {
  const read = useCallback((): T | "" => {
    const hash = window.location.hash.replace(/^#/, "");
    return (views as readonly string[]).includes(hash) ? (hash as T) : "";
  }, [views]);
  const view = useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    read,
    (): T | "" => ""
  );
  const go = useCallback((next: T | "") => {
    if (next) window.location.hash = next;
    else if (window.location.hash) window.history.pushState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  }, []);
  return [view, go];
}

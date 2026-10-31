"use client";

import { ChangeEvent, useState } from "react";
import { AccessCodePrompt } from "./AccessCodePrompt.tsx";
import { mapsDirectionsUrl, mapsSearchUrl, openMapsUrl, postAi } from "./shared.ts";

// 서버(lib/server/aiGuard.ts)의 MAX_IMAGE_CHARS와 같은 값입니다.
const MAX_IMAGE_CHARS = 4_000_000;
const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;

/** 사진을 긴 변 1280px JPEG로 줄입니다. 다시 그리면서 EXIF(촬영 위치 등) 정보도 빠집니다. */
function resizeImage(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error("canvas"));
        return;
      }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/** “1. 장소 (현지 표기) — 근거 · 확신” 형식의 줄에서 장소 이름만 뽑습니다(최대 3개). */
export function parsePlaceCandidates(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+[.)]\s*\**(.+?)\**\s*(?:\(|—|–|-|:|$)/)?.[1]?.trim() || "")
    .filter(Boolean)
    .slice(0, 3);
}

export function PhotoPlace({ destination, onAddPlace }: { destination: string; onAddPlace?: (name: string) => void }) {
  const [photoData, setPhotoData] = useState("");
  const [result, setResult] = useState("");
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualPlace, setManualPlace] = useState("");
  const [added, setAdded] = useState("");
  const [needCode, setNeedCode] = useState(false);

  function clearPhoto() {
    setPhotoData("");
    setResult("");
    setMode("");
    setError("");
  }

  // 사진을 고르면 미리보기만 합니다. 전송은 안내를 본 뒤 “AI로 살펴보기”를 눌러야 합니다.
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearPhoto();
    if (!file.type.startsWith("image/")) {
      setError("사진 파일만 올릴 수 있어요. 아래에 간판 글자를 직접 적어도 돼요.");
      return;
    }
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      setError("사진이 너무 커요(20MB 초과). 다른 사진을 고르거나 아래에 직접 적어 주세요.");
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      if (dataUrl.length > MAX_IMAGE_CHARS) {
        setError("사진을 줄여도 너무 커요. 다른 사진을 고르거나 아래에 직접 적어 주세요.");
        return;
      }
      setPhotoData(dataUrl);
    } catch {
      setError("이 사진 형식은 열 수 없어요. JPEG·PNG 사진으로 다시 시도하거나 아래에 직접 적어 주세요.");
    }
  }

  async function analyze() {
    if (!photoData) return;
    setBusy(true);
    setError("");
    setResult("");
    const { ok, data } = await postAi({ task: "photo_location", image: photoData, destination });
    setNeedCode(data.code === "access_code_required");
    if (data.code === "access_code_required") setError("");
    else if (!ok || !data.result) setError(`${data.error || "사진을 살펴보지 못했어요."} 아래에 간판 글자나 장소 이름을 직접 적어 주세요.`);
    else {
      setResult(data.result);
      setMode(data.mode || "");
    }
    setBusy(false);
  }

  function addPlace(name: string) {
    if (!onAddPlace || !name.trim()) return;
    onAddPlace(name.trim());
    setAdded(`${name.trim()}을(를) 오늘 일정에 넣었어요.`);
  }

  const candidates = mode === "openrouter" ? parsePlaceCandidates(result) : [];

  return (
    <div className="photo-place">
      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 줄인 data URL 미리보기라 next/image 최적화 대상이 아닙니다. */}
      <div className="photo-drop">{photoData ? <img src={photoData} alt="고른 여행 사진" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 10 }} /> : <div><div style={{ fontSize: 32 }}>📷</div><div className="muted">사진을 찍거나 골라 주세요 · 바로 보내지 않아요</div></div>}<input type="file" accept="image/*" capture="environment" onChange={handlePhoto} aria-label="사진 찍기 또는 고르기" /></div>
      {photoData && !result && (
        <>
          <div className="notice">“AI로 살펴보기”를 누르면 이 사진이 easy-travel 서버를 거쳐 외부 AI 서비스(OpenRouter)로 전송돼요. 사진은 줄이고 촬영 위치 정보(EXIF)를 지운 뒤 보내며 저장하지 않아요. 얼굴이나 개인정보가 보이면 보내지 마세요.</div>
          <div className="button-row"><button type="button" className="button big" onClick={analyze} disabled={busy}>{busy ? "살펴보는 중…" : "AI로 살펴보기"}</button><button type="button" className="button secondary" onClick={clearPhoto} disabled={busy}>사진 지우기</button></div>
        </>
      )}
      {error && <div className="notice">{error}</div>}
      {needCode && <AccessCodePrompt onSaved={() => { setNeedCode(false); void analyze(); }} />}
      {result && (
        <div className="result-card">
          <span className="small">{mode === "demo" ? "데모 결과 · 실제 분석 아님" : "AI 추정 · 사진만으로는 틀릴 수 있어요"}</span>
          <strong className="multiline">{result}</strong>
          {candidates.map((name) => (
            <div className="candidate-actions" key={name}>
              <span>{name}</span>
              <button type="button" className="button secondary" onClick={() => openMapsUrl(mapsSearchUrl(`${name} ${destination}`))}>지도</button>
              <button type="button" className="button secondary" onClick={() => openMapsUrl(mapsDirectionsUrl(`${name} ${destination}`))}>길찾기</button>
              {onAddPlace && <button type="button" className="button secondary" onClick={() => addPlace(name)}>일정에</button>}
            </div>
          ))}
          <button type="button" className="button ghost" onClick={clearPhoto}>다른 사진</button>
        </div>
      )}
      {added && <div className="notice success" role="status">{added}</div>}
      <div className="field">
        <label htmlFor="manual-place">직접 적기 · 간판 글자나 장소 이름</label>
        <input id="manual-place" className="input" value={manualPlace} onChange={(e) => setManualPlace(e.target.value)} placeholder="예: 가게 간판 글자" />
      </div>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => openMapsUrl(mapsSearchUrl(manualPlace))} disabled={!manualPlace.trim()}>지도에서 찾기</button>
        {onAddPlace && <button type="button" className="button secondary" onClick={() => { addPlace(manualPlace); setManualPlace(""); }} disabled={!manualPlace.trim()}>일정에 넣기</button>}
      </div>
    </div>
  );
}

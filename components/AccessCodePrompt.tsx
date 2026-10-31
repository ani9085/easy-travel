"use client";

import { useState } from "react";
import { ACCESS_CODE_STORAGE_KEY } from "./shared.ts";

/** AI가 접속 코드를 요구할 때 그 자리에서 한 번 넣게 합니다. 코드는 이 기기에만 저장됩니다. */
export function AccessCodePrompt({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  function save() {
    const code = value.trim();
    if (!code) return;
    try {
      window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, code);
      onSaved();
    } catch {
      setMessage("이 브라우저에서는 저장이 막혀 있어요. 보호자에게 도움을 요청해 주세요.");
    }
  }

  return (
    <div className="notice access-code">
      <strong>가족 접속 코드가 필요해요</strong>
      <span>보호자가 알려준 코드를 한 번만 넣으면 이 휴대폰에 기억해요.</span>
      <input className="input big-text" type="password" autoComplete="off" maxLength={64} value={value} onChange={(e) => setValue(e.target.value)} aria-label="가족 접속 코드" />
      <button type="button" className="button big" onClick={save} disabled={!value.trim()}>저장하고 다시 하기</button>
      {message && <span>{message}</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { LANGUAGE_OPTIONS, languageOption, profileForDestination, suggestedLanguageCode } from "../lib/destinations.ts";
import { postAi } from "./shared.ts";

type Direction = "to_local" | "to_korean";
type Result = { source: string; translation: string; direction: Direction; languageName: string; speechLang: string };

function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/**
 * 양방향 텍스트 통역(요청서 EX-04의 1단계). 음성 입력은 실기기 테스트 뒤 다음 단계에서 붙입니다.
 * 오류·데모 문구는 번역 칸에 넣지 않습니다 — 부모님이 그 화면을 현지 사람에게 그대로 보여줄 수 있어서입니다.
 */
export function Translator({ destination }: { destination: string }) {
  const [languageCode, setLanguageCode] = useState(() => suggestedLanguageCode(destination));
  const [direction, setDirection] = useState<Direction>("to_local");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");
  const [enlarged, setEnlarged] = useState(false);
  const language = languageOption(languageCode) || LANGUAGE_OPTIONS[0];
  const place = profileForDestination(destination);
  const phrases = place.speechLang === language.speechLang ? place.phrases : [];

  function chooseDirection(next: Direction) {
    setDirection(next);
    setText("");
    setResult(null);
    setNotice("");
  }

  async function translate() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setResult(null);
    setNotice("");
    const { ok, data } = await postAi({ task: "translate", text: value, destination, direction, language: language.code });
    if (ok && data.mode === "openrouter" && data.result) {
      setResult({ source: value, translation: data.result, direction, languageName: language.name, speechLang: direction === "to_local" ? language.speechLang : "ko-KR" });
    } else {
      setNotice(data.error || data.result || "번역 결과를 받지 못했어요. 아래 자주 쓰는 말을 눌러 보세요.");
    }
    setBusy(false);
  }

  function pickPhrase(phrase: { ko: string; local: string }) {
    setDirection("to_local");
    setText(phrase.ko);
    setNotice("");
    setResult({ source: phrase.ko, translation: phrase.local, direction: "to_local", languageName: language.name, speechLang: language.speechLang });
  }

  function speak(value: string, lang: string) {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  const fromLabel = direction === "to_local" ? "한국어" : language.name;
  const toLabel = direction === "to_local" ? language.name : "한국어";

  return (
    <div className="translator">
      <div className="field">
        <label htmlFor="translator-language">상대방 언어</label>
        <select id="translator-language" className="select" value={language.code} onChange={(e) => { setLanguageCode(e.target.value); setResult(null); }}>
          {LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
        </select>
      </div>
      <div className="direction-row" role="group" aria-label="번역 방향">
        <button type="button" className={direction === "to_local" ? "button big" : "button big secondary"} aria-pressed={direction === "to_local"} onClick={() => chooseDirection("to_local")}>내가 말할 때<br /><small>한국어 → {language.name}</small></button>
        <button type="button" className={direction === "to_korean" ? "button big" : "button big secondary"} aria-pressed={direction === "to_korean"} onClick={() => chooseDirection("to_korean")}>상대방 말을 볼 때<br /><small>{language.name} → 한국어</small></button>
      </div>
      <div className="field">
        <label htmlFor="translator-text">{fromLabel}로 적어 주세요</label>
        <textarea id="translator-text" className="textarea big-text" lang={direction === "to_local" ? "ko" : language.speechLang} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={direction === "to_local" ? "예: 이 근처에 약국이 있나요?" : `상대방에게 ${language.name}로 적어 달라고 해 주세요`} />
      </div>
      <button type="button" className="button big" onClick={translate} disabled={busy || !text.trim()}>{busy ? "번역 중…" : `${toLabel}로 바꾸기`}</button>
      {notice && <div className="notice" role="status">{notice}</div>}
      {result && (
        <div className="result-card translation-result">
          <span className="small">{result.direction === "to_local" ? `${result.languageName}로 보여주세요` : "한국어 뜻"} · AI 번역은 틀릴 수 있어요</span>
          <strong lang={result.speechLang}>{result.translation}</strong>
          <span className="small">원문: {result.source}</span>
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => setEnlarged(true)}>크게 보여주기</button>
            {canSpeak() && <button type="button" className="button secondary" onClick={() => speak(result.translation, result.speechLang)}>🔊 읽어주기</button>}
          </div>
        </div>
      )}
      {phrases.length > 0 && direction === "to_local" && (
        <div className="phrase-block">
          <h3>자주 쓰는 말 · {language.name}</h3>
          <div className="phrase-list">{phrases.map((phrase) => <button type="button" className="phrase" key={phrase.ko} onClick={() => pickPhrase(phrase)}>{phrase.ko}</button>)}</div>
        </div>
      )}
      <p className="small">음성으로 말하기는 휴대폰 실기기 테스트를 마친 뒤 추가할 예정이에요. 지금은 글자로 적어 주세요.</p>
      {enlarged && result && (
        <div className="enlarged" role="dialog" aria-modal="true" aria-label="번역문 크게 보기">
          <strong lang={result.speechLang}>{result.translation}</strong>
          <button type="button" className="button big light" onClick={() => setEnlarged(false)}>닫기</button>
        </div>
      )}
    </div>
  );
}

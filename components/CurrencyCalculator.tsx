"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocalTime } from "./hooks.tsx";

// ---------------------------------------------------------------------------
// 환율 — 데모 값 · 직접 입력 · ECB 기준환율(Frankfurter) · 마지막 조회값
// ECB 기준환율은 정보 제공용이며 거래용 보장값이 아닙니다.
// 환율은 여행 데이터가 아니라 이 기기의 캐시라 Trip과 따로 저장합니다.
// ---------------------------------------------------------------------------
export const currencyRates: Record<string, { label: string; unit: string; defaultRate: number; ecb: boolean }> = {
  JPY: { label: "엔", unit: "¥", defaultRate: 9.3, ecb: true },
  EUR: { label: "유로", unit: "€", defaultRate: 1550, ecb: true },
  USD: { label: "달러", unit: "$", defaultRate: 1400, ecb: true },
  THB: { label: "바트", unit: "฿", defaultRate: 42, ecb: true },
  VND: { label: "동", unit: "₫", defaultRate: 0.055, ecb: false }
};

type KnownRate = { rate: number; refDate: string; fetchedAt: string };
type RateSource = { kind: "demo" } | { kind: "manual" } | ({ kind: "ecb" | "last-known" } & KnownRate);

const RATE_STORAGE_KEY = "easy-travel-rates";

const rateSourceLabel: Record<RateSource["kind"], string> = {
  demo: "데모 환율",
  manual: "직접 입력",
  ecb: "ECB 기준",
  "last-known": "마지막 조회값"
};

function rateFor(code: string, rates: Record<string, KnownRate>): { rate: string; source: RateSource } {
  const last = rates[code];
  if (last) return { rate: String(last.rate), source: { kind: "last-known", ...last } };
  return { rate: String(currencyRates[code]?.defaultRate ?? 1), source: { kind: "demo" } };
}

export function CurrencyCalculator({ defaultCurrency, large = false }: { defaultCurrency: string | null; large?: boolean }) {
  const initial = defaultCurrency && currencyRates[defaultCurrency] ? defaultCurrency : "JPY";
  const [currency, setCurrency] = useState(initial);
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState(String(currencyRates[initial].defaultRate));
  const [rateSource, setRateSource] = useState<RateSource>({ kind: "demo" });
  const [knownRates, setKnownRates] = useState<Record<string, KnownRate>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const currencyRef = useRef(currency);

  // 저장된 마지막 환율은 브라우저에서만 읽을 수 있어 마운트 후 불러옵니다.
  useEffect(() => {
    let rates: Record<string, KnownRate> = {};
    try {
      rates = JSON.parse(window.localStorage.getItem(RATE_STORAGE_KEY) || "{}") as Record<string, KnownRate>;
    } catch {
      // 저장된 환율이 깨져 있거나 저장이 막혀 있으면 데모 값으로 계속합니다.
    }
    const next = rateFor(currencyRef.current, rates);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있습니다. */
    setKnownRates(rates);
    setRate(next.rate);
    setRateSource(next.source);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const converted = useMemo(() => {
    const parsed = Number(amount) * Number(rate);
    return Number.isFinite(parsed) ? Math.round(parsed).toLocaleString("ko-KR") : "0";
  }, [amount, rate]);

  function changeCurrency(code: string) {
    currencyRef.current = code;
    setCurrency(code);
    setMessage("");
    const next = rateFor(code, knownRates);
    setRate(next.rate);
    setRateSource(next.source);
  }

  async function fetchReferenceRate() {
    const code = currency;
    if (!currencyRates[code].ecb) {
      setMessage(`${code}는 ECB 기준환율에 없는 통화예요. 환전소나 카드 앱에서 본 환율을 직접 입력해 주세요.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${code}&symbols=KRW`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { date?: unknown; rates?: { KRW?: unknown } };
      const value = data.rates?.KRW;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || typeof data.date !== "string") throw new Error("shape");
      const entry: KnownRate = { rate: Number(value.toFixed(4)), refDate: data.date, fetchedAt: new Date().toISOString() };
      const nextRates = { ...knownRates, [code]: entry };
      setKnownRates(nextRates);
      try {
        window.localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(nextRates));
      } catch {
        // 저장이 막혀도 이번 계산에는 씁니다.
      }
      if (currencyRef.current === code) {
        setRate(String(entry.rate));
        setRateSource({ kind: "ecb", ...entry });
      }
    } catch {
      const last = knownRates[code];
      if (currencyRef.current !== code) return;
      if (last && rateSource.kind !== "manual") {
        setRate(String(last.rate));
        setRateSource({ kind: "last-known", ...last });
        setMessage("기준 환율을 새로 불러오지 못해 마지막으로 받은 값으로 계산해요.");
      } else {
        setMessage(`기준 환율을 불러오지 못했어요. 지금 보이는 ${rateSourceLabel[rateSource.kind]} 값으로 계산해요.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={large ? "currency large" : "currency"}>
      <div className="field">
        <label htmlFor="currency-amount">현지 금액 ({currencyRates[currency].unit})</label>
        <input id="currency-amount" className="input big-text" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>
      <div className="rate-result">
        <span className="small">원화로 약</span>
        <strong>₩ {converted}</strong>
        <div className="source-line">
          {rateSource.kind === "demo" && "출처: 앱에 넣어 둔 데모 값 · 실제 환율이 아니에요"}
          {rateSource.kind === "manual" && "출처: 직접 입력한 환율"}
          {(rateSource.kind === "ecb" || rateSource.kind === "last-known") && <>출처: ECB 기준환율(Frankfurter 경유) · 기준일 {rateSource.refDate} · 조회 <LocalTime value={rateSource.fetchedAt} />{rateSource.kind === "last-known" ? " · 마지막 성공값이라 최신이 아닐 수 있어요" : ""}</>}
        </div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="currency-select">통화</label><select id="currency-select" className="select" value={currency} onChange={(e) => changeCurrency(e.target.value)}>{Object.entries(currencyRates).map(([key, value]) => <option key={key} value={key}>{key} · {value.label}</option>)}</select></div>
        <div className="field"><label htmlFor="currency-rate">1 {currency} = 원</label><input id="currency-rate" className="input" value={rate} onChange={(e) => { setRate(e.target.value); setRateSource({ kind: "manual" }); }} inputMode="decimal" /></div>
      </div>
      <button type="button" className="button secondary" onClick={fetchReferenceRate} disabled={busy}>{busy ? "불러오는 중…" : "기준 환율 불러오기 (ECB)"}</button>
      {message && <div className="notice">{message}</div>}
      <div className="notice">참고용 계산이에요. 실제 환전소·카드 결제 환율과 수수료는 다를 수 있어요.</div>
    </div>
  );
}

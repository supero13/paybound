import type { ReactNode } from "react";
import { explorerTx } from "../chain";
import type { TxState } from "../lib/useTx";

export function Card({ title, children, accent }: { title: string; children: ReactNode; accent?: string }) {
  return (
    <section className={`card ${accent ?? ""}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function TxStatus({ s }: { s: TxState }) {
  if (s.status === "idle") return null;
  return (
    <p className={`status ${s.status}`} role="status">
      {s.msg}{" "}
      {s.hash && (
        <a href={explorerTx(s.hash)} target="_blank" rel="noreferrer">
          view tx ↗
        </a>
      )}
    </p>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export const PERIODS: { label: string; s: bigint }[] = [
  { label: "1 hour", s: 3600n },
  { label: "1 day", s: 86400n },
  { label: "1 week", s: 604800n },
  { label: "30 days", s: 2592000n },
];

export function defaultExpiry(days = 30) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

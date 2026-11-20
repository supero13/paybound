import { useRef, useState } from "react";
import type { Address } from "viem";
import { VAULT, payboundVaultAbi } from "../contracts";
import type { CreatorState } from "../lib/data";
import { rememberCounterparty } from "../lib/lookalike";
import { short } from "../lib/units";
import { useTx } from "../lib/useTx";
import { TxStatus } from "./ui";

interface DraftRes {
  ok: boolean;
  parser: "rules" | "llm";
  llm: boolean;
  payee: { id: string; label: string; wallet: Address } | null;
  amount: string | null;
  amountDisplay: string | null;
  memo: string;
  blockers: string[];
  warnings: string[];
  preview: { code: number; message: string } | null;
  ref: `0x${string}`;
  error?: string;
}
type Msg = { role: "user"; text: string } | { role: "bot"; draft?: DraftRes; text?: string };

const EXAMPLES = ["send Smoke Payee 0.05 for testing", "pay Ada 5 tUSD8 for the logo", "pay Smoke Payee 1 for the thread"];

export function AskPanel({ st, me }: { st: CreatorState; me: Address }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! Tell me who to pay and how much, like “pay Ada 5 for the logo”. I'll prepare a draft and check it against your on-chain limits. I never send anything: you approve and sign." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const tx = useTx();
  const end = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creator: me, text }) });
      const d = (await r.json()) as DraftRes;
      setMsgs((m) => [...m, d.error ? { role: "bot", text: d.error } : { role: "bot", draft: d }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "I couldn't reach the assistant. You can still pay manually from the Pay tab." }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function approve(d: DraftRes) {
    // Defense in depth: re-check the draft against the payee book this browser read from the chain.
    const p = st.payees.find((x) => x.id.toString() === d.payee?.id);
    if (!p || p.status !== 2 || p.wallet.toLowerCase() !== d.payee!.wallet.toLowerCase()) {
      setMsgs((m) => [...m, { role: "bot", text: "That draft doesn't match your confirmed payee book, so I blocked it." }]);
      return;
    }
    const ok = await tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "pay", args: [me, p.id, BigInt(d.amount!), d.ref, d.memo] }, `Pay ${p.label}`);
    if (ok) {
      rememberCounterparty(p.wallet);
      setSent((s) => ({ ...s, [d.ref]: true }));
    }
  }

  return (
    <section className="card hero chat">
      <h2>🤖 Ask Paybound</h2>
      <div className="msgs">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="bubble me">{m.text}</div>
          ) : m.draft ? (
            <DraftCard key={i} d={m.draft} sent={!!sent[m.draft.ref]} busy={tx.state.status === "busy"} onApprove={() => approve(m.draft!)} />
          ) : (
            <div key={i} className="bubble bot">{m.text}</div>
          ),
        )}
        {busy && <div className="bubble bot">Checking your payees and limits on-chain…</div>}
        <div ref={end} />
      </div>
      <div className="chips">
        {EXAMPLES.map((e) => (
          <button key={e} className="ghost small" onClick={() => ask(e)} disabled={busy}>{e}</button>
        ))}
      </div>
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input maxLength={500} placeholder="pay Ada 5 for the logo" value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={busy || !input.trim()}>Draft</button>
      </form>
      <TxStatus s={tx.state} />
    </section>
  );
}

function DraftCard({ d, sent, busy, onApprove }: { d: DraftRes; sent: boolean; busy: boolean; onApprove: () => void }) {
  return (
    <div className={`draft ${d.ok ? "good" : "bad"}`}>
      <div className="row between">
        <b>{d.ok ? "Draft ready" : "Can't draft this"}</b>
        <span className="chip grey">{d.parser === "llm" ? "AI parser" : "built-in parser"}</span>
      </div>
      {d.payee && (
        <dl>
          <dt>To</dt>
          <dd>{d.payee.label} <span className="mono small">{short(d.payee.wallet)}</span></dd>
          <dt>Amount</dt>
          <dd><b>{d.amountDisplay ?? "–"} tUSD8</b></dd>
          <dt>Memo</dt>
          <dd>{d.memo || "–"}</dd>
          {d.preview && (
            <>
              <dt>On-chain check</dt>
              <dd>{d.preview.code !== 0 ? `⛔ ${d.preview.message}` : d.ok ? `✅ ${d.preview.message}` : "✅ Within your on-chain limits (fix the issue below first)"}</dd>
            </>
          )}
        </dl>
      )}
      {d.blockers.map((b) => <div key={b} className="alert danger">⛔ {b}</div>)}
      {d.warnings.map((w) => <div key={w} className="alert">{w}</div>)}
      {d.ok && (
        <button className="big" disabled={busy || sent} onClick={onApprove}>
          {sent ? "Sent ✓" : `Approve & sign ${d.amountDisplay} tUSD8`}
        </button>
      )}
    </div>
  );
}

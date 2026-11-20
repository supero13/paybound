import { useEffect, useState } from "react";
import { keccak256, toHex, type Address } from "viem";
import { useReadContract } from "wagmi";
import { BLOCKER_MESSAGES, VAULT, payboundVaultAbi } from "../contracts";
import { aevum } from "../chain";
import type { CreatorState } from "../lib/data";
import { rememberCounterparty } from "../lib/lookalike";
import { fmt, parseAmount, short } from "../lib/units";
import { useTx } from "../lib/useTx";
import { Card, Field, TxStatus } from "./ui";

export function PayPanel({ st, me }: { st: CreatorState; me: Address }) {
  const tx = useTx();
  const confirmed = st.payees.filter((p) => p.status === 2);
  const [pid, setPid] = useState("");
  useEffect(() => {
    if (!pid && confirmed[0]) setPid(confirmed[0].id.toString());
  }, [confirmed, pid]);
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const amount = parseAmount(amt);
  const payee = confirmed.find((p) => p.id.toString() === pid);

  const preview = useReadContract({
    address: VAULT,
    abi: payboundVaultAbi,
    functionName: "previewPayment",
    chainId: aevum.id,
    args: payee && amount !== null ? [me, me, payee.id, amount] : undefined,
    query: { enabled: !!payee && amount !== null },
  });
  const blocker = preview.data ? Number(preview.data[0]) : undefined;
  const ok = blocker === 0;

  async function pay() {
    if (!payee || amount === null) return;
    // ref links the on-chain receipt to the exact draft the creator approved
    const ref = keccak256(toHex(JSON.stringify({ payee: payee.wallet, id: payee.id.toString(), amount: amount.toString(), memo, t: Date.now() })));
    const done = await tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "pay", args: [me, payee.id, amount, ref, memo] }, `Pay ${payee.label}`);
    if (done) {
      rememberCounterparty(payee.wallet);
      setAmt("");
      setMemo("");
    }
  }

  return (
    <>
      <Card title="Send a payout" accent="hero">
        {confirmed.length === 0 ? (
          <p className="muted">Add and confirm a payee, then set a limit, before paying.</p>
        ) : (
          <>
            <Field label="To">
              <select value={pid} onChange={(e) => setPid(e.target.value)}>
                {confirmed.map((p) => (
                  <option key={p.id.toString()} value={p.id.toString()}>
                    {p.label} · {short(p.wallet)}
                  </option>
                ))}
              </select>
            </Field>
            {payee && (
              <p className="muted">
                Vault {fmt(st.vaultBal)} · can send{" "}
                <b>{fmt(payee.remaining)}</b> to {payee.label} right now
              </p>
            )}
            <Field label="Amount (tUSD8)">
              <input className="big" inputMode="decimal" placeholder="0.10" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </Field>
            <Field label="Memo (optional, public)">
              <input maxLength={140} placeholder="November thread" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
            {amt && amount === null && <div className="alert">Enter a number with up to 6 decimals.</div>}
            {blocker !== undefined && (
              <div className={`alert ${ok ? "good" : "danger"}`}>
                {ok ? `✅ Ready: ${fmt(amount)} tUSD8 to ${payee?.label} (${short(payee?.wallet)}). Checked on-chain.` : `⛔ ${BLOCKER_MESSAGES[blocker]}`}
              </div>
            )}
            <button className="big" disabled={!ok || tx.state.status === "busy"} onClick={pay}>
              Sign & send
            </button>
          </>
        )}
      </Card>
      <TxStatus s={tx.state} />
    </>
  );
}

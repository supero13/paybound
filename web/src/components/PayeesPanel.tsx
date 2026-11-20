import { useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { REGISTRY, payeeRegistryAbi } from "../contracts";
import { explorerAddress } from "../chain";
import type { CreatorState, PayeeRow } from "../lib/data";
import { findLookalike, recentCounterparties } from "../lib/lookalike";
import { fromUnix, short } from "../lib/units";
import { useTx } from "../lib/useTx";
import type { Receipt } from "../lib/logs";
import { Card, Field, TxStatus } from "./ui";

const STATUS = ["", "Pending", "Confirmed", "Removed"];

export function PayeesPanel({ st, me, receipts }: { st: CreatorState; me: Address; receipts: Receipt[] }) {
  const [label, setLabel] = useState("");
  const [addr, setAddr] = useState("");
  const [delayH, setDelayH] = useState(String(Number(st.delay) / 3600));
  const tx = useTx();

  const known = useMemo(
    () => [
      ...st.payees.filter((p) => p.status !== 3).map((p) => p.wallet),
      ...receipts.filter((r) => r.creator.toLowerCase() === me.toLowerCase()).map((r) => r.payee),
      ...recentCounterparties(),
    ],
    [st.payees, receipts, me],
  );
  const valid = isAddress(addr, { strict: false });
  const look = valid ? findLookalike(addr, known) : null;
  const exists = valid && st.payees.some((p) => p.status !== 3 && p.wallet.toLowerCase() === addr.toLowerCase());

  return (
    <>
      <Card title="Add a payee">
        <Field label="Name or handle">
          <input maxLength={64} placeholder="Ada (@ada_writes)" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Wallet address" hint={addr && !valid ? "That isn't a valid address." : "Paste it from the payee directly, never from your tx history."}>
          <input className="mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
        </Field>
        {look && (
          <div className="alert danger">
            ⚠️ <b>Possible address poisoning.</b> This address starts and ends like <code>{short(look)}</code>, which you already pay or
            know, but it is a <b>different</b> address. Scammers create lookalikes to trick you. Double-check with the payee before
            adding it.
          </div>
        )}
        {exists && <div className="alert">This address is already in your payee book.</div>}
        <button
          disabled={!label || !valid || exists || tx.state.status === "busy"}
          onClick={async () => {
            if (await tx.send({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "addPayee", args: [label, getAddress(addr)] }, "Add payee")) {
              setLabel("");
              setAddr("");
            }
          }}
        >
          {look ? "Add anyway (I verified it)" : "Add payee"}
        </button>
        <p className="muted">New payees start as <b>Pending</b>. You must confirm them before they can be paid.</p>
      </Card>

      <Card title={`Payee book (${st.payees.filter((p) => p.status !== 3).length})`}>
        {st.payees.filter((p) => p.status !== 3).length === 0 && <p className="muted">No payees yet.</p>}
        {st.payees
          .filter((p) => p.status !== 3)
          .map((p) => (
            <PayeeItem key={p.id.toString()} p={p} delay={st.delay} send={tx.send} busy={tx.state.status === "busy"} />
          ))}
      </Card>

      <Card title="Waiting period">
        <Field label="Hours between adding and confirming a payee (0–168)" hint="A cooling-off delay gives you time to spot a wrong address.">
          <input inputMode="numeric" value={delayH} onChange={(e) => setDelayH(e.target.value)} />
        </Field>
        <button
          className="ghost"
          disabled={!/^\d+$/.test(delayH) || Number(delayH) > 168}
          onClick={() => tx.send({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "setConfirmDelay", args: [BigInt(delayH) * 3600n] }, "Set waiting period")}
        >
          Save ({Number(st.delay) / 3600}h now)
        </button>
      </Card>
      <TxStatus s={tx.state} />
    </>
  );
}

function PayeeItem({ p, delay, send, busy }: { p: PayeeRow; delay: bigint; send: ReturnType<typeof useTx>["send"]; busy: boolean }) {
  const [re, setRe] = useState("");
  const confirmableAt = p.addedAt + delay;
  const early = BigInt(Math.floor(Date.now() / 1000)) < confirmableAt;
  const match = re.toLowerCase() === p.wallet.toLowerCase();
  return (
    <div className={`payee ${p.status === 2 ? "ok" : "pending"}`}>
      <div className="row between">
        <b>{p.label}</b>
        <span className={`chip ${p.status === 2 ? "green" : "amber"}`}>{STATUS[p.status]}</span>
      </div>
      <a className="mono small" href={explorerAddress(p.wallet)} target="_blank" rel="noreferrer">
        {p.wallet}
      </a>
      {p.status === 1 && (
        <>
          <Field label="Re-type or paste the full address to confirm" hint={early ? `Can confirm after ${fromUnix(confirmableAt)}` : re && !match ? "Doesn't match." : undefined}>
            <input className="mono" placeholder="0x…" value={re} onChange={(e) => setRe(e.target.value.trim())} />
          </Field>
          <button disabled={!match || early || busy} onClick={() => send({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "confirmPayee", args: [p.id, p.wallet] }, `Confirm ${p.label}`)}>
            Confirm payee
          </button>
        </>
      )}
      <button className="ghost small" disabled={busy} onClick={() => confirm(`Remove ${p.label}? Re-adding needs a new confirmation.`) && send({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "removePayee", args: [p.id] }, `Remove ${p.label}`)}>
        Remove
      </button>
    </div>
  );
}

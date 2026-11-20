import { useEffect, useState } from "react";
import { isAddress, getAddress, type Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { VAULT, payboundVaultAbi } from "../contracts";
import { aevum } from "../chain";
import type { CreatorState } from "../lib/data";
import { fmt, fromUnix, parseAmount, short, toUnix } from "../lib/units";
import { useTx } from "../lib/useTx";
import { Card, Field, PERIODS, TxStatus, defaultExpiry } from "./ui";

export function LimitsPanel({ st, me, agents }: { st: CreatorState; me: Address; agents: string[] }) {
  const tx = useTx();
  const confirmed = st.payees.filter((p) => p.status === 2);
  const [pid, setPid] = useState<string>("");
  useEffect(() => {
    if (!pid && confirmed[0]) setPid(confirmed[0].id.toString());
  }, [confirmed, pid]);
  const payee = confirmed.find((p) => p.id.toString() === pid);
  const [perTx, setPerTx] = useState("");
  const [cap, setCap] = useState("");
  const [period, setPeriod] = useState("86400");
  const [exp, setExp] = useState(defaultExpiry());
  const a = parseAmount(perTx);
  const b = parseAmount(cap);
  const okLimit = a !== null && b !== null && a > 0n && a <= b && new Date(exp).getTime() > Date.now();

  return (
    <>
      <Card title="Pause" accent={st.paused ? "danger" : ""}>
        <p>{st.globalPaused ? "⚠️ Paybound is paused by the guardian." : st.paused ? "⏸ Your vault is paused. No payments can go out." : "✅ Payments are on."}</p>
        <button className={st.paused ? "" : "danger"} disabled={tx.state.status === "busy"} onClick={() => tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "setCreatorPaused", args: [!st.paused] }, st.paused ? "Unpause" : "Pause")}>
          {st.paused ? "Unpause payments" : "Pause all payments"}
        </button>
      </Card>

      <Card title="Payee spending limit">
        {confirmed.length === 0 ? (
          <p className="muted">Confirm a payee first.</p>
        ) : (
          <>
            <Field label="Payee">
              <select value={pid} onChange={(e) => setPid(e.target.value)}>
                {confirmed.map((p) => (
                  <option key={p.id.toString()} value={p.id.toString()}>
                    {p.label} · {short(p.wallet)}
                  </option>
                ))}
              </select>
            </Field>
            {payee?.limit?.active && (
              <div className="limitbox">
                <span>Per payment <b>{fmt(payee.limit.perTxCap)}</b></span>
                <span>Per period <b>{fmt(payee.limit.periodCap)}</b></span>
                <span>Can still send <b>{fmt(payee.remaining)}</b></span>
                <span>Expires <b>{fromUnix(payee.limit.expiresAt)}</b></span>
              </div>
            )}
            <div className="grid2">
              <Field label="Per-payment cap">
                <input inputMode="decimal" placeholder="0.25" value={perTx} onChange={(e) => setPerTx(e.target.value)} />
              </Field>
              <Field label="Period cap">
                <input inputMode="decimal" placeholder="0.50" value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
              <Field label="Period">
                <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {PERIODS.map((p) => (
                    <option key={p.label} value={p.s.toString()}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Expires">
                <input type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} />
              </Field>
            </div>
            <div className="row">
              <button disabled={!okLimit || tx.state.status === "busy"} onClick={() => tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "setPayeeLimit", args: [BigInt(pid), a!, b!, BigInt(period), toUnix(exp)] }, "Set limit")}>
                Save limit
              </button>
              {payee?.limit?.active && (
                <button className="ghost danger" onClick={() => tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "revokePayeeLimit", args: [BigInt(pid)] }, "Revoke limit")}>
                  Revoke
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      <Sessions me={me} agents={agents} tx={tx} />
      <TxStatus s={tx.state} />
    </>
  );
}

function Sessions({ me, agents, tx }: { me: Address; agents: string[]; tx: ReturnType<typeof useTx> }) {
  const client = usePublicClient({ chainId: aevum.id });
  const mine = agents.filter((k) => k.startsWith(me.toLowerCase() + ":")).map((k) => k.split(":")[1] as Address);
  const sessions = useQuery({
    queryKey: ["sessions", me, mine.join()],
    enabled: !!client,
    queryFn: () =>
      Promise.all(
        mine.map(async (agent) => ({
          agent,
          s: await client!.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "session", args: [me, agent] }),
          left: await client!.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "remainingForSession", args: [me, agent] }),
        })),
      ),
  });
  const [agent, setAgent] = useState("");
  const [perTx, setPerTx] = useState("");
  const [cap, setCap] = useState("");
  const [period, setPeriod] = useState("86400");
  const [exp, setExp] = useState(defaultExpiry(7));
  const a = parseAmount(perTx);
  const b = parseAmount(cap);
  const ok = isAddress(agent) && agent.toLowerCase() !== me.toLowerCase() && a !== null && b !== null && a > 0n && a <= b;
  return (
    <Card title="Agent sessions">
      <p className="muted">Optional. Let an agent key send payments for you within its own caps and expiry. Payee limits still apply on top. Revoking takes effect immediately.</p>
      {sessions.data?.map(({ agent, s, left }) => (
        <div className="payee" key={agent}>
          <div className="row between">
            <span className="mono small">{short(agent)}</span>
            <span className={`chip ${s.active && Number(s.expiresAt) * 1000 > Date.now() ? "green" : "grey"}`}>{s.active ? (Number(s.expiresAt) * 1000 > Date.now() ? "Active" : "Expired") : "Revoked"}</span>
          </div>
          {s.active && (
            <>
              <small>Per payment {fmt(s.perTxCap)} · period {fmt(s.periodCap)} · left {fmt(left)} · until {fromUnix(s.expiresAt)}</small>
              <button className="ghost danger small" onClick={() => tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "revokeSession", args: [agent] }, "Revoke session")}>
                Revoke now
              </button>
            </>
          )}
        </div>
      ))}
      <Field label="Agent address">
        <input className="mono" placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value.trim())} />
      </Field>
      <div className="grid2">
        <Field label="Per-payment cap"><input inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} /></Field>
        <Field label="Period cap"><input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Field label="Period">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => <option key={p.label} value={p.s.toString()}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Expires"><input type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
      </div>
      <button disabled={!ok || tx.state.status === "busy"} onClick={() => tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "grantSession", args: [getAddress(agent), a!, b!, BigInt(period), toUnix(exp)] }, "Grant session")}>
        Grant session
      </button>
    </Card>
  );
}

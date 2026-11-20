import { useState } from "react";
import { erc20Abi, formatEther, type Address } from "viem";
import { TUSD8, VAULT, payboundVaultAbi } from "../contracts";
import type { CreatorState } from "../lib/data";
import { fmt, parseAmount } from "../lib/units";
import { useTx } from "../lib/useTx";
import { Card, Field, TxStatus } from "./ui";

export function VaultPanel({ st }: { st: CreatorState; me: Address }) {
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");
  const tx = useTx();
  const d = parseAmount(dep);
  const w = parseAmount(wd);
  const needsApprove = d !== null && st.allowance < d;

  async function deposit() {
    if (!d) return;
    if (needsApprove) {
      // approve the exact amount only — never unlimited
      const ok = await tx.send({ address: TUSD8, abi: erc20Abi, functionName: "approve", args: [VAULT, d] }, "Approve tUSD8");
      if (!ok) return;
    }
    if (await tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "deposit", args: [d] }, "Deposit")) setDep("");
  }

  return (
    <>
      <div className="stats">
        <div className="stat grad1">
          <small>In your vault</small>
          <b>{fmt(st.vaultBal)}</b>
          <small>tUSD8</small>
        </div>
        <div className="stat grad2">
          <small>In your wallet</small>
          <b>{fmt(st.wallet)}</b>
          <small>tUSD8</small>
        </div>
        <div className="stat grad3">
          <small>Gas</small>
          <b>{Number(formatEther(st.gas)).toFixed(3)}</b>
          <small>tQDAY</small>
        </div>
      </div>
      <Card title="Deposit">
        <Field label="Amount (tUSD8)" hint={d === null && dep ? "Enter a number with up to 6 decimals" : `Wallet: ${fmt(st.wallet)}`}>
          <input inputMode="decimal" placeholder="0.50" value={dep} onChange={(e) => setDep(e.target.value)} />
        </Field>
        <button disabled={!d || d > st.wallet || tx.state.status === "busy"} onClick={deposit}>
          {needsApprove ? "Approve & deposit" : "Deposit"}
        </button>
      </Card>
      <Card title="Withdraw">
        <Field label="Amount (tUSD8)" hint="Withdrawals always work, even while paused.">
          <input inputMode="decimal" placeholder="0.10" value={wd} onChange={(e) => setWd(e.target.value)} />
        </Field>
        <div className="row">
          <button className="ghost" onClick={() => setWd(fmt(st.vaultBal).replace(/,/g, ""))}>Max</button>
          <button
            disabled={!w || w > st.vaultBal || tx.state.status === "busy"}
            onClick={async () => {
              if (await tx.send({ address: VAULT, abi: payboundVaultAbi, functionName: "withdraw", args: [w!] }, "Withdraw")) setWd("");
            }}
          >
            Withdraw
          </button>
        </div>
      </Card>
      <TxStatus s={tx.state} />
    </>
  );
}

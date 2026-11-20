import { useState } from "react";
import type { Address } from "viem";
import { explorerAddress, explorerTx } from "../chain";
import type { CreatorState } from "../lib/data";
import type { Receipt } from "../lib/logs";
import { fmt, short } from "../lib/units";
import { Card } from "./ui";

export function ReceiptsPanel({
  receipts,
  finalized,
  loading,
  progress,
  me,
  st,
}: {
  receipts: Receipt[];
  finalized?: bigint;
  loading: boolean;
  progress: number;
  me?: Address;
  st?: CreatorState;
}) {
  const [all, setAll] = useState(!me);
  const list = all || !me ? receipts : receipts.filter((r) => r.creator.toLowerCase() === me.toLowerCase());
  const label = (r: Receipt) => st?.payees.find((p) => p.id === r.payeeId && p.wallet.toLowerCase() === r.payee.toLowerCase())?.label;
  return (
    <Card title="Receipts">
      <div className="row between">
        <small className="muted">
          {loading ? `Scanning chain… ${progress}%` : `Finalized block ${finalized ?? "…"}`}
        </small>
        {me && (
          <button className="ghost small" onClick={() => setAll(!all)}>
            {all ? "Show mine" : "Show all"}
          </button>
        )}
      </div>
      {list.length === 0 && !loading && <p className="muted">No payments yet.</p>}
      {list.map((r) => {
        const final = finalized !== undefined && r.blockNumber <= finalized;
        return (
          <article className="receipt" key={r.id}>
            <div className="row between">
              <b className="amt">{fmt(r.amount)} tUSD8</b>
              <span className={`chip ${final ? "green" : "amber"}`} title={final ? "At or below the node's finalized block" : "Included in the latest chain, not finalized yet"}>
                {final ? "Payment final" : "Payment seen"}
              </span>
            </div>
            <p>
              → {label(r) ?? "Payee"}{" "}
              <a className="mono" href={explorerAddress(r.payee)} target="_blank" rel="noreferrer">
                {short(r.payee)}
              </a>
              {r.memo && <> · “{r.memo}”</>}
            </p>
            <dl>
              <dt>Receipt</dt>
              <dd>#{r.receiptId.toString()}</dd>
              <dt>Chain ID</dt>
              <dd>{r.chainId}</dd>
              <dt>Token</dt>
              <dd className="mono">{short(r.token)}</dd>
              <dt>Tx</dt>
              <dd>
                <a className="mono" href={explorerTx(r.txHash)} target="_blank" rel="noreferrer">
                  {short(r.txHash)} ↗
                </a>
              </dd>
              <dt>Log index</dt>
              <dd>{r.logIndex}</dd>
              <dt>Block</dt>
              <dd>{r.blockNumber.toString()}</dd>
              <dt>Sent by</dt>
              <dd className="mono">{r.executor.toLowerCase() === r.creator.toLowerCase() ? "creator" : `agent ${short(r.executor)}`}</dd>
            </dl>
          </article>
        );
      })}
    </Card>
  );
}

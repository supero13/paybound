import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi } from "viem";
import { aevum } from "../chain";
import { humanError } from "./errors";

export type TxState = { status: "idle" | "busy" | "done" | "error"; msg?: string; hash?: `0x${string}` };
type Req = { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[] };

/** Simulate → sign → wait for receipt, with plain-English status. Refreshes all reads after. */
export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: aevum.id });
  const qc = useQueryClient();

  async function send(req: Req, label: string): Promise<boolean> {
    try {
      setState({ status: "busy", msg: `Checking "${label}"…` });
      // Simulate first so a revert shows a clear reason *before* the wallet prompt.
      await client!.simulateContract({ ...req, account: address } as never);
      setState({ status: "busy", msg: `Confirm "${label}" in your wallet…` });
      const hash = await writeContractAsync({ ...req, chainId: aevum.id } as never);
      setState({ status: "busy", msg: `${label}: waiting for the block…`, hash });
      const r = await client!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted on-chain.");
      setState({ status: "done", msg: `${label}: confirmed ✓`, hash });
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setState({ status: "error", msg: humanError(e) });
      return false;
    }
  }
  return { state, send };
}

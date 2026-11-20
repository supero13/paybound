import { parseEventLogs, type PublicClient, type Address } from "viem";
import { DEPLOY_BLOCK, LOG_PAGE, VAULT, payboundVaultAbi } from "../contracts";
import { aevum } from "../chain";

export interface Receipt {
  id: string; // `${txHash}:${logIndex}` — dedupe key
  chainId: number;
  token: Address;
  receiptId: bigint;
  creator: Address;
  payee: Address;
  payeeId: bigint;
  executor: Address;
  amount: bigint;
  memo: string;
  ref: `0x${string}`;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
}

export interface SessionEvt {
  agent: Address;
  creator: Address;
  blockNumber: bigint;
}

interface Cache {
  to: string; // last block scanned (inclusive), as string
  receipts: Record<string, Omit<Receipt, "receiptId" | "payeeId" | "amount" | "blockNumber"> & { receiptId: string; payeeId: string; amount: string; blockNumber: string }>;
  agents: string[];
}

const cacheKey = () => `paybound:logs:${aevum.id}:${VAULT.toLowerCase()}`;

function load(): Cache {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()) ?? "");
    if (c && c.to) return c;
  } catch {
    /* empty */
  }
  return { to: (DEPLOY_BLOCK - 1n).toString(), receipts: {}, agents: [] };
}

/**
 * Scans ALL vault logs from the deploy block to `latest` in ≤ LOG_PAGE-block pages,
 * caching progress in localStorage, deduping receipts by txHash:logIndex.
 */
export async function scanVault(client: PublicClient, token: Address, onProgress?: (pct: number) => void) {
  const cache = load();
  const latest = await client.getBlockNumber();
  const start = BigInt(cache.to) + 1n;
  const ranges: [bigint, bigint][] = [];
  for (let f = start; f <= latest; f += LOG_PAGE) ranges.push([f, f + LOG_PAGE - 1n > latest ? latest : f + LOG_PAGE - 1n]);
  const PARALLEL = 6;
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const chunk = ranges.slice(i, i + PARALLEL);
    const pages = await Promise.all(chunk.map(([fromBlock, toBlock]) => client.getLogs({ address: VAULT, fromBlock, toBlock })));
    for (const raw of pages) {
      for (const l of parseEventLogs({ abi: payboundVaultAbi, logs: raw })) {
        if (l.eventName === "PaymentExecuted") {
          const a = l.args;
          const id = `${l.transactionHash}:${l.logIndex}`;
          cache.receipts[id] = {
            id,
            chainId: aevum.id,
            token,
            receiptId: a.receiptId.toString(),
            creator: a.creator,
            payee: a.payee,
            payeeId: a.payeeId.toString(),
            executor: a.executor,
            amount: a.amount.toString(),
            memo: a.memo,
            ref: a.ref,
            txHash: l.transactionHash,
            logIndex: l.logIndex,
            blockNumber: l.blockNumber.toString(),
          };
        } else if (l.eventName === "SessionGranted") {
          const k = `${l.args.creator.toLowerCase()}:${l.args.agent}`;
          if (!cache.agents.includes(k)) cache.agents.push(k);
        }
      }
    }
    cache.to = chunk[chunk.length - 1][1].toString();
    localStorage.setItem(cacheKey(), JSON.stringify(cache));
    onProgress?.(Math.round(((i + chunk.length) * 100) / ranges.length));
  }
  const receipts: Receipt[] = Object.values(cache.receipts).map((r) => ({
    ...r,
    receiptId: BigInt(r.receiptId),
    payeeId: BigInt(r.payeeId),
    amount: BigInt(r.amount),
    blockNumber: BigInt(r.blockNumber),
  }));
  receipts.sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)));
  return { receipts, agents: cache.agents, latest };
}

/** Node's `finalized` block; payments at or below it are final. */
export async function finalizedBlock(client: PublicClient): Promise<bigint> {
  const b = await client.getBlock({ blockTag: "finalized" });
  return b.number ?? 0n;
}

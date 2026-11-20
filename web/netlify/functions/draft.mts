/**
 * POST /api/draft  { creator: "0x…", text: "pay Ada 5 for the logo" }
 * Reads the creator's payees + limits FROM THE CHAIN, drafts a payment, and dry-runs it with
 * PayboundVault.previewPayment(). Returns a draft only: no keys, no signing, no sending.
 */
import { createPublicClient, http, isAddress, keccak256, toHex, type Address } from "viem";
import { finalizeDraft, parseWithRules, type ChainPayee, type Proposal } from "../../../assistant/src/core.ts";
import { llmEnabled, parseWithLlm } from "../../../assistant/src/llm.ts";
import { payboundVaultAbi } from "../../src/abi/PayboundVault.ts";
import { payeeRegistryAbi } from "../../src/abi/PayeeRegistry.ts";

const RPC = process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info";
const VAULT = (process.env.VITE_VAULT_ADDRESS || "0xB332eea4bBb9CA78371C63BccB0B5b50C213383E") as Address;
const REGISTRY = (process.env.VITE_REGISTRY_ADDRESS || "0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a") as Address;
const MAX_PAYEES = 50;

const BLOCKERS = [
  "Ready to sign. The on-chain check passed.",
  "Paybound is paused by the guardian.",
  "Your vault is paused.",
  "Amount must be more than zero.",
  "This payee is not confirmed.",
  "No spending limit is set for this payee.",
  "This payee's spending limit has expired.",
  "Amount is above this payee's per-payment cap.",
  "Amount would go over this payee's limit for the current period.",
  "This wallet is not allowed to pay from this vault.",
  "The agent session has expired.",
  "Amount is above the agent session's per-payment cap.",
  "Amount would go over the agent session's period limit.",
  "Not enough tUSD8 in your vault. Deposit more first.",
];
const STATUS = ["removed", "pending", "confirmed", "removed"] as const;

const client = createPublicClient({ transport: http(RPC, { timeout: 10_000 }) });

async function readPayees(creator: Address): Promise<ChainPayee[]> {
  const count = Number(await client.readContract({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "payeeCount", args: [creator] }));
  const ids = Array.from({ length: Math.min(count, MAX_PAYEES) }, (_, i) => BigInt(count - i)); // newest first
  return Promise.all(
    ids.map(async (id) => {
      const [p, l, remaining] = await Promise.all([
        client.readContract({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "getPayee", args: [creator, id] }),
        client.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "payeeLimit", args: [creator, id] }),
        client.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "remainingForPayee", args: [creator, id] }),
      ]);
      return {
        id: id.toString(),
        label: p.label,
        wallet: p.wallet,
        status: STATUS[Number(p.status)],
        limitActive: l.active,
        perTxCap: l.perTxCap.toString(),
        remaining: remaining.toString(),
        expiresAt: Number(l.expiresAt),
      };
    }),
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (raw.length > 4000) return json({ error: "Message too long." }, 413);
  let creator: string, text: string;
  try {
    ({ creator, text } = JSON.parse(raw));
  } catch {
    return json({ error: "Bad JSON." }, 400);
  }
  if (typeof creator !== "string" || !isAddress(creator)) return json({ error: "Connect your wallet first." }, 400);
  if (typeof text !== "string" || !text.trim() || text.length > 500) return json({ error: "Type a request of up to 500 characters." }, 400);

  const payees = await readPayees(creator as Address);
  const confirmedLabels = payees.filter((p) => p.status === "confirmed").map((p) => p.label);

  let proposal: Proposal = parseWithRules(text, payees);
  let parser: "rules" | "llm" = "rules";
  let llmNote: string | undefined;
  if (llmEnabled(process.env)) {
    try {
      proposal = await parseWithLlm(text, confirmedLabels, process.env);
      parser = "llm";
    } catch (e) {
      llmNote = `AI parser unavailable (${(e as Error).message}); used the built-in parser.`;
    }
  }
  const draft = finalizeDraft(text, proposal, payees, parser);
  if (llmNote) draft.warnings.push(llmNote);

  let preview: { code: number; message: string } | null = null;
  if (draft.payee && draft.amount) {
    const [code] = await client.readContract({
      address: VAULT,
      abi: payboundVaultAbi,
      functionName: "previewPayment",
      args: [creator as Address, creator as Address, BigInt(draft.payee.id), BigInt(draft.amount)],
    });
    preview = { code: Number(code), message: BLOCKERS[Number(code)] ?? `Blocked (${code})` };
    if (code !== 0 && !draft.blockers.length) draft.blockers.push(preview.message);
    draft.ok = draft.ok && code === 0;
  }
  const ref = keccak256(toHex(JSON.stringify({ creator, payee: draft.payee, amount: draft.amount, memo: draft.memo, t: Date.now() })));
  return json({ ...draft, preview, ref, chainId: 44005, vault: VAULT, llm: llmEnabled(process.env) });
};

export const config = { path: "/api/draft" };

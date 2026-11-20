/**
 * Paybound assistant core: pure, dependency-free drafting + guard rails.
 * Used by the Netlify Function (web/netlify/functions/draft.mts) and by the tests.
 *
 * Safety model (enforced here no matter what the user text or an LLM says):
 *  1. Payees come from the CHAIN (PayeeRegistry), never from the prompt. Only CONFIRMED payees
 *     can be drafted. Pending / removed / unknown names are refused.
 *  2. Raw addresses in the prompt are untrusted: never used as a destination, never auto-added.
 *  3. Amounts must appear literally in the user's text (an LLM can't invent or change them),
 *     6 decimals max, and are checked against on-chain limits via previewPayment().
 *  4. Memos are public and must not carry instructions, addresses, or links.
 *  5. The assistant returns a DRAFT only. It has no keys; the creator signs in their wallet.
 */
import { findLookalike } from "./lookalike.ts";

export const DECIMALS = 6;

export interface ChainPayee {
  id: string; // decimal string
  label: string;
  wallet: string;
  status: "pending" | "confirmed" | "removed";
  limitActive: boolean;
  perTxCap: string; // raw units
  remaining: string; // raw units payable now
  expiresAt: number; // unix seconds
}

export interface Proposal {
  payeeLabel: string | null;
  amount: string | null; // human string as written, e.g. "0.05"
  memo: string;
}

export interface Draft {
  ok: boolean; // true only if no blockers (preview still decides on-chain)
  parser: "rules" | "llm";
  payee: { id: string; label: string; wallet: string } | null;
  amount: string | null; // raw 6-decimal units
  amountDisplay: string | null;
  memo: string;
  blockers: string[];
  warnings: string[];
}

const ADDRESS_RE = /0x[0-9a-fA-F]{40}\b/g;
const INJECTION_RE = [
  /ignore (all |any |the )?(previous|prior|above|earlier)/i,
  /disregard (all |any |the )?(previous|prior|above|instructions|rules)/i,
  /\b(system|assistant)\s*(prompt|message)?\s*:/i,
  /you are now|act as|new instructions|developer mode|jailbreak/i,
  /\b(add|register|whitelist|allowlist)\b.{0,20}\bpayee\b/i,
  /\b(raise|increase|remove|bypass|disable|change)\b.{0,20}\b(cap|limit|policy|pause)\b/i,
  /\b(private key|seed phrase|mnemonic)\b/i,
  /\b(send|pay|transfer)\b.{0,15}\b(all|everything|entire balance|max)\b/i,
  /\b(instead|rather)\b.{0,30}\b(send|pay|to)\b/i,
  /<\/?[a-z]+[^>]*>|```/i,
];

/** "25", "0.05", "1,000.5" -> raw units; null if invalid or more than 6 decimals. */
export function toUnits(s: string): bigint | null {
  const clean = s.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > DECIMALS) return null;
  return BigInt(whole) * 10n ** BigInt(DECIMALS) + BigInt(frac.padEnd(DECIMALS, "0") || "0");
}

export function formatUnits(v: bigint): string {
  const base = 10n ** BigInt(DECIMALS);
  const frac = (v % base).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${v / base}${frac ? "." + frac : ""}`;
}

export function looksLikeInjection(s: string): boolean {
  return INJECTION_RE.some((r) => r.test(s));
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Deterministic parser: payee label (longest match among ALL on-chain payees), amount, memo. */
export function parseWithRules(text: string, payees: ChainPayee[]): Proposal {
  const t = text.replace(ADDRESS_RE, " ").replace(/\s+/g, " ").trim();
  const lower = t.toLowerCase();
  // longest label first so "Smoke Payee 2" beats "Smoke Payee"
  const sorted = [...payees].filter((p) => p.status !== "removed").sort((a, b) => b.label.length - a.label.length);
  let label: string | null = null;
  let rest = t;
  for (const p of sorted) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(norm(p.label))}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (re.test(lower)) {
      label = p.label;
      rest = t.replace(new RegExp(esc(p.label), "i"), " ");
      break;
    }
  }
  if (!label) {
    // capture an unknown name after pay/send/give so we can say who we couldn't find
    const m = t.match(/\b(?:pay|send|give|tip)\s+(@?[\p{L}][\p{L}\p{N}_.\- ]{0,30}?)(?=\s+\$?\d|\s*$)/iu);
    label = m ? m[1].trim() : null;
  }
  const memoMatch = rest.match(/\b(?:for|memo[:\s])\s*(.+)$/i);
  const memo = memoMatch ? memoMatch[1].trim().replace(/^["'“]|["'”]$/g, "") : "";
  const beforeMemo = memoMatch ? rest.slice(0, memoMatch.index) : rest;
  const amounts = [...beforeMemo.matchAll(/(?<![\p{L}\d.,])(?:\$\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(?:t?usd8?|usdt?|dollars?|\$))?/giu)].map((m) => m[1]);
  return { payeeLabel: label, amount: amounts.length === 1 ? amounts[0] : amounts.length > 1 ? `AMBIGUOUS:${amounts.join("|")}` : null, memo };
}

/**
 * Validate a proposal (from rules OR an LLM) against on-chain payees and the original text.
 * This is the single choke point: nothing reaches the UI without passing here.
 */
export function finalizeDraft(text: string, proposal: Proposal, payees: ChainPayee[], parser: Draft["parser"]): Draft {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 2. raw addresses are untrusted
  const known = payees.filter((p) => p.status !== "removed").map((p) => p.wallet);
  for (const a of text.match(ADDRESS_RE) ?? []) {
    const look = findLookalike(a, known);
    const exact = known.find((k) => k.toLowerCase() === a.toLowerCase());
    if (look) warnings.push(`⚠️ ${short(a)} looks like your payee's address ${short(look)} but is different, so it could be address poisoning. I ignored it.`);
    else if (exact) warnings.push(`I ignored the address you typed. I only pay payees by name from your confirmed payee book.`);
    else warnings.push(`I ignored ${short(a)}. I never pay or add addresses typed into chat. Add and confirm new payees in the Payees tab.`);
  }
  if (looksLikeInjection(text)) {
    warnings.push("Your message contains instructions to change payees, limits or recipients. I can't do that; only you can, in the app.");
  }

  // 1. payee must be CONFIRMED on-chain
  let payee: Draft["payee"] = null;
  if (!proposal.payeeLabel) {
    blockers.push("Who should I pay? Use the name of a confirmed payee, e.g. “pay Ada 5 for the logo”.");
  } else {
    const matches = payees.filter((p) => norm(p.label) === norm(proposal.payeeLabel!) && p.status !== "removed");
    const confirmed = matches.filter((p) => p.status === "confirmed");
    if (confirmed.length === 1) {
      const p = confirmed[0];
      payee = { id: p.id, label: p.label, wallet: p.wallet };
      if (!p.limitActive) blockers.push(`${p.label} has no spending limit yet. Set one in the Limits tab.`);
      else if (p.expiresAt * 1000 <= Date.now()) blockers.push(`${p.label}'s spending limit has expired.`);
    } else if (confirmed.length > 1) {
      blockers.push(`More than one confirmed payee is called “${proposal.payeeLabel}”. Use the Pay tab to pick one.`);
    } else if (matches.some((p) => p.status === "pending")) {
      blockers.push(`“${proposal.payeeLabel}” is still Pending. Confirm their address in the Payees tab before paying.`);
    } else {
      blockers.push(`“${proposal.payeeLabel}” isn't in your confirmed payee book. I can only pay confirmed payees.`);
    }
  }

  // 3. amount: literal in text, ≤6 decimals, > 0, within cap
  let amount: bigint | null = null;
  if (!proposal.amount) blockers.push("How much? Add an amount in tUSD8, e.g. “0.05”.");
  else if (proposal.amount.startsWith("AMBIGUOUS:")) blockers.push(`I see more than one amount (${proposal.amount.slice(10).split("|").join(", ")}). Send one payment at a time.`);
  else {
    const literal = new RegExp(`(^|[^\\d.])${esc(proposal.amount)}($|[^\\d])`).test(text.replace(ADDRESS_RE, " "));
    amount = toUnits(proposal.amount);
    if (!literal) {
      blockers.push("The amount must be written in your message.");
      amount = null;
    } else if (amount === null) blockers.push("tUSD8 has 6 decimals; that amount has too many.");
    else if (amount === 0n) blockers.push("Amount must be more than zero.");
    else if (payee) {
      const p = payees.find((x) => x.id === payee!.id)!;
      if (p.limitActive && amount > BigInt(p.perTxCap)) blockers.push(`That's above ${p.label}'s per-payment cap of ${formatUnits(BigInt(p.perTxCap))} tUSD8.`);
      else if (p.limitActive && amount > BigInt(p.remaining)) blockers.push(`That's over what you can still send ${p.label} this period (${formatUnits(BigInt(p.remaining))} tUSD8).`);
    }
  }

  // 4. memo hygiene (memos are public, on-chain)
  let memo = proposal.memo.slice(0, 140);
  if (memo && (looksLikeInjection(memo) || /0x[0-9a-fA-F]{6,}/.test(memo) || /https?:\/\/|www\./i.test(memo))) {
    blockers.push("The memo contains instructions, an address or a link. Memos are public, so keep it to a short description like “logo design”.");
    memo = "";
  }

  return {
    ok: blockers.length === 0,
    parser,
    payee,
    amount: amount?.toString() ?? null,
    amountDisplay: amount !== null ? formatUnits(amount) : null,
    memo,
    blockers,
    warnings,
  };
}

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;

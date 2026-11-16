import { createHash } from "node:crypto";
import type { Payee, PaymentDraft } from "./types.ts";
import { lookalikeOf } from "./lookalike.ts";

const DECIMALS = 6n;
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/g;

/** Parse "25", "25.5", "1,000" into raw 6-decimal units. Returns null if invalid. */
export function toUnits(s: string): bigint | null {
  const clean = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole) * 10n ** DECIMALS + BigInt(frac.padEnd(6, "0"));
}

/**
 * Deterministic fallback drafter (also the guard-rail layer around the LLM).
 * Security rules, enforced regardless of what the model or pasted text says:
 *  - Only payees already Confirmed on-chain can be selected. Raw addresses in the request
 *    are NEVER used as a destination; they only trigger warnings.
 *  - The assistant cannot add payees, change limits, or sign anything.
 */
export function draftFromText(text: string, payees: Payee[]): PaymentDraft {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const amountMatch = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:t?usd8?|\$)?/i);
  const units = amountMatch ? toUnits(amountMatch[1]) : null;
  if (units === null || units === 0n) blockers.push("I couldn't find a valid amount.");

  const lower = text.toLowerCase();
  const matches = payees.filter((p) => new RegExp(`\\b${escapeRe(p.label.toLowerCase())}\\b`).test(lower));
  let payee: Payee | null = null;
  if (matches.length === 1) payee = matches[0];
  else if (matches.length > 1) blockers.push(`That matches more than one payee: ${matches.map((m) => m.label).join(", ")}.`);
  else blockers.push("No confirmed payee matches. Add and confirm them in your payee book first.");

  for (const addr of text.match(ADDRESS_RE) ?? []) {
    const known = payees.find((p) => p.wallet.toLowerCase() === addr.toLowerCase());
    if (known) continue;
    const look = lookalikeOf(addr, payees.map((p) => p.wallet));
    warnings.push(
      look
        ? `${addr} looks like a known payee's address (${look}) but is different. Possible address poisoning; it was ignored.`
        : `${addr} is not a confirmed payee and was ignored. Paybound only pays confirmed payees.`,
    );
  }
  if (/ignore (all|previous)|add (a )?payee|raise (the )?(cap|limit)|new address/i.test(text)) {
    warnings.push("The text contains instructions to change payees or limits. The assistant can't do that; only you can, in the app.");
  }

  const memoMatch = text.match(/\bfor\s+(.{1,120})$/i);
  const draft: PaymentDraft = {
    payeeId: payee?.id ?? null,
    payeeLabel: payee?.label ?? null,
    wallet: payee?.wallet ?? null,
    amount: units !== null && units > 0n ? units.toString() : null,
    memo: memoMatch ? memoMatch[1].trim().slice(0, 140) : "",
    blockers,
    warnings,
  };
  draft.ref = "0x" + createHash("sha256").update(JSON.stringify(draft)).digest("hex");
  return draft;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { BaseError, ContractFunctionRevertedError } from "viem";
import { BLOCKER_MESSAGES } from "../contracts";

const NAMED: Record<string, string> = {
  AddressMismatch: "The address you re-entered doesn't match the saved one. Check it character by character.",
  ConfirmTooEarly: "This payee is still in its waiting period. Try again after the delay.",
  AlreadyActive: "That address is already in your payee book.",
  InvalidLabel: "Name must be 1–64 characters.",
  SelfPayee: "You can't add your own wallet as a payee.",
  InvalidLimit: "Check the limit: per-payment cap must be > 0 and ≤ period cap, period 1h–365d, expiry in the future.",
  InvalidAgent: "Agent address must be a different wallet.",
  InsufficientBalance: "Not enough tUSD8 in your vault.",
  NoSuchLimit: "There's nothing active to revoke.",
  MemoTooLong: "Memo must be 140 characters or fewer.",
  DelayTooLong: "Waiting period can be at most 7 days.",
};

/** Turn any wallet / RPC / revert error into one plain-English line. */
export function humanError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name === "PaymentBlocked") return BLOCKER_MESSAGES[Number(revert.data?.args?.[0] ?? 0)];
      if (name && NAMED[name]) return NAMED[name];
      if (name) return name;
    }
    if (/user rejected|denied/i.test(e.message)) return "You cancelled the request in your wallet.";
    if (/insufficient funds/i.test(e.message)) return "Not enough tQDAY for gas. Claim some at faucet.qday.info.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

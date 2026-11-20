import type { Address } from "viem";
export { payboundVaultAbi } from "./abi/PayboundVault";
export { payeeRegistryAbi } from "./abi/PayeeRegistry";

/** Official tUSD8 on Aevum 44005. 6 decimals, never 18. */
export const TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
export const TUSD8_DECIMALS = 6;

/** Deployed on Aevum 44005 (17 Nov 2026). Override with VITE_* env vars. */
export const VAULT = (import.meta.env.VITE_VAULT_ADDRESS || "0xB332eea4bBb9CA78371C63BccB0B5b50C213383E") as Address;
export const REGISTRY = (import.meta.env.VITE_REGISTRY_ADDRESS || "0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a") as Address;
/** Block the vault was deployed in; receipts scanning starts here. */
export const DEPLOY_BLOCK = 3390615n;
/** Max block span per eth_getLogs request. */
export const LOG_PAGE = 1000n;

/** Order must match PayboundVault.Blocker. */
export const BLOCKER_MESSAGES = [
  "OK",
  "Paybound is paused by the guardian. Withdrawals still work.",
  "You paused your vault. Unpause it to send payments.",
  "Amount must be more than zero.",
  "This payee is not confirmed yet. Confirm their address before paying.",
  "No spending limit is set for this payee.",
  "This payee's spending limit has expired.",
  "Amount is above this payee's per-payment cap.",
  "Amount would go over this payee's limit for the current period.",
  "This wallet is not allowed to pay from this vault.",
  "The agent session has expired.",
  "Amount is above the agent session's per-payment cap.",
  "Amount would go over the agent session's period limit.",
  "Not enough tUSD8 in your vault. Deposit more first.",
] as const;

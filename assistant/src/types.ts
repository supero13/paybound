/** A payee as read from PayeeRegistry (only Confirmed payees are ever offered to the model). */
export interface Payee {
  id: number;
  label: string;
  wallet: `0x${string}`;
}

/** What the assistant returns. It is a *proposal*; the creator signs (or rejects) it in their wallet. */
export interface PaymentDraft {
  payeeId: number | null;
  payeeLabel: string | null;
  wallet: `0x${string}` | null;
  /** raw tUSD8 units (6 decimals) as a decimal string */
  amount: string | null;
  memo: string;
  /** human-readable reasons the draft cannot be signed yet */
  blockers: string[];
  warnings: string[];
  /** keccak/sha256 of the draft, recorded on-chain as `ref` in the receipt */
  ref?: string;
}

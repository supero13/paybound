# Demo script (outline, 3 to 5 min)

1. **Problem (30s):** creators pay by handle; lookalike addresses; agents need leashes.
2. **Setup on screen (15s):** wallet on 44005, funded vault, two confirmed payees (Ada, Bola), and a tight cap on Ada.
3. **Happy path (90s):** "Pay Ada 25 tUSD8 for the November thread" → draft → sign → explorer link.
4. **Safety edges (90s):**
   - Over-cap: "Pay Ada 10,000" is blocked before the signature (`OverPayeeTxCap`).
   - Unknown or poisoned address in pasted invoice text is ignored, with a warning.
   - Revoke Ada's limit, retry, and show the on-chain revert (`NoPayeeLimit`).
5. **Close (30s):** the assistant drafts, the chain enforces. Roadmap.

## Sample prompts
<!-- TODO -->

## Replay steps for failure cases
<!-- TODO: exact tx sequence + expected Blocker codes -->

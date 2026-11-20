# DoraHacks BUIDL submission (draft, for Francis to paste)

> Draft only. Nothing has been submitted. Before pasting, replace `<VIDEO LINK>` with your YouTube (or similar) link.

## Project name
Paybound

## Tagline
AI payouts in tUSD8 that only reach confirmed payees, within on-chain limits you control.

## Short description
Paybound turns "pay Ada 5 tUSD8 for the logo" into a draft you approve. Funds go only to confirmed payees, within revocable caps enforced by a vault on QDay Aevum.

## Track
Confirmation of Payee (stablecoin payments)

## Full description

### The problem
Creators and campaigns pay collaborators by name, but stablecoins move by address. That gap is where money gets lost. Address poisoning plants lookalike addresses in your history, invoices can hide instructions, and unlimited approvals turn one mistake into a total loss. As AI agents start moving stablecoins, an agent that can be talked into a new address or a bigger amount makes all of this easier.

### The solution
Paybound is Confirmation of Payee for AI-assisted payouts. You ask in plain English, and the assistant drafts the payment. The money can only go to a payee you have confirmed, within limits enforced on-chain, and only after you approve and sign. The assistant drafts, the chain enforces, and you stay in control.

### How it works
1. **Fund a vault.** Deposit tUSD8 into PayboundVault with an exact-amount approval. You can always withdraw.
2. **Confirm payees.** Add a payee with a label and address. It starts as Pending, and you confirm it by re-entering the full address, optionally after a cooling-off delay.
3. **Set limits.** Each payee gets a per-payment cap, a period cap and an expiry. Agent keys can get scoped, expiring sessions with their own caps.
4. **Ask.** "send the smoke payee five cents for testing". The draft endpoint reads your payees and limits from the chain (not from your text), parses the request with an LLM or a rule-based fallback, applies guard rails, and runs the contract's `previewPayment()`.
5. **Approve and sign.** You review the draft (payee, amount, memo and a plain-English check result) and sign `pay()` in your wallet. A hash of the draft is stored in the on-chain receipt.
6. **Verify and revoke.** Receipts show chain ID, token, tx, log index and block, marked "Payment seen" or "Payment final". You can revoke limits and sessions or pause at any time.

### Why it's safe
- The assistant has no keys, no allowance and no session. A fully compromised model still can't move funds.
- Only Confirmed payees can be paid. The rule is enforced by the contracts, not just the UI.
- Raw addresses typed in chat are never paid or added, and lookalike (poisoned) addresses are flagged.
- Prompt-injection text ("ignore previous instructions…") blocks the draft. The LLM sees labels only, and its proposal must match a confirmed label and an amount from the user's own words.
- Caps are checked before signing (`previewPayment()`) and enforced again in `pay()`. Re-setting a limit can't refill a period.
- Creator pause plus a guardian global pause. The guardian can stop payments but can't move funds. Withdrawals always work.
- Each draft carries a unique `ref`, the app won't send the same draft twice, and receipts are deduped by `txHash:logIndex`.

### What's on-chain (QDay Aevum Testnet, chain 44005)
- **PayeeRegistry** `0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a`: per-creator payee book (Pending, then Confirmed, or Removed) with an optional confirmation delay.
- **PayboundVault** `0xB332eea4bBb9CA78371C63BccB0B5b50C213383E`: tUSD8 custody, per-payee limits, agent sessions, pause, `previewPayment()` and `PaymentExecuted` receipts.
- **Token:** official tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` (6 decimals).
- **Sample AI-drafted payout:** `0x28dba4e6a8556e964cf3e6e975c584be2164ab0c64121808d1b8ab1e6a71d74f`, 0.05 tUSD8 to "Smoke Payee".

Tested with 64 passing tests: 44 Foundry (unit, fuzz, and a fork test against real tUSD8 on Aevum) and 20 assistant tests (resolution, refusals, injection, LLM re-validation).

### What's next
- Use QDay's official ERC-4337 session keys and stablecoin paymaster (gasless payouts) once their addresses are published.
- ERC-8004 identity for the assistant.
- Batch payouts and campaign splits.
- Source verification on the explorer once QDay's verifier is fixed.
- QDay mainnet once it launches.

### Known limitations
- Testnet only. Not audited.
- Explorer source verification currently fails on QDay's side; the deployed bytecode matches a local build.
- WalletConnect is wired in but off (no project id yet). Phones use wallet in-app browsers or deep links.
- The demo video's approval step is a scripted signature from the deployer wallet, using the real draft's ref, memo and amount.

## Tech stack
- **Contracts:** Solidity 0.8.24, Foundry (unit, fuzz and fork tests), OpenZeppelin, deployed on QDay Aevum Testnet (44005)
- **Frontend:** Vite, React, TypeScript, wagmi, viem; mobile-first; hosted on Netlify
- **Assistant:** a Netlify Function (`/api/draft`) running a TypeScript guard-rail core; provider-agnostic OpenAI-compatible LLM (live on Groq `openai/gpt-oss-120b`) with a deterministic rule-based fallback
- **Token:** tUSD8 (official QDay test stablecoin)

## Links
- **GitHub:** https://github.com/supero13/paybound
- **Live app:** https://paybound-qday.netlify.app
- **Demo video:** <VIDEO LINK> (upload `demo/paybound-demo.mp4` from the repo, 3:45)
- **Explorer:** https://explorer-test.qday.info/address/0xB332eea4bBb9CA78371C63BccB0B5b50C213383E

## Contract addresses (Aevum Testnet 44005)
| Contract | Address |
|---|---|
| PayeeRegistry | `0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a` |
| PayboundVault | `0xB332eea4bBb9CA78371C63BccB0B5b50C213383E` |
| tUSD8 | `0x456569838f1d43009A91ebA4263147Afd7233483` |

## Team
Solo builder: **Francis**. GitHub [supero13](https://github.com/supero13), X [@FrancisJD13](https://x.com/FrancisJD13).

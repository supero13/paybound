# Paybound

**An AI payout assistant for creators that can only pay confirmed payees, inside on-chain limits you can revoke.**

You tell Paybound who to pay in plain English. It drafts the payment, and you approve and sign it. tUSD8 only ever goes to payees you have confirmed, within per-payee caps enforced by the vault contract on QDay Aevum. The assistant drafts, the chain enforces, and you stay in control.

> Built for **QDay Aevum Builder Challenge #1**, **Track: Confirmation of Payee** (stablecoin payments, with an AI drafting layer). **Testnet only. Test tokens only. Not audited.**

| | |
|---|---|
| Live app | https://paybound-qday.netlify.app (on a phone, open it in your wallet's in-app browser, or use the "Open in MetaMask" links) |
| Repo | https://github.com/supero13/paybound |
| Demo video | [`demo/paybound-demo.mp4`](demo/paybound-demo.mp4) (3:45, 1080p, with voiceover). Phone copy: [`demo/paybound-demo-mobile.mp4`](demo/paybound-demo-mobile.mp4) (720p). Script: [`demo/SCRIPT.md`](demo/SCRIPT.md) |
| Sample payout (AI draft, signed on-chain) | [`0x28dba4e6…71d74f`](https://explorer-test.qday.info/tx/0x28dba4e6a8556e964cf3e6e975c584be2164ab0c64121808d1b8ab1e6a71d74f), 0.05 tUSD8 to "Smoke Payee", block 3654295 |
| Network | QDay Aevum Testnet, chain ID `44005` (`0xABE5`), RPC `https://rpc-test.qday.info`, explorer https://explorer-test.qday.info |
| Tests | **64 passing**: 44 Foundry (unit, 2 fuzz, 1 Aevum fork) + 20 assistant |

## The problem
Creators and campaigns pay collaborators by name ("pay Ada for the logo"), not by address. Paying by address is where money gets lost. Address poisoning plants lookalike addresses in your history. Invoices and DMs can carry hidden instructions. Unlimited token approvals turn one mistake into a total loss. Now AI agents are starting to move stablecoins, and an agent that can be talked into a new address or a bigger amount makes every one of these attacks easier.

## How Paybound works
Paybound is **Confirmation of Payee** for on-chain payouts: an AI drafts payouts, tUSD8 goes only to confirmed payees within revocable on-chain caps, and a human approves every payment.

1. **Fund a bounded vault.** Deposit tUSD8 into `PayboundVault` with an exact-amount approve, never an unlimited one. You can always withdraw, even while paused.
2. **Confirm payees.** Add a payee (label and address) to `PayeeRegistry`. It starts as Pending. To confirm it, you re-enter the full address, optionally after a cooling-off delay (0 to 168h). Only Confirmed payees can be paid.
3. **Set the limits.** Each payee gets a per-payment cap, a period cap (1h / 1d / 1w / 30d) and an expiry. You can revoke a limit at any time.
4. **Ask, don't auto-send.** In the **Ask** tab, type "send the smoke payee five cents for testing". The assistant resolves the payee **from the chain**, checks the amount, and runs the contract's `previewPayment()`. It returns a draft with the payee, amount, memo, and a plain-English result.
5. **Approve and sign.** Tap **Approve & sign** and your wallet signs `pay()`. The assistant has no keys. A hash of the draft (`ref`) is recorded in the on-chain receipt.
6. **Verify.** The Receipts tab lists every `PaymentExecuted` event with an explorer link, showing "Payment seen" (latest block) or "Payment final" (the node's finalized block).
7. **Revoke anytime.** Revoke a payee limit or an agent session, pause your vault, or let the guardian pause all payments.

Optionally, you can give an agent key a **scoped session** with its own per-payment and period caps and an expiry. Payee limits still apply on top of it, and revoking takes effect immediately.

```
Ask tab ──text──▶ /api/draft (Netlify Function)
                   reads payees + limits from chain, LLM or rule parser,
                   guard rails, previewPayment()
                         │ draft (no keys)
                         ▼
Web app ──creator signs pay()──▶ PayboundVault ──tUSD8──▶ confirmed payee
            │                       │  caps, sessions, pause, receipts
            └──add / confirm──────▶ PayeeRegistry
```
More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deployed contracts (Aevum Testnet 44005)
Deployed 17 Nov 2026 at block 3390615 by `0x45C5B3c807Da0f46eD82539924a5EFe0A010ba6f` (a testnet-only deployer, which is also the guardian for now). Full record: [`deployments/aevum-44005.json`](deployments/aevum-44005.json).

| Contract | Address | Deploy tx |
|---|---|---|
| PayeeRegistry | [`0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a`](https://explorer-test.qday.info/address/0x5942f4Ce67411cF4AE1d794535Ebdf9374E7659a) | [`0x80299e42…3ec5`](https://explorer-test.qday.info/tx/0x80299e42a036713c9e612a73aded64d42b0845ef94e8eb5ff6dc1fcf6a803ec5) |
| PayboundVault | [`0xB332eea4bBb9CA78371C63BccB0B5b50C213383E`](https://explorer-test.qday.info/address/0xB332eea4bBb9CA78371C63BccB0B5b50C213383E) | [`0x2b171f43…b13a`](https://explorer-test.qday.info/tx/0x2b171f436649abced5c8863f60f381db7d7d35c796438e72f8bf59f3af15b13a) |
| tUSD8 (official, 6 decimals) | [`0x456569838f1d43009A91ebA4263147Afd7233483`](https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483) | n/a |

Constructor: `PayboundVault(tUSD8, PayeeRegistry, guardian)`. Compiler: solc 0.8.24, optimizer 200 runs, evmVersion `paris`. The on-chain runtime bytecode matches a local `forge build` byte for byte.

## Safety model
| Risk | Control | Where |
|---|---|---|
| Paying the wrong address | Only **Confirmed** payees can be paid. You confirm by re-entering the full address, with an optional delay. | `PayeeRegistry`, enforced in `PayboundVault.pay` |
| Address poisoning | A loud warning when a new address shares its first and last 4 hex characters with an existing payee, a past payee or a recent counterparty. Lookalike addresses typed in Ask are flagged. | `web/src/lib/lookalike.ts`, `assistant/src/lookalike.ts` |
| Prompt injection | Injection text ("ignore previous instructions", "instead send to…", "raise the cap") blocks the draft. Raw addresses in chat are never paid or added. The LLM sees labels only, and its proposal must match a confirmed label exactly, with an amount that appears in the user's text. | `assistant/src/core.ts` |
| Over-spending | Per-payment cap, period cap and expiry per payee. `previewPayment()` runs before you sign, and `pay()` enforces the same checks again. Re-setting a limit keeps the spend already used in the current period. | `PayboundVault` |
| Runaway agents | Scoped, expiring agent sessions with their own caps. The creator can revoke them instantly. | `PayboundVault.grantSession` / `revokeSession` |
| Emergencies | Creator pause, plus a guardian global pause. The guardian can stop payments but can't move funds. Withdrawals always work. | `PayboundVault` |
| Double-paying / idempotency | Each draft carries a unique `ref` hash. Once a draft is sent, its Approve button is disabled, and buttons stay disabled while a tx is pending. Every payment gets a unique on-chain `receiptId`. Receipts are indexed in ≤1000-block pages and deduped by `txHash:logIndex`, so re-scans never double-count. | `web/src/components/AskPanel.tsx`, `web/src/lib/logs.ts` |
| Receipts | `PaymentExecuted(receiptId, creator, payee, payeeId, executor, amount, ref, memo)` for every payout, shown with chain ID, token, tx, log index and block, as "seen" or "final". | `PayboundVault`, Receipts tab |
| Leaked keys | The assistant has no keys, allowance or session. The LLM key is a Netlify secret env var. No private keys are in git. | `web/netlify/functions/draft.mts`, `.gitignore` |

## Judging criteria map
| Criterion (weight) | What to look at |
|---|---|
| UX (15) | Mobile-first bold UI. Plain-English Ask tab. Every contract blocker is translated into a readable reason before signing. Wallet deep links for phones. |
| Demo (10) | A 3:45 narrated video ([`demo/paybound-demo.mp4`](demo/paybound-demo.mp4)), the live app, and a real AI-drafted payout on Aevum ([tx](https://explorer-test.qday.info/tx/0x28dba4e6a8556e964cf3e6e975c584be2164ab0c64121808d1b8ab1e6a71d74f)). |
| Docs (10) | This README, [ARCHITECTURE](docs/ARCHITECTURE.md), [DEMO](docs/DEMO.md) with sample prompts and on-chain replay steps, [LIMITS-AND-ROADMAP](docs/LIMITS-AND-ROADMAP.md). |
| Innovation (20) | Confirmation of Payee for AI payouts: the LLM only proposes, and on-chain payee confirmation plus caps decide. Draft hashes are recorded in receipts. |
| Technical (15) | Two Solidity contracts; 44 Foundry tests including fuzzing and a fork test on real tUSD8; a wagmi/viem app; a Netlify Function that reads the chain; a provider-agnostic LLM with a rule-based fallback; 20 assistant tests. |
| Utility (15) | Real creator and campaign payouts in tUSD8 by name. Works with any EVM wallet, and works without an LLM key. |
| Safety (15) | See [Safety model](#safety-model): confirmed payees, poisoning warnings, injection blocking, caps, revocable sessions, pause, receipts. |

## Known limitations
- **Blockscout source verification is broken on QDay's side.** Verification was submitted on 17 Nov 2026 and returned `Fail - Unable to verify`. The explorer's verifier lists no compiler versions, and no contract on it is verified, not even the official tUSD8. The bytecode matches a local build. Re-run the commands under [Quick start](#deploy-aevum-testnet) once the verifier is fixed.
- **WalletConnect is optional and off.** It switches on only when `VITE_WC_PROJECT_ID` (a Reown project id) is set at build time. Phones use the wallet in-app browser or the deep links instead.
- **The demo approval is a scripted signature.** The video shows the real Ask draft and the Approve screen with a read-only stand-in wallet. The on-chain payment in the video ([`0x28dba4e6…`](https://explorer-test.qday.info/tx/0x28dba4e6a8556e964cf3e6e975c584be2164ab0c64121808d1b8ab1e6a71d74f)) was signed from the deployer wallet with `cast`, using that draft's own `ref`, memo and amount.
- The contract does not reject a reused `ref`. Double-pay protection is in the app, while the caps limit the worst case on-chain.
- Testnet only. Payee labels are public on-chain. Period windows are fixed, not sliding. Not audited. More in [docs/LIMITS-AND-ROADMAP.md](docs/LIMITS-AND-ROADMAP.md).

## AI drafting assistant
- **Endpoint:** `POST /api/draft` `{ creator, text }`, a Netlify Function (`web/netlify/functions/draft.mts`). It reads the creator's payees and limits **from the chain** (PayeeRegistry and PayboundVault on 44005), never from the user's text.
- **Core logic:** `assistant/src/core.ts` is pure TypeScript with no dependencies, unit-tested in `assistant/test/core.test.ts` (20 tests).
- **Refusals:** unknown, pending or removed payees; confirmed payees with no limit or an expired one; amounts over the per-payment cap or over what's left in the period; missing, zero, ambiguous or more-than-6-decimal amounts; injection text; memos with addresses or links.
- **Defense in depth:** before signing, the browser re-checks the draft's payee id and wallet against its own on-chain read of the payee book.
- **LLM is optional and provider-agnostic.** Set these Netlify env vars to switch it on; without them a deterministic rule-based parser runs, so the demo works with no key.

  | Var | Example |
  |---|---|
  | `LLM_API_KEY` | key for any OpenAI-compatible Chat Completions API (required to enable) |
  | `LLM_BASE_URL` | `https://api.openai.com/v1` (default), or e.g. `https://api.groq.com/openai/v1`, `https://openrouter.ai/api/v1` |
  | `LLM_MODEL` | `gpt-4o-mini` (default). **Live demo uses Groq `openai/gpt-oss-120b`** with `LLM_BASE_URL=https://api.groq.com/openai/v1` |

  The live site runs on **Groq (`openai/gpt-oss-120b`)**. The key is a Netlify *secret* env var, never in git; locally it lives in the gitignored `.env.llm`. Responses include `"parser": "llm"` when the model was used.

  The model only sees confirmed payee **labels** (no addresses or balances) and must return `{payee_label, amount, memo}`. `amount` is the **verbatim phrase** from the message (e.g. "five cents"), which `phraseToUnits()` converts deterministically, so the model never does the arithmetic. Every field then goes through the same guard rails, so an invented label or amount is rejected. If the LLM fails or times out (8s), the built-in parser is used.

| Draft ready | Refusals (injection, poisoning, unknown payee) | Phone: open in wallet |
|---|---|---|
| ![](docs/screenshots/mobile-ask.png) | ![](docs/screenshots/mobile-ask-refusals.png) | ![](docs/screenshots/mobile-connect-deeplinks.png) |

## Web app
Mobile-first, bold UI with six tabs (Ask is the default):

| Tab | What it does |
|---|---|
| 🤖 **Ask** | A plain-English request returns a draft with the live `previewPayment()` result; Approve & sign. |
| ⚡ **Pay** | Pick a confirmed payee, enter an amount, and see a live on-chain `previewPayment()` result in plain English (for example "Amount is above this payee's per-payment cap") **before** signing. Every payment records a `ref` hash of the approved draft. |
| 👥 **Payees** | Add a payee as Pending, then **confirm by re-entering the full address**, after an optional 0–168h waiting period. Remove payees. **Address-poisoning warning** when a new address shares its first and last 4 hex chars with an existing payee, a past payee, or a recent counterparty. |
| 🛡️ **Limits** | Per-payment cap, period cap (1h / 1d / 1w / 30d), and expiry per payee; revoke. Agent sessions: grant and revoke with their own caps and expiry. Pause or unpause all payments. |
| 🏦 **Vault** | Deposit (exact-amount `approve` → `deposit`, never unlimited) and withdraw. Balances in tUSD8 and tQDAY. |
| 🧾 **Receipts** | Every `PaymentExecuted` event shows chain ID, token, tx hash (explorer link), log index, block, payee, amount, and memo. Logs are fetched in ≤1000-block pages from the deploy block, cached locally, and deduped by `txHash:logIndex`. **Payment seen** means it's in the `latest` chain; **Payment final** means it's at or below the node's `finalized` block. |

Amounts are `bigint` end to end, and decimals are pinned to 6 in `web/src/contracts.ts`. The app refuses any chain other than 44005, simulates every transaction first so reverts show a readable reason, and maps every contract error and `Blocker` code to plain English.

**Phones:** inside a wallet's browser (MetaMask, Trust, Coinbase, OKX), the injected wallet connects directly. In normal Safari or Chrome, Paybound shows **Open in MetaMask / Trust Wallet / Coinbase Wallet / OKX Wallet** deep links (e.g. `https://metamask.app.link/dapp/paybound-qday.netlify.app`).

| Pay (blocked over cap) | Payees (poisoning warning) | Limits | Receipts |
|---|---|---|---|
| ![](docs/screenshots/mobile-pay.png) | ![](docs/screenshots/mobile-payees.png) | ![](docs/screenshots/mobile-limits.png) | ![](docs/screenshots/mobile-receipts.png) |

## End-to-end smoke test (Aevum 44005, 20 Nov 2026)
`scripts/smoke.sh` (uses gitignored `.env` / `.env.payee`):

| Step | Tx |
|---|---|
| approve 0.5 tUSD8 | [0xe0a36f…9507](https://explorer-test.qday.info/tx/0xe0a36fbd11b59c629c04a08e8e539a645782244cca3e1ac357f64169ce159507) |
| deposit 0.5 | [0x41135c…1c90](https://explorer-test.qday.info/tx/0x41135c4cc79be9ac969ad360954ec94b73b629b6e8fbf484814e7bbbc1201c90) |
| addPayee "Smoke Payee" | [0xa092b1…4799](https://explorer-test.qday.info/tx/0xa092b1f43c1408d0025db101e77d1c14149dbbefa5a8777b7817fe02c0694799) |
| confirmPayee (re-entered address) | [0x7b8f3d…7fd7](https://explorer-test.qday.info/tx/0x7b8f3db920958237a9edb15ec99098b9127833a24a7fcba1eea07828ffd57fd7) |
| setPayeeLimit 0.25/tx, 0.5/day, 30d | [0x91723f…d498](https://explorer-test.qday.info/tx/0x91723f734b9c514383b0fa46d12bc534c1675b850d9a3fb741a356c33bfcd498) |
| previewPayment 0.30 → `OverPayeeTxCap` (7); 0.10 → `None` (0) | eth_call |
| pay 0.1 tUSD8, memo "Week 2 smoke test" → receipt #1 | [0x658a79…d292](https://explorer-test.qday.info/tx/0x658a79fc542f4afb1d3de2533a9e9629836b19fff46143487de0e503e1c2d292) |

Result: the payee received 0.1 tUSD8, the vault balance is 0.4, 0.25 is left under the cap, and the receipt shows in the web app.

## Quick start
### Prerequisites
- Foundry, Node 22.6+ (Node 24 recommended)
- A wallet on Aevum 44005 with tQDAY for gas and tUSD8 from https://faucet.qday.info

### Try it (no install)
Open https://paybound-qday.netlify.app, connect a wallet on chain 44005, deposit a little tUSD8, add and confirm a payee, set a limit, then ask: *"send <payee> 0.05 for testing"*.

### Contracts
```bash
git clone --recursive https://github.com/supero13/paybound && cd paybound/contracts
forge build
forge test                                      # 44 tests: unit + fuzz
FORK=1 forge test --match-contract AevumFork    # happy path against the real tUSD8 on an Aevum fork
```

### Deploy (Aevum testnet)
```bash
cp .env.example .env             # fill DEPLOYER_PRIVATE_KEY (a throwaway TESTNET key)
cd contracts && set -a && . ../.env && set +a
forge script script/Deploy.s.sol --rpc-url aevum --broadcast --legacy
```
Verify on the explorer (Blockscout):
```bash
forge verify-contract <REGISTRY> src/PayeeRegistry.sol:PayeeRegistry --chain-id 44005 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/
forge verify-contract <VAULT> src/PayboundVault.sol:PayboundVault --chain-id 44005 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/ \
  --constructor-args $(cast abi-encode "c(address,address,address)" 0x456569838f1d43009A91ebA4263147Afd7233483 <REGISTRY> <GUARDIAN>)
```

### Web and assistant
```bash
node scripts/export-abi.mjs
cd web && cp .env.example .env   # contract addresses default to the deployed ones
npm install && npm run dev
cd ../assistant && npm test      # 20 tests: resolution, refusals, injection, LLM re-validation
cd ../web && npx netlify dev     # serves the app + /api/draft locally (rule parser unless LLM_* env vars are set)
```

## Repo layout
| Path | What |
|---|---|
| `contracts/` | Foundry project: `PayeeRegistry.sol`, `PayboundVault.sol`, tests, deploy script |
| `web/` | Vite + React + wagmi/viem frontend (hard-locked to chain 44005) |
| `web/netlify/functions/` | `/api/draft` Netlify Function (reads the chain, calls the core, runs previewPayment) |
| `assistant/` | Propose-only drafting core and optional LLM adapter (no keys); guard-rail and injection tests |
| `demo/` | Demo video, script, and the capture/render pipeline |
| `scripts/` | ABI export, on-chain smoke test |
| `docs/` | Architecture, demo guide, limits and roadmap, submission text |

## License
MIT

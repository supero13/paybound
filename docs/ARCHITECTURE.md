# Architecture

## Components
- **PayeeRegistry**: per-creator address book. `addPayee` → Pending; `confirmPayee(id, reenteredAddress)` → Confirmed (after an optional `confirmDelayOf`, max 7 days); `removePayee` is permanent per id.
- **PayboundVault**: multi-tenant custody of tUSD8. Per-creator balances, per-payee `Limit`s, per-agent session `Limit`s, creator pause, guardian global pause, and `previewPayment` dry-run returning a `Blocker` code.
- **Web app** (`web/`): Vite + React + wagmi/viem, hard-locked to 44005. Six tabs: Ask, Pay, Payees, Limits, Vault, Receipts. Every write is simulated first, and `Blocker` codes and errors are shown in plain English.
- **Draft endpoint** (`web/netlify/functions/draft.mts`, `POST /api/draft`): reads the creator's payees and limits from the chain, calls the assistant core, runs `previewPayment()`, and returns a draft with a unique `ref` hash. It uses a read-only RPC and holds no wallet keys. The optional LLM key is a Netlify secret env var.
- **Assistant** (`assistant/src/core.ts`, `llm.ts`, `lookalike.ts`): propose-only drafter with a rule-based parser and an optional OpenAI-compatible LLM (the live site uses Groq `openai/gpt-oss-120b`). It has no keys and cannot add payees or change limits.
- **Guardian**: the vault's `owner` (currently the testnet deployer). It can only set the global payment pause and can't move funds.

## Who can sign what
| Action | Creator | Session agent | Guardian | Assistant |
|---|---|---|---|---|
| deposit / withdraw own funds | ✅ | ❌ | ❌ | ❌ |
| add / confirm / remove payees | ✅ | ❌ | ❌ | ❌ |
| set / revoke payee limits | ✅ | ❌ | ❌ | ❌ |
| grant / revoke sessions | ✅ | ❌ | ❌ | ❌ |
| pay confirmed payee within limits | ✅ | ✅ (within session caps too) | ❌ | ❌ (draft only) |
| global pause | ❌ | ❌ | ✅ | ❌ |

## Limit semantics
- `perTxCap ≤ periodCap`, `1h ≤ periodLength ≤ 365d`, `expiresAt > now`.
- Fixed windows: the window resets on the first payment after `periodStart + periodLength`.
- Re-setting a limit **keeps** spend already used in the open window, so a reset can't refill the budget.

## Events (receipts and indexing)
`Deposited`, `Withdrawn`, `PayeeLimitSet`, `PayeeLimitRevoked`, `SessionGranted`, `SessionRevoked`, `CreatorPauseSet`, `GlobalPauseSet`, `PaymentExecuted(receiptId, creator, payee, payeeId, executor, amount, ref, memo)`; registry: `PayeeAdded`, `PayeeConfirmed`, `PayeeRemoved`, `ConfirmDelaySet`.

## Blocker codes
`None, GloballyPaused, CreatorPaused, ZeroAmount, PayeeNotConfirmed, NoPayeeLimit, PayeeLimitExpired, OverPayeeTxCap, OverPayeePeriodCap, NotAuthorized, SessionExpired, OverSessionTxCap, OverSessionPeriodCap, InsufficientBalance` (plain-English messages are in `web/src/contracts.ts`).

## QDay features used vs. not depended on
- Used: Aevum 44005 EVM (cdk-erigon; compiled for `paris`), official tUSD8, tQDAY gas, explorer.
- Not depended on: x402, the stablecoin paymaster, ERC-4337 session wallets, ERC-8004 agent registry, and PQC precompiles. They're optional upgrades once official addresses are published.

## Diagram
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

## Receipts and idempotency
- Every `pay()` emits `PaymentExecuted` with a unique, incrementing `receiptId` and the draft's `ref`.
- The Receipts tab scans logs from the deploy block in ≤1000-block pages, caches them locally, and dedupes by `txHash:logIndex`. A receipt is "Payment seen" at `latest` and "Payment final" at or below the node's `finalized` block.
- Each draft has a unique `ref`. Once a draft is sent, its Approve button is disabled, and buttons stay disabled while a tx is pending. The contract does **not** reject a reused `ref`, so double-pay protection is in the app, and the per-payee caps bound the worst case on-chain.

## Assistant safety model
The assistant is a **drafting** layer. It has no keys, no allowance and no session, so it can't move funds even if fully compromised.

| Threat | Control |
|---|---|
| Prompt names an attacker as payee | Payees come only from `PayeeRegistry` for the connected `creator`. Only **Confirmed** labels resolve; Pending, Removed and unknown names are refused. |
| Raw / poisoned address in prompt | Addresses in text are stripped before parsing and never used or auto-added. Lookalikes (same first/last 4 hex) of a payee are flagged. |
| Injection ("ignore previous…", "raise the cap", "instead send to…") | Regex detector flags it. In the memo it **blocks** the draft and the memo is cleared. The assistant has no tool that changes payees or limits. |
| LLM hallucinates or is jailbroken | The LLM sees labels only and returns a JSON proposal. `finalizeDraft()` requires the label to match a confirmed payee exactly and the amount to appear **literally** in the user's text. Otherwise it's rejected. |
| Over-spend | Local cap check plus on-chain `previewPayment()` before the user sees **Approve**, and the contract enforces caps again at `pay()`. |
| Tampered function response | The browser re-checks the payee id and wallet against its own on-chain payee read before building the tx, and the wallet shows the real calldata. |
| Public memo leaks | Memos with addresses or links are blocked; max 140 chars. |
| Abuse of endpoint | POST only, 4 KB body, 500-char prompt, address-validated creator, read-only RPC. |

Flow: `text → parseWithRules | parseWithLlm → finalizeDraft (guard rails) → previewPayment (chain) → draft → user Approve → wallet signs pay(creator, payeeId, amount, ref, memo)`. The `ref` hash links the on-chain receipt to the draft.

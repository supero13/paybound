# Architecture (outline)

## Components
- **PayeeRegistry**: per-creator address book. `addPayee` → Pending; `confirmPayee(id, reenteredAddress)` → Confirmed (after an optional `confirmDelayOf`, max 7 days); `removePayee` is permanent per id.
- **PayboundVault**: multi-tenant custody of tUSD8. Per-creator balances, per-payee `Limit`s, per-agent session `Limit`s, creator pause, guardian global pause, and `previewPayment` dry-run returning a `Blocker` code.
- **Web app**: wagmi/viem, hard-locked to 44005.
- **Assistant**: propose-only drafter. It has no keys and cannot add payees or change limits.

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
- Not depended on: x402, the stablecoin paymaster, ERC-4337 session wallets, ERC-8004 agent registry, and PQC precompiles. They're optional upgrades if official addresses are published. <!-- TODO links -->

## Diagram
<!-- TODO: export a diagram image -->

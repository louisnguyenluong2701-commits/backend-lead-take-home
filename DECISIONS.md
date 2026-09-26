# Decisions

## Locking strategy

Postgres row locks (`SELECT ... FOR UPDATE` inside a `sequelize.transaction`), not optimistic
locking with a version column. Contention here is per-row and short-lived (one member's wallet,
one funding transaction), so a lock that makes the second writer simply wait is simpler and just
as correct as detecting-and-retrying a version conflict, with less code. It also reuses the
transaction convention already in the starter (`memberService.createMember`).

The key trick for the PSP callback: the lock is taken on the `funding_transactions` row keyed by
`psp_ref`, not on the wallet first. Two concurrent deliveries of the same callback both try to
lock the _same_ funding-transaction row; whichever wins commits the `pending -> completed`
transition and the wallet credit; the loser blocks until that commit, then re-reads
`status = 'completed'`, sees its own status already applied, and no-ops. That's what makes
duplicate-concurrent (not just duplicate-sequential) callbacks safe — see `test/deposits.test.ts`.

Wagers and withdrawals lock the wallet row directly for the same reason: whoever gets the lock
first sees a consistent balance/turnover snapshot, and the second waiter re-reads post-commit
state before deciding whether it can proceed.

## Schema

- `funding_transactions`: one row per deposit or withdrawal. `psp_ref` is unique (partial index,
  `WHERE psp_ref IS NOT NULL`) and is how the callback looks up the pending deposit. Withdrawals
  have no `psp_ref` — there's no PSP callback for withdrawals in this exercise ("assume a human
  approves it later"). `status` is `pending | completed | failed`; the service layer is the only
  place that flips it, guarded by the row lock, and only along `pending -> completed` /
  `pending -> failed`. `requested_amount` vs `confirmed_amount` are kept separate (see amount
  mismatch below).
- `wallet_txs`: append-only ledger, one row per balance movement (`deposit`, `withdrawal`,
  `wager`), signed `amount` (positive = credit, negative = debit) plus a `balance_after` snapshot.
  Nothing in the codebase updates or deletes a `wallet_txs` row — enforced by convention (no
  `updated_at` column, models never call `.update`/`.destroy` on it), not by a DB trigger, since
  a trigger felt like more machinery than a take-home warrants. `SUM(amount)` over a wallet's rows
  reconstructs the balance independently of the `balance_after` snapshots, which exist purely for
  cheap auditing.
- `wallets.required_turnover` / `wallets.accrued_turnover`: denormalized counters, updated inside
  the same locked transaction as the balance change that causes them to move (deposit completion
  bumps `required_turnover`, a wager bumps `accrued_turnover`). This is a deliberate departure from
  "everything is reconstructible from the ledger" — turnover isn't a money movement, it's a
  bookkeeping counter, and recomputing it by re-scanning every deposit/wager on every withdrawal
  check felt like the wrong trade for a value that's cheap to maintain incrementally and always
  updated in lockstep with the wallet row it lives on.

## Amount mismatch on the PSP callback

If the callback's `amount` differs from what the deposit requested, the wallet is credited with
the **PSP-confirmed amount**, not the originally requested one — `confirmed_amount` is stored
separately on the funding transaction so the discrepancy is visible, but the money that actually
arrived is what the ledger reflects. Rationale: the PSP is the system of record for what money
actually moved; crediting the requested amount when the PSP says something else arrived would let
the ledger diverge from reality. In production this would also emit an alert/metric on mismatch
(reconciliation, possible fraud signal) — out of scope here but noted as a next step.

## Unknown `pspRef`

Returns `404` with no side effect. Since nothing happens either way, a PSP that retries an unknown
ref is harmless — it'll just get `404` again.

## Conflicting terminal transition

If a callback arrives claiming a status that conflicts with an already-terminal transaction (e.g.
already `completed`, now told `failed`), the handler returns `409` and leaves the row untouched
rather than silently applying the second write. This is deliberately stricter than "last write
wins" — a completed deposit that a later callback tries to fail is a signal worth surfacing, not
swallowing.

## What I'd do next with more time

- Withdrawal's `required_turnover`/`accrued_turnover` check only looks at the wallet's running
  counters; a full reconciliation job that periodically recomputes them from the ledger (and alerts
  on drift) would catch any bug in the incremental update path.
- No idempotency key on `POST /deposits` itself — a client retry of the deposit-creation request
  (as opposed to the PSP callback) would create two funding transactions. Worth adding a
  client-supplied idempotency key if that's a real risk in production.
- PSP callback signature verification is entirely absent here since there's one mock PSP with no
  signing scheme — see `DESIGN-PSP.md` for where that would live for real providers.
- More tests: expired/very-late callback handling policy, and a stress test with more than two
  concurrent duplicate deliveries.

## AI tool disclosure

Used Claude Code for: reading the starter codebase and readme, designing the schema/locking
approach, generating the migrations/models/services/routes/tests, and drafting these three
markdown files.

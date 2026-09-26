# Architecture

Reference doc for how the deposit → wager → withdrawal flow is put together. Not a required
deliverable for the take-home (see `readme.md`'s deliverables list) — added alongside
`DECISIONS.md`/`DESIGN-PSP.md` as a map of what actually shipped.

## Data model

```mermaid
erDiagram
    MEMBERS ||--|| WALLETS : owns
    MEMBERS ||--o{ FUNDING_TRANSACTIONS : requests
    WALLETS ||--o{ WALLET_TXS : ledger
    FUNDING_TRANSACTIONS |o--o{ WALLET_TXS : settles

    MEMBERS {
        uuid id PK
        string username
    }
    WALLETS {
        uuid id PK
        uuid member_id FK
        decimal balance
        decimal required_turnover
        decimal accrued_turnover
    }
    FUNDING_TRANSACTIONS {
        uuid id PK
        uuid member_id FK
        string type
        string status
        decimal requested_amount
        decimal confirmed_amount
        int turnover_multiplier
        string psp_ref
    }
    WALLET_TXS {
        uuid id PK
        uuid wallet_id FK
        uuid funding_transaction_id FK
        string type
        decimal amount
        decimal balance_after
    }
```

- **`wallets`**: `balance`, plus two denormalized counters, `required_turnover` and
  `accrued_turnover`, updated in lockstep with the balance changes that move them.
- **`funding_transactions`**: one row per deposit or withdrawal request. `type`
  (`deposit`/`withdrawal`), `status` (`pending`/`completed`/`failed`), `requested_amount`,
  `confirmed_amount` (deposits only, filled by the PSP callback), `turnover_multiplier`, `psp_ref`
  (unique, deposits only).
- **`wallet_txs`**: one append-only row per balance movement. `type` (`deposit`/`withdrawal`/
  `wager`), signed `amount` (+credit/−debit), `balance_after` snapshot, optional
  `funding_transaction_id` (null for wagers, which have no funding transaction). A wallet's
  `balance` is always re-derivable as `SUM(amount)` over its `wallet_txs` rows.

## Funding transaction state machine

```mermaid
stateDiagram-v2
    [*] --> Pending: POST /deposits
    Pending --> Completed: POST /psp/callbacks<br/>status=completed
    Pending --> Failed: POST /psp/callbacks<br/>status=failed
    Completed --> [*]
    Failed --> [*]

    note right of Completed
        wallet credited,
        required_turnover bumped
    end note

    note right of Failed
        no wallet change
    end note
```

Both `Completed` and `Failed` are terminal. A callback that repeats the transition already applied
is a no-op (`200`, idempotent); a callback that contradicts the terminal state is rejected (`409`,
row untouched). Withdrawals use the same table with `type='withdrawal'`, created directly in
`Pending` (no PSP callback path here — see `readme.md`'s "assume a human approves it later").

## Locking strategy

Every code path that mutates a wallet's balance or a funding transaction's status does so inside
one `sequelize.transaction`, having first taken `SELECT ... FOR UPDATE` on the row it's about to
change:

| Endpoint                   | Row locked                          | Why                                                                                                                          |
| -------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /psp/callbacks`      | `funding_transactions` by `psp_ref` | Concurrent deliveries of the same callback serialize on this lock; the loser re-reads the already-applied status and no-ops. |
| `POST /wallets/:id/wagers` | `wallets` by id                     | Concurrent wagers on the same wallet serialize; the loser re-reads the post-debit balance before its own check.              |
| `POST /withdrawals`        | `wallets` by member                 | Same reasoning — turnover/balance check and the debit happen against a locked, consistent snapshot.                          |

Optimistic locking (version column + retry) was considered and rejected — see `DECISIONS.md` for
why pessimistic row locks fit this workload better.

## Request flow: deposit → wager → withdrawal

```mermaid
sequenceDiagram
    participant C as Client
    participant API
    participant FT as funding_transactions
    participant W as wallets
    participant L as wallet_txs

    C->>API: POST /deposits
    API->>FT: INSERT (Pending, pspRef)
    API-->>C: 201 { pspRef }

    C->>API: POST /psp/callbacks (pspRef, completed)
    API->>FT: SELECT ... FOR UPDATE WHERE psp_ref
    API->>FT: UPDATE status = Completed
    API->>W: SELECT ... FOR UPDATE
    API->>W: credit balance, bump required_turnover
    API->>L: INSERT (type=deposit)
    API-->>C: 200 { outcome: completed }

    C->>API: POST /wallets/:id/wagers
    API->>W: SELECT ... FOR UPDATE
    API->>W: check balance, debit, bump accrued_turnover
    API->>L: INSERT (type=wager)
    API-->>C: 201

    C->>API: POST /withdrawals
    API->>W: SELECT ... FOR UPDATE
    API->>W: check turnover & balance, debit
    API->>FT: INSERT (Pending, type=withdrawal)
    API->>L: INSERT (type=withdrawal)
    API-->>C: 201
```

Each of the four requests above runs inside a single DB transaction — either everything in that
step commits, or none of it does.

## Where to look

- `src/services/walletService.ts` — the shared locking + ledger-writing primitives
  (`lockWallet`, `creditWallet`, `debitWallet`) that every money-moving path builds on.
- `src/services/fundingTransactionService.ts` — the state machine and the deposit/withdrawal
  flows.
- `src/lib/money.ts` — BigNumber conventions; all arithmetic in the services above goes through
  `dec()`.
- `test/deposits.test.ts`, `test/wagers.test.ts`, `test/withdrawals.test.ts` — including the
  concurrent-duplicate-callback and concurrent-overdraw tests that exercise the locking above
  against a real Postgres instance (`Promise.all` of two live HTTP requests, not mocked).

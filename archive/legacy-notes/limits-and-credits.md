# Credits & Limits System

Universal guide for building a credit-based usage and billing system in any project.

---

## 1. Core Principles

1. **Single balance, single source of truth.** A user's balance is always `SUM(amount)` over their credit transactions. Never store a separate `balance` column — derive it.
2. **Ledger-style accounting.** Every change to balance is a signed row: positive = top-up, negative = spend. This gives you a full audit trail for free.
3. **Decimal precision.** Use `NUMERIC(18, 6)` (or equivalent). Floating-point rounding errors are unacceptable when dealing with money-adjacent values.
4. **Idempotent payments.** Store a unique `transaction_id` per external payment event. Check it before crediting to prevent double-processing of webhooks.
5. **Check before execute.** Always verify the user has enough credits *before* starting an expensive operation. Never rely on post-hoc billing.

---

## 2. Database Schema

### 2.1 `credits` table (transaction ledger)

```sql
CREATE TABLE credits (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount        NUMERIC(18, 6) NOT NULL,   -- positive = income, negative = spend
    type          VARCHAR(50) NOT NULL,       -- REGULAR | BONUS | PURCHASED | JOB
    description   VARCHAR(255) NOT NULL,      -- human-readable reason
    job_id        VARCHAR(255),               -- links spend to a specific job/task
    transaction_id VARCHAR(255),              -- external payment ID (deduplication)
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credits_user_id        ON credits(user_id);
CREATE INDEX idx_credits_type           ON credits(type);
CREATE INDEX idx_credits_job_id         ON credits(job_id);
CREATE INDEX idx_credits_transaction_id ON credits(transaction_id);
```

### 2.2 Credit types (enum)

| Type        | Direction | Meaning                              |
|-------------|-----------|--------------------------------------|
| `REGULAR`   | +         | Initial signup bonus                 |
| `BONUS`     | +         | Promotional / referral credits       |
| `PURCHASED` | +         | Paid via payment provider            |
| `JOB`       | −         | Spent on an operation                |

Extend as needed (e.g., `REFUND`, `SUBSCRIPTION`, `AFFILIATE`).

### 2.3 Jobs / tasks table extensions

Add these columns to your jobs/tasks table to support the payment flow:

```sql
required_credits  NUMERIC(18, 6),  -- estimated cost (for pre-check)
---

## 3. Backend Architecture

### 3.1 Balance query

```sql
SELECT COALESCE(SUM(amount), 0) AS total_credits
FROM credits
WHERE user_id = :user_id;
```

Always compute balance as an aggregate — never cache it in a mutable column.

### 3.2 Credit operations

| Function                    | Purpose                                     |
|-----------------------------|---------------------------------------------|
| `create_credit()`          | Insert a signed transaction row              |
| `get_user_total_credits()` | Return current balance (SUM)                 |
| `get_user_credits()`       | Paginated transaction history                |
| `get_user_credits_by_type()`| Filter history by type                      |

### 3.3 Pre-execution balance check

Before starting any paid operation:

```python
balance = await get_user_total_credits(user_id)
if balance < required_credits:
    # Option A: reject with 402 PAYMENT_REQUIRED
```

### 3.4 Payment webhook flow

```
1. User initiates payment → payment provider returns payment URL
2. User pays → provider sends webhook
3. Backend receives webhook:
   a. Validate signature / fetch payment status from provider API
   b. Check transaction_id doesn't already exist in credits table
   c. Insert credit row (type=PURCHASED, amount=offer_credits)
```

### 3.6 Initial credits on signup

Grant a small bonus (e.g., 0.5 credits, type=REGULAR) on first account creation so users can try the product immediately. Check that no credits exist yet to prevent double-granting.

---

## 4. API Endpoints

| Method | Path                              | Purpose                            |
|--------|-----------------------------------|------------------------------------|
| GET    | `/auth/me`                        | Returns user profile + `available_credits` |
| GET    | `/transactions`                   | Paginated credit history           |
| POST   | `/payments/generate-link`         | Create payment session, return URL |
| POST   | `/payments/webhook`               | Receive payment confirmation       |
| POST   | `/jobs/{id}/cost-estimate`        | Calculate and return itemized cost |

### Design notes

- Always include `available_credits` in the auth/me response so the frontend can display it globally (header, sidebar).
- Support multiple payment providers behind a unified interface (e.g., one for local currency, one for international).

---

## 5. Frontend Pages

Every project with a credits system should have these pages:

### 5.1 Pricing page (`/pricing`)

- List all billable operations with their credit cost.
- Group by category (images, video, audio, text, etc.).
- Show cost per unit (per-second, per-megapixel, fixed).
- If costs vary by model or quality tier, use tables.
- Update this page whenever pricing constants change.

### 5.2 Top-up / Purchase page (`/top-up`)

- Display available credit packages (e.g., 5 / 30 / 160 credits).
- Show price in user's currency.
- "Buy" button generates a payment link and redirects.
- Optionally accept a `resume_job_id` param to auto-continue a paused job after payment.

### 5.3 Transaction history page (`/transactions`)

- Paginated table of all credit movements.
- Columns: Date, Type, Description, Amount, Related Job/Task link.
- Color-code by type:
  - `PURCHASED` → green (income)
  - `JOB` → orange/red (expense)
  - `BONUS` → purple (promo)
  - `REGULAR` → gray (system)
- Show running context (job name, pipeline) so users understand each charge.

### 5.4 Balance display (global)

- Show current credit balance in the app header or sidebar — always visible.
- Link to top-up page.
- Optionally show a low-balance warning when credits drop below a threshold.

### 5.5 Insufficient funds state (inline)

- When a user triggers an action they can't afford, show:
  - How many credits are needed vs. available.
  - A direct link to the top-up page.

---

## 6. Security & Edge Cases

1. **Webhook validation.** Always verify payment webhooks via signature or by re-fetching payment status from the provider API. Never trust raw webhook data.
2. **Idempotency.** Use `transaction_id` with a unique constraint or pre-check to prevent crediting the same payment twice.
3. **Race conditions.** Use database-level locking or serializable transactions when deducting credits to prevent negative balances under concurrent requests.
4. **Refunds.** Insert a positive `REFUND` credit row — never delete the original `JOB` row. The ledger is append-only.

---

## 7. Checklist for New Projects

- [ ] Create `credits` table with proper indexes
- [ ] Define `CreditType` enum
- [ ] Implement balance query as `SUM(amount)`
- [ ] Define all operation costs as named constants
- [ ] Add pre-execution balance check
- [ ] Integrate at least one payment provider with webhook
- [ ] Implement `transaction_id` deduplication
- [ ] Add `WAITING_PAYMENT` job state + auto-resume
- [ ] Grant initial credits on signup
- [ ] Build pricing page
- [ ] Build top-up page
- [ ] Build transaction history page
- [ ] Show balance in global UI (header/sidebar)
- [ ] Handle insufficient-funds UX gracefully

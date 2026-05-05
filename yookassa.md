# YooKassa Integration Guide

Universal guide for integrating payments via YooKassa (Russian payment provider). Apply to any project.

## Environment Variables

Always need three:
```
YOOKASSA_SHOP_ID        # Shop ID from YooKassa merchant dashboard
YOOKASSA_SECRET_KEY     # Secret key for API auth (Basic Auth password)
YOOKASSA_RETURN_URL     # URL to redirect user after payment (optional, falls back to BASE_URL)
```

## Creating a Payment

**Endpoint:** `POST https://api.yookassa.ru/v3/payments`

**Headers:**
```
Content-Type: application/json
Authorization: Basic {base64(SHOP_ID:SECRET_KEY)}
Idempotence-Key: unique-key-per-request
```

**Payload:**
```json
{
  "amount": {
    "value": "1500.00",
    "currency": "RUB"
  },
  "confirmation": {
    "type": "redirect",
    "return_url": "https://mysite.com/success"
  },
  "capture": true,
  "description": "Order description",
  "metadata": {
    "order_id": "123"
  }
}
```

**Key points:**
- `amount.value` — string with two decimal places (e.g. `"1500.00"`)
- `amount.currency` — typically `"RUB"`
- `capture: true` — auto-capture payment immediately (no two-stage flow)
- `Idempotence-Key` header — required, prevents duplicate payments on retries. Use a deterministic key like `booking-{id}`
- `metadata` — put any custom data here (order_id, user_id, etc.), used to find the booking on webhook
- `confirmation.type: "redirect"` — user gets redirected to YooKassa payment page

**Response:**
- `id` — payment ID (save as reference, used for webhook lookup and verification)
- `confirmation.confirmation_url` — URL to redirect the user to the payment page

## Webhook

### Endpoint
`POST /api/webhooks/yookassa`

YooKassa does **not** sign webhooks with HMAC. Instead, verify payment status by calling the API directly (see Verification below).

### Payload Structure
```
event            — event type (string)
object.id        — payment ID
object.status    — payment status
```

### Events to Handle

| Event | Status | Action |
|---|---|---|
| `payment.succeeded` | `succeeded` | Verify via API, confirm payment, execute business logic |
| `payment.canceled` | `canceled` | Cancel the order/service |
| `payment.waiting_for_capture` | — | Only relevant if `capture: false` (two-stage payments) |

### Verification (Critical)

YooKassa webhooks are **not cryptographically signed**. Anyone can send a fake webhook. Always verify payment status by calling the API before processing:

**Endpoint:** `GET https://api.yookassa.ru/v3/payments/{payment_id}`

**Headers:**
```
Authorization: Basic {base64(SHOP_ID:SECRET_KEY)}
```

**Response:** check that `status` equals `"succeeded"` before marking as paid.

```python
def verify_yookassa_payment(settings, payment_id: str) -> str:
    # GET https://api.yookassa.ru/v3/payments/{payment_id}
    # Returns the actual status from YooKassa
    ...
```

Only proceed with business logic if the verified status matches.

### Webhook Processing Rules
- **Always verify via API**: never trust webhook payload alone — call `GET /v3/payments/{id}` to confirm status
- **Idempotency**: if the order is already paid — skip, don't duplicate actions
- **Lookup by payment_id**: find the booking/order by the saved YooKassa payment ID, not by metadata
- **Always return 200**: even if the event is not processed, otherwise YooKassa will retry

## Frontend

After creating a payment, the backend returns `confirmation_url`. The frontend does `window.location.href = confirmation_url` to redirect the user to the YooKassa payment page.

## Full Flow

```
1. User clicks "Pay"
2. Backend creates an order record with pending_payment status
3. Backend calls YooKassa API with Idempotence-Key → receives payment ID + confirmation URL
4. Backend saves payment ID (for webhook lookup), returns URL to frontend
5. Frontend redirects the user to YooKassa
6. User completes payment
7. YooKassa sends payment.succeeded webhook
8. Backend receives webhook, calls GET /v3/payments/{id} to verify status
9. If verified as "succeeded" — confirms payment, executes business logic
```

## Setup Checklist

- [ ] Create a shop in YooKassa merchant dashboard
- [ ] Get Shop ID and Secret Key
- [ ] Configure webhook URL in dashboard, select events: `payment.succeeded`, `payment.canceled`
- [ ] Set all environment variables
- [ ] Implement payment creation function with Idempotence-Key
- [ ] Implement webhook endpoint with API-based verification (not just trusting the webhook)
- [ ] Test in test mode (test shop credentials from dashboard)

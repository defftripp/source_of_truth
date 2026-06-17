# LemonSqueezy Integration Guide

Universal guide for integrating payments via LemonSqueezy. Apply to any project.

## Environment Variables

Always need four:
```
LEMONSQUEEZY_API_KEY         # Bearer token from Settings > API Keys
LEMONSQUEEZY_STORE_ID        # Store ID from Settings > Stores
LEMONSQUEEZY_VARIANT_ID      # Product variant ID (single variant, dynamic pricing via custom_price)
LEMONSQUEEZY_WEBHOOK_SECRET  # Signing secret for webhook signature verification (Settings > Webhooks)
```

## Creating a Checkout

**Endpoint:** `POST https://api.lemonsqueezy.com/v1/checkouts`

**Headers:**
```
Content-Type: application/vnd.api+json
Accept: application/vnd.api+json
Authorization: Bearer {LEMONSQUEEZY_API_KEY}
```

**Payload:**
```json
{
  "data": {
    "type": "checkouts",
    "attributes": {
      "custom_price": 1500,
      "expires_at": "2026-01-01T12:00:00.000000Z",
      "product_options": {
        "name": "Product/service name",
        "description": "Description",
        "redirect_url": "https://mysite.com/success",
        "receipt_link_url": "https://mysite.com/order/123",
        "receipt_button_text": "Back to site",
        "receipt_thank_you_note": "Thank you!"
      },
      "checkout_data": {
        "email": "user@example.com",
        "custom": {
          "order_id": "123"
        }
      }
    },
    "relationships": {
      "store": {
        "data": { "type": "stores", "id": "STORE_ID" }
      },
      "variant": {
        "data": { "type": "variants", "id": "VARIANT_ID" }
      }
    }
  }
}
```

**Key points:**
- `custom_price` — price in cents (1500 = $15.00). Allows setting an arbitrary amount on the same product variant
- `expires_at` — ISO 8601, UTC. Set 2-3 hours ahead so stale links don't linger
- `checkout_data.custom` — put any custom data here (order_id, user_id, etc.), it will come back in the webhook under `meta.custom_data`
- `product_options` — override product name/description for a specific checkout

**Response:**
- `data.id` — checkout ID (save for reference)
- `data.attributes.url` — URL to redirect the user to the payment page

## Webhook

### Signature Verification

LemonSqueezy sends the signature in the `X-Signature` header. Verification:

```python
import hmac
import hashlib

def verify_lemonsqueezy_webhook(secret: str, signature: str, body: bytes) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Always verify the signature before processing. If it doesn't match — return 400.

### Payload Structure

```
meta.event_name         — event type (string)
meta.custom_data        — data from checkout_data.custom (dict)
data.id                 — order ID
data.attributes.status  — order status
```

### Events to Handle

| Event | Condition | Action |
|---|---|---|
| `order_created` | `status == "paid"` | Confirm payment, execute business logic |
| `order_refunded` | — | Cancel the order/service |

### Webhook Processing Rules
- **Idempotency**: if the order is already paid — skip, don't duplicate actions
- **Expired orders**: if payment arrives for an already canceled/expired order — log a warning, don't process
- **Invalid data**: if `order_id` is missing from `custom_data` — return 200, don't crash
- **Always return 200**: even if the event is not processed, otherwise LemonSqueezy will retry

## Frontend

After creating a checkout, the backend returns `confirmation_url`. The frontend does `window.location.href = confirmation_url` to redirect the user to the LemonSqueezy payment page.

## Full Flow

```
1. User clicks "Pay"
2. Backend creates an order record with pending_payment status
3. Backend calls LemonSqueezy API → receives checkout URL
4. Backend saves checkout ID, returns URL to frontend
5. Frontend redirects the user to LemonSqueezy
6. User completes payment
7. LemonSqueezy sends order_created webhook (status=paid)
8. Backend verifies signature, confirms payment, executes business logic
```

## Setup Checklist

- [ ] Create a product and variant in the LemonSqueezy Dashboard
- [ ] Configure webhook URL in Dashboard (Settings > Webhooks), select events: `order_created`, `order_refunded`
- [ ] Copy the webhook signing secret
- [ ] Set all 4 environment variables
- [ ] Implement the checkout creation function
- [ ] Implement the webhook endpoint with signature verification
- [ ] Test in test mode (Test Mode in Dashboard)

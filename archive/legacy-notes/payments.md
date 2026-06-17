# Payments Integration Rule

## Payment Providers

Every project must support two payment providers:
- **YooKassa** — for RUB payments (see @rules/yookassa.md)
- **LemonSqueezy** — for USD payments (see @rules/lemonsqueezy.md)

## Currency and Provider Mapping

The user selects a **currency**, not a provider. The backend picks the provider automatically:

| Currency | Provider |
|---|---|
| RUB | YooKassa |
| USD | LemonSqueezy |

## Default Currency per Locale

Each locale (@rules/translate.md) has a default currency pre-selected in the UI:

| Locale | Default currency |
|---|---|
| `ru` | RUB |
| `en` | USD |
| `es` | USD |
| `pt` | USD |

## Currency Selector

On every locale the user can switch between RUB and USD regardless of the default. The selector is a simple toggle/dropdown in the payment step — it only shows the currency, not the provider name.

## Frontend Behavior

1. On page load, pre-select the default currency based on the current locale.
2. Show a currency selector (RUB / USD) so the user can override the default.
3. Send the chosen currency to the backend. Do not send provider name — the backend decides.
4. On response, redirect to `confirmation_url` regardless of provider.

## Backend Behavior

1. Receive the chosen currency from the frontend.
2. Pick the provider based on currency:
   - `RUB` → create payment via YooKassa
   - `USD` → create checkout via LemonSqueezy
3. Return a unified response shape with `confirmation_url` and `payment_provider` (for frontend logging/analytics only).
4. Handle webhooks on separate endpoints per provider.

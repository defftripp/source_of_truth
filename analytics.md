# Analytics Integration Guide (Plausible + Google Tag Manager + Yandex.Metrika)

A practical guide on how this Next.js (App Router) project integrates three analytics platforms in parallel, with cookie consent gating. Use it as a blueprint for any similar project.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Cookie Consent Layer](#1-cookie-consent-layer)
3. [Plausible Analytics](#2-plausible-analytics)
4. [Google Tag Manager](#3-google-tag-manager-gtm)
5. [Yandex.Metrika](#4-yandex-metrika)
6. [Unified Analytics Class](#5-unified-analytics-class)
7. [React Hook](#6-react-hook--useanalytics)
8. [Layout Wiring](#7-layout-wiring)
9. [Adding a New Event](#8-adding-a-new-event)
10. [Checklist for a New Project](#9-checklist-for-a-new-project)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Root Layout                     │
│                                                  │
│  PlausibleProvider (wraps everything)             │
│  ├── GoogleTagManager  (client-only, consent)     │
│  ├── YandexMetrika     (client-only, consent)     │
│  ├── CookieConsent     (client-only)              │
│  └── {children}                                   │
└─────────────────────────────────────────────────┘

Components call  useAnalytics() → analytics.someEvent()
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
               Plausible       dataLayer         ym(reachGoal)
              (via hook)        (GTM)          (Yandex.Metrika)
```

Key design decisions:
- **Plausible** is privacy-friendly and loads unconditionally (no cookies by default). It is wrapped at the provider level.
- **GTM and Yandex.Metrika** set cookies, so they only render **after the user accepts cookies**.
- A single `Analytics` class fans out every event to all three services, with per-service error isolation.

---

## 1. Cookie Consent Layer

**File:** `src/components/CookieConsent.tsx`

### How it works

- Stores consent in `localStorage` under key `fanfy-cookie-consent`.
- Possible values: `'accepted'` | `'rejected'` | `null` (not yet decided).
- Exposes two helper functions that other components import:

```ts
// Read current consent (SSR-safe — returns null on server)
export function getConsentStatus(): 'accepted' | 'rejected' | null;

// Subscribe to changes (returns unsubscribe fn)
export function onConsentChange(
  callback: (status: 'accepted' | 'rejected' | null) => void
): () => void;
```

- Uses both `storage` events (cross-tab) and a custom `CustomEvent` (same-tab) to notify listeners immediately.

### How to replicate

1. Create a banner component that calls `localStorage.setItem(KEY, 'accepted' | 'rejected')`.
2. After writing to localStorage, dispatch a `CustomEvent` so same-tab listeners react immediately (the native `storage` event only fires in *other* tabs).
3. Export `getConsentStatus()` and `onConsentChange()` so analytics components can gate themselves.

---

## 2. Plausible Analytics

**Package:** [`next-plausible`](https://github.com/4lejandrito/next-plausible) (`^3.12.4`)

### Setup

Wrap your app in `PlausibleProvider` in the root layout:

```tsx
import PlausibleProvider from 'next-plausible';

<PlausibleProvider
  domain="yourdomain.com"
  customDomain="https://your-plausible-host.com"   // optional, for self-hosted
  trackOutboundLinks                                // track clicks to external sites
  taggedEvents                                      // enable custom event CSS classes
>
  {children}
</PlausibleProvider>
```

### Tracking custom events

Use the `usePlausible()` hook from `next-plausible`:

```ts
const plausible = usePlausible();
plausible('event_name', { props: { key: 'value' } });
```

In this project the hook is consumed inside the unified `Analytics` class (see below).

### Self-hosted Plausible

If you self-host Plausible (e.g., via Docker), set `customDomain` to your instance URL. The `next-plausible` package will rewrite the script src automatically:
- Cloud: `https://plausible.io/js/script.js`
- Self-hosted: `https://your-host.com/js/script.js`

---

## 3. Google Tag Manager (GTM)

**File:** `src/components/GoogleTagManager.tsx`

### Setup

Create a client component that injects the GTM snippet **only after consent**:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';
import { getConsentStatus, onConsentChange } from './CookieConsent';

export default function GoogleTagManager() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (getConsentStatus() === 'accepted') setConsented(true);
    const unsub = onConsentChange((s) => setConsented(s === 'accepted'));
    return unsub;
  }, []);

  if (!consented) return null;

  return (
    <>
      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-XXXXXXX');
          `,
        }}
      />
      <noscript>
        <iframe
          src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  );
}
```

Replace `GTM-XXXXXXX` with your container ID.

### Tracking events via dataLayer

```ts
window.dataLayer?.push({ event: 'event_name', key: 'value' });
```

---

## 4. Yandex.Metrika

**File:** `src/components/YandexMetrika.tsx`

### Setup

Same pattern as GTM — client component, consent-gated:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';
import { getConsentStatus, onConsentChange } from './CookieConsent';

export default function YandexMetrika() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (getConsentStatus() === 'accepted') setConsented(true);
    const unsub = onConsentChange((s) => setConsented(s === 'accepted'));
    return unsub;
  }, []);

  if (!consented) return null;

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

            ym(YOUR_COUNTER_ID, "init", {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true
            });
          `,
        }}
      />
      <noscript>
        <div>
          <img
            src="https://mc.yandex.ru/watch/YOUR_COUNTER_ID"
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
```

Replace `YOUR_COUNTER_ID` with the numeric ID from Yandex.Metrika.

### Tracking goals

```ts
window.ym?.(YOUR_COUNTER_ID, 'reachGoal', 'event_name', { key: 'value' });
```

---

## 5. Unified Analytics Class

**File:** `src/lib/analytics.ts`

The core idea: a single class that dispatches every event to **all three services**, with independent try/catch per service so one failure never breaks the others.

```ts
'use client';

declare global {
  interface Window {
    ym?: (id: number, action: string, ...params: any[]) => void;
    dataLayer?: any[];
  }
}

type EventProps = Record<string, string | number | boolean>;

class Analytics {
  private plausible: ((eventName: string, options?: { props?: EventProps }) => void) | null = null;

  setPlausible(fn: (eventName: string, options?: { props?: EventProps }) => void) {
    this.plausible = fn;
  }

  track(eventName: string, props?: EventProps) {
    try {
      // 1. Plausible
      if (this.plausible) {
        try { this.plausible(eventName, props ? { props } : undefined); }
        catch (e) { console.error('Plausible error:', e); }
      }

      // 2. Yandex.Metrika
      if (typeof window !== 'undefined' && window.ym) {
        try { window.ym(YOUR_COUNTER_ID, 'reachGoal', eventName, props); }
        catch (e) { console.error('Yandex error:', e); }
      }

      // 3. GTM / Google Analytics
      if (typeof window !== 'undefined' && window.dataLayer) {
        try { window.dataLayer.push({ event: eventName, ...props }); }
        catch (e) { console.error('GTM error:', e); }
      }
    } catch (e) {
      console.error('Analytics error:', e);
    }
  }

  // Define typed convenience methods for each event:
  paywallShown()            { this.track('paywall_shown'); }
  purchaseClick(plan: string) { this.track('purchase_click', { plan }); }
  // ... add more as needed
}

export const analytics = new Analytics();
```

### Why a class singleton?

- One import, one call site — no need to remember three different APIs.
- Plausible requires a React hook (`usePlausible`), but the class can hold a reference set once via `setPlausible()`, making it usable outside React components too.
- Adding or removing a service means editing one file.

---

## 6. React Hook — `useAnalytics()`

**File:** `src/lib/hooks/useAnalytics.ts`

Bridges the React world (Plausible hook) with the singleton class:

```ts
'use client';

import { useEffect } from 'react';
import { usePlausible } from 'next-plausible';
import { analytics } from '../analytics';

export function useAnalytics() {
  const plausible = usePlausible();

  useEffect(() => {
    analytics.setPlausible(plausible);
  }, [plausible]);

  return analytics;
}
```

### Usage in a component

```tsx
function MyComponent() {
  const analytics = useAnalytics();

  const handleClick = () => {
    analytics.purchaseClick('premium_monthly');
  };

  return <button onClick={handleClick}>Buy</button>;
}
```

---

## 7. Layout Wiring

**File:** `src/app/[locale]/layout.tsx`

All analytics components are loaded client-side only via `next/dynamic`:

```tsx
import PlausibleProvider from 'next-plausible';
import dynamic from 'next/dynamic';

const YandexMetrika    = dynamic(() => import('@/components/YandexMetrika'),    { ssr: false });
const GoogleTagManager = dynamic(() => import('@/components/GoogleTagManager'), { ssr: false });
const CookieConsent    = dynamic(() => import('@/components/CookieConsent'),    { ssr: false });

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <PlausibleProvider domain="yourdomain.com" trackOutboundLinks taggedEvents>
          <GoogleTagManager />
          {/* ...providers, header, children... */}
          <YandexMetrika />
          <CookieConsent />
        </PlausibleProvider>
      </body>
    </html>
  );
}
```

**Why `dynamic` with `ssr: false`?**
- These components access `window`, `localStorage`, `document` — all browser-only APIs.
- Prevents hydration mismatches and SSR errors.

---

## 8. Adding a New Event

1. **Define** a method in the `Analytics` class (`src/lib/analytics.ts`):
   ```ts
   signupCompleted(method: string) {
     this.track('signup_completed', { method });
   }
   ```

2. **Call** it from any component:
   ```tsx
   const analytics = useAnalytics();
   analytics.signupCompleted('google');
   ```

3. **Configure** in each platform's dashboard:
   - **Plausible:** Custom events appear automatically under Goals (add the goal name in site settings).
   - **GTM:** Create a Custom Event trigger matching the event name, then fire a GA4 tag.
   - **Yandex.Metrika:** Add a goal of type "JavaScript event" with the same event name.

That's it — no additional code changes needed per platform.

---

## 9. Checklist for a New Project

### Install dependencies

```bash
npm install next-plausible
```

(GTM and Yandex.Metrika require no npm packages — they are loaded via script injection.)

### Create files

| File | Purpose |
|------|---------|
| `src/components/CookieConsent.tsx` | Consent banner + localStorage helpers |
| `src/components/GoogleTagManager.tsx` | GTM script, consent-gated |
| `src/components/YandexMetrika.tsx` | Yandex script, consent-gated |
| `src/lib/analytics.ts` | Unified `Analytics` class |
| `src/lib/hooks/useAnalytics.ts` | React hook bridging Plausible ↔ Analytics |

### Wire up layout

1. Wrap app in `<PlausibleProvider>`.
2. Add `<GoogleTagManager />`, `<YandexMetrika />`, `<CookieConsent />` with `dynamic(..., { ssr: false })`.

### Add IDs

- Plausible: set `domain` prop (and `customDomain` if self-hosted).
- GTM: replace container ID in the snippet.
- Yandex: replace counter ID in the snippet and in `analytics.ts`.

### TypeScript globals

Extend `Window` interface so `window.ym` and `window.dataLayer` don't cause type errors:

```ts
declare global {
  interface Window {
    ym?: (id: number, action: string, ...params: any[]) => void;
    dataLayer?: any[];
  }
}
```

### Test

1. Open the site, **reject** cookies → verify GTM and Yandex scripts are **not** in the DOM.
2. Accept cookies → verify both scripts load.
3. Trigger a custom event → check all three dashboards.
4. Open DevTools Network tab → confirm script URLs:
   - `https://your-plausible-host/js/script.js`
   - `https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX`
   - `https://mc.yandex.ru/metrika/tag.js`

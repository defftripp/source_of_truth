# Interface Translation Guide (i18n)

Always build a multilingual interface using i18n

## 1. Goal

Build a multilingual interface where:
- language is selected deterministically (URL, user setting, or browser preference),
- all user-facing text comes from translation files,
- navigation, metadata, and SEO stay correct for each locale.

Mandatory baseline for all projects:
- every project must ship with these locales: `ru`, `en`, `es`, `pt`.

## 2. Recommended architecture

1. Keep locale configuration in one place:
- `locales` (supported language codes),
- `defaultLocale`,
- locale strategy (`always in URL`, `as-needed`, etc.),
- locale detection policy.
- required baseline locales in every project: `ru`, `en`, `es`, `pt`.

2. Use URL-based locales for web apps:
- Example: `/en/...`, `/es/...`.
- This is best for SEO, sharing, analytics segmentation, and reproducibility.

3. Separate translation resources from UI logic:
- Store messages in per-locale files (`ru.json`, `en.json`, `es.json`, `pt.json`, etc.).
- Group keys by namespaces (`common`, `auth`, `checkout`, `profile`, etc.).

4. Load translations close to render time:
- Server-side for server-rendered pages and metadata.
- Client-side hooks for interactive components.

## 3. Generic folder structure

```text
app/
  [locale]/
    layout.tsx
    page.tsx
    ...feature pages
  sitemap.ts
i18n/
  routing.ts
  request.ts
  middleware.ts
messages/
  ru.json
  en.json
  es.json
  pt.json
```

Use any equivalent structure in your stack, but keep responsibilities split:
- routing config,
- request/locale resolution,
- middleware,
- translation dictionaries,
- locale-aware pages/layout.

## 4. Implementation rules

### Text and keys
1. Never hardcode visible UI text in components.
2. Use stable key names and semantic namespaces.
3. Keep all locale files key-identical.
4. Use placeholders for dynamic values (`{count}`, `{name}`) instead of string concatenation.
5. Add pluralization/format rules through your i18n library, not manual `if` blocks where possible.

### Routing and navigation
1. Use locale-aware link/router helpers everywhere for internal navigation.
2. Keep locale when changing routes.
3. Validate locale from URL and fallback to `defaultLocale` when invalid.
4. Exclude API/static/internal assets from locale middleware.

### Components
1. Client components: use i18n hooks (`useTranslations` or equivalent).
2. Server components/pages: use server translation API (`getTranslations` or equivalent).
3. Keep locale-dependent logic explicit (for example currency, support links, date formatting).

## 5. SEO and metadata

1. Localize metadata (`title`, `description`, OpenGraph, Twitter cards, JSON-LD where needed).
2. Provide `hreflang` alternates for each locale and `x-default`.
3. Generate locale-specific sitemap entries.
4. Keep canonical and alternate URLs consistent with your locale strategy.

## 6. Quality and CI standards

1. Add a CI check that compares translation key trees across all locale files.
2. Add lint/static checks for forbidden hardcoded strings in UI layers.
3. Fail build when required translation keys are missing.
4. Keep a PR checklist item: "new UI text added to all locales".
5. Track untranslated strings explicitly (for example marker values) and block release if present.

## 7. Libraries to use

### Next.js App Router
- `next-intl` is a strong default for routing + server/client translation APIs.

### React apps (non-Next specific)
- `i18next` + `react-i18next`
- `FormatJS` (`react-intl`)
- `LinguiJS`

Pick one stack and standardize it project-wide.

## 8. Rollout checklist for a new project

1. Define locales and fallback rules.
   Minimum required locales: `ru`, `en`, `es`, `pt`.
2. Set up locale-aware routing.
3. Add translation provider and request-level locale loading.
4. Migrate all visible strings to translation keys.
5. Localize metadata and sitemap.
6. Add CI checks for translation completeness.
7. Test all locales for navigation, SEO tags, and runtime behavior.

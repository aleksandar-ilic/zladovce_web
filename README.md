# Zladovce – frontend

Angular workspace with the public storefront, the admin application and the shared libraries
(ARCHITECTURE.md, section A5).

## Prerequisites

- Node.js 22.12 or newer (developed with 24.15) and npm 11
- For the admin app against a real API: the backend running on `http://localhost:5080`
  (see `backend/README.md` in the [zladovce_api](https://github.com/aleksandar-ilic/zladovce_api) repository)

```bash
npm ci
```

## Commands

| Command | What it does |
|---|---|
| `npm run start:storefront` | Storefront dev server on http://localhost:4200 |
| `npm run start:admin` | Admin dev server on http://localhost:4201 |
| `npm run build` | Production build of both apps into `dist/` |
| `npm run build:storefront` | Storefront only: static, prerendered output in `dist/storefront/browser`, then `sitemap.xml` and `robots.txt` (`tools/generate-seo-files.mjs`) |
| `npm run build:admin` | Admin only: SPA in `dist/admin/browser` |
| `npm run lint` | ESLint (TypeScript, Angular templates, accessibility, import boundaries) |
| `npm run test:ci` | All unit tests, headless, single run (libs, storefront, admin) |
| `npm run generate:models` | Generates API types from the API repository's `backend/openapi/zladovce-v1.json` (clone `zladovce_api` next to this repo, or set `ZLADOVCE_OPENAPI`) |
| `npm run format` | Prettier |

Tests run with Vitest in jsdom through Angular's `unit-test` builder; no browser is needed.
A single project can be run with `npx ng test libs` (or `storefront`, `admin`), which watches
for changes in a terminal.

## Workspace layout

```
frontend/
├── angular.json              projects: storefront, admin, libs (test target only)
├── tsconfig.base.json        compiler options and the @zladovce/* path aliases
├── eslint.config.mjs         lint rules and import boundaries
├── .postcssrc.json           Tailwind CSS v4 (PostCSS plugin)
├── tools/                  generate-models.mjs, generate-seo-files.mjs + seo-files.mjs (sitemap/robots)
├── apps/
│   ├── storefront/           public shop – prerendered, Tailwind
│   │   ├── config/{development,production}/config.json   runtime configuration
│   │   └── src/app/
│   │       ├── core/         navigation, header, footer, cart toast, SEO service + JSON-LD,
│   │       │                 prerender routes, data clients, CartQuoteService
│   │       ├── shared/       product card/image, price, availability, quantity stepper, breadcrumbs
│   │       ├── features/     home, shop (shop + category), product, cart, not-found
│   │       ├── app.routes.ts
│   │       └── app.routes.server.ts   render mode per route
│   └── admin/                admin SPA – Angular Material + Tailwind utilities
│       ├── config/{development,production}/config.json
│       └── src/app/
│           ├── core/         navigation config, shell (side navigation, top bar)
│           ├── data/         API clients: categories, products, inventory, media upload
│           ├── shared/       confirm dialog, image upload, rich-text editor, server-error mapping,
│           │                 unsaved-changes guard, list query helpers
│           ├── features/     sign-in, dashboard, products, categories, inventory, not-found
│           └── app.routes.ts
└── libs/
    ├── models/      API contract types (generated/ from OpenAPI, re-exported as named aliases)
    ├── api/         runtime config, ApiClient, HealthClient, interceptors, ApiError
    ├── auth/        AuthService (Cognito / dev), interceptor, guards, role directive – admin only
    ├── ui/          design tokens (styles/), button, form field, card, badge, spinner, states
    ├── shared/      CartStore, role labels, form validators
    └── utilities/   RSD and date formatting, Serbian locale, slug helper
```

The libraries are plain source libraries: the apps compile them directly through the
`@zladovce/*` aliases. There is no separate library build and nothing is published.

### Rules

- Standalone components with `OnPush`, signals for local state, Reactive Forms, one lazy route
  per feature.
- Import a library only through its entry point: `import { UiButton } from '@zladovce/ui'`.
- Boundaries enforced by `npm run lint`:
  - `apps/storefront` must not import `@zladovce/auth` or Angular Material;
  - apps must not import each other;
  - libraries must not import apps, and only `libs/auth` and the admin app may use `@zladovce/auth`.
- All UI text is Serbian Latin (`lang="sr-Latn"`, locale `sr-Latn-RS`). No placeholder text, no
  invented contact details or product claims.
- Every data view shows the loading, empty and error states from `@zladovce/ui`.
- Navigation contains only links to pages that exist.

## Design tokens and styling

Tokens are defined once, in `libs/ui/src/styles/theme.css`, as a Tailwind v4 `@theme` block.
Tailwind turns each token into a CSS custom property and into utility classes
(`bg-olive-700`, `font-serif`, `rounded-lg`, `shadow-card`, `max-w-page`, `py-section` …).
The Angular Material theme of the admin app (`apps/admin/src/styles.scss`) maps the same custom
properties to Material's system tokens, so both apps follow one palette.

- Colours: `cream`, `olive`, `sage`, `earth`, `ink`, `danger`, `warning` (Tailwind's default
  palette is removed on purpose).
- Fonts: Cormorant Garamond (headings) and Source Sans 3 (body), self-hosted from
  `@fontsource/*` packages; no font CDN.
- Each app stylesheet imports `tailwindcss` and `libs/ui/src/styles/index.css`, and lists its
  own sources with `@source`.

## Runtime configuration

Each app loads `/config.json` before it bootstraps (`main.ts` → `loadAppConfig`), so one build
can be deployed to every environment. The file is public: it contains only addresses and
Cognito identifiers, never secrets.

| File | Used by |
|---|---|
| `apps/<app>/config/development/config.json` | `ng serve` and development builds |
| `apps/<app>/config/production/config.json` | production builds – a template with empty values |

The deployment pipeline overwrites `dist/<app>/browser/config.json` with the values of the
target environment. An empty or invalid file stops the app at start-up with a clear error
instead of running against a wrong API.

```jsonc
// storefront
{ "apiBaseUrl": "https://api.example.com/api/v1" }

// admin
{
  "apiBaseUrl": "https://api.example.com/api/v1",
  "auth": {
    "mode": "cognito",
    "cognito": { "region": "eu-central-1", "userPoolId": "…", "clientId": "…" }
  }
}
```

Optional `healthUrl` overrides the health endpoint (default: `/health` on the API origin).

The storefront is also rendered at build time, where no `/config.json` exists. The prerender
reads the API address from the environment variable `ZLADOVCE_API_BASE_URL`
(default `http://localhost:5080/api/v1`).

## Authentication (admin)

`AuthService` (`@zladovce/auth`) has two implementations. `createAuthService` chooses one from
`config.json` and from nothing else:

| `auth.mode` | Implementation | Behaviour |
|---|---|---|
| `cognito` | `CognitoAuthService` | E-mail + password with the Cognito SRP flow (`aws-amplify` v6 auth, loaded lazily). Handles the new-password step of invited administrators and the TOTP code. Tokens are kept by the library in `sessionStorage`; nothing is written to `localStorage`. Requests carry `Authorization: Bearer <access token>`; the library refreshes tokens. |
| `dev` | `DevAuthService` | Local development only. No password: requests carry `X-Dev-User-Email` and `X-Dev-User-Role` from `auth.dev`, which only a backend running in Development accepts. |

- Any other value of `auth.mode`, or a missing `auth` section, is a start-up error; there is no
  fallback to `dev`. The production template says `cognito`.
- `authInterceptor` attaches credentials only to URLs under `apiBaseUrl`.
- After sign-in the app calls `GET /admin/me`. The API decides who is an administrator and
  which role they have; a 401 or 403 ends the session.
- `authGuard` protects the shell, `guestGuard` the sign-in page, `roleGuard('Owner')` and
  `*authHasRole="'Owner'"` restrict routes and elements by role. They are convenience only –
  the API enforces permissions.

To try another dev identity, edit `apps/admin/config/development/config.json`
(`role`: `Owner` or `Staff`).

## Adding a page

### Storefront

1. Create the feature under `apps/storefront/src/app/features/<name>/`.
2. Add a lazy route in `app.routes.ts` (above the `**` route), with a `title` and, if needed,
   `data: { description, noindex }`.
3. Give it a render mode in `app.routes.server.ts`:
   `RenderMode.Prerender` for content pages, `RenderMode.Client` for cart, checkout,
   confirmation and tracking. Parameterised prerendered routes add `getPrerenderParams`.
4. If it belongs in the menu, add `{ label, path }` to `MAIN_NAV` (and `FOOTER_NAV`) in
   `core/navigation.ts`. A test fails if a menu entry points to a missing route.

### Admin

1. Create the feature under `apps/admin/src/app/features/<name>/`.
2. Add a lazy child route of the shell in `app.routes.ts` (above the `**` child). Owner-only
   pages add `canActivate: [roleGuard('Owner')]`.
3. Add `{ label, path, icon, roles? }` to `ADMIN_NAV` in `core/navigation.ts`.

## API types

`libs/models` holds a few hand-written types (`ProblemDetails`, `Paged<T>`, `AdminMe`, `AdminRole`)
and named aliases of the generated contract (`AdminProduct`, `AdminCategory`, `InventoryItem` …).
`npm run generate:models` writes `libs/models/src/generated/zladovce-v1.ts` from
the backend OpenAPI document and fails with a clear message when that document is missing.
It is run by hand after the contract changes and is not part of the build.

## Storefront (Phase 4)

| Page | Route | Rendering |
|---|---|---|
| Početna | `/` | Prerendered. Hero, featured categories and products (`featured=true`), family story, "Zašto naši proizvodi", "Kako poručiti", delivery facts from `GET /store` (only configured values). "Najprodavanije" is left out until real sales data exists (Phase 5). |
| Prodavnica | `/prodavnica` | Prerendered. Search, category, price range, "na stanju", sort and paging all live in the URL query (`q`, `minPrice`, `maxPrice`, `inStock=true`, `sort`, `page`); small screens get a filter drawer. |
| Kategorija | `/prodavnica/:categorySlug` | Prerendered for every slug of `GET /seo/routes`; same grid with the category header. |
| Proizvod | `/proizvod/:slug` | Prerendered for every slug; gallery, packages, price/discount, availability, quantity, "Dodaj u korpu", related products. |
| Korpa | `/korpa` | Client only, `noindex`. |

- **Fresh price and stock.** Prerendered pages show the build-time data first; after hydration the browser
  refreshes product pages through `GET /catalog/availability` and reloads lists without the transfer cache.
- **Cart.** `CartStore` (`@zladovce/shared`) keeps `{ variantId, quantity, knownUnitPrice?, label? }` in
  `localStorage` key `zladovce.cart.v2` (a Phase 2 `…cart.v1` cart is migrated once), 1–99 per line, at most 50 lines,
  synchronised between tabs. `CartQuoteService` prices it with `POST /cart/quote` (debounced, the newer request
  cancels the older, answers for a changed cart are discarded), overwrites the cart from the quote lines and turns
  adjustments into Serbian notices. The product page never lets a line exceed `maxOrderQuantity`.
- **Checkout** is Phase 5: "Nastavi na poručivanje" is shown disabled with the note "Poručivanje će uskoro biti dostupno."
- **SEO.** `SeoService` sets title, description, robots, canonical, Open Graph and JSON-LD (`Product` with one RSD
  offer per package, `BreadcrumbList`) per page.

### Build and deployment

```bash
ZLADOVCE_API_BASE_URL=https://api.example.com/api/v1 ZLADOVCE_SITE_URL=https://zladovce.com npm run build:storefront
```

| Variable | Used for | Default |
|---|---|---|
| `ZLADOVCE_API_BASE_URL` | Prerender: `GET /seo/routes` (which categories/products to render) and the page data; `lastmod` of the sitemap | `http://localhost:5080/api/v1` |
| `ZLADOVCE_SITE_URL` | Canonical, Open Graph and JSON-LD URLs in the prerendered HTML; `sitemap.xml` and `robots.txt` | `http://localhost:4200` |

- When the API cannot be reached (or has no products) the build logs a warning and still succeeds with the static
  pages only; the sitemap then lists only what was prerendered.
- The host serves `dist/storefront/browser` and must rewrite unknown paths (a product or category created after the
  build, `/korpa`) to `/index.csr.html` with status 200; the browser renders them.
- Rebuild after catalog changes (the Phase 8 build webhook); price and stock are always fetched live anyway.

## Admin catalog (Phase 3)

| Page | Route | Notes |
|---|---|---|
| Proizvodi | `/proizvodi` | Search, category / sale / archived filters, sort and paging live in the URL query (Back and refresh keep them). |
| Novi proizvod, Izmena proizvoda | `/proizvodi/novi`, `/proizvodi/:id` | One form; see below. |
| Kategorije | `/kategorije`, `/kategorije/nova`, `/kategorije/:id` | Order by drag and drop or arrows (saved at once), one image, SEO under "Napredno / SEO". |
| Zalihe | `/zalihe` | "Promeni stanje" (+/−, mandatory reason, resulting stock shown first), low-stock threshold, movement history. |
| Kontrolna tabla | `/` | "Malo na stanju" card linking to the inventory filtered by `status=low,out` ("Malo ili nema"). |

- **Product saving.** A new product is created with all its packages (variants), opening stock and
  thresholds in one request; the page then switches to editing so photos can be added. On an existing
  product "Sačuvaj izmene" sends, one request at a time: the product fields (PUT with the latest
  `version`), each changed package (PUT), each new package (POST). Every response is the whole product
  and its `version` is used by the next request, so the sequence never conflicts with itself. If a step
  fails, earlier steps stay saved and the failing package shows its errors. `409 CONCURRENT_EDIT` shows
  a plain explanation and "Učitaj najnoviju verziju". Removing a saved package and every photo action
  are saved immediately (with confirmation where something is deleted).
- **Image upload** (`data/media-upload.ts`, `shared/image-upload.ts`). Type (JPG/PNG/WebP) and size
  (10 MB) are checked in the browser; then `POST /admin/media/upload-url` and a multipart POST straight
  to the storage with every `fields` entry in order and the file last. The storage request uses a bare
  `HttpClient` on `HttpBackend`, so no interceptor (credentials, correlation id, dev headers) touches it.
  Attaching retries `409 IMAGE_NOT_READY` (5 × 2 s). Several files can be chosen or dropped at once;
  they upload one by one, each with its own preview and progress.
- **Rich text** (`shared/rich-text-editor.ts`). A small `contenteditable` editor (bold, italic,
  headings, lists, links) without a third-party library. Every change and every paste goes through
  `sanitizeRichText`, which keeps only what the API keeps (p, br, strong, em, u, s, ul, ol, li, h2–h4,
  blockquote, a[href,title], hr).
- **Server validation errors** (`shared/server-errors.ts`). `errors` keys such as
  `variants[0].discountPrice` are put on the matching (nested) form control and shown under the field. The same
  applies to `409 SLUG_TAKEN` / `SKU_TAKEN` (`slug`, `sku`, `variants[i].sku`).
- **Every required member is sent** (the API rejects missing members): product PUT sends all fields with `null` for
  empty optional ones, variants always send `discountPrice` and `isActive`, categories always send all eight members
  (the current `image.key` keeps the image).
- Leaving a form with unsaved changes asks first (route guard and `beforeunload`).

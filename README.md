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
| `npm run build:storefront` | Storefront only: static, prerendered output in `dist/storefront/browser` |
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
├── tools/generate-models.mjs
├── apps/
│   ├── storefront/           public shop – prerendered, Tailwind
│   │   ├── config/{development,production}/config.json   runtime configuration
│   │   └── src/app/
│   │       ├── core/         navigation config, header, footer, SEO service
│   │       ├── features/     home, cart, not-found (one lazy route each)
│   │       ├── app.routes.ts
│   │       └── app.routes.server.ts   render mode per route
│   └── admin/                admin SPA – Angular Material + Tailwind utilities
│       ├── config/{development,production}/config.json
│       └── src/app/
│           ├── core/         navigation config, shell (side navigation, top bar)
│           ├── features/     sign-in, dashboard, not-found
│           └── app.routes.ts
└── libs/
    ├── models/      API contract types (hand-written for now; generated/ for OpenAPI output)
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

`libs/models` holds the hand-written types used today (`ProblemDetails`, `Paged<T>`, `AdminMe`,
`AdminRole`). `npm run generate:models` writes `libs/models/src/generated/zladovce-v1.ts` from
the backend OpenAPI document and fails with a clear message when that document is missing.
It is run by hand after the contract changes and is not part of the build.

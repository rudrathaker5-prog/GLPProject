# Environment variables

Two files, and the split matters:

| File | Compiled into | Contains |
|---|---|---|
| `.env` | **the APK** | public-safe values only |
| `supabase/.env` | server-side edge functions | every secret |

Anything in `.env` is extractable from a shipped binary. Treat it as public.

---

## Client — `.env`

Read by `app.config.ts` at build time, surfaced through `expo-constants` and
exposed to code only via `src/core/config/env.ts`. **No file in `src/` reads
`process.env` directly.**

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | no | Project URL. Blank ⇒ the app runs fully on-device. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | no | Anon key. Safe to ship — RLS is the boundary. |
| `EXPO_PUBLIC_AI_GATEWAY_URL` | no | A bare gateway URL, if you are not using Supabase Functions. |
| `EXPO_PUBLIC_AI_MODEL` | no | Shown in diagnostics. The server picks the real model. |
| `APP_VARIANT` | no | `development` \| `staging` \| `production` — changes app name and package id. |
| `EAS_PROJECT_ID` | for push | Needed by `getExpoPushTokenAsync` in a production build. |

The `anon` key is designed to be public: it identifies the project, and every
table is protected by row-level security. The `service_role` key is the one that
must never appear here.

### Variants

`APP_VARIANT` gives you three installable side-by-side builds:

| Variant | Name | Package |
|---|---|---|
| `development` | GLP Care (Dev) | `in.glpcare.companion.dev` |
| `staging` | GLP Care (Staging) | `in.glpcare.companion.staging` |
| `production` | GLP Care | `in.glpcare.companion` |

---

## Server — `supabase/.env`

Never bundled. Set with `supabase secrets set --env-file supabase/.env`.

### AI

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | for AI | Without it every AI function returns `degraded: true` and the app falls back to the on-device engine. |
| `OPENAI_BASE_URL` | no | Defaults to OpenAI. Point at any compatible gateway. |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini`. |
| `OPENAI_TRANSCRIBE_MODEL` | no | Defaults to `whisper-1`. |
| `OPENAI_ORG` | no | Sent as `OpenAI-Organization`. |

### Scheduling

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | for cron | `reminder-dispatch` accepts either the service-role bearer token or this value in `x-cron-secret`. Use a long random string. |

### Notifications

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | no | Only needed for enhanced Expo push security. |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Meta Business Manager. |
| `WHATSAPP_ACCESS_TOKEN` | for WhatsApp | Permanent system-user token. |
| `WHATSAPP_API_VERSION` | no | Defaults to `v21.0`. |

### Pharmacy

| Variable | Required | Purpose |
|---|---|---|
| `PHARMACY_API_URL` | for dispatch | Partner endpoint. Absent ⇒ refills confirm locally and the response says `simulated: true`. |
| `PHARMACY_API_KEY` | for dispatch | Bearer token. |

### Provided by Supabase automatically

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL` — available inside every edge function; do not set them
yourself.

---

## CI

The APK workflow reads these repository secrets, all optional:

`EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` ·
`EAS_PROJECT_ID` · `ANDROID_KEYSTORE_PASSWORD` · `ANDROID_KEY_PASSWORD`

With none set, the workflow still produces a working APK that runs on the
bundled care library.

---

## Checking what a build actually got

Settings → About shows the live state:

- **Backend connected** / **Local only**
- **AI service connected** / **Offline care library**
- push registration state

This is read from `capabilities` in `src/core/config/env.ts`, so it reflects
what was actually compiled in, not what you meant to configure.

---

## Rules

1. **Never** put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
2. `.env` and `supabase/.env` are gitignored. Keep `.env.example` files current.
3. Rotate the anon key if you ever suspect the RLS policies were wrong while it
   was public.
4. Changing `.env` requires a **rebuild**, not a reload — these are compiled in.

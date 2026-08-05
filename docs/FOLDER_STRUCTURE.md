# Folder structure

Feature-first. A feature owns its screens, its data access, its components and
its store. Shared code lives in `core`, `ui`, `integrations` and `i18n`.

```
GLPProject/
├── App.tsx                     providers + navigator
├── index.js                    entry, polyfills
├── app.config.ts               Expo config — permissions, plugins, env
├── eas.json                    build profiles
├── tailwind.config.js          design tokens as Tailwind theme
├── jest.config.js / jest.setup.js
│
├── src/
│   ├── app/                    application shell
│   │   ├── navigation/         RootNavigator, param lists, deep links
│   │   └── providers/          React Query, theme, bootstrapping
│   │
│   ├── core/                   framework-agnostic, no feature imports
│   │   ├── clinical/           eligibility · scoring · safety   ← pure + tested
│   │   ├── config/             env.ts (the only place reading Constants.extra)
│   │   ├── data/               on-device document store
│   │   ├── domain/             types.ts — the shared vocabulary
│   │   ├── errors/             ErrorBoundary
│   │   ├── storage/            AsyncStorage + chunked SecureStore
│   │   └── supabase/           client + database.types.ts
│   │
│   ├── features/
│   │   ├── ai/                 agent orchestration, gateway, engine, chat UI
│   │   │   ├── agent/          careAgent.ts — remote-then-local decision
│   │   │   ├── api/            agentGateway, transcriptionGateway
│   │   │   ├── components/     AgentCards, VoiceInputButton
│   │   │   ├── engine/         intents · localEngine · responses (offline)
│   │   │   ├── screens/        ChatScreen
│   │   │   └── store/          chatStore
│   │   ├── appointments/       booking, list, detail
│   │   ├── auth/               onboarding, sign-in, authStore
│   │   ├── awareness/          home, learn, myths + the bundled content
│   │   ├── doctorNotes/        list, detail, clinical→patient simplifier
│   │   ├── doctorPortal/       patients, schedule, doctor profile
│   │   ├── doctors/            directory, detail, fallbackDirectory
│   │   ├── journey/            timeline, milestones
│   │   ├── medication/         meds, doses, prescriptions, refills
│   │   ├── notifications/      scheduling service + inbox screen
│   │   ├── nutrition/          plan generation, logging
│   │   ├── peer/               groups, posts, moderation
│   │   ├── profile/            profile repository + screen
│   │   ├── settings/           settings, devices, about, language picker
│   │   ├── tracking/           weight, check-ins, progress, sparkline
│   │   ├── treatment/          the stage-2 dashboard
│   │   └── vigilance/          stage-3 home, relapse plan, achievements
│   │
│   ├── integrations/           external services, behind adapters
│   │   ├── calendar/           expo-calendar
│   │   ├── communication/      phone · maps · WhatsApp · video
│   │   └── health/             Health Connect · HealthKit · BLE · wearables
│   │
│   ├── i18n/                   en · hi · gu · mr, typed keys, en fallback
│   └── ui/                     design system
│       ├── components/         Button, Card, Screen, Text, Icon, primitives
│       └── theme/              tokens + ThemeProvider
│
├── supabase/
│   ├── migrations/             schema · functions · RLS
│   ├── functions/
│   │   ├── _shared/            llm · prompts · tools · context · safety · push · whatsapp
│   │   ├── ai-agent/           the agentic loop
│   │   ├── prescription-extract/
│   │   ├── doctor-note-translate/
│   │   ├── transcribe/
│   │   ├── reminder-dispatch/
│   │   ├── notify/
│   │   └── pharmacy-order/
│   ├── seed.sql
│   └── config.toml
│
├── docs/                       this documentation
└── .github/workflows/          APK build pipeline
```

## Conventions

**A feature folder** looks like:

```
features/<name>/
  api/          repository — Supabase or local, never both in a screen
  components/   only used by this feature
  screens/      one screen per file, named <Thing>Screen.tsx
  store/        Zustand store, only when React Query does not fit
  content/      bundled static content (awareness only)
```

**Import direction** — enforced by review, not tooling:

```
screens → api → core        ✓
screens → ui, i18n          ✓
core → anything             ✗   core imports nothing from features
feature A → feature B/api   ✓   (repositories are the shared surface)
feature A → feature B/screens  ✗
```

**Path aliases** (`tsconfig.json` + `babel.config.js`, kept in sync):

| Alias | Path |
|---|---|
| `@/*` | `src/*` |
| `@core/*` | `src/core/*` |
| `@features/*` | `src/features/*` |
| `@ui/*` | `src/ui/*` |
| `@integrations/*` | `src/integrations/*` |
| `@i18n/*` | `src/i18n/*` |

**Naming**

- Screens: `PascalCaseScreen.tsx`, exported as a named export
- Repositories: `<domain>Repository.ts`, verb-first functions
- Stores: `use<Thing>Store`
- Types: `PascalCase` in `core/domain/types.ts`; DB row types end in `Row`

**Where things go**

| Adding | Goes in |
|---|---|
| a screen | `features/<feature>/screens/` + a route in `app/navigation/types.ts` |
| a data call | `features/<feature>/api/<domain>Repository.ts` |
| a clinical calculation | `core/clinical/` + a test |
| a reusable component | `ui/components/` |
| a component used once | next to its screen |
| a new external service | `integrations/<domain>/` + a section in INTEGRATIONS.md |
| a new AI capability | `supabase/functions/_shared/tools.ts` |

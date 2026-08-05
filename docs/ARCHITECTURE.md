# Architecture

## The one decision everything else follows from

**The app must be fully useful before a backend exists, and identical after one
is connected.**

That is not a convenience for development. It is a product requirement: the
awareness stage is explicitly anonymous, so a person must be able to install the
app, ask a real question, get a real answer, check their eligibility and find a
doctor — with no account, no network guarantee, and nothing recorded against
their name.

Every architectural choice below is downstream of that.

---

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Screens (feature-first)                                      │
│   awareness · treatment · vigilance · doctorPortal · settings│
└───────────────┬──────────────────────────────────────────────┘
                │  React Query for server state
                │  Zustand for session/settings/chat
┌───────────────▼──────────────────────────────────────────────┐
│ Repositories  (one per domain)                               │
│   Supabase when a session exists → local document store else │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────┐   ┌──────────────────────────┐
│ core/clinical                │   │ integrations             │
│   eligibility · scoring ·    │   │  calendar · health ·     │
│   safety                     │   │  communication           │
│  (pure, tested, no I/O)      │   │  (adapters, honest state)│
└──────────────────────────────┘   └──────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ Supabase                                                     │
│   Postgres + RLS · Auth · Storage · Edge Functions (Deno)    │
└──────────────────────────────────────────────────────────────┘
```

### Why repositories, not direct Supabase calls in screens

Each repository exposes a domain-shaped API (`logWeight`, `bookAppointment`,
`listMedications`) and internally decides between Supabase and the on-device
store. Screens never branch on "is there a backend". This is what makes the
offline mode a first-class path rather than a degraded one — there is exactly
one code path per feature, and it works either way.

```ts
export async function listMedications(): Promise<MedicationItem[]> {
  const { userId } = useAuthStore.getState();
  if (userId && supabase) { /* … RLS-scoped query … */ }
  return findBy(COLLECTIONS.medications, (m) => m.userId === currentOwnerId());
}
```

### Why clinical logic is duplicated in TypeScript and SQL

`computeWellnessScore`, `computeRelapseRisk`, adherence and BMI exist twice: once
in `src/core/clinical/` and once as Postgres functions. They are kept in sync
deliberately.

The alternative — computing only on the server — would mean an offline patient
sees no wellness score and no relapse risk, which are the two numbers the whole
vigilance stage is built on. The alternative in the other direction — computing
only on the client — would mean a doctor's portal shows different numbers from
the patient's app.

Both files carry a comment pointing at the other. The test suite pins the
TypeScript behaviour; the SQL is exercised by `supabase db reset`.

---

## State management

| Concern | Tool | Why |
|---|---|---|
| Server/domain data | React Query | caching, refetch, invalidation after mutations |
| Session (mode, user, stage) | Zustand + persist | read synchronously outside React, in repositories |
| Settings (language, theme, reminders) | Zustand + persist | same, plus it drives the notification service |
| Chat transcript | Zustand + persist | survives app restarts; trimmed to the last 60 turns |
| Forms | React Hook Form + Zod | validation lives with the schema, not the screen |

Zustand stores are read from non-React code (`useAuthStore.getState()`), which is
what lets a repository know who the current owner is without prop-drilling.

---

## Identity model

Four modes, and the differences are real:

- **anonymous** — no identity at all. A device-local UUID scopes local records.
  Nothing is uploaded. This is the default and is never interrupted.
- **guest** — a genuine Supabase anonymous session (real JWT, real row
  ownership). Created lazily by `ensureIdentity()` the first time an action needs
  storage: booking, prescriptions, cross-device reminders.
- **patient** — email or phone account. Upgrading from guest uses
  `auth.updateUser()`, so the anonymous session's rows are kept — no migration,
  no data loss.
- **doctor** — an account matched to a row in `doctors` by `auth_user_id`. The
  root navigator switches to the clinical portal on sign-in.

The escalation is one-directional and each step is user-initiated.

---

## Navigation

React Navigation (explicitly, not Expo Router). One root native stack, with the
initial route chosen from `mode` and `stage`:

```
mode === 'doctor'        → DoctorPortal
stage === 'treatment'    → Treatment tabs
stage === 'vigilance'    → Vigilance tabs
otherwise                → Awareness tabs
```

Modal-ish flows (chat, eligibility, booking, check-in, medication) live on the
root stack so they are reachable from any stage — the AI agent's action cards
navigate into them directly.

Deep links (`glpcare://`) are wired for every notification category, so tapping a
medication reminder opens the medication screen and a doctor-note push opens
that note.

---

## The AI layer

Documented in full in [AI_AGENT.md](AI_AGENT.md). The structural points:

1. **Prompts live server-side.** They can be improved without an app release.
2. **The client holds no key.** It calls the `ai-agent` edge function; the
   function holds `OPENAI_API_KEY`.
3. **Tools execute under the caller's JWT.** The agent can only do what the user
   could do themselves in the UI — RLS is the boundary, not a prompt instruction.
4. **Two engines, one contract.** `runAgentTurn` tries the server agent, and
   falls back to the on-device rules engine on any failure or missing key. Both
   return the same `ChatMessage` with the same `AgentCard[]`, so the UI does not
   know which answered.
5. **Safety is deterministic and runs on both sides.** Never gated on the model.

---

## Notifications

Local notifications are the source of truth on-device; the server scheduler is a
backstop, not the mechanism.

- `scheduleMedicationReminders` creates one repeating OS notification per dose
  time (per weekday for weekly injections) and records it in the reminder store.
- The `reminder-dispatch` edge function covers what local notifications cannot:
  a phone that was off, a second device, WhatsApp, refill detection from
  remaining units, marking overdue doses missed, and queueing check-ins.
- Quiet hours delay a reminder to the end of the window rather than dropping it.

---

## Error handling

- A top-level `ErrorBoundary` that deliberately does not import the design
  system, so it still renders when a UI module is what broke.
- React Query retries twice, never on auth failures.
- Every repository degrades rather than throwing when the backend is absent.
- Integration adapters return `{ ok: false, reason }` instead of throwing, and
  the UI shows the reason. A patient should never see "something went wrong" when
  the real answer is "video calling is not connected yet".

---

## What is intentionally not here

- **No Redux** — Zustand plus React Query covers it with less ceremony.
- **No charting library** — one series of weights, drawn with `react-native-svg`.
  Saves ~200 KB and renders identically on both platforms.
- **No icon font** — hand-written SVG paths in `ui/components/Icon.tsx`.
- **No i18n framework** — a typed key tree with per-key English fallback. A
  missing translation shows English, never a crash or a raw key.

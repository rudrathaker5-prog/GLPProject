# GLP Care — AI obesity care companion

A production-architecture React Native app covering the whole obesity care
journey: **awareness → treatment → post-treatment vigilance**, with an agentic
AI coach as the primary interface at every stage.

Built for India: Asian-Indian BMI and waist thresholds (ICMR-NIN), Indian food
in the nutrition plan, Indian crisis numbers in the safety triage, and four
languages — English, हिन्दी, ગુજરાતી, मराठी.

---

## The three tabs

One permanent bottom tab bar, always visible, Instagram-style. No stage gate, no
login wall — all three are reachable from the moment you install.

| Tab | What it is |
|---|---|
| **Awareness** | Anonymous. Conversational AI card, eligibility check, education, myth coach, doctors with one-tap calling. |
| **My Journey** | Treatment. Doses, reminders, weight, nutrition, prescriptions, doctor notes, peer support, journey map. Works before treatment starts too. |
| **Staying Well** | After treatment. Relapse risk, 3/6/12-month check-ins, milestones, adverse-event education, one-tap doctor. |

Your stage only decides which tab opens first.

## What actually works right now

Everything below runs against real logic, not mock screens. Clone, `npm install`,
build, and it works — **with no backend and no API key configured**:

| Capability | Without any configuration | With Supabase + an LLM key |
|---|---|---|
| AI care coach | Rules engine over the bundled care library, 4 languages | Full agentic LLM with memory, tools and function calling |
| Eligibility check | Real ICMR-threshold calculation | Same, plus the agent can run it mid-conversation |
| Education & myths | 10 topics, 10 myth cards, offline | Same, served from the database |
| Doctor directory & booking | Bundled directory, real slot generation, local booking | Live directory, atomic `book_appointment`, no double-booking |
| Medication reminders | Real OS notifications, offline, no account | Same, plus server-side dispatch and WhatsApp |
| Prescription → schedule | Manual entry | Photo/text → structured medicines → reminders, automatically |
| Weight, check-ins, wellness, milestones | Full, on-device | Full, synced, doctor-visible |
| Relapse risk | Computed on-device | Computed in SQL, same formula |
| Doctor portal | — | Patient list, clinical detail, note writing |
| Voice input | — | Record → Whisper-compatible transcription |
| Calling a doctor | **Working** — dials +91 8879511005 / +91 7986791522 | Same |

There is also a middle path: **paste your own OpenAI key** into Settings → AI
and the full agentic loop — memory, patient context, all 17 tools — runs
directly on the phone, with no server to deploy. That is the route to make a
personally installed APK genuinely conversational.

The app tells you which mode it is in (Settings → About, and a banner in chat)
rather than pretending a service is connected.

---

## Quick start

```bash
npm install
cp .env.example .env          # optional — the app runs fine with it empty
npm start                     # then press 'a' for Android
```

For a real device build (needed for notifications and camera):

```bash
npx expo prebuild --platform android
npm run apk:debug             # android/app/build/outputs/apk/debug/
```

Full instructions: [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Getting an APK on your phone

**→ [docs/GET_THE_APK.md](docs/GET_THE_APK.md) — step by step, nothing to install.**

Short version: GitHub → **Actions** → **Build Android APK** → **Run workflow**.
Download the artifact when it goes green, unzip, copy to your phone, tap to
install. No Expo account, no local Android SDK.

Alternatives: `eas build -p android --profile preview`, or
`npx expo prebuild -p android && npm run apk:release` locally.
Signing and troubleshooting: [docs/BUILDING_APK.md](docs/BUILDING_APK.md).

---

## Architecture at a glance

```
React Native (Expo SDK 54) ── TypeScript ── React Navigation
        │                       Zustand · React Query · React Hook Form · NativeWind
        │
        ├── on-device: SQLite-free document store, local notifications,
        │              deterministic care engine, clinical calculators
        │
        └── Supabase
              ├── Postgres — 30 tables, RLS on every patient row
              ├── Auth — anonymous / guest / patient / doctor
              ├── Storage — prescription images, owner-scoped
              └── Edge Functions (Deno)
                    ├── ai-agent            agentic loop, 18 tools, memory
                    ├── prescription-extract vision → medicines → reminders
                    ├── doctor-note-translate clinical → patient language
                    ├── transcribe          voice → text
                    ├── reminder-dispatch   cron scheduler
                    ├── notify              push + WhatsApp
                    └── pharmacy-order      refill fulfilment
```

The LLM key never leaves the server. The client talks only to edge functions.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/AI_AGENT.md](docs/AI_AGENT.md) ·
[docs/DATABASE.md](docs/DATABASE.md) ·
[docs/FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md) ·
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)

---

## The three stages

### 1. Awareness — anonymous, no login wall

A conversational card is the primary interface: type or speak, in any of the
four languages. Underneath: the "obesity is a medical condition" reframe on the
home screen itself, eligibility checker, education library, myth coach, and a
doctor block with **working Call buttons**. Nothing is stored against an
identity. The moment someone says *"I want treatment"*, the agent surfaces
doctors and a booking flow.

### 2. Treatment — the daily companion

Dashboard with today's doses, weight trend, adherence, refill countdown,
appointments and doctor notes. The coach is trained (by prompt) in motivational
interviewing, CBT and ACT, and handles the questions that actually make people
stop: needle fear, nausea, "is this working", "am I cheating".

Passive check-ins every few days feed a wellness score. Prescriptions become
reminder schedules automatically.

### 3. Vigilance — preventing relapse

Completion badge, relapse-risk score with named drivers, a written
three-step relapse protocol with a personal action threshold (3% above your
lowest weight), 3/6/12-month check-ins, achievements, and one-tap access to a
doctor.

---

## Safety model

This is the part that matters most in a healthcare app.

- **Deterministic triage runs before and after the model.** Red-flag symptoms
  (pancreatitis-shaped pain, airway swelling, persistent vomiting, self-harm)
  are matched by regex in four languages and escalate *without waiting for an
  LLM round trip*. If the network is down, escalation still happens.
- **The agent cannot prescribe.** It is instructed not to, and a post-generation
  guard rewrites any output that slips through.
- **No invented evidence.** The knowledge base is WHO and ICMR-NIN, shipped in
  the app and in the database, with sources shown to the user.
- **Row-level security**, not app-level checks. A doctor sees a patient only
  while a care relationship is open *and* the patient has sharing on.
- **Anonymous by default.** An account is created only when an action genuinely
  needs one, and the user is told at that moment.

Crisis routing uses Tele-MANAS (14416) and 112.

---

## Verification

```bash
npm run typecheck    # tsc --noEmit, strict, zero errors
npm run lint         # eslint, zero errors
npm test             # 142 tests
npm run bundle:android   # full Metro production bundle
```

The test suite covers the parts where being wrong matters: BMI and Indian
thresholds, eligibility verdicts and contraindications, multilingual safety
triage, wellness and relapse scoring, adherence, the on-device engine's refusal
to give dose advice, agent tool-schema integrity, four-language translation
parity, and that **every phone number in the directory is a valid dialable
number** — because a Call button that does nothing is worse than no button at
all.

It also pins **navigation reachability**: every registered screen must be
reachable by tapping from a tab root. Two screens had silently become orphans
(`Profile`, and `Devices` behind it), which meant profile editing, stage
switching and sign-out shipped in the bundle but could not be opened.

---

## Not finished, and honestly labelled

These are declared as adapters with documented integration points, and the UI
shows their real state rather than a fake toggle:

- **Health devices** (Health Connect, HealthKit, BLE scales) — the ingestion
  path is live; each needs its native module added and a rebuild.
- **Video consultation** — booking, links and reminders work; the in-app room
  needs a provider SDK (Twilio/Agora/100ms/Daily).
- **WhatsApp templated messages** — the send path is written; needs Meta
  Business API credentials and approved templates.
- **Pharmacy fulfilment** — the order flow is complete and records locally;
  needs a partner API URL and key.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for exactly what each requires.

---

## Licence and medical disclaimer

This software provides educational information only. It does not diagnose,
prescribe, or replace a registered medical practitioner. The bundled doctor,
hospital and pharmacy directory is illustrative sample data and must be replaced
with a real, verified network before any clinical use.

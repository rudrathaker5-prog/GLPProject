# Installation

## 0. Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node | 20.19.4+ | everything |
| npm | 10+ | everything |
| JDK | 17 | local Android builds |
| Android Studio / SDK | API 36 | local Android builds |
| Xcode | 15+ | iOS builds (macOS only) |
| Supabase CLI | latest | backend (optional) |
| Docker | latest | local Supabase (optional) |

You need **none** of the Android tooling to run the app in development on a
device with Expo Go, and none of the Supabase tooling to use the app at all.

---

## 1. Run it (2 minutes, no backend)

```bash
git clone <this repo>
cd GLPProject
npm install
npm start
```

Press `a` for an Android emulator, `i` for iOS, or scan the QR code with Expo Go.

The app is fully usable in this state: AI coach (rules engine), eligibility
checker, education library, myth coach, doctor directory, booking, medication
tracking, reminders, check-ins, wellness score, journey and vigilance.

> Voice input, camera prescription capture and push notifications need a
> development build rather than Expo Go — see step 4.

---

## 2. Add the backend (optional but recommended)

### 2a. Create a Supabase project

1. Create a project at supabase.com (the free tier is enough).
2. **Authentication → Providers → Email**: enable.
3. **Authentication → Providers → Phone**: enable and connect an SMS provider
   (MSG91 or Twilio) if you want OTP sign-in.
4. **Authentication → Sign In / Providers → Anonymous sign-ins**: **enable**.
   This is required — guest mode depends on it.
5. Copy the Project URL and the `anon` public key from Project Settings → API.

### 2b. Apply the schema

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # runs supabase/migrations/*.sql in order
```

Then load the sample directory and knowledge base:

```bash
psql "$(supabase status -o json | jq -r .DB_URL)" -f supabase/seed.sql
# or paste supabase/seed.sql into the SQL editor in the dashboard
```

To run everything locally instead:

```bash
supabase start
supabase db reset          # migrations + seed.sql, in one step
```

### 2c. Point the app at it

```bash
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart with `npm start --clear`. Settings → About should now show
**Backend connected**.

---

## 3. Add the AI service (optional)

The LLM key is a **server** secret and must never go in `.env`.

```bash
cp supabase/.env.example supabase/.env
```

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1     # or any OpenAI-compatible gateway
OPENAI_MODEL=gpt-4o-mini
CRON_SECRET=<a long random string>
```

Deploy:

```bash
supabase secrets set --env-file supabase/.env
supabase functions deploy ai-agent
supabase functions deploy prescription-extract
supabase functions deploy doctor-note-translate
supabase functions deploy transcribe
supabase functions deploy notify
supabase functions deploy pharmacy-order
supabase functions deploy reminder-dispatch --no-verify-jwt
```

Settings → About should now show **AI service connected**.

### Using a different provider

The transport speaks the OpenAI Chat Completions wire format, which Azure
OpenAI, Together, Groq, OpenRouter, Fireworks and self-hosted vLLM all
implement. Change `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENAI_MODEL` —
no code change.

### Schedule the reminder dispatcher

In the SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'reminder-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.functions.supabase.co/reminder-dispatch',
    headers := jsonb_build_object('x-cron-secret', '<your CRON_SECRET>')
  );
  $$
);
```

---

## 4. Development build (real device features)

Expo Go cannot load the native modules this app uses for notifications, camera
and audio. For those you need a development build:

```bash
npx expo prebuild --platform android
npx expo run:android          # installs on a connected device/emulator
```

Or via EAS, with no local Android SDK:

```bash
npm i -g eas-cli
eas login
eas build --profile development --platform android
```

---

## 5. Creating a doctor account

Doctors are ordinary auth users matched to a row in `doctors`:

```sql
-- after the doctor has signed up in the app with their clinic email
update doctors
set auth_user_id = (select id from auth.users where email = 'dr.mehta@example.com')
where registration_number = 'GMC-45231';
```

Link a patient to them:

```sql
insert into care_relationships (patient_id, doctor_id, is_primary)
values ('<patient-uuid>', '<doctor-uuid>', true);
```

On next sign-in the app switches to the clinical portal automatically.

---

## 6. Verify the install

```bash
npm run typecheck      # expect: no output
npm run lint           # expect: no output
npm test               # expect: 67 passed
npm run bundle:android # expect: "Bundled … index.js"
```

---

## Troubleshooting

**`Unable to resolve module @core/...`**
Clear the Metro cache: `npm start -- --clear`.

**Notifications never fire**
They need a development build, not Expo Go, and Android 13+ requires the
`POST_NOTIFICATIONS` runtime permission. Settings → Notifications shows how many
notifications the OS has actually accepted — if that is 0 while reminders are
listed, permission is off.

**`Anonymous sign-ins are disabled`**
Enable anonymous sign-ins in Supabase Auth settings (step 2a.4).

**Edge function returns `degraded: true`**
`OPENAI_API_KEY` is not set on the server. The app falls back to the on-device
engine automatically; set the secret and redeploy to enable the full agent.

**Prescription photo does not upload**
The `prescriptions` storage bucket is created by the RLS migration. Confirm it
exists and that the storage policies from
`20260101000200_row_level_security.sql` were applied.

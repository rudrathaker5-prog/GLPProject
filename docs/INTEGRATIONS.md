# Integrations

Every external service sits behind an adapter. This document says exactly what
is live, what is not, and what each unfinished one needs.

**The rule applied throughout:** an integration that is not connected reports
that honestly. There are no toggles that pretend to work.

---

## Live today, no configuration

| Integration | Where | Notes |
|---|---|---|
| Local notifications | `features/notifications/service` | fires offline, no account, per-category Android channels |
| Device calendar | `integrations/calendar` | creates a "GLP Care" calendar, writes appointments with 24h + 1h alerts |
| Phone dialler | `integrations/communication` | `tel:` — doctors, clinics, crisis lines |
| Maps / directions | `integrations/communication` | platform maps with a Google Maps web fallback |
| WhatsApp (user-initiated) | `integrations/communication` | `whatsapp://send` deep link with a prefilled message |
| Text-to-speech | `expo-speech` in `ChatScreen` | reads replies aloud in the user's language |

---

## Live with a Supabase project + LLM key

| Integration | Function | Notes |
|---|---|---|
| Agentic AI coach | `ai-agent` | see [AI_AGENT.md](AI_AGENT.md) |
| Prescription reading | `prescription-extract` | image or text → medicines → reminders |
| Doctor-note translation | `doctor-note-translate` | clinical → patient language, with a deterministic fallback |
| Voice input | `transcribe` | Whisper-compatible; handles hi/gu/mr |
| Push notifications | `notify` | Expo Push → FCM/APNs |
| Server reminder scheduler | `reminder-dispatch` | pg_cron every 5 min |

### Swapping the LLM provider

The transport speaks the OpenAI Chat Completions format. Azure OpenAI, Together,
Groq, OpenRouter, Fireworks and self-hosted vLLM all implement it.

```dotenv
OPENAI_BASE_URL=https://your-gateway/v1
OPENAI_API_KEY=...
OPENAI_MODEL=your-model
```

No code change. Vision is used only by `prescription-extract`; a text-only model
still works if the client sends OCR text instead of an image.

---

## Needs credentials — the send path is written

### WhatsApp Business Cloud API

`supabase/functions/_shared/whatsapp.ts`

Business-initiated messages need Meta-approved templates.

```dotenv
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...        # permanent system-user token
WHATSAPP_API_VERSION=v21.0
```

Register these templates in Meta Business Manager (or change the map in the
file):

| Template | Variables |
|---|---|
| `glp_medication_reminder` | {{1}} title, {{2}} body |
| `glp_refill_reminder` | {{1}} medicine, {{2}} days left |
| `glp_appointment_reminder` | {{1}} doctor, {{2}} date/time |
| `glp_doctor_note` | {{1}} summary |
| `glp_milestone` | {{1}} milestone |
| `glp_checkin` | {{1}} prompt |

Without the secrets the function logs the intended message with a masked number
and returns `false`. The rest of the reminder pipeline is unaffected — push and
local notifications still go out.

Numbers are normalised to E.164 (`normaliseIndianNumber`) so 10-digit Indian
numbers, `+91` and `091` forms all work.

### Pharmacy fulfilment

`supabase/functions/pharmacy-order/index.ts`

```dotenv
PHARMACY_API_URL=https://partner.example.com/api
PHARMACY_API_KEY=...
```

Three channels are modelled — `hospital_pharmacy`, `nearby_pharmacy`,
`home_delivery` — with cold-chain flagged automatically for injectables. The
adapter posts:

```json
{ "channel": "...", "items": [{ "name": "...", "strength": "...", "quantity": 1 }],
  "cold_chain": true, "delivery_address": "...", "pharmacy_id": "...", "reference": "GLP-..." }
```

Without the secrets the refill is recorded and confirmed locally with a
reference, and the response carries `simulated: true` — the patient journey and
reminders keep working during a pilot, and the note on the request says so.

---

## Needs a native module — adapter interface is complete

`src/integrations/health/healthAdapter.ts`

The persistence path is **live**: anything passed to `ingestSamples` flows into
weight history, milestones, the dashboard and the AI context exactly like a
manual entry. Only the reading half is missing, and only because each provider
needs a native module compiled into the binary.

| Provider | Package to add | Extra work |
|---|---|---|
| Health Connect / Google Fit | `react-native-health-connect` | config plugin, `android.permission.health.*`, Play Data Types declaration |
| Apple Health | `@kingstinct/react-native-healthkit` | HealthKit entitlement (usage strings already in `app.config.ts`) |
| Smart scale | `react-native-ble-plx` | BLE permissions, Weight Scale Service `0x181D` |
| Wearables | vendor cloud APIs | OAuth per vendor (Fitbit, Garmin, Noise, boAt) |

To enable one:

1. `npx expo install <package>`
2. Add its config plugin to `app.config.ts`
3. In `healthAdapter.ts`, implement `isAvailable`, `requestPermissions` and
   `readSamples` for that provider
4. `npx expo prebuild --clean` and rebuild

Until then the Devices screen shows **"Not in this build"** rather than a dead
toggle, and every metric can be entered by hand.

### Video consultation

`src/integrations/communication/communicationAdapter.ts` → `joinConsultation`

Booking, meeting links, reminders and the join button are all live. A real HTTPS
`meetingUrl` supplied by a clinic opens in the browser and works today.

For an in-app room, replace `joinConsultation` with your provider's SDK — Twilio
Video, Agora, 100ms and Daily all expose a "join room with token" call that fits
the existing signature. Mint the token in a `video-token` edge function so no key
ships in the app.

Until then the function returns a clear reason and points the patient at the
phone number in their profile.

---

## Adding a new integration

Follow the existing shape:

1. Put the adapter in `src/integrations/<domain>/`.
2. Export an interface plus an availability check — never assume it is present.
3. Return `{ ok: false, reason }` rather than throwing. The UI shows the reason.
4. Keep secrets on the server. If the device needs to call it, proxy through an
   edge function.
5. Document the required env vars here.

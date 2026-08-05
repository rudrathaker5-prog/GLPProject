# Database

Postgres on Supabase. 30 tables, one view, 14 functions, RLS on every
patient-owned table.

```
supabase/
  migrations/
    20260101000000_initial_schema.sql        tables, enums, indexes
    20260101000100_functions_and_triggers.sql  logic
    20260101000200_row_level_security.sql    policies + storage bucket
  seed.sql                                   directory + knowledge base
  config.toml                                local dev config
```

Apply with `supabase db push`, or `supabase db reset` locally (migrations +
seed in one step).

---

## Schema map

### Identity
| Table | Notes |
|---|---|
| `profiles` | 1:1 with `auth.users`, created by trigger on signup (including anonymous) |
| `user_settings` | language, theme, per-category reminder switches, quiet hours, sharing consent |
| `care_relationships` | patient ↔ doctor; open row = doctor can read |

### Care team (reference data, world-readable)
`hospitals` · `doctors` · `pharmacies` · `doctor_availability`

### Treatment
| Table | Notes |
|---|---|
| `prescriptions` | image, raw text, extraction confidence |
| `medications` | dose, frequency, times, weekdays, storage note, units remaining |
| `dose_events` | one row per scheduled dose; `unique (medication_id, scheduled_for)` |
| `refill_requests` | channel, pharmacy, status, expected date |
| `appointments` | mode, status, meeting URL, calendar event id |

### Tracking
`weight_entries` (unique per user per day) · `check_ins` · `nutrition_plans` ·
`nutrition_logs` · `health_samples` · `device_connections`

### Journey
`journey_events` · `milestones` (unique per user per code) · `doctor_notes`

### AI
`conversations` · `messages` · `agent_memories` · `agent_actions` (audit)

### Notifications
`reminder_schedules` · `notifications` · `push_tokens`

### Community
`peer_groups` · `peer_memberships` · `peer_posts`

### Knowledge
`education_topics` · `myth_cards` — world-readable, mirrored in the app bundle
so the library works offline.

---

## Enums

Every categorical column is a real Postgres enum, which means the type generator
produces exact TypeScript unions rather than `string`:

`account_mode`, `journey_stage`, `language_code`, `sex_type`,
`appointment_mode`, `appointment_status`, `medication_form`, `dose_frequency`,
`dose_status`, `refill_channel`, `refill_status`, `prescription_status`,
`checkin_kind`, `journey_event_type`, `milestone_code`, `chat_role`,
`notification_channel`, `notification_category`, `health_provider`,
`device_status`, `weight_source`.

---

## Functions

### Clinical
| Function | Returns | Notes |
|---|---|---|
| `calculate_bmi(height_cm, weight_kg)` | numeric | one decimal |
| `bmi_category_indian(bmi)` | text | ICMR cut-offs: 23 / 25 / 30 / 35 |
| `compute_wellness_score(check_ins)` | int | weighted composite, side-effect penalty |
| `compute_relapse_risk(user)` | jsonb | score, band, named signals, recommendation |
| `medication_adherence(user, days)` | numeric | % taken in the window |
| `refill_days_remaining(medication)` | int | from units remaining and frequency |

`compute_wellness_score` and `compute_relapse_risk` are mirrored in
`src/core/clinical/scoring.ts` so offline and online produce the same numbers.
Change one, change both.

### Scheduling
| Function | Notes |
|---|---|
| `available_slots(doctor, date)` | walks `doctor_availability`, excludes taken slots |
| `book_appointment(...)` | **atomic** — re-checks the slot, inserts the appointment, writes a journey event and a 24h reminder in one transaction; raises `slot_unavailable` on a race |
| `generate_dose_events(medication, days)` | idempotent, 35 days ahead |
| `expire_overdue_doses(grace_hours)` | marks stale scheduled doses missed |

### Triggers
| Trigger | Does |
|---|---|
| `on_auth_user_created` | provisions `profiles` + `user_settings` |
| `check_ins_wellness` | computes the wellness score on write |
| `weight_entries_milestones` | awards 5/10/15/20% milestones |
| `medications_after_write` | regenerates dose events when a schedule changes |
| `*_updated_at` | maintains `updated_at` |

### View
`patient_snapshot` — one row per patient with BMI, category, current and
starting weight, 28-day adherence, active medication count, next dose, next
appointment and last check-in. This is what the AI context builder reads, so
assembling agent context is a single query. Declared `security_invoker = true`,
so it respects the caller's RLS.

---

## Row-level security

Three shapes:

**1. Owner-only** (weights, check-ins, medications, reminders, memories, …)

```sql
create policy "owner all" on weight_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**2. Owner + consenting doctor** (clinical history)

```sql
create policy "caring doctor read" on weight_entries
  for select using (is_caring_doctor(user_id));
```

`is_caring_doctor(patient)` returns true only when **both** hold:

```sql
exists (open care_relationship between this doctor and that patient)
AND coalesce(user_settings.share_data_with_doctor, true)
```

So a patient turning sharing off in Settings revokes a doctor's read access
immediately, at the database level. The app cannot override it.

**3. Public reference data** — hospitals, doctors, pharmacies, education, myths,
peer groups: `for select using (true)`; writes are service-role only.

### Peer posts

Readable only by members of that group, insertable only as yourself:

```sql
create policy "posts readable by members" on peer_posts
  for select using (
    exists (select 1 from peer_memberships m
            where m.group_id = peer_posts.group_id and m.user_id = auth.uid())
  );
```

### Storage

The `prescriptions` bucket is private and folder-scoped:

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

A patient can only read and write under their own UUID prefix.

---

## Types

`src/core/supabase/database.types.ts` is hand-maintained to match the schema.
Regenerate after any change:

```bash
npm run db:types      # supabase gen types typescript --local
```

Row types are **type aliases, not interfaces** — deliberately. `supabase-js`
constrains a table's `Row` to `Record<string, unknown>`, and a TypeScript
`interface` does not satisfy an index signature while a type alias does. Using
interfaces silently degrades every query to `never`.

---

## Sample data

`supabase/seed.sql` loads:

- 5 hospitals and 5 doctors across Ahmedabad, Pune, Mumbai and Delhi, with
  clinic availability (Mon–Sat mornings in person, Mon–Fri evenings video)
- 5 pharmacies, cold-chain flags set
- 4 peer groups
- 7 education topics and 8 myth cards (WHO / ICMR sourced)

The directory is **illustrative** and mirrors
`src/features/doctors/api/fallbackDirectory.ts` so behaviour does not change when
the backend is switched on. Replace both with a real verified network before any
clinical use. The UI labels the bundled list as the offline directory.

---

## Conventions

- `snake_case` in SQL, `camelCase` in TypeScript; repositories do the mapping in
  one place per domain.
- All timestamps `timestamptz`. Clinic-time logic uses `Asia/Kolkata` explicitly.
- Money as `numeric(10,2)`. Weight as `numeric(5,1)` with a sanity `check`.
- Partial indexes where the query is always filtered
  (`... where active`, `... where ended_at is null`).
- `on delete cascade` from `auth.users` throughout, so "delete my data" is a
  single delete.

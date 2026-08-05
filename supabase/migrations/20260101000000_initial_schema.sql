-- =====================================================================
-- GLP Care Companion — core schema
-- Postgres 15 / Supabase
--
-- Design notes
--  * Every patient-owned table carries `user_id uuid references auth.users`
--    and is protected by row level security.
--  * Reference data (hospitals, doctors, pharmacies, education, myths,
--    peer groups) is world-readable and service-role writable.
--  * Enumerated domains are real Postgres enums so the client type
--    generator produces exact unions.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type account_mode      as enum ('anonymous', 'guest', 'patient', 'doctor');
create type journey_stage     as enum ('awareness', 'treatment', 'vigilance');
create type language_code     as enum ('en', 'hi', 'gu', 'mr');
create type sex_type          as enum ('male', 'female', 'other', 'undisclosed');

create type appointment_mode   as enum ('in_person', 'video', 'phone');
create type appointment_status as enum ('requested','confirmed','rescheduled','cancelled','completed','no_show');

create type medication_form as enum ('injection', 'tablet', 'capsule', 'syrup', 'other');
create type dose_frequency  as enum ('weekly','daily','twice_daily','thrice_daily','as_needed');
create type dose_status     as enum ('scheduled','taken','missed','skipped','snoozed');

create type refill_channel as enum ('hospital_pharmacy','nearby_pharmacy','home_delivery');
create type refill_status  as enum ('not_needed','due_soon','requested','confirmed','dispatched','delivered','cancelled');

create type prescription_status as enum ('active','expired','superseded','draft');

create type checkin_kind as enum ('passive','weekly','monthly','vigilance','triggered');

create type journey_event_type as enum (
  'diagnosis','treatment_start','dose_escalation','appointment','milestone',
  'achievement','prescription','phase_change','relapse_alert','treatment_complete'
);

create type milestone_code as enum (
  'weight_loss_5','weight_loss_10','weight_loss_15','weight_loss_20',
  'adherence_streak_4w','adherence_streak_12w','exercise_streak_7d','exercise_streak_30d',
  'nutrition_streak_7d','nutrition_streak_30d','checkin_streak_4w',
  'treatment_complete','maintenance_6m','maintenance_12m'
);

create type chat_role as enum ('system','user','assistant','tool');

create type notification_channel  as enum ('push','local','whatsapp','sms','email');
create type notification_category as enum (
  'medication','refill','appointment','checkin','motivation','milestone','relapse','doctor_note','system'
);

create type health_provider as enum ('google_fit','apple_health','smart_scale','wearable');
create type device_status   as enum ('connected','disconnected','error','unsupported');

create type weight_source as enum ('manual','smart_scale','health_kit','google_fit','clinic');

-- ---------------------------------------------------------------------
-- Reference data: hospitals, doctors, pharmacies
-- ---------------------------------------------------------------------

create table hospitals (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  city               text not null,
  address            text not null,
  phone              text,
  latitude           double precision,
  longitude          double precision,
  has_obesity_clinic boolean not null default false,
  has_pharmacy       boolean not null default false,
  created_at         timestamptz not null default now()
);
create index hospitals_city_idx on hospitals (lower(city));

create table doctors (
  id                    uuid primary key default gen_random_uuid(),
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  full_name             text not null,
  speciality            text not null default 'Endocrinology',
  qualifications        text not null default '',
  registration_number   text,
  hospital_id           uuid references hospitals(id) on delete set null,
  city                  text not null,
  languages             language_code[] not null default '{en}',
  consultation_fee      numeric(10,2),
  teleconsult_available boolean not null default true,
  rating                numeric(2,1),
  years_experience      int,
  photo_url             text,
  phone                 text,
  bio                   text,
  accepting_patients    boolean not null default true,
  created_at            timestamptz not null default now()
);
create index doctors_city_idx on doctors (lower(city));
create index doctors_hospital_idx on doctors (hospital_id);

create table pharmacies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  city                text not null,
  address             text not null,
  phone               text,
  supports_delivery   boolean not null default false,
  supports_cold_chain boolean not null default false,
  hospital_id         uuid references hospitals(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index pharmacies_city_idx on pharmacies (lower(city));

-- ---------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------

create table profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  mode                   account_mode not null default 'anonymous',
  stage                  journey_stage not null default 'awareness',
  display_name           text,
  phone                  text,
  email                  text,
  language               language_code not null default 'en',
  date_of_birth          date,
  sex                    sex_type not null default 'undisclosed',
  height_cm              numeric(5,1),
  starting_weight_kg     numeric(5,1),
  target_weight_kg       numeric(5,1),
  waist_cm               numeric(5,1),
  comorbidities          text[] not null default '{}',
  contraindications      text[] not null default '{}',
  city                   text,
  consented_at           timestamptz,
  onboarded_at           timestamptz,
  treatment_started_at   timestamptz,
  treatment_completed_at timestamptz,
  primary_doctor_id      uuid references doctors(id) on delete set null,
  push_token             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table user_settings (
  user_id                        uuid primary key references auth.users(id) on delete cascade,
  language                       language_code not null default 'en',
  theme                          text not null default 'system',
  medication_reminders_enabled   boolean not null default true,
  refill_reminders_enabled       boolean not null default true,
  appointment_reminders_enabled  boolean not null default true,
  motivation_nudges_enabled      boolean not null default true,
  checkin_reminders_enabled      boolean not null default true,
  whatsapp_opt_in                boolean not null default false,
  whatsapp_number                text,
  quiet_hours_start              time default '22:00',
  quiet_hours_end                time default '07:00',
  share_data_with_doctor         boolean not null default true,
  large_text                     boolean not null default false,
  reduce_motion                  boolean not null default false,
  updated_at                     timestamptz not null default now()
);

-- Doctor <-> patient assignment (a doctor may follow many patients).
create table care_relationships (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references auth.users(id) on delete cascade,
  doctor_id   uuid not null references doctors(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  is_primary  boolean not null default true,
  unique (patient_id, doctor_id)
);
create index care_rel_doctor_idx on care_relationships (doctor_id) where ended_at is null;

-- ---------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------

create table appointments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  doctor_id        uuid not null references doctors(id) on delete restrict,
  hospital_id      uuid references hospitals(id) on delete set null,
  scheduled_at     timestamptz not null,
  duration_minutes int not null default 20,
  mode             appointment_mode not null default 'in_person',
  status           appointment_status not null default 'requested',
  reason           text,
  notes_for_doctor text,
  meeting_url      text,
  calendar_event_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index appointments_user_idx   on appointments (user_id, scheduled_at desc);
create index appointments_doctor_idx on appointments (doctor_id, scheduled_at desc);

-- Doctor availability used by the booking engine.
create table doctor_availability (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid not null references doctors(id) on delete cascade,
  weekday      int not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  slot_minutes int not null default 20,
  mode         appointment_mode not null default 'in_person',
  active       boolean not null default true
);
create index doctor_availability_idx on doctor_availability (doctor_id, weekday);

-- ---------------------------------------------------------------------
-- Prescriptions & medication
-- ---------------------------------------------------------------------

create table prescriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  doctor_id             uuid references doctors(id) on delete set null,
  doctor_name           text,
  hospital_name         text,
  issued_on             date not null default current_date,
  valid_until           date,
  image_url             text,
  raw_text              text,
  extraction_confidence numeric(3,2),
  status                prescription_status not null default 'active',
  created_at            timestamptz not null default now()
);
create index prescriptions_user_idx on prescriptions (user_id, issued_on desc);

create table medications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  prescription_id       uuid references prescriptions(id) on delete set null,
  name                  text not null,
  generic_name          text,
  form                  medication_form not null default 'injection',
  strength              text not null default '',
  dose_amount           numeric(8,3) not null default 1,
  dose_unit             text not null default 'mg',
  frequency             dose_frequency not null default 'weekly',
  times_of_day          text[] not null default '{09:00}',
  days_of_week          int[],
  start_date            date not null default current_date,
  end_date              date,
  duration_days         int,
  instructions          text,
  storage_note          text,
  is_titration          boolean not null default false,
  titration_step        int,
  refill_threshold_days int not null default 7,
  units_remaining       numeric(8,2),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index medications_user_idx on medications (user_id) where active;

create table dose_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  medication_id   uuid not null references medications(id) on delete cascade,
  scheduled_for   timestamptz not null,
  taken_at        timestamptz,
  status          dose_status not null default 'scheduled',
  notes           text,
  notification_id text,
  created_at      timestamptz not null default now(),
  unique (medication_id, scheduled_for)
);
create index dose_events_user_idx on dose_events (user_id, scheduled_for desc);

create table refill_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references medications(id) on delete cascade,
  channel       refill_channel not null default 'hospital_pharmacy',
  pharmacy_id   uuid references pharmacies(id) on delete set null,
  status        refill_status not null default 'requested',
  requested_at  timestamptz not null default now(),
  expected_by   timestamptz,
  address_line  text,
  notes         text
);
create index refill_user_idx on refill_requests (user_id, requested_at desc);

-- ---------------------------------------------------------------------
-- Tracking
-- ---------------------------------------------------------------------

create table weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  recorded_on date not null default current_date,
  weight_kg   numeric(5,1) not null check (weight_kg > 10 and weight_kg < 500),
  waist_cm    numeric(5,1),
  source      weight_source not null default 'manual',
  created_at  timestamptz not null default now(),
  unique (user_id, recorded_on)
);
create index weight_user_idx on weight_entries (user_id, recorded_on desc);

create table check_ins (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  kind                 checkin_kind not null default 'passive',
  occurred_at          timestamptz not null default now(),
  weight_kg            numeric(5,1),
  mood_score           int check (mood_score between 0 and 10),
  appetite_score       int check (appetite_score between 0 and 10),
  energy_score         int check (energy_score between 0 and 10),
  sleep_hours          numeric(3,1),
  sleep_quality        int check (sleep_quality between 0 and 10),
  stress_score         int check (stress_score between 0 and 10),
  craving_score        int check (craving_score between 0 and 10),
  water_litres         numeric(3,1),
  exercise_minutes     int,
  nutrition_adherence  int check (nutrition_adherence between 0 and 100),
  medication_adherence int check (medication_adherence between 0 and 100),
  confidence_score     int check (confidence_score between 0 and 10),
  side_effects         jsonb not null default '[]'::jsonb,
  free_text            text,
  wellness_score       int,
  relapse_risk         jsonb,
  created_at           timestamptz not null default now()
);
create index checkins_user_idx on check_ins (user_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------

create table nutrition_plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  protein_target_g    int not null default 70,
  calorie_target      int,
  water_target_litres numeric(3,1) not null default 2.5,
  fibre_target_g      int not null default 30,
  meal_guidance       jsonb not null default '[]'::jsonb,
  behaviour_goals     text[] not null default '{}',
  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index nutrition_plans_user_idx on nutrition_plans (user_id) where active;

create table nutrition_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  logged_on           date not null default current_date,
  protein_g           numeric(6,1),
  water_litres        numeric(3,1),
  vegetable_servings  int,
  adherence_score     int check (adherence_score between 0 and 100),
  notes               text,
  created_at          timestamptz not null default now(),
  unique (user_id, logged_on)
);

-- ---------------------------------------------------------------------
-- Journey, milestones, doctor notes
-- ---------------------------------------------------------------------

create table journey_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        journey_event_type not null,
  title       text not null,
  description text,
  occurred_at timestamptz not null default now(),
  stage       journey_stage not null default 'treatment',
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index journey_user_idx on journey_events (user_id, occurred_at desc);

create table milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        milestone_code not null,
  achieved_at timestamptz not null default now(),
  celebrated  boolean not null default false,
  value       numeric(6,2),
  unique (user_id, code)
);

create table doctor_notes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  doctor_id             uuid not null references doctors(id) on delete cascade,
  appointment_id        uuid references appointments(id) on delete set null,
  clinical_text         text not null,
  patient_friendly_text text,
  translated_text       jsonb,
  created_at            timestamptz not null default now(),
  acknowledged_at       timestamptz
);
create index doctor_notes_user_idx on doctor_notes (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------

create table conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  stage           journey_stage not null default 'awareness',
  title           text,
  summary         text,
  language        language_code not null default 'en',
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index conversations_user_idx on conversations (user_id, last_message_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  role            chat_role not null,
  content         text not null default '',
  language        language_code,
  tool_name       text,
  tool_payload    jsonb,
  cards           jsonb,
  token_usage     int,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

-- Long-term agent memory: durable facts extracted from conversations.
create table agent_memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,              -- preference | concern | goal | fact | barrier
  content    text not null,
  salience   numeric(3,2) not null default 0.5,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_memories_user_idx on agent_memories (user_id, salience desc);

-- ---------------------------------------------------------------------
-- Notifications & reminders
-- ---------------------------------------------------------------------

create table reminder_schedules (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  category               notification_category not null,
  reference_id           uuid,
  title                  text not null,
  body                   text not null,
  next_fire_at           timestamptz not null,
  repeat_rule            jsonb,
  channels               notification_channel[] not null default '{local}',
  active                 boolean not null default true,
  local_notification_ids text[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index reminders_due_idx on reminder_schedules (next_fire_at) where active;
create index reminders_user_idx on reminder_schedules (user_id) where active;

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   notification_category not null,
  title      text not null,
  body       text not null,
  channel    notification_channel not null default 'push',
  sent_at    timestamptz,
  read_at    timestamptz,
  deep_link  text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null,
  device_id  text,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

-- ---------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------

create table device_connections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  provider     health_provider not null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  status       device_status not null default 'disconnected',
  scopes       text[] not null default '{}',
  unique (user_id, provider)
);

create table health_samples (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    health_provider not null,
  metric      text not null,
  value       numeric(10,2) not null,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);
create index health_samples_user_idx on health_samples (user_id, metric, recorded_at desc);

-- ---------------------------------------------------------------------
-- Peer support
-- ---------------------------------------------------------------------

create table peer_groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  stage        text not null default 'all',
  language     language_code not null default 'en',
  member_count int not null default 0,
  is_moderated boolean not null default true,
  created_at   timestamptz not null default now()
);

create table peer_memberships (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references peer_groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  alias     text not null,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table peer_posts (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references peer_groups(id) on delete cascade,
  author_id      uuid references auth.users(id) on delete set null,
  author_alias   text not null,
  body           text not null,
  reaction_count int not null default 0,
  reply_count    int not null default 0,
  flagged        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index peer_posts_group_idx on peer_posts (group_id, created_at desc);

-- ---------------------------------------------------------------------
-- Knowledge base (education + myths), world readable
-- ---------------------------------------------------------------------

create table education_topics (
  id           text primary key,
  title        text not null,
  category     text not null,
  summary      text not null,
  body         text[] not null,
  read_minutes int not null default 3,
  sources      text[] not null default '{}',
  language     language_code not null default 'en',
  created_at   timestamptz not null default now()
);

create table myth_cards (
  id          text primary key,
  myth        text not null,
  verdict     text not null,
  explanation text not null,
  evidence    text not null,
  reassurance text not null,
  tags        text[] not null default '{}',
  language    language_code not null default 'en',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Audit of AI actions (function calls executed on the patient's behalf)
-- ---------------------------------------------------------------------

create table agent_actions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  tool_name       text not null,
  arguments       jsonb not null default '{}'::jsonb,
  result          jsonb,
  status          text not null default 'succeeded',
  error           text,
  created_at      timestamptz not null default now()
);
create index agent_actions_user_idx on agent_actions (user_id, created_at desc);

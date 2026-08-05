-- Calls and maintenance checkpoints.
--
-- Both already existed on the device. This is the server half, so a patient who
-- signs in keeps their call history and their 3/6/12-month reviews, and so the
-- doctor portal and the server agent can see them.
--
-- Deliberately *not* the phone's call log. These are calls the app itself
-- initiated, recorded with the reason they were placed. Reading the OS call log
-- needs a permission this app does not request, and the distinction is carried
-- through to the column comments so nobody later mistakes one for the other.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type call_kind as enum (
  'doctor',
  'hospital',
  'pharmacy',
  'emergency',
  'crisis_line',
  'other'
);

create type call_reason as enum (
  'routine',
  'side_effect',
  'missed_dose',
  'refill',
  'appointment',
  'red_flag',
  'relapse',
  'unknown'
);

-- ---------------------------------------------------------------------------
-- Call log
-- ---------------------------------------------------------------------------

create table call_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  number        text not null,
  contact_name  text,
  kind          call_kind not null default 'other',
  reason        call_reason not null default 'unknown',
  -- True when the OS dialler opened. NOT a record that the call connected:
  -- the app cannot know that without the call-log permission.
  dialled       boolean not null default true,
  placed_at     timestamptz not null default now(),
  outcome_note  text,
  created_at    timestamptz not null default now()
);

comment on table call_log is
  'Calls initiated from inside the app. Not the device call log — records intent and reason, not connection or duration.';
comment on column call_log.dialled is
  'The dialler opened. Says nothing about whether anyone answered.';

create index call_log_user_idx on call_log (user_id, placed_at desc);
create index call_log_reason_idx on call_log (user_id, reason, placed_at desc);

-- ---------------------------------------------------------------------------
-- Maintenance checkpoints
-- ---------------------------------------------------------------------------

create table vigilance_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- 3, 6 or 12 months after treatment completion.
  month          int not null check (month in (3, 6, 12)),
  due_at         timestamptz not null,
  completed_at   timestamptz,
  weight_kg      numeric(5,1) check (weight_kg is null or (weight_kg > 10 and weight_kg < 500)),
  -- Percent above the LOWEST weight ever recorded, not the starting weight.
  -- Regain is measured from the floor; measuring from the ceiling is how a
  -- slow return goes unnoticed for a year.
  drift_percent  numeric(5,1),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, month)
);

comment on column vigilance_checkpoints.drift_percent is
  'Percent above the patient''s lowest recorded weight at the time of the review.';

create index vigilance_checkpoints_user_idx
  on vigilance_checkpoints (user_id, month);

-- ---------------------------------------------------------------------------
-- Row-level security — the patient owns both, the doctor may read
-- ---------------------------------------------------------------------------

alter table call_log enable row level security;
alter table vigilance_checkpoints enable row level security;

create policy call_log_owner on call_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy vigilance_checkpoints_owner on vigilance_checkpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A doctor sees these only while a care relationship is open *and* the patient
-- has sharing switched on — the same condition the rest of the schema uses.
create policy call_log_care_team on call_log
  for select using (
    exists (
      select 1
      from care_relationships cr
      join user_settings us on us.user_id = call_log.user_id
      where cr.patient_id = call_log.user_id
        and cr.doctor_id = auth.uid()
        and cr.ended_at is null
        and us.share_data_with_doctor
    )
  );

create policy vigilance_checkpoints_care_team on vigilance_checkpoints
  for select using (
    exists (
      select 1
      from care_relationships cr
      join user_settings us on us.user_id = vigilance_checkpoints.user_id
      where cr.patient_id = vigilance_checkpoints.user_id
        and cr.doctor_id = auth.uid()
        and cr.ended_at is null
        and us.share_data_with_doctor
    )
  );

-- ---------------------------------------------------------------------------
-- Side-effect trend
-- ---------------------------------------------------------------------------

-- Aggregates the side effects recorded across recent check-ins.
--
-- The clinically useful signal is the pattern, not the event: one bout of
-- nausea on a GLP-1 is expected, the same symptom four check-ins running — or
-- one getting worse — is what a doctor needs to hear. Doing this in SQL keeps
-- the server agent's answer identical to the on-device one.
create or replace function side_effect_trend(p_user_id uuid, p_window_days int default 60)
returns table (
  code            text,
  occurrences     bigint,
  worst_severity  text,
  last_reported   timestamptz,
  worsening       boolean
)
language sql
stable
security invoker
as $$
  with reported as (
    select
      e ->> 'code'     as code,
      e ->> 'severity' as severity,
      case e ->> 'severity'
        when 'severe'   then 3
        when 'moderate' then 2
        else 1
      end              as severity_rank,
      c.occurred_at
    from check_ins c
    cross join lateral jsonb_array_elements(c.side_effects) e
    where c.user_id = p_user_id
      and c.occurred_at >= now() - make_interval(days => p_window_days)
  ),
  ranked as (
    select
      code,
      severity_rank,
      occurred_at,
      first_value(severity_rank) over w_asc  as first_rank,
      first_value(severity_rank) over w_desc as latest_rank
    from reported
    window
      w_asc  as (partition by code order by occurred_at),
      w_desc as (partition by code order by occurred_at desc)
  )
  select
    code,
    count(*)                                   as occurrences,
    case max(severity_rank)
      when 3 then 'severe'
      when 2 then 'moderate'
      else 'mild'
    end                                        as worst_severity,
    max(occurred_at)                           as last_reported,
    bool_or(latest_rank > first_rank)          as worsening
  from ranked
  group by code
  order by max(severity_rank) desc, count(*) desc;
$$;

comment on function side_effect_trend is
  'Side effects across recent check-ins, aggregated. Mirrors sideEffectTrend() in the client.';

-- ---------------------------------------------------------------------------
-- Maintenance status
-- ---------------------------------------------------------------------------

-- Where a patient stands against their relapse action threshold.
--
-- 3% above the lowest recorded weight: early enough to reverse with behaviour
-- alone, late enough not to fire on daily fluctuation.
create or replace function maintenance_status(p_user_id uuid)
returns table (
  nadir_kg          numeric,
  current_weight_kg numeric,
  action_weight_kg  numeric,
  drift_percent     numeric,
  threshold_crossed boolean
)
language sql
stable
security invoker
as $$
  with weights as (
    select weight_kg, recorded_on
    from weight_entries
    where user_id = p_user_id
  ),
  bounds as (
    select
      (select min(weight_kg) from weights)                                as nadir,
      (select weight_kg from weights order by recorded_on desc limit 1)   as current
  )
  select
    nadir,
    current,
    round(nadir * 1.03, 1)                                       as action_weight_kg,
    case when nadir > 0
      then round(((current - nadir) / nadir) * 100, 1)
      else null
    end                                                          as drift_percent,
    case when nadir > 0
      then ((current - nadir) / nadir) * 100 >= 3
      else false
    end                                                          as threshold_crossed
  from bounds;
$$;

comment on function maintenance_status is
  'Drift against the 3%-above-lowest action threshold. Mirrors maintenanceStatus() in the client.';

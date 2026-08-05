-- =====================================================================
-- Helper functions, triggers and derived-value logic.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at    before update on profiles           for each row execute function set_updated_at();
create trigger settings_updated_at    before update on user_settings      for each row execute function set_updated_at();
create trigger appointments_updated_at before update on appointments      for each row execute function set_updated_at();
create trigger medications_updated_at before update on medications        for each row execute function set_updated_at();
create trigger reminders_updated_at   before update on reminder_schedules for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Provision a profile + settings row for every new auth user
-- (works for anonymous sign-ins too).
-- ---------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, mode, email, phone, display_name)
  values (
    new.id,
    case when new.is_anonymous then 'anonymous'::account_mode else 'patient'::account_mode end,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data ->> 'display_name', null)
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Is the current user a doctor, and is that doctor caring for `patient`?
-- ---------------------------------------------------------------------

create or replace function current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.doctors where auth_user_id = auth.uid() limit 1;
$$;

create or replace function is_caring_doctor(patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.care_relationships cr
    join public.doctors d on d.id = cr.doctor_id
    where cr.patient_id = patient
      and cr.ended_at is null
      and d.auth_user_id = auth.uid()
  )
  and coalesce(
    (select share_data_with_doctor from public.user_settings where user_id = patient),
    true
  );
$$;

-- ---------------------------------------------------------------------
-- BMI + Indian obesity classification (ICMR/NIN thresholds)
-- ---------------------------------------------------------------------

create or replace function calculate_bmi(height_cm numeric, weight_kg numeric)
returns numeric
language sql
immutable
as $$
  select case
    when height_cm is null or weight_kg is null or height_cm <= 0 then null
    else round(weight_kg / ((height_cm / 100.0) ^ 2), 1)
  end;
$$;

create or replace function bmi_category_indian(bmi numeric)
returns text
language sql
immutable
as $$
  select case
    when bmi is null       then null
    when bmi < 18.5        then 'underweight'
    when bmi < 23          then 'normal'
    when bmi < 25          then 'overweight'
    when bmi < 30          then 'obesity_class_1'
    when bmi < 35          then 'obesity_class_2'
    else                        'obesity_class_3'
  end;
$$;

-- ---------------------------------------------------------------------
-- Wellness score: 0-100 composite used by the treatment dashboard.
-- ---------------------------------------------------------------------

create or replace function compute_wellness_score(c check_ins)
returns int
language plpgsql
immutable
as $$
declare
  total    numeric := 0;
  weight   numeric := 0;
  severe   int;
begin
  if c.mood_score is not null then
    total := total + c.mood_score * 10 * 0.18; weight := weight + 0.18;
  end if;
  if c.energy_score is not null then
    total := total + c.energy_score * 10 * 0.15; weight := weight + 0.15;
  end if;
  if c.sleep_quality is not null then
    total := total + c.sleep_quality * 10 * 0.14; weight := weight + 0.14;
  end if;
  if c.stress_score is not null then
    total := total + (10 - c.stress_score) * 10 * 0.13; weight := weight + 0.13;
  end if;
  if c.nutrition_adherence is not null then
    total := total + c.nutrition_adherence * 0.15; weight := weight + 0.15;
  end if;
  if c.medication_adherence is not null then
    total := total + c.medication_adherence * 0.15; weight := weight + 0.15;
  end if;
  if c.exercise_minutes is not null then
    total := total + least(c.exercise_minutes / 150.0, 1) * 100 * 0.10; weight := weight + 0.10;
  end if;

  if weight = 0 then
    return null;
  end if;

  -- Side effects pull the score down; severe symptoms pull it down hard.
  select count(*) into severe
  from jsonb_array_elements(c.side_effects) e
  where e ->> 'severity' = 'severe';

  return greatest(
    0,
    least(100, round(total / weight) - (severe * 12) - (jsonb_array_length(c.side_effects) * 2))
  );
end;
$$;

create or replace function checkins_set_wellness()
returns trigger
language plpgsql
as $$
begin
  new.wellness_score := compute_wellness_score(new);
  return new;
end;
$$;

create trigger check_ins_wellness
  before insert or update on check_ins
  for each row execute function checkins_set_wellness();

-- ---------------------------------------------------------------------
-- Weight-loss milestone detection.
-- ---------------------------------------------------------------------

create or replace function detect_weight_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_kg numeric;
  pct      numeric;
  code     milestone_code;
begin
  select starting_weight_kg into start_kg from profiles where id = new.user_id;
  if start_kg is null or start_kg <= 0 then
    return new;
  end if;

  pct := ((start_kg - new.weight_kg) / start_kg) * 100.0;

  foreach code in array array[
    'weight_loss_20'::milestone_code,
    'weight_loss_15'::milestone_code,
    'weight_loss_10'::milestone_code,
    'weight_loss_5'::milestone_code
  ] loop
    if (code = 'weight_loss_20' and pct >= 20)
    or (code = 'weight_loss_15' and pct >= 15)
    or (code = 'weight_loss_10' and pct >= 10)
    or (code = 'weight_loss_5'  and pct >= 5) then
      insert into milestones (user_id, code, value)
      values (new.user_id, code, round(pct, 1))
      on conflict (user_id, code) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

create trigger weight_entries_milestones
  after insert or update on weight_entries
  for each row execute function detect_weight_milestones();

-- ---------------------------------------------------------------------
-- Medication adherence over a window (used by dashboards + the AI agent).
-- ---------------------------------------------------------------------

create or replace function medication_adherence(p_user uuid, p_days int default 28)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when count(*) = 0 then null
    else round(100.0 * count(*) filter (where status = 'taken') / count(*), 0)
  end
  from dose_events
  where user_id = p_user
    and scheduled_for >= now() - make_interval(days => p_days)
    and scheduled_for <= now();
$$;

-- ---------------------------------------------------------------------
-- Days of medicine left before a refill is required.
-- ---------------------------------------------------------------------

create or replace function refill_days_remaining(p_medication uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m           medications;
  per_week    numeric;
begin
  select * into m from medications where id = p_medication;
  if m is null or m.units_remaining is null then
    return null;
  end if;

  per_week := case m.frequency
    when 'weekly'       then 1
    when 'daily'        then 7
    when 'twice_daily'  then 14
    when 'thrice_daily' then 21
    else 0
  end;

  if per_week = 0 then
    return null;
  end if;

  return floor(m.units_remaining / (per_week / 7.0));
end;
$$;

-- ---------------------------------------------------------------------
-- Free appointment slots for a doctor on a given date.
-- ---------------------------------------------------------------------

create or replace function available_slots(p_doctor uuid, p_date date)
returns table (starts_at timestamptz, duration_minutes int, mode appointment_mode)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  av doctor_availability;
  cursor_ts timestamptz;
  end_ts    timestamptz;
begin
  for av in
    select * from doctor_availability
    where doctor_id = p_doctor
      and active
      and weekday = extract(dow from p_date)::int
  loop
    cursor_ts := (p_date + av.start_time) at time zone 'Asia/Kolkata';
    end_ts    := (p_date + av.end_time)   at time zone 'Asia/Kolkata';

    while cursor_ts + make_interval(mins => av.slot_minutes) <= end_ts loop
      if cursor_ts > now() and not exists (
        select 1 from appointments a
        where a.doctor_id = p_doctor
          and a.status in ('requested','confirmed','rescheduled')
          and a.scheduled_at = cursor_ts
      ) then
        starts_at := cursor_ts;
        duration_minutes := av.slot_minutes;
        mode := av.mode;
        return next;
      end if;
      cursor_ts := cursor_ts + make_interval(mins => av.slot_minutes);
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Book an appointment atomically (prevents double booking).
-- ---------------------------------------------------------------------

create or replace function book_appointment(
  p_doctor        uuid,
  p_scheduled_at  timestamptz,
  p_mode          appointment_mode default 'in_person',
  p_reason        text default null,
  p_duration      int default 20
)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  result appointments;
  taken  boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select exists (
    select 1 from appointments
    where doctor_id = p_doctor
      and scheduled_at = p_scheduled_at
      and status in ('requested','confirmed','rescheduled')
  ) into taken;

  if taken then
    raise exception 'slot_unavailable';
  end if;

  insert into appointments (user_id, doctor_id, hospital_id, scheduled_at, duration_minutes, mode, reason, status)
  values (
    auth.uid(),
    p_doctor,
    (select hospital_id from doctors where id = p_doctor),
    p_scheduled_at,
    p_duration,
    p_mode,
    p_reason,
    'confirmed'
  )
  returning * into result;

  insert into journey_events (user_id, type, title, description, occurred_at, stage, metadata)
  values (
    auth.uid(),
    'appointment',
    'Appointment booked',
    coalesce(p_reason, 'Consultation booked'),
    now(),
    coalesce((select stage from profiles where id = auth.uid()), 'awareness'),
    jsonb_build_object('appointment_id', result.id, 'doctor_id', p_doctor)
  );

  insert into reminder_schedules (user_id, category, reference_id, title, body, next_fire_at, channels)
  values (
    auth.uid(),
    'appointment',
    result.id,
    'Appointment reminder',
    'Your consultation is tomorrow.',
    p_scheduled_at - interval '24 hours',
    '{local,push}'
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- Materialise dose events for the next N days from a medication schedule.
-- Idempotent: re-running never duplicates rows.
-- ---------------------------------------------------------------------

create or replace function generate_dose_events(p_medication uuid, p_days int default 35)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m        medications;
  d        date;
  t        text;
  ts       timestamptz;
  created  int := 0;
begin
  select * into m from medications where id = p_medication;
  if m is null or not m.active then
    return 0;
  end if;

  d := greatest(m.start_date, current_date);
  while d <= least(coalesce(m.end_date, current_date + p_days), current_date + p_days) loop
    if m.frequency = 'as_needed' then
      exit;
    end if;

    if m.days_of_week is null
       or array_length(m.days_of_week, 1) is null
       or extract(dow from d)::int = any (m.days_of_week) then
      foreach t in array m.times_of_day loop
        ts := (d + t::time) at time zone 'Asia/Kolkata';
        if ts > now() - interval '1 day' then
          insert into dose_events (user_id, medication_id, scheduled_for, status)
          values (m.user_id, m.id, ts, 'scheduled')
          on conflict (medication_id, scheduled_for) do nothing;
          if found then created := created + 1; end if;
        end if;
      end loop;
    end if;

    d := d + 1;
  end loop;

  return created;
end;
$$;

-- Automatically materialise doses when a medication is created/updated.
create or replace function medications_generate_doses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform generate_dose_events(new.id, 35);
  return new;
end;
$$;

create trigger medications_after_write
  after insert or update of times_of_day, frequency, days_of_week, start_date, end_date, active
  on medications
  for each row execute function medications_generate_doses();

-- ---------------------------------------------------------------------
-- Mark overdue scheduled doses as missed (called by the reminder cron).
-- ---------------------------------------------------------------------

create or replace function expire_overdue_doses(p_grace_hours int default 12)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  update dose_events
  set status = 'missed'
  where status in ('scheduled','snoozed')
    and scheduled_for < now() - make_interval(hours => p_grace_hours);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ---------------------------------------------------------------------
-- Relapse risk for the vigilance stage.
-- ---------------------------------------------------------------------

create or replace function compute_relapse_risk(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  score        int := 0;
  signals      text[] := '{}';
  latest       check_ins;
  nadir        numeric;
  current_kg   numeric;
  regain_pct   numeric;
  days_since   int;
begin
  select * into latest from check_ins
  where user_id = p_user order by occurred_at desc limit 1;

  select min(weight_kg) into nadir from weight_entries where user_id = p_user;
  select weight_kg into current_kg from weight_entries
  where user_id = p_user order by recorded_on desc limit 1;

  if nadir is not null and current_kg is not null and nadir > 0 then
    regain_pct := ((current_kg - nadir) / nadir) * 100.0;
    if regain_pct >= 10 then
      score := score + 35; signals := signals || 'Weight is more than 10% above your lowest';
    elsif regain_pct >= 5 then
      score := score + 20; signals := signals || 'Weight is drifting up from your lowest';
    elsif regain_pct >= 3 then
      score := score + 10; signals := signals || 'Small upward weight drift';
    end if;
  end if;

  if latest is not null then
    if latest.craving_score is not null and latest.craving_score >= 7 then
      score := score + 15; signals := signals || 'Strong cravings reported';
    end if;
    if latest.mood_score is not null and latest.mood_score <= 3 then
      score := score + 15; signals := signals || 'Low mood reported';
    end if;
    if latest.stress_score is not null and latest.stress_score >= 7 then
      score := score + 10; signals := signals || 'High stress reported';
    end if;
    if latest.exercise_minutes is not null and latest.exercise_minutes < 60 then
      score := score + 10; signals := signals || 'Activity has dropped below 60 min/week';
    end if;
    if latest.confidence_score is not null and latest.confidence_score <= 4 then
      score := score + 10; signals := signals || 'Low confidence in maintaining progress';
    end if;
  end if;

  select coalesce(extract(day from now() - max(occurred_at))::int, 999)
  into days_since from check_ins where user_id = p_user;

  if days_since > 45 then
    score := score + 15; signals := signals || 'No check-in for over six weeks';
  end if;

  score := least(100, score);

  return jsonb_build_object(
    'score', score,
    'band', case when score >= 60 then 'high' when score >= 30 then 'moderate' else 'low' end,
    'signals', to_jsonb(signals),
    'recommendation', case
      when score >= 60 then 'Book a review with your doctor this week and restart daily logging.'
      when score >= 30 then 'Tighten the basics for two weeks: protein at every meal, 7,000 steps, weekly weigh-in.'
      else 'You are holding steady. Keep your weekly weigh-in and monthly check-in going.'
    end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Convenience view: patient snapshot consumed by the AI agent's context
-- builder in a single round trip.
-- ---------------------------------------------------------------------

create or replace view patient_snapshot
with (security_invoker = true)
as
select
  p.id                                                              as user_id,
  p.stage,
  p.language,
  p.display_name,
  p.height_cm,
  p.starting_weight_kg,
  p.target_weight_kg,
  p.comorbidities,
  p.contraindications,
  p.treatment_started_at,
  p.treatment_completed_at,
  calculate_bmi(p.height_cm, lw.weight_kg)                          as current_bmi,
  bmi_category_indian(calculate_bmi(p.height_cm, lw.weight_kg))     as bmi_category,
  lw.weight_kg                                                      as current_weight_kg,
  lw.recorded_on                                                    as weight_recorded_on,
  medication_adherence(p.id, 28)                                    as adherence_28d,
  (select count(*) from medications m where m.user_id = p.id and m.active) as active_medications,
  (select min(scheduled_for) from dose_events de
     where de.user_id = p.id and de.status = 'scheduled' and de.scheduled_for > now()) as next_dose_at,
  (select min(scheduled_at) from appointments a
     where a.user_id = p.id and a.status in ('confirmed','requested','rescheduled')
       and a.scheduled_at > now())                                  as next_appointment_at,
  (select max(occurred_at) from check_ins c where c.user_id = p.id) as last_checkin_at
from profiles p
left join lateral (
  select weight_kg, recorded_on from weight_entries w
  where w.user_id = p.id order by recorded_on desc limit 1
) lw on true;

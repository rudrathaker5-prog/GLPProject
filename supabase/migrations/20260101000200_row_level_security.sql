-- =====================================================================
-- Row level security.
--
-- Rules of the road:
--  * Patient data: readable/writable only by the owner, plus read (and in a
--    few cases write) access for a doctor with an active care relationship
--    where the patient has consented via user_settings.share_data_with_doctor.
--  * Reference/knowledge data: readable by everyone (including anonymous
--    sessions), writable only by the service role.
--  * The service role bypasses RLS entirely and is used by edge functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference data — public read
-- ---------------------------------------------------------------------

alter table hospitals        enable row level security;
alter table doctors          enable row level security;
alter table pharmacies       enable row level security;
alter table doctor_availability enable row level security;
alter table education_topics enable row level security;
alter table myth_cards       enable row level security;
alter table peer_groups      enable row level security;

create policy "hospitals are public"        on hospitals           for select using (true);
create policy "doctors are public"          on doctors             for select using (true);
create policy "pharmacies are public"       on pharmacies          for select using (true);
create policy "availability is public"      on doctor_availability for select using (true);
create policy "education is public"         on education_topics    for select using (true);
create policy "myths are public"            on myth_cards          for select using (true);
create policy "peer groups are public"      on peer_groups         for select using (true);

-- A doctor may maintain their own directory entry and availability.
create policy "doctor updates own record" on doctors
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "doctor manages availability" on doctor_availability
  for all using (doctor_id = current_doctor_id()) with check (doctor_id = current_doctor_id());

-- ---------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------

alter table profiles      enable row level security;
alter table user_settings enable row level security;

create policy "own profile read"   on profiles for select using (id = auth.uid() or is_caring_doctor(id));
create policy "own profile write"  on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile insert" on profiles for insert with check (id = auth.uid());

create policy "own settings read"   on user_settings for select using (user_id = auth.uid());
create policy "own settings write"  on user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings insert" on user_settings for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Care relationships
-- ---------------------------------------------------------------------

alter table care_relationships enable row level security;

create policy "care rel read" on care_relationships
  for select using (patient_id = auth.uid() or doctor_id = current_doctor_id());
create policy "care rel patient write" on care_relationships
  for all using (patient_id = auth.uid()) with check (patient_id = auth.uid());

-- ---------------------------------------------------------------------
-- Generic owner-only tables
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'weight_entries','nutrition_plans','nutrition_logs','journey_events','milestones',
    'reminder_schedules','notifications','push_tokens','device_connections',
    'health_samples','agent_memories','agent_actions','refill_requests','dose_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "owner all" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end
$$;

-- Doctors may read (not write) the clinical history of their patients.
do $$
declare
  t text;
begin
  foreach t in array array[
    'weight_entries','journey_events','milestones','dose_events','refill_requests','nutrition_plans'
  ] loop
    execute format(
      'create policy "caring doctor read" on %I for select using (is_caring_doctor(user_id))',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- Appointments — patient owns, doctor participates
-- ---------------------------------------------------------------------

alter table appointments enable row level security;

create policy "appointment read" on appointments
  for select using (user_id = auth.uid() or doctor_id = current_doctor_id());
create policy "appointment patient insert" on appointments
  for insert with check (user_id = auth.uid());
create policy "appointment patient update" on appointments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "appointment doctor update" on appointments
  for update using (doctor_id = current_doctor_id()) with check (doctor_id = current_doctor_id());

-- ---------------------------------------------------------------------
-- Prescriptions & medications
-- ---------------------------------------------------------------------

alter table prescriptions enable row level security;
alter table medications   enable row level security;

create policy "prescription owner" on prescriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prescription doctor read" on prescriptions
  for select using (is_caring_doctor(user_id) or doctor_id = current_doctor_id());

create policy "medication owner" on medications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "medication doctor read" on medications
  for select using (is_caring_doctor(user_id));

-- ---------------------------------------------------------------------
-- Check-ins — patient owns, doctor reads
-- ---------------------------------------------------------------------

alter table check_ins enable row level security;

create policy "checkin owner" on check_ins
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "checkin doctor read" on check_ins
  for select using (is_caring_doctor(user_id));

-- ---------------------------------------------------------------------
-- Doctor notes — doctor writes, patient reads
-- ---------------------------------------------------------------------

alter table doctor_notes enable row level security;

create policy "note patient read" on doctor_notes
  for select using (user_id = auth.uid());
create policy "note patient acknowledge" on doctor_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "note doctor manage" on doctor_notes
  for all using (doctor_id = current_doctor_id()) with check (doctor_id = current_doctor_id());

-- ---------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------

alter table conversations enable row level security;
alter table messages      enable row level security;

create policy "conversation owner" on conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "message owner" on messages
  for all
  using (
    exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- Peer support
-- ---------------------------------------------------------------------

alter table peer_memberships enable row level security;
alter table peer_posts       enable row level security;

create policy "membership owner" on peer_memberships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "posts readable by members" on peer_posts
  for select using (
    exists (
      select 1 from peer_memberships m
      where m.group_id = peer_posts.group_id and m.user_id = auth.uid()
    )
  );

create policy "members post" on peer_posts
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from peer_memberships m
      where m.group_id = peer_posts.group_id and m.user_id = auth.uid()
    )
  );

create policy "authors edit own posts" on peer_posts
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete own posts" on peer_posts
  for delete using (author_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage bucket for prescription images (private, owner scoped)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions', 'prescriptions', false, 10485760,
  array['image/jpeg','image/png','image/heic','application/pdf']
)
on conflict (id) do nothing;

create policy "prescription upload own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "prescription read own folder"
  on storage.objects for select
  using (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "prescription delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/**
 * Database types.
 *
 * Hand-maintained to match `supabase/migrations`. Regenerate any time the
 * schema changes:
 *
 *   npm run db:types      # supabase gen types typescript --local
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type AccountModeDb = 'anonymous' | 'guest' | 'patient' | 'doctor';
export type JourneyStageDb = 'awareness' | 'treatment' | 'vigilance';
export type LanguageCodeDb = 'en' | 'hi' | 'gu' | 'mr';
export type SexDb = 'male' | 'female' | 'other' | 'undisclosed';
export type AppointmentModeDb = 'in_person' | 'video' | 'phone';
export type AppointmentStatusDb =
  | 'requested'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'no_show';
export type MedicationFormDb = 'injection' | 'tablet' | 'capsule' | 'syrup' | 'other';
export type DoseFrequencyDb =
  | 'weekly'
  | 'daily'
  | 'twice_daily'
  | 'thrice_daily'
  | 'as_needed';
export type DoseStatusDb = 'scheduled' | 'taken' | 'missed' | 'skipped' | 'snoozed';
export type RefillChannelDb = 'hospital_pharmacy' | 'nearby_pharmacy' | 'home_delivery';
export type RefillStatusDb =
  | 'not_needed'
  | 'due_soon'
  | 'requested'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';
export type PrescriptionStatusDb = 'active' | 'expired' | 'superseded' | 'draft';
export type CheckinKindDb = 'passive' | 'weekly' | 'monthly' | 'vigilance' | 'triggered';
export type ChatRoleDb = 'system' | 'user' | 'assistant' | 'tool';
export type NotificationChannelDb = 'push' | 'local' | 'whatsapp' | 'sms' | 'email';
export type NotificationCategoryDb =
  | 'medication'
  | 'refill'
  | 'appointment'
  | 'checkin'
  | 'motivation'
  | 'milestone'
  | 'relapse'
  | 'doctor_note'
  | 'system';
export type HealthProviderDb = 'google_fit' | 'apple_health' | 'smart_scale' | 'wearable';
export type DeviceStatusDb = 'connected' | 'disconnected' | 'error' | 'unsupported';
export type WeightSourceDb = 'manual' | 'smart_scale' | 'health_kit' | 'google_fit' | 'clinic';
export type JourneyEventTypeDb =
  | 'diagnosis'
  | 'treatment_start'
  | 'dose_escalation'
  | 'appointment'
  | 'milestone'
  | 'achievement'
  | 'prescription'
  | 'phase_change'
  | 'relapse_alert'
  | 'treatment_complete';
export type MilestoneCodeDb =
  | 'weight_loss_5'
  | 'weight_loss_10'
  | 'weight_loss_15'
  | 'weight_loss_20'
  | 'adherence_streak_4w'
  | 'adherence_streak_12w'
  | 'exercise_streak_7d'
  | 'exercise_streak_30d'
  | 'nutrition_streak_7d'
  | 'nutrition_streak_30d'
  | 'checkin_streak_4w'
  | 'treatment_complete'
  | 'maintenance_6m'
  | 'maintenance_12m';

/** Turns a Row type into the Insert type: id/timestamps optional. */
type Insertable<T, Optional extends keyof T = never> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

export type ProfileRow = {
  id: string;
  mode: AccountModeDb;
  stage: JourneyStageDb;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  language: LanguageCodeDb;
  date_of_birth: string | null;
  sex: SexDb;
  height_cm: number | null;
  starting_weight_kg: number | null;
  target_weight_kg: number | null;
  waist_cm: number | null;
  comorbidities: string[];
  contraindications: string[];
  city: string | null;
  consented_at: string | null;
  onboarded_at: string | null;
  treatment_started_at: string | null;
  treatment_completed_at: string | null;
  primary_doctor_id: string | null;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

export type HospitalRow = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  has_obesity_clinic: boolean;
  has_pharmacy: boolean;
  created_at: string;
}

export type DoctorRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  speciality: string;
  qualifications: string;
  registration_number: string | null;
  hospital_id: string | null;
  city: string;
  languages: LanguageCodeDb[];
  consultation_fee: number | null;
  teleconsult_available: boolean;
  rating: number | null;
  years_experience: number | null;
  photo_url: string | null;
  phone: string | null;
  bio: string | null;
  accepting_patients: boolean;
  created_at: string;
}

export type PharmacyRow = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  supports_delivery: boolean;
  supports_cold_chain: boolean;
  hospital_id: string | null;
  created_at: string;
}

export type AppointmentRow = {
  id: string;
  user_id: string;
  doctor_id: string;
  hospital_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  mode: AppointmentModeDb;
  status: AppointmentStatusDb;
  reason: string | null;
  notes_for_doctor: string | null;
  meeting_url: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PrescriptionRow = {
  id: string;
  user_id: string;
  doctor_id: string | null;
  doctor_name: string | null;
  hospital_name: string | null;
  issued_on: string;
  valid_until: string | null;
  image_url: string | null;
  raw_text: string | null;
  extraction_confidence: number | null;
  status: PrescriptionStatusDb;
  created_at: string;
}

export type MedicationRow = {
  id: string;
  user_id: string;
  prescription_id: string | null;
  name: string;
  generic_name: string | null;
  form: MedicationFormDb;
  strength: string;
  dose_amount: number;
  dose_unit: string;
  frequency: DoseFrequencyDb;
  times_of_day: string[];
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  duration_days: number | null;
  instructions: string | null;
  storage_note: string | null;
  is_titration: boolean;
  titration_step: number | null;
  refill_threshold_days: number;
  units_remaining: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type DoseEventRow = {
  id: string;
  user_id: string;
  medication_id: string;
  scheduled_for: string;
  taken_at: string | null;
  status: DoseStatusDb;
  notes: string | null;
  notification_id: string | null;
  created_at: string;
}

export type RefillRequestRow = {
  id: string;
  user_id: string;
  medication_id: string;
  channel: RefillChannelDb;
  pharmacy_id: string | null;
  status: RefillStatusDb;
  requested_at: string;
  expected_by: string | null;
  address_line: string | null;
  notes: string | null;
}

export type WeightEntryRow = {
  id: string;
  user_id: string;
  recorded_on: string;
  weight_kg: number;
  waist_cm: number | null;
  source: WeightSourceDb;
  created_at: string;
}

export type CheckInRow = {
  id: string;
  user_id: string;
  kind: CheckinKindDb;
  occurred_at: string;
  weight_kg: number | null;
  mood_score: number | null;
  appetite_score: number | null;
  energy_score: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  stress_score: number | null;
  craving_score: number | null;
  water_litres: number | null;
  exercise_minutes: number | null;
  nutrition_adherence: number | null;
  medication_adherence: number | null;
  confidence_score: number | null;
  side_effects: Json;
  free_text: string | null;
  wellness_score: number | null;
  relapse_risk: Json;
  created_at: string;
}

export type NutritionPlanRow = {
  id: string;
  user_id: string;
  protein_target_g: number;
  calorie_target: number | null;
  water_target_litres: number;
  fibre_target_g: number;
  meal_guidance: Json;
  behaviour_goals: string[];
  notes: string | null;
  active: boolean;
  created_at: string;
}

export type NutritionLogRow = {
  id: string;
  user_id: string;
  logged_on: string;
  protein_g: number | null;
  water_litres: number | null;
  vegetable_servings: number | null;
  adherence_score: number | null;
  notes: string | null;
  created_at: string;
}

export type JourneyEventRow = {
  id: string;
  user_id: string;
  type: JourneyEventTypeDb;
  title: string;
  description: string | null;
  occurred_at: string;
  stage: JourneyStageDb;
  metadata: Json;
  created_at: string;
}

export type MilestoneRow = {
  id: string;
  user_id: string;
  code: MilestoneCodeDb;
  achieved_at: string;
  celebrated: boolean;
  value: number | null;
}

export type DoctorNoteRow = {
  id: string;
  user_id: string;
  doctor_id: string;
  appointment_id: string | null;
  clinical_text: string;
  patient_friendly_text: string | null;
  translated_text: Json;
  created_at: string;
  acknowledged_at: string | null;
}

export type ConversationRow = {
  id: string;
  user_id: string | null;
  stage: JourneyStageDb;
  title: string | null;
  summary: string | null;
  language: LanguageCodeDb;
  last_message_at: string;
  created_at: string;
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  role: ChatRoleDb;
  content: string;
  language: LanguageCodeDb | null;
  tool_name: string | null;
  tool_payload: Json;
  cards: Json;
  token_usage: number | null;
  created_at: string;
}

export type AgentMemoryRow = {
  id: string;
  user_id: string;
  kind: string;
  content: string;
  salience: number;
  expires_at: string | null;
  created_at: string;
}

export type ReminderScheduleRow = {
  id: string;
  user_id: string;
  category: NotificationCategoryDb;
  reference_id: string | null;
  title: string;
  body: string;
  next_fire_at: string;
  repeat_rule: Json;
  channels: NotificationChannelDb[];
  active: boolean;
  local_notification_ids: string[];
  created_at: string;
  updated_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategoryDb;
  title: string;
  body: string;
  channel: NotificationChannelDb;
  sent_at: string | null;
  read_at: string | null;
  deep_link: string | null;
  payload: Json;
  created_at: string;
}

export type UserSettingsRow = {
  user_id: string;
  language: LanguageCodeDb;
  theme: string;
  medication_reminders_enabled: boolean;
  refill_reminders_enabled: boolean;
  appointment_reminders_enabled: boolean;
  motivation_nudges_enabled: boolean;
  checkin_reminders_enabled: boolean;
  whatsapp_opt_in: boolean;
  whatsapp_number: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  share_data_with_doctor: boolean;
  large_text: boolean;
  reduce_motion: boolean;
  updated_at: string;
}

export type PeerGroupRow = {
  id: string;
  name: string;
  description: string;
  stage: string;
  language: LanguageCodeDb;
  member_count: number;
  is_moderated: boolean;
  created_at: string;
}

export type PeerPostRow = {
  id: string;
  group_id: string;
  author_id: string | null;
  author_alias: string;
  body: string;
  reaction_count: number;
  reply_count: number;
  flagged: boolean;
  created_at: string;
}

export type PeerMembershipRow = {
  id: string;
  group_id: string;
  user_id: string;
  alias: string;
  joined_at: string;
}

export type EducationTopicRow = {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string[];
  read_minutes: number;
  sources: string[];
  language: LanguageCodeDb;
  created_at: string;
}

export type MythCardRow = {
  id: string;
  myth: string;
  verdict: string;
  explanation: string;
  evidence: string;
  reassurance: string;
  tags: string[];
  language: LanguageCodeDb;
  created_at: string;
}

export type DeviceConnectionRow = {
  id: string;
  user_id: string;
  provider: HealthProviderDb;
  connected_at: string | null;
  last_sync_at: string | null;
  status: DeviceStatusDb;
  scopes: string[];
}

export type HealthSampleRow = {
  id: string;
  user_id: string;
  provider: HealthProviderDb;
  metric: string;
  value: number;
  recorded_at: string;
  created_at: string;
}

export type CareRelationshipRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  started_at: string;
  ended_at: string | null;
  is_primary: boolean;
}

export type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  device_id: string | null;
  created_at: string;
}

export type AgentActionRow = {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  tool_name: string;
  arguments: Json;
  result: Json;
  status: string;
  error: string | null;
  created_at: string;
}

export type PatientSnapshotRow = {
  user_id: string;
  stage: JourneyStageDb;
  language: LanguageCodeDb;
  display_name: string | null;
  height_cm: number | null;
  starting_weight_kg: number | null;
  target_weight_kg: number | null;
  comorbidities: string[];
  contraindications: string[];
  treatment_started_at: string | null;
  treatment_completed_at: string | null;
  current_bmi: number | null;
  bmi_category: string | null;
  current_weight_kg: number | null;
  weight_recorded_on: string | null;
  adherence_28d: number | null;
  active_medications: number | null;
  next_dose_at: string | null;
  next_appointment_at: string | null;
  last_checkin_at: string | null;
}

type TableDef<Row, OptionalOnInsert extends keyof Row = never> = {
  Row: Row;
  Insert: Insertable<Row, OptionalOnInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, Exclude<keyof ProfileRow, 'id'>>;
      user_settings: TableDef<UserSettingsRow, Exclude<keyof UserSettingsRow, 'user_id'>>;
      hospitals: TableDef<HospitalRow, 'id' | 'created_at'>;
      doctors: TableDef<DoctorRow, 'id' | 'created_at'>;
      pharmacies: TableDef<PharmacyRow, 'id' | 'created_at'>;
      care_relationships: TableDef<CareRelationshipRow, 'id' | 'started_at' | 'ended_at' | 'is_primary'>;
      appointments: TableDef<
        AppointmentRow,
        | 'id'
        | 'created_at'
        | 'updated_at'
        | 'hospital_id'
        | 'duration_minutes'
        | 'status'
        | 'reason'
        | 'notes_for_doctor'
        | 'meeting_url'
        | 'calendar_event_id'
      >;
      prescriptions: TableDef<PrescriptionRow, Exclude<keyof PrescriptionRow, 'user_id'>>;
      medications: TableDef<
        MedicationRow,
        Exclude<keyof MedicationRow, 'user_id' | 'name'>
      >;
      dose_events: TableDef<
        DoseEventRow,
        'id' | 'created_at' | 'taken_at' | 'status' | 'notes' | 'notification_id'
      >;
      refill_requests: TableDef<
        RefillRequestRow,
        'id' | 'requested_at' | 'status' | 'pharmacy_id' | 'expected_by' | 'address_line' | 'notes'
      >;
      weight_entries: TableDef<
        WeightEntryRow,
        'id' | 'created_at' | 'recorded_on' | 'waist_cm' | 'source'
      >;
      check_ins: TableDef<CheckInRow, Exclude<keyof CheckInRow, 'user_id'>>;
      nutrition_plans: TableDef<NutritionPlanRow, Exclude<keyof NutritionPlanRow, 'user_id'>>;
      nutrition_logs: TableDef<NutritionLogRow, Exclude<keyof NutritionLogRow, 'user_id'>>;
      journey_events: TableDef<
        JourneyEventRow,
        'id' | 'created_at' | 'occurred_at' | 'description' | 'metadata' | 'stage'
      >;
      milestones: TableDef<MilestoneRow, 'id' | 'achieved_at' | 'celebrated' | 'value'>;
      doctor_notes: TableDef<
        DoctorNoteRow,
        | 'id'
        | 'created_at'
        | 'appointment_id'
        | 'patient_friendly_text'
        | 'translated_text'
        | 'acknowledged_at'
      >;
      conversations: TableDef<ConversationRow, Exclude<keyof ConversationRow, 'user_id'>>;
      messages: TableDef<
        MessageRow,
        Exclude<keyof MessageRow, 'conversation_id' | 'role' | 'content'>
      >;
      agent_memories: TableDef<AgentMemoryRow, 'id' | 'created_at' | 'salience' | 'expires_at'>;
      agent_actions: TableDef<
        AgentActionRow,
        'id' | 'created_at' | 'result' | 'status' | 'error' | 'conversation_id' | 'user_id'
      >;
      reminder_schedules: TableDef<
        ReminderScheduleRow,
        Exclude<keyof ReminderScheduleRow, 'user_id' | 'category' | 'title' | 'body' | 'next_fire_at'>
      >;
      notifications: TableDef<
        NotificationRow,
        Exclude<keyof NotificationRow, 'user_id' | 'category' | 'title' | 'body'>
      >;
      push_tokens: TableDef<PushTokenRow, 'id' | 'created_at' | 'device_id'>;
      device_connections: TableDef<
        DeviceConnectionRow,
        'id' | 'connected_at' | 'last_sync_at' | 'status' | 'scopes'
      >;
      health_samples: TableDef<HealthSampleRow, 'id' | 'created_at'>;
      peer_groups: TableDef<PeerGroupRow, 'id' | 'created_at'>;
      peer_memberships: TableDef<PeerMembershipRow, 'id' | 'joined_at'>;
      peer_posts: TableDef<
        PeerPostRow,
        'id' | 'created_at' | 'reaction_count' | 'reply_count' | 'flagged' | 'author_id'
      >;
      education_topics: TableDef<EducationTopicRow, 'created_at' | 'language' | 'read_minutes' | 'sources'>;
      myth_cards: TableDef<MythCardRow, 'created_at' | 'language' | 'tags'>;
    };
    Views: {
      patient_snapshot: { Row: PatientSnapshotRow; Relationships: [] };
    };
    Functions: {
      book_appointment: {
        Args: {
          p_doctor: string;
          p_scheduled_at: string;
          p_mode?: AppointmentModeDb;
          p_reason?: string | null;
          p_duration?: number;
        };
        Returns: AppointmentRow;
      };
      available_slots: {
        Args: { p_doctor: string; p_date: string };
        Returns: { starts_at: string; duration_minutes: number; mode: AppointmentModeDb }[];
      };
      generate_dose_events: { Args: { p_medication: string; p_days?: number }; Returns: number };
      medication_adherence: { Args: { p_user: string; p_days?: number }; Returns: number | null };
      refill_days_remaining: { Args: { p_medication: string }; Returns: number | null };
      compute_relapse_risk: { Args: { p_user: string }; Returns: Json };
      expire_overdue_doses: { Args: { p_grace_hours?: number }; Returns: number };
      calculate_bmi: { Args: { height_cm: number; weight_kg: number }; Returns: number | null };
    };
    Enums: {
      account_mode: AccountModeDb;
      journey_stage: JourneyStageDb;
      language_code: LanguageCodeDb;
    };
    CompositeTypes: Record<string, never>;
  };
}

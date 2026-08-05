/**
 * Domain model for the GLP Care companion.
 *
 * These types mirror the Postgres schema in `supabase/migrations` and are the
 * contract between the repositories, the AI agent tools and the UI.
 */

// ---------------------------------------------------------------------------
// Identity & journey
// ---------------------------------------------------------------------------

export type AccountMode = 'anonymous' | 'guest' | 'patient' | 'doctor';

/** The three product stages described in the care model. */
export type JourneyStage = 'awareness' | 'treatment' | 'vigilance';

export type LanguageCode = 'en' | 'hi' | 'gu' | 'mr';

export type Sex = 'male' | 'female' | 'other' | 'undisclosed';

export interface UserProfile {
  id: string;
  mode: AccountMode;
  stage: JourneyStage;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  language: LanguageCode;
  dateOfBirth: string | null;
  sex: Sex;
  heightCm: number | null;
  startingWeightKg: number | null;
  targetWeightKg: number | null;
  waistCm: number | null;
  comorbidities: Comorbidity[];
  contraindications: Contraindication[];
  city: string | null;
  consentedAt: string | null;
  onboardedAt: string | null;
  treatmentStartedAt: string | null;
  treatmentCompletedAt: string | null;
  primaryDoctorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Comorbidity =
  | 'type2_diabetes'
  | 'prediabetes'
  | 'hypertension'
  | 'dyslipidaemia'
  | 'osa'
  | 'pcos'
  | 'nafld'
  | 'osteoarthritis'
  | 'cvd'
  | 'infertility'
  | 'none';

export type Contraindication =
  | 'pregnancy'
  | 'breastfeeding'
  | 'mtc_men2_history'
  | 'pancreatitis_history'
  | 'type1_diabetes'
  | 'severe_gi_disease'
  | 'active_eating_disorder'
  | 'none';

// ---------------------------------------------------------------------------
// Care team
// ---------------------------------------------------------------------------

export interface Hospital {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  hasObesityClinic: boolean;
  hasPharmacy: boolean;
}

export interface Doctor {
  id: string;
  fullName: string;
  speciality: string;
  qualifications: string;
  registrationNumber: string | null;
  hospitalId: string | null;
  hospital?: Hospital | null;
  city: string;
  languages: LanguageCode[];
  consultationFee: number | null;
  teleconsultAvailable: boolean;
  rating: number | null;
  yearsExperience: number | null;
  photoUrl: string | null;
  phone: string | null;
  bio: string | null;
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export type AppointmentMode = 'in_person' | 'video' | 'phone';
export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface Appointment {
  id: string;
  userId: string;
  doctorId: string;
  doctor?: Doctor | null;
  hospitalId: string | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: AppointmentMode;
  status: AppointmentStatus;
  reason: string | null;
  notesForDoctor: string | null;
  meetingUrl: string | null;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentSlot {
  doctorId: string;
  startsAt: string;
  durationMinutes: number;
  mode: AppointmentMode;
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

export type MedicationForm = 'injection' | 'tablet' | 'capsule' | 'syrup' | 'other';
export type DoseFrequency = 'weekly' | 'daily' | 'twice_daily' | 'thrice_daily' | 'as_needed';

export interface Prescription {
  id: string;
  userId: string;
  doctorId: string | null;
  doctorName: string | null;
  hospitalName: string | null;
  issuedOn: string;
  validUntil: string | null;
  imageUrl: string | null;
  rawText: string | null;
  extractionConfidence: number | null;
  status: 'active' | 'expired' | 'superseded' | 'draft';
  createdAt: string;
}

export interface MedicationItem {
  id: string;
  prescriptionId: string | null;
  userId: string;
  name: string;
  genericName: string | null;
  form: MedicationForm;
  strength: string;
  doseAmount: number;
  doseUnit: string;
  frequency: DoseFrequency;
  timesOfDay: string[];
  daysOfWeek: number[] | null;
  startDate: string;
  endDate: string | null;
  durationDays: number | null;
  instructions: string | null;
  storageNote: string | null;
  isTitration: boolean;
  titrationStep: number | null;
  refillThresholdDays: number;
  unitsRemaining: number | null;
  active: boolean;
}

export type DoseStatus = 'scheduled' | 'taken' | 'missed' | 'skipped' | 'snoozed';

export interface DoseEvent {
  id: string;
  userId: string;
  medicationId: string;
  scheduledFor: string;
  takenAt: string | null;
  status: DoseStatus;
  notes: string | null;
  notificationId: string | null;
}

export type RefillChannel = 'hospital_pharmacy' | 'nearby_pharmacy' | 'home_delivery';
export type RefillStatus =
  | 'not_needed'
  | 'due_soon'
  | 'requested'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface RefillRequest {
  id: string;
  userId: string;
  medicationId: string;
  channel: RefillChannel;
  pharmacyId: string | null;
  status: RefillStatus;
  requestedAt: string;
  expectedBy: string | null;
  addressLine: string | null;
  notes: string | null;
}

export interface Pharmacy {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  supportsDelivery: boolean;
  supportsColdChain: boolean;
  hospitalId: string | null;
}

// ---------------------------------------------------------------------------
// Tracking & wellness
// ---------------------------------------------------------------------------

export interface WeightEntry {
  id: string;
  userId: string;
  recordedOn: string;
  weightKg: number;
  waistCm: number | null;
  source: 'manual' | 'smart_scale' | 'health_kit' | 'google_fit' | 'clinic';
}

export type CheckInKind = 'passive' | 'weekly' | 'monthly' | 'vigilance' | 'triggered';

export interface CheckIn {
  id: string;
  userId: string;
  kind: CheckInKind;
  occurredAt: string;
  weightKg: number | null;
  moodScore: number | null;
  appetiteScore: number | null;
  energyScore: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  stressScore: number | null;
  cravingScore: number | null;
  waterLitres: number | null;
  exerciseMinutes: number | null;
  nutritionAdherence: number | null;
  medicationAdherence: number | null;
  confidenceScore: number | null;
  sideEffects: SideEffectReport[];
  freeText: string | null;
  wellnessScore: number | null;
  relapseRisk: RelapseRisk | null;
}

export type SideEffectCode =
  | 'nausea'
  | 'vomiting'
  | 'diarrhoea'
  | 'constipation'
  | 'bloating'
  | 'heartburn'
  | 'fatigue'
  | 'headache'
  | 'dizziness'
  | 'injection_site_reaction'
  | 'hair_thinning'
  | 'hypoglycaemia'
  | 'severe_abdominal_pain'
  | 'other';

export type SideEffectSeverity = 'mild' | 'moderate' | 'severe';

export interface SideEffectReport {
  code: SideEffectCode;
  severity: SideEffectSeverity;
  note?: string;
}

export interface WellnessScore {
  score: number;
  band: 'thriving' | 'steady' | 'needs_attention' | 'at_risk';
  drivers: { label: string; delta: number }[];
}

export interface RelapseRisk {
  score: number;
  band: 'low' | 'moderate' | 'high';
  signals: string[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export interface NutritionPlan {
  id: string;
  userId: string;
  createdAt: string;
  proteinTargetG: number;
  calorieTarget: number | null;
  waterTargetLitres: number;
  fibreTargetG: number;
  mealGuidance: MealGuidance[];
  behaviourGoals: string[];
  notes: string | null;
  active: boolean;
}

export interface MealGuidance {
  meal: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  guidance: string;
  examples: string[];
  proteinG: number;
}

export interface NutritionLog {
  id: string;
  userId: string;
  loggedOn: string;
  proteinG: number | null;
  waterLitres: number | null;
  vegetableServings: number | null;
  adherenceScore: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Journey, milestones, doctor notes
// ---------------------------------------------------------------------------

export type JourneyEventType =
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

export interface JourneyEvent {
  id: string;
  userId: string;
  type: JourneyEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  stage: JourneyStage;
  metadata: Record<string, unknown> | null;
}

export type MilestoneCode =
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

export interface Milestone {
  id: string;
  userId: string;
  code: MilestoneCode;
  achievedAt: string;
  celebrated: boolean;
  value: number | null;
}

export interface DoctorNote {
  id: string;
  userId: string;
  doctorId: string;
  doctorName: string | null;
  appointmentId: string | null;
  clinicalText: string;
  patientFriendlyText: string | null;
  translatedText: Partial<Record<LanguageCode, string>> | null;
  createdAt: string;
  acknowledgedAt: string | null;
}

// ---------------------------------------------------------------------------
// Conversation / AI
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  language: LanguageCode | null;
  toolName: string | null;
  toolPayload: Record<string, unknown> | null;
  cards: AgentCard[] | null;
  createdAt: string;
  pending?: boolean;
  error?: boolean;
}

export interface Conversation {
  id: string;
  userId: string | null;
  stage: JourneyStage;
  title: string | null;
  summary: string | null;
  language: LanguageCode;
  lastMessageAt: string;
  createdAt: string;
}

/** Structured UI attachments the agent can return alongside prose. */
export type AgentCard =
  | { kind: 'eligibility'; result: EligibilityResult }
  | { kind: 'doctor_list'; doctors: Doctor[] }
  | { kind: 'appointment'; appointment: Appointment }
  | { kind: 'myth'; myth: MythCard }
  | { kind: 'education'; topic: EducationTopic }
  | { kind: 'checkin_request'; fields: CheckInField[] }
  | { kind: 'wellness'; wellness: WellnessScore }
  | { kind: 'relapse'; risk: RelapseRisk }
  | { kind: 'medication_schedule'; medications: MedicationItem[] }
  | { kind: 'nutrition_plan'; plan: NutritionPlan }
  | { kind: 'action'; actions: AgentAction[] }
  | { kind: 'escalation'; severity: 'urgent' | 'routine'; message: string };

export interface AgentAction {
  id: string;
  label: string;
  intent:
    | 'open_eligibility'
    | 'open_doctors'
    | 'book_appointment'
    | 'open_education'
    | 'open_myths'
    | 'start_treatment'
    | 'log_weight'
    | 'log_checkin'
    | 'open_medication'
    | 'request_refill'
    | 'call_doctor'
    | 'open_nutrition'
    | 'open_journey';
  params?: Record<string, string | number>;
}

export type CheckInField =
  | 'weight'
  | 'mood'
  | 'appetite'
  | 'energy'
  | 'sleep'
  | 'side_effects'
  | 'exercise'
  | 'nutrition'
  | 'water'
  | 'stress'
  | 'cravings'
  | 'confidence';

// ---------------------------------------------------------------------------
// Eligibility & education
// ---------------------------------------------------------------------------

export type EligibilityVerdict =
  | 'likely_eligible'
  | 'possibly_eligible'
  | 'needs_consultation'
  | 'insufficient_information'
  | 'not_advisable';

export interface EligibilityInput {
  heightCm?: number | null;
  weightKg?: number | null;
  waistCm?: number | null;
  age?: number | null;
  sex?: Sex;
  comorbidities?: Comorbidity[];
  contraindications?: Contraindication[];
}

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  bmi: number | null;
  bmiCategoryIndian: string | null;
  waistFlag: boolean | null;
  reasons: string[];
  missing: string[];
  nextSteps: string[];
  guidelineRefs: string[];
  disclaimer: string;
}

export interface MythCard {
  id: string;
  myth: string;
  verdict: 'myth' | 'partly_true' | 'fact';
  explanation: string;
  evidence: string;
  reassurance: string;
  tags: string[];
}

export interface EducationTopic {
  id: string;
  title: string;
  category:
    | 'basics'
    | 'nutrition'
    | 'activity'
    | 'behaviour'
    | 'medical'
    | 'long_term'
    | 'safety';
  summary: string;
  body: string[];
  readMinutes: number;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Notifications & reminders
// ---------------------------------------------------------------------------

export type NotificationChannel = 'push' | 'local' | 'whatsapp' | 'sms' | 'email';

export type NotificationCategory =
  | 'medication'
  | 'refill'
  | 'appointment'
  | 'checkin'
  | 'motivation'
  | 'milestone'
  | 'relapse'
  | 'doctor_note'
  | 'system';

export interface ReminderSchedule {
  id: string;
  userId: string;
  category: NotificationCategory;
  referenceId: string | null;
  title: string;
  body: string;
  nextFireAt: string;
  repeatRule: RepeatRule | null;
  channels: NotificationChannel[];
  active: boolean;
  localNotificationIds: string[];
}

export interface RepeatRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'interval';
  interval?: number;
  weekday?: number;
  hour: number;
  minute: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  channel: NotificationChannel;
  sentAt: string | null;
  readAt: string | null;
  deepLink: string | null;
  payload: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Peer support
// ---------------------------------------------------------------------------

export interface PeerGroup {
  id: string;
  name: string;
  description: string;
  stage: JourneyStage | 'all';
  language: LanguageCode;
  memberCount: number;
  isModerated: boolean;
}

export interface PeerPost {
  id: string;
  groupId: string;
  authorAlias: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  reactionCount: number;
  replyCount: number;
  flagged: boolean;
}

// ---------------------------------------------------------------------------
// Devices / health integrations
// ---------------------------------------------------------------------------

export type HealthProvider = 'google_fit' | 'apple_health' | 'smart_scale' | 'wearable';

export interface HealthSample {
  provider: HealthProvider;
  metric: 'steps' | 'weight' | 'sleep_minutes' | 'heart_rate' | 'active_minutes';
  value: number;
  recordedAt: string;
}

export interface DeviceConnection {
  id: string;
  userId: string;
  provider: HealthProvider;
  connectedAt: string | null;
  lastSyncAt: string | null;
  status: 'connected' | 'disconnected' | 'error' | 'unsupported';
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface UserSettings {
  userId: string;
  language: LanguageCode;
  theme: 'system' | 'light' | 'dark';
  medicationRemindersEnabled: boolean;
  refillRemindersEnabled: boolean;
  appointmentRemindersEnabled: boolean;
  motivationNudgesEnabled: boolean;
  checkInRemindersEnabled: boolean;
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  shareDataWithDoctor: boolean;
  largeText: boolean;
  reduceMotion: boolean;
}

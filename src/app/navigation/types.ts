import type { NavigatorScreenParams } from '@react-navigation/native';

import type { EducationTopic, MythCard } from '@core/domain/types';

/**
 * Navigation model.
 *
 * The app has ONE permanent bottom tab bar with three tabs, always visible,
 * regardless of which stage the patient is in. Stage only decides which tab
 * opens first and how each tab presents itself.
 *
 * Every tab renders the same `AppStackParamList`, just with a different initial
 * route. That means a push from any tab (a doctor, an article, the coach) keeps
 * the tab bar on screen and keeps the back stack inside that tab — the
 * Instagram behaviour — without duplicating route definitions three times.
 */

/** Screens pushable inside any tab's stack. */
export type AppStackParamList = {
  // Tab roots
  AwarenessHome: undefined;
  JourneyHome: undefined;
  VigilanceHome: undefined;

  // Conversation
  Chat: { initialPrompt?: string } | undefined;

  // Awareness
  EligibilityChecker: undefined;
  Learn: undefined;
  EducationTopic: { topicId: string; topic?: EducationTopic };
  Myths: undefined;
  MythDetail: { mythId: string; myth?: MythCard };

  // Care team
  Doctors: { reason?: string } | undefined;
  DoctorDetail: { doctorId: string };
  BookAppointment: { doctorId: string; mode?: 'in_person' | 'video' | 'phone' };
  Appointments: undefined;
  AppointmentDetail: { appointmentId: string };

  // Treatment
  Medication: undefined;
  MedicationDetail: { medicationId: string };
  AddMedication: { prescriptionId?: string } | undefined;
  PrescriptionUpload: undefined;
  Refill: { medicationId?: string } | undefined;
  LogWeight: undefined;
  CheckIn: { kind?: 'passive' | 'weekly' | 'monthly' | 'vigilance' } | undefined;
  Progress: undefined;
  JourneyMap: undefined;
  Nutrition: undefined;
  DoctorNotes: undefined;
  DoctorNoteDetail: { noteId: string };
  PeerSupport: undefined;
  PeerGroup: { groupId: string };

  // Vigilance
  RelapsePlan: undefined;
  Achievements: undefined;

  // Account & settings
  Profile: undefined;
  Settings: undefined;
  AiSettings: undefined;
  Notifications: undefined;
  Devices: undefined;
  About: undefined;
};

export type MainTabParamList = {
  AwarenessTab: NavigatorScreenParams<AppStackParamList>;
  JourneyTab: NavigatorScreenParams<AppStackParamList>;
  VigilanceTab: NavigatorScreenParams<AppStackParamList>;
};

export type DoctorTabParamList = {
  Patients: undefined;
  DoctorAppointments: undefined;
  DoctorProfile: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  DoctorPortal: NavigatorScreenParams<DoctorTabParamList>;
  Onboarding: undefined;
  Auth: { mode?: 'sign_in' | 'sign_up' | 'doctor' } | undefined;
  /** Also in AppStack — registered here so the doctor portal can reach it. */
  About: undefined;
};

/**
 * Screens can be pushed inside a tab OR live on the root stack, so screen
 * components type their navigation prop against the union.
 */
export type AllParamList = AppStackParamList & RootStackParamList & MainTabParamList;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends AllParamList {}
  }
}

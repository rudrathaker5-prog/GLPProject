import type { NavigatorScreenParams } from '@react-navigation/native';

import type { EducationTopic, MythCard } from '@core/domain/types';

export type AwarenessTabParamList = {
  AwarenessHome: undefined;
  Learn: undefined;
  Myths: undefined;
  Doctors: { reason?: string } | undefined;
};

export type TreatmentTabParamList = {
  Dashboard: undefined;
  Coach: undefined;
  Journey: undefined;
  Nutrition: undefined;
  Profile: undefined;
};

export type VigilanceTabParamList = {
  VigilanceHome: undefined;
  Coach: undefined;
  Achievements: undefined;
  Profile: undefined;
};

export type DoctorTabParamList = {
  Patients: undefined;
  DoctorAppointments: undefined;
  DoctorProfile: undefined;
};

export type RootStackParamList = {
  Awareness: NavigatorScreenParams<AwarenessTabParamList>;
  Treatment: NavigatorScreenParams<TreatmentTabParamList>;
  Vigilance: NavigatorScreenParams<VigilanceTabParamList>;
  DoctorPortal: NavigatorScreenParams<DoctorTabParamList>;

  Chat: { initialPrompt?: string } | undefined;
  EligibilityChecker: undefined;
  EducationTopic: { topicId: string; topic?: EducationTopic };
  MythDetail: { mythId: string; myth?: MythCard };
  DoctorDetail: { doctorId: string };
  BookAppointment: { doctorId: string; mode?: 'in_person' | 'video' | 'phone' };
  AppointmentDetail: { appointmentId: string };
  Appointments: undefined;

  Onboarding: undefined;
  Auth: { mode?: 'sign_in' | 'sign_up' | 'doctor' } | undefined;

  Medication: undefined;
  MedicationDetail: { medicationId: string };
  AddMedication: { prescriptionId?: string } | undefined;
  PrescriptionUpload: undefined;
  Refill: { medicationId?: string } | undefined;

  LogWeight: undefined;
  CheckIn: { kind?: 'passive' | 'weekly' | 'monthly' | 'vigilance' } | undefined;
  Progress: undefined;
  DoctorNotes: undefined;
  DoctorNoteDetail: { noteId: string };
  PeerSupport: undefined;
  PeerGroup: { groupId: string };
  RelapsePlan: undefined;

  Settings: undefined;
  Notifications: undefined;
  Devices: undefined;
  About: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

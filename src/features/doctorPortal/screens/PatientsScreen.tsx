import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createDoctorNote } from '@features/doctorNotes/api/doctorNotesRepository';
import {
  getPatientDetail,
  listPatients,
  type PatientSummary,
} from '@features/doctorPortal/api/doctorPortalRepository';
import { useAuthStore } from '@features/auth/store/authStore';
import { WeightSparkline } from '@features/tracking/components/WeightSparkline';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Doctor portal — patient list and clinical detail.
 *
 * Writing a note here stores the clinical text verbatim and asks the AI service
 * for a patient-friendly translation, which the patient sees in their app with
 * a push notification.
 */
export function PatientsScreen() {
  const { theme } = useTheme();
  const doctorId = useAuthStore((s) => s.doctorId);
  const [selected, setSelected] = useState<PatientSummary | null>(null);

  const patients = useQuery({
    queryKey: ['doctorPatients'],
    queryFn: listPatients,
    enabled: Boolean(doctorId),
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['top']}>
      <Screen
        title="Patients"
        subtitle="Only patients who have an active relationship with you and have left sharing on."
        refreshing={patients.isRefetching}
        onRefresh={() => void patients.refetch()}
      >
        {patients.isLoading ? <LoadingState label="Loading your list…" /> : null}

        {patients.isError ? (
          <ErrorState
            message={
              patients.error instanceof Error
                ? patients.error.message
                : 'Could not load your patients.'
            }
            onRetry={() => void patients.refetch()}
          />
        ) : null}

        {patients.data && patients.data.length === 0 ? (
          <EmptyState
            title="No patients linked yet"
            message="Patients appear here once a care relationship is created — either when they book with you, or when your clinic links them."
          />
        ) : null}

        {(patients.data ?? []).map((patient) => (
          <Card key={patient.id} className="mb-3" onPress={() => setSelected(patient)}>
            <Row className="justify-between">
              <View className="flex-1 pr-2">
                <Text variant="subheading">{patient.displayName ?? 'Patient'}</Text>
                <Text variant="caption" className="mt-0.5 capitalize">
                  {patient.stage} stage
                </Text>
              </View>
              {patient.isPrimary ? <Badge label="Primary" tone="brand" /> : null}
            </Row>

            <Row className="mt-3 gap-2">
              <StatTile
                label="Weight"
                value={patient.currentWeightKg ?? '—'}
                unit="kg"
                tone="neutral"
              />
              <StatTile
                label="Lost"
                value={patient.percentLost ?? '—'}
                unit="%"
                tone={patient.percentLost && patient.percentLost >= 5 ? 'success' : 'neutral'}
              />
              <StatTile
                label="Adherence"
                value={patient.adherence28d ?? '—'}
                unit="%"
                tone={
                  patient.adherence28d !== null && patient.adherence28d >= 80 ? 'success' : 'warning'
                }
              />
            </Row>

            {patient.lastCheckInAt ? (
              <Text variant="caption" className="mt-3">
                Last check-in{' '}
                {new Date(patient.lastCheckInAt).toLocaleDateString('en-IN', {
                  dateStyle: 'medium',
                })}
              </Text>
            ) : (
              <Text variant="caption" className="mt-3">
                No check-ins recorded
              </Text>
            )}
          </Card>
        ))}
      </Screen>

      <PatientDetailSheet patient={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

function PatientDetailSheet({
  patient,
  onClose,
}: {
  patient: PatientSummary | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const doctorId = useAuthStore((s) => s.doctorId);
  const [note, setNote] = useState('');

  const detail = useQuery({
    queryKey: ['patientDetail', patient?.id],
    queryFn: () => getPatientDetail(patient!.id),
    enabled: Boolean(patient),
  });

  const saveNote = useMutation({
    mutationFn: () =>
      createDoctorNote({
        patientId: patient!.id,
        doctorId: doctorId!,
        clinicalText: note.trim(),
      }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['patientDetail', patient?.id] });
      Alert.alert(
        'Note sent',
        'The patient sees a plain-language version, with the original available underneath.',
      );
    },
    onError: (error) =>
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Try again.'),
  });

  return (
    <Modal visible={Boolean(patient)} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }}>
        <Row className="justify-between px-5 py-3">
          <Text variant="heading">{patient?.displayName ?? 'Patient'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>
            <Icon name="close" size={24} color={theme.textSoft} />
          </Pressable>
        </Row>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          {detail.isLoading ? <LoadingState /> : null}

          {detail.data ? (
            <>
              <Card>
                <Text variant="label">Weight trend</Text>
                <View className="mt-2">
                  <WeightSparkline
                    entries={detail.data.weights}
                    targetKg={patient?.targetWeightKg}
                    height={140}
                  />
                </View>
              </Card>

              <SectionTitle title="Active medication" />
              {detail.data.medications.length === 0 ? (
                <Text variant="body">None recorded.</Text>
              ) : (
                detail.data.medications.map((medication) => (
                  <Card key={medication.id} className="mb-2">
                    <Text variant="bodyStrong">
                      {medication.name} {medication.strength}
                    </Text>
                    <Text variant="caption" className="mt-0.5">
                      {medication.doseAmount} {medication.doseUnit} · {medication.frequency} ·{' '}
                      {medication.timesOfDay.join(', ')}
                    </Text>
                    {medication.instructions ? (
                      <Text variant="caption" className="mt-1">
                        {medication.instructions}
                      </Text>
                    ) : null}
                  </Card>
                ))
              )}

              <SectionTitle title="Recent check-ins" />
              {detail.data.checkIns.length === 0 ? (
                <Text variant="body">No check-ins recorded.</Text>
              ) : (
                detail.data.checkIns.slice(0, 5).map((checkIn) => (
                  <Card key={checkIn.id} className="mb-2">
                    <Row className="justify-between">
                      <Text variant="caption">
                        {new Date(checkIn.occurredAt).toLocaleDateString('en-IN', {
                          dateStyle: 'medium',
                        })}
                      </Text>
                      {checkIn.wellnessScore !== null ? (
                        <Badge
                          label={`Wellness ${checkIn.wellnessScore}`}
                          tone={checkIn.wellnessScore >= 55 ? 'success' : 'warning'}
                        />
                      ) : null}
                    </Row>
                    <Row className="mt-2 flex-wrap gap-2">
                      {checkIn.moodScore !== null ? (
                        <Badge label={`Mood ${checkIn.moodScore}`} tone="neutral" />
                      ) : null}
                      {checkIn.energyScore !== null ? (
                        <Badge label={`Energy ${checkIn.energyScore}`} tone="neutral" />
                      ) : null}
                      {checkIn.exerciseMinutes !== null ? (
                        <Badge label={`${checkIn.exerciseMinutes} min/wk`} tone="neutral" />
                      ) : null}
                    </Row>
                    {checkIn.sideEffects.length > 0 ? (
                      <Row className="mt-2 flex-wrap gap-2">
                        {checkIn.sideEffects.map((effect) => (
                          <Badge
                            key={effect.code}
                            label={`${effect.code} (${effect.severity})`}
                            tone={effect.severity === 'severe' ? 'danger' : 'warning'}
                          />
                        ))}
                      </Row>
                    ) : null}
                    {checkIn.freeText ? (
                      <Text variant="body" className="mt-2">
                        “{checkIn.freeText}”
                      </Text>
                    ) : null}
                  </Card>
                ))
              )}

              <SectionTitle title="Write a note" />
              <Card>
                <Field
                  label="Clinical note"
                  hint="Write it the way you normally would. The patient sees a plain-language version, and the original underneath."
                >
                  <Input
                    value={note}
                    onChangeText={setNote}
                    placeholder="e.g. Continue semaglutide 1mg weekly. Monitor GI tolerance. R/V 4 weeks with HbA1c."
                    multiline
                  />
                </Field>
                <Button
                  label="Send to patient"
                  fullWidth
                  disabled={note.trim().length < 10}
                  loading={saveNote.isPending}
                  onPress={() => saveNote.mutate()}
                />
              </Card>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

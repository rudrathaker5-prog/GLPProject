import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import type { Appointment } from '@core/domain/types';
import { useAuthStore } from '@features/auth/store/authStore';
import {
  listDoctorAppointments,
  setAppointmentStatus,
} from '@features/doctorPortal/api/doctorPortalRepository';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

export function DoctorAppointmentsScreen() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const doctorId = useAuthStore((s) => s.doctorId);

  const appointments = useQuery({
    queryKey: ['doctorAppointments'],
    queryFn: listDoctorAppointments,
    enabled: Boolean(doctorId),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Appointment['status'] }) =>
      setAppointmentStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['doctorAppointments'] }),
  });

  const now = Date.now();
  const upcoming = (appointments.data ?? []).filter(
    (a) => new Date(a.scheduledAt).getTime() >= now && a.status !== 'cancelled',
  );
  const past = (appointments.data ?? []).filter(
    (a) => new Date(a.scheduledAt).getTime() < now || a.status === 'cancelled',
  );

  return (
    <Screen
      title="Schedule"
      subtitle="Your clinic list for the coming days."
      refreshing={appointments.isRefetching}
      onRefresh={() => void appointments.refetch()}
    >
      {appointments.isLoading ? <LoadingState /> : null}

      {appointments.isError ? (
        <ErrorState
          message={
            appointments.error instanceof Error
              ? appointments.error.message
              : 'Could not load your schedule.'
          }
          onRetry={() => void appointments.refetch()}
        />
      ) : null}

      <SectionTitle title="Upcoming" />
      {upcoming.length === 0 && !appointments.isLoading ? (
        <EmptyState title="Nothing booked" message="New bookings appear here immediately." />
      ) : null}

      {upcoming.map((appointment) => (
        <Card key={appointment.id} className="mb-3">
          <Row className="justify-between">
            <View className="flex-1 pr-2">
              <Text variant="subheading">
                {new Date(appointment.scheduledAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
              <Row className="mt-1">
                <Icon
                  name={
                    appointment.mode === 'video'
                      ? 'video'
                      : appointment.mode === 'phone'
                        ? 'phone'
                        : 'map'
                  }
                  size={14}
                  color={theme.textMuted}
                />
                <Text variant="caption" className="ml-1.5 capitalize">
                  {appointment.mode.replace('_', ' ')} · {appointment.durationMinutes} min
                </Text>
              </Row>
            </View>
            <Badge
              label={appointment.status}
              tone={appointment.status === 'confirmed' ? 'success' : 'brand'}
            />
          </Row>

          {appointment.reason ? (
            <View className="mt-3 rounded-2xl bg-surface-sunken p-3 dark:bg-dark-surface-sunken">
              <Text variant="caption">Patient wants to discuss</Text>
              <Text variant="body" className="mt-1">
                {appointment.reason}
              </Text>
            </View>
          ) : null}

          {appointment.notesForDoctor ? (
            <Text variant="caption" className="mt-2">
              Note: {appointment.notesForDoctor}
            </Text>
          ) : null}

          <Row className="mt-3 gap-2">
            <View className="flex-1">
              <Button
                label="Mark completed"
                size="sm"
                fullWidth
                loading={update.isPending}
                onPress={() => update.mutate({ id: appointment.id, status: 'completed' })}
              />
            </View>
            <Button
              label="No show"
              size="sm"
              variant="ghost"
              onPress={() => update.mutate({ id: appointment.id, status: 'no_show' })}
            />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              onPress={() => update.mutate({ id: appointment.id, status: 'cancelled' })}
            />
          </Row>
        </Card>
      ))}

      {past.length > 0 ? (
        <>
          <SectionTitle title="Recent" />
          {past.slice(0, 10).map((appointment) => (
            <Card key={appointment.id} className="mb-2 opacity-70">
              <Row className="justify-between">
                <Text variant="body">
                  {new Date(appointment.scheduledAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
                <Badge
                  label={appointment.status}
                  tone={
                    appointment.status === 'completed'
                      ? 'success'
                      : appointment.status === 'cancelled' || appointment.status === 'no_show'
                        ? 'danger'
                        : 'neutral'
                  }
                />
              </Row>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

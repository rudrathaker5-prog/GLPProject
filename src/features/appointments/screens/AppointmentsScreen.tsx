import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { Appointment } from '@core/domain/types';
import { isUpcoming, listAppointments } from '@features/appointments/api/appointmentsRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

export function AppointmentsScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  const query = useQuery({ queryKey: ['appointments'], queryFn: listAppointments });

  const upcoming = (query.data ?? []).filter(isUpcoming);
  const past = (query.data ?? []).filter((a) => !isUpcoming(a));

  return (
    <Screen
      title={t('appointments.title')}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isLoading ? <LoadingState /> : null}

      <SectionTitle title={t('appointments.upcoming')} />
      {upcoming.length === 0 && !query.isLoading ? (
        <EmptyState
          title={t('appointments.noneUpcoming')}
          message="Book a consultation whenever you are ready. Reminders are set automatically."
          action={
            <Button
              label="Find a doctor"
              onPress={() => navigation.navigate('Doctors')}
            />
          }
        />
      ) : null}

      {upcoming.map((appointment) => (
        <AppointmentCard key={appointment.id} appointment={appointment} />
      ))}

      {past.length > 0 ? (
        <>
          <SectionTitle title={t('appointments.past')} />
          {past.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} past />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

export function AppointmentCard({
  appointment,
  past = false,
}: {
  appointment: Appointment;
  past?: boolean;
}) {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const when = new Date(appointment.scheduledAt);

  return (
    <Card
      className={`mb-3 ${past ? 'opacity-70' : ''}`}
      onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: appointment.id })}
    >
      <Row className="justify-between">
        <View className="flex-1 pr-3">
          <Text variant="subheading">{appointment.doctor?.fullName ?? 'Consultation'}</Text>
          <Text variant="caption" className="mt-0.5">
            {appointment.doctor?.speciality ?? ''}
          </Text>
        </View>
        <Badge label={statusLabel(appointment.status)} tone={statusTone(appointment.status)} />
      </Row>

      <Row className="mt-3">
        <Icon name="calendar" size={16} color={theme.textMuted} />
        <Text variant="body" className="ml-2">
          {when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </Text>
      </Row>

      <Row className="mt-1">
        <Icon
          name={appointment.mode === 'video' ? 'video' : appointment.mode === 'phone' ? 'phone' : 'map'}
          size={16}
          color={theme.textMuted}
        />
        <Text variant="caption" className="ml-2 capitalize">
          {appointment.mode.replace('_', ' ')}
        </Text>
      </Row>

      {appointment.reason ? (
        <Text variant="caption" className="mt-2" numberOfLines={2}>
          {appointment.reason}
        </Text>
      ) : null}
    </Card>
  );
}

function statusLabel(status: Appointment['status']): string {
  return {
    requested: 'Requested',
    confirmed: 'Confirmed',
    rescheduled: 'Rescheduled',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'Missed',
  }[status];
}

function statusTone(status: Appointment['status']): 'brand' | 'success' | 'danger' | 'neutral' {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return 'success';
    case 'cancelled':
    case 'no_show':
      return 'danger';
    case 'requested':
    case 'rescheduled':
      return 'brand';
    default:
      return 'neutral';
  }
}

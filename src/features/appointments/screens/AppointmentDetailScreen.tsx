import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import {
  attachCalendarEvent,
  getAppointment,
  isUpcoming,
  updateAppointmentStatus,
} from '@features/appointments/api/appointmentsRepository';
import { addAppointmentToCalendar } from '@integrations/calendar/calendarAdapter';
import {
  callNumber,
  joinConsultation,
  openDirections,
} from '@integrations/communication/communicationAdapter';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, EmptyState, LoadingState, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'AppointmentDetail'>;

export function AppointmentDetailScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['appointment', route.params.appointmentId],
    queryFn: () => getAppointment(route.params.appointmentId),
  });

  const cancel = useMutation({
    mutationFn: () => updateAppointmentStatus(route.params.appointmentId, 'cancelled'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void query.refetch();
    },
  });

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const appointment = query.data;
  if (!appointment) {
    return (
      <Screen>
        <EmptyState
          title="Appointment not found"
          message="It may have been cancelled."
          action={<Button label="Back" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  const when = new Date(appointment.scheduledAt);
  const active = isUpcoming(appointment);

  const confirmCancel = () => {
    Alert.alert(
      t('appointments.cancel'),
      'Your reminders for this appointment will be removed.',
      [
        { text: t('common.notNow'), style: 'cancel' },
        { text: t('appointments.cancel'), style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  };

  const addToCalendar = async () => {
    const eventId = await addAppointmentToCalendar(
      appointment,
      appointment.doctor?.fullName ?? 'Doctor',
      appointment.doctor?.hospital?.address,
    );
    if (eventId) {
      await attachCalendarEvent(appointment.id, eventId);
      Alert.alert('Added to calendar', 'With alerts a day and an hour before.');
    } else {
      Alert.alert('Could not add', 'Calendar permission was not granted.');
    }
  };

  const join = async () => {
    const result = await joinConsultation(appointment);
    if (!result.joined) Alert.alert('Video consultation', result.reason ?? 'Not available yet.');
  };

  return (
    <Screen>
      <Row className="justify-between">
        <View className="flex-1 pr-3">
          <Text variant="title">{appointment.doctor?.fullName ?? 'Consultation'}</Text>
          <Text variant="body" className="mt-1">
            {appointment.doctor?.speciality ?? ''}
          </Text>
        </View>
        <Badge
          label={appointment.status}
          tone={appointment.status === 'cancelled' ? 'danger' : 'success'}
        />
      </Row>

      <Card className="mt-4">
        <Row>
          <Icon name="calendar" size={18} color={theme.primary} />
          <View className="ml-3 flex-1">
            <Text variant="bodyStrong">
              {when.toLocaleDateString('en-IN', { dateStyle: 'full' })}
            </Text>
            <Text variant="body">
              {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ·{' '}
              {appointment.durationMinutes} min
            </Text>
          </View>
        </Row>

        <Row className="mt-4">
          <Icon
            name={appointment.mode === 'video' ? 'video' : appointment.mode === 'phone' ? 'phone' : 'map'}
            size={18}
            color={theme.primary}
          />
          <View className="ml-3 flex-1">
            <Text variant="caption">Consultation type</Text>
            <Text variant="body" className="capitalize">
              {appointment.mode.replace('_', ' ')}
            </Text>
          </View>
        </Row>

        {appointment.doctor?.hospital ? (
          <Row className="mt-4">
            <Icon name="map" size={18} color={theme.primary} />
            <View className="ml-3 flex-1">
              <Text variant="caption">Where</Text>
              <Text variant="body">{appointment.doctor.hospital.name}</Text>
              <Text variant="caption">{appointment.doctor.hospital.address}</Text>
            </View>
          </Row>
        ) : null}
      </Card>

      {appointment.reason ? (
        <Card className="mt-3">
          <Text variant="label">What you want to discuss</Text>
          <Text variant="body" className="mt-1">
            {appointment.reason}
          </Text>
        </Card>
      ) : null}

      <Card className="mt-3">
        <Text variant="label">Before you go</Text>
        <Text variant="body" className="mt-1">
          • Recent blood reports, if you have them{'\n'}• A list of every medicine and supplement you
          take{'\n'}• Your weight history and what you have already tried{'\n'}• Any family history of
          diabetes, thyroid cancer or MEN2
        </Text>
      </Card>

      {active ? (
        <View className="mt-5 gap-2">
          {appointment.mode === 'video' ? (
            <Button label={t('appointments.join')} fullWidth size="lg" onPress={() => void join()} />
          ) : null}
          {appointment.doctor?.phone ? (
            <Button
              label="Call the clinic"
              variant="secondary"
              fullWidth
              onPress={() => void callNumber(appointment.doctor?.phone)}
            />
          ) : null}
          {appointment.doctor?.hospital ? (
            <Button
              label="Get directions"
              variant="secondary"
              fullWidth
              onPress={() => void openDirections(appointment.doctor!.hospital!)}
            />
          ) : null}
          <Button
            label={t('appointments.addToCalendar')}
            variant="ghost"
            fullWidth
            onPress={() => void addToCalendar()}
          />
          <Button
            label={t('appointments.reschedule')}
            variant="ghost"
            fullWidth
            onPress={() =>
              navigation.navigate('BookAppointment', {
                doctorId: appointment.doctorId,
                mode: appointment.mode,
              })
            }
          />
          <Button
            label={t('appointments.cancel')}
            variant="ghost"
            fullWidth
            loading={cancel.isPending}
            onPress={confirmCancel}
          />
        </View>
      ) : null}
    </Screen>
  );
}

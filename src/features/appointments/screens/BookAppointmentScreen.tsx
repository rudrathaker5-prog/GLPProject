import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import type { AppointmentMode } from '@core/domain/types';
import {
  attachCalendarEvent,
  bookAppointment,
  SlotUnavailableError,
} from '@features/appointments/api/appointmentsRepository';
import { getDoctor, listSlots } from '@features/doctors/api/doctorsRepository';
import { addAppointmentToCalendar } from '@integrations/calendar/calendarAdapter';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Row,
  Screen,
  Text,
} from '@ui/components';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'BookAppointment'>;

const DAYS_AHEAD = 14;

export function BookAppointmentScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [mode, setMode] = useState<AppointmentMode>(route.params.mode ?? 'in_person');
  const [reason, setReason] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const doctorQuery = useQuery({
    queryKey: ['doctor', route.params.doctorId],
    queryFn: () => getDoctor(route.params.doctorId),
  });

  const slotsQuery = useQuery({
    queryKey: ['slots', route.params.doctorId, selectedDate.toDateString()],
    queryFn: () => listSlots(route.params.doctorId, selectedDate),
  });

  const booking = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error('Pick a time first');
      const appointment = await bookAppointment({
        doctorId: route.params.doctorId,
        scheduledAt: selectedSlot,
        mode,
        reason: reason.trim() || null,
      });

      // Best-effort calendar write; booking already succeeded.
      const eventId = await addAppointmentToCalendar(
        appointment,
        doctorQuery.data?.fullName ?? 'Doctor',
        doctorQuery.data?.hospital?.address,
      );
      if (eventId) await attachCalendarEvent(appointment.id, eventId);

      return appointment;
    },
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      Alert.alert(
        'Appointment confirmed',
        `${new Date(appointment.scheduledAt).toLocaleString('en-IN', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}\n\nReminders are set for 24 hours and 1 hour before.`,
        [
          {
            text: 'View appointment',
            onPress: () =>
              navigation.replace('AppointmentDetail', { appointmentId: appointment.id }),
          },
        ],
      );
    },
    onError: (error) => {
      if (error instanceof SlotUnavailableError) {
        void slotsQuery.refetch();
        setSelectedSlot(null);
        Alert.alert('Slot taken', error.message);
        return;
      }
      Alert.alert('Could not book', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const dates = Array.from({ length: DAYS_AHEAD }, (_, index) => {
    const date = startOfDay(new Date());
    date.setDate(date.getDate() + index);
    return date;
  });

  const slots = (slotsQuery.data ?? []).filter((slot) => slot.mode === mode);

  if (doctorQuery.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const doctor = doctorQuery.data;

  return (
    <Screen
      title={t('appointments.book')}
      subtitle={doctor ? `${doctor.fullName} · ${doctor.speciality}` : undefined}
    >
      <Card>
        <Text variant="label" className="mb-2">
          Consultation type
        </Text>
        <Row className="flex-wrap">
          <Chip
            label={t('appointments.inPerson')}
            selected={mode === 'in_person'}
            onPress={() => {
              setMode('in_person');
              setSelectedSlot(null);
            }}
          />
          <Chip
            label={t('appointments.teleconsult')}
            selected={mode === 'video'}
            disabled={!doctor?.teleconsultAvailable}
            onPress={() => {
              setMode('video');
              setSelectedSlot(null);
            }}
          />
        </Row>
      </Card>

      <Text variant="heading" className="mb-2 mt-6">
        Pick a day
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
        {dates.map((date) => {
          const selected = date.toDateString() === selectedDate.toDateString();
          return (
            <Pressable
              key={date.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setSelectedDate(date);
                setSelectedSlot(null);
              }}
              className={`mx-1 items-center rounded-2xl border px-4 py-3 ${
                selected
                  ? 'border-brand-600 bg-brand-600'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-dark-surface-raised'
              }`}
            >
              <Text variant="caption" className={selected ? 'text-white/80' : ''}>
                {date.toLocaleDateString('en-IN', { weekday: 'short' })}
              </Text>
              <Text variant="bodyStrong" className={selected ? 'text-white' : ''}>
                {date.getDate()}
              </Text>
              <Text variant="caption" className={selected ? 'text-white/80' : ''}>
                {date.toLocaleDateString('en-IN', { month: 'short' })}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text variant="heading" className="mb-2 mt-6">
        Pick a time
      </Text>

      {slotsQuery.isLoading ? <LoadingState label="Checking availability…" /> : null}

      {!slotsQuery.isLoading && slots.length === 0 ? (
        <EmptyState
          title="No free slots that day"
          message={
            mode === 'video'
              ? 'Video clinics usually run on weekday evenings. Try another day or switch to in person.'
              : 'Try another day — clinics usually run Monday to Saturday mornings.'
          }
        />
      ) : null}

      <View className="mt-1 flex-row flex-wrap">
        {slots.map((slot) => {
          const selected = selectedSlot === slot.startsAt;
          return (
            <Pressable
              key={slot.startsAt}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedSlot(slot.startsAt)}
              className={`mb-2 mr-2 rounded-pill border px-4 py-2.5 ${
                selected
                  ? 'border-brand-600 bg-brand-600'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-dark-surface-raised'
              }`}
            >
              <Text variant="label" className={selected ? 'text-white' : ''}>
                {new Date(slot.startsAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4">
        <Field
          label="What would you like to discuss?"
          hint="Optional — it helps the doctor prepare."
        >
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. I want to understand if medication is right for me"
            multiline
          />
        </Field>
      </View>

      {selectedSlot ? (
        <Card className="mb-4 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <Text variant="label">You are booking</Text>
          <Text variant="bodyStrong" className="mt-1">
            {new Date(selectedSlot).toLocaleString('en-IN', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}
          </Text>
          <Row className="mt-2 gap-2">
            <Badge label={mode === 'video' ? 'Video' : 'In person'} tone="brand" />
            {doctor?.consultationFee ? (
              <Badge label={`₹${doctor.consultationFee}`} tone="neutral" />
            ) : null}
          </Row>
        </Card>
      ) : null}

      <Button
        label={t('appointments.book')}
        fullWidth
        size="lg"
        disabled={!selectedSlot}
        loading={booking.isPending}
        onPress={() => booking.mutate()}
      />

      <Text variant="caption" className="mt-3 text-center">
        Booking creates an account for you automatically so your appointment, reminders and notes
        stay linked. You can add an email or phone later.
      </Text>
    </Screen>
  );
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import type { Appointment } from '@core/domain/types';

/**
 * Device calendar integration. Fully implemented — appointments are written to
 * the user's real calendar so reminders survive the app being uninstalled.
 */

const CALENDAR_TITLE = 'GLP Care';

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getOrCreateCalendar(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  const existing = calendars.find((c) => c.title === CALENDAR_TITLE);
  if (existing) return existing.id;

  const writable = calendars.find(
    (c) => c.allowsModifications && c.accessLevel === Calendar.CalendarAccessLevel.OWNER,
  );

  try {
    if (Platform.OS === 'ios') {
      const defaultSource = await Calendar.getDefaultCalendarAsync();
      return Calendar.createCalendarAsync({
        title: CALENDAR_TITLE,
        color: '#1a63dd',
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: defaultSource.source.id,
        source: defaultSource.source,
        name: CALENDAR_TITLE,
        ownerAccount: 'personal',
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
    }

    return Calendar.createCalendarAsync({
      title: CALENDAR_TITLE,
      color: '#1a63dd',
      entityType: Calendar.EntityTypes.EVENT,
      name: CALENDAR_TITLE,
      ownerAccount: writable?.ownerAccount ?? 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
      source: writable?.source ?? {
        isLocalAccount: true,
        name: CALENDAR_TITLE,
        type: Calendar.SourceType.LOCAL,
      },
    });
  } catch (error) {
    console.warn('calendar creation failed, falling back to default', error);
    return writable?.id ?? null;
  }
}

export async function addAppointmentToCalendar(
  appointment: Appointment,
  doctorName: string,
  location?: string,
): Promise<string | null> {
  if (!(await requestCalendarPermission())) return null;

  const calendarId = await getOrCreateCalendar();
  if (!calendarId) return null;

  const start = new Date(appointment.scheduledAt);
  const end = new Date(start.getTime() + appointment.durationMinutes * 60_000);

  try {
    return await Calendar.createEventAsync(calendarId, {
      title: `Consultation — ${doctorName}`,
      startDate: start,
      endDate: end,
      location: location ?? undefined,
      notes: appointment.reason ?? 'Obesity care consultation booked through GLP Care.',
      alarms: [{ relativeOffset: -60 }, { relativeOffset: -24 * 60 }],
      timeZone: 'Asia/Kolkata',
    });
  } catch (error) {
    console.warn('calendar event creation failed', error);
    return null;
  }
}

export async function removeCalendarEvent(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    // The user may have deleted it manually; nothing to do.
  }
}

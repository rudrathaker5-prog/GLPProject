import type { AppointmentSlot, Doctor, Hospital, LanguageCode } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { DoctorRow, HospitalRow } from '@core/supabase/database.types';

import { FALLBACK_DOCTORS, FALLBACK_HOSPITALS } from './fallbackDirectory';

/**
 * Care-team directory.
 *
 * Falls back to a bundled directory when no backend is configured so the
 * "Talk to a doctor" journey is complete on a fresh install. The bundled list is
 * clearly marked in the UI as the offline directory.
 */

function toHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    hasObesityClinic: row.has_obesity_clinic,
    hasPharmacy: row.has_pharmacy,
  };
}

function toDoctor(row: DoctorRow & { hospital?: HospitalRow | null }): Doctor {
  return {
    id: row.id,
    fullName: row.full_name,
    speciality: row.speciality,
    qualifications: row.qualifications,
    registrationNumber: row.registration_number,
    hospitalId: row.hospital_id,
    hospital: row.hospital ? toHospital(row.hospital) : null,
    city: row.city,
    languages: (row.languages ?? ['en']) as LanguageCode[],
    consultationFee: row.consultation_fee,
    teleconsultAvailable: row.teleconsult_available,
    rating: row.rating,
    yearsExperience: row.years_experience,
    photoUrl: row.photo_url,
    phone: row.phone,
    bio: row.bio,
  };
}

export interface DoctorFilters {
  city?: string;
  language?: LanguageCode;
  teleconsultOnly?: boolean;
  search?: string;
}

export async function listDoctors(filters: DoctorFilters = {}): Promise<{
  doctors: Doctor[];
  offline: boolean;
}> {
  if (supabase) {
    let query = supabase
      .from('doctors')
      .select('*, hospital:hospitals(*)')
      .eq('accepting_patients', true)
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(50);

    if (filters.city) query = query.ilike('city', `%${filters.city}%`);
    if (filters.teleconsultOnly) query = query.eq('teleconsult_available', true);
    if (filters.search) query = query.ilike('full_name', `%${filters.search}%`);

    const { data, error } = await query;
    if (!error && data) {
      const doctors = (data as unknown as (DoctorRow & { hospital?: HospitalRow | null })[]).map(
        toDoctor,
      );
      const filtered = filters.language
        ? doctors.filter((d) => d.languages.includes(filters.language!))
        : doctors;
      return { doctors: filtered, offline: false };
    }
  }

  return { doctors: filterFallback(filters), offline: true };
}

export async function getDoctor(id: string): Promise<Doctor | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('doctors')
      .select('*, hospital:hospitals(*)')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      return toDoctor(data as unknown as DoctorRow & { hospital?: HospitalRow | null });
    }
  }
  return FALLBACK_DOCTORS.find((d) => d.id === id) ?? null;
}

export async function listHospitals(city?: string): Promise<Hospital[]> {
  if (supabase) {
    let query = supabase.from('hospitals').select('*').limit(50);
    if (city) query = query.ilike('city', `%${city}%`);
    const { data, error } = await query;
    if (!error && data) return (data as HospitalRow[]).map(toHospital);
  }
  return city
    ? FALLBACK_HOSPITALS.filter((h) => h.city.toLowerCase().includes(city.toLowerCase()))
    : FALLBACK_HOSPITALS;
}

/**
 * Free slots for a doctor on a date. With a backend this uses the
 * `available_slots` SQL function, which also excludes taken slots; offline it
 * generates the same clinic pattern locally.
 */
export async function listSlots(doctorId: string, date: Date): Promise<AppointmentSlot[]> {
  const isoDate = date.toISOString().slice(0, 10);

  if (supabase) {
    const { data, error } = await supabase.rpc('available_slots', {
      p_doctor: doctorId,
      p_date: isoDate,
    });
    if (!error && Array.isArray(data)) {
      return data.map((s: { starts_at: string; duration_minutes: number; mode: string }) => ({
        doctorId,
        startsAt: s.starts_at,
        durationMinutes: s.duration_minutes,
        mode: s.mode as AppointmentSlot['mode'],
      }));
    }
  }

  return generateLocalSlots(doctorId, date);
}

/** Mon-Sat 10:00-13:00 in person, Mon-Fri 17:00-19:00 video — mirrors the seed. */
function generateLocalSlots(doctorId: string, date: Date): AppointmentSlot[] {
  const weekday = date.getDay();
  const slots: AppointmentSlot[] = [];
  const now = Date.now();

  const push = (hour: number, minute: number, minutes: number, mode: AppointmentSlot['mode']) => {
    const start = new Date(date);
    start.setHours(hour, minute, 0, 0);
    if (start.getTime() <= now) return;
    slots.push({ doctorId, startsAt: start.toISOString(), durationMinutes: minutes, mode });
  };

  if (weekday >= 1 && weekday <= 6) {
    for (let m = 0; m < 180; m += 20) push(10 + Math.floor(m / 60), m % 60, 20, 'in_person');
  }
  if (weekday >= 1 && weekday <= 5) {
    for (let m = 0; m < 120; m += 15) push(17 + Math.floor(m / 60), m % 60, 15, 'video');
  }

  return slots;
}

function filterFallback(filters: DoctorFilters): Doctor[] {
  return FALLBACK_DOCTORS.filter((d) => {
    if (filters.city && !d.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.teleconsultOnly && !d.teleconsultAvailable) return false;
    if (filters.language && !d.languages.includes(filters.language)) return false;
    if (filters.search && !d.fullName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export const INDIAN_CITIES = [
  'Ahmedabad',
  'Bengaluru',
  'Chennai',
  'Delhi',
  'Hyderabad',
  'Kolkata',
  'Mumbai',
  'Pune',
  'Surat',
];

import type { Doctor, Hospital } from '@core/domain/types';

/**
 * Bundled care-team directory.
 *
 * The two consulting numbers below are live and reachable — every "Call"
 * button in the app dials one of them through the OS dialler. Replace them
 * along with the rest of this directory before wider release.
 *
 * Used when the app runs without a Supabase project (fresh install, offline,
 * pilot build). Mirrors `supabase/seed.sql` exactly so behaviour does not change
 * when the backend is switched on. Replace both with the real network before
 * launch — the UI labels this list as the offline directory so nobody mistakes
 * it for live availability.
 */

export const FALLBACK_HOSPITALS: Hospital[] = [
  {
    id: '11111111-1111-4111-8111-000000000001',
    name: 'Sterling Metabolic Institute',
    city: 'Ahmedabad',
    address: 'Nr. Judges Bungalow Road, Bodakdev, Ahmedabad 380054',
    phone: '+918879511005',
    latitude: 23.0396,
    longitude: 72.51,
    hasObesityClinic: true,
    hasPharmacy: true,
  },
  {
    id: '11111111-1111-4111-8111-000000000002',
    name: 'Civil Endocrine & Obesity Centre',
    city: 'Ahmedabad',
    address: 'Asarwa, Ahmedabad 380016',
    phone: '+918879511005',
    latitude: 23.053,
    longitude: 72.605,
    hasObesityClinic: true,
    hasPharmacy: true,
  },
  {
    id: '11111111-1111-4111-8111-000000000003',
    name: 'Sahyadri Weight Care Clinic',
    city: 'Pune',
    address: 'Karve Road, Deccan Gymkhana, Pune 411004',
    phone: '+918879511005',
    latitude: 18.51,
    longitude: 73.84,
    hasObesityClinic: true,
    hasPharmacy: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000004',
    name: 'Mumbai Diabetes & Obesity Hospital',
    city: 'Mumbai',
    address: 'Dr. Annie Besant Road, Worli, Mumbai 400018',
    phone: '+918879511005',
    latitude: 19.002,
    longitude: 72.818,
    hasObesityClinic: true,
    hasPharmacy: true,
  },
  {
    id: '11111111-1111-4111-8111-000000000005',
    name: 'Delhi Metabolic Health Centre',
    city: 'Delhi',
    address: 'Sector 8, Rohini, New Delhi 110085',
    phone: '+918879511005',
    latitude: 28.7,
    longitude: 77.11,
    hasObesityClinic: true,
    hasPharmacy: true,
  },
];

const hospitalById = (id: string) => FALLBACK_HOSPITALS.find((h) => h.id === id) ?? null;

export const FALLBACK_DOCTORS: Doctor[] = [
  {
    id: '22222222-2222-4222-8222-000000000001',
    fullName: 'Dr. Anjali Mehta',
    speciality: 'Endocrinology',
    qualifications: 'MBBS, MD (Medicine), DM (Endocrinology)',
    registrationNumber: 'GMC-45231',
    hospitalId: '11111111-1111-4111-8111-000000000001',
    hospital: hospitalById('11111111-1111-4111-8111-000000000001'),
    city: 'Ahmedabad',
    languages: ['en', 'hi', 'gu'],
    consultationFee: 800,
    teleconsultAvailable: true,
    rating: 4.8,
    yearsExperience: 14,
    photoUrl: null,
    phone: '+918879511005',
    bio: 'Runs a dedicated GLP-1 titration clinic and has managed over 2,000 patients through medical weight management.',
  },
  {
    id: '22222222-2222-4222-8222-000000000002',
    fullName: 'Dr. Rakesh Patel',
    speciality: 'Bariatric & Metabolic Medicine',
    qualifications: 'MBBS, MS (General Surgery), FIAGES',
    registrationNumber: 'GMC-38872',
    hospitalId: '11111111-1111-4111-8111-000000000002',
    hospital: hospitalById('11111111-1111-4111-8111-000000000002'),
    city: 'Ahmedabad',
    languages: ['en', 'gu', 'hi'],
    consultationFee: 600,
    teleconsultAvailable: true,
    rating: 4.6,
    yearsExperience: 18,
    photoUrl: null,
    phone: '+917986791522',
    bio: 'Focuses on non-surgical metabolic care first, with surgery reserved for clearly indicated cases.',
  },
  {
    id: '22222222-2222-4222-8222-000000000003',
    fullName: 'Dr. Sneha Kulkarni',
    speciality: 'Endocrinology',
    qualifications: 'MBBS, MD (Medicine), DNB (Endocrinology)',
    registrationNumber: 'MMC-71204',
    hospitalId: '11111111-1111-4111-8111-000000000003',
    hospital: hospitalById('11111111-1111-4111-8111-000000000003'),
    city: 'Pune',
    languages: ['en', 'mr', 'hi'],
    consultationFee: 900,
    teleconsultAvailable: true,
    rating: 4.9,
    yearsExperience: 11,
    photoUrl: null,
    phone: '+918879511005',
    bio: 'Special interest in PCOS, insulin resistance and behaviour-first obesity care.',
  },
  {
    id: '22222222-2222-4222-8222-000000000004',
    fullName: 'Dr. Imran Shaikh',
    speciality: 'Diabetology',
    qualifications: 'MBBS, MD (Medicine), Fellowship in Diabetology',
    registrationNumber: 'MMC-66019',
    hospitalId: '11111111-1111-4111-8111-000000000004',
    hospital: hospitalById('11111111-1111-4111-8111-000000000004'),
    city: 'Mumbai',
    languages: ['en', 'hi', 'mr'],
    consultationFee: 1200,
    teleconsultAvailable: true,
    rating: 4.7,
    yearsExperience: 20,
    photoUrl: null,
    phone: '+917986791522',
    bio: 'Manages type 2 diabetes with obesity, with emphasis on cardiovascular risk reduction.',
  },
  {
    id: '22222222-2222-4222-8222-000000000005',
    fullName: 'Dr. Kavita Rao',
    speciality: 'Nutrition & Metabolic Medicine',
    qualifications: 'MBBS, MD (Community Medicine), PG Dip Clinical Nutrition',
    registrationNumber: 'DMC-92310',
    hospitalId: '11111111-1111-4111-8111-000000000005',
    hospital: hospitalById('11111111-1111-4111-8111-000000000005'),
    city: 'Delhi',
    languages: ['en', 'hi'],
    consultationFee: 700,
    teleconsultAvailable: true,
    rating: 4.5,
    yearsExperience: 9,
    photoUrl: null,
    phone: '+918879511005',
    bio: 'Builds Indian-diet-first nutrition plans alongside medical therapy.',
  },
];


/**
 * The two doctors surfaced by default for "Talk to a doctor", the AI's
 * escalation cards, and the one-tap call blocks in every stage.
 */
export const PRIMARY_DOCTORS: Doctor[] = [FALLBACK_DOCTORS[0], FALLBACK_DOCTORS[1]];

/** Reachable consulting numbers, in E.164 so `tel:` works on every device. */
export const PRIMARY_DOCTOR_NUMBERS = ['+918879511005', '+917986791522'] as const;

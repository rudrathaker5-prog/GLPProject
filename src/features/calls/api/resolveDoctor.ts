import type { Doctor } from '@core/domain/types';
import { getDoctor, listDoctors } from '@features/doctors/api/doctorsRepository';
import { PRIMARY_DOCTORS } from '@features/doctors/api/fallbackDirectory';
import { getProfile } from '@features/profile/api/profileRepository';

/**
 * Works out which doctor "call my doctor" means.
 *
 * The assistant is given free text — an id if it happens to have one from a
 * previous tool call, otherwise a name the user typed, otherwise nothing at
 * all. The last case is the common one and the one that has to work: someone
 * types "call my doctor" and expects a phone to ring, not a question about
 * which of four cardiologists they meant.
 *
 * Resolution order, most specific first:
 *   1. an explicit doctor id
 *   2. a name, matched against the directory
 *   3. the patient's own primary doctor from their profile
 *   4. the first reachable consulting number
 *
 * Step 4 is what makes this safe to call with no arguments. It is also why the
 * result carries `confidence` — a screen showing "Calling Dr Mehta" should say
 * so differently when it guessed than when the user named them.
 */

export interface ResolvedDoctor {
  doctor: Doctor | null;
  name: string;
  number: string;
  /** How the doctor was chosen, so the UI can be honest about a fallback. */
  confidence: 'explicit' | 'named' | 'primary' | 'fallback';
}

/** Normalises for comparison: "Dr. Anjali Mehta" and "anjali mehta" should match. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bdr\.?\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromDoctor(
  doctor: Doctor,
  confidence: ResolvedDoctor['confidence'],
): ResolvedDoctor | null {
  if (!doctor.phone) return null;
  return { doctor, name: doctor.fullName, number: doctor.phone, confidence };
}

export async function resolveDoctorToCall(input: {
  doctorId?: string | null;
  doctorName?: string | null;
}): Promise<ResolvedDoctor | null> {
  const { doctorId, doctorName } = input;

  // 1. An id the assistant already has.
  if (doctorId) {
    const doctor = await getDoctor(doctorId).catch(() => null);
    if (doctor) {
      const resolved = fromDoctor(doctor, 'explicit');
      if (resolved) return resolved;
    }
  }

  // 2. A name the user typed.
  if (doctorName) {
    const target = normalise(doctorName);
    if (target.length >= 3) {
      const { doctors } = await listDoctors({}).catch(() => ({ doctors: [] as Doctor[] }));
      const candidates = [...doctors, ...PRIMARY_DOCTORS];

      const match =
        candidates.find((d) => normalise(d.fullName) === target) ??
        // Surname or first name alone — "call Mehta" is a normal thing to say.
        candidates.find((d) => {
          const parts = normalise(d.fullName).split(' ');
          return parts.includes(target) || normalise(d.fullName).includes(target);
        });

      if (match) {
        const resolved = fromDoctor(match, 'named');
        if (resolved) return resolved;
      }
    }
  }

  // 3. The doctor this patient is actually under.
  const profile = await getProfile().catch(() => null);
  if (profile?.primaryDoctorId) {
    const doctor = await getDoctor(profile.primaryDoctorId).catch(() => null);
    if (doctor) {
      const resolved = fromDoctor(doctor, 'primary');
      if (resolved) return resolved;
    }
  }

  // 4. Someone who will actually answer.
  const fallback = PRIMARY_DOCTORS.find((d) => d.phone);
  return fallback ? fromDoctor(fallback, 'fallback') : null;
}

/**
 * Whether the user asked to be put through, as opposed to talking *about*
 * ringing someone.
 *
 * Deliberately narrow. The cost of a false positive is the dialler opening
 * unasked, which is intrusive and erodes trust in every other suggestion the
 * app makes; the cost of a false negative is a tappable Call button, which is
 * what the app did before and is perfectly fine. So this only fires on an
 * imperative, and never on a question ("should I call my doctor?") or a report
 * ("I called my doctor yesterday").
 *
 * Phone keyboards autocorrect a straight apostrophe to a curly one, so the
 * patterns accept both. Matching only ' means "don't call" reads as a request
 * to call, which is the worst possible way to get this wrong — and it is what
 * the first version did.
 */
const APOS = "['\u2019]";

const CALL_REQUEST_PATTERNS: RegExp[] = [
  /^\s*(please\s+)?(call|phone|dial|ring)\b(?!.*\?)/i,
  /\b(call|phone|ring|dial)\s+(my\s+|the\s+)?(doctor|dr\.?|physician|clinic)\b(?!.*\?)/i,
  /\b(put me through|connect me)\b/i,
  /(डॉक्टर को (कॉल|फ़ोन) करो|कॉल लगाओ|फ़ोन लगाओ)/,
  /(ડૉક્ટરને (કૉલ|ફોન) કરો|કૉલ લગાવો)/,
  /(डॉक्टरांना (कॉल|फोन) करा|कॉल लावा)/,
];

/** Phrases that look like a request but are not one. */
const NOT_A_REQUEST: RegExp[] = [
  /\b(should|shall|do you think|is it worth|when should|do i need)\b/i,
  /\b(called|phoned|rang|dialled|dialed)\b/i,
  new RegExp(
    `\\b(cannot|can${APOS}?t|could not|couldn${APOS}?t|do not want to|don${APOS}?t want to)\\s+(call|phone|ring)\\b`,
    'i',
  ),
];

export function isDirectCallRequest(text: string): boolean {
  if (NOT_A_REQUEST.some((pattern) => pattern.test(text))) return false;
  return CALL_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

/** Pulls a name out of "call Dr Mehta" so the resolver has something to match. */
export function extractDoctorName(text: string): string | null {
  // `Dr`/`Doctor` are stripped case-insensitively; the *name* still has to be
  // capitalised, otherwise "call the clinic" yields "the".
  const match = text.match(
    /\b(?:call|phone|ring|dial)\s+(?:my\s+|the\s+)?(?:[Dd]octor\s+)?(?:[Dd]r\.?\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  );
  const name = match?.[1]?.trim();
  if (!name) return null;
  // "call My doctor" at the start of a sentence would otherwise yield "My".
  return /^(my|the|a|an|doctor)$/i.test(name) ? null : name;
}

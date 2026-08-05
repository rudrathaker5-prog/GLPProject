import {
  FALLBACK_DOCTORS,
  FALLBACK_HOSPITALS,
  PRIMARY_DOCTORS,
  PRIMARY_DOCTOR_NUMBERS,
} from '../fallbackDirectory';

/**
 * A "Call" button that dials nothing is worse than no button at all — the user
 * finds out it is fake at the moment they most need it to work. These tests pin
 * the contract that every number in the bundled directory is dialable.
 */
const E164 = /^\+91[6-9]\d{9}$/;

describe('bundled care directory', () => {
  it('exposes the two reachable consulting numbers', () => {
    expect(PRIMARY_DOCTOR_NUMBERS).toEqual(['+918879511005', '+917986791522']);
  });

  it('gives every doctor a valid, dialable Indian number', () => {
    for (const doctor of FALLBACK_DOCTORS) {
      expect(doctor.phone).toBeTruthy();
      expect(doctor.phone).toMatch(E164);
    }
  });

  it('gives every hospital a valid, dialable number', () => {
    for (const hospital of FALLBACK_HOSPITALS) {
      expect(hospital.phone).toBeTruthy();
      expect(hospital.phone).toMatch(E164);
    }
  });

  it('routes every listed number to a number that is actually answered', () => {
    const reachable = new Set<string>(PRIMARY_DOCTOR_NUMBERS);
    for (const doctor of FALLBACK_DOCTORS) {
      expect(reachable.has(doctor.phone!)).toBe(true);
    }
    for (const hospital of FALLBACK_HOSPITALS) {
      expect(reachable.has(hospital.phone!)).toBe(true);
    }
  });

  it('surfaces exactly two primary doctors, both with numbers', () => {
    expect(PRIMARY_DOCTORS).toHaveLength(2);
    expect(PRIMARY_DOCTORS[0].phone).toBe('+918879511005');
    expect(PRIMARY_DOCTORS[1].phone).toBe('+917986791522');
    for (const doctor of PRIMARY_DOCTORS) {
      expect(doctor.fullName.length).toBeGreaterThan(3);
      expect(doctor.speciality.length).toBeGreaterThan(3);
    }
  });

  it('keeps hospital references intact so directions and calls resolve', () => {
    for (const doctor of FALLBACK_DOCTORS) {
      if (!doctor.hospitalId) continue;
      expect(FALLBACK_HOSPITALS.some((h) => h.id === doctor.hospitalId)).toBe(true);
      expect(doctor.hospital).not.toBeNull();
    }
  });
});

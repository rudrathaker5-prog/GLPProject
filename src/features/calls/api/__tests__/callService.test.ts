import {
  EMERGENCY_CONTACTS,
  callKindLabel,
  callReasonLabel,
  type CallKind,
  type CallReason,
} from '../callService';

/**
 * The numbers that have to work when nothing else does.
 *
 * A wrong emergency number is not a bug that degrades the experience — it is
 * one that costs the minutes that matter. These are short national service
 * codes, not E.164 mobile numbers, so the directory's `+91…` rule deliberately
 * does not apply and they need their own check.
 */

describe('emergency contacts', () => {
  it('includes the three Indian national services', () => {
    const numbers = EMERGENCY_CONTACTS.map((contact) => contact.number);
    expect(numbers).toContain('112'); // all-emergency
    expect(numbers).toContain('108'); // ambulance
    expect(numbers).toContain('14416'); // Tele-MANAS mental health
  });

  it('gives every one a dialable short code', () => {
    for (const contact of EMERGENCY_CONTACTS) {
      // Indian service short codes: digits only, 3-5 long.
      expect(contact.number).toMatch(/^\d{3,5}$/);
    }
  });

  it('says when to use each one', () => {
    // An unlabelled row of emergency numbers makes people hesitate over whether
    // their situation "counts". Naming the symptoms removes the hesitation.
    for (const contact of EMERGENCY_CONTACTS) {
      expect(contact.when.length).toBeGreaterThan(20);
      expect(contact.name.length).toBeGreaterThan(3);
    }
  });

  it('routes the mental-health line to a crisis kind, not a doctor', () => {
    const telemanas = EMERGENCY_CONTACTS.find((c) => c.number === '14416');
    expect(telemanas?.kind).toBe('crisis_line');
  });

  it('has no duplicate numbers', () => {
    const numbers = EMERGENCY_CONTACTS.map((c) => c.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('call log labels', () => {
  const kinds: CallKind[] = [
    'doctor',
    'hospital',
    'pharmacy',
    'emergency',
    'crisis_line',
    'other',
  ];

  const reasons: CallReason[] = [
    'routine',
    'side_effect',
    'missed_dose',
    'refill',
    'appointment',
    'red_flag',
    'relapse',
    'unknown',
  ];

  it.each(kinds)('names the %s kind', (kind) => {
    expect(callKindLabel(kind)).toBeTruthy();
    expect(callKindLabel(kind)).not.toBe(kind);
  });

  it.each(reasons)('names the %s reason', (reason) => {
    expect(callReasonLabel(reason)).toBeTruthy();
  });

  it('does not label an unknown reason as anything definite', () => {
    // Every historical call has a reason; "unknown" must not masquerade as one.
    expect(callReasonLabel('unknown')).toBe('—');
  });
});

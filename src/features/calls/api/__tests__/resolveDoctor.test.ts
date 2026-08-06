import { extractDoctorName, isDirectCallRequest } from '../resolveDoctor';

/**
 * Deciding whether the user asked to be put through.
 *
 * This gate decides whether the dialler opens without being tapped, so the two
 * failure directions are not symmetric:
 *
 *   - A false negative shows a Call button. That is what the app did before
 *     this feature existed and it is perfectly acceptable.
 *   - A false positive hijacks the screen and starts dialling a doctor because
 *     someone *mentioned* calling. That is intrusive, and it teaches people to
 *     distrust every other suggestion the app makes.
 *
 * So the bar is an imperative. Questions and past-tense reports must not fire,
 * and the fixtures below are mostly things people really say that look like
 * requests and are not.
 */

describe('recognising a request to be put through', () => {
  it.each([
    'call my doctor',
    'Call my doctor',
    'please call the doctor',
    'phone my doctor',
    'ring my doctor',
    'dial my doctor',
    'call Dr Mehta',
    'call doctor Sharma please',
    'put me through',
    'connect me to my doctor',
    'डॉक्टर को कॉल करो',
    'ડૉક્ટરને કૉલ કરો',
    'डॉक्टरांना कॉल करा',
  ])('fires on "%s"', (text) => {
    expect(isDirectCallRequest(text)).toBe(true);
  });
});

describe('not firing on things that only sound like one', () => {
  it.each([
    // Questions. The user is deliberating, not instructing.
    'should I call my doctor?',
    'do I need to call my doctor about this?',
    'when should I call the doctor',
    'is it worth calling my doctor?',
    'do you think I should ring the clinic?',

    // Past tense. They already did it.
    'I called my doctor yesterday',
    'I phoned the clinic this morning',
    'I rang my doctor and she said to wait',

    // Negations.
    'I cannot call my doctor right now',
    "I can't ring the clinic until Monday",
    'I don’t want to call my doctor about this',

    // Ordinary conversation that happens to contain the word.
    'my doctor is called Mehta',
    'what do you call this side effect',
  ])('stays quiet on "%s"', (text) => {
    expect(isDirectCallRequest(text)).toBe(false);
  });

  it('does not fire on an empty or trivial message', () => {
    expect(isDirectCallRequest('')).toBe(false);
    expect(isDirectCallRequest('hi')).toBe(false);
  });
});

describe('pulling the name out', () => {
  it('finds a named doctor', () => {
    expect(extractDoctorName('call Dr Mehta')).toBe('Mehta');
    expect(extractDoctorName('phone Doctor Sharma')).toBe('Sharma');
    expect(extractDoctorName('call Anjali Mehta')).toBe('Anjali Mehta');
  });

  it('returns nothing when no one was named', () => {
    // "call my doctor" must resolve to *their* doctor, not to a doctor called
    // "My".
    expect(extractDoctorName('call my doctor')).toBeNull();
    expect(extractDoctorName('call the doctor')).toBeNull();
    expect(extractDoctorName('put me through')).toBeNull();
  });
});

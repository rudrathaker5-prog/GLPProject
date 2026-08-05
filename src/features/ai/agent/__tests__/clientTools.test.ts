import { executeClientTool } from '../clientTools';

/**
 * Tool arguments come from a language model, and several of these tools write
 * straight into a health record or fire a real-world side effect. The schema
 * descriptions are advisory — a model is free to ignore them — so the runtime
 * check is the only thing standing between a mis-parsed sentence and a stored
 * measurement that every later calculation is based on.
 */

jest.mock('@features/tracking/api/trackingRepository', () => ({
  logWeight: jest.fn(async () => ({ milestones: [] })),
  saveCheckIn: jest.fn(async () => ({ wellness: null })),
  progressSummary: jest.fn(async () => null),
  currentRelapseRisk: jest.fn(async () => null),
}));
jest.mock('@features/profile/api/profileRepository', () => ({
  saveProfile: jest.fn(async () => undefined),
}));
jest.mock('@features/appointments/api/appointmentsRepository', () => ({
  bookAppointment: jest.fn(async (input: Record<string, unknown>) => ({
    id: 'a1',
    scheduledAt: input.scheduledAt,
    mode: input.mode,
  })),
}));
jest.mock('@features/medication/api/medicationRepository', () => ({
  listMedications: jest.fn(async () => []),
  nextDose: jest.fn(async () => null),
  refillDaysRemaining: jest.fn(async () => null),
  requestRefill: jest.fn(async () => ({ id: 'r1' })),
}));
jest.mock('@features/doctors/api/doctorsRepository', () => ({
  listDoctors: jest.fn(async () => ({ doctors: [] })),
  listSlots: jest.fn(async () => []),
}));
jest.mock('@features/journey/api/journeyRepository', () => ({
  addJourneyEvent: jest.fn(async () => undefined),
}));
jest.mock('@features/nutrition/api/nutritionRepository', () => ({
  getActivePlan: jest.fn(async () => null),
}));

import { logWeight, saveCheckIn } from '@features/tracking/api/trackingRepository';
import { saveProfile } from '@features/profile/api/profileRepository';
import { bookAppointment } from '@features/appointments/api/appointmentsRepository';

const ctx = { stage: 'treatment' as const };

beforeEach(() => jest.clearAllMocks());

describe('log_weight rejects implausible body weights', () => {
  it.each([-40, 0, 4000, 9.9, 500.1])('refuses %p kg', async (weight_kg) => {
    const result = await executeClientTool('log_weight', { weight_kg }, ctx);
    expect(logWeight).not.toHaveBeenCalled();
    expect(result.forModel).toMatchObject({ logged: false });
  });

  it('accepts a real weight', async () => {
    const result = await executeClientTool('log_weight', { weight_kg: 92.4 }, ctx);
    expect(logWeight).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 92.4 }));
    expect(result.forModel).toMatchObject({ logged: true });
  });

  it('drops an absurd waist rather than storing it', async () => {
    await executeClientTool('log_weight', { weight_kg: 92, waist_cm: 9000 }, ctx);
    expect(logWeight).toHaveBeenCalledWith(expect.objectContaining({ waistCm: null }));
  });
});

describe('save_check_in bounds every score', () => {
  it('drops out-of-range scores instead of storing them', async () => {
    // A stored 90 would distort the wellness score and the relapse band.
    await executeClientTool(
      'save_check_in',
      { mood_score: 90, energy_score: -3, sleep_hours: 40, craving_score: 7 },
      ctx,
    );
    expect(saveCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        moodScore: null,
        energyScore: null,
        sleepHours: null,
        cravingScore: 7,
      }),
    );
  });
});

describe('check_eligibility protects the starting-weight anchor', () => {
  it('does not overwrite the profile with an implausible weight', async () => {
    await executeClientTool('check_eligibility', { height_cm: 170, weight_kg: 4000 }, ctx);
    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ startingWeightKg: undefined, heightCm: 170 }),
    );
  });

  it('writes nothing at all when no measurement is plausible', async () => {
    await executeClientTool('check_eligibility', { weight_kg: -5, height_cm: 900 }, ctx);
    expect(saveProfile).not.toHaveBeenCalled();
  });
});

describe('enums are checked, not cast', () => {
  it('falls back to in_person for an invented appointment mode', async () => {
    await executeClientTool(
      'book_appointment',
      { doctor_id: 'd1', scheduled_at: '2026-09-01T10:00:00Z', mode: 'telepathy' },
      ctx,
    );
    expect(bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'in_person' }),
    );
  });

  it('refuses an invented refill channel rather than storing it', async () => {
    const result = await executeClientTool(
      'request_refill',
      { medication_id: 'm1', channel: 'carrier_pigeon' },
      ctx,
    );
    expect(result.forModel).toMatchObject({ requested: false });
  });
});

describe('model-authored card text goes through the prescribing guard', () => {
  it('replaces dose advice in an escalation card', async () => {
    // This is rendered under a red "Get medical help now" heading — the
    // highest-authority element in the UI.
    const result = await executeClientTool(
      'escalate_to_care',
      {
        severity: 'urgent',
        message: 'Stop your 1 mg dose and drop back to 0.5 mg until you see your doctor.',
      },
      ctx,
    );
    const card = result.card as { message: string };
    expect(card.message).not.toContain('0.5 mg');
    expect(card.message).toContain('doctor');
  });

  it('leaves a legitimate escalation message alone', async () => {
    const message = 'Please go to the nearest emergency department now.';
    const result = await executeClientTool(
      'escalate_to_care',
      { severity: 'urgent', message },
      ctx,
    );
    expect((result.card as { message: string }).message).toBe(message);
  });

  it('drops a suggested action whose label is dose advice', async () => {
    const result = await executeClientTool(
      'suggest_actions',
      {
        actions: [
          { label: 'Increase your dose to 2 mg', intent: 'open_medication' },
          { label: 'Talk to a doctor', intent: 'open_doctors' },
        ],
      },
      ctx,
    );
    const card = result.card as { actions: { label: string }[] };
    expect(card.actions).toHaveLength(1);
    expect(card.actions[0].label).toBe('Talk to a doctor');
  });

  it('drops an action whose intent the app cannot handle', async () => {
    const result = await executeClientTool(
      'suggest_actions',
      { actions: [{ label: 'Do a barrel roll', intent: 'fly_to_mars' }] },
      ctx,
    );
    expect(result.card).toBeUndefined();
    expect(result.forModel).toMatchObject({ shown: 0 });
  });
});

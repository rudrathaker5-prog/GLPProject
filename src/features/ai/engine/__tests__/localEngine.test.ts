import { classifyIntent, extractMeasurements } from '../intents';
import { runLocalEngine, type LocalEngineInput } from '../localEngine';

function run(message: string, overrides: Partial<LocalEngineInput> = {}) {
  return runLocalEngine({
    message,
    stage: 'awareness',
    language: 'en',
    history: [],
    profile: {},
    ...overrides,
  });
}

describe('intent classification', () => {
  it.each([
    ['Am I eligible for obesity medication?', 'eligibility'],
    ['I want treatment', 'want_treatment'],
    ['I missed my dose yesterday', 'missed_dose'],
    ['I feel nauseous after my injection', 'side_effects'],
    ['I am scared of needles', 'needle_fear'],
    ['How should I store the pen while travelling?', 'storage_travel'],
    ["I've started binge eating", 'relapse'],
  ])('classifies "%s" as %s', (message, expected) => {
    expect(classifyIntent(message).intent).toBe(expected);
  });

  it('returns unknown for gibberish', () => {
    expect(classifyIntent('asdkjh qweoiu').intent).toBe('unknown');
  });
});

describe('measurement extraction', () => {
  it('reads metric measurements from prose', () => {
    const result = extractMeasurements('I am 82 kg and 165 cm tall');
    expect(result.weightKg).toBe(82);
    expect(result.heightCm).toBe(165);
  });

  it('converts feet and inches to centimetres', () => {
    expect(extractMeasurements("I'm 5'6\"").heightCm).toBe(168);
  });

  it('reads waist and age', () => {
    const result = extractMeasurements('my waist is 94 and I am 38 years old');
    expect(result.waistCm).toBe(94);
    expect(result.age).toBe(38);
  });
});

describe('on-device care engine', () => {
  it('answers an eligibility question with a real calculation', () => {
    const result = run('Am I eligible? I am 165 cm and 88 kg');
    const card = result.cards.find((c) => c.kind === 'eligibility');
    expect(card).toBeDefined();
    expect(result.reply).toMatch(/BMI/);
  });

  it('asks for the missing measurements rather than guessing', () => {
    const result = run('Am I eligible for weight loss medication?');
    expect(result.cards.find((c) => c.kind === 'eligibility')).toBeUndefined();
    expect(result.followUp).toMatch(/height/i);
  });

  it('routes treatment requests to a doctor', () => {
    const result = run('I want to start injections');
    const actions = result.cards.find((c) => c.kind === 'action');
    expect(actions).toBeDefined();
    expect(JSON.stringify(actions)).toMatch(/open_doctors/);
  });

  it('answers a myth with the evidence card', () => {
    const result = run('I heard these injections cause cancer, is it true?');
    expect(result.cards.find((c) => c.kind === 'myth')).toBeDefined();
  });

  it('escalates an emergency before anything else', () => {
    const result = run('I have severe stomach pain spreading to my back');
    expect(result.cards[0].kind).toBe('escalation');
    expect(result.reply).toMatch(/emergency|doctor now/i);
  });

  it('never tells anyone to change a dose', () => {
    const replies = [
      run('I missed my dose, should I take two?'),
      run('Should I increase my dose?'),
      run('what dose should I be on?'),
    ].map((r) => r.reply.toLowerCase());

    for (const reply of replies) {
      expect(reply).not.toMatch(/you should (take|start|increase) \d/);
      expect(reply).toMatch(/doctor|pharmacist|prescription/);
    }
  });

  it('runs the relapse protocol in the vigilance stage', () => {
    const result = run("I've gained the weight back and lost motivation", { stage: 'vigilance' });
    expect(result.cards.find((c) => c.kind === 'relapse')).toBeDefined();
    expect(result.reply).toMatch(/not you failing|disease/i);
  });

  it('greets in the selected language', () => {
    const hindi = run('नमस्ते', { language: 'hi' });
    expect(hindi.reply).toMatch(/[ऀ-ॿ]/);
  });

  it('always produces a usable answer, even for unknown input', () => {
    const result = run('zzzz qqqq');
    expect(result.reply.length).toBeGreaterThan(20);
    expect(result.cards.length).toBeGreaterThan(0);
  });
});

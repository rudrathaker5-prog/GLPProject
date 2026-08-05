import { isRelapseSignal, screenForSafety, wantsTreatment } from '../safety';

describe('safety triage', () => {
  it('treats self-harm as an emergency and gives Indian crisis numbers', () => {
    const signal = screenForSafety("I don't want to live anymore");
    expect(signal.level).toBe('emergency');
    expect(signal.category).toBe('self_harm');
    expect(signal.message).toContain('14416');
  });

  it('escalates pancreatitis-shaped abdominal pain', () => {
    const signal = screenForSafety('I have severe stomach pain since last night');
    expect(signal.level).toBe('emergency');
    expect(signal.category).toBe('pancreatitis');
  });

  it('escalates airway symptoms', () => {
    const signal = screenForSafety('my lips are swelling and I have difficulty breathing');
    expect(signal.level).toBe('emergency');
  });

  it('flags dehydration from persistent vomiting', () => {
    const signal = screenForSafety("I can't keep any water down");
    expect(signal.level).toBe('urgent');
    expect(signal.category).toBe('dehydration');
  });

  it('flags pregnancy', () => {
    const signal = screenForSafety('I think I am pregnant');
    expect(signal.level).toBe('urgent');
    expect(signal.category).toBe('pregnancy');
  });

  it('works in Hindi as well as English', () => {
    const signal = screenForSafety('मुझे आत्महत्या के विचार आ रहे हैं');
    expect(signal.level).toBe('emergency');
    expect(signal.category).toBe('self_harm');
  });

  it('ranks the most severe match first', () => {
    const signal = screenForSafety(
      'I stopped my injection and I have severe abdominal pain radiating to my back',
    );
    expect(signal.level).toBe('emergency');
  });

  it('stays quiet on ordinary questions', () => {
    expect(screenForSafety('what should I eat for breakfast?').level).toBe('none');
    expect(screenForSafety('how does GLP-1 work?').level).toBe('none');
  });
});

describe('relapse detection', () => {
  it.each([
    "I've started binge eating",
    'I stopped injections',
    'I gained weight back',
    "I've lost motivation",
    'I feel hopeless',
  ])('detects "%s"', (phrase) => {
    expect(isRelapseSignal(phrase)).toBe(true);
  });

  it('does not fire on neutral text', () => {
    expect(isRelapseSignal('I walked 8000 steps today')).toBe(false);
  });
});

describe('treatment intent', () => {
  it.each([
    'I want treatment',
    'I want medicine',
    'I want injections',
    'I need help losing weight',
    'can I get Ozempic',
    'इलाज चाहिए',
  ])('routes "%s" to a doctor', (phrase) => {
    expect(wantsTreatment(phrase)).toBe(true);
  });

  it('does not fire on general curiosity', () => {
    expect(wantsTreatment('is obesity a disease?')).toBe(false);
  });
});

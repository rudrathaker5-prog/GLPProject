import {
  GLP1_PROTEIN_G_PER_KG,
  ICMR_PROTEIN_G_PER_KG,
  NUTRITION_STANDARDS,
  proteinTargetFor,
  standardsForStage,
} from '@features/nutrition/content/glp1Standards';

/**
 * The content module makes two promises in prose that nothing enforced:
 * that every section is attributed, and that the ICMR figure is always shown
 * next to the higher GLP-1 one. Both are the difference between education and
 * an app inventing numbers at an Indian patient, so they are tested.
 */
describe('GLP-1 nutrition standards', () => {
  it('covers both the on-treatment and after-treatment phases', () => {
    const phases = NUTRITION_STANDARDS.map((s) => s.phase);
    expect(phases).toContain('on_treatment');
    expect(phases).toContain('after_treatment');
  });

  it('attributes every section to at least one named source', () => {
    for (const standard of NUTRITION_STANDARDS) {
      for (const section of standard.sections) {
        expect(section.sources.length).toBeGreaterThan(0);
        for (const source of section.sources) {
          expect(source.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every section something to actually read', () => {
    for (const standard of NUTRITION_STANDARDS) {
      expect(standard.sections.length).toBeGreaterThan(0);
      for (const section of standard.sections) {
        expect(section.summary.trim().length).toBeGreaterThan(0);
        expect(section.points.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses unique section ids, since they are React keys', () => {
    for (const standard of NUTRITION_STANDARDS) {
      const ids = standard.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  /*
    The protein section is the one place the app quotes a number well above the
    Indian national guideline. Quoting it without the comparison would be
    misleading, so the comparison is a test, not an editorial preference.
  */
  it('names ICMR alongside the higher GLP-1 protein figure', () => {
    const onTreatment = NUTRITION_STANDARDS.find((s) => s.phase === 'on_treatment')!;
    const protein = onTreatment.sections.find((s) => s.id === 'protein')!;

    expect(protein.points.join(' ')).toContain(String(ICMR_PROTEIN_G_PER_KG));
    expect(protein.sources.join(' ')).toMatch(/ICMR/i);
  });

  it('leads with the phase the patient is actually in', () => {
    expect(standardsForStage('vigilance')[0].phase).toBe('after_treatment');
    expect(standardsForStage('treatment')[0].phase).toBe('on_treatment');
    expect(standardsForStage('awareness')[0].phase).toBe('on_treatment');
  });

  it('shows both phases whichever stage the patient is in', () => {
    for (const stage of ['awareness', 'treatment', 'vigilance'] as const) {
      expect(standardsForStage(stage)).toHaveLength(NUTRITION_STANDARDS.length);
    }
  });

  describe('proteinTargetFor', () => {
    it('turns g/kg into grams a day', () => {
      // 80 kg x 1.2-1.6 = 96-128 g, the worked example in the content itself.
      expect(proteinTargetFor(80)).toBe('96–128 g');
    });

    it('scales with the bounds rather than hardcoding them', () => {
      const weight = 62;
      const low = Math.round(weight * GLP1_PROTEIN_G_PER_KG.min);
      const high = Math.round(weight * GLP1_PROTEIN_G_PER_KG.max);
      expect(proteinTargetFor(weight)).toBe(`${low}–${high} g`);
    });

    /*
      A missing weight must fall back to the g/kg range rather than print
      "0-0 g" — nobody's protein target is zero, and the screen renders this
      string verbatim as its headline number.
    */
    it('returns null rather than a nonsense target for absent or invalid weight', () => {
      expect(proteinTargetFor(null)).toBeNull();
      expect(proteinTargetFor(0)).toBeNull();
      expect(proteinTargetFor(-5)).toBeNull();
    });
  });
});

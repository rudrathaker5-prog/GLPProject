import { ALL_TOOL_NAMES, toolsForStage } from '../toolSchemas';

/**
 * The model is only ever offered tools that actually exist, and every tool it
 * is offered must be executable. A mismatch either way produces a silent
 * failure mid-conversation, which is the worst kind in a care app.
 */
describe('tool schemas', () => {
  it('offers a distinct, non-empty set for every stage', () => {
    for (const stage of ['awareness', 'treatment', 'vigilance'] as const) {
      const tools = toolsForStage(stage);
      expect(tools.length).toBeGreaterThan(0);

      const names = tools.map((t) => t.function.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('never offers treatment-only tools in the awareness stage', () => {
    const names = toolsForStage('awareness').map((t) => t.function.name);
    expect(names).not.toContain('get_medication_schedule');
    expect(names).not.toContain('request_refill');
    expect(names).not.toContain('log_weight');
  });

  it('offers the relapse protocol in vigilance', () => {
    const names = toolsForStage('vigilance').map((t) => t.function.name);
    expect(names).toContain('trigger_relapse_protocol');
    expect(names).toContain('save_check_in');
  });

  it('routes to a doctor from every stage', () => {
    for (const stage of ['awareness', 'treatment', 'vigilance'] as const) {
      const names = toolsForStage(stage).map((t) => t.function.name);
      expect(names).toContain('recommend_doctor_consultation');
      expect(names).toContain('escalate_to_care');
    }
  });

  it('produces valid JSON-schema parameter objects', () => {
    for (const name of ALL_TOOL_NAMES) {
      const tool = (['awareness', 'treatment', 'vigilance'] as const)
        .flatMap((s) => toolsForStage(s))
        .find((t) => t.function.name === name);

      expect(tool).toBeDefined();
      const params = tool!.function.parameters as {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };

      expect(params.type).toBe('object');
      expect(typeof params.properties).toBe('object');
      expect(tool!.function.description.length).toBeGreaterThan(20);

      // Every required key must be a declared property.
      for (const key of params.required ?? []) {
        expect(Object.keys(params.properties)).toContain(key);
      }
    }
  });

  it('has no tool the client cannot execute', async () => {
    // Mirrors the switch in clientTools.ts.
    const implemented = new Set([
      'check_eligibility',
      'find_doctors',
      'recommend_doctor_consultation',
      'get_available_slots',
      'book_appointment',
      'explain_myth',
      'get_education_topic',
      'log_weight',
      'request_check_in',
      'save_check_in',
      'get_medication_schedule',
      'request_refill',
      'get_progress',
      'get_nutrition_plan',
      'trigger_relapse_protocol',
      'escalate_to_care',
      'suggest_actions',
      'remember',
    ]);

    for (const name of ALL_TOOL_NAMES) {
      expect(implemented.has(name)).toBe(true);
    }
  });
});

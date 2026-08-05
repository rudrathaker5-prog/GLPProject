import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('has no tool the client cannot execute', () => {
    /*
      Read the switch out of clientTools.ts rather than restating it here.
      A hand-copied list is a test that passes right up until someone adds a
      tool and forgets to update it — which is precisely the failure it exists
      to catch. This version cannot drift.
    */
    const source = readFileSync(
      join(__dirname, '..', 'clientTools.ts'),
      'utf8',
    );
    const implemented = new Set(
      [...source.matchAll(/case '(\w+)':/g)].map((match) => match[1]),
    );

    expect(implemented.size).toBeGreaterThan(15);

    const advertised = [...ALL_TOOL_NAMES];
    const unimplemented = advertised.filter((name) => !implemented.has(name));
    expect(unimplemented).toEqual([]);
  });

  /*
    Handled by the client but deliberately not offered to it. The server agent
    advertises `remember`; the device does not, because memory is written by the
    app rather than by the model. The switch still answers it so a model that
    has seen the server's tool list does not get an "unknown tool" error.
  */
  const DEFENSIVE_ONLY = new Set(['remember']);

  it('advertises every tool the client implements', () => {
    // The other direction: a tool the client can run but never offers is dead
    // code, and usually means a schema was deleted by accident.
    const source = readFileSync(join(__dirname, '..', 'clientTools.ts'), 'utf8');
    const implemented = [...source.matchAll(/case '(\w+)':/g)].map((m) => m[1]);
    const advertised = new Set(ALL_TOOL_NAMES);

    const unadvertised = implemented.filter(
      (name) => !advertised.has(name) && !DEFENSIVE_ONLY.has(name),
    );
    expect(unadvertised).toEqual([]);
  });
});

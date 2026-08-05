import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALL_TOOL_NAMES } from '../toolSchemas';

/**
 * The two engines must offer the same tools.
 *
 * `toolSchemas.ts` opens by promising it mirrors
 * `supabase/functions/_shared/tools.ts` — "same names, same arguments — so a
 * conversation behaves identically whether it was answered by the server agent
 * or the on-device one". Nothing enforced that, and the safety files had
 * already drifted under an identical promise.
 *
 * A tool on one side only is not a crash. It is a conversation that quietly
 * gets worse when the user happens to have a backend configured, which is the
 * hardest kind of regression to notice.
 */

/** src/features/ai/agent/__tests__ → repo root. */
const ROOT = join(__dirname, '..', '..', '..', '..', '..');

const SERVER_TOOLS = join(ROOT, 'supabase', 'functions', '_shared', 'tools.ts');

/** The keys of the server's TOOLS registry. */
function serverToolNames(): string[] {
  const source = readFileSync(SERVER_TOOLS, 'utf8');
  const start = source.indexOf('export const TOOLS: Record<string, Tool> = {');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('};', start);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);
}

/**
 * Client-only by design, with the reason. Anything not listed here that appears
 * on one side and not the other is a bug.
 */
const CLIENT_ONLY: Record<string, string> = {};

/** Server-only by design. */
const SERVER_ONLY: Record<string, string> = {
  // The device writes memory itself rather than letting the model decide what
  // to store, so it never offers the tool — see clientTools.ts.
  remember: 'memory is written by the app on-device, not by the model',
};

describe('client and server offer the same tools', () => {
  const server = serverToolNames();
  const client = [...ALL_TOOL_NAMES];

  it('finds a real registry on both sides', () => {
    expect(server.length).toBeGreaterThan(15);
    expect(client.length).toBeGreaterThan(15);
  });

  it('has no tool the server offers and the device does not', () => {
    const missing = server.filter((name) => !client.includes(name) && !(name in SERVER_ONLY));
    expect(missing).toEqual([]);
  });

  it('has no tool the device offers and the server does not', () => {
    // This is the direction that bites: a feature built on-device first, then
    // never mirrored, so the *better-configured* user gets the worse answer.
    const missing = client.filter((name) => !server.includes(name) && !(name in CLIENT_ONLY));
    expect(missing).toEqual([]);
  });

  it('documents every deliberate divergence', () => {
    for (const [name, reason] of Object.entries({ ...CLIENT_ONLY, ...SERVER_ONLY })) {
      expect(reason.length).toBeGreaterThan(15);
      expect(client.includes(name) || server.includes(name)).toBe(true);
    }
  });

  it('describes each shared tool identically enough to behave the same', () => {
    // Not byte-identical — the server phrases a couple of descriptions in the
    // third person. But a tool whose description exists on one side and is
    // empty on the other will be called at different times by the same model.
    const source = readFileSync(SERVER_TOOLS, 'utf8');
    for (const name of client) {
      if (name in CLIENT_ONLY) continue;
      const index = source.indexOf(`name: '${name}'`);
      expect({ name, found: index > -1 }).toEqual({ name, found: true });

      const description = source.slice(index, index + 600);
      expect({ name, hasDescription: /description:\s*\n?\s*'/.test(description) }).toEqual({
        name,
        hasDescription: true,
      });
    }
  });
});

describe('the new maintenance-phase tools reached both engines', () => {
  const server = serverToolNames();

  it.each(['get_side_effect_trend', 'get_call_history', 'get_maintenance_status'])(
    '%s exists on the device and the server',
    (name) => {
      expect(ALL_TOOL_NAMES).toContain(name);
      expect(server).toContain(name);
    },
  );

  it('backs them with the SQL the server handlers call', () => {
    // A handler calling an RPC that no migration creates fails at runtime, in
    // production, on a patient's question — not in CI.
    const migrations = readFileSync(
      join(ROOT, 'supabase', 'migrations', '20260101000300_calls_and_checkpoints.sql'),
      'utf8',
    );
    expect(migrations).toContain('function side_effect_trend');
    expect(migrations).toContain('function maintenance_status');
    expect(migrations).toContain('create table call_log');
  });
});

import type { AgentCard } from '@core/domain/types';

import { shouldAutoDial } from '../AgentCards';

/**
 * When a call card is allowed to open the dialler by itself.
 *
 * This exists because of a bug I shipped and caught reading the code back. The
 * chat store persists the last 60 messages *including their cards*. A card with
 * `autoDial: true` therefore survives an app restart, rehydrates, and mounts as
 * a brand new component with a brand new "already dialled" ref — so opening the
 * app to check your weight would start ringing a doctor.
 *
 * Auto-dial is a live action. It is only correct in the seconds after the
 * person asked for it, and every other case has to fall back to a button.
 */

const NOW = new Date('2026-08-06T12:00:00.000Z').getTime();

function card(over: Partial<Extract<AgentCard, { kind: 'call' }>> = {}) {
  return {
    kind: 'call' as const,
    contactName: 'Dr Anjali Mehta',
    number: '+918879511005',
    reason: 'routine' as const,
    autoDial: true,
    requestedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

describe('auto-dial', () => {
  it('fires on a request made just now', () => {
    expect(shouldAutoDial(card(), NOW)).toBe(true);
  });

  it('still fires a few seconds later, while the turn is settling', () => {
    expect(shouldAutoDial(card(), NOW + 5_000)).toBe(true);
  });

  it('does not fire when the card was never meant to dial', () => {
    expect(shouldAutoDial(card({ autoDial: false }), NOW)).toBe(false);
  });
});

describe('the restart bug this file exists for', () => {
  it('does not fire on a card rehydrated an hour later', () => {
    expect(shouldAutoDial(card(), NOW + 60 * 60_000)).toBe(false);
  });

  it('does not fire on a card rehydrated the next day', () => {
    expect(shouldAutoDial(card(), NOW + 24 * 60 * 60_000)).toBe(false);
  });

  it('does not fire just past the window', () => {
    expect(shouldAutoDial(card(), NOW + 61_000)).toBe(false);
  });
});

describe('values that should never produce a call', () => {
  it('treats an unparseable timestamp as stale', () => {
    // Never dial on a value we do not understand.
    expect(shouldAutoDial(card({ requestedAt: 'not a date' }), NOW)).toBe(false);
    expect(shouldAutoDial(card({ requestedAt: '' }), NOW)).toBe(false);
  });

  it('treats a future timestamp as stale', () => {
    // A clock change or a bad server date is not a fresh request.
    expect(shouldAutoDial(card({ requestedAt: new Date(NOW + 60_000).toISOString() }), NOW)).toBe(
      false,
    );
  });
});

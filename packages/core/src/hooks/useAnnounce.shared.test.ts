// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounce.shared.test.ts
 * @input Two loads of useAnnounce.ts, as the package and a swizzled copy each
 *   carry one
 * @output Proves both loads write to one pair of live regions and join one
 *   frame of messages
 * @position Shared-state tests for the announcement channel (spec:AST-110
 *   FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of the announcement channel, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./useAnnounce');
}

afterEach(async () => {
  (await import('./useAnnounce')).__resetLiveRegionsForTest();
  (await import('../utils/sharedRealm')).resetSharedStateForTest('hooks/');
  for (const region of document.querySelectorAll('[data-astryx-live-region]')) {
    region.remove();
  }
  vi.useRealTimers();
  vi.resetModules();
});

describe('one announcement channel for the package and a swizzled copy', () => {
  it('writes both loads to one pair of live regions', async () => {
    const pkg = await load();
    const copy = await load();
    pkg.announceMessage('Saved', 'polite');
    copy.announceMessage('Synced', 'polite');
    expect(document.querySelectorAll('[data-astryx-live-region]')).toHaveLength(
      2,
    );
  });

  it("joins a copy's message into the package's pending frame", async () => {
    vi.useFakeTimers({toFake: ['requestAnimationFrame', 'setTimeout']});
    const pkg = await load();
    const copy = await load();
    pkg.announceMessage('Saved', 'polite');
    copy.announceMessage('Synced', 'polite');
    vi.advanceTimersToNextFrame();
    const texts = [
      ...document.querySelectorAll('[data-astryx-live-region]'),
    ].map(region => region.textContent);
    expect(texts).toContain('Saved Synced');
  });
});

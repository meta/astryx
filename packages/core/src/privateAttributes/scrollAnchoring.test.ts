// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollAnchoring.test.ts
 * @input Uses vitest and jsdom
 * @output The scroll-anchoring writer turns anchoring off with one rule per
 *   document and hands it back, never touching the element's inline style
 * @position Unit tests of privateAttributes/scrollAnchoring.stylex.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {setScrollAnchoringOff} from './scrollAnchoring.stylex';

afterEach(() => {
  document.body.replaceChildren();
});

describe('setScrollAnchoringOff', () => {
  it("turns anchoring off through an attribute and one rule, and hands the element's own value back", () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    first.style.overflowAnchor = 'auto';

    setScrollAnchoringOff(first, true);
    setScrollAnchoringOff(second, true);
    expect(first.getAttribute('data-astryx-scroll-anchoring')).toBe('off');
    const rules = document.head.querySelectorAll(
      '[data-astryx-scroll-anchoring="rule"]',
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].textContent).toBe(
      '[data-astryx-scroll-anchoring="off"]{overflow-anchor:none !important}',
    );
    expect(first.style.overflowAnchor).toBe('auto');

    setScrollAnchoringOff(first, false);
    expect(first.hasAttribute('data-astryx-scroll-anchoring')).toBe(false);
    expect(first.style.overflowAnchor).toBe('auto');
    expect(second.getAttribute('data-astryx-scroll-anchoring')).toBe('off');
  });

  it('is re-exported by name from the internal entry', async () => {
    const entry: Record<string, unknown> =
      await import('../internal/scroll-anchoring');
    expect(entry.setScrollAnchoringOff).toBe(setScrollAnchoringOff);
    expect(Object.keys(entry)).toEqual(['setScrollAnchoringOff']);
  });
});

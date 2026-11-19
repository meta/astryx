// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchActionRule.test.ts
 * @input markTouchAction and unmarkTouchAction on a document
 * @output Where the rule lives: an adopted constructable sheet where the
 *   engine has one, a style element where it has none, and an error from a
 *   constructable sheet that exists is not taken for a missing one
 * @position Unit test of packages/core/src/gestures/touchActionRule.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {markTouchAction, unmarkTouchAction} from '../touchActionRule';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('touchActionRule', () => {
  it('writes the rule into a style element where the engine has no constructable sheets', () => {
    expect('adoptedStyleSheets' in document).toBe(false);
    const element = document.createElement('div');
    document.body.append(element);
    expect(markTouchAction(element, 'pan-y')).toBe(true);
    expect(document.head.querySelector('style')?.textContent).toContain(
      'pan-y',
    );
    unmarkTouchAction(element);
  });

  it('lets an error from a constructable sheet that exists through, instead of taking it for a missing one', () => {
    class BrokenSheet {
      constructor() {
        throw new Error('broken sheet');
      }
      replaceSync(): void {}
    }
    vi.stubGlobal('CSSStyleSheet', BrokenSheet);
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: [],
    });
    try {
      const element = document.createElement('div');
      document.body.append(element);
      expect(() => markTouchAction(element, 'pan-x')).toThrow('broken sheet');
    } finally {
      delete (document as {adoptedStyleSheets?: unknown}).adoptedStyleSheets;
    }
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Static guards for the reset's box model on `::backdrop`.
 *
 * `*` never matches a pseudo-element, so `::backdrop` needs its own rule.
 * It must not share a selector list with `:where(*)`: an engine that does
 * not know a pseudo-element drops the whole rule it appears in, and the box
 * model for every element would go with it.
 * reset.backdrop.a11y.browser.spec.ts measures the result in a browser.
 */

import fs from 'fs';
import path from 'path';

import {beforeAll, describe, expect, it} from 'vitest';

describe('reset.css box model on ::backdrop', () => {
  let ruleBlocks: {selector: string; body: string}[];

  beforeAll(() => {
    const stripped = fs
      .readFileSync(path.resolve(__dirname, './reset.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    ruleBlocks = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector, body]) => ({selector: selector.trim(), body}),
    );
  });

  it('gives ::backdrop border-box and the border reset', () => {
    const backdrop = ruleBlocks.find(
      ({selector}) => selector === ':where(*)::backdrop',
    );
    expect(backdrop).toBeDefined();
    expect(backdrop!.body).toMatch(/box-sizing:\s*border-box/);
    expect(backdrop!.body).toMatch(/border-width:\s*0/);
    expect(backdrop!.body).toMatch(/border-style:\s*solid/);
  });

  it('keeps ::backdrop out of the selector lists that box every element', () => {
    for (const {selector} of ruleBlocks) {
      if (selector.split(',').some(part => part.trim() === ':where(*)')) {
        expect(selector).not.toContain('::backdrop');
      }
    }
  });
});

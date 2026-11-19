// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Static guard for the reset's file selector button rule.
 *
 * The button inside a file input is a pseudo-element, so the reset's element
 * selectors never reach it. It gets the box model, font inheritance and
 * button reset in a rule of its own: an engine that does not know a
 * pseudo-element drops the whole rule it appears in.
 * reset.file-selector-button.a11y.browser.spec.ts measures the result.
 */

import fs from 'fs';
import path from 'path';

import {beforeAll, describe, expect, it} from 'vitest';

describe('reset.css ::file-selector-button', () => {
  let ruleBlocks: {selector: string; body: string}[];

  beforeAll(() => {
    const stripped = fs
      .readFileSync(path.resolve(__dirname, './reset.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    ruleBlocks = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector, body]) => ({selector: selector.trim(), body}),
    );
  });

  it('gives the file button the reset a bare button gets', () => {
    const rule = ruleBlocks.find(
      ({selector}) => selector === ':where(*)::file-selector-button',
    );
    expect(rule).toBeDefined();
    const declarations = rule!.body
      .split(';')
      .map(declaration => declaration.trim())
      .filter(Boolean);
    expect(declarations).toEqual(
      expect.arrayContaining([
        'box-sizing: border-box',
        'border-width: 0',
        'border-style: solid',
        'font: inherit',
        'color: inherit',
        'appearance: button',
        'background-color: transparent',
        'background-image: none',
      ]),
    );
  });

  it('keeps the file button out of every other selector list', () => {
    for (const {selector} of ruleBlocks) {
      if (selector.includes('::file-selector-button')) {
        expect(selector).toBe(':where(*)::file-selector-button');
      }
    }
  });
});

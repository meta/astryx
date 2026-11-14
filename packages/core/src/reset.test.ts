// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Tests for reset.css invariants that components rely on.
 *
 * reset.css is a plain stylesheet, so these tests assert on its source
 * text (same approach as the reset.css baseline checks in
 * theme/onMediaTokens.test.ts and AspectRatio/AspectRatio.test.tsx).
 */

import fs from 'fs';
import path from 'path';

import {beforeAll, describe, expect, it} from 'vitest';

describe('reset.css accessibility invariants', () => {
  let ruleBlocks: {selector: string; body: string}[];

  beforeAll(() => {
    const resetCSS = fs.readFileSync(
      path.resolve(__dirname, './reset.css'),
      'utf-8',
    );
    // Strip comments, then collect every innermost `selector { body }`
    // block. `[^{}]` keeps at-rule preludes (@media, @layer) out of the
    // selector capture, since their own `{` terminates any earlier match.
    const stripped = resetCSS.replace(/\/\*[\s\S]*?\*\//g, '');
    ruleBlocks = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector, body]) => ({selector: selector.trim(), body}),
    );
  });

  it('parses rule blocks out of reset.css', () => {
    // Guards the WCAG assertion below against silently passing if the
    // block parsing ever breaks.
    expect(ruleBlocks.length).toBeGreaterThan(20);
    expect(
      ruleBlocks.some(({body}) => body.includes('box-sizing: border-box')),
    ).toBe(true);
  });

  /**
   * WCAG 2.4.7 (Focus Visible, Level AA): keyboard focus indicators must
   * not be suppressed. `:focus-visible` only matches keyboard-style focus,
   * so any `outline: none` on it removes the focus indicator for keyboard
   * users — and a `@media (hover: none) and (pointer: coarse)` guard does
   * not exempt keyboard users on coarse-pointer devices (iPad/phone with a
   * Bluetooth keyboard, switch-control users).
   */
  it('does not suppress :focus-visible outlines (WCAG 2.4.7)', () => {
    const focusVisibleBlocks = ruleBlocks.filter(({selector}) =>
      selector.includes(':focus-visible'),
    );
    for (const {selector, body} of focusVisibleBlocks) {
      expect
        .soft(body, `":focus-visible" rule "${selector}" must keep the outline`)
        .not.toMatch(/outline(?:-style|-width)?\s*:\s*(?:none|0)/);
    }
  });

  /**
   * A disabled control must not answer the pointer with an interactive
   * cursor. The reset is the floor for any element that declares no cursor of
   * its own — components declare theirs under the `disabled-cursor` lint
   * rule, and the Chromium sweep measures the rendered result.
   */
  it('gives disabled elements the disabled cursor', () => {
    const disabledBlocks = ruleBlocks.filter(
      ({selector}) =>
        selector.includes(':disabled') && !selector.includes(':not('),
    );
    expect(disabledBlocks.length).toBeGreaterThan(0);
    for (const {selector, body} of disabledBlocks) {
      expect(body, `disabled rule "${selector}"`).toMatch(/cursor:\s*default/);
    }
    // aria-disabled is how astryx keeps a disabled control focusable, so the
    // reset has to cover it alongside the native state.
    expect(
      disabledBlocks.some(({selector}) => selector.includes('aria-disabled')),
    ).toBe(true);
  });
});

/** The argument of every `:where()` and `:is()`, nested ones included. */
function forgivingListArguments(selector: string): string[] {
  return [...selector.matchAll(/:(?:where|is)\(/g)].map(match => {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (; end < selector.length && depth > 0; end++) {
      if (selector[end] === '(') {
        depth++;
      } else if (selector[end] === ')') {
        depth--;
      }
    }
    return selector.slice(start, end - 1);
  });
}

/** A selector list split on its top-level commas. */
function topLevelSelectors(list: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    if (list[index] === '(') {
      depth++;
    } else if (list[index] === ')') {
      depth--;
    } else if (list[index] === ',' && depth === 0) {
      selectors.push(list.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(list.slice(start).trim());
  return selectors;
}

/**
 * A pseudo-element is not valid inside :where() or :is() (Selectors Level 4).
 * Both take a forgiving selector list, so the browser drops that entry rather
 * than the rule, and the declarations silently stop reaching the
 * pseudo-element. It goes after the :where(), as in `:where(*)::before`.
 * reset.a11y.chromium.spec.ts measures the result in Chromium.
 */
describe('reset.css pseudo-element rules', () => {
  let ruleBlocks: {selector: string; body: string}[];

  beforeAll(() => {
    const stripped = fs
      .readFileSync(path.resolve(__dirname, './reset.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    ruleBlocks = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector, body]) => ({selector: selector.trim(), body}),
    );
  });

  it('keeps every pseudo-element outside :where() and :is()', () => {
    for (const {selector} of ruleBlocks) {
      for (const argument of forgivingListArguments(selector)) {
        expect
          .soft(argument, `"${selector}" puts a pseudo-element in a list`)
          .not.toMatch(/::|:(?:before|after|first-line|first-letter)\b/);
      }
    }
  });

  it('targets ::before, ::after, ::placeholder and the search field parts', () => {
    const selectorsFor = (declaration: string) =>
      ruleBlocks
        .filter(({body}) => body.includes(declaration))
        .flatMap(({selector}) => topLevelSelectors(selector));
    const endsWith = (declaration: string, pseudoElement: string) =>
      selectorsFor(declaration).some(selector =>
        selector.endsWith(pseudoElement),
      );

    for (const declaration of [
      'box-sizing: border-box',
      'border-style: solid',
    ]) {
      expect(endsWith(declaration, '::before'), declaration).toBe(true);
      expect(endsWith(declaration, '::after'), declaration).toBe(true);
    }
    expect(endsWith('opacity: 1', '::placeholder')).toBe(true);
    expect(
      endsWith('-webkit-appearance: none', '::-webkit-search-decoration'),
    ).toBe(true);
    expect(
      endsWith('-webkit-appearance: none', '::-webkit-search-cancel-button'),
    ).toBe(true);
  });

  it('sets the dropdown marker of a field with a list on a single line', () => {
    const marker = ruleBlocks.filter(({selector}) =>
      topLevelSelectors(selector).some(entry =>
        entry.endsWith('::-webkit-calendar-picker-indicator'),
      ),
    );
    expect(marker.map(({body}) => body).join('\n')).toMatch(
      /line-height:\s*1;/,
    );
  });

  it('reaches the parts that size a date or time field', () => {
    const bodiesEndingWith = (pseudoElement: string) =>
      ruleBlocks
        .filter(({selector}) =>
          topLevelSelectors(selector).some(entry =>
            entry.endsWith(pseudoElement),
          ),
        )
        .map(({body}) => body)
        .join('\n');
    // iOS Safari: the value keeps one line when the field is empty and
    // follows the field's text-align instead of centring.
    const value = bodiesEndingWith('::-webkit-date-and-time-value');
    expect(value).toMatch(/min-height:\s*1lh;/);
    expect(value).toMatch(/text-align:\s*inherit;/);
    // Chromium: the row of editable fields loses its block padding.
    expect(bodiesEndingWith('::-webkit-datetime-edit-fields-wrapper')).toMatch(
      /padding-block:\s*0;/,
    );
  });

  it('falls back to the --color-text-secondary default for placeholders', () => {
    // A page that loads only the reset never defines the token. The fallback
    // repeats the token's own default, so that page shows the placeholder an
    // Astryx page does, at the contrast the token was chosen for.
    const tokens = fs.readFileSync(
      path.resolve(__dirname, './theme/tokens.stylex.ts'),
      'utf-8',
    );
    const tokenDefault = tokens.match(
      /'--color-text-secondary':\s*'([^']+)'/,
    )?.[1];
    expect(tokenDefault).toMatch(/^light-dark\(/);
    const placeholder = ruleBlocks.find(({selector}) =>
      selector.endsWith('::placeholder'),
    );
    expect(placeholder?.body).toContain(
      `color: var(--color-text-secondary, ${tokenDefault});`,
    );
  });
});

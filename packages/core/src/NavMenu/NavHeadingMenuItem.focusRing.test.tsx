// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavHeadingMenuItem.focusRing.test.tsx
 * @input vitest, @testing-library/react, NavHeadingMenu, NavHeadingMenuItem,
 *   the injected-CSS helper
 * @output Asserts every menu row draws the shared focus ring after keyboard
 *   input, inset by its own width
 * @position Component-local; the rendered frames live in
 *   __tests__/NavHeadingMenuItemAudit.a11y.chromium.spec.ts
 *
 * The focus fill alone is under 3:1 against the menu, and forced colors drop
 * it. jsdom cannot match `:focus-visible` or render forced colors, so these
 * cases assert the compiled rules each row carries.
 */

import React from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {getAllInjectedCss} from '../__tests__/forcedColors';
import {NavHeadingMenu} from './NavHeadingMenu';
import {NavHeadingMenuItem} from './NavHeadingMenuItem';

/**
 * The declarations the row's own classes apply, joined into one string: on
 * `:focus-visible` (the ring), or unconditionally.
 */
function rowDeclarations(
  row: HTMLElement,
  condition: ':focus-visible' | '' = ':focus-visible',
): string {
  const css = getAllInjectedCss();
  const declarations: string[] = [];
  for (const className of Array.from(row.classList)) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      condition === ''
        ? // StyleX may raise a rule's priority with `:not(#\#)` suffixes.
          `\\.${escaped}(?::not\\(#\\\\#\\))*\\s*\\{([^}]*)\\}`
        : `\\.${escaped}:focus-visible[^{,]*\\{([^}]*)\\}`,
      'g',
    );
    for (const match of css.matchAll(pattern)) {
      declarations.push(match[1] ?? '');
    }
  }
  return declarations.join(' ');
}

function expectSharedFocusRing(row: HTMLElement) {
  const ring = rowDeclarations(row);
  expect(ring).toContain('outline-width: var(--focus-outline-width)');
  expect(ring).toContain('outline-style: var(--focus-outline-style)');
  expect(ring).toContain('outline-color: var(--focus-outline-color)');
  const rest = rowDeclarations(row, '').replace(/\s+/g, '');
  expect(rest).toContain('outline-offset:calc(-1*var(--focus-outline-width))');
  // At rest and after pointer focus the row draws no ring.
  expect(rest).toContain('outline-style:none');
}

describe('a focused NavHeadingMenuItem draws the shared focus ring (WCAG 2.4.7)', () => {
  it('link, action, and disabled rows, in every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const {unmount} = render(
        <NavHeadingMenu size={size}>
          <NavHeadingMenuItem label="Docs" href="/docs" />
          <NavHeadingMenuItem label="Rename" onClick={() => {}} />
          <NavHeadingMenuItem label="Billing" href="/billing" isDisabled />
          <NavHeadingMenuItem label="Archive" isDisabled />
        </NavHeadingMenu>,
      );
      for (const name of ['Docs', 'Rename', 'Billing', 'Archive']) {
        expectSharedFocusRing(screen.getByRole('menuitem', {name}));
      }
      unmount();
    }
  });
});

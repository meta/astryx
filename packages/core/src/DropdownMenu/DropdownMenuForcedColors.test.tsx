// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuForcedColors.test.tsx
 * @input vitest, @testing-library/react, DropdownMenu row components, the
 *   forced-colors CSS helper
 * @output Asserts every focusable menu row draws the standard focus ring,
 *   inset by its own width, which forced colors keep
 * @position Component-local; the real-engine frames live in
 *   __tests__/DropdownMenuAudit.a11y.chromium.spec.ts
 *
 * A menu row shows focus — the one highlight the keyboard and the mouse both
 * drive — with a translucent overlay background. Forced colors replace that
 * background with the page color, so a focused row would look like its
 * neighbours and a keyboard user in a high-contrast mode could not tell which
 * row Enter will activate (WCAG 2.4.7). Every row therefore draws the
 * standard focus ring after keyboard input, inset by the ring's own width, in
 * every color mode; forced colors keep an outline where they drop the
 * overlay, and leave labels, icons, and end content under user-agent control.
 * jsdom cannot render forced colors, so these assert the compiled rules each
 * focusable row carries; the Chromium spec observes the rendered result.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {getAllInjectedCss} from '../__tests__/forcedColors';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {DropdownMenuCheckboxItem} from './DropdownMenuCheckboxItem';
import {DropdownMenuRadioGroup} from './DropdownMenuRadioGroup';
import {DropdownMenuRadioItem} from './DropdownMenuRadioItem';
import {DropdownMenuSubMenu} from './DropdownMenuSubMenu';

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

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

function expectSystemFocusOutline(row: HTMLElement) {
  const declarations = rowDeclarations(row);
  expect(declarations).toContain('outline-width: var(--focus-outline-width)');
  expect(declarations).toContain('outline-style: var(--focus-outline-style)');
  expect(declarations).toContain('outline-color: var(--focus-outline-color)');
  expect(declarations).not.toContain('background-color: highlight');
  expect(declarations).not.toContain('color: highlighttext');
  // Inset by the ring's own width, from the token rather than a fixed length.
  expect(rowDeclarations(row, '').replace(/\s+/g, '')).toContain(
    'outline-offset:calc(-1*var(--focus-outline-width))',
  );
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name: /Actions/}));
}

describe('a focused menu row draws the standard focus ring, kept under forced colors (WCAG 2.4.7)', () => {
  it('an action row paints the outline on focus', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
      </DropdownMenu>,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
  });

  it('a data-mode row paints the same outline', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Edit'}]} />,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitem', {name: 'Edit', hidden: true}),
    );
  });

  it('a destructive row keeps a visible outline without forcing its content colors', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem
          label="Delete"
          variant="destructive"
          onClick={() => {}}
        />
      </DropdownMenu>,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    );
  });

  it('a checkbox row paints the outline on focus', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuCheckboxItem label="Show archived" value={false} />
      </DropdownMenu>,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitemcheckbox', {
        name: /Show archived/,
        hidden: true,
      }),
    );
  });

  it('a radio row paints the outline on focus', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuRadioGroup
          value="newest"
          onChange={() => {}}
          label="Sort by">
          <DropdownMenuRadioItem value="newest" label="Newest" />
        </DropdownMenuRadioGroup>
      </DropdownMenu>,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitemradio', {name: /Newest/, hidden: true}),
    );
  });

  it('a sub-menu row paints the outline on focus', async () => {
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Share" presentation="flyout">
          <DropdownMenuItem label="Copy link" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await openMenu();
    expectSystemFocusOutline(
      screen.getByRole('menuitem', {name: /Share/, hidden: true}),
    );
  });
});

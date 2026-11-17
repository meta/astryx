// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuThemeReflection.test.tsx
 * @input vitest, @testing-library/react, DropdownMenu
 * @output Asserts the `dropdown-menu` target reflects its documented
 *   `presentation` capability on both menu surfaces
 * @position Component-local theming-reach test
 *
 * `DropdownMenu.doc.mjs` documents `presentation` as a visual prop of the
 * `dropdown-menu` target, so a theme can write `presentation:popover` or
 * `presentation:bottom-sheet` rules (architecture:component-theming-surface
 * INV6). Each surface must carry the attribute those rules select on.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
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

describe('dropdown-menu target presentation reflection', () => {
  it('the anchored menu reflects presentation="popover"', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Edit" onClick={() => {}} />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const menu = screen.getByRole('menu', {hidden: true});
    expect(menu).toHaveClass('astryx-dropdown-menu');
    expect(menu).toHaveAttribute('data-presentation', 'popover');
  });

  it('a data-mode menu resolved to the popover reflects it too', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        presentation="popover"
        items={[{label: 'Edit'}]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    expect(screen.getByRole('menu', {hidden: true})).toHaveAttribute(
      'data-presentation',
      'popover',
    );
  });
});

describe('dropdown-menu target presentation reflection: nested flyout', () => {
  it('a sub-menu flyout, another pointer menu surface, reflects it too', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Share" presentation="flyout">
          <DropdownMenuItem label="Copy link" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    await user.click(
      screen.getByRole('menuitem', {name: /Share/, hidden: true}),
    );
    const menus = screen.getAllByRole('menu', {hidden: true});
    expect(menus).toHaveLength(2);
    for (const menu of menus) {
      expect(menu).toHaveClass('astryx-dropdown-menu');
      expect(menu).toHaveAttribute('data-presentation', 'popover');
    }
  });
});

describe('mutually exclusive trigger props', () => {
  it('the dev warning names the props a caller can actually pass', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <DropdownMenu
          button={{label: 'Actions'}}
          renderTrigger={props => (
            <button type="button" {...props}>
              More
            </button>
          )}>
          <DropdownMenuItem label="Profile" onClick={() => {}} />
        </DropdownMenu>,
      );
      const message = warn.mock.calls.map(call => String(call[0])).join('\n');
      expect(message).toContain('`renderTrigger`');
      expect(message).not.toMatch(/`trigger`/);
    } finally {
      warn.mockRestore();
    }
  });
});

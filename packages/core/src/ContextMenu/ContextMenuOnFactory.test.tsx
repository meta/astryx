// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuOnFactory.test.tsx
 * @input vitest (jsdom), ContextMenu with createContextMenu watched
 * @output Checks that ContextMenu is built on the public headless context
 *   menu (spec:AST-107 FR8, FR7; component:ContextMenu FR10): it attaches
 *   createContextMenu to its own trigger, with its items or a `render` for
 *   its rows, which still read the caller's own contexts; unmounting while
 *   open removes everything; and its source attaches no request of its own
 * @position Testing for ContextMenu.tsx over createContextMenu.tsx
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {act, render, screen} from '@testing-library/react';
import {createContext, use} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ContextMenu} from './ContextMenu';
import {DropdownMenuItem as ContextMenuItem} from '../DropdownMenu/DropdownMenuItem';
import {dataAttr} from '../naming';
import {createContextMenu} from './createContextMenu';

// The real factory, watched: ContextMenu must go through it.
vi.mock('./createContextMenu', async importOriginal => {
  const actual = await importOriginal<typeof import('./createContextMenu')>();
  return {...actual, createContextMenu: vi.fn(actual.createContextMenu)};
});

/** The options the public factory takes (spec:AST-107 FR8). */
const FACTORY_OPTIONS = new Set([
  'items',
  'render',
  'label',
  'isDisabled',
  'onOpenChange',
  'presentation',
]);

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function rightClick(target: Element) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        button: 2,
      }),
    );
  });
}

describe('ContextMenu on createContextMenu (spec:AST-107 FR8, FR7)', () => {
  it('attaches the public createContextMenu to its own trigger, with its items', () => {
    vi.mocked(createContextMenu).mockClear();
    render(
      <ContextMenu
        label="File actions"
        items={[{label: 'Rename'}]}
        data-testid="trigger">
        <div>Area</div>
      </ContextMenu>,
    );
    expect(vi.mocked(createContextMenu)).toHaveBeenCalledTimes(1);
    const [element, options] = vi.mocked(createContextMenu).mock.calls[0] ?? [];
    expect(element).toBe(screen.getByTestId('trigger'));
    expect(
      Object.keys(options ?? {}).filter(key => !FACTORY_OPTIONS.has(key)),
    ).toEqual([]);
    expect(options?.items).toEqual([{label: 'Rename'}]);
    expect(options?.label).toBe('File actions');
  });

  it('hands the public createContextMenu a `render` for its menuContent', () => {
    vi.mocked(createContextMenu).mockClear();
    render(
      <ContextMenu
        menuContent={<ContextMenuItem label="Rename" />}
        data-testid="trigger">
        <div>Area</div>
      </ContextMenu>,
    );
    expect(vi.mocked(createContextMenu)).toHaveBeenCalledTimes(1);
    const [element, options] = vi.mocked(createContextMenu).mock.calls[0] ?? [];
    expect(element).toBe(screen.getByTestId('trigger'));
    expect(
      Object.keys(options ?? {}).filter(key => !FACTORY_OPTIONS.has(key)),
    ).toEqual([]);
    expect(typeof options?.render).toBe('function');
    expect(options?.items).toBeUndefined();
  });

  it("a row in menuContent reads the caller's own context", () => {
    const AppContext = createContext('no app context');
    AppContext.displayName = 'AppContext';
    function AppRow() {
      return <ContextMenuItem label={use(AppContext)} />;
    }
    render(
      <AppContext value="from the app">
        <ContextMenu menuContent={<AppRow />}>
          <div>Area</div>
        </ContextMenu>
      </AppContext>,
    );
    rightClick(screen.getByText('Area'));
    expect(
      screen.getByRole('menuitem', {name: 'from the app', hidden: true}),
    ).not.toBeNull();
  });

  it('unmounting while open removes the menu, its container and the trigger\u2019s request (component:ContextMenu FR10)', () => {
    const view = render(
      <ContextMenu items={[{label: 'Rename'}]} data-testid="trigger">
        <div>Area</div>
      </ContextMenu>,
    );
    const trigger = screen.getByTestId('trigger');
    rightClick(trigger);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    view.unmount();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(
      document.querySelector(`[${dataAttr('context-menu-host')}]`),
    ).toBeNull();
    // The trigger's request is gone: the browser keeps its own menu.
    const request = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    trigger.dispatchEvent(request);
    expect(request.defaultPrevented).toBe(false);
  });

  it('attaches no request and keeps no open state of its own: its source makes no request call (component:ContextMenu FR10)', () => {
    const source = readFileSync(
      join(process.cwd(), 'packages/core/src/ContextMenu/ContextMenu.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(
      /attachContextRequest\(|attachContextMenuRequests\(/,
    );
  });
});

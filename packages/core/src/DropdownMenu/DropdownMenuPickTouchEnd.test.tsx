// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuPickTouchEnd.test.tsx
 * @input DropdownMenu with a submenu of items and of radio items, a coarse
 *   primary pointer, and a finger's tap as pointer and touch events in jsdom
 * @output A finger's pick in a submenu closes the menu and takes its row out
 *   of the document before the touch's touchend. The touchend is still
 *   cancelled, so the browser sends no click to the control beneath, also
 *   past the click guard's window.
 * @position Unit evidence for module:DropdownMenu/useMenuPress and the click
 *   guard (overlay-dismissal FR11). The browser half is
 *   __tests__/DropdownMenuPickTapThrough.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useState, type ReactNode} from 'react';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {DropdownMenuRadioGroup} from './DropdownMenuRadioGroup';
import {DropdownMenuRadioItem} from './DropdownMenuRadioItem';
import {DropdownMenuSubMenu} from './DropdownMenuSubMenu';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {CLICK_GUARD_WINDOW_MS} from '../utils/clickGuard';
import {TOUCH_QUERY} from '../utils/touchPresentation';

/** A cancelable touch event at `target` whose one changed touch has `identifier`. */
function fireTouch(
  target: Element,
  type: 'touchstart' | 'touchend',
  identifier: number,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'changedTouches', {
    value: [{identifier, target}],
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * The browser's click for a touch, held past the click guard's window by a
 * busy main thread. The browser sends it only for a touchend that nothing
 * cancelled, at the finger's point: here, the control beneath the menu.
 */
function browserClickAfter(touchEnd: Event, beneath: Element): void {
  vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS + 100);
  if (!touchEnd.defaultPrevented) {
    beneath.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
  }
}

/** A finger's tap on `row`: pointerdown, touchstart, pointerup. */
function tapRow(row: Element): void {
  const touch = {pointerType: 'touch', pointerId: 7};
  fireEvent.pointerDown(row, touch);
  fireTouch(row, 'touchstart', 7);
  fireEvent.pointerUp(row, touch);
}

const menuRow = (role: 'menuitem' | 'menuitemradio', name: string) =>
  screen.getByRole(role, {name, hidden: true});

/** Renders `menu` above a control, then opens the menu and its submenu. */
async function openSubmenuOver(menu: ReactNode, submenu: string) {
  const onBeneath = vi.fn();
  render(
    <>
      <button type="button" onClick={onBeneath}>
        Beneath
      </button>
      {menu}
    </>,
  );
  fireEvent.click(screen.getByRole('button', {name: /Actions/}));
  const trigger = menuRow('menuitem', submenu);
  fireEvent.click(trigger);
  await waitFor(() => {
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  return {onBeneath, beneath: screen.getByRole('button', {name: 'Beneath'})};
}

function SortMenu() {
  const [sort, setSort] = useState('newest');
  return (
    <DropdownMenu button={{label: 'Actions'}} presentation="popover">
      <DropdownMenuItem label="Rename" onClick={() => {}} />
      <DropdownMenuSubMenu label="Sort" presentation="drill-in">
        <DropdownMenuRadioGroup value={sort} onChange={setSort} label="Sort by">
          <DropdownMenuRadioItem value="newest" label="Newest" />
          <DropdownMenuRadioItem value="oldest" label="Oldest" />
        </DropdownMenuRadioGroup>
      </DropdownMenuSubMenu>
    </DropdownMenu>
  );
}

describe("DropdownMenu: a finger's pick in a submenu (overlay-dismissal FR11)", () => {
  beforeEach(() => {
    __resetMenuPressForTest();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === TOUCH_QUERY || query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('on an item, cancels the touchend of the row that left the page, so no click reaches the control beneath', async () => {
    const onMove = vi.fn();
    const {onBeneath, beneath} = await openSubmenuOver(
      <DropdownMenu button={{label: 'Actions'}} presentation="popover">
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu label="Move to" presentation="drill-in">
          <DropdownMenuItem
            label="Folder A"
            onClick={() => {
              onMove('a');
            }}
          />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
      'Move to',
    );
    vi.useFakeTimers();
    const picked = menuRow('menuitem', 'Folder A');
    tapRow(picked);
    expect(onMove.mock.calls).toEqual([['a']]);
    expect(picked.isConnected).toBe(false);
    const touchEnd = fireTouch(picked, 'touchend', 7);
    expect(touchEnd.defaultPrevented).toBe(true);
    browserClickAfter(touchEnd, beneath);
    expect(onBeneath).not.toHaveBeenCalled();
  });

  it('on a radio item, cancels the touchend of the row that left the page, so no click reaches the control beneath', async () => {
    const {onBeneath, beneath} = await openSubmenuOver(<SortMenu />, 'Sort');
    vi.useFakeTimers();
    const picked = menuRow('menuitemradio', 'Oldest');
    tapRow(picked);
    expect(picked.isConnected).toBe(false);
    const touchEnd = fireTouch(picked, 'touchend', 7);
    expect(touchEnd.defaultPrevented).toBe(true);
    browserClickAfter(touchEnd, beneath);
    expect(onBeneath).not.toHaveBeenCalled();
  });
});

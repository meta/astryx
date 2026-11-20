// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuPickTouchEnd.test.tsx
 * @input DropdownMenu with a submenu of items and of radio items, a coarse
 *   primary pointer, and a finger's tap as pointer and touch events in jsdom
 * @output A finger's pick in a submenu closes the menu and takes its row out
 *   of the document before the touch's touchend. The touchend is still
 *   cancelled, so the browser sends no click to the control beneath, also
 *   past the click guard's window. Whether or not the touchstart was
 *   cancelable, the compatibility mouse events and click that follow still
 *   reach nothing.
 * @position Unit evidence for module:DropdownMenu/useMenuPress FR5 and the
 *   click guard (spec:AST-094 FR21, FR26). The browser half is
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
import {
  __setEventTrustForTest,
  CLICK_GUARD_WINDOW_MS,
} from '../utils/clickGuard';
import {TOUCH_QUERY} from '../utils/touchPresentation';

// jsdom sends no trusted event. The events in this set stand in for the
// browser's own (utils/clickGuard.ts).
const browserEvents = new WeakSet<Event>();
beforeEach(() => {
  __setEventTrustForTest(event => browserEvents.has(event));
});
afterEach(() => {
  __setEventTrustForTest(null);
});

/** A touch event at `target` whose one changed touch has `identifier`. */
function fireTouch(
  target: Element,
  type: 'touchstart' | 'touchend',
  identifier: number,
  cancelable = true,
): Event {
  const event = new Event(type, {bubbles: true, cancelable});
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
function tapRow(row: Element, touchStartCancelable = true): void {
  const touch = {pointerType: 'touch', pointerId: 7};
  fireEvent.pointerDown(row, touch);
  fireTouch(row, 'touchstart', 7, touchStartCancelable);
  fireEvent.pointerUp(row, touch);
}

/**
 * WebKit's compatibility mouse events and click for a touch whose touchstart
 * was not cancelable, in a Home Screen web app. They follow the cancelled
 * touchend by a few ms, at the point where the touch began.
 */
function compatibilityClickAt(target: Element): void {
  vi.advanceTimersByTime(20);
  for (const type of ['mousedown', 'mouseup', 'click']) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    browserEvents.add(event);
    target.dispatchEvent(event);
  }
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

describe("DropdownMenu: a finger's pick in a submenu (spec:AST-094 FR21, FR26)", () => {
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

  it('on a radio item, after a touchstart that was not cancelable, the compatibility mouse events and click that follow the cancelled touchend reach nothing beneath', async () => {
    const {onBeneath, beneath} = await openSubmenuOver(<SortMenu />, 'Sort');
    const onBeneathPress = vi.fn();
    beneath.addEventListener('mousedown', onBeneathPress);
    vi.useFakeTimers();
    const picked = menuRow('menuitemradio', 'Oldest');
    tapRow(picked, false);
    expect(picked.isConnected).toBe(false);
    expect(fireTouch(picked, 'touchend', 7).defaultPrevented).toBe(true);
    compatibilityClickAt(beneath);
    expect(onBeneathPress).not.toHaveBeenCalled();
    expect(onBeneath).not.toHaveBeenCalled();
  });

  it('on a radio item, after a cancelable touchstart too, the compatibility mouse events and click that follow the cancelled touchend reach nothing beneath', async () => {
    const {onBeneath, beneath} = await openSubmenuOver(<SortMenu />, 'Sort');
    const onBeneathPress = vi.fn();
    beneath.addEventListener('mousedown', onBeneathPress);
    vi.useFakeTimers();
    const picked = menuRow('menuitemradio', 'Oldest');
    tapRow(picked);
    expect(picked.isConnected).toBe(false);
    expect(fireTouch(picked, 'touchend', 7).defaultPrevented).toBe(true);
    compatibilityClickAt(beneath);
    expect(onBeneathPress).not.toHaveBeenCalled();
    expect(onBeneath).not.toHaveBeenCalled();
  });
});

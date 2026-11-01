// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useMenuPress.test.tsx
 * @input vitest, @testing-library/react, useMenuPress
 * @output Unit tests for the DOM half of the menu press model: tracking,
 *   highlight, activation, the stray-click swallower, dismissal, the trigger
 *   press and edge autoscroll
 * @position Testing; validates useMenuPress.ts. The transition table itself
 *   is covered by menuPressGesture.test.ts.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {useRef, useState} from 'react';
import {
  MENU_PRESS_AUTOSCROLL_ZONE_PX,
  MENU_PRESS_LONG_PRESS_MS,
  MENU_PRESS_STRAY_CLICK_MS,
  __resetMenuPressForTest,
  useMenuPress,
} from './useMenuPress';
import {MENU_PRESS_SETTLE_MS} from './menuPressGesture';

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

interface HarnessProps {
  onSelect?: (label: string) => void;
  onDismiss?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
  hitTest?: (x: number, y: number) => Element | null;
  getScroller?: () => HTMLElement | null;
  onHighlight?: (row: HTMLElement | null) => void;
}

function Harness({
  onSelect,
  onDismiss,
  onOpenChange,
  hitTest,
  getScroller,
  onHighlight,
}: HarnessProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };
  const press = useMenuPress({
    menuRef,
    triggerRef,
    itemSelector: ITEM_SELECTOR,
    onTriggerPress: () => {
      if (isOpen) {
        open(false);
        return false;
      }
      open(true);
      return true;
    },
    onDismiss,
    hitTest,
    getScroller,
    onHighlight,
  });
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        {...press.triggerProps}
        aria-expanded={isOpen}
        onClick={() => {
          if (press.isTriggerClickFromPress()) {
            return;
          }
          open(!isOpen);
        }}>
        Open
      </button>
      <div ref={menuRef} role="menu" tabIndex={-1} {...press.menuProps}>
        {['A', 'B', 'C'].map(label => (
          <div
            key={label}
            role="menuitem"
            tabIndex={-1}
            onClick={() => onSelect?.(label)}>
            {label}
          </div>
        ))}
        <div
          role="menuitem"
          aria-disabled="true"
          onClick={() => onSelect?.('D')}>
          D (disabled)
        </div>
        <div role="separator" data-testid="divider" />
      </div>
      <button type="button" data-testid="outside">
        Outside
      </button>
    </>
  );
}

const row = (label: string) => screen.getByRole('menuitem', {name: label});
const touch = (pointerId = 1) => ({pointerType: 'touch', pointerId});
const mouse = (pointerId = 1) => ({pointerType: 'mouse', pointerId, button: 0});

beforeEach(() => {
  __resetMenuPressForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMenuPress — tracking inside the menu', () => {
  it('acts on the row under the RELEASE, not the row the press began on', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerUp(row('B'), touch());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('resolves the row through the hit test, not the event target (a finger stays with the element it landed on)', () => {
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        hitTest={(_x, y) => (y > 50 ? row('C') : row('A'))}
      />,
    );
    // Every event is aimed at A, as a real finger's would be.
    fireEvent.pointerDown(row('A'), {...touch(), clientY: 10});
    fireEvent.pointerMove(row('A'), {...touch(), clientY: 80});
    expect(row('C')).toHaveFocus();
    fireEvent.pointerUp(row('A'), {...touch(), clientY: 80});
    expect(onSelect).toHaveBeenCalledWith('C');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('hit-tests in the shadow root that holds the menu, not the document', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    shadow.append(container);
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />, {container});
    const inShadow = (label: string) =>
      within(container).getByRole('menuitem', {name: label});
    // As in a browser: the document answers with the shadow host; only the
    // shadow root knows the row under the point.
    Object.assign(document, {elementFromPoint: () => host});
    Object.assign(shadow, {elementFromPoint: () => inShadow('C')});
    try {
      const events = {...mouse(), composed: true, bubbles: true};
      fireEvent.pointerDown(inShadow('A'), events);
      fireEvent.pointerUp(inShadow('A'), events);
      expect(onSelect).toHaveBeenCalledWith('C');
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as {elementFromPoint?: unknown}).elementFromPoint;
      host.remove();
    }
  });

  it('moves the highlight as focus with preventScroll and without :focus-visible', () => {
    render(<Harness />);
    const b = row('B');
    const focusSpy = vi.spyOn(b, 'focus');
    fireEvent.pointerDown(row('A'), touch());
    expect(row('A')).toHaveFocus();
    fireEvent.pointerMove(b, touch());
    expect(b).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({
      preventScroll: true,
      focusVisible: false,
    });
  });

  it('clears the highlight over a disabled row or a divider and acts on nothing there', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const menu = screen.getByRole('menu');
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('D (disabled)'), touch());
    expect(menu).toHaveFocus();
    fireEvent.pointerMove(screen.getByTestId('divider'), touch());
    expect(menu).toHaveFocus();
    fireEvent.pointerUp(screen.getByTestId('divider'), touch());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('drives a custom highlight callback instead of focus when given one (a picker)', () => {
    const onHighlight = vi.fn<(row: HTMLElement | null) => void>();
    render(<Harness onHighlight={onHighlight} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerMove(screen.getByTestId('divider'), touch());
    expect(
      onHighlight.mock.calls.map(([el]) => el?.textContent ?? null),
    ).toEqual(['A', 'B', null]);
    expect(row('A')).not.toHaveFocus();
  });

  it('carries the release button and modifiers on the dispatched activation', () => {
    const clicks: MouseEvent[] = [];
    render(<Harness />);
    const b = row('B');
    b.addEventListener('click', e => clicks.push(e));
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerUp(b, {...mouse(), metaKey: true, shiftKey: true});
    expect(clicks).toHaveLength(1);
    expect(clicks[0].metaKey).toBe(true);
    expect(clicks[0].shiftKey).toBe(true);
    expect(clicks[0].detail).toBe(0);
  });
});

describe('useMenuPress — one gesture, one activation', () => {
  it('a tap on a row acts once even though the browser also reports a click', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    // The WebKit tail: a click at the touch-start point.
    fireEvent.click(row('A'), {detail: 1});
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('swallows the stray click at the window before any document listener sees it', () => {
    const onSelect = vi.fn();
    const documentListener = vi.fn();
    document.addEventListener('click', documentListener, true);
    try {
      render(<Harness onSelect={onSelect} />);
      fireEvent.pointerDown(row('A'), touch());
      fireEvent.pointerMove(row('B'), touch());
      fireEvent.pointerUp(row('B'), touch());
      documentListener.mockClear();
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      row('A').dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(true);
      expect(documentListener).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('B');
    } finally {
      document.removeEventListener('click', documentListener, true);
    }
  });

  it('lets a click with detail 0 (a keyboard or screen reader activation) through', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    fireEvent.click(row('B'), {detail: 0});
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('B');
  });

  it('lets a click with no tracked gesture behind it act as it always did', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(row('A'), {detail: 1});
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('disarms the swallower at the next pointer press, so a later tap is never eaten', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    // A new gesture begins elsewhere before the stray click ever arrived.
    fireEvent.pointerDown(screen.getByTestId('outside'), touch(2));
    fireEvent.click(row('B'), {detail: 1});
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('B');
  });

  it('disarms the swallower after the short window', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_STRAY_CLICK_MS + 1);
    });
    fireEvent.click(row('B'), {detail: 1});
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('useMenuPress — release outside and cancellation', () => {
  it('a mouse released outside acts on nothing and dismisses the menu', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<Harness onSelect={onSelect} onDismiss={onDismiss} />);
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerMove(screen.getByTestId('outside'), mouse());
    fireEvent.pointerUp(screen.getByTestId('outside'), mouse());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a finger released outside acts on nothing and leaves the menu open', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<Harness onSelect={onSelect} onDismiss={onDismiss} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(screen.getByTestId('outside'), touch());
    fireEvent.pointerUp(screen.getByTestId('outside'), touch());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a pointercancel ends the gesture without acting', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerCancel(row('A'), touch());
    fireEvent.pointerUp(row('B'), touch());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a second pointer ends the gesture and does not start another', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch(1));
    fireEvent.pointerDown(row('B'), touch(2));
    fireEvent.pointerUp(row('B'), touch(2));
    fireEvent.pointerUp(row('C'), touch(1));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores a pointer of another id while one is tracked', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch(1));
    fireEvent.pointerMove(row('C'), touch(7));
    expect(row('A')).toHaveFocus();
    fireEvent.pointerUp(row('C'), touch(7));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('useMenuPress — the trigger', () => {
  it('a mouse released back on the trigger acts on nothing and leaves the menu open', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<Harness onSelect={onSelect} onDismiss={onDismiss} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerMove(trigger, mouse());
    fireEvent.pointerUp(trigger, mouse());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a mouse press on the trigger opens the menu, and that gesture’s click does not toggle it', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, mouse());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(trigger, mouse());
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('a mouse press on the trigger of an open menu closes it and does not reopen it in the same gesture', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, mouse());
    fireEvent.pointerUp(trigger, mouse());
    fireEvent.click(trigger, {detail: 1});
    fireEvent.pointerDown(trigger, mouse());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.pointerUp(trigger, mouse());
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a drag from the trigger into the menu that releases over a row acts on it', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, mouse());
    fireEvent.pointerMove(row('B'), mouse());
    expect(row('B')).toHaveFocus();
    fireEvent.pointerUp(row('B'), mouse());
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('the opening release before the settle time acts on nothing; after it, it acts', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, mouse());
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_SETTLE_MS - 1);
    });
    fireEvent.pointerUp(row('B'), mouse());
    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(trigger, mouse());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerUp(trigger, mouse());
    fireEvent.pointerDown(trigger, mouse());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_SETTLE_MS);
    });
    fireEvent.pointerUp(row('B'), mouse());
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('a finger held on the trigger opens after the long-press delay and then tracks', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(<Harness onSelect={onSelect} onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, touch());
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS - 1);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerMove(row('C'), touch());
    expect(row('C')).toHaveFocus();
    fireEvent.pointerUp(row('C'), touch());
    expect(onSelect).toHaveBeenCalledWith('C');
  });

  it('a finger that lifts before the delay is a tap: the browser click opens the menu', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, touch());
    fireEvent.pointerUp(trigger, touch());
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('a finger that travels on the trigger is a scroll, not a held press', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    fireEvent.pointerMove(trigger, {...touch(), clientX: 0, clientY: 40});
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('marks the menu root as carrying the press model', () => {
    render(<Harness />);
    expect(screen.getByRole('menu')).toHaveAttribute('data-astryx-menu-press');
  });
});

describe('useMenuPress — edge autoscroll', () => {
  it('a pointer resting near the bottom edge scrolls the menu down and stops when it leaves the zone', () => {
    vi.useFakeTimers();
    render(<Harness getScroller={() => screen.getByRole('menu')} />);
    const menu = screen.getByRole('menu');
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 100,
      left: 0,
      right: 200,
      width: 200,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(row('A'), {...touch(), clientY: 50});
    expect(menu.scrollTop).toBe(0);
    fireEvent.pointerMove(row('A'), {
      ...touch(),
      clientY: 100 - MENU_PRESS_AUTOSCROLL_ZONE_PX / 2,
    });
    const afterFirst = menu.scrollTop;
    expect(afterFirst).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(menu.scrollTop).toBeGreaterThan(afterFirst);

    fireEvent.pointerMove(row('A'), {...touch(), clientY: 50});
    const atRest = menu.scrollTop;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(menu.scrollTop).toBe(atRest);

    fireEvent.pointerUp(row('A'), {...touch(), clientY: 50});
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(menu.scrollTop).toBe(atRest);
  });

  it('gives the page back its scroll when a held finger is cancelled', () => {
    // A held finger installs a document-level touchmove preventer so the page
    // does not scroll under the opening menu. Only the end of a gesture takes
    // it off again, and a pointercancel is ordinary on touch — an incoming
    // call, a system gesture. Cancelling used to leave the preventer live and
    // the page unable to scroll at all.
    vi.useFakeTimers();
    render(<Harness />);
    const trigger = screen.getByRole('button', {name: 'Open'});

    fireEvent.pointerDown(trigger, {...touch(), clientX: 10, clientY: 10});
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const held = new Event('touchmove', {bubbles: true, cancelable: true});
    document.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);

    fireEvent.pointerCancel(trigger, touch());

    const afterCancel = new Event('touchmove', {
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(afterCancel);
    expect(afterCancel.defaultPrevented).toBe(false);
  });
});

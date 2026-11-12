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

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {Suspense, startTransition, use, useRef, useState} from 'react';
import {
  MENU_PRESS_AUTOSCROLL_ZONE_PX,
  MENU_PRESS_LONG_PRESS_MS,
  MENU_PRESS_STRAY_CLICK_MS,
  __resetMenuPressForTest,
  useMenuPress,
} from './useMenuPress';
import {MENU_PRESS_HANDOFF_PX, MENU_PRESS_SETTLE_MS} from './menuPressGesture';
import {holdInput, isInputShield} from '../Layer/inputHold';
import {
  isMenuPressLit,
  isMenuPressPaintHeld,
} from '../privateAttributes/menuPressLit.stylex';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {scroll} from '../motion/uikit/scroll';

/**
 * The page under a finger (a coarse primary pointer), as WebKit on iOS when
 * `ios` (`CSS.supports` answers yes for `-webkit-touch-callout`) or as any
 * other engine. The touch model is the same either way.
 */
function emulateTouch({ios}: {ios: boolean}): void {
  const original = (globalThis as {CSS?: typeof CSS}).CSS;
  vi.stubGlobal('CSS', {
    escape: original?.escape?.bind(original) ?? ((value: string) => value),
    supports: (query: string) => ios && query.includes('-webkit-touch-callout'),
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** A touchscreen laptop: the primary pointer is fine, and a finger may still press. */
function emulateFinePointer(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/** A scrollable container whose content overflows it: a scroll view. */
function ScrollView({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{overflowY: 'auto', height: 100}}
      ref={node => {
        if (node != null) {
          Object.defineProperty(node, 'scrollHeight', {
            configurable: true,
            value: 1000,
          });
          Object.defineProperty(node, 'clientHeight', {
            configurable: true,
            value: 100,
          });
        }
      }}>
      {children}
    </div>
  );
}

interface HarnessProps {
  onSelect?: (label: string) => void;
  onDismiss?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
  hitTest?: (x: number, y: number) => Element | null;
  getScroller?: () => HTMLElement | null;
  onHighlight?: (row: HTMLElement | null) => void;
  touchModel?: 'pointer' | 'uikit';
  longPressDelayMs?: number;
}

function Harness({
  onSelect,
  onDismiss,
  onOpenChange,
  hitTest,
  getScroller,
  onHighlight,
  touchModel,
  longPressDelayMs,
}: HarnessProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };
  // The harness picks the touch model as DropdownMenu does, through the
  // delay: `touchModel="uikit"` leaves it unset. Without `touchModel` it keeps
  // the pointer model with the released wait.
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
    longPressDelayMs:
      touchModel === 'uikit'
        ? undefined
        : (longPressDelayMs ?? MENU_PRESS_LONG_PRESS_MS),
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
const pen = (pointerId = 1) => ({pointerType: 'pen', pointerId, button: 0});

/** A cancelable `touchend` at `target`, as a browser fires it after the touch's `pointerup`. */
function fireTouchEnd(target: Element): Event {
  const event = new Event('touchend', {bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  __resetMenuPressForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useMenuPress — an input hold over the menu', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
    Reflect.deleteProperty(document, 'elementsFromPoint');
  });

  it('its shield does not hide the rows from the finger already in the gesture (spec:AST-094 FR29, FR35)', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const menu = screen.getByRole('menu');
    // The finger is pressed before the hold starts, as the finger that opened
    // the menu is.
    fireEvent.pointerDown(row('A'), touch());
    // The layer runtime's hold covers the viewport while the menu enters. A
    // hit test there answers with its shield, which is not content.
    const release = holdInput(menu, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    try {
      const shield = [...menu.children].find(isInputShield);
      expect(shield).toBeDefined();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => shield,
      });
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: () => [shield, row('B'), menu, document.body],
      });
      fireEvent.pointerMove(row('A'), {...touch(), clientX: 5, clientY: 20});
      expect(row('B')).toHaveFocus();
      fireEvent.pointerUp(row('A'), {...touch(), clientX: 5, clientY: 20});
      expect(onSelect).toHaveBeenCalledWith('B');
    } finally {
      release();
    }
  });

  it('anything else over the menu still covers it: only a hold\u2019s shield is seen through', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const menu = screen.getByRole('menu');
    const overlay = document.createElement('div');
    document.body.append(overlay);
    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => overlay,
      });
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: () => [overlay, row('B'), menu, document.body],
      });
      fireEvent.pointerDown(row('A'), touch());
      fireEvent.pointerMove(row('A'), {...touch(), clientX: 5, clientY: 20});
      expect(row('B')).not.toHaveFocus();
      fireEvent.pointerUp(row('A'), {...touch(), clientX: 5, clientY: 20});
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      overlay.remove();
    }
  });
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

  it('drives the committed highlight callback after React discards a render with another', async () => {
    // A transition that suspends for good: React renders it, then keeps the
    // committed tree and never commits that render.
    const forever = new Promise<never>(() => {});
    function Forever(): null {
      use(forever);
      return null;
    }
    function Screen({
      onHighlight,
      isPending = false,
    }: {
      onHighlight: (row: HTMLElement | null) => void;
      isPending?: boolean;
    }) {
      return (
        <Suspense fallback={null}>
          <Harness onHighlight={onHighlight} />
          {isPending ? <Forever /> : null}
        </Suspense>
      );
    }
    const onHighlight = vi.fn<(row: HTMLElement | null) => void>();
    const discardedOnHighlight = vi.fn<(row: HTMLElement | null) => void>();
    const {rerender} = render(<Screen onHighlight={onHighlight} />);
    await act(async () => {
      startTransition(() => {
        rerender(<Screen onHighlight={discardedOnHighlight} isPending />);
      });
    });

    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());

    expect(
      onHighlight.mock.calls.map(([el]) => el?.textContent ?? null),
    ).toEqual(['A', 'B']);
    expect(discardedOnHighlight).not.toHaveBeenCalled();
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

describe('useMenuPress — the row a held press lights (spec:AST-094 FR27, FR43)', () => {
  const lit = () =>
    screen
      .getAllByRole('menuitem')
      .filter(each => isMenuPressLit(each))
      .map(each => each.textContent);

  it.each([
    ['finger', touch()],
    ['pen', {pointerType: 'pen', pointerId: 1}],
  ])(
    'marks the row under a held %s as it moves, no row off the rows, and none once the press ends',
    (_name, pointer) => {
      render(<Harness />);
      fireEvent.pointerDown(row('A'), pointer);
      expect(lit()).toEqual(['A']);
      fireEvent.pointerMove(row('B'), pointer);
      expect(lit()).toEqual(['B']);
      fireEvent.pointerMove(row('C'), pointer);
      expect(lit()).toEqual(['C']);
      fireEvent.pointerMove(screen.getByTestId('divider'), pointer);
      expect(lit()).toEqual([]);
      fireEvent.pointerMove(row('D (disabled)'), pointer);
      expect(lit()).toEqual([]);
      fireEvent.pointerMove(row('B'), pointer);
      expect(lit()).toEqual(['B']);
      fireEvent.pointerUp(screen.getByTestId('outside'), pointer);
      expect(lit()).toEqual([]);
      expect(row('B')).toHaveFocus();
    },
  );

  it.each([
    ['finger', touch()],
    ['pen', {pointerType: 'pen', pointerId: 1}],
  ])(
    'holds the rows off their own pressed paint while a held %s presses, and gives it back once the press ends',
    (_name, pointer) => {
      render(<Harness />);
      const menu = screen.getByRole('menu');
      expect(isMenuPressPaintHeld(menu)).toBe(false);
      fireEvent.pointerDown(row('A'), pointer);
      expect(isMenuPressPaintHeld(menu)).toBe(true);
      fireEvent.pointerMove(screen.getByTestId('divider'), pointer);
      expect(isMenuPressPaintHeld(menu)).toBe(true);
      fireEvent.pointerUp(screen.getByTestId('outside'), pointer);
      expect(isMenuPressPaintHeld(menu)).toBe(false);
    },
  );

  it('leaves the rows their own pressed paint under a held mouse', () => {
    render(<Harness />);
    const menu = screen.getByRole('menu');
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerMove(row('B'), mouse());
    expect(isMenuPressPaintHeld(menu)).toBe(false);
    fireEvent.pointerUp(screen.getByTestId('outside'), mouse());
    expect(isMenuPressPaintHeld(menu)).toBe(false);
  });

  it('lights the row under a held mouse with focus alone, so it keeps the hover tint', () => {
    render(<Harness />);
    fireEvent.pointerDown(row('A'), mouse());
    expect(row('A')).toHaveFocus();
    expect(lit()).toEqual([]);
    fireEvent.pointerMove(row('B'), mouse());
    expect(row('B')).toHaveFocus();
    expect(lit()).toEqual([]);
    fireEvent.pointerUp(screen.getByTestId('outside'), mouse());
    expect(lit()).toEqual([]);
  });

  it('marks the row under the finger that opened the menu once it hands off, and clears it at the lift', () => {
    vi.useFakeTimers();
    render(<Harness touchModel="uikit" />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    fireEvent.pointerMove(row('A'), {...touch(), clientX: 0, clientY: 4});
    expect(lit()).toEqual([]);
    const past = {...touch(), clientX: 0, clientY: 4 + MENU_PRESS_HANDOFF_PX};
    fireEvent.pointerMove(row('A'), past);
    expect(lit()).toEqual(['A']);
    fireEvent.pointerMove(row('B'), {...past, clientY: past.clientY + 30});
    expect(lit()).toEqual(['B']);
    fireEvent.pointerCancel(row('B'), past);
    expect(lit()).toEqual([]);
  });

  it('paints every menu row family: each composes the lit style and reads its variable', () => {
    for (const family of [
      'DropdownMenuItem',
      'DropdownMenuCheckboxItem',
      'DropdownMenuRadioItem',
      'DropdownMenuSubMenu',
    ]) {
      const source = readFileSync(
        resolve(__dirname, `../DropdownMenu/${family}.tsx`),
        'utf8',
      );
      expect(source).toContain('menuPressLitRowStyle,');
      expect(source).toContain('var(--_menu-row-focus-paint, ');
    }
    // The one family with an :active background reads its variable there.
    const item = readFileSync(
      resolve(__dirname, '../DropdownMenu/DropdownMenuItem.tsx'),
      'utf8',
    );
    expect(item).toContain('var(--_menu-row-active-paint, ');
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

describe("useMenuPress — a finger's touchend (spec:AST-094 FR21)", () => {
  // A phone or tablet (a coarse primary pointer), or a touchscreen laptop
  // (a fine one): FR21 covers a finger on every device (spec:AST-094 FR43).
  const stubPrimaryPointer = (kind: 'coarse' | 'fine') => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: kind === 'coarse' && query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  };
  beforeEach(() => {
    stubPrimaryPointer('coarse');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a finger's tap on a row cancels that touch's touchend, so the browser sends no click", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('a finger that slides onto another row and lifts there cancels its touchend', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerUp(row('B'), touch());
    // The touch's events stay with the element it landed on.
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('a finger released outside the menu cancels its touchend, and the menu stays open', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(screen.getByTestId('outside'), touch());
    fireEvent.pointerUp(screen.getByTestId('outside'), touch());
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('the finger that opened the menu from the trigger cancels its touchend at the lift', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, touch());
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    fireEvent.pointerMove(row('C'), touch());
    fireEvent.pointerUp(row('C'), touch());
    expect(fireTouchEnd(trigger).defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith('C');
  });

  it("a finger's tap on the trigger keeps its touchend: its click opens the menu", () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, touch());
    fireEvent.pointerUp(trigger, touch());
    expect(fireTouchEnd(trigger).defaultPrevented).toBe(false);
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('a mouse or a pen release cancels no touchend; its stray click is still swallowed', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    for (const pointer of [mouse, pen]) {
      fireEvent.pointerDown(row('A'), pointer());
      fireEvent.pointerUp(row('A'), pointer());
      expect(fireTouchEnd(row('A')).defaultPrevented).toBe(false);
      fireEvent.click(row('A'), {detail: 1});
    }
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('a touch the browser took (pointercancel) has its touchend left alone', () => {
    render(<Harness />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerCancel(row('A'), touch());
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(false);
  });

  it('once the touchend is cancelled, the swallower stands down: a later click with no press behind it acts (module FR5)', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(true);
    // Well inside the stray-click window, a click that no tracked gesture
    // explains, a script's say.
    fireEvent.click(row('B'), {detail: 1});
    expect(onSelect.mock.calls).toEqual([['A'], ['B']]);
  });

  it('where the primary pointer is fine too, a finger\u2019s tracked release cancels its touchend, and its stray click acts on nothing (spec:AST-094 FR21, FR43)', () => {
    stubPrimaryPointer('fine');
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerUp(row('B'), touch());
    expect(fireTouchEnd(row('B')).defaultPrevented).toBe(true);
    expect(onSelect.mock.calls).toEqual([['B']]);
  });

  it('where the primary pointer is fine too, a finger that lifts outside the menu has its touchend cancelled, and the menu stays open (spec:AST-094 FR21, FR28, FR43)', () => {
    stubPrimaryPointer('fine');
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(screen.getByTestId('outside'), touch());
    fireEvent.pointerUp(screen.getByTestId('outside'), touch());
    expect(fireTouchEnd(screen.getByTestId('outside')).defaultPrevented).toBe(
      true,
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cancels only that touch: the next press ends the wait, and a later touchend passes', () => {
    render(<Harness />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('A'), touch());
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(true);
    expect(fireTouchEnd(row('A')).defaultPrevented).toBe(false);
    fireEvent.pointerDown(row('B'), touch(2));
    fireEvent.pointerUp(row('B'), touch(2));
    fireEvent.pointerDown(screen.getByTestId('outside'), touch(3));
    expect(fireTouchEnd(row('B')).defaultPrevented).toBe(false);
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

  it('after the window loses focus mid-press, the finger\u2019s later lift acts on nothing: its click is still the gesture\u2019s (FR5, spec:AST-094 FR28)', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch(1));
    fireEvent.pointerMove(row('B'), touch(1));
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    // The browser kept the touch alive across the blur: it lifts on a row,
    // and the click it reports for that tap reaches the row.
    fireEvent.pointerUp(row('B'), touch(1));
    fireEvent.click(row('B'), {detail: 1});
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('after a blur, a finger whose release the page never sees leaves the next press\u2019s click to act (FR5)', () => {
    const onOutside = vi.fn();
    render(<Harness />);
    const outside = screen.getByTestId('outside');
    outside.addEventListener('click', onOutside);
    fireEvent.pointerDown(row('A'), touch(1));
    fireEvent.pointerMove(row('B'), touch(1));
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    // The finger lifted where the page could not see it. A mouse, with the
    // same pointer id, then clicks a control outside the menu.
    fireEvent.pointerDown(outside, mouse(1));
    fireEvent.pointerUp(outside, mouse(1));
    fireEvent.click(outside, {detail: 1});
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('a blurred finger\u2019s gesture keeps no document listener past its end: the menu unmounting before the lift takes them all off (module PR1)', () => {
    // The document's live pointer listeners, as [type, listener] pairs.
    const live: [string, unknown][] = [];
    const types = new Set(['pointerup', 'pointercancel', 'pointermove']);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    add.mockImplementation(function (
      this: Document,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (types.has(type)) {
        live.push([type, listener]);
      }
      EventTarget.prototype.addEventListener.call(
        this,
        type,
        listener,
        options,
      );
    });
    remove.mockImplementation(function (
      this: Document,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      const index = live.findIndex(([t, l]) => t === type && l === listener);
      if (index >= 0) {
        live.splice(index, 1);
      }
      EventTarget.prototype.removeEventListener.call(
        this,
        type,
        listener,
        options,
      );
    });
    try {
      const {unmount} = render(<Harness />);
      fireEvent.pointerDown(row('A'), touch(1));
      fireEvent.pointerMove(row('B'), touch(1));
      act(() => {
        window.dispatchEvent(new FocusEvent('blur'));
      });
      // The menu closes and unmounts before the finger lifts.
      unmount();
      expect(live.map(([type]) => type)).toEqual([]);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('a blurred finger\u2019s release ends its gesture: the next press in the menu acts as usual', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch(1));
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    fireEvent.pointerUp(row('A'), touch(1));
    fireEvent.click(row('A'), {detail: 1});
    expect(onSelect).not.toHaveBeenCalled();
    // A later tap is a gesture of its own.
    fireEvent.pointerDown(row('B'), touch(2));
    fireEvent.pointerUp(row('B'), touch(2));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('a mouse press the window\u2019s blur interrupts keeps its click, as before (spec:AST-017 FR59)', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), mouse(1));
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    fireEvent.pointerUp(row('B'), mouse(1));
    fireEvent.click(row('B'), {detail: 1});
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('B');
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

  it('a pointercancel clears the row a finger lit under either touch model (the browser took it for a scroll); a mouse keeps its highlight (spec:AST-094 FR28, spec:AST-017 FR59)', () => {
    for (const touchModel of ['uikit', 'pointer'] as const) {
      const onHighlight = vi.fn();
      const {unmount} = render(
        <Harness touchModel={touchModel} onHighlight={onHighlight} />,
      );
      fireEvent.pointerDown(row('A'), touch());
      fireEvent.pointerMove(row('B'), touch());
      expect(onHighlight).toHaveBeenLastCalledWith(row('B'));
      fireEvent.pointerCancel(row('B'), touch());
      expect(onHighlight, touchModel).toHaveBeenLastCalledWith(null);
      unmount();
    }
    const onMouseHighlight = vi.fn();
    render(<Harness onHighlight={onMouseHighlight} />);
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerMove(row('B'), mouse());
    fireEvent.pointerCancel(row('B'), mouse());
    expect(onMouseHighlight).toHaveBeenLastCalledWith(row('B'));
  });

  it('a second finger ends the gesture and clears the row the first one lit, under either touch model (spec:AST-094 FR28, FR43)', () => {
    for (const touchModel of ['uikit', 'pointer'] as const) {
      const onHighlight = vi.fn();
      const {unmount} = render(
        <Harness touchModel={touchModel} onHighlight={onHighlight} />,
      );
      fireEvent.pointerDown(row('A'), touch(1));
      fireEvent.pointerMove(row('B'), touch(1));
      expect(onHighlight).toHaveBeenLastCalledWith(row('B'));
      // A second finger lands, inside the menu or anywhere else.
      fireEvent.pointerDown(document.body, touch(2));
      expect(onHighlight, touchModel).toHaveBeenLastCalledWith(null);
      unmount();
    }
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

  it('under the UIKit model a finger opens the menu as it presses a trigger in no scroll view, and tracks once it travels the handoff', () => {
    emulateTouch({ios: true});
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Harness
        touchModel="uikit"
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    // The press itself opens it, and its compatibility
    // mouse events are suppressed so they cannot take focus back.
    const isNotCancelled = fireEvent.pointerDown(trigger, {
      ...touch(),
      clientX: 0,
      clientY: 0,
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(isNotCancelled).toBe(false);
    // The first sample after the open is where the handoff counts from.
    fireEvent.pointerMove(row('C'), {...touch(), clientX: 0, clientY: 4});
    expect(row('C')).not.toHaveFocus();
    fireEvent.pointerMove(row('C'), {...touch(), clientX: 0, clientY: 40});
    expect(row('C')).toHaveFocus();
    fireEvent.pointerUp(row('C'), {...touch(), clientX: 0, clientY: 40});
    expect(onSelect).toHaveBeenCalledWith('C');
  });

  it('an Android finger (no iOS engine) gets the same touch model: the same open, the same handoff', () => {
    vi.useFakeTimers();
    emulateTouch({ios: false});
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Harness
        touchModel="uikit"
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // The mechanics are the same on every touch screen: the handoff first.
    fireEvent.pointerMove(row('C'), {...touch(), clientX: 0, clientY: 4});
    expect(row('C')).not.toHaveFocus();
    fireEvent.pointerMove(row('C'), {...touch(), clientX: 0, clientY: 40});
    expect(row('C')).toHaveFocus();
  });

  it('the pointer model (the default) keeps the released trigger: a held finger opens at 500 ms, or longPressDelayMs; the touch model opens on the press', () => {
    vi.useFakeTimers();
    const opensAt = (props: Partial<HarnessProps>) => {
      const onOpenChange = vi.fn();
      const {unmount} = render(
        <Harness onOpenChange={onOpenChange} {...props} />,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
      let elapsed = 0;
      while (onOpenChange.mock.calls.length === 0 && elapsed < 2000) {
        act(() => {
          vi.advanceTimersByTime(10);
        });
        elapsed += 10;
      }
      fireEvent.pointerUp(trigger, {...touch(), clientX: 0, clientY: 0});
      unmount();
      return elapsed;
    };
    expect(MENU_PRESS_LONG_PRESS_MS).toBe(500);
    expect(opensAt({})).toBe(500);
    expect(opensAt({longPressDelayMs: 700})).toBe(700);
    expect(opensAt({touchModel: 'uikit'})).toBe(0);
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

  it('inside a scroll view a held finger opens the menu once the content-touch delay passes with no scroll', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    render(
      <ScrollView>
        <Harness touchModel="uikit" onOpenChange={onOpenChange} />
      </ScrollView>,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(scroll.delaysContentTouchesMs - 1);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('inside a scroll view a tap that ends before the content-touch delay opens the menu at its lift', () => {
    // A tap that ends before the delay opens the menu at its lift.
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    render(
      <ScrollView>
        <Harness touchModel="uikit" onOpenChange={onOpenChange} />
      </ScrollView>,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(scroll.delaysContentTouchesMs - 60);
    });
    fireEvent.pointerUp(trigger, {...touch(), clientX: 0, clientY: 0});
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(scroll.delaysContentTouchesMs);
    });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('inside a scroll view a finger that drifts up to the allowance still opens; farther, the scroll takes the touch', () => {
    vi.useFakeTimers();
    const opened = (dy: number) => {
      const onOpenChange = vi.fn();
      const {unmount} = render(
        <ScrollView>
          <Harness touchModel="uikit" onOpenChange={onOpenChange} />
        </ScrollView>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
      fireEvent.pointerMove(trigger, {...touch(), clientX: 0, clientY: dy});
      act(() => {
        vi.advanceTimersByTime(scroll.delaysContentTouchesMs);
      });
      const result = onOpenChange.mock.calls.length > 0;
      fireEvent.pointerUp(trigger, {...touch(), clientX: 0, clientY: dy});
      unmount();
      return result;
    };
    // UIKit lab, iOS 26.2: 12 pt opened, 14 pt did not.
    expect(UIKIT_GESTURES.menuPress.holdOpenSlop.value).toBe(13);
    expect(opened(12)).toBe(true);
    expect(opened(14)).toBe(false);
  });

  it('a trigger in a fixed bar over scrolling page content opens as the finger presses; in the content itself it waits for the content-touch delay', () => {
    vi.useFakeTimers();
    const root = document.documentElement;
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      value: 4000,
    });
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    try {
      const opensAt = (inFixedBar: boolean) => {
        const onOpenChange = vi.fn();
        const harness = (
          <Harness touchModel="uikit" onOpenChange={onOpenChange} />
        );
        const {unmount} = render(
          inFixedBar ? (
            <div style={{position: 'fixed'}}>{harness}</div>
          ) : (
            harness
          ),
        );
        const trigger = screen.getByRole('button', {name: 'Open'});
        fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
        let elapsed = 0;
        while (onOpenChange.mock.calls.length === 0 && elapsed < 1000) {
          act(() => {
            vi.advanceTimersByTime(10);
          });
          elapsed += 10;
        }
        fireEvent.pointerUp(trigger, {...touch(), clientX: 0, clientY: 0});
        unmount();
        return elapsed;
      };
      expect(opensAt(true)).toBe(0);
      expect(opensAt(false)).toBe(scroll.delaysContentTouchesMs);
    } finally {
      delete (root as unknown as Record<string, unknown>).scrollHeight;
      delete (root as unknown as Record<string, unknown>).clientHeight;
    }
  });

  it('a trigger under a sticky ancestor in scrolling page content is in a scroll view and waits for the content-touch delay; under a fixed one it opens as the finger presses (spec:AST-094 FR11)', () => {
    vi.useFakeTimers();
    const root = document.documentElement;
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      value: 4000,
    });
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    try {
      const opensAt = (position: 'sticky' | 'fixed') => {
        const onOpenChange = vi.fn();
        const {unmount} = render(
          <div style={{position, top: 0}}>
            <Harness touchModel="uikit" onOpenChange={onOpenChange} />
          </div>,
        );
        const trigger = screen.getByRole('button', {name: 'Open'});
        fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
        let elapsed = 0;
        while (onOpenChange.mock.calls.length === 0 && elapsed < 1000) {
          act(() => {
            vi.advanceTimersByTime(10);
          });
          elapsed += 10;
        }
        fireEvent.pointerUp(trigger, {...touch(), clientX: 0, clientY: 0});
        unmount();
        return elapsed;
      };
      expect(opensAt('sticky')).toBe(scroll.delaysContentTouchesMs);
      expect(opensAt('fixed')).toBe(0);
    } finally {
      delete (root as unknown as Record<string, unknown>).scrollHeight;
      delete (root as unknown as Record<string, unknown>).clientHeight;
    }
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

  it("a finger held on the trigger may drift 12 pt and still opens under every primary pointer; past FR29's 13 pt drift allowance it is a scroll (spec:AST-094 FR29, FR43; useMenuPress FR9)", () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    const pointerIs = (coarse: boolean) => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) =>
          ({
            matches: coarse && query === '(pointer: coarse)',
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
          }) as MediaQueryList,
      });
    };
    const hold = (drift: number) => {
      const onOpenChange = vi.fn();
      const {unmount} = render(<Harness onOpenChange={onOpenChange} />);
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
      fireEvent.pointerMove(trigger, {...touch(), clientX: 0, clientY: drift});
      act(() => {
        vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
      });
      const opened = onOpenChange.mock.calls.some(([open]) => open === true);
      fireEvent.pointerUp(trigger, touch());
      unmount();
      return opened;
    };
    try {
      for (const coarse of [true, false]) {
        pointerIs(coarse);
        expect(hold(12)).toBe(true);
        expect(hold(14)).toBe(false);
      }
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it("measures FR29's drift allowance on each axis where the primary pointer is fine, as on a phone: a finger's (12, 12) settle on the trigger still opens, a 14 px drift does not (useMenuPress FR9)", () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    });
    const hold = (dx: number, dy: number) => {
      const onOpenChange = vi.fn();
      const {unmount} = render(<Harness onOpenChange={onOpenChange} />);
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
      fireEvent.pointerMove(trigger, {...touch(), clientX: dx, clientY: dy});
      act(() => {
        vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
      });
      const opened = onOpenChange.mock.calls.some(([open]) => open === true);
      fireEvent.pointerUp(trigger, touch());
      unmount();
      return opened;
    };
    try {
      expect(hold(12, 12)).toBe(true);
      expect(hold(0, 14)).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('reads no pointer query from a menu, its rows or its trigger, a press on the trigger included: its drift allowance is the same under every primary pointer (spec:AST-094 FR24, FR43)', () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    const listening: string[] = [];
    const read: string[] = [];
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        read.push(query) &&
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => listening.push(query),
          removeEventListener: () => {},
          addListener: () => listening.push(query),
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList),
    });
    try {
      const {unmount} = render(<Harness />);
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
      act(() => {
        vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
      });
      fireEvent.pointerUp(trigger, touch());
      expect(listening.filter(query => query.includes('pointer'))).toEqual([]);
      expect(read.filter(query => query.includes('pointer'))).toEqual([]);
      unmount();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('marks the menu root as carrying the press model', () => {
    render(<Harness />);
    expect(screen.getByRole('menu')).toHaveAttribute('data-astryx-menu-press');
  });
});

describe('useMenuPress — the opening finger hands off (DropdownMenu\u2019s touch model, spec:AST-094 FR29)', () => {
  it('the finger that opened the menu from the trigger picks only once it travels the handoff from the first sample', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Harness
        touchModel="uikit"
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // The first sample after the open is where the distance counts from.
    fireEvent.pointerMove(row('C'), {...touch(), clientX: 0, clientY: 4});
    fireEvent.pointerMove(row('C'), {
      ...touch(),
      clientX: 0,
      clientY: 4 + MENU_PRESS_HANDOFF_PX - 1,
    });
    expect(row('C')).not.toHaveFocus();
    fireEvent.pointerMove(row('C'), {
      ...touch(),
      clientX: 0,
      clientY: 4 + MENU_PRESS_HANDOFF_PX,
    });
    expect(row('C')).toHaveFocus();
    fireEvent.pointerUp(row('C'), {
      ...touch(),
      clientX: 0,
      clientY: 4 + MENU_PRESS_HANDOFF_PX,
    });
    expect(onSelect).toHaveBeenCalledWith('C');
  });

  it('the finger that opened the menu lifts without travelling the handoff: nothing acts and the menu stays', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Harness
        touchModel="uikit"
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // The row under the finger is not highlighted however long it rests.
    fireEvent.pointerMove(row('A'), {...touch(), clientX: 0, clientY: 1});
    fireEvent.pointerMove(row('A'), {...touch(), clientX: 0, clientY: 9});
    expect(row('A')).not.toHaveFocus();
    fireEvent.pointerUp(row('A'), {...touch(), clientX: 0, clientY: 9});
    // The browser's click for the press is spent too.
    fireEvent.click(row('A'), {detail: 1});
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('the pointer model (a set delay\u2019s) keeps the settle rule: once the press has settled, a still finger\u2019s lift over a row acts', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, {...touch(), clientX: 0, clientY: 0});
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS + MENU_PRESS_SETTLE_MS);
    });
    fireEvent.pointerMove(row('A'), {...touch(), clientX: 0, clientY: 2});
    fireEvent.pointerUp(row('A'), {...touch(), clientX: 0, clientY: 2});
    expect(onSelect).toHaveBeenCalledWith('A');
  });
});

describe('useMenuPress — the public hook takes no touch model option', () => {
  function PublicHarness({
    onSelect,
    onOpenChange,
    longPressDelayMs,
  }: {
    onSelect?: (label: string) => void;
    onOpenChange?: (open: boolean) => void;
    longPressDelayMs?: number;
  }) {
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const press = useMenuPress({
      menuRef,
      triggerRef,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress: () => {
        setIsOpen(true);
        onOpenChange?.(true);
        return true;
      },
      longPressDelayMs,
      // An untyped caller passing DropdownMenu's own option gets nothing
      // from it: the touch model is not part of the public hook.
      ...({touchModel: 'uikit'} as object),
    });
    return (
      <>
        <button type="button" ref={triggerRef} {...press.triggerProps}>
          Open
        </button>
        {isOpen ? (
          <div ref={menuRef} role="menu" {...press.menuProps}>
            <div role="menuitem" tabIndex={-1} onClick={() => onSelect?.('A')}>
              A
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // A set delay keeps the released model, and the passed touch model must
  // not change that.
  it('with a delay set, the opening finger keeps the settle rule, though an untyped caller passes the touch model', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <PublicHarness
        onSelect={onSelect}
        longPressDelayMs={MENU_PRESS_LONG_PRESS_MS}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      ...touch(),
      clientX: 0,
      clientY: 0,
    });
    act(() => {
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS + MENU_PRESS_SETTLE_MS);
    });
    // No handoff: the settled press's still lift acts, as released.
    fireEvent.pointerMove(row('A'), {...touch(), clientX: 0, clientY: 2});
    fireEvent.pointerUp(row('A'), {...touch(), clientX: 0, clientY: 2});
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('with a delay set, a finger press on the trigger does not open the menu by itself, though an untyped caller passes the touch model', () => {
    const onOpenChange = vi.fn();
    render(
      <PublicHarness
        onOpenChange={onOpenChange}
        longPressDelayMs={MENU_PRESS_LONG_PRESS_MS}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('with no delay set, a finger opens the menu as it presses where the primary pointer is coarse (spec:AST-094 FR25, FR29)', () => {
    emulateTouch({ios: false});
    const onOpenChange = vi.fn();
    render(<PublicHarness onOpenChange={onOpenChange} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('with no delay set, a finger opens the menu as it presses where the primary pointer is fine too, a touchscreen laptop as a phone (spec:AST-094 FR29, FR43)', () => {
    emulateFinePointer();
    const onOpenChange = vi.fn();
    render(<PublicHarness onOpenChange={onOpenChange} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('with no delay set, a finger on a trigger in a scroll view waits the content-touch delay: closed at 149 ms, open at 150 ms (spec:AST-094 FR29)', () => {
    vi.useFakeTimers();
    emulateTouch({ios: false});
    const onOpenChange = vi.fn();
    render(
      <ScrollView>
        <PublicHarness onOpenChange={onOpenChange} />
      </ScrollView>,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    act(() => {
      vi.advanceTimersByTime(scroll.delaysContentTouchesMs - 1);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('with a delay set, a finger waits for it on a touch screen too, as released', () => {
    vi.useFakeTimers();
    emulateTouch({ios: false});
    const onOpenChange = vi.fn();
    render(
      <PublicHarness onOpenChange={onOpenChange} longPressDelayMs={500} />,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
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

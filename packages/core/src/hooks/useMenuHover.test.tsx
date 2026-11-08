// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useMenuHover.test.tsx
 * @input Uses vitest, @testing-library/react, TopNavMenu (a real consumer)
 * @output Unit tests for the shared hover-menu interaction contract (#3121)
 * @position Testing; exercised through TopNavMenu rather than a synthetic
 *           harness, so the hook cannot drift from how consumers wire it
 *
 * SYNC: When useMenuHover changes, update tests to match new behavior
 */
import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {TopNavMenu} from '../TopNav/TopNavMenu';
import {isPointInSafeTriangle, useMenuHover} from './useMenuHover';

const items = [
  {title: 'Analytics', description: 'Track user behavior', href: '/analytics'},
  {title: 'Messaging', description: 'Real-time comms', href: '/messaging'},
];

/** A touchscreen: no hover-capable pointer. */
function mockPointerlessDevice() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function renderMenu() {
  render(<TopNavMenu label="Products" items={items} />);
  return screen.getByRole('button', {name: 'Products'});
}

function firstMenuItem() {
  return document.querySelector<HTMLElement>('[role="menuitem"]');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMenuHover — hover/click guard', () => {
  it('opens on hover after the show delay', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the menu open when a hover-open is immediately clicked', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('pins a confirmed menu so leaving the trigger no longer closes it', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.click(trigger);

    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on a click that lands well after the hover-open', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Past the guard: a deliberate dismissal, not a follow-on.
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes a transient (hover-opened) menu when the pointer leaves', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('re-entering the trigger of an open menu does not re-arm the guard', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    // Click-open pins the menu.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Re-entering must not un-pin it, nor make the next click a "confirm".
    await user.unhover(trigger);
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays closed when the panel vanishing puts the trigger back under the pointer', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Without suppression, the mouseenter fired when the panel stops covering
    // the trigger reopens the menu — which made Escape look inert.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('reopens on a deliberate re-hover once the suppression window passes', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.unhover(trigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles cleanly for click-only interaction', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('useMenuHover — focus management', () => {
  it('leaves focus on the trigger for a hover-open', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(firstMenuItem()).not.toHaveFocus();
  });

  it('moves focus to the first item on a click-open, synchronously', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);

    // No waitFor and no timer flush: a deferred (rAF) focus fails here, which
    // is the point of the assertion.
    expect(firstMenuItem()).toHaveFocus();
  });

  it('moves focus into the menu when a hover-open is confirmed by click', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(firstMenuItem()).not.toHaveFocus();

    await user.click(trigger);
    expect(firstMenuItem()).toHaveFocus();
  });

  it('returns focus to the trigger when a click closes the menu', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    expect(firstMenuItem()).toHaveFocus();

    await user.click(trigger);
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the trigger on Escape', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    expect(firstMenuItem()).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});

describe('useMenuHover — keyboard activation', () => {
  it('opens on Enter and moves focus into the menu', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    trigger.focus();

    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(firstMenuItem()).toHaveFocus();
  });

  it('opens on Space', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    trigger.focus();

    await user.keyboard(' ');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('never toggles an open menu closed — it moves focus in instead', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    // A hover-open is the only state where a keyboard user can activate the
    // trigger of an open menu; closing on Enter would strand them.
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    trigger.focus();

    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(firstMenuItem()).toHaveFocus();
  });

  it('arrow keys walk the menu items', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    const menuItems =
      document.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(menuItems[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(menuItems[1]).toHaveFocus();
  });
});

describe('useMenuHover — devices without hover', () => {
  it('does not open on a synthetic mouseenter from a tap', async () => {
    mockPointerlessDevice();
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    // Taps emit a compatibility mouseenter; opening on it leaves a menu
    // hanging open behind the tap.
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('still opens and closes on click', async () => {
    mockPointerlessDevice();
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('useMenuHover — native invoker wiring', () => {
  it('registers the trigger as the panel it controls', () => {
    const trigger = renderMenu();

    // jsdom implements neither light dismiss nor invokers, so this asserts the
    // wiring; the behavior itself is browser-verified.
    expect(trigger).toHaveAttribute(
      'popovertarget',
      trigger.getAttribute('aria-controls'),
    );
  });
});

describe('isPointInSafeTriangle', () => {
  const flyout = {top: 0, bottom: 200, left: 300, right: 500};

  it('accepts a point between the apex and the near (left) edge of a flyout to the right', () => {
    const apex = {x: 250, y: 100};
    expect(isPointInSafeTriangle({x: 275, y: 100}, apex, flyout)).toBe(true);
    expect(isPointInSafeTriangle({x: 290, y: 30}, apex, flyout)).toBe(true);
    expect(isPointInSafeTriangle({x: 290, y: 180}, apex, flyout)).toBe(true);
  });

  it('rejects a point that leaves the triangle', () => {
    const apex = {x: 250, y: 100};
    expect(isPointInSafeTriangle({x: 250, y: 400}, apex, flyout)).toBe(false);
    expect(isPointInSafeTriangle({x: 200, y: 100}, apex, flyout)).toBe(false);
    expect(isPointInSafeTriangle({x: 260, y: 300}, apex, flyout)).toBe(false);
  });

  it('uses the right edge when the flyout flipped to the left of the pointer', () => {
    const apex = {x: 550, y: 100};
    expect(isPointInSafeTriangle({x: 525, y: 100}, apex, flyout)).toBe(true);
    expect(isPointInSafeTriangle({x: 600, y: 100}, apex, flyout)).toBe(false);
  });

  it('uses the top or bottom edge when the pointer left above or below the flyout', () => {
    expect(
      isPointInSafeTriangle({x: 400, y: -20}, {x: 400, y: -40}, flyout),
    ).toBe(true);
    expect(
      isPointInSafeTriangle({x: 400, y: 220}, {x: 400, y: 240}, flyout),
    ).toBe(true);
  });

  it('has no triangle when the pointer left from over the flyout itself', () => {
    expect(
      isPointInSafeTriangle({x: 400, y: 100}, {x: 400, y: 100}, flyout),
    ).toBe(false);
  });
});

describe('useMenuHover — the click guard and its consumers', () => {
  it('closes immediately on a second click when the menu was opened BY click', async () => {
    // The guard window keys off the hover-open timestamp, so a menu that was
    // never hover-opened has no window at all: the next click is a second,
    // deliberate press on something visibly open, and closes it.
    const user = userEvent.setup();
    const trigger = renderMenu();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('confirms a hover-open on the click inside the guard window, and closes after it', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Inside the window the click confirms: you were reaching for the row
    // you already meant to open, so it must not slam shut under you.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Past the window it is a deliberate press on something visibly open.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.useRealTimers();
  });

  it('leaves no document pointermove listener behind after a close', async () => {
    // Every consumer of this hook now gets triangle tracking, which attaches
    // a document-level listener on leave. One surviving a close would run
    // for the life of the page.
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const trigger = renderMenu();

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.mouseLeave(trigger, {clientX: 10, clientY: 10});
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const attached = add.mock.calls.filter(([type]) => type === 'pointermove');
    const detached = remove.mock.calls.filter(
      ([type]) => type === 'pointermove',
    );
    expect(detached.length).toBeGreaterThanOrEqual(attached.length);
    vi.useRealTimers();
  });
});

// =============================================================================
// Disabling a trigger with a hover already in flight
// =============================================================================

describe('useMenuHover — disabled during the hover delay', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * The hook directly: a consumer that can flip `isEnabled` without also
   * changing what it renders. Through a real consumer the two move together —
   * `SideNavItem` only enables the flyout while the rail is collapsed — so
   * the disable cannot be observed apart from the re-render it causes.
   */
  function Harness({isEnabled, show}: {isEnabled: boolean; show: () => void}) {
    const {triggerProps} = useMenuHover<HTMLDivElement>({
      show,
      hide: () => {},
      isOpen: false,
      isEnabled,
    });
    return (
      <button type="button" {...triggerProps}>
        Products
      </button>
    );
  }

  it('does not open a surface the hover scheduled before it was disabled', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('hover: hover'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    vi.useFakeTimers();
    const show = vi.fn();
    const {rerender} = render(<Harness isEnabled show={show} />);

    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Products'}));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(show).not.toHaveBeenCalled();

    // Disabled with the open still pending. Inert handlers alone do not
    // settle it: the scheduled open would land on a surface whose handlers
    // can no longer dismiss it.
    rerender(<Harness isEnabled={false} show={show} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(show).not.toHaveBeenCalled();
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useLongPress example pairs touch press-and-hold with a pointer
 * contextmenu handler and an explicit Actions button: holding a finger past
 * 500ms opens the action menu at the touch point, lifting early or moving away
 * cancels it, right-click opens it at the pointer coordinates, and the fallback
 * button keeps every action reachable with a standard click.
 */

import {act, createElement, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseLongPressHookUsage from '../../assets/templates/blocks/components/Hooks/useLongPressHookUsage';

// The node project does not compile StyleX. The stub merges a style list into
// one object on `data-style`, so a case reads the position the block applies.
const style = vi.hoisted(() => ({
  attribute: (...styles: unknown[]) => ({
    'data-style': JSON.stringify(
      Object.assign({}, ...styles.flat(Infinity).filter(Boolean)),
    ),
  }),
}));
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: style.attribute,
}));
// Card renders through its own compiled styles, which the stub above does not
// reach, so a plain stand-in shows the panel's style list on `data-style`.
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({
    xstyle,
    children,
    role,
    'aria-label': ariaLabel,
  }: {
    xstyle?: unknown;
    children: ReactNode;
    role?: string;
    'aria-label'?: string;
  }) =>
    createElement(
      'div',
      {role, 'aria-label': ariaLabel, ...style.attribute(xstyle)},
      children,
    ),
}));

// The node project loads Core's built bundle, which the StyleX stub does not
// reach either. A plain stand-in for VStack shows the surface's style list on
// `data-style`, so a case reads whether the surface scrolls.
vi.mock('@astryxdesign/core/Layout', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  VStack: ({
    xstyle,
    children,
    gap: _gap,
    ...rest
  }: {
    xstyle?: unknown;
    children?: ReactNode;
    gap?: number;
    [prop: string]: unknown;
  }) => createElement('div', {...rest, ...style.attribute(xstyle)}, children),
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

function panelPosition(menu: HTMLElement | null): {
  left?: string | null;
  top?: string;
  transform?: string;
  insetInlineStart?: string;
} {
  return JSON.parse(menu?.getAttribute('data-style') ?? '{}');
}

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseLongPressHookUsage />);
  });
}

function getSurface(): HTMLElement {
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="long-press-surface"]',
  );
  if (!surface) {
    throw new Error('Expected long-press surface element');
  }
  return surface;
}

function dispatchTouch(
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Array<{clientX: number; clientY: number}> = [],
  timeStamp?: number,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'touches', {value: touches});
  if (timeStamp != null) {
    Object.defineProperty(event, 'timeStamp', {value: timeStamp});
  }
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.useRealTimers();
});

describe('useLongPressHookUsage example', () => {
  it('opens the action menu at the touch point after a 500ms hold', () => {
    renderExample();
    const surface = getSurface();

    expect(container.querySelector('[role="group"]')).toBeNull();

    dispatchTouch(surface, 'touchstart', [{clientX: 120, clientY: 64}]);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(container.querySelector('[role="group"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const menu = container.querySelector<HTMLElement>('[role="group"]');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Document actions');
    expect(menu?.textContent).toContain('Opened by long press at (120, 64)');
    // The panel's top-left corner is the touch point.
    expect(panelPosition(menu)).toMatchObject({
      left: 'clamp(0px, 120px, calc(100% - 180px))',
      top: '64px',
    });

    // Chromium fires a synthetic contextmenu with pointerType 'touch' after long press.
    const syntheticTouchContext = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 64,
    });
    Object.defineProperty(syntheticTouchContext, 'pointerType', {
      value: 'touch',
    });
    act(() => {
      surface.dispatchEvent(syntheticTouchContext);
    });
    expect(syntheticTouchContext.defaultPrevented).toBe(true);
    expect(
      container.querySelector<HTMLElement>('[role="group"]')?.textContent,
    ).toContain('Opened by long press at (120, 64)');
  });

  it('follows the press down the surface and keeps the panel inside it', () => {
    renderExample();
    const surface = getSurface();
    // A narrow surface, as in a phone-width docs preview.
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 0, width: 300, height: 200}),
    );

    const openAt = (clientX: number, clientY: number) => {
      dispatchTouch(surface, 'touchstart', [{clientX, clientY}]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      dispatchTouch(surface, 'touchend');
      return container.querySelector<HTMLElement>('[role="group"]');
    };

    const high = openAt(40, 20);
    expect(panelPosition(high).top).toBe('20px');
    act(() => {
      surface.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
      );
    });

    const low = openAt(290, 190);
    expect(low?.textContent).toContain('Opened by long press at (290, 190)');
    // The corner follows the press; CSS keeps the width inside the surface and
    // moves the panel up by no more than it needs to fit the 200px surface.
    expect(panelPosition(low)).toMatchObject({
      left: 'clamp(0px, 290px, calc(100% - 180px))',
      top: '190px',
      transform: 'translateY(min(0px, max(-190px, calc(10px - 100%))))',
    });
  });

  it('cancels a lift that reports the long press late, as on a busy page', () => {
    renderExample();
    const surface = getSurface();
    const start = Date.now();

    dispatchTouch(surface, 'touchstart', [{clientX: 120, clientY: 64}], start);
    // The timer has not run, but the lift is stamped past the 500ms hold.
    const lift = dispatchTouch(surface, 'touchend', [], start + 600);
    expect(container.querySelector('[role="group"]')).not.toBeNull();
    expect(lift.defaultPrevented).toBe(true);
  });

  it('cancels the lift after a long press, so the release clicks nothing under the finger', () => {
    renderExample();
    const surface = getSurface();

    dispatchTouch(surface, 'touchstart', [{clientX: 290, clientY: 190}]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector('[role="group"]')).not.toBeNull();
    // A canceled touchend stops the browser's click on what is under the finger.
    expect(dispatchTouch(surface, 'touchend').defaultPrevented).toBe(true);
    expect(container.querySelector('[role="group"]')).not.toBeNull();

    // A tap that is not a long press lifts as usual.
    dispatchTouch(surface, 'touchstart', [{clientX: 40, clientY: 50}]);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(dispatchTouch(surface, 'touchend').defaultPrevented).toBe(false);
  });

  it('cancels the pending long press on early lift or movement beyond 10px', () => {
    renderExample();
    const surface = getSurface();

    // Lifting before the 500ms threshold cancels the press.
    dispatchTouch(surface, 'touchstart', [{clientX: 40, clientY: 50}]);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    dispatchTouch(surface, 'touchend');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector('[role="group"]')).toBeNull();

    // Moving further than 10px treats the gesture as a scroll/drag and cancels.
    dispatchTouch(surface, 'touchstart', [{clientX: 40, clientY: 50}]);
    dispatchTouch(surface, 'touchmove', [{clientX: 60, clientY: 50}]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it('opens at pointer coordinates on contextmenu and triggers actions via menu buttons', () => {
    renderExample();
    const surface = getSurface();

    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 88,
      clientY: 36,
    });
    act(() => {
      surface.dispatchEvent(contextEvent);
    });

    expect(contextEvent.defaultPrevented).toBe(true);
    const menu = container.querySelector<HTMLElement>('[role="group"]');
    expect(menu?.textContent).toContain('Opened by right-click at (88, 36)');

    const pinButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Pin draft');
    expect(pinButton).toBeDefined();
    act(() => {
      pinButton?.click();
    });

    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.textContent).toContain('Pinned');
    expect(container.textContent).toContain('Pinned via right-click (88, 36).');
  });

  it('opens the Actions panel beside the button, never over it', () => {
    renderExample();
    const surface = getSurface();
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 0, width: 340, height: 216}),
    );
    const actionsButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Actions');
    if (!actionsButton) {
      throw new Error('Expected the Actions button');
    }
    // The surface's style while the panel is open.
    let openSurfaceStyle: ReturnType<typeof panelPosition> = {};
    const openFrom = (rect: DOMRect) => {
      vi.spyOn(actionsButton, 'getBoundingClientRect').mockReturnValue(rect);
      act(() => {
        actionsButton.click();
      });
      const menu = container.querySelector<HTMLElement>('[role="group"]');
      openSurfaceStyle = panelPosition(surface);
      act(() => {
        surface.dispatchEvent(
          new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
        );
      });
      return menu;
    };

    // The button at the end of its row: the panel opens before it.
    const before = openFrom(
      DOMRect.fromRect({x: 236, y: 16, width: 88, height: 40}),
    );
    expect(before?.textContent).toContain('Opened by button at (48, 16)');
    expect(panelPosition(before).left).toBe(
      'clamp(0px, 48px, calc(100% - 180px))',
    );

    // The button wrapped to the start of its own row: the panel opens after it.
    const after = openFrom(
      DOMRect.fromRect({x: 16, y: 64, width: 88, height: 40}),
    );
    expect(after?.textContent).toContain('Opened by button at (112, 64)');
    expect(openSurfaceStyle).not.toHaveProperty('overflowY');

    // A narrow card has no room on either side of the button, so the panel
    // opens below it in both left-to-right and right-to-left layouts. It does
    // not move up over the button, and the surface scrolls to reach it rather
    // than growing, so a centered preview around the example does not shift.
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 0, width: 260, height: 216}),
    );

    const belowLtr = openFrom(
      DOMRect.fromRect({x: 16, y: 64, width: 88, height: 40}),
    );
    expect(belowLtr?.textContent).toContain('Opened by button at (16, 112)');
    expect(panelPosition(belowLtr)).toMatchObject({
      left: null,
      insetInlineStart: '16px',
      top: '112px',
      transform: 'none',
    });
    expect(openSurfaceStyle).toMatchObject({
      minHeight: 216,
      overflowY: 'auto',
      scrollbarWidth: 'none',
    });

    // A button too near the end edge: the panel's end edge meets the button's.
    const belowEnd = openFrom(
      DOMRect.fromRect({x: 156, y: 64, width: 88, height: 40}),
    );
    expect(belowEnd?.textContent).toContain('Opened by button at (64, 112)');
    expect(panelPosition(belowEnd)).toMatchObject({
      left: null,
      insetInlineStart: '64px',
      top: '112px',
      transform: 'none',
    });
    expect(openSurfaceStyle).toMatchObject({
      minHeight: 216,
      overflowY: 'auto',
      scrollbarWidth: 'none',
    });

    // Right to left: the button starts the row at the right edge, and the
    // panel's start edge meets the button's start edge, measured from the
    // right, so a scrollbar on the left cannot move it.
    surface.style.direction = 'rtl';
    const belowRtl = openFrom(
      DOMRect.fromRect({x: 156, y: 64, width: 88, height: 40}),
    );
    expect(belowRtl?.textContent).toContain('Opened by button at (64, 112)');
    expect(panelPosition(belowRtl)).toMatchObject({
      left: null,
      insetInlineStart: '16px',
      top: '112px',
      transform: 'none',
    });
    expect(openSurfaceStyle).toMatchObject({
      minHeight: 216,
      overflowY: 'auto',
      scrollbarWidth: 'none',
    });
  });

  it('keeps a panel below the button when Actions is pressed again after the card scrolls', () => {
    renderExample();
    const surface = getSurface();
    const actionsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded]',
    );
    if (!actionsButton) {
      throw new Error('Expected the Actions button');
    }
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 0, width: 260, height: 216}),
    );
    vi.spyOn(actionsButton, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 16, y: 64, width: 88, height: 40}),
    );
    act(() => {
      actionsButton.click();
    });
    // The card scrolls 30px to reach the panel's lower actions. The button
    // moves up in the viewport by as much.
    Object.defineProperty(surface, 'scrollTop', {
      configurable: true,
      value: 30,
    });
    vi.spyOn(actionsButton, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 16, y: 34, width: 88, height: 40}),
    );
    act(() => {
      actionsButton.click();
    });
    const menu = container.querySelector<HTMLElement>('[role="group"]');
    expect(menu?.textContent).toContain('Opened by button at (16, 112)');
    expect(panelPosition(menu)).toMatchObject({top: '112px'});
  });

  it('provides an explicit Actions button fallback and returns focus when closed', () => {
    renderExample();

    const findButton = (label: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        button => button.textContent === label,
      );

    const actionsButton = findButton('Actions');
    expect(actionsButton).toBeDefined();
    expect(actionsButton?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      actionsButton?.click();
    });

    expect(actionsButton?.getAttribute('aria-expanded')).toBe('true');
    const menu = container.querySelector<HTMLElement>('[role="group"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain('Opened by button');

    const copyButton = findButton('Copy link');
    copyButton?.focus();
    act(() => {
      copyButton?.click();
    });

    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.textContent).toContain('Copied link via button');
    expect(document.activeElement).toBe(actionsButton);

    // Reopen and close with Escape; focus should return to Actions button.
    act(() => {
      actionsButton?.click();
    });
    const dismissButton = findButton('Dismiss');
    expect(dismissButton).toBeDefined();
    dismissButton?.focus();
    act(() => {
      dismissButton?.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
      );
    });
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(actionsButton);

    // Reopen and close with Dismiss button; focus should return to Actions button.
    act(() => {
      actionsButton?.click();
    });
    const secondDismissButton = findButton('Dismiss');
    secondDismissButton?.focus();
    act(() => {
      secondDismissButton?.click();
    });
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(actionsButton);
  });
});

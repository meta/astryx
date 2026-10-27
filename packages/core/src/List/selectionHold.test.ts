// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionHold.test.ts
 * @input vitest, Item and TreeList rows, the spring and Bézier solvers, and
 *   the in-transition deselect clock (motion/uikit/list.ts)
 * @output Unit tests for holdSelection: which targets it holds (under any
 *   finger, never a mouse), the held state it writes and leaves, presentation values
 *   from each timing's closed-form curve, the deselect's clock and curve as
 *   internal constants no theme variable reaches, interruption, completion,
 *   cancel and replacement
 * @position Beside List/selectionHold.ts; the compositor and pixel proofs are
 *   in List/__tests__/ListSelectionHold.interaction.browser.spec.ts
 */

import {createElement} from 'react';
import {render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Item} from '../Item';
import {List} from './List';
import {ListItem} from './ListItem';
import {TreeList} from '../TreeList';
import {cubicBezier} from '../motion/bezier';
import {solveSpring, toSpring} from '../motion/spring';
import {list} from '../motion/uikit/list';
import {timing} from '../motion/uikit/timing';
import {
  __resetInteractionModalityForTest,
  __startInteractionModalityTrackingForTest,
} from '../utils/interactionModality';
import {
  CELL_PRESS_PROFILE,
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
} from '../utils/pressFeedback';
import {DESELECTING_ATTRIBUTE, holdSelection} from './selectionHold';

let clock = 0;
const now = () => clock;

/**
 * The page under a finger (a coarse primary pointer: one touch model, iOS
 * and Android alike) or a mouse, optionally with the person preferring
 * reduced motion.
 */
function stubPointer(
  pointer: 'touch' | 'mouse',
  {reducedMotion = false}: {reducedMotion?: boolean} = {},
) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        (pointer === 'touch' && query.includes('pointer: coarse')) ||
        (reducedMotion && query.includes('prefers-reduced-motion: reduce')),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

beforeEach(() => {
  clock = 1000;
  vi.useFakeTimers();
  stubPointer('touch');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function listRow(label = 'Inbox') {
  render(
    createElement(
      List,
      null,
      createElement(ListItem, {label, onClick: () => {}}),
      createElement(ListItem, {label: 'Static'}),
    ),
  );
  const row = screen.getByText(label).closest('li') as HTMLElement;
  // The activation's target: the row's own control.
  const control = row.querySelector('button') as HTMLElement;
  return {row, control};
}

describe('what a hold holds', () => {
  it('holds the list row around the activation target, marked as a cell', () => {
    const {row, control} = listRow();
    expect(row.getAttribute(PRESSABLE_ATTRIBUTE)).toBe(CELL_PRESS_PROFILE);
    const hold = holdSelection(control, {now});
    expect(hold?.element).toBe(row);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
  });

  it('holds a TreeList row by its row box', () => {
    render(
      createElement(TreeList, {
        items: [{id: 'a', label: 'App.tsx', onClick: () => {}}],
      }),
    );
    const box = screen
      .getByRole('treeitem')
      .querySelector(`[${PRESSABLE_ATTRIBUTE}]`) as HTMLElement;
    const hold = holdSelection(screen.getByText('App.tsx'), {now});
    expect(hold?.element).toBe(box);
  });

  it("returns focus in a tree to the row's treeitem, the tree's Tab stop", () => {
    render(
      createElement(TreeList, {
        items: [
          {id: 'a', label: 'App.tsx', onClick: () => {}},
          {id: 'b', label: 'index.tsx', onClick: () => {}},
        ],
      }),
    );
    const item = screen
      .getByText('index.tsx')
      .closest('[role="treeitem"]') as HTMLElement;
    const hold = holdSelection(screen.getByText('index.tsx'), {now});
    hold?.end(true);
    hold?.focus({preventScroll: true});
    expect(document.activeElement).toBe(item);
  });

  it('holds nothing under a mouse: touch work costs nothing there', () => {
    stubPointer('mouse');
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {row, control} = listRow('Inbox mouse');
    expect(holdSelection(control, {now})).toBeNull();
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('holds nothing outside an enabled row with an action', () => {
    render(
      createElement(
        'div',
        null,
        createElement(Item, {label: 'Static', 'data-testid': 'static'}),
        createElement(Item, {
          label: 'Off',
          onClick: () => {},
          isDisabled: true,
          'data-testid': 'off',
        }),
        createElement('button', {'data-testid': 'button'}, 'Plain'),
      ),
    );
    expect(holdSelection(screen.getByTestId('static'))).toBeNull();
    expect(holdSelection(screen.getByTestId('off'))).toBeNull();
    expect(holdSelection(screen.getByTestId('button'))).toBeNull();
    expect(holdSelection(null)).toBeNull();
    expect(holdSelection(window)).toBeNull();
  });
});

describe('presentation follows each timing’s curve', () => {
  it('a programmatic pop: UIKit’s in-transition deselect, 350 ms linear', () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    expect(hold?.presentation()).toBe(0);
    void hold?.animate(1, {startTime: 1000});
    const ms = list.deselect.navigationPopMs;
    expect(hold?.presentation(1000)).toBe(0);
    expect(hold?.presentation(1000 + ms / 2)).toBeCloseTo(0.5, 6);
    expect(hold?.presentation(1000 + ms / 4)).toBeCloseTo(0.25, 6);
    expect(hold?.presentation(1000 + ms)).toBe(1);
  });

  it('an interactive finish: the navigation’s spring from the scrubbed value, with its velocity', () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    hold?.setProgress(0.4);
    expect(hold?.presentation()).toBe(0.4);
    const spring = {response: 0.3, dampingRatio: 0.85};
    void hold?.animate(1, {spring, velocity: 2, startTime: 1000});
    const expected = solveSpring(toSpring(spring), {
      from: 0.4,
      to: 1,
      velocity: 2,
    });
    for (const t of [0, 0.05, 0.1, 0.2]) {
      expect(hold?.presentation(1000 + t * 1000)).toBeCloseTo(
        Math.min(1, Math.max(0, expected.value(t))),
        6,
      );
    }
  });

  it("under reduced motion, every deselect takes the animator's cross-fade: no spring, done within 200 ms", () => {
    // design:reduced-motion DR1 and DR2: the in-transition deselect, a
    // navigation's spring and a caller's own long curve alike.
    stubPointer('touch', {reducedMotion: true});
    const timings = [
      {},
      {spring: {response: 0.35, dampingRatio: 1}, velocity: 1},
      {durationMs: 3000, curve: timing.curves.move},
    ] as const;
    for (const each of timings) {
      const {control} = listRow(`Row ${timings.indexOf(each)}`);
      const hold = holdSelection(control, {now});
      void hold?.animate(1, {...each, startTime: 1000});
      expect(
        hold?.presentation(1000 + 100),
        JSON.stringify(each),
      ).toBeGreaterThan(0);
      expect(hold?.presentation(1000 + 200), JSON.stringify(each)).toBe(1);
    }
  });

  it("a fixed duration on a Bézier curve (a navigation's own fade)", () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    const curve = timing.curves.move;
    void hold?.animate(1, {
      durationMs: timing.reducedMotionCrossFadeMs,
      curve,
      startTime: 1000,
    });
    const ease = cubicBezier(curve);
    const d = timing.reducedMotionCrossFadeMs;
    expect(hold?.presentation(1000 + d * 0.3)).toBeCloseTo(ease(0.3), 6);
    expect(hold?.presentation(1000 + d)).toBe(1);
  });

  it('keeps the in-transition deselect’s own clock and curve whatever a theme writes', () => {
    // The deselect's clock and curve are internal constants: variables a
    // theme's scope reports for them change nothing.
    const theme: Record<string, string> = {
      '--motion-list-deselect-navigation-pop-ms': '700ms',
      '--motion-list-deselect-navigation-pop-curve':
        'cubic-bezier(0.42, 0, 0.58, 1)',
    };
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        const style = computed(element, pseudo);
        if (!element.hasAttribute('data-astryx-theme')) {
          return style;
        }
        // The theme's scope: only its role variables are read.
        return {
          getPropertyValue: (name: string) =>
            theme[name] ?? style.getPropertyValue(name),
        } as unknown as CSSStyleDeclaration;
      },
    );
    render(
      createElement(
        'div',
        {'data-astryx-theme': 'slow'},
        createElement(
          List,
          null,
          createElement(ListItem, {label: 'Themed', onClick: () => {}}),
        ),
      ),
    );
    const control = screen
      .getByText('Themed')
      .closest('li')
      ?.querySelector('button') as HTMLElement;
    const hold = holdSelection(control, {now});
    void hold?.animate(1, {startTime: 1000});
    const ms = list.deselect.navigationPopMs;
    const ease = cubicBezier(list.deselect.navigationPopCurve);
    expect(hold?.presentation(1000 + ms * 0.25)).toBeCloseTo(ease(0.25), 6);
    expect(hold?.presentation(1000 + ms)).toBe(1);
    // A caller's own timing is left as it is.
    hold?.setProgress(0);
    void hold?.animate(1, {
      durationMs: 100,
      curve: [0, 0, 1, 1],
      startTime: 2000,
    });
    expect(hold?.presentation(2050)).toBeCloseTo(0.5, 6);
  });

  it('a pop that starts from a scrubbed value takes its share of the clock', () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    hold?.setProgress(0.5);
    void hold?.animate(1, {startTime: 1000});
    const half = list.deselect.navigationPopMs / 2;
    expect(hold?.presentation(1000 + half / 2)).toBeCloseTo(0.75, 6);
    expect(hold?.presentation(1000 + half)).toBe(1);
  });
});

describe('interruption, completion and cancel', () => {
  it('resolves true when the deselect arrives', async () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    const arrived = hold?.animate(1, {startTime: 1000});
    clock = 1000 + list.deselect.navigationPopMs;
    vi.advanceTimersByTime(list.deselect.navigationPopMs);
    await expect(arrived).resolves.toBe(true);
    expect(hold?.presentation()).toBe(1);
  });

  it('a finger grabbing mid-flight stops it where it is: the promise resolves false', async () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    const arrived = hold?.animate(1, {startTime: 1000});
    clock = 1000 + list.deselect.navigationPopMs * 0.3;
    // Where it is on screen, from the curve: the finger starts there.
    expect(hold?.presentation()).toBeCloseTo(0.3, 6);
    hold?.setProgress(hold.presentation());
    await expect(arrived).resolves.toBe(false);
    expect(hold?.presentation()).toBeCloseTo(0.3, 6);
  });

  it('a completed pop deselects the row and drops the hold', () => {
    const {row, control} = listRow();
    const hold = holdSelection(control, {now});
    hold?.end(true);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    // Inert from here on.
    hold?.end(false);
    hold?.setProgress(0.5);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('a cancelled pop selects the row again at once and keeps the hold', async () => {
    const {row, control} = listRow();
    const hold = holdSelection(control, {now});
    hold?.setProgress(0.6);
    const back = hold?.animate(0, {
      spring: {response: 0.3, dampingRatio: 0.85},
      startTime: 1000,
    });
    hold?.end(false);
    await expect(back).resolves.toBe(false);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
    expect(hold?.presentation()).toBe(0);
    // The next pop still deselects it.
    hold?.end(true);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('a hold taken while the previous one deselects starts fully held, with no deselecting mark', () => {
    const {row, control} = listRow();
    const first = holdSelection(control, {now});
    void first?.animate(1, {startTime: 1000});
    clock = 1000 + list.deselect.navigationPopMs * 0.4;
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(true);
    // Tapped again mid-deselect: a new push holds the row.
    const second = holdSelection(control, {now});
    expect(second).not.toBeNull();
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
    expect(second?.presentation()).toBe(0);
    // The dividers beside it stay hidden: nothing marks it deselecting.
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(false);
  });

  it("marks the row deselecting from the deselect's first frame until a cancel or the end", async () => {
    const {row, control} = listRow();
    const hold = holdSelection(control, {now});
    // Covered: the dividers stay hidden.
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(false);
    hold?.setProgress(0.1);
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(true);
    const back = hold?.animate(0, {
      spring: {response: 0.3, dampingRatio: 0.85},
      startTime: 1000,
    });
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(false);
    hold?.end(false);
    await expect(back).resolves.toBe(false);
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(false);
    void hold?.animate(1, {startTime: 1000});
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(true);
    hold?.end(true);
    expect(row.hasAttribute(DESELECTING_ATTRIBUTE)).toBe(false);
  });

  it('a second hold on the row takes over; the first goes inert', () => {
    const {row, control} = listRow();
    const first = holdSelection(control, {now});
    const second = holdSelection(control, {now});
    first?.end(true);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
    second?.end(true);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('returns focus to the row’s own control', () => {
    const {control} = listRow();
    const hold = holdSelection(control, {now});
    hold?.end(true);
    hold?.focus({preventScroll: true});
    expect(document.activeElement).toBe(control);
  });

  it('returns focus with no keyboard ring after a finger’s pop, and with one after a key’s', () => {
    __startInteractionModalityTrackingForTest();
    const {control} = listRow();
    const focus = vi.spyOn(control, 'focus');
    const hold = holdSelection(control, {now});
    hold?.end(true);
    // A finger pressed Back: focus returns without `:focus-visible`.
    document.dispatchEvent(new Event('pointerdown'));
    hold?.focus({preventScroll: true});
    expect(focus).toHaveBeenLastCalledWith({
      preventScroll: true,
      focusVisible: false,
    });
    expect(document.activeElement).toBe(control);
    // A key pressed Back: the browser shows the ring where focus went.
    control.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
    hold?.focus({preventScroll: true});
    expect(focus).toHaveBeenLastCalledWith({preventScroll: true});
    __resetInteractionModalityForTest();
  });
});

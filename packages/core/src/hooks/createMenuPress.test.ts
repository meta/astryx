// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createMenuPress.test.ts
 * @input vitest, @testing-library/dom, createMenuPress
 * @output Unit tests for the menu press factory with no React. They cover
 *   tracking, highlight, activation, dismissal, the trigger press, the held
 *   finger and cancel. Every listener is gone after destroy, mid-press too,
 *   and importing the factory does no DOM work (spec:AST-107 FR6).
 * @position Testing; validates createMenuPress.ts. useMenuPress.test.tsx and
 *   useMenuPress.factory.test.tsx cover the hook, which delegates to it.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent} from '@testing-library/dom';
import {
  MENU_PRESS_LONG_PRESS_MS,
  MENU_PRESS_MARKER,
  __resetMenuPressForTest,
  createForwardedMenuPress,
  createMenuPress,
  type CreateMenuPressOptions,
  type CreateMenuPressReturn,
} from './createMenuPress';
import {MENU_PRESS_SETTLE_MS} from './menuPressGesture';
import {disarmClickGuard} from '../utils/clickGuard';
import {getInteractionModality} from '../utils/interactionModality';

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

interface Fixture {
  menu: HTMLElement;
  trigger: HTMLButtonElement;
  outside: HTMLButtonElement;
  row: (label: string) => HTMLElement;
  clicked: string[];
}

const mounted: HTMLElement[] = [];
const handles: CreateMenuPressReturn[] = [];
const restores: (() => void)[] = [];

/** A trigger, a menu of rows A, B, C and a disabled D, and a control outside it. */
function fixture(): Fixture {
  const clicked: string[] = [];
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Open';
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;
  for (const label of ['A', 'B', 'C', 'D']) {
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    row.textContent = label;
    if (label === 'D') {
      row.setAttribute('aria-disabled', 'true');
    }
    row.addEventListener('click', () => clicked.push(label));
    menu.append(row);
  }
  const outside = document.createElement('button');
  outside.type = 'button';
  outside.textContent = 'Outside';
  const holder = document.createElement('div');
  holder.append(trigger, menu, outside);
  document.body.append(holder);
  mounted.push(holder);
  const row = (label: string) =>
    [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      el => el.textContent === label,
    )!;
  return {menu, trigger, outside, row, clicked};
}

/** Rows A, B and C in a menu inside an open shadow root. */
function shadowFixture() {
  const clicked: string[] = [];
  const host = document.createElement('div');
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;
  const rows = ['A', 'B', 'C'].map(label => {
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    row.textContent = label;
    row.addEventListener('click', () => clicked.push(label));
    menu.append(row);
    return row;
  });
  host.attachShadow({mode: 'open'}).append(menu);
  document.body.append(host);
  mounted.push(host);
  // jsdom has no layout: the rows sit 10 px apart.
  const hitTest = (_x: number, y: number) => rows[Math.floor(y / 10)] ?? null;
  const at = (index: number) => ({
    ...touch(),
    clientX: 5,
    clientY: index * 10 + 5,
  });
  return {menu, rows, clicked, hitTest, at};
}

function press(
  menu: HTMLElement,
  options: CreateMenuPressOptions,
): CreateMenuPressReturn {
  const handle = createMenuPress(menu, options);
  handles.push(handle);
  return handle;
}

const touch = (pointerId = 1) => ({pointerType: 'touch', pointerId});
const mouse = (pointerId = 1) => ({pointerType: 'mouse', pointerId, button: 0});

/** Listeners added to the given targets, net of removals. */
function trackListeners(targets: EventTarget[]): () => number {
  const live = new Set<string>();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (listener: EventListenerOrEventListenerObject | null) => {
    if (listener == null) {
      return 'null';
    }
    if (!ids.has(listener)) {
      ids.set(listener, (next += 1));
    }
    return String(ids.get(listener));
  };
  targets.forEach((target, index) => {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const key = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) => {
      const capture =
        typeof options === 'boolean' ? options : options?.capture === true;
      return `${index}:${type}:${capture}:${id(listener)}`;
    };
    target.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => {
      live.add(key(type, listener, options));
      add(type, listener, options);
    };
    target.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) => {
      live.delete(key(type, listener, options));
      remove(type, listener, options);
    };
    restores.push(() => {
      target.addEventListener = add;
      target.removeEventListener = remove;
    });
  });
  return () => live.size;
}

/**
 * The page's once-per-document listeners (the gesture counter, input
 * modality, the click guard's window listener) go in first, so a count is the
 * press's alone.
 */
function warmUp(): void {
  const f = fixture();
  const warm = createMenuPress(f.menu, {
    trigger: f.trigger,
    itemSelector: ITEM_SELECTOR,
  });
  fireEvent.pointerDown(f.row('A'), touch(90));
  fireEvent.pointerUp(f.row('A'), touch(90));
  warm.destroy();
  disarmClickGuard(document);
}

beforeEach(() => {
  __resetMenuPressForTest();
});

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy();
  }
  for (const restore of restores.splice(0)) {
    restore();
  }
  for (const holder of mounted.splice(0)) {
    holder.remove();
  }
  disarmClickGuard(document);
  vi.useRealTimers();
});

describe('createMenuPress — the press model with no React (spec:AST-107 FR6)', () => {
  it('acts once on the row under a finger’s release, not the row it landed on', () => {
    const f = fixture();
    press(f.menu, {itemSelector: ITEM_SELECTOR});
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('B'), touch());
    expect(f.row('B')).toHaveFocus();
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual(['B']);
  });

  it('marks the menu root as carrying the press model while it lives', () => {
    const f = fixture();
    const handle = press(f.menu, {itemSelector: ITEM_SELECTOR});
    expect(f.menu.hasAttribute(MENU_PRESS_MARKER)).toBe(true);
    handle.destroy();
    expect(f.menu.hasAttribute(MENU_PRESS_MARKER)).toBe(false);
  });

  it('drives a custom highlight callback instead of focus, and clears it over a disabled row', () => {
    const f = fixture();
    const onHighlight = vi.fn<(row: HTMLElement | null) => void>();
    press(f.menu, {itemSelector: ITEM_SELECTOR, onHighlight});
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('C'), touch());
    fireEvent.pointerMove(f.row('D'), touch());
    expect(
      onHighlight.mock.calls.map(([row]) => row?.textContent ?? null),
    ).toEqual(['A', 'C', null]);
    expect(f.row('C')).not.toHaveFocus();
  });

  it('hands the release to a custom activation instead of a click', () => {
    const f = fixture();
    const onActivate = vi.fn();
    press(f.menu, {itemSelector: ITEM_SELECTOR, onActivate});
    fireEvent.pointerDown(f.row('A'), mouse());
    fireEvent.pointerUp(f.row('B'), mouse());
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0]).toBe(f.row('B'));
    expect(f.clicked).toEqual([]);
  });

  it('dismisses when a mouse is released outside, acting on nothing', () => {
    const f = fixture();
    const onDismiss = vi.fn();
    press(f.menu, {itemSelector: ITEM_SELECTOR, onDismiss});
    fireEvent.pointerDown(f.row('A'), mouse());
    fireEvent.pointerUp(f.outside, mouse());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(f.clicked).toEqual([]);
  });

  it('opens on a mouse press of the trigger, and reports that gesture’s click as the press’s', () => {
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    const handle = press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    fireEvent.pointerDown(f.trigger, mouse());
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
    fireEvent.pointerUp(f.trigger, mouse());
    expect(handle.isTriggerClickFromPress()).toBe(true);
  });

  it('opens under a finger held on the trigger for the long-press delay, then picks the row it lifts on', () => {
    vi.useFakeTimers();
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    fireEvent.pointerDown(f.trigger, touch());
    expect(onTriggerPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    expect(onTriggerPress).toHaveBeenCalledWith('touch');
    vi.advanceTimersByTime(MENU_PRESS_SETTLE_MS);
    fireEvent.pointerMove(f.row('B'), touch());
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual(['B']);
  });

  it('moves to a new trigger by destroy and create, leaving nothing on the old one', () => {
    const f = fixture();
    const second = document.createElement('button');
    second.type = 'button';
    f.menu.before(second);
    const first = vi.fn(() => true);
    const next = vi.fn(() => true);
    press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress: first,
    }).destroy();
    press(f.menu, {
      trigger: second,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress: next,
    });
    fireEvent.pointerDown(f.trigger, mouse());
    fireEvent.pointerUp(f.trigger, mouse());
    expect(first).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    fireEvent.pointerDown(second, mouse(2));
    expect(next).toHaveBeenCalledWith('mouse');
    expect(first).not.toHaveBeenCalled();
  });

  it('is inert while isEnabled is false', () => {
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
      isEnabled: false,
    });
    fireEvent.pointerDown(f.trigger, mouse());
    fireEvent.pointerDown(f.row('A'), touch(2));
    fireEvent.pointerUp(f.row('A'), touch(2));
    expect(onTriggerPress).not.toHaveBeenCalled();
    expect(f.clicked).toEqual([]);
  });

  it('ends the gesture in flight with nothing acting on cancel', () => {
    const f = fixture();
    const handle = press(f.menu, {itemSelector: ITEM_SELECTOR});
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('B'), touch());
    handle.cancel();
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual([]);
  });
});

describe('createMenuPress — update, where a press starts, and a forwarded trigger event', () => {
  it('update() merges options from the next event, and a gesture in progress goes on', () => {
    const f = fixture();
    const handle = press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
    });
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('B'), touch());
    handle.update({isEnabled: false});
    // The gesture in progress goes on: its release acts.
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual(['B']);
    // The next press reads the merged options.
    fireEvent.pointerDown(f.row('C'), touch(2));
    fireEvent.pointerUp(f.row('C'), touch(2));
    expect(f.clicked).toEqual(['B']);
    handle.update({isEnabled: true});
    fireEvent.pointerDown(f.row('C'), touch(3));
    fireEvent.pointerUp(f.row('C'), touch(3));
    expect(f.clicked).toEqual(['B', 'C']);
  });

  it('update() with a new trigger moves its listeners there, leaving nothing on the old one', () => {
    const f = fixture();
    const second = document.createElement('button');
    second.type = 'button';
    f.menu.before(second);
    const onTriggerPress = vi.fn(() => true);
    const handle = press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    handle.update({trigger: second});
    fireEvent.pointerDown(f.trigger, mouse());
    fireEvent.pointerUp(f.trigger, mouse());
    expect(onTriggerPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(second, mouse(2));
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
  });

  it("with startBehavior 'items', a press on other content in the menu stays the browser's", () => {
    const f = fixture();
    const note = document.createElement('p');
    note.textContent = 'Note';
    f.menu.append(note);
    press(f.menu, {itemSelector: ITEM_SELECTOR, startBehavior: 'items'});
    // Not taken: the finger's pointerdown keeps its default.
    expect(fireEvent.pointerDown(note, touch())).toBe(true);
    fireEvent.pointerMove(f.row('B'), touch());
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual([]);
    // A press on an item is the press model's.
    expect(fireEvent.pointerDown(f.row('A'), touch(2))).toBe(false);
    fireEvent.pointerMove(f.row('B'), touch(2));
    fireEvent.pointerUp(f.row('B'), touch(2));
    expect(f.clicked).toEqual(['B']);
  });

  it("with startBehavior 'items', a Ctrl, Cmd or Shift mouse press on a link item stays the browser's", () => {
    const f = fixture();
    const link = document.createElement('a');
    link.href = '#elsewhere';
    link.setAttribute('role', 'menuitem');
    link.tabIndex = -1;
    link.textContent = 'Link';
    const clicks: string[] = [];
    link.addEventListener('click', event => {
      event.preventDefault();
      clicks.push(event.isTrusted ? 'native' : 'press');
    });
    f.menu.append(link);
    press(f.menu, {itemSelector: ITEM_SELECTOR, startBehavior: 'items'});
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
      fireEvent.pointerDown(link, {...mouse(), [modifier]: true});
      fireEvent.pointerUp(link, {...mouse(), [modifier]: true});
    }
    expect(clicks).toEqual([]);
    // A plain press on the link is the press model's: its release acts.
    fireEvent.pointerDown(link, mouse(2));
    fireEvent.pointerUp(link, mouse(2));
    expect(clicks).toEqual(['press']);
  });

  it("starts after the page's own press-down handlers: one that cancels a press-down inside the menu starts no press", () => {
    const f = fixture();
    press(f.menu, {itemSelector: ITEM_SELECTOR});
    const cancel = (event: Event) => event.preventDefault();
    f.row('A').addEventListener('pointerdown', cancel);
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('B'), touch());
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual([]);
    f.row('A').removeEventListener('pointerdown', cancel);
    fireEvent.pointerDown(f.row('A'), touch(2));
    fireEvent.pointerMove(f.row('B'), touch(2));
    fireEvent.pointerUp(f.row('B'), touch(2));
    expect(f.clicked).toEqual(['B']);
  });

  it('starts no press for a press-down that a page handler outside the menu cancels', () => {
    const f = fixture();
    press(f.menu, {itemSelector: ITEM_SELECTOR});
    // A capture listener on the document runs before anything in the menu.
    const cancel = (event: Event) => event.preventDefault();
    document.addEventListener('pointerdown', cancel, true);
    try {
      fireEvent.pointerDown(f.row('A'), touch());
      fireEvent.pointerMove(f.row('B'), touch());
      fireEvent.pointerUp(f.row('B'), touch());
    } finally {
      document.removeEventListener('pointerdown', cancel, true);
    }
    expect(f.clicked).toEqual([]);
    fireEvent.pointerDown(f.row('A'), touch(2));
    fireEvent.pointerMove(f.row('B'), touch(2));
    fireEvent.pointerUp(f.row('B'), touch(2));
    expect(f.clicked).toEqual(['B']);
  });

  it('opens nothing for a finger held on the trigger whose press-down a page handler cancels', () => {
    vi.useFakeTimers();
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    const cancel = (event: Event) => event.preventDefault();
    document.addEventListener('pointerdown', cancel, true);
    try {
      fireEvent.pointerDown(f.trigger, touch());
    } finally {
      document.removeEventListener('pointerdown', cancel, true);
    }
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    expect(onTriggerPress).not.toHaveBeenCalled();
    fireEvent.pointerUp(f.trigger, touch());
    fireEvent.pointerDown(f.trigger, touch(2));
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    expect(onTriggerPress).toHaveBeenCalledWith('touch');
  });

  it.each([
    ['an ancestor', () => document.body],
    ['the document', () => document],
    ['the window', () => window],
  ] as const)(
    'starts no press and opens nothing for a finger press-down that %s cancels as it bubbles',
    (_, end) => {
      vi.useFakeTimers();
      const f = fixture();
      const onTriggerPress = vi.fn(() => true);
      press(f.menu, {
        trigger: f.trigger,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      const cancel = (event: Event) => event.preventDefault();
      end().addEventListener('pointerdown', cancel);
      try {
        fireEvent.pointerDown(f.row('A'), touch());
        fireEvent.pointerMove(f.row('B'), touch());
        fireEvent.pointerUp(f.row('B'), touch());
        fireEvent.pointerDown(f.trigger, touch(2));
      } finally {
        end().removeEventListener('pointerdown', cancel);
      }
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
      expect(f.clicked).toEqual([]);
      expect(onTriggerPress).not.toHaveBeenCalled();
    },
  );

  it('starts no press and opens nothing for a finger press-down the document stops', () => {
    vi.useFakeTimers();
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    const stop = (event: Event) => event.stopPropagation();
    document.addEventListener('pointerdown', stop);
    try {
      fireEvent.pointerDown(f.row('A'), touch());
      fireEvent.pointerMove(f.row('B'), touch());
      fireEvent.pointerUp(f.row('B'), touch());
      fireEvent.pointerDown(f.trigger, touch(2));
    } finally {
      document.removeEventListener('pointerdown', stop);
    }
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    expect(f.clicked).toEqual([]);
    expect(onTriggerPress).not.toHaveBeenCalled();
  });

  it.each([
    ['cancels', (event: Event) => event.preventDefault()],
    ['stops', (event: Event) => event.stopPropagation()],
  ] as const)(
    'acts at once on a mouse or pen press-down that the document %s later, as the options form did',
    (_, block) => {
      const f = fixture();
      const onTriggerPress = vi.fn(() => true);
      press(f.menu, {
        trigger: f.trigger,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      const g = fixture();
      press(g.menu, {itemSelector: ITEM_SELECTOR});
      const pen = {pointerType: 'pen', pointerId: 3, button: 0};
      document.addEventListener('pointerdown', block);
      try {
        fireEvent.pointerDown(f.trigger, mouse());
        fireEvent.pointerDown(g.row('A'), pen);
        fireEvent.pointerMove(g.row('B'), pen);
        fireEvent.pointerUp(g.row('B'), pen);
      } finally {
        document.removeEventListener('pointerdown', block);
      }
      expect(onTriggerPress).toHaveBeenCalledWith('mouse');
      expect(g.clicked).toEqual(['B']);
    },
  );

  it.each([
    ['an ancestor cancels', () => document.body, 'cancel'],
    ['the document cancels', () => document, 'cancel'],
    ['the window cancels', () => window, 'cancel'],
    ['the document stops', () => document, 'stop'],
  ] as const)(
    'opens nothing for a forwarded finger press-down on the trigger that %s after the caller',
    (_, end, how) => {
      vi.useFakeTimers();
      const f = fixture();
      const onTriggerPress = vi.fn(() => true);
      const handle = press(f.menu, {
        trigger: f.trigger,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      // A caller's own handler forwards the press-down, as DropdownMenu's
      // trigger does, before the handlers above it run.
      f.trigger.addEventListener('pointerdown', event =>
        handle.handleTriggerPointerDown(event),
      );
      const block = (event: Event) =>
        how === 'cancel' ? event.preventDefault() : event.stopPropagation();
      end().addEventListener('pointerdown', block);
      try {
        fireEvent.pointerDown(f.trigger, touch());
      } finally {
        end().removeEventListener('pointerdown', block);
      }
      vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
      expect(onTriggerPress).not.toHaveBeenCalled();
    },
  );

  it('acts at once on a trigger press-down forwarded after its dispatch', () => {
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    const handle = press(f.menu, {itemSelector: ITEM_SELECTOR, onTriggerPress});
    handle.handleTriggerPointerDown({
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      ctrlKey: false,
      target: f.trigger,
      preventDefault: () => {},
    });
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
  });

  it('opens nothing when a caller forwards a finger press-down on the trigger that it cancelled', () => {
    vi.useFakeTimers();
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    const handle = press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    f.trigger.addEventListener('pointerdown', event => {
      event.preventDefault();
      handle.handleTriggerPointerDown(event);
    });
    fireEvent.pointerDown(f.trigger, touch());
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS);
    expect(onTriggerPress).not.toHaveBeenCalled();
  });

  it("leaves a mouse's or pen's press-down to the forwards when Core's menus forward it", () => {
    const f = fixture();
    const handle = createForwardedMenuPress(f.menu, {
      itemSelector: ITEM_SELECTOR,
    });
    handles.push(handle);
    fireEvent.pointerDown(f.row('A'), mouse());
    fireEvent.pointerUp(f.row('B'), mouse());
    expect(f.clicked).toEqual([]);
    f.menu.addEventListener('pointerdown', event =>
      handle.handleMenuPointerDown(event),
    );
    fireEvent.pointerDown(f.row('A'), mouse(2));
    fireEvent.pointerUp(f.row('B'), mouse(2));
    expect(f.clicked).toEqual(['B']);
  });

  it("still hears a finger's press-down on its own listener when Core's menus forward", () => {
    const f = fixture();
    handles.push(
      createForwardedMenuPress(f.menu, {itemSelector: ITEM_SELECTOR}),
    );
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerMove(f.row('B'), touch());
    fireEvent.pointerUp(f.row('B'), touch());
    expect(f.clicked).toEqual(['B']);
  });

  it("starts a finger's press in a menu inside a shadow root, whose target the window sees as the host", () => {
    const f = shadowFixture();
    press(f.menu, {itemSelector: ITEM_SELECTOR, hitTest: f.hitTest});
    fireEvent.pointerDown(f.rows[0], f.at(0));
    fireEvent.pointerMove(f.rows[1], f.at(1));
    fireEvent.pointerUp(f.rows[1], f.at(1));
    expect(f.clicked).toEqual(['B']);
  });

  it("starts an item-only finger's press in a shadow root when Core's menus forward", () => {
    const f = shadowFixture();
    handles.push(
      createForwardedMenuPress(f.menu, {
        itemSelector: ITEM_SELECTOR,
        hitTest: f.hitTest,
        startBehavior: 'items',
      }),
    );
    fireEvent.pointerDown(f.rows[0], f.at(0));
    fireEvent.pointerMove(f.rows[2], f.at(2));
    fireEvent.pointerUp(f.rows[2], f.at(2));
    expect(f.clicked).toEqual(['C']);
  });

  it("starts a finger's press that lands inside a row's own shadow root", () => {
    const f = shadowFixture();
    const label = document.createElement('span');
    label.textContent = 'A';
    f.rows[0].attachShadow({mode: 'open'}).append(label);
    press(f.menu, {itemSelector: ITEM_SELECTOR, hitTest: f.hitTest});
    fireEvent.pointerDown(label, f.at(0));
    fireEvent.pointerMove(f.rows[1], f.at(1));
    fireEvent.pointerUp(f.rows[1], f.at(1));
    expect(f.clicked).toEqual(['B']);
  });

  it('starts a press when a page handler dispatches another press-down during it', () => {
    const f = fixture();
    press(f.menu, {itemSelector: ITEM_SELECTOR});
    // A handler between the menu and the document dispatches a press-down of
    // its own elsewhere, which reaches the document first.
    const holder = f.menu.parentElement!;
    const relay = (event: Event) => {
      if (event.target !== f.outside) {
        fireEvent.pointerDown(f.outside, touch(9));
      }
    };
    holder.addEventListener('pointerdown', relay);
    try {
      fireEvent.pointerDown(f.row('A'), touch());
      fireEvent.pointerMove(f.row('B'), touch());
      fireEvent.pointerUp(f.row('B'), touch());
      expect(f.clicked).toEqual(['B']);
    } finally {
      holder.removeEventListener('pointerdown', relay);
    }
  });

  it("acts on a forwarded mouse press in the caller's handler order, after the handlers before it", () => {
    const f = fixture();
    const order: string[] = [];
    const handle = createForwardedMenuPress(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress: () => {
        order.push('press');
        return true;
      },
    });
    handles.push(handle);
    f.trigger.addEventListener('pointerdown', event => {
      order.push('page');
      handle.handleTriggerPointerDown(event);
    });
    fireEvent.pointerDown(f.trigger, mouse());
    expect(order).toEqual(['page', 'press']);
  });

  it('takes a trigger press once when the caller also forwards it: a press that closes the menu does not open it again', () => {
    const f = fixture();
    // The menu is open, so the press closes it and its gesture ends at once.
    const onTriggerPress = vi.fn(() => false);
    const handle = press(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    // A caller's own handler forwards the same event, as a custom trigger's
    // props did.
    f.trigger.addEventListener('pointerdown', event =>
      handle.handleTriggerPointerDown(event),
    );
    fireEvent.pointerDown(f.trigger, mouse());
    expect(onTriggerPress).toHaveBeenCalledTimes(1);
  });
});

describe('createMenuPress — no document listener while idle (PR1)', () => {
  it('twenty closed menus add no press-down listener to the document, and a press adds only what it removes', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    try {
      const fixtures = Array.from({length: 20}, () => fixture());
      for (const each of fixtures) {
        press(each.menu, {itemSelector: ITEM_SELECTOR, trigger: each.trigger});
      }
      const ofType = (spy: typeof add, type: string, from = 0) =>
        spy.mock.calls.slice(from).filter(([kind]) => kind === type);
      expect(ofType(add, 'contextmenu')).toHaveLength(0);
      // At most the one shared modality listener, never one per menu.
      expect(ofType(add, 'pointerdown').length).toBeLessThanOrEqual(1);
      const from = add.mock.calls.length;
      fireEvent.pointerDown(fixtures[0].row('A'), touch());
      fireEvent.pointerUp(fixtures[0].row('A'), touch());
      const removed = remove.mock.calls.map(([, listener]) => listener);
      for (const [, listener] of add.mock.calls.slice(from)) {
        expect(removed).toContain(listener);
      }
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});

describe('createMenuPress — destroy (spec:AST-107 FR6)', () => {
  it('removes every listener it added: the menu’s, the trigger’s, and a finished press’s on the document and window', () => {
    warmUp();
    const f = fixture();
    const live = trackListeners([document, window, f.menu, f.trigger]);
    const before = live();
    const handle = createMenuPress(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress: () => true,
    });
    expect(live()).toBeGreaterThan(before);
    fireEvent.pointerDown(f.row('A'), touch());
    fireEvent.pointerUp(f.row('B'), touch());
    disarmClickGuard(document);
    handle.destroy();
    expect(live()).toBe(before);
    // A second destroy does nothing.
    handle.destroy();
    expect(live()).toBe(before);
  });

  it('a destroy mid-press removes the press’s listeners, and nothing acts afterwards', () => {
    warmUp();
    const f = fixture();
    const onDismiss = vi.fn();
    const live = trackListeners([document, window, f.menu, f.trigger]);
    const before = live();
    const handle = createMenuPress(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onDismiss,
    });
    fireEvent.pointerDown(f.row('A'), mouse());
    fireEvent.pointerMove(f.row('B'), mouse());
    handle.destroy();
    expect(live()).toBe(before);
    fireEvent.pointerUp(f.outside, mouse());
    fireEvent.pointerUp(f.row('B'), mouse());
    expect(f.clicked).toEqual([]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a destroy while a finger is held on the trigger clears the long press: it never opens', () => {
    vi.useFakeTimers();
    warmUp();
    const f = fixture();
    const onTriggerPress = vi.fn(() => true);
    const live = trackListeners([document, window, f.menu, f.trigger]);
    const before = live();
    const handle = createMenuPress(f.menu, {
      trigger: f.trigger,
      itemSelector: ITEM_SELECTOR,
      onTriggerPress,
    });
    fireEvent.pointerDown(f.trigger, touch());
    handle.destroy();
    vi.advanceTimersByTime(MENU_PRESS_LONG_PRESS_MS * 2);
    expect(onTriggerPress).not.toHaveBeenCalled();
    expect(live()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a destroy while the menu edge-scrolls stops the scroll', () => {
    vi.useFakeTimers();
    warmUp();
    const f = fixture();
    let scrollTop = 0;
    Object.defineProperties(f.menu, {
      scrollHeight: {configurable: true, get: () => 400},
      clientHeight: {configurable: true, get: () => 100},
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    f.menu.getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const handle = createMenuPress(f.menu, {itemSelector: ITEM_SELECTOR});
    fireEvent.pointerDown(f.row('A'), {...touch(), clientY: 50});
    vi.advanceTimersByTime(MENU_PRESS_SETTLE_MS);
    fireEvent.pointerMove(f.row('A'), {...touch(), clientY: 98});
    vi.advanceTimersByTime(200);
    const scrolled = scrollTop;
    expect(scrolled).toBeGreaterThan(0);
    handle.destroy();
    vi.advanceTimersByTime(500);
    expect(scrollTop).toBe(scrolled);
  });
});

describe('createMenuPress — input modality in the menu\u2019s own document (architecture:interaction-modality)', () => {
  it('tracks the document its menu is in, a same-origin iframe\u2019s or a Picture-in-Picture window\u2019s, until destroy', () => {
    const own = document.implementation.createHTMLDocument();
    const menu = own.createElement('div');
    own.body.append(menu);
    const addEventListener = vi.spyOn(own, 'addEventListener');
    const removeEventListener = vi.spyOn(own, 'removeEventListener');
    const typesOf = (calls: ReadonlyArray<readonly [string, ...unknown[]]>) =>
      calls
        .map(([type]) => type)
        .filter(type => type === 'keydown' || type === 'pointerdown')
        .sort();
    const press = createMenuPress(menu, {itemSelector: ITEM_SELECTOR});
    expect(typesOf(addEventListener.mock.calls)).toEqual([
      'keydown',
      'pointerdown',
    ]);
    own.dispatchEvent(new Event('pointerdown'));
    expect(getInteractionModality(menu)).toBe('pointer');
    press.destroy();
    expect(typesOf(removeEventListener.mock.calls)).toEqual([
      'keydown',
      'pointerdown',
    ]);
  });
});

describe('createMenuPress on the server (spec:AST-107 FR6)', () => {
  it('does no DOM work at import', async () => {
    vi.resetModules();
    const touched: string[] = [];
    const realDocument: Document = document;
    const realMatchMedia: typeof window.matchMedia = window.matchMedia;
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    );
    const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'matchMedia',
    );
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      get(): Document {
        touched.push('document');
        return realDocument;
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      get(): typeof window.matchMedia {
        touched.push('matchMedia');
        return realMatchMedia;
      },
    });
    try {
      const factory = await import('./createMenuPress');
      expect(typeof factory.createMenuPress).toBe('function');
      const hook = await import('./useMenuPress');
      expect(typeof hook.useMenuPress).toBe('function');
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, 'document', documentDescriptor);
      } else {
        delete (globalThis as {document?: unknown}).document;
      }
      if (matchMediaDescriptor) {
        Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
      }
    }
    expect(touched).toEqual([]);
  });
});

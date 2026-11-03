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

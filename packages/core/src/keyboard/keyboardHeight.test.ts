// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardHeight.test.ts
 * @input keyboardHeight.ts, the keyboard layout guide, a stand-in visual
 *   viewport
 * @output Tests for the on-screen keyboard module: the height, where it
 *   measures, its one set of listeners and the focus refusal
 * @position Keyboard module tests
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act} from '@testing-library/react';
import {bringsUpKeyboard, getKeyboardLayoutGuide} from './keyboardLayoutGuide';
import {
  __resetLayoutViewportForTest,
  layoutViewportHeight,
} from '../utils/layoutViewport';
import {
  findTextEntryControl,
  getKeyboardHeight,
  isKeyboardMeasurable,
  isTextEntryControl,
  measureKeyboardHeight,
  refuseFocusReveal,
  subscribeKeyboardHeight,
  watchRevealPan,
  type KeyboardHeightEvent,
} from './keyboardHeight';

type FakeViewport = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
  width?: number;
};

let viewport: FakeViewport;

function report(changes: Partial<FakeViewport>) {
  Object.assign(viewport, changes);
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
}

beforeEach(() => {
  viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    offsetTop: 0,
    scale: 1,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'visualViewport');
  Reflect.deleteProperty(window.navigator, 'virtualKeyboard');
  for (const key of ['clientWidth', 'clientHeight', 'scrollWidth']) {
    Reflect.deleteProperty(document.documentElement, key);
  }
  __resetLayoutViewportForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the keyboard height (spec:AST-099 FR2)', () => {
  it('is the layout viewport minus the visual viewport', () => {
    viewport.height = window.innerHeight - 300;
    expect(measureKeyboardHeight(window)).toBe(300);
  });

  it('is not made smaller by a page pan', () => {
    viewport.height = window.innerHeight - 300;
    viewport.offsetTop = 120;
    expect(measureKeyboardHeight(window)).toBe(300);
  });

  it('is 0 while pinch-zoomed with no keyboard, and the keyboard with one', () => {
    viewport.scale = 2;
    viewport.height = window.innerHeight / 2;
    expect(measureKeyboardHeight(window)).toBe(0);
    viewport.height = (window.innerHeight - 300) / 2;
    expect(measureKeyboardHeight(window)).toBe(300);
  });

  it('is 0 with no keyboard shown', () => {
    expect(measureKeyboardHeight(window)).toBe(0);
  });
});

describe('the layout viewport WebKit reports under a pinch zoom (FR2)', () => {
  // Measured in Safari on iOS 26.2 on an iPhone 17 Pro, with a 402 × 714
  // layout viewport and a 337 px keyboard. WebKit reports innerWidth and
  // innerHeight in the zoomed visual viewport's px. The visual viewport's
  // height times its scale stays in layout px.
  function safari({
    innerHeight,
    innerWidth,
    height,
    scale,
    offsetTop = 0,
  }: {
    innerHeight: number;
    innerWidth: number;
    height: number;
    scale: number;
    offsetTop?: number;
  }) {
    vi.stubGlobal('innerHeight', innerHeight);
    vi.stubGlobal('innerWidth', innerWidth);
    // The visual viewport is the 402 px layout width over the zoom.
    Object.assign(viewport, {height, scale, offsetTop, width: 402 / scale});
  }

  it('reads the keyboard at scale 1', () => {
    safari({innerHeight: 714, innerWidth: 402, height: 377, scale: 1});
    expect(measureKeyboardHeight(window)).toBe(337);
    expect(layoutViewportHeight(window)).toBe(714);
  });

  it('reads the same keyboard pinch-zoomed to 1.33', () => {
    safari({innerHeight: 536, innerWidth: 302, height: 282.75, scale: 4 / 3});
    expect(Math.abs(measureKeyboardHeight(window) - 337)).toBeLessThan(1);
  });

  it('follows the layout viewport WebKit clamps to the document after a scroll', () => {
    safari({
      innerHeight: 666,
      innerWidth: 402,
      height: 377,
      scale: 1,
      offsetTop: 120,
    });
    expect(measureKeyboardHeight(window)).toBe(289);
  });

  it('reads the same keyboard scrolled and pinch-zoomed', () => {
    safari({
      innerHeight: 536,
      innerWidth: 302,
      height: 282.75,
      scale: 4 / 3,
      offsetTop: 154.5,
    });
    expect(Math.abs(measureKeyboardHeight(window) - 337)).toBeLessThan(1);
  });

  it('keeps the keyboard past a 2x zoom, where innerHeight alone reads none', () => {
    safari({innerHeight: 357, innerWidth: 201, height: 188.5, scale: 2});
    expect(measureKeyboardHeight(window)).toBe(337);
  });

  it('reads no keyboard pinch-zoomed with none, in WebKit and where innerHeight ignores the zoom', () => {
    safari({innerHeight: 536, innerWidth: 302, height: 536, scale: 4 / 3});
    expect(measureKeyboardHeight(window)).toBe(0);
    safari({innerHeight: 714, innerWidth: 402, height: 535.5, scale: 4 / 3});
    expect(measureKeyboardHeight(window)).toBe(0);
  });

  it('reads no keyboard beside a classic scrollbar', () => {
    // A desktop page with a 17 px vertical scrollbar, which innerWidth and
    // not the document's client width or the visual viewport counts.
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('innerWidth', 1280);
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1263,
    });
    Object.assign(viewport, {height: 800, scale: 1, width: 1263});
    expect(layoutViewportHeight(window)).toBe(800);
    expect(measureKeyboardHeight(window)).toBe(0);
  });

  /** The document's root: its client box and how wide its content is. */
  function root(box: {
    clientHeight: number;
    clientWidth: number;
    scrollWidth: number;
  }) {
    for (const [key, value] of Object.entries(box)) {
      Object.defineProperty(document.documentElement, key, {
        configurable: true,
        value,
      });
    }
  }

  /**
   * Scrollbars that take `thickness` px of a scrolling box (0: overlaid).
   * `probes` counts the scrolling boxes measured.
   */
  function scrollbars(thickness: number): {probes: number} {
    const counter = {probes: 0};
    const scrolls = (el: Element) =>
      el instanceof HTMLElement && el.style.overflow === 'scroll';
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        if (scrolls(this)) {
          counter.probes += 1;
          return 100;
        }
        return 0;
      },
    );
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(
      function (this: Element) {
        return scrolls(this) ? 100 - thickness : 0;
      },
    );
    return counter;
  }

  it('reads no keyboard from a desktop page\u2019s classic horizontal scrollbar', () => {
    // Chromium with classic scrollbars, on a page wider than the window.
    // innerHeight counts the 15 px scrollbar. The visual viewport and the
    // document's client height do not.
    scrollbars(15);
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('innerWidth', 1280);
    root({clientHeight: 785, clientWidth: 1280, scrollWidth: 1600});
    Object.assign(viewport, {height: 785, scale: 1, width: 1280});
    expect(layoutViewportHeight(window)).toBe(785);
    expect(measureKeyboardHeight(window)).toBe(0);
  });

  it('measures the scrollbar once, however many keyboard changes read the height (INV11)', () => {
    // The probe writes to the document and forces a layout: it runs once,
    // and every later measurement reuses the thickness.
    const counter = scrollbars(15);
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('innerWidth', 1280);
    root({clientHeight: 785, clientWidth: 1280, scrollWidth: 1600});
    Object.assign(viewport, {height: 785, scale: 1, width: 1280});
    for (let i = 0; i < 3; i += 1) {
      expect(measureKeyboardHeight(window)).toBe(0);
    }
    expect(counter.probes).toBe(1);
  });

  it('reads the whole keyboard under a hidden toolbar, which no scrollbar explains', () => {
    // Chrome on Android sizes the document's client height to the viewport
    // with its toolbar shown, 754 px, and overlays its scrollbars. So the
    // 136 px a hidden toolbar adds to innerHeight is no scrollbar, also on a
    // page wider than the window.
    scrollbars(0);
    vi.stubGlobal('innerHeight', 890);
    vi.stubGlobal('innerWidth', 411);
    root({clientHeight: 754, clientWidth: 411, scrollWidth: 1600});
    Object.assign(viewport, {height: 590, scale: 1, width: 411});
    expect(measureKeyboardHeight(window)).toBe(300);
  });
});

describe('where the keyboard is measured (FR6, FR7)', () => {
  it('measures with a visual viewport and no keyboard geometry API', () => {
    expect(isKeyboardMeasurable(window)).toBe(true);
  });

  it('measures Chrome on Android from its visual viewport, which has its own keyboard geometry API (DEC-4)', () => {
    // Gboard shrinks Chrome's visual viewport while the layout viewport keeps
    // its height, as everywhere else; the VirtualKeyboard API is not read.
    Object.defineProperty(window.navigator, 'virtualKeyboard', {
      configurable: true,
      value: {overlaysContent: false},
    });
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({matches: false, media: query}) as unknown as MediaQueryList,
    );
    viewport.height = window.innerHeight - 300;
    expect(isKeyboardMeasurable(window)).toBe(true);
    expect(measureKeyboardHeight(window)).toBe(300);
  });

  it('reads no keyboard where a desktop browser with the API shows none', () => {
    Object.defineProperty(window.navigator, 'virtualKeyboard', {
      configurable: true,
      value: {overlaysContent: false},
    });
    expect(measureKeyboardHeight(window)).toBe(0);
  });

  it('reads no keyboard under interactive-widget=resizes-content, where Chrome shrinks the layout viewport with it (FR8)', () => {
    Object.defineProperty(window.navigator, 'virtualKeyboard', {
      configurable: true,
      value: {overlaysContent: false},
    });
    const full = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: full - 300,
    });
    try {
      viewport.height = full - 300;
      expect(measureKeyboardHeight(window)).toBe(0);
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: full,
      });
    }
  });

  it('measures nothing without a visual viewport', () => {
    Reflect.deleteProperty(window, 'visualViewport');
    expect(measureKeyboardHeight(window)).toBe(0);
  });

  it('measures nothing inside an iframe', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const inner = frame.contentWindow as Window;
    Object.defineProperty(inner, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        height: inner.innerHeight - 300,
        offsetTop: 0,
        scale: 1,
      }),
    });
    expect(isKeyboardMeasurable(inner)).toBe(false);
    expect(measureKeyboardHeight(inner)).toBe(0);
    frame.remove();
  });
});

describe('one set of listeners per window (FR1, INV11)', () => {
  it('shares the listeners among subscribers and removes them with the last', () => {
    const add = vi.spyOn(viewport, 'addEventListener');
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribeKeyboardHeight(window, first);
    const stopSecond = subscribeKeyboardHeight(window, second);
    expect(add.mock.calls.map(([type]) => type)).toEqual(['resize', 'scroll']);

    report({height: window.innerHeight - 300});
    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'viewport', height: 300}),
    );
    expect(second).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'viewport', height: 300}),
    );

    stopFirst();
    expect(remove).not.toHaveBeenCalled();
    stopSecond();
    expect(remove.mock.calls.map(([type]) => type)).toEqual([
      'resize',
      'scroll',
    ]);
  });

  it('feeds the keyboard layout guide, which adds no listener of its own', () => {
    const add = vi.spyOn(viewport, 'addEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const stopHook = subscribeKeyboardHeight(window, () => {});
    const guide = getKeyboardLayoutGuide(window);
    const transitions: number[] = [];
    const stopGuide = guide.subscribe(transition => {
      transitions.push(transition.to);
    });
    expect(add).toHaveBeenCalledTimes(2);
    expect(
      windowAdd.mock.calls.filter(([type]) => type === 'resize'),
    ).toHaveLength(1);

    report({height: window.innerHeight - 300});
    expect(transitions.at(-1)).toBe(300);
    expect(guide.inset).toBe(300);
    stopGuide();
    stopHook();
  });

  it('reads the layout once per keyboard change, however many read the height (INV11)', () => {
    // Count every read of the visual viewport's height: one per measurement.
    let height = viewport.height;
    let reads = 0;
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => {
        reads += 1;
        return height;
      },
      set: (value: number) => {
        height = value;
      },
    });
    const seen: number[] = [];
    // Three readers, each reading the height again as it lays out.
    const reader = () => (event: KeyboardHeightEvent) => {
      if (event.type === 'viewport') {
        seen.push(getKeyboardHeight(window), event.height);
      }
    };
    // And the keyboard layout guide, whose rider reads the height again as
    // it commits its layout.
    const stopGuide = getKeyboardLayoutGuide(window).subscribe(transition => {
      seen.push(getKeyboardHeight(window), transition.to);
    });
    const stops = [reader(), reader(), reader()].map(listener =>
      subscribeKeyboardHeight(window, listener),
    );
    try {
      reads = 0;
      report({height: window.innerHeight - 300});
      expect(seen).toHaveLength(8);
      expect(seen.every(value => value === 300)).toBe(true);
      expect(reads).toBe(1);
    } finally {
      for (const stop of stops) {
        stop();
      }
      stopGuide();
    }
  });
  it('listens to focus moves only while a subscriber asks for them, through one pair of shared input listeners (spec:AST-094 FR24)', () => {
    const documentAdd = vi.spyOn(window, 'addEventListener');
    const documentRemove = vi.spyOn(window, 'removeEventListener');
    const focusCalls = (spy: typeof documentAdd) =>
      spy.mock.calls
        .filter(([type]) => type.startsWith('focus'))
        .map(([type]) => type);
    const viewportTypes: string[] = [];
    const guideTypes: string[] = [];
    const input = document.createElement('input');
    document.body.append(input);
    // A viewport reader (a Tall BottomSheet's hook) adds no focus listener.
    const stopViewport = subscribeKeyboardHeight(window, event => {
      viewportTypes.push(event.type);
    });
    try {
      expect(focusCalls(documentAdd)).toEqual([]);
      // Readers of focus moves (the keyboard layout guide) share one pair.
      const stopA = subscribeKeyboardHeight(
        window,
        event => {
          guideTypes.push(event.type);
        },
        {focus: true},
      );
      const stopB = subscribeKeyboardHeight(window, () => {}, {focus: true});
      expect(focusCalls(documentAdd)).toEqual(['focusin', 'focusout']);
      input.focus();
      input.blur();
      expect(guideTypes).toEqual(['focusin', 'focusout']);
      expect(viewportTypes).toEqual([]);
      stopA();
      expect(focusCalls(documentRemove)).toEqual([]);
      stopB();
      expect(focusCalls(documentRemove)).toEqual(['focusin', 'focusout']);
    } finally {
      input.remove();
      stopViewport();
      documentAdd.mockRestore();
      documentRemove.mockRestore();
    }
  });

  it('reports the window\u2019s own resize, not a resize event an element sends through the window', () => {
    const heights: number[] = [];
    const stop = subscribeKeyboardHeight(window, event => {
      heights.push(event.height);
    });
    try {
      document.body.dispatchEvent(new Event('resize'));
      expect(heights).toEqual([]);
      window.dispatchEvent(new Event('resize'));
      expect(heights).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('reads a keyboard that is already up when the first subscriber attaches', () => {
    // Nothing listens yet: the keyboard came up before any keyboard-aware
    // component mounted (a sheet opened from a focused field).
    viewport.height = window.innerHeight - 300;
    expect(getKeyboardHeight(window)).toBe(300);
    const heights: number[] = [];
    const stop = subscribeKeyboardHeight(window, event => {
      if (event.type === 'viewport') {
        heights.push(event.height);
      }
    });
    expect(getKeyboardHeight(window)).toBe(300);
    // The guide reads it too.
    const guide = getKeyboardLayoutGuide(window);
    const stopGuide = guide.subscribe(() => {});
    expect(guide.inset).toBe(300);
    report({height: window.innerHeight});
    expect(heights).toEqual([0]);
    stopGuide();
    stop();
  });
  it('is the only visual viewport listener for the keyboard in core', () => {
    // Visible-viewport readers that place layers and scroll areas, not the
    // keyboard; the layer cap's keyboard is architecture:layer-runtime's.
    const visibleViewportReaders = new Set([
      'AppShell/observeMainOverflow.ts',
      'DropdownMenu/useMenuOverflow.ts',
      'Popover/Popover.tsx',
      'hooks/useScrollableArea.ts',
    ]);
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(file);
          continue;
        }
        if (
          !/\.tsx?$/.test(entry.name) ||
          /\.(test|spec|stories)\./.test(entry.name)
        ) {
          continue;
        }
        const relative = path.relative(root, file).split(path.sep).join('/');
        const source = fs.readFileSync(file, 'utf8');
        if (
          /visualViewport\??\.addEventListener|viewport\??\.addEventListener\(\s*'(resize|scroll)'/.test(
            source,
          ) &&
          relative !== 'keyboard/keyboardHeight.ts' &&
          !visibleViewportReaders.has(relative)
        ) {
          offenders.push(relative);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('the focus refusal (FR4)', () => {
  it('delivers a claimed focus move with preventScroll and parks focus that leaves for nothing', () => {
    const first = document.createElement('input');
    const second = document.createElement('input');
    const park = vi.fn();
    document.body.append(first, second);
    const stop = refuseFocusReveal(document, {
      claim: target => (target === second ? second : null),
      park,
    });
    const focus = vi.spyOn(second, 'focus');
    first.focus();
    second.focus();
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    second.blur();
    expect(park).toHaveBeenCalledWith(second);
    stop();
    first.remove();
    second.remove();
  });

  it('leaves the window\u2019s own blur alone: it moves no focus in the document', () => {
    const parked: unknown[] = [];
    const stop = refuseFocusReveal(document, {
      claim: () => null,
      park: origin => parked.push(origin),
    });
    try {
      window.dispatchEvent(new FocusEvent('blur'));
      expect(parked).toEqual([]);
    } finally {
      stop();
    }
  });

  it('shares one blur subscription among its callers, each still hearing every blur (spec:AST-094 FR24)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const field = document.createElement('input');
    const other = document.createElement('input');
    document.body.append(field, other);
    const heard: string[] = [];
    const stopFirst = refuseFocusReveal(document, {
      claim: () => {
        heard.push('first');
        return null;
      },
    });
    const stopSecond = refuseFocusReveal(document, {
      claim: () => {
        heard.push('second');
        return null;
      },
    });
    expect(add.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(1);
    field.focus();
    other.focus();
    expect(heard).toEqual(['first', 'second']);
    stopFirst();
    expect(remove).not.toHaveBeenCalled();
    field.focus();
    expect(heard).toEqual(['first', 'second', 'second']);
    stopSecond();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['blur']);
    field.remove();
    other.remove();
  });
});

describe('the browser\u2019s own reveal pan (FR4)', () => {
  function setup() {
    const region = document.createElement('div');
    const field = document.createElement('textarea');
    const outside = document.createElement('textarea');
    region.append(field);
    document.body.append(region, outside);
    const watch = watchRevealPan(window, {
      owns: focused => region.contains(focused),
    });
    field.focus();
    viewport.height = window.innerHeight - 300;
    watch.report();
    return {region, field, outside, watch};
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('sees the visual viewport moving down after the report as a reveal pan of an owned field', () => {
    const {watch} = setup();
    expect(watch.isRevealPan(300)).toBe(false);
    viewport.offsetTop = 300;
    expect(watch.isRevealPan(300)).toBe(true);
    expect(watch.isRevealPan(0)).toBe(false);
    watch.stop();
  });

  it('leaves alone a reader\u2019s own pan, a document scroll, a zoom, and a field it does not own', () => {
    const touched = setup();
    document.dispatchEvent(new Event('touchstart'));
    viewport.offsetTop = 300;
    expect(touched.watch.isRevealPan(300)).toBe(false);
    touched.watch.stop();
    document.body.replaceChildren();
    viewport.offsetTop = 0;

    const scrolled = setup();
    vi.stubGlobal('scrollY', 120);
    viewport.offsetTop = 300;
    expect(scrolled.watch.isRevealPan(300)).toBe(false);
    scrolled.watch.stop();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    viewport.offsetTop = 0;

    const zoomed = setup();
    Object.assign(viewport, {offsetTop: 300, scale: 1.5});
    expect(zoomed.watch.isRevealPan(300)).toBe(false);
    zoomed.watch.stop();
    document.body.replaceChildren();
    Object.assign(viewport, {offsetTop: 0, scale: 1});

    const elsewhere = setup();
    elsewhere.outside.focus();
    viewport.offsetTop = 300;
    expect(elsewhere.watch.isRevealPan(300)).toBe(false);
    elsewhere.watch.stop();
  });

  it('puts the pan back by scrolling a fixed probe at the report\u2019s offset into view, or a given anchor', () => {
    const {watch} = setup();
    const scrolled: {element: HTMLElement; position: string; top: string}[] =
      [];
    // jsdom has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push({
          element: this,
          position: this.style.position,
          top: this.style.top,
        });
      },
    });
    viewport.offsetTop = 300;
    watch.putBack();
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0].position).toBe('fixed');
    expect(scrolled[0].top).toBe('0px');
    // The probe is gone once the sheet puts the pan back.
    expect(scrolled[0].element.isConnected).toBe(false);

    const anchor = document.createElement('dialog');
    document.body.append(anchor);
    watch.putBack(anchor);
    expect(scrolled.at(-1)?.element).toBe(anchor);
    watch.stop();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('listens for touches only while it watches', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const watch = watchRevealPan(window, {owns: () => true});
    expect(add.mock.calls.map(([type]) => type)).toEqual(['touchstart']);
    watch.stop();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['touchstart']);
  });

  it('shares one touch subscription among its watches (architecture INV13, spec:AST-094 FR24)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const touched: string[] = [];
    const first = watchRevealPan(window, {
      owns: () => true,
      onTouch: () => touched.push('first'),
    });
    const second = watchRevealPan(window, {
      owns: () => true,
      onTouch: () => touched.push('second'),
    });
    expect(add.mock.calls.map(([type]) => type)).toEqual(['touchstart']);
    document.dispatchEvent(new Event('touchstart'));
    expect(touched).toEqual(['first', 'second']);
    first.stop();
    expect(remove).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('touchstart'));
    expect(touched).toEqual(['first', 'second', 'second']);
    second.stop();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['touchstart']);
  });
});

describe('the text-entry predicate', () => {
  it('reads an inputmode="none" field as no text entry, as the keyboard layout guide does', () => {
    const input = document.createElement('input');
    input.setAttribute('inputmode', 'none');
    document.body.append(input);
    try {
      expect(isTextEntryControl(input)).toBe(false);
      expect(findTextEntryControl(input, document.body)).toBeNull();
      expect(bringsUpKeyboard(input)).toBe(false);
    } finally {
      input.remove();
    }
  });

  it('gives the keyboard layout guide only a select beyond the text-entry controls', () => {
    const select = document.createElement('select');
    const text = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const area = document.createElement('textarea');
    area.readOnly = true;
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', '');
    document.body.append(select, text, box, area, editable);
    try {
      expect(isTextEntryControl(select)).toBe(false);
      expect(bringsUpKeyboard(select)).toBe(true);
      for (const element of [text, box, area, editable]) {
        expect(bringsUpKeyboard(element)).toBe(isTextEntryControl(element));
      }
    } finally {
      for (const element of [select, text, box, area, editable]) {
        element.remove();
      }
    }
  });
});

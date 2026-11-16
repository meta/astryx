// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardUIKit.test.ts
 * @input vitest, jsdom, getKeyboardLayoutGuide with UIKit's schedule
 *   registered, a stand-in visual viewport, a stand-in CSS.supports
 * @output Tests the guide in Safari on iOS. A keyboard coming up rides from
 *   Safari's one report on UIKit's keyboard spring. A hide rides down from
 *   the blur, as a prediction that Safari's later report confirms. Focus that
 *   moves between fields, to a picker in the keyboard's place, or to a field
 *   the page cannot see, moves nothing. Two pending cases hold a second
 *   report that comes while the keyboard still moves.
 * @position Unit tests for the iOS part of keyboard/keyboardLayoutGuide.ts
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {timing as uikitTiming} from '../motion/uikit/timing';
import {
  getKeyboardLayoutGuide,
  keyboardProfileOf,
  registerUIKitKeyboardSchedule,
} from './keyboardLayoutGuide';
import {isElement} from '../utils/nodeType';
import {mayKeepKeyboard} from './keyboardTarget';
import {createUIKitKeyboardSchedule} from './uikitKeyboardSchedule';
import type {KeyboardTransition} from './keyboardModel';

let view: EventTarget & {height: number; offsetTop: number; scale: number};
let a: HTMLInputElement;
let b: HTMLInputElement;
let date: HTMLInputElement;
let button: HTMLButtonElement;
const seen: KeyboardTransition[] = [];
let unsubscribe: () => void = () => {};
const uikitKeyboardSchedule = createUIKitKeyboardSchedule({
  notificationMs: uikitTiming.keyboardNotificationMs,
  mayKeepKeyboard,
  isElement,
});
const uikitSpring = uikitKeyboardSchedule.curve;

const report = (cover: number) => {
  view.height = window.innerHeight - cover;
  view.dispatchEvent(new Event('resize'));
};

describe('Safari on iOS’s keyboard schedule in the touch runtime’s chunk', () => {
  // A module the page's first load also holds would make bundlers split a
  // chunk out of the first load. The schedule reads the spring's table and the
  // solver the runtime's animator already holds. The keyboard riders give it
  // everything else.
  it('imports values only from the spring table and the spring solver', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.join(here, 'uikitKeyboardSchedule.ts'),
      'utf8',
    );
    const valueImports = [
      ...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)';/gms),
    ].map(match => match[1]);
    expect(valueImports).toEqual([
      '../motion/spring',
      '../motion/uikit/springs',
    ]);
  });
});

describe('the keyboard layout guide in Safari on iOS', () => {
  // A keyboard rider registers how the guide reads UIKit's schedule.
  beforeAll(() => {
    registerUIKitKeyboardSchedule(() => uikitKeyboardSchedule);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    // One clock for event times and the guide's own reads, as in a browser.
    vi.spyOn(window.performance, 'now').mockImplementation(() => Date.now());
    view = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: view,
    });
    // WebKit on iOS: the one engine that supports -webkit-touch-callout.
    vi.stubGlobal('CSS', {
      supports: (property: string, value: string) =>
        property === '-webkit-touch-callout' && value === 'none',
    });
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(pointer: coarse)',
          media: query,
        }) as unknown as MediaQueryList,
    );
    document.body.innerHTML =
      '<input id="a"><button id="go">Go</button><input id="b"><input id="date" type="date">';
    a = document.getElementById('a') as HTMLInputElement;
    b = document.getElementById('b') as HTMLInputElement;
    date = document.getElementById('date') as HTMLInputElement;
    button = document.getElementById('go') as HTMLButtonElement;
    seen.length = 0;
    unsubscribe = getKeyboardLayoutGuide(window).subscribe(t => seen.push(t));
  });

  afterEach(() => {
    unsubscribe();
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.innerHTML = '';
    Reflect.deleteProperty(window, 'visualViewport');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rides nothing in Safari on iOS until the touch runtime registers UIKit’s schedule, as before the ride', () => {
    registerUIKitKeyboardSchedule(null);
    try {
      expect(keyboardProfileOf(window)).toBeNull();
    } finally {
      registerUIKitKeyboardSchedule(() => uikitKeyboardSchedule);
    }
    expect(keyboardProfileOf(window)).toBe('uikit');
  });

  it('reads UIKit’s keyboard schedule from the engine’s capability, never the user agent', () => {
    expect(keyboardProfileOf(window)).toBe('uikit');
    expect(getKeyboardLayoutGuide(window).profile).toBe('uikit');
  });

  it('rides a keyboard coming up from Safari’s one report, on UIKit’s keyboard spring', () => {
    a.focus();
    let reportAt = 0;
    view.addEventListener(
      'resize',
      event => {
        reportAt = event.timeStamp;
      },
      {once: true},
    );
    report(336);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      kind: 'show',
      to: 336,
      animated: true,
      predicted: false,
    });
    expect(seen[0]?.start).toBeCloseTo(reportAt, 6);
    expect(seen[0]?.curve).toBe(uikitSpring);
  });

  it('rides a hide down from the blur on the same spring, and keeps it until Safari reports the keyboard down', () => {
    a.focus();
    report(336);
    vi.advanceTimersByTime(1000);
    let blurAt = 0;
    a.addEventListener(
      'focusout',
      event => {
        blurAt = event.timeStamp;
      },
      {once: true},
    );
    button.focus();
    const hide = seen.at(-1);
    expect(hide).toMatchObject({
      kind: 'hide',
      to: 0,
      animated: true,
      predicted: true,
    });
    expect(hide?.start).toBeCloseTo(blurAt, 6);
    expect(hide?.curve).toBe(uikitSpring);
    // Safari still reads the keyboard up once the spring ends: the hide
    // stands, with nothing turned back.
    vi.advanceTimersByTime(uikitTiming.keyboardNotificationMs + 200);
    expect(seen.at(-1)).toBe(hide);
    // Safari's report of the keyboard down confirms it.
    report(0);
    expect(seen.at(-1)).toBe(hide);
    expect(getKeyboardLayoutGuide(window).transition.predicted).toBe(false);
  });

  it('predicts no hide when focus moves into a frame, whose own field can keep the keyboard up', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    a.focus();
    report(336);
    seen.length = 0;
    frame.focus();
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(frame);
    expect(seen).toHaveLength(0);
  });

  it('predicts no hide when focus moves into a frame and Safari names no related target', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    a.focus();
    report(336);
    seen.length = 0;
    // Safari's focusout names no related target when focus moves into a
    // frame. The frame becomes the active element only after it.
    a.dispatchEvent(
      new FocusEvent('focusout', {bubbles: true, relatedTarget: null}),
    );
    frame.focus();
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(frame);
    expect(seen).toHaveLength(0);
  });

  it('predicts no hide when focus moves into a frame after the page parks focus on its own element', () => {
    const parking = document.createElement('div');
    parking.tabIndex = -1;
    document.body.append(parking);
    a.focus();
    report(336);
    seen.length = 0;
    // Safari, with focus moving into a frame: the page parks focus on its own
    // element during the field's blur. The focusout names no related target,
    // and this window then blurs while its document keeps focus.
    const active = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(parking);
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    try {
      a.dispatchEvent(
        new FocusEvent('focusout', {bubbles: true, relatedTarget: null}),
      );
      window.dispatchEvent(new FocusEvent('blur'));
      vi.advanceTimersByTime(0);
      expect(seen).toHaveLength(0);
    } finally {
      active.mockRestore();
      hasFocus.mockRestore();
    }
  });

  it('still predicts the hide from a blur to nothing when this window keeps focus', () => {
    const parking = document.createElement('div');
    parking.tabIndex = -1;
    document.body.append(parking);
    a.focus();
    report(336);
    vi.advanceTimersByTime(1000);
    seen.length = 0;
    const active = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(parking);
    try {
      a.dispatchEvent(
        new FocusEvent('focusout', {bubbles: true, relatedTarget: null}),
      );
      vi.advanceTimersByTime(0);
      expect(seen.at(-1)).toMatchObject({kind: 'hide', predicted: true});
    } finally {
      active.mockRestore();
    }
  });

  it('rides a hide down from a blur to nothing, dated at the blur', () => {
    a.focus();
    report(336);
    vi.advanceTimersByTime(1000);
    seen.length = 0;
    let blurAt = 0;
    a.addEventListener(
      'focusout',
      event => {
        blurAt = event.timeStamp;
      },
      {once: true},
    );
    a.blur();
    vi.advanceTimersByTime(0);
    expect(seen.at(-1)).toMatchObject({kind: 'hide', to: 0, predicted: true});
    expect(seen.at(-1)?.start).toBeCloseTo(blurAt, 6);
  });

  it('decides once focus settles inside an open shadow root: a field there keeps the keyboard, a plain button takes it down', () => {
    const host = document.createElement('x-editor');
    const root = host.attachShadow({mode: 'open'});
    const inner = root.appendChild(document.createElement('input'));
    const plain = root.appendChild(document.createElement('button'));
    document.body.append(host);
    a.focus();
    report(336);
    seen.length = 0;
    inner.focus();
    vi.advanceTimersByTime(0);
    expect(seen).toHaveLength(0);
    a.focus();
    plain.focus();
    vi.advanceTimersByTime(0);
    expect(seen.at(-1)).toMatchObject({
      kind: 'hide',
      to: 0,
      predicted: true,
    });
  });

  it('turns a predicted hide back up when focus moves into a frame before the keyboard is down', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    a.focus();
    report(336);
    vi.advanceTimersByTime(1000);
    button.focus();
    expect(seen.at(-1)).toMatchObject({kind: 'hide', predicted: true});
    vi.advanceTimersByTime(100);
    frame.focus();
    expect(seen.at(-1)).toMatchObject({kind: 'show', to: 336});
    expect(seen.at(-1)?.curve).toBe(uikitSpring);
  });

  it('moves nothing while focus moves between fields, or to a date field whose picker takes the keyboard’s place', () => {
    a.focus();
    report(336);
    seen.length = 0;
    b.focus();
    date.focus();
    expect(seen).toHaveLength(0);
  });

  // Safari reports a second height while the keyboard still comes up. It is
  // shorter when focus moves to a field without QuickType, and taller for the
  // emoji keyboard.
  it.todo(
    're-aims the show when Safari reports a shorter keyboard mid-show: 347 px, then 320 px 126 ms or 233 ms in',
  );
  it.todo(
    're-aims the show when Safari reports a taller keyboard mid-show: 347 px, then 401 px',
  );
});

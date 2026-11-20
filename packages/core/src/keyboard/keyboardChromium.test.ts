// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardChromium.test.ts
 * @input vitest, jsdom, getKeyboardLayoutGuide, a stand-in visual viewport in
 *   Chrome's profile and a stand-in navigator.virtualKeyboard
 * @output Tests the guide on Chrome. A keyboard coming up rides from its
 *   report, dated back to Gboard's start, on Gboard's slide. The accessory
 *   bar's report rides to the last keyboard's height. A hide rides down from
 *   the blur or from its report. Focus moving between fields holds Chrome's
 *   momentary hide. The page's VirtualKeyboard is never touched.
 * @position Unit tests for the Chrome part of keyboard/keyboardLayoutGuide.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {keyboard as androidKeyboard} from '../motion/android';
import {getKeyboardLayoutGuide} from './keyboardLayoutGuide';
import type {KeyboardTransition} from './keyboardModel';

let view: EventTarget & {height: number; offsetTop: number; scale: number};
let virtualKeyboard: EventTarget & {overlaysContent: boolean};
let a: HTMLInputElement;
let b: HTMLInputElement;
let button: HTMLButtonElement;
const seen: KeyboardTransition[] = [];
let unsubscribe: () => void = () => {};
const innerHeightDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'innerHeight',
) as PropertyDescriptor;

const report = (cover: number) => {
  view.height = window.innerHeight - cover;
  view.dispatchEvent(new Event('resize'));
};

describe('the keyboard layout guide on Chrome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    view = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: view,
    });
    virtualKeyboard = Object.assign(new EventTarget(), {
      overlaysContent: false,
    });
    Object.defineProperty(window.navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    // Under a finger: the keyboard module measures Chrome's visual viewport.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(pointer: coarse)',
          media: query,
        }) as unknown as MediaQueryList,
    );
    document.body.innerHTML =
      '<input id="a"><button id="pop">Open</button><input id="b">';
    a = document.getElementById('a') as HTMLInputElement;
    b = document.getElementById('b') as HTMLInputElement;
    button = document.getElementById('pop') as HTMLButtonElement;
    seen.length = 0;
    unsubscribe = getKeyboardLayoutGuide(window).subscribe(t => seen.push(t));
  });

  afterEach(() => {
    unsubscribe();
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', innerHeightDescriptor);
    Reflect.deleteProperty(window, 'visualViewport');
    Reflect.deleteProperty(window.navigator, 'virtualKeyboard');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rides a keyboard coming up from its report, dated back to Gboard’s start, on Gboard’s slide', () => {
    expect(getKeyboardLayoutGuide(window).profile).toBe('chromium');
    a.focus();
    let reportAt = 0;
    view.addEventListener(
      'resize',
      event => {
        reportAt = event.timeStamp;
      },
      {once: true},
    );
    report(312);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({kind: 'show', to: 312, animated: true});
    expect(seen[0]?.start).toBeCloseTo(
      reportAt - androidKeyboard.showReportLagMs,
      6,
    );
    expect(seen[0]?.curve).toEqual({
      durationMs: androidKeyboard.showMs,
      points: androidKeyboard.showCurve,
    });
  });

  it('rides to the last keyboard’s height for the accessory bar’s report, and the keyboard’s report confirms it', () => {
    a.focus();
    report(312);
    a.blur();
    report(0);
    vi.advanceTimersByTime(1000);
    seen.length = 0;
    b.focus();
    report(48);
    expect(seen.at(-1)).toMatchObject({
      kind: 'show',
      to: 312,
      animated: true,
      predicted: true,
    });
    report(312);
    // Confirmed: no second motion.
    expect(seen).toHaveLength(1);
    expect(getKeyboardLayoutGuide(window).transition.predicted).toBe(false);
  });

  it('rides a hide down from hideAfterBlurMs after our blur, on Gboard’s slide', () => {
    a.focus();
    report(312);
    vi.advanceTimersByTime(1000);
    let blurAt = 0;
    a.addEventListener(
      'focusout',
      event => {
        blurAt = event.timeStamp;
      },
      {once: true},
    );
    a.blur();
    const hide = seen.at(-1);
    expect(hide).toMatchObject({kind: 'hide', to: 0, animated: true});
    expect(hide?.start).toBeCloseTo(
      blurAt + androidKeyboard.hideAfterBlurMs,
      6,
    );
    expect(hide?.curve).toEqual({
      durationMs: androidKeyboard.hideMs,
      points: androidKeyboard.hideCurve,
    });
    // Chrome's report confirms it.
    report(0);
    expect(seen.at(-1)).toBe(hide);
  });

  it.each([
    ['a frame', () => document.createElement('iframe')],
    [
      'a shadow host',
      () => {
        const host = document.createElement('x-editor');
        host
          .attachShadow({mode: 'open'})
          .append(document.createElement('input'));
        return host;
      },
    ],
  ] as const)(
    'checks a prediction Chrome never confirms 150 ms after its slide ends when focus moves into %s, whose own field the guide cannot see',
    (_, make) => {
      // One clock for event times and the guide's own reads, as in a browser.
      vi.spyOn(window.performance, 'now').mockImplementation(() => Date.now());
      const container = make();
      document.body.append(container);
      a.focus();
      report(312);
      vi.advanceTimersByTime(1000);
      const inner = container.shadowRoot?.querySelector('input');
      if (inner != null) {
        inner.focus();
      } else {
        container.focus();
      }
      expect(document.activeElement).toBe(container);
      const hide = seen.at(-1);
      expect(hide).toMatchObject({kind: 'hide', to: 0, predicted: true});
      // The keyboard stays up for the field inside: Chrome never reports the
      // hide. Once the slide should have ended, and 150 ms more, the guide
      // believes the viewport.
      const due = (hide?.start ?? 0) + androidKeyboard.hideMs + 150;
      vi.advanceTimersByTime(due - Date.now() - 1);
      expect(seen.at(-1)).toBe(hide);
      vi.advanceTimersByTime(2);
      expect(seen.at(-1)).toMatchObject({kind: 'show', to: 312});
    },
  );

  it('turns nothing back once a hide it predicted from a blur has started: Chrome’s late reports of the keyboard partway down or still up wait for its report of the keyboard gone', () => {
    vi.spyOn(window.performance, 'now').mockImplementation(() => Date.now());
    a.focus();
    report(312);
    vi.advanceTimersByTime(1000);
    a.blur();
    const hide = seen.at(-1);
    expect(hide).toMatchObject({kind: 'hide', to: 0, predicted: true});
    // Chrome can report the keyboard partway down during the slide.
    vi.advanceTimersByTime(60);
    report(290);
    expect(seen.at(-1)).toBe(hide);
    // A busy page reads Chrome's reports late, after the slide has ended.
    vi.advanceTimersByTime(340);
    report(268);
    expect(seen.at(-1)).toBe(hide);
    // The check after the slide reads that report, not a keyboard coming up.
    vi.advanceTimersByTime(androidKeyboard.hideMs + 200);
    expect(seen.at(-1)).toBe(hide);
    // Chrome's report of the keyboard gone confirms the hide.
    report(0);
    expect(seen.at(-1)).toBe(hide);
    expect(getKeyboardLayoutGuide(window).transition.predicted).toBe(false);
  });

  it('rides a hide nothing predicted (Back) down from its report, dated back to Gboard’s start', () => {
    a.focus();
    report(312);
    vi.advanceTimersByTime(1000);
    let reportAt = 0;
    view.addEventListener(
      'resize',
      event => {
        reportAt = event.timeStamp;
      },
      {once: true},
    );
    report(0);
    expect(seen.at(-1)).toMatchObject({kind: 'hide', to: 0, animated: true});
    expect(seen.at(-1)?.start).toBeCloseTo(
      reportAt - androidKeyboard.hideReportLagMs,
      6,
    );
  });

  it('waits for Chrome’s report of the keyboard gone when focus moves to a select, whose picker Chrome opens over the page', () => {
    vi.spyOn(window.performance, 'now').mockImplementation(() => Date.now());
    const select = document.createElement('select');
    select.append(new Option('One'), new Option('Two'));
    document.body.append(select);
    a.focus();
    report(312);
    vi.advanceTimersByTime(1000);
    select.focus();
    const hide = seen.at(-1);
    expect(hide).toMatchObject({kind: 'hide', to: 0, predicted: true});
    // The picker brings no keyboard back. A busy page reads Chrome's report
    // of the keyboard partway down after the slide and the check.
    vi.advanceTimersByTime(400);
    report(268);
    expect(seen.at(-1)).toBe(hide);
    report(0);
    expect(seen.at(-1)).toBe(hide);
    expect(getKeyboardLayoutGuide(window).transition.predicted).toBe(false);
  });

  it('rides a keyboard back up after a hide Chrome reported (Back), when the field that kept focus brings it back', () => {
    a.focus();
    report(312);
    vi.advanceTimersByTime(1000);
    report(0);
    expect(seen.at(-1)).toMatchObject({kind: 'hide', to: 0, predicted: false});
    vi.advanceTimersByTime(1000);
    // A tap on the focused field brings the keyboard back with no focus event.
    report(312);
    expect(seen.at(-1)).toMatchObject({kind: 'show', to: 312, animated: true});
  });

  it.each([
    [
      'a select',
      () => {
        const select = document.createElement('select');
        select.append(new Option('One'), new Option('Two'));
        return select;
      },
    ],
    [
      'a date input',
      () => Object.assign(document.createElement('input'), {type: 'date'}),
    ],
    [
      'a time input',
      () => Object.assign(document.createElement('input'), {type: 'time'}),
    ],
  ] as const)(
    'rides the hide down when focus moves to %s, whose picker Chrome opens over the page as the keyboard goes',
    (_, make) => {
      const picker = make();
      document.body.append(picker);
      a.focus();
      report(312);
      vi.advanceTimersByTime(1000);
      expect(seen.map(t => t.kind)).toEqual(['show']);
      // No keyboard comes back for a picker: its hide is not a momentary one.
      picker.focus();
      report(0);
      expect(seen.at(-1)).toMatchObject({kind: 'hide', to: 0, animated: true});
      vi.advanceTimersByTime(500);
      expect(getKeyboardLayoutGuide(window).inset).toBe(0);
    },
  );

  it('holds the momentary hide Chrome reports while focus moves to another field', () => {
    a.focus();
    report(360);
    vi.advanceTimersByTime(1000);
    expect(seen.map(t => t.kind)).toEqual(['show']);
    // Through a popover's container to its field: Chrome reports the
    // keyboard gone, then back, within about 50 ms.
    button.focus();
    b.focus();
    vi.advanceTimersByTime(30);
    report(0);
    vi.advanceTimersByTime(15);
    report(360);
    vi.advanceTimersByTime(500);
    expect(seen.map(t => t.kind)).toEqual(['show', 'hide', 'show']);
    expect(getKeyboardLayoutGuide(window).inset).toBe(360);
  });

  it('rides nothing where the app sets interactive-widget=resizes-content, since Chrome shrinks the layout viewport with the keyboard (FR8)', () => {
    const full = window.innerHeight;
    // Chrome lays the page out again in the room above the keyboard: the
    // layout viewport shrinks with the visual viewport, so FR2 reads 0.
    const resizeContent = (cover: number) => {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: full - cover,
      });
      view.height = full - cover;
      window.dispatchEvent(new Event('resize'));
      view.dispatchEvent(new Event('resize'));
    };
    a.focus();
    resizeContent(312);
    vi.advanceTimersByTime(1000);
    a.blur();
    resizeContent(0);
    vi.advanceTimersByTime(1000);
    b.focus();
    resizeContent(312);
    vi.advanceTimersByTime(1000);

    expect(seen.filter(t => t.to > 0 || t.from > 0)).toEqual([]);
    expect(getKeyboardLayoutGuide(window).transition.to).toBe(0);
  });

  it('never touches the page’s VirtualKeyboard', () => {
    a.focus();
    report(312);
    a.blur();
    expect(virtualKeyboard.overlaysContent).toBe(false);
  });
});

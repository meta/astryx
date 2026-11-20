// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInput.keyboard.test.tsx
 * @input TextInput, the keyboard module's test double, stubbed boxes
 * @output Proves the focused input stays above the on-screen keyboard with no
 *   prop. Its scroller reveals it in the keyboard's report, and a fixed bar at
 *   the viewport's bottom rides with it. A scroll area that cannot bring it up
 *   leaves the browser's reveal. Nothing attaches under a mouse
 * @position Keyboard tests of TextInput.tsx
 */

import {afterEach, beforeAll, expect, it, onTestFinished, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {TextInput} from './TextInput';
import {animatorFor} from '../motion/animator';
import {FIELD_OFFSET} from '../keyboard/keyboardTarget';
import {
  getKeyboardLayoutGuide,
  keyboardProfileOf,
} from '../keyboard/keyboardLayoutGuide';
import {
  installKeyboardTestDouble,
  type KeyboardTestDouble,
} from '../keyboard/__tests__/keyboardTestDouble';
import {__loadTouchRuntimeForTest} from '../utils/touchRuntime';

// The field loads its keyboard module with the shared touch runtime, after
// first paint. These cases start with it loaded.
beforeAll(async () => {
  await __loadTouchRuntimeForTest();
});

let keyboard: KeyboardTestDouble | null = null;

afterEach(() => {
  keyboard?.restore();
  keyboard = null;
  vi.restoreAllMocks();
});

// A box at `top`, moved by the bar's ride as a browser draws it.
function boxAt(element: Element, top: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const bar = element.closest<HTMLElement>('[data-bar]');
    const match = /^\S+\s+(-?[\d.]+)px/.exec(bar?.style.translate ?? '');
    const y = match == null ? 0 : Number(match[1]);
    return new DOMRect(0, top + y, 300, height);
  });
}

it('scrolls the page in the keyboard report until the focused input sits above it', () => {
  keyboard = installKeyboardTestDouble();
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);
  render(<TextInput label="Notes" value="" onChange={() => {}} />);
  const field = screen.getByRole('textbox');
  boxAt(field, 660, 40);
  act(() => field.focus());
  keyboard.show(300);
  expect(scrollBy).toHaveBeenCalledWith({
    top: 700 + FIELD_OFFSET - (window.innerHeight - 300),
    behavior: 'instant',
  });
});

it('keeps an input focused as it mounts (hasAutoFocus) above the keyboard', () => {
  keyboard = installKeyboardTestDouble();
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);
  render(<TextInput label="Notes" value="" onChange={() => {}} hasAutoFocus />);
  const field = screen.getByRole('textbox');
  expect(field).toHaveFocus();
  boxAt(field, 660, 40);
  keyboard.show(300);
  expect(scrollBy).toHaveBeenCalledWith({
    top: 700 + FIELD_OFFSET - (window.innerHeight - 300),
    behavior: 'instant',
  });
});

it("rides an app's fixed bar at the viewport's bottom with the focused input, and brings it back once the keyboard goes", () => {
  keyboard = installKeyboardTestDouble();
  const bottom = window.innerHeight;
  render(
    <div data-bar="" style={{position: 'fixed'}}>
      <TextInput label="Notes" value="" onChange={() => {}} />
    </div>,
  );
  const bar = document.querySelector<HTMLElement>('[data-bar]')!;
  boxAt(bar, bottom - 72, 72);
  const field = screen.getByRole('textbox');
  boxAt(field, bottom - 56, 40);
  act(() => field.focus());
  keyboard.show(300);
  // The bar moves by the part of it the keyboard covers, so its bottom meets
  // the keyboard's top.
  expect(animatorFor(bar).get('y')).toBe(-300);
  act(() => field.blur());
  keyboard.hide();
  expect(animatorFor(bar).get('y')).toBe(0);
});

// An app's fixed bar at the viewport's bottom with a TextInput in it, in
// Safari on iOS. WebKit on iOS is the one engine with -webkit-touch-callout.
// No other keyboard rider is on the page.
function renderBarInSafari() {
  keyboard = installKeyboardTestDouble();
  vi.stubGlobal('CSS', {
    ...globalThis.CSS,
    supports: (property: string, value?: string) =>
      property === '-webkit-touch-callout' && value === 'none',
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const bottom = window.innerHeight;
  render(
    <div data-bar="" style={{position: 'fixed'}}>
      <TextInput label="Notes" value="" onChange={() => {}} />
    </div>,
  );
  const bar = document.querySelector<HTMLElement>('[data-bar]')!;
  boxAt(bar, bottom - 72, 72);
  const field = screen.getByRole('textbox');
  boxAt(field, bottom - 56, 40);
  return {keyboard, bar, field};
}

it("rides an app's fixed bar on the keyboard's spring from Safari's report in Safari on iOS (spec:AST-099 FR8)", () => {
  const {keyboard, bar, field} = renderBarInSafari();
  act(() => field.focus());
  keyboard.show(300);
  // The bar rides the keyboard from Safari's report, from where it rests,
  // instead of moving there at once.
  const {start} = getKeyboardLayoutGuide(window).transition;
  const drawn = animatorFor(bar);
  expect(drawn.get('y', start)).toBeCloseTo(0, 6);
  expect(drawn.get('y', start + 100)).toBeLessThan(-1);
  expect(drawn.get('y', start + 100)).toBeGreaterThan(-300);
  expect(drawn.get('y', start + 1000)).toBe(-300);
  // The field reads Safari on iOS's keyboard schedule itself.
  expect(keyboardProfileOf(window)).toBe('uikit');
});

it("rides an app's fixed bar down from the blur in Safari on iOS, before Safari reports the keyboard gone (spec:AST-099 FR8)", async () => {
  const {keyboard, bar, field} = renderBarInSafari();
  act(() => field.focus());
  keyboard.show(300);
  // Done: the field loses focus to nothing, and the keyboard goes down. The
  // guide decides about the hide on the next task, dated at the blur.
  act(() => field.blur());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  keyboard.frame();
  // Before Safari's report, the bar already heads down to its rest.
  const drawn = animatorFor(bar);
  expect(drawn.get('y', performance.now() + 1000)).toBe(0);
  expect(getKeyboardLayoutGuide(window).transition).toMatchObject({
    kind: 'hide',
    predicted: true,
  });
  keyboard.hide();
  expect(drawn.get('y', performance.now() + 1000)).toBe(0);
});

it("claims an input that its scroll area cannot scroll up to the area's top, and pans the visual viewport to it", () => {
  keyboard = installKeyboardTestDouble();
  render(
    <div data-area="" style={{overflowY: 'auto'}}>
      <input aria-label="Other" />
      <TextInput label="Notes" value="" onChange={() => {}} />
    </div>,
  );
  const area = document.querySelector<HTMLElement>('[data-area]')!;
  boxAt(area, 0, window.innerHeight);
  // The area has 40 px of range left, and the field sits at its end.
  Object.defineProperty(area, 'scrollHeight', {value: window.innerHeight + 40});
  Object.defineProperty(area, 'clientHeight', {value: window.innerHeight});
  const field = screen.getByRole('textbox', {name: 'Notes'});
  boxAt(field, window.innerHeight - 60, 40);
  act(() => screen.getByRole('textbox', {name: 'Other'}).focus());
  const focus = vi.spyOn(field, 'focus');
  act(() => field.focus());
  expect(focus).toHaveBeenCalledWith({preventScroll: true});
  vi.stubGlobal('scrollBy', vi.fn());
  keyboard.show(300);
  // Neither the area nor the document reaches the room the keyboard takes,
  // so the visual viewport pans the field 10 px above the keyboard.
  expect(keyboard.viewport.offsetTop).toBe(
    window.innerHeight - 20 + FIELD_OFFSET - (window.innerHeight - 300),
  );
});

it('reveals through the document an input in a scroll area under the keyboard, and pans the visual viewport where the document does not move', () => {
  keyboard = installKeyboardTestDouble();
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);
  const {viewport} = keyboard;
  const bottom = window.innerHeight;
  render(
    <div data-area="" style={{overflowY: 'auto'}}>
      <TextInput label="Notes" value="" onChange={() => {}} />
    </div>,
  );
  const area = document.querySelector<HTMLElement>('[data-area]')!;
  boxAt(area, bottom - 268, 220);
  Object.defineProperty(area, 'scrollHeight', {value: 900});
  Object.defineProperty(area, 'clientHeight', {value: 220});
  const field = screen.getByRole('textbox');
  boxAt(field, bottom - 248, 40);
  act(() => field.focus());
  keyboard.show(300);
  // The area's box ends under the keyboard's top, so the document reveals the
  // field, as it does a field in the page.
  expect(scrollBy).toHaveBeenCalledWith({
    top: bottom - 208 + FIELD_OFFSET - (bottom - 300),
    behavior: 'instant',
  });
  // Here the document does not move, so the visual viewport pans the field
  // 10 px above the keyboard in the same frame. Its own report moves nothing.
  expect(viewport.offsetTop).toBe(bottom - 208 + FIELD_OFFSET - (bottom - 300));
  act(() => {
    viewport.dispatchEvent(new Event('scroll'));
  });
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(area.scrollTop).toBe(0);
});

it('reveals through the document an input in a floating panel the keyboard covers, where a document scroll moves the panel', () => {
  keyboard = installKeyboardTestDouble();
  // As in Safari while its keyboard shows: the scroll moves the panel too.
  let shift = 0;
  const scrollBy = vi.fn(({top}: {top: number}) => {
    shift += top;
  });
  vi.stubGlobal('scrollBy', scrollBy);
  const bottom = window.innerHeight;
  render(
    <div data-panel="" style={{position: 'fixed', overflowY: 'auto'}}>
      <TextInput label="Notes" value="" onChange={() => {}} />
    </div>,
  );
  const panel = document.querySelector<HTMLElement>('[data-panel]')!;
  boxAt(panel, bottom - 236, 220);
  Object.defineProperty(panel, 'scrollHeight', {value: 900});
  Object.defineProperty(panel, 'clientHeight', {value: 220});
  const field = screen.getByRole('textbox');
  vi.spyOn(field, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, bottom - 216 - shift, 300, 40),
  );
  act(() => field.focus());
  keyboard.show(300);
  // The panel floats under the keyboard, so its own scroll cannot place the
  // field. The document's scroll does.
  expect(panel.scrollTop).toBe(0);
  expect(scrollBy).toHaveBeenCalledTimes(1);
  expect(scrollBy).toHaveBeenCalledWith({
    top: bottom - 176 + FIELD_OFFSET - (bottom - 300),
    behavior: 'instant',
  });
});

it('attaches nothing under a mouse or a trackpad', () => {
  keyboard = installKeyboardTestDouble({coarse: false});
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);
  render(<TextInput label="Notes" value="" onChange={() => {}} />);
  const field = screen.getByRole('textbox');
  boxAt(field, 660, 40);
  act(() => field.focus());
  keyboard.show(300);
  expect(scrollBy).not.toHaveBeenCalled();
});

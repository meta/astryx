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

import {afterEach, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {TextInput} from './TextInput';
import {animatorFor} from '../motion/animator';
import {FIELD_OFFSET} from '../keyboard/keyboardTarget';
import {
  installKeyboardTestDouble,
  type KeyboardTestDouble,
} from '../keyboard/__tests__/keyboardTestDouble';

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

// Copyright (c) Meta Platforms, Inc. and affiliates.
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';
function pointerQuery(coarse: boolean) {
  const original = window.matchMedia;
  window.matchMedia = query =>
    query.trim() === TOUCH_QUERY
      ? {...original(query), matches: coarse}
      : original(query);
  return {
    restore: () => {
      window.matchMedia = original;
    },
  };
}
const coarsePrimaryPointer = () => pointerQuery(true).restore;
import {Rating} from './Rating';
interface Point {
  x: number;
  y: number;
}

let time = 1000;
let nextTouchId = 1;

/** Dispatch one touch event for a single finger. */
function touch(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: EventTarget,
  id: number,
  point: Point,
): Event {
  time += 16;
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: id, clientX: point.x, clientY: point.y, target};
  const isLift = type === 'touchend' || type === 'touchcancel';
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
  return event;
}

/** A finger, with a fresh id. */
function finger() {
  const id = nextTouchId++;
  return {
    down: (target: Element, point: Point) => {
      time += 1000;
      return touch('touchstart', target, id, point);
    },
    move: (target: Element, point: Point) =>
      touch('touchmove', target, id, point),
    up: (target: Element, point: Point) => touch('touchend', target, id, point),
  };
}

/** Modifier keys held during a pointer event. */
type Modifiers = Partial<
  Pick<MouseEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>
>;

/** Dispatch a pointer event of one kind (a finger, a pen or a mouse). */
function pointer(
  kind: 'touch' | 'pen' | 'mouse',
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: Element,
  point: Point,
  modifiers: Modifiers = {},
): void {
  time += 16;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: {touch: 7, pen: 41, mouse: 1}[kind],
    pointerType: kind,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: point.x,
    clientY: point.y,
    ...modifiers,
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

/** Stub an element's layout box (jsdom lays nothing out). */
function place(
  element: Element,
  box: {left: number; top: number; width: number; height: number},
): void {
  const rect = DOMRect.fromRect({
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
  element.getBoundingClientRect = () => rect;
}

let restorePointer: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  restorePointer = coarsePrimaryPointer();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  restorePointer();
});

/** Switch the primary pointer to a mouse (fine) for one case. */
function finePrimaryPointer(): void {
  restorePointer();
  restorePointer = pointerQuery(false).restore;
}

function mount(isDisabled = false, isReadOnly = false) {
  const onChange = vi.fn();
  const view = render(
    <Rating
      label="Score"
      value={2}
      max={3}
      onChange={onChange}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
    />,
  );
  const group = view.getByRole(isReadOnly ? 'img' : 'radiogroup');
  const radios = view.queryAllByRole('radio');
  place(group, {left: 100, top: 100, width: 80, height: 24});
  radios.forEach((r, i) =>
    place(r, {left: 100 + i * 28, top: 100, width: 24, height: 24}),
  );
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  return {...view, group, radios, onChange};
}
const at = (i: number) => ({x: 112 + i * 28, y: 112});
const paint = (r: Element) => r.getAttribute('data-astryx-press');

describe('Rating action-groups touch contract', () => {
  it('selects only the lifted star, once, and the highlight follows a finger', () => {
    const {radios: r, onChange} = mount();
    const f = finger();
    f.down(r[0], at(0));
    expect(paint(r[0])).toBe('on');
    f.move(r[0], at(1));
    expect(paint(r[0])).toBeNull();
    expect(paint(r[1])).toBe('on');
    f.move(r[0], at(2));
    expect(paint(r[1])).toBeNull();
    expect(paint(r[2])).toBe('on');
    expect(onChange).not.toHaveBeenCalled();
    f.up(r[0], at(2));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(r[2]).toHaveFocus();
  });
  it('selects the lifted star with a pen', () => {
    const {radios: r, onChange} = mount();
    pointer('pen', 'pointerdown', r[0], at(0));
    pointer('pen', 'pointermove', r[0], at(2));
    expect(paint(r[2])).toBe('on');
    pointer('pen', 'pointerup', r[2], at(2));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);
  });
  it('cancels outside the group and removes the highlight', () => {
    const {radios: r, onChange} = mount();
    const f = finger();
    f.down(r[0], at(0));
    f.move(r[0], {x: 300, y: 300});
    expect(r.map(paint)).toEqual([null, null, null]);
    f.up(r[0], {x: 300, y: 300});
    expect(onChange).not.toHaveBeenCalled();
  });
  it('cancels on touchcancel', () => {
    const {radios: r, onChange} = mount();
    const id = nextTouchId++;
    touch('touchstart', r[0], id, at(0));
    touch('touchcancel', r[0], id, at(0));
    expect(onChange).not.toHaveBeenCalled();
    expect(r.map(paint)).toEqual([null, null, null]);
  });
  it('cancels on a second finger', () => {
    const {radios: r, onChange} = mount();
    const f = finger();
    const g = finger();
    f.down(r[0], at(0));
    g.down(r[1], at(1));
    f.up(r[0], at(2));
    g.up(r[1], at(1));
    expect(onChange).not.toHaveBeenCalled();
    expect(r.map(paint)).not.toContain('on');
  });
  it('leaves a mouse slide to native buttons and makes no selection', () => {
    const {group, radios: r, onChange} = mount();
    pointer('mouse', 'pointerdown', r[0], at(0));
    pointer('mouse', 'pointermove', r[0], at(2));
    pointer('mouse', 'pointerup', r[2], at(2));
    group.dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('expands coarse-pointer targets to 44px through the shared hit layer', () => {
    const {group, onChange} = mount();
    expect(group.style.getPropertyValue('--astryx-hit-inset-top')).toBe('10px');
    expect(group.style.getPropertyValue('--astryx-hit-inset-bottom')).toBe(
      '10px',
    );
    const f = finger();
    f.down(group, {x: 112, y: 95});
    f.up(group, {x: 112, y: 95});
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('does not expand fine-pointer targets', () => {
    finePrimaryPointer();
    const {group} = mount();
    expect(group.style.getPropertyValue('--astryx-hit-inset-top')).toBe('');
  });
  it('keeps disabled stars untracked and inert for finger and pen streams', () => {
    const {radios: r, onChange} = mount(true);
    const f = finger();
    f.down(r[0], at(0));
    f.move(r[0], at(2));
    f.up(r[0], at(2));
    pointer('pen', 'pointerdown', r[0], at(0));
    pointer('pen', 'pointerup', r[2], at(2));
    expect(onChange).not.toHaveBeenCalled();
    expect(r.map(paint)).not.toContain('on');
  });
  it('does not add interactive hit area to a read-only display', () => {
    const {group, radios, onChange} = mount(false, true);
    expect(radios).toHaveLength(0);
    expect(group.style.getPropertyValue('--astryx-hit-inset-top')).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});

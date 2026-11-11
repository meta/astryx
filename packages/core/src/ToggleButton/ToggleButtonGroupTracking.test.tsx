// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToggleButtonGroupTracking.test.tsx
 * @input ToggleButtonGroup and ToggleButton, driven by synthetic touch, pen and
 *   mouse streams under a coarse or a fine primary pointer
 * @output Unit evidence that a toggle group tracks a held pointer across its
 *   toggles as one action group (`family:action-groups` FR1–FR5). It toggles
 *   only the one lifted on.
 * @position Beside the ToggleButtonGroup tests; the real-browser evidence is
 *   __tests__/ToggleButtonGroupTracking.interaction.browser.spec.ts
 */

import * as stylex from '@stylexjs/stylex';
import {createRef, type Ref} from 'react';
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  coarsePrimaryPointer,
  pointerQuery,
} from '../gestures/__tests__/pointerQuery';
import {isPressGroupItem} from '../privateAttributes/pressGroupItem.stylex';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {Button} from '../Button/Button';
import {ToggleButton} from './ToggleButton';
import {ToggleButtonGroup} from './ToggleButtonGroup';

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
): void {
  time += 16;
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: id, clientX: point.x, clientY: point.y, target};
  const isLift = type === 'touchend' || type === 'touchcancel';
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

/** A finger, with a fresh id. */
function finger() {
  const id = nextTouchId++;
  return {
    down: (target: Element, point: Point) => {
      time += 1000;
      touch('touchstart', target, id, point);
    },
    move: (target: Element, point: Point) =>
      touch('touchmove', target, id, point),
    up: (target: Element, point: Point) => touch('touchend', target, id, point),
  };
}

/** Dispatch a pointer event of one kind (a finger, a pen or a mouse). */
function pointer(
  kind: 'touch' | 'pen' | 'mouse',
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: Element,
  point: Point,
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

// Three connected 32 px buttons, the way a small horizontal group lays out.
const A = {left: 0, top: 100, width: 80, height: 32};
const B = {left: 80, top: 100, width: 80, height: 32};
const C = {left: 160, top: 100, width: 80, height: 32};
const GROUP = {left: 0, top: 100, width: 240, height: 32};
const centerOf = (box: typeof A): Point => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});

const paintOf = (element: Element) => element.getAttribute('data-astryx-press');

function mount({
  type = 'multiple',
  isDisabled = false,
  ref,
}: {
  type?: 'single' | 'multiple';
  isDisabled?: boolean;
  ref?: Ref<HTMLDivElement>;
} = {}) {
  // The group's props do not declare `ref`; a caller passes it at run time.
  const callerRef: object = ref == null ? {} : {ref};
  const onChange = vi.fn();
  const view = render(
    type === 'single' ? (
      <ToggleButtonGroup
        type="single"
        label="Alignment"
        value={null}
        onChange={onChange}
        isDisabled={isDisabled}
        data-testid="group">
        <ToggleButton label="Left" value="left" data-testid="a" />
        <ToggleButton label="Center" value="center" data-testid="b" />
        <ToggleButton label="Right" value="right" data-testid="c" />
      </ToggleButtonGroup>
    ) : (
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={onChange}
        isDisabled={isDisabled}
        data-testid="group"
        {...callerRef}>
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <ToggleButton label="Italic" value="italic" data-testid="b" />
        <ToggleButton label="Underline" value="underline" data-testid="c" />
      </ToggleButtonGroup>
    ),
  );
  const group = view.getByTestId('group');
  const a = view.getByTestId('a');
  const b = view.getByTestId('b');
  const c = view.getByTestId('c');
  place(group, GROUP);
  place(a, A);
  place(b, B);
  place(c, C);
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  return {...view, group, a, b, c, onChange};
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

function finePrimaryPointer(): void {
  restorePointer();
  restorePointer = pointerQuery(false).restore;
}

describe('ToggleButtonGroup tracks a held pointer across its toggles (family:action-groups)', () => {
  it('marks each toggle as a tracked action, and marks none while the group is disabled', () => {
    const {a, b, c, unmount} = mount();
    for (const toggle of [a, b, c]) {
      expect(isPressGroupItem(toggle)).toBe(true);
    }
    unmount();
    const disabled = mount({isDisabled: true});
    for (const toggle of [disabled.a, disabled.b, disabled.c]) {
      expect(isPressGroupItem(toggle)).toBe(false);
    }
  });

  it('gives every toggle its own touch band, with the group’s room between members, and the root none', () => {
    const band = (stylex.props(touchHitAreaStyles.band).className ?? '')
      .split(' ')
      .filter(name => name !== '' && !name.startsWith('touchHitArea__'));
    const member = (stylex.props(touchHitAreaStyles.member).className ?? '')
      .split(' ')
      .filter(name => name !== '' && !name.startsWith('touchHitArea__'));
    expect(band.length).toBeGreaterThan(0);
    const hasOwnBand = (toggle: Element) =>
      [...toggle.querySelectorAll('*')].some(element =>
        band.every(name => element.classList.contains(name)),
      );
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={vi.fn()}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="bold" />
        <ToggleButton
          label="Wrap"
          isPressed={false}
          onPressedChange={vi.fn()}
          data-testid="wrap"
        />
      </ToggleButtonGroup>,
    );
    for (const id of ['bold', 'wrap']) {
      const toggle = view.getByTestId(id);
      expect(hasOwnBand(toggle)).toBe(true);
      expect(member.every(name => toggle.classList.contains(name))).toBe(true);
    }
    expect(
      band.some(name => view.getByTestId('group').classList.contains(name)),
    ).toBe(false);
  });

  it('a finger slid from Bold across Italic to Underline toggles only Underline (FR4)', () => {
    const {a, b, c, onChange} = mount();
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, centerOf(B));
    expect(paintOf(b)).toBe('on');
    f.move(a, centerOf(C));
    expect(paintOf(c)).toBe('on');
    f.up(a, centerOf(C));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(['underline']);
  });

  it('in a single-select group, the lifted toggle is the one selected (FR1, FR4)', () => {
    const {a, onChange} = mount({type: 'single'});
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, centerOf(B));
    f.up(a, centerOf(B));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('center');
  });

  it('a lift outside the group toggles nothing (FR3)', () => {
    const {a, onChange} = mount();
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, {x: 120, y: 260});
    f.up(a, {x: 120, y: 260});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tracks a pen like a finger: a pen slid from Bold to Underline lights Underline and toggles it once (FR5)', () => {
    const {a, c, onChange} = mount();
    pointer('pen', 'pointerdown', a, centerOf(A));
    expect(paintOf(a)).toBe('on');
    pointer('pen', 'pointermove', a, centerOf(C));
    expect(paintOf(c)).toBe('on');
    expect(paintOf(a)).toBeNull();
    pointer('pen', 'pointerup', c, centerOf(C));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(['underline']);
  });

  for (const primary of ['fine', 'coarse'] as const) {
    it(`leaves a mouse press to the native toggle under a ${primary} primary pointer: a press slid from Bold to Underline toggles nothing (family:action-groups FR1)`, () => {
      if (primary === 'fine') {
        finePrimaryPointer();
      }
      const {group, a, c, onChange} = mount();
      // A desktop group tracks nothing at all.
      expect(isPressGroupItem(a)).toBe(primary === 'coarse');
      pointer('mouse', 'pointerdown', a, centerOf(A));
      pointer('mouse', 'pointermove', a, centerOf(C));
      pointer('mouse', 'pointerup', c, centerOf(C));
      // The browser's own click for that press lands on the toggles' common
      // parent, where the press began and ended apart.
      group.dispatchEvent(
        new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
      );
      expect(onChange).not.toHaveBeenCalled();
    });
  }

  it('leaves a member that is not a toggle untracked: a slide from Bold lifted on it runs nothing, and its own tap runs its click', () => {
    const onMore = vi.fn();
    const onChange = vi.fn();
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={onChange}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <Button label="More" onClick={onMore} data-testid="more" />
      </ToggleButtonGroup>,
    );
    const group = view.getByTestId('group');
    const more = view.getByTestId('more');
    place(group, {left: 0, top: 100, width: 160, height: 32});
    place(view.getByTestId('a'), A);
    place(more, B);
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(isPressGroupItem(more)).toBe(false);
    const slide = finger();
    slide.down(view.getByTestId('a'), centerOf(A));
    slide.move(view.getByTestId('a'), centerOf(B));
    slide.up(view.getByTestId('a'), centerOf(B));
    expect(onMore).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    // The guard for the slide's own click lapses before the next tap.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const tap = finger();
    tap.down(more, centerOf(B));
    tap.up(more, centerOf(B));
    more.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a finger slid from Bold that lifts just inside a toggle without a value toggles nothing: Bold's target does not reach into the other's own (spec:AST-094 FR42)", () => {
    const onChange = vi.fn();
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={onChange}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <ToggleButton label="Wrap" isPressed={false} data-testid="wrap" />
      </ToggleButtonGroup>,
    );
    const bold = view.getByTestId('a');
    const wrap = view.getByTestId('wrap');
    // Two 32 px toggles 4 px apart: grown toward 44 px, Bold's target would
    // reach 2 px into Wrap, which the group does not track.
    place(view.getByTestId('group'), {
      left: 0,
      top: 100,
      width: 68,
      height: 32,
    });
    place(bold, {left: 0, top: 100, width: 32, height: 32});
    place(wrap, {left: 36, top: 100, width: 32, height: 32});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(bold, {x: 16, y: 116});
    expect(paintOf(bold)).toBe('on');
    f.move(bold, {x: 37, y: 116});
    expect(paintOf(bold)).not.toBe('on');
    f.up(bold, {x: 37, y: 116});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a toggle without a value standalone (AV1): no group marker, and a press that starts on it and slides onto Bold toggles nothing', () => {
    const onChange = vi.fn();
    const onPressedChange = vi.fn();
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={onChange}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <ToggleButton
          label="Wrap"
          isPressed={false}
          onPressedChange={onPressedChange}
          data-testid="wrap"
        />
      </ToggleButtonGroup>,
    );
    const group = view.getByTestId('group');
    const bold = view.getByTestId('a');
    const wrap = view.getByTestId('wrap');
    place(group, {left: 0, top: 100, width: 160, height: 32});
    place(bold, A);
    place(wrap, B);
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(isPressGroupItem(bold)).toBe(true);
    expect(isPressGroupItem(wrap)).toBe(false);
    const f = finger();
    f.down(wrap, centerOf(B));
    f.move(wrap, centerOf(A));
    f.up(wrap, centerOf(A));
    expect(onChange).not.toHaveBeenCalled();
    expect(paintOf(bold)).toBeNull();
    // Its own tap is its own, as it would be outside the group.
    f.down(wrap, centerOf(B));
    f.up(wrap, centerOf(B));
    wrap.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
    expect(onPressedChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('touching toggles take no area from each other: 28 px toggles at x = 0, 80 and 160, a finger at x = 82 toggles only the middle one, and 8 px below a toggle still counts for it', () => {
    const {group, a, b, c, onChange} = mount();
    place(group, {left: 0, top: 100, width: 240, height: 28});
    place(a, {left: 0, top: 100, width: 80, height: 28});
    place(b, {left: 80, top: 100, width: 80, height: 28});
    place(c, {left: 160, top: 100, width: 80, height: 28});
    const tapAt = (point: Point) => {
      const f = finger();
      f.down(group, point);
      f.up(group, point);
    };
    tapAt({x: 82, y: 114});
    expect(onChange).toHaveBeenLastCalledWith(['italic']);
    tapAt({x: 120, y: 136});
    expect(onChange).toHaveBeenCalledTimes(2);
    tapAt({x: 120, y: 137});
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('a finger on the edge of a disabled toggle that has a tooltip toggles nothing, not its enabled neighbour', () => {
    const onChange = vi.fn();
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={onChange}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <ToggleButton
          label="Italic"
          value="italic"
          isDisabled
          tooltip="Italic is not available here"
          data-testid="b"
        />
        <ToggleButton label="Underline" value="underline" data-testid="c" />
      </ToggleButtonGroup>,
    );
    const italic = view.getByTestId('b');
    // Three touching 28 px toggles: Bold's target grows 8 px past its edge,
    // over the disabled Italic.
    place(view.getByTestId('group'), {
      left: 0,
      top: 100,
      width: 84,
      height: 28,
    });
    place(view.getByTestId('a'), {left: 0, top: 100, width: 28, height: 28});
    place(italic, {left: 28, top: 100, width: 28, height: 28});
    place(view.getByTestId('c'), {left: 56, top: 100, width: 28, height: 28});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(italic, {x: 30, y: 114});
    f.up(italic, {x: 30, y: 114});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads the boxes of a disabled toggle and of a toggle without a value once per press, once more on the root, never per move', () => {
    const view = render(
      <ToggleButtonGroup
        type="multiple"
        label="Formatting"
        value={[]}
        onChange={() => {}}
        data-testid="group">
        <ToggleButton label="Bold" value="bold" data-testid="a" />
        <ToggleButton
          label="Italic"
          value="italic"
          isDisabled
          tooltip="Italic is not available here"
          data-testid="b"
        />
        <ToggleButton label="Underline" value="underline" data-testid="c" />
        <ToggleButton label="Wrap" data-testid="d" />
      </ToggleButtonGroup>,
    );
    const group = view.getByTestId('group');
    const italic = view.getByTestId('b');
    const wrap = view.getByTestId('d');
    place(group, {left: 0, top: 100, width: 112, height: 28});
    place(view.getByTestId('a'), {left: 0, top: 100, width: 28, height: 28});
    place(italic, {left: 28, top: 100, width: 28, height: 28});
    place(view.getByTestId('c'), {left: 56, top: 100, width: 28, height: 28});
    place(wrap, {left: 84, top: 100, width: 28, height: 28});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const readItalic = vi.spyOn(italic, 'getBoundingClientRect');
    const readWrap = vi.spyOn(wrap, 'getBoundingClientRect');
    const bold = view.getByTestId('a');
    const f = finger();
    f.down(bold, {x: 10, y: 114});
    for (let x = 12; x <= 80; x += 4) {
      f.move(bold, {x, y: 114});
    }
    f.up(bold, {x: 80, y: 114});
    expect(readItalic).toHaveBeenCalledTimes(1);
    expect(readWrap).toHaveBeenCalledTimes(1);
    // On the root, the group first checks that a toggle's target holds the
    // press, which reads each of them once more.
    const g = finger();
    g.down(group, {x: 10, y: 114});
    for (let x = 12; x <= 80; x += 4) {
      g.move(group, {x, y: 114});
    }
    g.up(group, {x: 80, y: 114});
    expect(readItalic).toHaveBeenCalledTimes(3);
    expect(readWrap).toHaveBeenCalledTimes(3);
  });

  it('reads each box a fixed number of times as a press begins (PR1)', () => {
    // [pointer, where it lands, reads at the start of: the group, each
    // toggle, a link elsewhere on the page]. Nothing outside the group is
    // read.
    for (const [kind, landsOn, atStart] of [
      ['finger', 'toggle', [1, 3, 0]],
      ['finger', 'layer', [1, 4, 0]],
      ['finger', 'beside', [1, 1, 0]],
      ['pen', 'toggle', [1, 2, 0]],
    ] as const) {
      const view = render(
        <div>
          <a href="#elsewhere" data-testid="link">
            Elsewhere
          </a>
          <ToggleButtonGroup
            type="multiple"
            label="Formatting"
            value={[]}
            onChange={() => {}}
            data-testid="group">
            <ToggleButton label="Bold" value="bold" data-testid="a" />
            <ToggleButton label="Italic" value="italic" data-testid="b" />
            <ToggleButton label="Underline" value="underline" data-testid="c" />
          </ToggleButtonGroup>
        </div>,
      );
      const group = view.getByTestId('group');
      const link = view.getByTestId('link');
      const toggles = (['a', 'b', 'c'] as const).map(id =>
        view.getByTestId(id),
      );
      // Beside the toggles needs a root that stretches past them.
      place(group, {...GROUP, width: landsOn === 'beside' ? 400 : 240});
      [A, B, C].forEach((box, i) => place(toggles[i], box));
      place(link, {left: 0, top: 0, width: 80, height: 20});
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      const reads = [group, ...toggles, link].map(element =>
        vi.spyOn(element, 'getBoundingClientRect'),
      );
      const counts = () => reads.map(read => read.mock.calls.length);
      const [onGroup, onEachToggle, onLink] = atStart;
      const expected = [
        onGroup,
        onEachToggle,
        onEachToggle,
        onEachToggle,
        onLink,
      ];
      const target = landsOn === 'toggle' ? toggles[0] : group;
      const start =
        landsOn === 'toggle'
          ? centerOf(A)
          : landsOn === 'layer'
            ? {x: 40, y: 137}
            : {x: 320, y: 116};
      const path = [0, 8, 16, 24].map(dx => ({x: start.x + dx, y: start.y}));
      if (kind === 'finger') {
        // A real finger sends each pointer event before its touch event.
        const f = finger();
        pointer('touch', 'pointerdown', target, start);
        f.down(target, start);
        expect(counts()).toEqual(expected);
        for (const point of path) {
          pointer('touch', 'pointermove', target, point);
          f.move(target, point);
        }
        pointer('touch', 'pointerup', target, start);
        f.up(target, start);
      } else {
        pointer('pen', 'pointerdown', target, start);
        expect(counts()).toEqual(expected);
        for (const point of path) {
          pointer('pen', 'pointermove', target, point);
        }
        pointer('pen', 'pointerup', target, start);
      }
      // Nothing is read per move or at the lift.
      expect(counts()).toEqual(expected);
      view.unmount();
    }
  });

  it("passes a caller's ref to the group root", () => {
    const ref = createRef<HTMLDivElement>();
    const {group} = mount({ref});
    expect(ref.current).toBe(group);
  });

  it('a finger just past a small toggle, inside its 44 px target, toggles it (FR5)', () => {
    const {group, onChange} = mount();
    const f = finger();
    f.down(group, {x: 40, y: 136});
    f.up(group, {x: 40, y: 136});
    expect(onChange).toHaveBeenLastCalledWith(['bold']);
  });
});

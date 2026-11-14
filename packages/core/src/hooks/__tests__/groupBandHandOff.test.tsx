// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file groupBandHandOff.test.tsx
 * @input ButtonGroup and ToggleButtonGroup beside a control outside the
 *   group, driven by a synthetic finger under a coarse primary pointer, in
 *   left-to-right and right-to-left layouts
 * @output Unit evidence that a group member's band takes no tap on another
 *   control's visible box: the group leaves that press, and the press check
 *   gives the tap to the control under the finger (spec:AST-094 FR42)
 * @position Beside useGroupPressTracking.ts; the group's own tracking cases
 *   are ButtonGroupTracking.test.tsx and ToggleButtonGroupTracking.test.tsx
 */

import type {ReactNode} from 'react';
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {coarsePrimaryPointer} from '../../gestures/__tests__/pointerQuery';
import {Button} from '../../Button/Button';
import {ButtonGroup} from '../../ButtonGroup/ButtonGroup';
import {ToggleButton} from '../../ToggleButton/ToggleButton';
import {ToggleButtonGroup} from '../../ToggleButton/ToggleButtonGroup';

interface Point {
  x: number;
  y: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

let time = 1000;
let nextTouchId = 1;

/** Dispatch one touch event for a single finger. */
function touch(
  type: 'touchstart' | 'touchend',
  target: EventTarget,
  id: number,
  point: Point,
): void {
  time += 16;
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: id, clientX: point.x, clientY: point.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [entry],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

/**
 * A finger's tap on `target` at `point`, as a browser sends it: the pointer
 * press, the touch, and the click that follows a touch nothing claimed.
 */
function tapAt(target: Element, point: Point): void {
  const id = nextTouchId++;
  time += 1000;
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: point.x,
      clientY: point.y,
    }),
  );
  touch('touchstart', target, id, point);
  touch('touchend', target, id, point);
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
      clientX: point.x,
      clientY: point.y,
    }),
  );
}

/** Stub an element's layout box (jsdom lays nothing out). */
function place(element: Element, box: Box): void {
  const rect = DOMRect.fromRect({
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
  element.getBoundingClientRect = () => rect;
}

let elementsAtPoint: Element[] = [];
let restorePointer: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  restorePointer = coarsePrimaryPointer();
  elementsAtPoint = [];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => elementsAtPoint),
  });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  restorePointer();
  Reflect.deleteProperty(document, 'elementsFromPoint');
});

const TOP = 100;
const HEIGHT = 32;
// Icon-sized members: a 32 px box grows its band 6 px past each side.
const MEMBER = 32;
// The control outside the group sits 4 px past its end member, inside the
// 6 px the end member's band reaches past its box.
const GAP = 4;
const NEIGHBOUR = 60;

/**
 * Three 32 px members from x = 0, and a 60 px control 4 px past the group's
 * end: right of the group left to right, left of it right to left.
 */
function layout(isRtl: boolean) {
  const span = MEMBER * 3;
  const memberBoxes = [0, 1, 2].map(index => ({
    left: isRtl ? span - MEMBER * (index + 1) : MEMBER * index,
    top: TOP,
    width: MEMBER,
    height: HEIGHT,
  }));
  const neighbourBox = {
    left: isRtl ? -GAP - NEIGHBOUR : span + GAP,
    top: TOP,
    width: NEIGHBOUR,
    height: HEIGHT,
  };
  const groupBox = {left: 0, top: TOP, width: span, height: HEIGHT};
  // 1 px inside the control's box, on its side next to the group: 5 px past
  // the end member, inside its band.
  const onNeighbour = {
    x: isRtl ? -GAP - 1 : span + GAP + 1,
    y: TOP + HEIGHT / 2,
  };
  return {memberBoxes, neighbourBox, groupBox, onNeighbour};
}

interface Mounted {
  members: HTMLElement[];
  memberActions: ReturnType<typeof vi.fn<() => void>>;
}

function mountCase(
  renderGroup: (memberActions: () => void) => ReactNode,
  isRtl: boolean,
) {
  const memberActions = vi.fn<() => void>();
  const onNeighbour = vi.fn<() => void>();
  const view = render(
    <div dir={isRtl ? 'rtl' : 'ltr'} data-testid="row">
      {renderGroup(memberActions)}
      <Button label="Share" onClick={onNeighbour} data-testid="neighbour" />
    </div>,
  );
  const group = view.getByTestId('group');
  const members = ['a', 'b', 'c'].map(id => view.getByTestId(id));
  const neighbour = view.getByTestId('neighbour');
  const row = view.getByTestId('row');
  const geometry = layout(isRtl);
  place(group, geometry.groupBox);
  members.forEach((member, index) =>
    place(member, geometry.memberBoxes[index]),
  );
  place(neighbour, geometry.neighbourBox);
  // The gesture host styles what it attached in the next frame.
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  const end = members[2];
  // The browser lists the end member first (its band paints over the gap and
  // the control's edge), then the control whose box is under the finger.
  elementsAtPoint = [end, neighbour, row, document.body];
  return {
    end,
    onNeighbour,
    point: geometry.onNeighbour,
    mounted: {members, memberActions} satisfies Mounted,
  };
}

const groups: Record<
  'ButtonGroup' | 'ToggleButtonGroup',
  (memberActions: () => void) => ReactNode
> = {
  ButtonGroup: memberActions => (
    <ButtonGroup label="Edit" data-testid="group">
      <Button label="Cut" onClick={memberActions} data-testid="a" />
      <Button label="Copy" onClick={memberActions} data-testid="b" />
      <Button label="Paste" onClick={memberActions} data-testid="c" />
    </ButtonGroup>
  ),
  ToggleButtonGroup: memberActions => (
    <ToggleButtonGroup
      type="multiple"
      label="Formatting"
      value={[]}
      onChange={memberActions}
      data-testid="group">
      <ToggleButton label="Bold" value="bold" data-testid="a" />
      <ToggleButton label="Italic" value="italic" data-testid="b" />
      <ToggleButton label="Underline" value="underline" data-testid="c" />
    </ToggleButtonGroup>
  ),
};

describe("a group member's band over another control's visible box (spec:AST-094 FR42)", () => {
  for (const [name, renderGroup] of Object.entries(groups)) {
    for (const isRtl of [false, true]) {
      it(`${name}, ${isRtl ? 'right to left' : 'left to right'}: a tap on the control beside the group presses that control, not the end member`, () => {
        const {end, onNeighbour, point, mounted} = mountCase(
          renderGroup,
          isRtl,
        );
        tapAt(end, point);
        expect(onNeighbour).toHaveBeenCalledTimes(1);
        expect(mounted.memberActions).not.toHaveBeenCalled();
      });
    }
  }

  it("ButtonGroup: a tap on the end member's band over empty space still presses that member", () => {
    const {end, mounted} = mountCase(groups.ButtonGroup, false);
    // 2 px past the end member, in the gap: no other box is under the finger.
    elementsAtPoint = [end, document.body];
    tapAt(end, {x: MEMBER * 3 + 2, y: TOP + HEIGHT / 2});
    expect(mounted.memberActions).toHaveBeenCalledTimes(1);
  });
});

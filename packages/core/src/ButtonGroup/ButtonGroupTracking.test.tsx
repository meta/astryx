// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupTracking.test.tsx
 * @input ButtonGroup and Button, driven by synthetic touch, pen and mouse
 *   streams under a coarse or a fine primary pointer
 * @output Unit evidence that a button group tracks a held pointer across its
 *   buttons as one action group (`family:action-groups` FR1–FR5)
 * @position Beside ButtonGroup.test.tsx; the real-browser evidence is
 *   __tests__/ButtonGroupTracking.interaction.browser.spec.ts
 */

import * as stylex from '@stylexjs/stylex';
import {act, render} from '@testing-library/react';
import {useLayoutEffect, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  coarsePrimaryPointer,
  pointerQuery,
} from '../gestures/__tests__/pointerQuery';
import {isPressGroupItem} from '../privateAttributes/pressGroupItem.stylex';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {Button} from '../Button/Button';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {ButtonGroup} from './ButtonGroup';

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
const bandClasses = (stylex.props(touchHitAreaStyles.band).className ?? '')
  .split(' ')
  .filter(name => name !== '' && !name.startsWith('touchHitArea__'));
/** Whether `element`, or an element inside it, carries the touch band. */
const drawsBand = (element: Element) =>
  [element, ...element.querySelectorAll('*')].some(node =>
    bandClasses.every(name => node.classList.contains(name)),
  );

function mount({
  isDisabled = false,
  isBDisabled = false,
  isCMenuTrigger = false,
  cHasPopup,
  groupBox = GROUP,
}: {
  isDisabled?: boolean;
  isBDisabled?: boolean;
  isCMenuTrigger?: boolean;
  /** The third button's own `aria-haspopup` (a menu trigger sets 'menu'). */
  cHasPopup?: 'true' | 'menu' | 'listbox' | 'dialog' | 'grid' | 'tree';
  /** The root's box: wider than the buttons when it stretches. */
  groupBox?: typeof GROUP;
} = {}) {
  const onA = vi.fn();
  const onB = vi.fn();
  const onC = vi.fn();
  const view = render(
    <ButtonGroup label="Edit" isDisabled={isDisabled} data-testid="group">
      <Button label="Cut" onClick={onA} data-testid="a" />
      <Button
        label="Copy"
        onClick={onB}
        isDisabled={isBDisabled}
        data-testid="b"
      />
      <Button
        label="More"
        onClick={onC}
        data-testid="c"
        {...(isCMenuTrigger ? {'aria-haspopup': 'menu' as const} : {})}
        {...(cHasPopup != null ? {'aria-haspopup': cHasPopup} : {})}
      />
    </ButtonGroup>,
  );
  const group = view.getByTestId('group');
  const a = view.getByTestId('a');
  const b = view.getByTestId('b');
  const c = view.getByTestId('c');
  place(group, groupBox);
  place(a, A);
  place(b, B);
  place(c, C);
  // The gesture host styles what it attached in the next frame.
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  return {...view, group, a, b, c, onA, onB, onC};
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

describe('ButtonGroup tracks a held pointer across its buttons (family:action-groups)', () => {
  it('marks each button as a tracked action, and marks none while the group is disabled', () => {
    const {a, b, c, unmount} = mount();
    for (const button of [a, b, c]) {
      expect(isPressGroupItem(button)).toBe(true);
    }
    unmount();
    const disabled = mount({isDisabled: true});
    for (const button of [disabled.a, disabled.b, disabled.c]) {
      expect(isPressGroupItem(button)).toBe(false);
    }
  });

  it('draws no band on the root: each enabled button draws its own, so the root keeps its stacking', () => {
    const {group, a, b, c} = mount({isBDisabled: true});
    expect(bandClasses.every(name => group.classList.contains(name))).toBe(
      false,
    );
    expect([a, b, c].map(drawsBand)).toEqual([true, false, true]);
  });

  for (const primary of ['fine', 'coarse'] as const) {
    it(`leaves a mouse press to the native button under a ${primary} primary pointer: a press slid from Cut to More runs nothing (family:action-groups FR1)`, () => {
      if (primary === 'fine') {
        finePrimaryPointer();
      }
      const {group, a, c, onA, onC} = mount();
      // A desktop group tracks nothing at all.
      expect(isPressGroupItem(a)).toBe(primary === 'coarse');
      pointer('mouse', 'pointerdown', a, centerOf(A));
      pointer('mouse', 'pointermove', a, centerOf(C));
      expect(paintOf(c)).toBeNull();
      pointer('mouse', 'pointerup', c, centerOf(C));
      // The browser's own click for that press lands on the buttons' common
      // parent, where the press began and ended apart.
      group.dispatchEvent(
        new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
      );
      expect(onA).not.toHaveBeenCalled();
      expect(onC).not.toHaveBeenCalled();
    });
  }

  it('paints a mouse press under the touch presentation as `:active` would: the group leaves it to the native button', () => {
    const {a, b} = mount();
    pointer('mouse', 'pointerdown', a, centerOf(A));
    expect(paintOf(a)).toBe('on');
    expect(paintOf(b)).toBeNull();
    pointer('mouse', 'pointerup', a, centerOf(A));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(paintOf(a)).not.toBe('on');
  });

  it('a hidden member runs nothing (family:action-groups FR2, FR3)', () => {
    const onGone = vi.fn();
    const view = render(
      <ButtonGroup label="Format" data-testid="group">
        <Button label="B" isIconOnly icon="bold" data-testid="a" />
        <Button label="I" isIconOnly icon="italic" data-testid="b" />
        <Button label="U" isIconOnly icon="underline" data-testid="c" />
        <Button
          label="S"
          onClick={onGone}
          style={{display: 'none'}}
          data-testid="d"
        />
      </ButtonGroup>,
    );
    const group = view.getByTestId('group');
    // Three 32 px buttons in a 96 × 32 row. The hidden fourth has an empty
    // box at the viewport's corner.
    place(group, {left: 0, top: 100, width: 96, height: 32});
    for (const [id, left] of [
      ['a', 0],
      ['b', 32],
      ['c', 64],
    ] as const) {
      place(view.getByTestId(id), {left, top: 100, width: 32, height: 32});
    }
    place(view.getByTestId('d'), {left: 0, top: 0, width: 0, height: 0});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    // A finger slid to the hidden member's corner lights and runs nothing.
    const f = finger();
    f.down(view.getByTestId('a'), {x: 16, y: 116});
    f.move(view.getByTestId('a'), {x: 0, y: 0});
    expect(paintOf(view.getByTestId('d'))).toBeNull();
    f.up(view.getByTestId('a'), {x: 0, y: 0});
    expect(onGone).not.toHaveBeenCalled();
  });

  it("takes a finger's press on a root wider than its buttons only where a button's target holds it, so a tap beside them keeps its click (FR5)", () => {
    // The root stretches to 400 px, as a flex child does; the buttons end at
    // 240. Their 32 px height grows 6 px above and below.
    const {group, onA, onB, onC} = mount({
      groupBox: {left: 0, top: 100, width: 400, height: 32},
    });
    for (const point of [
      {x: 320, y: 116},
      {x: 320, y: 135},
    ]) {
      const f = finger();
      f.down(group, point);
      const lift = f.up(group, point);
      // Nothing takes the press, so the browser's click for it still runs.
      expect(lift.defaultPrevented).toBe(false);
    }
    expect(onA).not.toHaveBeenCalled();
    expect(onB).not.toHaveBeenCalled();
    expect(onC).not.toHaveBeenCalled();
    // Just below the last button, inside its target, the group takes it.
    const f = finger();
    f.down(group, {x: 200, y: 135});
    const lift = f.up(group, {x: 200, y: 135});
    expect(onC).toHaveBeenCalledTimes(1);
    expect(lift.defaultPrevented).toBe(true);
  });

  for (const [name, extra] of [
    ['a header', {header: <span>Approve</span>}],
    ['a bottom sheet', {presentation: 'bottom-sheet' as const}],
  ] as const) {
    it(`leaves a DropdownMenu's trigger with ${name} its own press: a slide from it onto a button runs nothing`, () => {
      const onAllow = vi.fn();
      const view = render(
        <ButtonGroup label="Approve action" data-testid="group">
          <Button label="Allow once" onClick={onAllow} data-testid="a" />
          <DropdownMenu
            button={{label: 'Allow options'}}
            items={[{label: 'Always allow'}]}
            {...extra}
          />
        </ButtonGroup>,
      );
      const trigger = view.getByRole('button', {name: 'Allow options'});
      const allow = view.getByTestId('a');
      expect(isPressGroupItem(trigger)).toBe(false);
      place(view.getByTestId('group'), GROUP);
      place(allow, A);
      place(trigger, B);
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      const f = finger();
      f.down(trigger, centerOf(B));
      f.move(trigger, centerOf(A));
      f.up(trigger, centerOf(A));
      expect(onAllow).not.toHaveBeenCalled();
    });
  }

  it('runs the button a finger lifts on, once, through its own click, after sliding there from another (FR1, FR2)', () => {
    const {a, b, c, onA, onB, onC} = mount();
    const f = finger();
    f.down(a, centerOf(A));
    expect(paintOf(a)).toBe('on');
    f.move(a, centerOf(B));
    expect(paintOf(a)).toBeNull();
    expect(paintOf(b)).toBe('on');
    f.move(a, centerOf(C));
    expect(paintOf(b)).toBeNull();
    expect(paintOf(c)).toBe('on');
    f.up(a, centerOf(C));
    expect(onC).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
    expect(onB).not.toHaveBeenCalled();
  });

  it('runs nothing for a lift outside the group, and the highlight goes as the finger leaves (FR3)', () => {
    const {a, b, c, onA, onB, onC} = mount();
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, {x: 120, y: 260});
    expect([paintOf(a), paintOf(b), paintOf(c)]).toEqual([null, null, null]);
    f.up(a, {x: 120, y: 260});
    expect(onA).not.toHaveBeenCalled();
    expect(onB).not.toHaveBeenCalled();
    expect(onC).not.toHaveBeenCalled();
  });

  it('tracks a pen like a finger (FR5)', () => {
    const {a, b, onA, onB} = mount();
    pointer('pen', 'pointerdown', a, centerOf(A));
    expect(paintOf(a)).toBe('on');
    pointer('pen', 'pointermove', a, centerOf(B));
    expect(paintOf(b)).toBe('on');
    pointer('pen', 'pointerup', b, centerOf(B));
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  for (const key of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
    it(`leaves a mouse press with ${key} held on a link member to the browser: its own click runs, carrying the key`, () => {
      const onDocs = vi.fn();
      const view = render(
        <ButtonGroup label="Help" data-testid="group">
          <Button label="Docs" href="/docs" onClick={onDocs} data-testid="a" />
          <Button label="Ask" data-testid="b" />
        </ButtonGroup>,
      );
      const docs = view.getByTestId('a');
      place(view.getByTestId('group'), GROUP);
      place(docs, A);
      place(view.getByTestId('b'), B);
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      pointer('mouse', 'pointerdown', docs, centerOf(A), {[key]: true});
      // The press controller paints the press, as `:active` would; the
      // group's tracker takes no mouse press.
      expect(paintOf(docs)).toBe('on');
      pointer('mouse', 'pointerup', docs, centerOf(A), {[key]: true});
      // The browser's own click for that press opens the link elsewhere, so
      // nothing may replace or cancel it.
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
        [key]: true,
      });
      docs.dispatchEvent(click);
      expect(onDocs).toHaveBeenCalledTimes(1);
      expect(onDocs.mock.calls[0][0][key]).toBe(true);
      expect(click.defaultPrevented).toBe(false);
    });
  }

  it("keeps a selection that the lifted button's click makes in a layout effect, after its render (spec:AST-094 FR41)", async () => {
    function SelectOnClick() {
      const [clicks, setClicks] = useState(0);
      useLayoutEffect(() => {
        const text = document.querySelector('[data-testid="text"]');
        if (clicks > 0 && text != null) {
          getSelection()?.selectAllChildren(text);
        }
      }, [clicks]);
      return (
        <Button
          label="Select"
          onClick={() => setClicks(count => count + 1)}
          data-testid="select"
        />
      );
    }
    const view = render(
      <>
        <p data-testid="text">Text a layout effect selects</p>
        <ButtonGroup label="Text" data-testid="group">
          <SelectOnClick />
          <Button label="Clear" data-testid="b" />
        </ButtonGroup>
      </>,
    );
    const select = view.getByTestId('select');
    place(view.getByTestId('group'), GROUP);
    place(select, A);
    place(view.getByTestId('b'), B);
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(select, centerOf(A));
    f.up(select, centerOf(A));
    // React renders the click's update in a microtask.
    await Promise.resolve();
    await Promise.resolve();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(String(getSelection())).toBe('Text a layout effect selects');
    getSelection()?.removeAllRanges();
  });

  it('a finger on the edge of a disabled button that has a tooltip runs nothing, not its enabled neighbour (FR2)', () => {
    const onCut = vi.fn();
    const view = render(
      <ButtonGroup label="Edit" data-testid="group">
        <Button label="Cut" onClick={onCut} data-testid="a" />
        <Button
          label="Copy"
          isDisabled
          tooltip="Nothing to copy"
          data-testid="b"
        />
        <Button label="Paste" data-testid="c" />
      </ButtonGroup>,
    );
    const copy = view.getByTestId('b');
    // Three touching 28 px buttons: Cut's target grows 8 px past its edge,
    // over the disabled Copy.
    place(view.getByTestId('group'), {
      left: 0,
      top: 100,
      width: 84,
      height: 28,
    });
    place(view.getByTestId('a'), {left: 0, top: 100, width: 28, height: 28});
    place(copy, {left: 28, top: 100, width: 28, height: 28});
    place(view.getByTestId('c'), {left: 56, top: 100, width: 28, height: 28});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(copy, {x: 30, y: 114});
    expect(paintOf(view.getByTestId('a'))).toBeNull();
    f.up(copy, {x: 30, y: 114});
    expect(onCut).not.toHaveBeenCalled();
  });

  it("leaves a finger's tap on a disabled button that has a tooltip its click, which opens the reason (component:Tooltip FR5)", () => {
    const view = render(
      <ButtonGroup label="Edit" data-testid="group">
        <Button label="Cut" data-testid="a" />
        <Button
          label="Copy"
          isDisabled
          tooltip="Nothing to copy"
          data-testid="b"
        />
        <Button label="Paste" data-testid="c" />
      </ButtonGroup>,
    );
    const copy = view.getByTestId('b');
    place(view.getByTestId('group'), {
      left: 0,
      top: 100,
      width: 84,
      height: 28,
    });
    place(view.getByTestId('a'), {left: 0, top: 100, width: 28, height: 28});
    place(copy, {left: 28, top: 100, width: 28, height: 28});
    place(view.getByTestId('c'), {left: 56, top: 100, width: 28, height: 28});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(copy, {x: 42, y: 114});
    const lift = f.up(copy, {x: 42, y: 114});
    // Nothing takes the press, so the browser still sends the click.
    expect(lift.defaultPrevented).toBe(false);
  });

  it("reads no box outside the group at a finger's press, on a page with 2,000 links", () => {
    const view = render(
      <div>
        {Array.from({length: 2000}, (_, i) => (
          <a key={i} href={`#link-${i}`}>
            Link {i}
          </a>
        ))}
        <ButtonGroup label="Edit" data-testid="group">
          <Button label="Cut" data-testid="a" />
          <Button label="Copy" data-testid="b" />
          <Button label="More" data-testid="c" />
        </ButtonGroup>
      </div>,
    );
    let pageReads = 0;
    view.container.querySelectorAll('a').forEach((link, i) => {
      const box = DOMRect.fromRect({
        x: (i % 40) * 30,
        y: 400,
        width: 24,
        height: 20,
      });
      link.getBoundingClientRect = () => {
        pageReads += 1;
        return box;
      };
    });
    const group = view.getByTestId('group');
    const a = view.getByTestId('a');
    place(group, GROUP);
    place(a, A);
    place(view.getByTestId('b'), B);
    place(view.getByTestId('c'), C);
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    pageReads = 0;
    // A finger on a button, then one on the group's hit layer below it. A
    // real finger sends each pointer event before its touch event.
    for (const [target, point] of [
      [a, centerOf(A)],
      [group, {x: 40, y: 137}],
    ] as const) {
      const f = finger();
      pointer('touch', 'pointerdown', target, point);
      f.down(target, point);
      pointer('touch', 'pointerup', target, point);
      f.up(target, point);
    }
    expect(pageReads).toBe(0);
  });

  it('skips a disabled button: no highlight, and a lift on it runs nothing (FR2)', () => {
    const {a, b, onB} = mount({isBDisabled: true});
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, centerOf(B));
    expect(paintOf(b)).toBeNull();
    expect(paintOf(a)).toBeNull();
    f.up(a, centerOf(B));
    expect(onB).not.toHaveBeenCalled();
  });

  it('leaves a menu trigger in the group untracked: it carries no marker, as a menu keeps its own opening (spec:AST-094 FR29)', () => {
    const {a, c} = mount({isCMenuTrigger: true});
    expect(isPressGroupItem(a)).toBe(true);
    expect(isPressGroupItem(c)).toBe(false);
  });

  it('tracks a member that opens a dialog: it carries the marker, and a slide lifted on it runs it (family:action-groups: only menus keep their own opening)', () => {
    const {a, c, onA, onC} = mount({cHasPopup: 'dialog'});
    expect(isPressGroupItem(c)).toBe(true);
    const f = finger();
    f.down(a, centerOf(A));
    f.move(a, centerOf(C));
    f.up(a, centerOf(C));
    expect(onC).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  it('tracks a member that opens a grid or a tree, as any button', () => {
    for (const popup of ['grid', 'tree'] as const) {
      const {c, unmount} = mount({cHasPopup: popup});
      expect(isPressGroupItem(c)).toBe(true);
      unmount();
    }
  });

  it('leaves a menu-like trigger untracked: `aria-haspopup` of true or listbox, as menu', () => {
    for (const popup of ['true', 'listbox'] as const) {
      const {c, unmount} = mount({cHasPopup: popup});
      expect(isPressGroupItem(c)).toBe(false);
      unmount();
    }
  });

  it("a finger slid from Cut that lifts just inside a menu trigger runs nothing: Cut's target does not reach into the trigger's own (spec:AST-094 FR42)", () => {
    const onCut = vi.fn();
    const onMore = vi.fn();
    const view = render(
      <ButtonGroup label="Edit" data-testid="group">
        <Button label="Cut" onClick={onCut} data-testid="a" />
        <Button
          label="More"
          aria-haspopup="menu"
          onClick={onMore}
          data-testid="more"
        />
      </ButtonGroup>,
    );
    const cut = view.getByTestId('a');
    const more = view.getByTestId('more');
    // Two 32 px buttons 4 px apart: grown toward 44 px, Cut's target would
    // reach 2 px into More, which the group does not track.
    place(view.getByTestId('group'), {
      left: 0,
      top: 100,
      width: 68,
      height: 32,
    });
    place(cut, {left: 0, top: 100, width: 32, height: 32});
    place(more, {left: 36, top: 100, width: 32, height: 32});
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    const f = finger();
    f.down(cut, {x: 16, y: 116});
    expect(paintOf(cut)).toBe('on');
    f.move(cut, {x: 37, y: 116});
    expect(paintOf(cut)).not.toBe('on');
    f.up(cut, {x: 37, y: 116});
    expect(onCut).not.toHaveBeenCalled();
  });

  it('leaves a menu trigger its own click: the group does not take a press that lands on it (spec:AST-094 FR29)', () => {
    const {c, onC} = mount({isCMenuTrigger: true});
    const f = finger();
    f.down(c, centerOf(C));
    f.up(c, centerOf(C));
    // The browser's own click for that tap reaches the trigger.
    c.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
    expect(onC).toHaveBeenCalledTimes(1);
  });

  it("leaves a menu trigger a mouse's click too", () => {
    finePrimaryPointer();
    const {c, onC} = mount({isCMenuTrigger: true});
    pointer('mouse', 'pointerdown', c, centerOf(C));
    pointer('mouse', 'pointerup', c, centerOf(C));
    c.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
    expect(onC).toHaveBeenCalledTimes(1);
  });

  describe('touching buttons take no area from each other (FR5)', () => {
    // 28 px buttons sit side by side at x = 0, 80 and 160. A finger's target
    // grows 8 px above and below each, and none grows into a neighbour.
    const TALL = 28;
    function mountTouching() {
      const view = mount();
      place(view.group, {left: 0, top: 100, width: 240, height: TALL});
      place(view.a, {left: 0, top: 100, width: 80, height: TALL});
      place(view.b, {left: 80, top: 100, width: 80, height: TALL});
      place(view.c, {left: 160, top: 100, width: 80, height: TALL});
      return view;
    }
    const tapAt = (target: Element, point: Point) => {
      const f = finger();
      f.down(target, point);
      f.up(target, point);
    };

    it('a finger at x = 82 runs only the middle button, and at x = 78 only the first', () => {
      const {group, onA, onB, onC} = mountTouching();
      tapAt(group, {x: 82, y: 114});
      expect([onA, onB, onC].map(fn => fn.mock.calls.length)).toEqual([
        0, 1, 0,
      ]);
      tapAt(group, {x: 78, y: 114});
      expect([onA, onB, onC].map(fn => fn.mock.calls.length)).toEqual([
        1, 1, 0,
      ]);
    });

    it('a finger 8 px below a button still counts for that button, and 9 px below for none', () => {
      const {group, onA, onB, onC} = mountTouching();
      tapAt(group, {x: 120, y: 100 + TALL + 8});
      expect([onA, onB, onC].map(fn => fn.mock.calls.length)).toEqual([
        0, 1, 0,
      ]);
      tapAt(group, {x: 120, y: 100 + TALL + 9});
      expect([onA, onB, onC].map(fn => fn.mock.calls.length)).toEqual([
        0, 1, 0,
      ]);
    });
  });

  describe('the 44 px touch target (FR5)', () => {
    // 4 px below Cut: outside its 32 px box, inside the 44 px it grows to.
    const BELOW_A = {x: 40, y: 136};

    it('a finger just past a small button, inside its 44 px target, presses that button', () => {
      const {group, a, onA} = mount();
      const f = finger();
      f.down(group, BELOW_A);
      expect(paintOf(a)).toBe('on');
      f.up(group, BELOW_A);
      expect(onA).toHaveBeenCalledTimes(1);
    });

    it('a finger past the 44 px target presses nothing', () => {
      const {group, a, onA} = mount();
      const f = finger();
      f.down(group, {x: 40, y: 140});
      expect(paintOf(a)).toBeNull();
      f.up(group, {x: 40, y: 140});
      expect(onA).not.toHaveBeenCalled();
    });

    it('a mouse under a fine pointer gets no growth: the same point presses nothing', () => {
      finePrimaryPointer();
      const {group, a, onA} = mount();
      pointer('mouse', 'pointerdown', group, BELOW_A);
      expect(paintOf(a)).toBeNull();
      pointer('mouse', 'pointerup', group, BELOW_A);
      expect(onA).not.toHaveBeenCalled();
    });
  });
});

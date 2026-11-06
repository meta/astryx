// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file boxHold.test.tsx
 * @input CheckboxInput, CheckboxList, RadioList and Switch in jsdom, pointer
 *   and touch events built by hand, a coarse pointer and fake timers
 * @output Checks that a finger held on each control's box refuses a selection
 *   of the label beside it until the lift. A still lift that gets no browser
 *   click picks a checkbox, a CheckboxList row and a radio option once, after
 *   the wait. A read-only checkbox's lift changes nothing, as its tap does. A
 *   long press that opens a ContextMenu around a box, or that a row around it
 *   runs, leaves it unchanged: the lift's touchend is cancelled. So does a
 *   row that opens its own menu from the hold's contextmenu. A tap on a
 *   second box leaves the first box's activation in place. A switch takes the
 *   lock. A press on the label takes none.
 * @position Component layer of utils/boxHold.ts (unit layer:
 *   utils/boxHold.test.ts); the browser layer is
 *   Indicator/__tests__/BoxHold.interaction.browser.spec.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import {CheckboxList} from '../CheckboxList/CheckboxList';
import {CheckboxListItem} from '../CheckboxList/CheckboxListItem';
import {ContextMenu} from '../ContextMenu/ContextMenu';
import {useLongPress} from '../hooks/useLongPress';
import {RadioList} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList/RadioListItem';
import {Switch} from '../Switch/Switch';
import {coarsePrimaryPointer} from '../gestures/__tests__/pointerQuery';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';
import {BROWSER_CLICK_WAIT_MS} from '../utils/browserClickWait';

/** Dispatches a finger's pointer event, which the shared press controller hears. */
function press(target: Element, type: 'pointerdown' | 'pointerup') {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {
    button: 0,
    clientX: 1,
    clientY: 1,
    pointerId: 1,
    pointerType: 'touch',
  });
  target.dispatchEvent(event);
}

/**
 * Dispatches a touch event as a browser sends it, for Switch's own tracker.
 * There is no constructible TouchEvent in jsdom, so the touch lists and the
 * time stamp are set on it.
 */
function touch(type: 'touchstart' | 'touchend', target: Element, time: number) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: 1, clientY: 1, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [entry],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

/** A finger held 0.9 s on `target`, then lifted. */
function hold(target: Element, during?: () => void) {
  press(target, 'pointerdown');
  act(() => {
    vi.advanceTimersByTime(900);
  });
  during?.();
  press(target, 'pointerup');
}

/** Runs out the lift's wait for the browser's click. */
function waitForNoClick() {
  act(() => {
    vi.advanceTimersByTime(BROWSER_CLICK_WAIT_MS);
  });
}

/** Whether a selection that starts on `target` is refused. */
function refuses(target: Element): boolean {
  const event = new Event('selectstart', {bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * A CheckboxList row's own visible text, not the hidden label its checkbox
 * keeps for its name.
 */
function rowLabel(name: string): HTMLElement {
  const label = screen
    .getAllByText(name)
    .find(element => element.closest('label') == null);
  if (label == null) {
    throw new Error(`no row text ${name}`);
  }
  return label;
}

let restorePointer: () => void = () => {};
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  restorePointer();
});

describe('a finger held on a control’s box', () => {
  it('refuses a selection of a checkbox’s label until the lift, and a lift with no click checks it once', () => {
    const onChange = vi.fn();
    render(
      <CheckboxInput label="Accept terms" value={false} onChange={onChange} />,
    );
    const input = screen.getByRole('checkbox', {name: 'Accept terms'});
    const label = screen.getByText('Accept terms');
    let held = false;
    hold(input, () => {
      held = refuses(label);
    });
    expect(held).toBe(true);
    expect(refuses(label)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    waitForNoClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });

  it('leaves a read-only checkbox as its tap leaves it: the lift changes nothing', () => {
    const onChange = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        isReadOnly
        onChange={onChange}
      />,
    );
    const input = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Accept terms',
    });
    // The tap's own click, the baseline.
    act(() => {
      input.click();
    });
    expect(onChange).not.toHaveBeenCalled();
    hold(input);
    waitForNoClick();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.checked).toBe(false);
  });

  it('refuses a selection of a CheckboxList row’s label under a coarse pointer, and a lift with no click picks the row once', () => {
    stubMatchMedia({matches: true, pointer: 'coarse'});
    const onChange = vi.fn();
    render(
      <CheckboxList label="Notifications" value={[]} onChange={onChange}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
      </CheckboxList>,
    );
    const input = screen.getByRole('checkbox', {name: 'SMS'});
    let held = false;
    let neighbour = true;
    hold(input, () => {
      held = refuses(rowLabel('SMS'));
      // A neighbouring row is not the one the finger holds.
      neighbour = refuses(rowLabel('Email'));
    });
    expect(held).toBe(true);
    expect(neighbour).toBe(false);
    waitForNoClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(['sms']);
  });

  it('refuses a selection of a radio option’s label until the lift, and a lift with no click picks the option once', () => {
    const onChange = vi.fn();
    render(
      <RadioList label="Plan" value="a" onChange={onChange}>
        <RadioListItem label="Basic" value="a" />
        <RadioListItem label="Premium" value="b" />
      </RadioList>,
    );
    const input = screen.getByRole('radio', {name: 'Premium'});
    const label = screen.getByText('Premium');
    let held = false;
    hold(input, () => {
      held = refuses(label);
    });
    expect(held).toBe(true);
    expect(refuses(label)).toBe(false);
    waitForNoClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe('b');
  });

  it('leaves a CheckboxList row in a ContextMenu unchanged after a long press that opened the menu', () => {
    stubMatchMedia({matches: true, pointer: 'coarse'});
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ContextMenu items={[{label: 'Cut'}]} onOpenChange={onOpenChange}>
        <CheckboxList label="Notifications" value={[]} onChange={onChange}>
          <CheckboxListItem label="Email" value="email" />
          <CheckboxListItem label="SMS" value="sms" />
        </CheckboxList>
      </ContextMenu>,
    );
    const input = screen.getByRole('checkbox', {name: 'SMS'});
    press(input, 'pointerdown');
    fireEvent.touchStart(input, {touches: [{clientX: 1, clientY: 1}]});
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // The lift stays on the box, under the open menu. Its touchend is
    // cancelled, so the browser sends no click.
    press(input, 'pointerup');
    expect(fireEvent.touchEnd(input)).toBe(false);
    waitForNoClick();
    waitForNoClick();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a checkbox in a useLongPress row unchanged after a hold that ran the row’s long press', () => {
    const onChange = vi.fn();
    const onLongPress = vi.fn();
    function LongPressRow() {
      const {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel} =
        useLongPress({onLongPress});
      return (
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}>
          <CheckboxInput
            label="Accept terms"
            value={false}
            onChange={onChange}
          />
        </div>
      );
    }
    render(<LongPressRow />);
    const input = screen.getByRole('checkbox', {name: 'Accept terms'});
    press(input, 'pointerdown');
    fireEvent.touchStart(input, {touches: [{clientX: 1, clientY: 1}]});
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    press(input, 'pointerup');
    expect(fireEvent.touchEnd(input)).toBe(false);
    waitForNoClick();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a checkbox in an onContextMenu row unchanged after a hold that opened the row’s menu', () => {
    const onChange = vi.fn();
    const onRowMenu = vi.fn();
    render(
      <div
        onContextMenu={event => {
          event.preventDefault();
          onRowMenu();
        }}>
        <CheckboxInput label="Accept terms" value={false} onChange={onChange} />
      </div>,
    );
    const input = screen.getByRole('checkbox', {name: 'Accept terms'});
    press(input, 'pointerdown');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // Chromium sends the long press as a contextmenu, and no click follows.
    expect(fireEvent.contextMenu(input)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    press(input, 'pointerup');
    fireEvent.touchEnd(input);
    waitForNoClick();
    expect(onRowMenu).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('activates a held checkbox once when a tap on a second one follows inside the wait', () => {
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    render(
      <>
        <CheckboxInput label="First" value={false} onChange={onFirst} />
        <CheckboxInput label="Second" value={false} onChange={onSecond} />
      </>,
    );
    hold(screen.getByRole('checkbox', {name: 'First'}));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // A tap's activation is the browser's click, which jsdom does not make.
    const second = screen.getByRole('checkbox', {name: 'Second'});
    press(second, 'pointerdown');
    press(second, 'pointerup');
    waitForNoClick();
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).not.toHaveBeenCalled();
  });

  it('refuses a selection of a switch’s label until the lift', () => {
    render(<Switch label="Wi-Fi" value={false} onChange={() => {}} />);
    const input = screen.getByRole('switch', {name: 'Wi-Fi'});
    const label = screen.getByText('Wi-Fi');
    touch('touchstart', input, 0);
    const held = refuses(label);
    touch('touchend', input, 900);
    expect(held).toBe(true);
    expect(refuses(label)).toBe(false);
  });

  it('takes no lock for a press that starts on the label, which keeps native selection', () => {
    render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    const label = screen.getByText('Accept terms');
    let held = true;
    hold(label, () => {
      held = refuses(label);
    });
    expect(held).toBe(false);
  });
});

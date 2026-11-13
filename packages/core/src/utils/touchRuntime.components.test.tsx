// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchRuntime.components.test.tsx
 * @input Switch and SegmentedControl rendered before and after the shared
 *   touch runtime has loaded
 * @output Tests that a component works by taps and clicks before the load,
 *   that a press in flight at the load finishes that way, and that the next
 *   press after the load takes the touch path
 *   (`architecture:react-component-runtime` INV13, `spec:AST-080` DEC-5)
 * @position Testing; the loader's timing is in touchRuntime.test.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SegmentedControl, SegmentedControlItem} from '../SegmentedControl';
import {Switch} from '../Switch';
import {
  __loadTouchRuntimeForTest,
  __resetTouchRuntimeForTest,
  getTouchRuntime,
} from './touchRuntime';

/** A pen event on `target`, with the fields the press tracking reads. */
function pen(
  target: Element,
  type: 'pointerdown' | 'pointerup',
  time: number,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(event, {
    pointerId: {value: 7},
    pointerType: {value: 'pen'},
    isPrimary: {value: true},
    clientX: {value: 10},
    clientY: {value: 10},
    button: {value: 0},
    buttons: {value: type === 'pointerup' ? 0 : 1},
    timeStamp: {value: time},
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

/** A pen press that a window blur cancels, then its lift and its click. */
async function cancelledPenPress(input: Element): Promise<void> {
  pen(input, 'pointerdown', 1000);
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
  await act(async () => {
    await Promise.resolve();
  });
  pen(input, 'pointerup', 1080);
  fireEvent.click(input, {detail: 1});
}

async function loadRuntime(): Promise<void> {
  await act(async () => {
    await __loadTouchRuntimeForTest();
  });
}

describe('a touch component before and after the touch runtime loads', () => {
  beforeEach(() => {
    __resetTouchRuntimeForTest();
  });

  afterEach(() => {
    __resetTouchRuntimeForTest();
  });

  it('toggles a Switch by its click before the load, with no touch tracking', async () => {
    const onChange = vi.fn();
    render(<Switch label="Wi-Fi" value={false} onChange={onChange} />);
    expect(getTouchRuntime()).toBeNull();
    // The click alone decides: nothing tracks the pen's press yet.
    await cancelledPenPress(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });

  it('takes the touch path for the next press once the runtime has loaded', async () => {
    const onChange = vi.fn();
    render(<Switch label="Wi-Fi" value={false} onChange={onChange} />);
    await loadRuntime();
    // The touch press tracking now owns the press: a press a blur cancels
    // toggles nothing (`spec:AST-094` FR44).
    await cancelledPenPress(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('finishes a press in flight at the load by its click, and tracks the next one', async () => {
    const onChange = vi.fn();
    render(<Switch label="Wi-Fi" value={false} onChange={onChange} />);
    const input = screen.getByRole('switch');
    pen(input, 'pointerdown', 1000);
    await loadRuntime();
    pen(input, 'pointerup', 1080);
    fireEvent.click(input, {detail: 1});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);

    onChange.mockClear();
    await cancelledPenPress(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects nothing for a SegmentedControl press the browser cancels before the load', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl label="View" value="list" onChange={onChange}>
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );
    const list = screen.getByRole('radio', {name: 'List'});
    const grid = screen.getByRole('radio', {name: 'Grid'});
    act(() => {
      list.focus();
    });
    // A press on Grid focuses it at pointerdown; the browser then cancels it.
    fireEvent.pointerDown(grid, {pointerId: 3, pointerType: 'mouse'});
    act(() => {
      grid.focus();
    });
    fireEvent.pointerCancel(grid, {pointerId: 3, pointerType: 'mouse'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects a SegmentedControl segment by its click before and after the load', async () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <SegmentedControl label="View" value="list" onChange={onChange}>
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );
    fireEvent.click(screen.getByRole('radio', {name: 'Grid'}));
    expect(onChange).toHaveBeenLastCalledWith('grid');

    await loadRuntime();
    rerender(
      <SegmentedControl label="View" value="grid" onChange={onChange}>
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );
    fireEvent.click(screen.getByRole('radio', {name: 'List'}));
    expect(onChange).toHaveBeenLastCalledWith('list');
  });
});

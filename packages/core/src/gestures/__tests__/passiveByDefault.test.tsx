// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file passiveByDefault.test.tsx
 * @input Uses vitest, Testing Library, Button, Item, GestureHost and
 *   PressTracker
 * @output Checks that plain pressables never get a blocking touchmove
 *   listener, and that only a press tracker created with `keepsTouch: true`
 *   does
 * @position Guards the 60 fps scroll goal: a scroll that starts on a plain
 *   button or a list cell never waits on the main thread
 */

import {render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Button} from '../../Button/Button';
import {Item} from '../../Item/Item';
import {GestureHost} from '../GestureHost';
import {PressTracker} from '../PressTracker';
import {ManualClock} from './harness';

function touchStart(target: Element): void {
  const event = new Event('touchstart', {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: 5, clientY: 5, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: [entry]});
  target.dispatchEvent(event);
}

function blockingTouchMoves(spy: {mock: {calls: unknown[][]}}): number {
  return spy.mock.calls.filter(
    ([type, , options]) =>
      type === 'touchmove' &&
      (options as AddEventListenerOptions | undefined)?.passive === false,
  ).length;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('blocking touchmove listeners', () => {
  it('never come with a plain Button or an Item cell', () => {
    const spy = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const {getByRole, getByText} = render(
      <div>
        <Button label="Save" />
        <Item label="Row" onClick={() => {}} />
      </div>,
    );
    touchStart(getByRole('button', {name: 'Save'}));
    touchStart(getByText('Row'));
    expect(blockingTouchMoves(spy)).toBe(0);
  });

  it('come only with a press tracker that keeps its touch', () => {
    document.body.innerHTML = '<div id="plain"></div><div id="stepper"></div>';
    const plain = document.getElementById('plain') as HTMLElement;
    const stepper = document.getElementById('stepper') as HTMLElement;
    const host = new GestureHost(document, {clock: new ManualClock()});
    const onPlain = vi.spyOn(plain, 'addEventListener');
    const onStepper = vi.spyOn(stepper, 'addEventListener');
    const detachPlain = host.attachConsumer(
      plain,
      new PressTracker({getBounds: () => null}),
    );
    const detachStepper = host.attachConsumer(
      stepper,
      new PressTracker({getBounds: () => null, keepsTouch: true}),
    );
    touchStart(plain);
    expect(blockingTouchMoves(onPlain)).toBe(0);
    expect(blockingTouchMoves(onStepper)).toBe(1);
    detachPlain();
    detachStepper();
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressGesture.test.ts
 * @input pressGesture.ts
 * @output Unit tests for the press state machine, one case per requirement
 *   of the touch press model, in the model's order
 * @position Testing; validates pressGesture.ts without a browser
 *
 * Every number these assert against was measured on an iPhone simulator
 * driving the real Settings and Contacts apps with real HID touches at
 * 60 fps. The test names say the behaviour, not the mechanism, so a rewrite
 * of the machine still has to keep them.
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {PressEvent, PressGesture, PressPaint} from './pressGesture';
import {
  idlePressGesture,
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SLOP_PX,
  pressGestureStep,
} from './pressGesture';

/** Drive a gesture and collect what was painted after each event. */
function run(events: PressEvent[]): {
  paints: PressPaint[];
  gesture: PressGesture;
} {
  let gesture = idlePressGesture();
  const paints: PressPaint[] = [];
  for (const event of events) {
    const step = pressGestureStep(gesture, event);
    gesture = step.gesture;
    paints.push(step.paint);
  }
  return {gesture, paints};
}

const down = (x = 100, y = 100): PressEvent => ({kind: 'down', x, y});
const move = (x: number, y: number): PressEvent => ({kind: 'move', x, y});

describe('the clocks are the native ones', () => {
  it("waits the scroll view's content-touch delay before believing a press", () => {
    // `UIScrollView.delaysContentTouches` holds a content touch 0.15 s.
    // Measured: a 1.5 s hold painted the native highlight for 1.34 s.
    expect(PRESS_ONSET_MS).toBe(150);
  });

  it("uses the scroller's own slop, the release's own fade, and a flash for a quick tap", () => {
    expect(PRESS_SLOP_PX).toBe(10);
    expect(PRESS_FADE_MS).toBe(200);
    expect(PRESS_FLASH_MS).toBe(100);
  });

  it("are the UIKit table's measured values, one definition each", () => {
    // The machine keeps its own constants, so a pressable page loads no
    // motion table; the table's entries stay the one definition.
    expect(PRESS_ONSET_MS).toBe(UIKIT_GESTURES.press.contentTouchDelay.value);
    expect(PRESS_FLASH_MS).toBe(UIKIT_GESTURES.press.quickTapFlash.value);
    expect(PRESS_SLOP_PX).toBe(UIKIT_GESTURES.press.slop.value);
  });
});

describe('nothing paints until the press is believed', () => {
  it('paints nothing on the touch itself', () => {
    const {paints, gesture} = run([down()]);
    expect(paints).toEqual(['none']);
    expect(gesture.phase).toBe('armed');
  });

  it('asks for the onset timer, and only then', () => {
    expect(pressGestureStep(idlePressGesture(), down()).timer).toBe('onset');
  });

  it('never paints for a fling: the scroller claims it inside the delay', () => {
    // Measured: `pointercancel` at +31 ms on a fling, 119 ms before the onset
    // timer would have fired.
    const {paints} = run([down(), move(100, 90), {kind: 'cancel'}]);
    expect(paints).toEqual(['none', 'none', 'none']);
  });
});

describe('a held press paints instantly and completely', () => {
  it('paints on the onset, with no transition state in between', () => {
    const {paints, gesture} = run([down(), {kind: 'onset'}]);
    expect(paints).toEqual(['none', 'on']);
    expect(gesture.phase).toBe('pressed');
  });
});

describe('travel cancels, and a shaky hand does not', () => {
  it('keeps the press while the finger stays inside the slop', () => {
    // Measured: a 4 pt drag over 2 s kept the native highlight for the whole
    // gesture.
    const inside = PRESS_SLOP_PX - 1;
    const {paints, gesture} = run([
      down(),
      {kind: 'onset'},
      move(100, 100 + inside),
    ]);
    expect(paints).toEqual(['none', 'on', 'on']);
    expect(gesture.phase).toBe('pressed');
  });

  it('cancels the moment the finger passes the slop, painted or not', () => {
    const beyond = PRESS_SLOP_PX + 1;
    const painted = run([down(), {kind: 'onset'}, move(100, 100 + beyond)]);
    expect(painted.paints.at(-1)).toBe('none');
    expect(painted.gesture.phase).toBe('dead');

    const unpainted = run([down(), move(100, 100 + beyond)]);
    expect(unpainted.paints).toEqual(['none', 'none']);
    expect(unpainted.gesture.phase).toBe('dead');
  });

  it('measures travel from where the finger landed, not from the last move', () => {
    // Otherwise a slow drag never trips the slop: each step is small, and the
    // press would ride a scroll all the way down the list.
    const creep: PressEvent[] = [];
    for (let y = 101; y <= 100 + PRESS_SLOP_PX + 2; y += 1) {
      creep.push(move(100, y));
    }
    const {gesture} = run([down(), {kind: 'onset'}, ...creep]);
    expect(gesture.phase).toBe('dead');
  });
});

describe("the scroller's claim cancels", () => {
  it('drops the paint with no fade', () => {
    // Measured: the native highlight goes from full to bare in ONE frame, and
    // 45 ms BEFORE the list's content first moves.
    const {paints, gesture} = run([down(), {kind: 'onset'}, {kind: 'cancel'}]);
    expect(paints).toEqual(['none', 'on', 'none']);
    expect(gesture.phase).toBe('dead');
  });

  it('asks for no timer on the way out, so nothing can fire later', () => {
    const armed = pressGestureStep(idlePressGesture(), down()).gesture;
    const pressed = pressGestureStep(armed, {kind: 'onset'}).gesture;
    expect(pressGestureStep(pressed, {kind: 'cancel'}).timer).toBeNull();
  });
});

describe('a cancelled gesture is dead', () => {
  it('does not come back when the finger stops moving', () => {
    const {paints, gesture} = run([
      down(),
      {kind: 'onset'},
      move(100, 200),
      move(100, 200),
      move(100, 201),
    ]);
    expect(paints.slice(2)).toEqual(['none', 'none', 'none']);
    expect(gesture.phase).toBe('dead');
  });

  it('does not come back when the finger returns to where it started', () => {
    const {paints} = run([
      down(),
      {kind: 'onset'},
      move(100, 200),
      move(100, 100),
    ]);
    expect(paints.at(-1)).toBe('none');
  });

  it('does not paint on the release either', () => {
    const {paints} = run([
      down(),
      {kind: 'onset'},
      {kind: 'cancel'},
      {kind: 'up'},
    ]);
    expect(paints.at(-1)).toBe('none');
  });

  it('does not paint if the onset timer fires late, after the scroll took the gesture', () => {
    // iOS throttles frame callbacks during a scroll and a queued timer can
    // land after the cancel; the phase, not the timer, decides.
    const {paints} = run([down(), {kind: 'cancel'}, {kind: 'onset'}]);
    expect(paints).toEqual(['none', 'none', 'none']);
  });

  it('only a new touch revives it', () => {
    const {paints, gesture} = run([
      down(),
      {kind: 'cancel'},
      down(120, 300),
      {kind: 'onset'},
    ]);
    expect(paints.at(-1)).toBe('on');
    expect(gesture.phase).toBe('pressed');
  });

  it('ends when the finger lifts, so the NEXT press is heard', () => {
    // The gesture holds the controller's one tracking slot until it resolves.
    // A `dead` gesture that never resolved is how every press after the first
    // scroll would answer with nothing.
    const {gesture} = run([
      down(),
      {kind: 'onset'},
      move(100, 300),
      {kind: 'up'},
    ]);
    expect(gesture.phase).toBe('idle');
  });
});

describe('a press after a scroll', () => {
  it('paints, the way the first one did', () => {
    const {paints, gesture} = run([
      down(),
      {kind: 'onset'},
      move(100, 400),
      {kind: 'up'},
      down(100, 420),
      {kind: 'onset'},
    ]);
    expect(paints.at(-1)).toBe('on');
    expect(gesture.phase).toBe('pressed');
  });
});

describe('the paint does not survive its gesture', () => {
  it('leaves nothing painted once a cancelled gesture is over', () => {
    const {paints, gesture} = run([
      down(),
      {kind: 'onset'},
      {kind: 'cancel'},
      {kind: 'up'},
    ]);
    expect(paints.at(-1)).toBe('none');
    expect(gesture.phase).toBe('idle');
  });
});

describe('a tap too quick for the delay still answers', () => {
  it('paints at the release and holds it at full strength', () => {
    const {paints, gesture} = run([down(), {kind: 'up'}]);
    expect(paints).toEqual(['none', 'on']);
    expect(gesture.phase).toBe('flash');
  });

  it('arms the flash hold, then hands over to the same fade a long press gets', () => {
    const armed = pressGestureStep(idlePressGesture(), down()).gesture;
    const flash = pressGestureStep(armed, {kind: 'up'});
    expect(flash.timer).toBe('flash');
    const fading = pressGestureStep(flash.gesture, {kind: 'flashEnd'});
    expect(fading.paint).toBe('fading');
    expect(fading.timer).toBe('fade');
  });

  it('is not clipped by the cancel iOS sends after the tap', () => {
    // iOS Safari delivers `touchcancel` at `scrollend`, up to seconds after a
    // tap. It must not cut the answer the tap earned.
    const {paints} = run([down(), {kind: 'up'}, {kind: 'cancel'}]);
    expect(paints.at(-1)).toBe('on');
  });
});

describe('the release fades', () => {
  it('fades from a held press and ends idle', () => {
    const {paints, gesture} = run([
      down(),
      {kind: 'onset'},
      {kind: 'up'},
      {kind: 'fadeEnd'},
    ]);
    expect(paints).toEqual(['none', 'on', 'fading', 'none']);
    expect(gesture.phase).toBe('idle');
  });

  it('asks for the fade timer so the state cannot be left behind', () => {
    const armed = pressGestureStep(idlePressGesture(), down()).gesture;
    const pressed = pressGestureStep(armed, {kind: 'onset'}).gesture;
    expect(pressGestureStep(pressed, {kind: 'up'}).timer).toBe('fade');
  });
});

describe('on a touch-first device, a mouse button or the Space key presses at once', () => {
  // The stylesheet drops `:active` by the PRIMARY pointer, so on a phone or
  // a tablet a trackpad click or a Space press has nothing else to paint it.
  // Nothing can turn either into a scroll, so nothing waits.
  const buttonDown: PressEvent = {kind: 'buttonDown'};

  it('paints on the press itself and arms no timer', () => {
    const step = pressGestureStep(idlePressGesture(), buttonDown);
    expect(step.paint).toBe('on');
    expect(step.timer).toBeNull();
    expect(step.gesture.phase).toBe('buttonHeld');
  });

  it('keeps the paint through any travel, as a held mouse keeps `:active`', () => {
    const {paints, gesture} = run([
      buttonDown,
      move(100 + PRESS_SLOP_PX * 10, 100),
      move(-500, -500),
      {kind: 'onset'},
    ]);
    expect(paints).toEqual(['on', 'on', 'on', 'on']);
    expect(gesture.phase).toBe('buttonHeld');
  });

  it("fades at the release with a finger's fade, and ends idle", () => {
    const held = pressGestureStep(idlePressGesture(), buttonDown).gesture;
    const release = pressGestureStep(held, {kind: 'up'});
    expect(release.paint).toBe('fading');
    expect(release.timer).toBe('fade');
    const {paints, gesture} = run([
      buttonDown,
      {kind: 'up'},
      {kind: 'fadeEnd'},
    ]);
    expect(paints).toEqual(['on', 'fading', 'none']);
    expect(gesture.phase).toBe('idle');
  });

  it('drops the paint at once when the platform takes the press away', () => {
    const {paints, gesture} = run([buttonDown, {kind: 'cancel'}]);
    expect(paints).toEqual(['on', 'none']);
    expect(gesture.phase).toBe('dead');
  });

  it('takes over a surface whose last press is still fading', () => {
    const {paints} = run([buttonDown, {kind: 'up'}, buttonDown]);
    expect(paints).toEqual(['on', 'fading', 'on']);
  });
});

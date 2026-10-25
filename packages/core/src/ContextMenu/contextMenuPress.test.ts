// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPress.test.ts
 * @input vitest, the gesture arena driven by synthetic touches at explicit
 *   timestamps (the gesture tests' harness), ContextMenuPressRecognizer
 * @output The context menu's touch timeline as a state machine: the press is
 *   reported when the finger lands, commits at UIKit's moment and not a
 *   millisecond before, at that moment even when the timer runs late, and
 *   fails on travel past the long-press tolerance, a lift, a second finger or
 *   the browser taking the touch; the commit claims the finger and drops its
 *   click, a press that fails leaves the click alone
 * @position Unit tests of packages/core/src/ContextMenu/contextMenuPress.ts
 */

import {describe, expect, it, vi} from 'vitest';
import {createHarness} from '../gestures/__tests__/harness';
import {contextMenu} from '../motion/uikit/contextMenu';
import {ContextMenuPressRecognizer} from './contextMenuPress';

const COMMIT = contextMenu.press.commitMs;
const DISPLAY = contextMenu.press.menuDisplayMs;

function setup(
  options: ConstructorParameters<typeof ContextMenuPressRecognizer>[0] = {},
) {
  const harness = createHarness();
  const press = new ContextMenuPressRecognizer({name: 'press', ...options});
  const states: string[] = [];
  press.addTransitionListener((recognizer, _from, to) => {
    states.push(`${to}@${recognizer.clockTime}`);
  });
  return {harness, press, states};
}

describe('ContextMenuPressRecognizer', () => {
  it('commits at UIKit’s moment (iOS 26.2: 400 ms, first 60 Hz tick 417 ms), not a millisecond before', () => {
    const {harness, press, states} = setup();
    harness.finger(1).down(100, 200, 1000, {recognizers: [press]});
    harness.advance(1000 + COMMIT - 1);
    expect(press.state).toBe('possible');
    harness.advance(1000 + COMMIT);
    expect(press.state).toBe('began');
    expect(states).toEqual([`began@${1000 + COMMIT}`]);
    expect(COMMIT).toBe(400);
  });

  it('commits at the deadline even when the main thread runs the timer late', () => {
    const {harness, press, states} = setup();
    harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    // Nothing ran until 900 ms (a blocked main thread): the press still
    // began at 400, and the menu was due at 735.
    harness.advance(900);
    expect(states).toEqual([`began@${COMMIT}`, `changed@${DISPLAY}`]);
    expect(press.beganAt).toBe(COMMIT);
  });

  it('reports the press when the finger lands, with its time and place', () => {
    const onPressStart = vi.fn((recognizer: ContextMenuPressRecognizer) => ({
      ...recognizer.press,
    }));
    const {harness, press} = setup({onPressStart});
    harness.finger(1).down(42, 84, 1234.5, {recognizers: [press]});
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressStart.mock.results[0].value).toEqual({
      time: 1234.5,
      x: 42,
      y: 84,
    });
  });

  it('claims the finger at the commit and drops the lift’s click', () => {
    const {harness, press} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    expect(harness.claims).toEqual([]);
    harness.advance(COMMIT);
    expect(harness.claims).toEqual([1]);
    expect(finger.up(COMMIT + 300)).toBe('suppress');
    expect(press.state).toBe('possible');
    expect(press.press).toBeNull();
  });

  it('makes the menu due at 735 ms while the finger stays (changed, isMenuDue)', () => {
    const {harness, press, states} = setup();
    harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(DISPLAY - 1);
    expect(press.isMenuDue).toBe(false);
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(true);
    expect(states).toEqual([`began@${COMMIT}`, `changed@${DISPLAY}`]);
    expect(DISPLAY).toBe(735);
  });

  it('ends at a lift after the commit, before the menu is due (UIKit shows the menu at the lift)', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    expect(finger.up(529)).toBe('suppress');
    harness.advance(DISPLAY + 100);
    expect(states).toEqual([`began@${COMMIT}`, 'ended@529', 'possible@529']);
  });

  it('is cancelled by a drift past the tolerance after the commit, before the menu', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(0, 5, 480); // within: still committed
    finger.move(0, 30, 500); // a 30 px drag at 0.5 s
    expect(states).toEqual([`began@${COMMIT}`, 'changed@480', 'cancelled@500']);
    harness.advance(DISPLAY + 100);
    expect(press.isMenuDue).toBe(false);
  });

  it('lets the finger move freely once the menu is due', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(DISPLAY);
    finger.move(0, 80, DISPLAY + 50);
    finger.up(DISPLAY + 100);
    expect(states).toEqual([
      `began@${COMMIT}`,
      `changed@${DISPLAY}`,
      `changed@${DISPLAY + 50}`,
      `ended@${DISPLAY + 100}`,
      `possible@${DISPLAY + 100}`,
    ]);
  });

  it.each([
    [7, 7],
    [8, 8],
    [10, 0],
    [11, 11],
    [0, -11.5],
  ])('still commits after a drift of (%d, %d) pt, as UIKit does', (dx, dy) => {
    const {harness, press} = setup();
    harness
      .finger(1)
      .down(100, 100, 0, {recognizers: [press]})
      .move(100 + dx, 100 + dy, 100);
    harness.advance(COMMIT);
    expect(press.state).toBe('began');
  });

  it.each([
    [12, 0],
    [0, 12],
    [-11.6, 0],
    [0, -11.6],
  ])(
    'fails on a drift of (%d, %d) pt, past the tolerance on one axis',
    (dx, dy) => {
      const {harness, press, states} = setup();
      harness
        .finger(1)
        .down(100, 100, 0, {recognizers: [press]})
        .move(100 + dx, 100 + dy, 250);
      expect(press.state).toBe('failed');
      harness.advance(COMMIT);
      expect(states).toEqual(['failed@250']);
    },
  );

  it('fails when the finger lifts before the commit, and lets that tap’s click through', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    expect(finger.up(250)).toBe('allow');
    harness.advance(COMMIT);
    expect(states).toEqual(['failed@250', 'possible@250']);
  });

  it('fails on a second finger before the commit', () => {
    const {harness, press} = setup();
    harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.finger(2).down(50, 0, 120, {recognizers: [press]});
    expect(press.state).toBe('failed');
  });

  it('ignores a second finger after the commit', () => {
    const {harness, press} = setup();
    harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    harness.finger(2).down(50, 0, COMMIT + 20, {recognizers: [press]});
    expect(press.state).toBe('began');
  });

  it('fails when the browser takes the finger to scroll', () => {
    const {harness, press, states} = setup();
    harness
      .finger(1)
      .down(0, 0, 0, {recognizers: [press]})
      .takenByBrowser(90);
    // The browser owns the finger now: the recognizer lets go of it at once.
    expect(states).toEqual(['failed@90', 'possible@90']);
  });

  it('keeps the press while it fails, so the feedback knows which one ended', () => {
    const {harness, press} = setup();
    let pressAtFailure: unknown = 'unset';
    press.addTransitionListener((recognizer, _from, to) => {
      if (to === 'failed') {
        pressAtFailure = recognizer.press;
      }
    });
    harness
      .finger(1)
      .down(10, 20, 5, {recognizers: [press]})
      .up(200);
    expect(pressAtFailure).toEqual({time: 5, x: 10, y: 20});
    expect(press.press).toBeNull();
  });

  it('takes a finger or a pen, not a mouse (a mouse opens the menu with its secondary button)', () => {
    const mouse = setup();
    mouse.harness
      .finger(1)
      .down(0, 0, 0, {recognizers: [mouse.press], pointerType: 'mouse'});
    mouse.harness.advance(COMMIT);
    expect(mouse.press.state).toBe('possible');

    const pen = setup();
    pen.harness
      .finger(1)
      .down(0, 0, 0, {recognizers: [pen.press], pointerType: 'pen'});
    pen.harness.advance(COMMIT);
    expect(pen.press.state).toBe('began');
  });
});

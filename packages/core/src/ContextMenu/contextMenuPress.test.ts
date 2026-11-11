// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPress.test.ts
 * @input vitest, the gesture arena driven by synthetic touches at explicit
 *   timestamps (the gesture tests' harness), ContextMenuPressRecognizer
 * @output The context menu's touch timeline as a state machine. The press
 *   commits at UIKit's moment and not a millisecond before, at that moment
 *   even when the timer runs late. It fails on travel past the long-press
 *   tolerance, a lift, a second finger or the browser taking the touch. The
 *   commit claims the finger and drops its click. A press that fails leaves
 *   the click alone. Each press it takes is reported once, at its landing
 * @position Unit tests of packages/core/src/ContextMenu/contextMenuPress.ts
 */

import {describe, expect, it} from 'vitest';
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
    // began at 400. The menu's timer ran late, so it waits 50 ms for moves
    // queued behind the block, and none came.
    harness.advance(900);
    expect(states).toEqual([`began@${COMMIT}`]);
    expect(press.beganAt).toBe(COMMIT);
    harness.advance(950);
    expect(states).toEqual([`began@${COMMIT}`, 'changed@950']);
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

  it('waits at the menu’s moment for moves that came before it but reach the page late, and a drift in them cancels', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    // The page gets a move from 450 ms only at 700 ms: it is behind.
    finger.move(3, 0, 450, undefined, 700);
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(false);
    // A late move that came at 600 ms, 14 px over. The arena holds its time
    // at the clock, and the recognizer reads the time it came with.
    finger.move(14, 0, 600, undefined, DISPLAY + 10);
    expect(states).toEqual([
      `began@${COMMIT}`,
      'changed@450',
      `cancelled@${DISPLAY}`,
    ]);
    expect(press.isMenuDue).toBe(false);
    finger.up(DISPLAY + 300);
  });

  it('shows the menu for a move stamped from its moment on, even past the tolerance, and lets the finger move freely after', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(3, 0, 450, undefined, 700);
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(false);
    // Inside the tolerance at the moment, 14 px over 15 ms after it.
    finger.move(14, 0, DISPLAY + 15, undefined, DISPLAY + 20);
    expect(press.isMenuDue).toBe(true);
    expect(states).toEqual([
      `began@${COMMIT}`,
      'changed@450',
      `changed@${DISPLAY + 15}`,
      `changed@${DISPLAY + 15}`,
    ]);
    finger.up(DISPLAY + 300);
  });

  it('judges each coalesced sample of a late move at its own time while the menu waits', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(3, 0, 450, undefined, 700);
    harness.advance(DISPLAY);
    // One late move with two samples: 13 px at 725 ms, before the moment,
    // then 14 px at 740 ms. Two separate moves would end the hold at the
    // first, so this one does too.
    finger.move(
      14,
      0,
      DISPLAY + 5,
      [{x: 13, y: 0, time: DISPLAY - 10}],
      DISPLAY + 20,
    );
    expect(press.isMenuDue).toBe(false);
    expect(states).toEqual([
      `began@${COMMIT}`,
      'changed@450',
      `cancelled@${DISPLAY + 5}`,
    ]);
  });

  it('shows the waiting menu for a coalesced move whose samples before the moment stay inside the tolerance', () => {
    const {harness, press} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(3, 0, 450, undefined, 700);
    harness.advance(DISPLAY);
    finger.move(
      14,
      0,
      DISPLAY + 5,
      [{x: 10, y: 0, time: DISPLAY - 10}],
      DISPLAY + 20,
    );
    expect(press.isMenuDue).toBe(true);
    finger.up(DISPLAY + 300);
  });

  for (const blockedUntil of [760, 800, 900]) {
    it(`judges a coalesced move from behind a block until ${blockedUntil} ms before the menu shows`, () => {
      const {harness, press, states} = setup();
      const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
      harness.advance(COMMIT);
      // On time until 640 ms. Then the page is blocked past the moment.
      finger.move(3, 0, 640);
      // The finger crossed 11.5 px at 650 ms. Its moves wait behind the block
      // and come as one coalesced move.
      finger.move(
        14,
        0,
        blockedUntil - 5,
        [
          {x: 13, y: 0, time: 650},
          {x: 14, y: 0, time: 700},
        ],
        blockedUntil,
      );
      expect(press.isMenuDue).toBe(false);
      expect(states).toEqual([
        `began@${COMMIT}`,
        'changed@640',
        `cancelled@${blockedUntil - 5}`,
      ]);
    });
  }

  it('shows a still finger’s menu after a block, once no move comes from behind it', () => {
    const {harness, press} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    // The moment's timer runs 65 ms late behind a block.
    harness.advance(DISPLAY, DISPLAY + 65);
    expect(press.isMenuDue).toBe(false);
    harness.advance(DISPLAY + 115);
    expect(press.isMenuDue).toBe(true);
    finger.up(DISPLAY + 300);
  });

  it('shows the menu once the late moves pause for 50 ms', () => {
    const {harness, press} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(3, 0, 450, undefined, 700);
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(false);
    // The wait runs on the arena's clock.
    harness.advance(DISPLAY + 49);
    expect(press.isMenuDue).toBe(false);
    harness.advance(DISPLAY + 50);
    expect(press.isMenuDue).toBe(true);
    finger.up(DISPLAY + 300);
  });

  it('shows the menu at its moment after a move that reached the page on time, with no wait', () => {
    const {harness, press, states} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    // A 3 px shift at 720 ms that the page gets at once: it is not behind.
    finger.move(3, 0, 720);
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(true);
    expect(states).toEqual([
      `began@${COMMIT}`,
      'changed@720',
      `changed@${DISPLAY}`,
    ]);
  });

  it('waits at the menu’s moment when its own timer runs late after a recent move', () => {
    const {harness, press} = setup();
    const finger = harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(COMMIT);
    finger.move(3, 0, 730);
    // The page is busy: the moment's timer runs 40 ms late, so later moves
    // may still be queued.
    harness.advance(DISPLAY, DISPLAY + 40);
    expect(press.isMenuDue).toBe(false);
    // No more moves came: the wait ends 50 ms after the late timer ran.
    harness.advance(DISPLAY + 90);
    expect(press.isMenuDue).toBe(true);
    finger.up(DISPLAY + 300);
  });

  it('shows a still finger’s menu at its moment, with no wait', () => {
    const {harness, press, states} = setup();
    harness.finger(1).down(0, 0, 0, {recognizers: [press]});
    harness.advance(DISPLAY);
    expect(press.isMenuDue).toBe(true);
    expect(states).toEqual([`began@${COMMIT}`, `changed@${DISPLAY}`]);
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

  it('reports the press it takes once, with its touch and the time it landed', () => {
    const {harness, press} = setup();
    const began: [string, number][] = [];
    press.onPressBegan = (touch, time) => {
      began.push([touch.pointerType, time]);
    };
    harness.finger(1).down(10, 20, 5, {recognizers: [press]});
    harness.finger(2).down(50, 0, 120, {recognizers: [press]});
    expect(began).toEqual([['touch', 5]]);
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

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressGesture.test.ts
 * @input vitest, the pure menuPressStep machine
 * @output One test per transition of the press-model state diagram
 * @position Testing; validates menuPressGesture.ts without a browser
 */

import {describe, it, expect} from 'vitest';
import {
  IDLE_MENU_PRESS,
  MENU_PRESS_SETTLE_MS,
  menuPressStep,
  type MenuPressEvent,
  type MenuPressGesture,
} from './menuPressGesture';

type Row = 'A' | 'B';

function run(events: MenuPressEvent<Row>[]) {
  let gesture: MenuPressGesture<Row> = IDLE_MENU_PRESS;
  const effects = [];
  for (const event of events) {
    const step = menuPressStep(gesture, event);
    gesture = step.gesture;
    effects.push(step.effect);
  }
  return {gesture, effects, last: effects[effects.length - 1]};
}

const downInMenu = (
  row: Row | null,
  pointerType: 'mouse' | 'touch' = 'touch',
) => ({type: 'down', target: 'menu', pointerType, row, time: 0}) as const;
const downOnTrigger = (pointerType: 'mouse' | 'touch', time = 0) =>
  ({type: 'down', target: 'trigger', pointerType, row: null, time}) as const;
const move = (row: Row | null, isInMenu = true, time = 10) =>
  ({type: 'move', row, isInMenu, time}) as const;
const up = (
  row: Row | null,
  {
    isInMenu = row != null,
    isOnTrigger = false,
    time = 20,
  }: {isInMenu?: boolean; isOnTrigger?: boolean; time?: number} = {},
) => ({type: 'up', row, isInMenu, isOnTrigger, time}) as const;

describe('menuPressStep — inside the menu', () => {
  it('Idle → Tracking: a pointer down inside the menu highlights the row under it', () => {
    const {gesture, last} = run([downInMenu('A')]);
    expect(gesture.phase).toBe('tracking');
    expect(last).toEqual({type: 'highlight', row: 'A'});
  });

  it('Idle → Tracking: a pointer down over a divider highlights nothing', () => {
    const {gesture, last} = run([downInMenu(null)]);
    expect(gesture.phase).toBe('tracking');
    expect(last).toEqual({type: 'clear'});
  });

  it('Tracking → Tracking: a move onto another row moves the highlight', () => {
    const {last} = run([downInMenu('A'), move('B')]);
    expect(last).toEqual({type: 'highlight', row: 'B'});
  });

  it('Tracking → Tracking: a move over a disabled row or a heading clears the highlight', () => {
    const {last} = run([downInMenu('A'), move(null)]);
    expect(last).toEqual({type: 'clear'});
  });

  it('Tracking → Tracking: a move within the same row changes nothing', () => {
    const {last} = run([downInMenu('A'), move('A')]);
    expect(last).toEqual({type: 'none'});
  });

  it('Tracking → Acted: a release over an enabled row acts on THAT row, not the one pressed', () => {
    const {gesture, last} = run([downInMenu('A'), move('B'), up('B')]);
    expect(last).toEqual({type: 'act', row: 'B'});
    expect(gesture.phase).toBe('idle');
  });

  it('a tap that never left its row acts on that row and swallows nothing else', () => {
    const {last} = run([downInMenu('A'), up('A')]);
    expect(last).toEqual({type: 'act', row: 'A'});
  });

  it('Tracking → Idle: a release over a divider, heading or disabled row acts on nothing and keeps the menu', () => {
    const {last} = run([
      downInMenu('A'),
      move(null),
      up(null, {isInMenu: true}),
    ]);
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Tracking → Released → Idle: a MOUSE released outside acts on nothing and dismisses', () => {
    const {last} = run([
      downInMenu('A', 'mouse'),
      move(null, false),
      up(null, {isInMenu: false}),
    ]);
    expect(last).toEqual({type: 'settle', stray: true, dismiss: true});
  });

  it('Tracking → Released → Idle: a FINGER released outside acts on nothing and leaves the menu open', () => {
    const {last} = run([
      downInMenu('A', 'touch'),
      move(null, false),
      up(null, {isInMenu: false}),
    ]);
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Tracking → Idle: a cancel (scroll, second pointer, browser) acts on nothing', () => {
    const {gesture, last} = run([downInMenu('A'), move('B'), {type: 'cancel'}]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: false, dismiss: false});
  });

  it('ignores a move or a release with no gesture live', () => {
    expect(menuPressStep(IDLE_MENU_PRESS, move('A')).effect).toEqual({
      type: 'none',
    });
    expect(menuPressStep(IDLE_MENU_PRESS, up('A')).effect).toEqual({
      type: 'none',
    });
  });
});

describe('menuPressStep — the trigger', () => {
  it('Idle → Open: a mouse press on the trigger opens the menu at once', () => {
    const {gesture, last} = run([downOnTrigger('mouse')]);
    expect(gesture.phase).toBe('open');
    expect(last).toEqual({type: 'open'});
  });

  it('Idle → TriggerPress: a finger on the trigger opens nothing yet', () => {
    const {gesture, last} = run([downOnTrigger('touch')]);
    expect(gesture.phase).toBe('triggerPress');
    expect(last).toEqual({type: 'none'});
  });

  it('TriggerPress → Idle: a finger that lifts before the delay is a tap; the browser click opens the menu', () => {
    const {gesture, last} = run([
      downOnTrigger('touch'),
      up(null, {isInMenu: false, isOnTrigger: true}),
    ]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: false, dismiss: false});
  });

  it('TriggerPress → Open: the menu opens under a finger held for the delay', () => {
    const {gesture, last} = run([
      downOnTrigger('touch'),
      {type: 'opened', time: 500},
    ]);
    expect(gesture.phase).toBe('open');
    expect(last).toEqual({type: 'none'});
  });

  it('TriggerPress → Idle: a cancel before the delay ends the gesture', () => {
    // The effect has to be a settle, not nothing: a held finger installs a
    // document touchmove preventer for the gesture, and only the end of a
    // gesture takes it back off. Returning `none` here left the page unable
    // to scroll after an interrupted press.
    const {gesture, last} = run([downOnTrigger('touch'), {type: 'cancel'}]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: false, dismiss: false});
  });

  it('Open → Tracking: the pointer moving onto the menu starts tracking from the trigger', () => {
    const {gesture, last} = run([downOnTrigger('mouse'), move('A', true)]);
    expect(gesture).toMatchObject({
      phase: 'tracking',
      origin: 'trigger',
      row: 'A',
    });
    expect(last).toEqual({type: 'highlight', row: 'A'});
  });

  it('Open → Open: a move that stays outside the menu changes nothing', () => {
    const {gesture, last} = run([downOnTrigger('mouse'), move(null, false)]);
    expect(gesture.phase).toBe('open');
    expect(last).toEqual({type: 'none'});
  });

  it('Open → Idle: the opening release before the settle time, without entering, acts on nothing and the menu stays', () => {
    const {gesture, last} = run([
      downOnTrigger('mouse', 0),
      up(null, {
        isInMenu: false,
        isOnTrigger: true,
        time: MENU_PRESS_SETTLE_MS - 1,
      }),
    ]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Open → Acted: a drag from the trigger into the menu that releases over a row acts on it', () => {
    const {last} = run([
      downOnTrigger('mouse', 0),
      move('B', true, 50),
      up('B', {time: 60}),
    ]);
    expect(last).toEqual({type: 'act', row: 'B'});
  });

  it('Open → Acted: after the settle time the opening release acts on the row under it', () => {
    const {last} = run([
      downOnTrigger('mouse', 0),
      up('A', {time: MENU_PRESS_SETTLE_MS}),
    ]);
    expect(last).toEqual({type: 'act', row: 'A'});
  });

  it('Open → Idle: releasing on the trigger after the settle time leaves the menu open', () => {
    const {last} = run([
      downOnTrigger('mouse', 0),
      up(null, {
        isInMenu: false,
        isOnTrigger: true,
        time: MENU_PRESS_SETTLE_MS,
      }),
    ]);
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Open → Released → Idle: a settled mouse release outside dismisses; a finger leaves the menu open', () => {
    expect(
      run([
        downOnTrigger('mouse', 0),
        up(null, {isInMenu: false, time: MENU_PRESS_SETTLE_MS}),
      ]).last,
    ).toEqual({type: 'settle', stray: true, dismiss: true});
    expect(
      run([
        downOnTrigger('touch', 0),
        {type: 'opened', time: 500},
        up(null, {isInMenu: false, time: 500 + MENU_PRESS_SETTLE_MS}),
      ]).last,
    ).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Open → Idle: a cancel while open ends the gesture and keeps the menu', () => {
    // As above: the gesture's document listeners come off, and the menu is
    // left open because a cancelled pointer never asked to close it.
    const {gesture, last} = run([downOnTrigger('mouse'), {type: 'cancel'}]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: false, dismiss: false});
  });
});

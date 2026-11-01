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
  MENU_PRESS_HANDOFF_PX,
  MENU_PRESS_SETTLE_MS,
  menuPressStep,
  menuPressTransition,
  type MenuPressInput,
  type MenuPressState,
} from './menuPressGesture';

type Row = 'A' | 'B';

function run(events: MenuPressInput<Row>[]) {
  let gesture: MenuPressState<Row> = IDLE_MENU_PRESS;
  const effects = [];
  for (const event of events) {
    const step = menuPressTransition(gesture, event);
    gesture = step.gesture;
    effects.push(step.effect);
  }
  return {gesture, effects, last: effects[effects.length - 1]};
}

const downInMenu = (
  row: Row | null,
  pointerType: 'mouse' | 'touch' = 'touch',
) => ({type: 'down', target: 'menu', pointerType, row, time: 0}) as const;
const downOnTrigger = (pointerType: 'mouse' | 'touch' | 'pen', time = 0) =>
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
    expect(menuPressTransition(IDLE_MENU_PRESS, move('A')).effect).toEqual({
      type: 'none',
    });
    expect(menuPressTransition(IDLE_MENU_PRESS, up('A')).effect).toEqual({
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

describe('menuPressStep — a finger that opened the menu hands off after travelling (UIMenu)', () => {
  // UIKit on iOS 26.2: the menu opens under a held finger; the finger picks
  // only once it has moved the handoff distance from the first sample the
  // menu saw. Positions are viewport px.
  const held = (pointerType: 'touch' | 'pen' = 'touch') =>
    [
      downOnTrigger(pointerType, 0),
      {type: 'opened', time: 150},
    ] as MenuPressInput<Row>[];
  const moveTo = (x: number, y: number, row: Row | null = 'A', time = 400) =>
    ({type: 'move', row, isInMenu: row != null, time, x, y}) as const;
  const upAt = (
    x: number,
    y: number,
    row: Row | null = 'A',
    {isInMenu = row != null, isOnTrigger = false, time = 600} = {},
  ) => ({type: 'up', row, isInMenu, isOnTrigger, time, x, y}) as const;

  it('the handoff distance is the one in the UIKit constants table', () => {
    expect(MENU_PRESS_HANDOFF_PX).toBe(10);
  });

  it('Open → Idle: the opening finger lifted without moving picks nothing, however long it rested', () => {
    for (const time of [200, 600, 5000]) {
      const {gesture, last} = run([...held(), upAt(200, 182, 'A', {time})]);
      expect(gesture.phase).toBe('idle');
      expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
    }
  });

  it('Open → Open: the first sample after the open is where the distance counts from', () => {
    const {gesture, last} = run([...held(), moveTo(200, 189)]);
    expect(gesture).toMatchObject({
      phase: 'open',
      handoffFrom: {x: 200, y: 189},
    });
    expect(last).toEqual({type: 'none'});
  });

  it('Open → Open: under the handoff distance nothing is highlighted', () => {
    const {gesture, last} = run([
      ...held(),
      moveTo(200, 189),
      moveTo(200, 189 + MENU_PRESS_HANDOFF_PX - 1),
    ]);
    expect(gesture.phase).toBe('open');
    expect(last).toEqual({type: 'none'});
  });

  it('Open → Tracking: at the handoff distance the highlight follows the finger', () => {
    const {gesture, last} = run([
      ...held(),
      moveTo(200, 189),
      moveTo(200, 189 + MENU_PRESS_HANDOFF_PX, 'B'),
    ]);
    expect(gesture).toMatchObject({
      phase: 'tracking',
      origin: 'trigger',
      row: 'B',
    });
    expect(last).toEqual({type: 'highlight', row: 'B'});
  });

  it('counts from the first sample, not from where the finger was when the menu opened (b4 capture: 7.3 pt, then 11 pt)', () => {
    // The finger rested at y 182 when the menu opened; samples then came at
    // 189.33, 196.67 (14.7 from the open point, 7.3 from the first sample)
    // and 200.33 (11 from the first sample), where UIKit began.
    const samples = [189.33, 196.67, 200.33];
    const phases = samples.map(
      (_, i) =>
        run([...held(), ...samples.slice(0, i + 1).map(y => moveTo(200, y))])
          .gesture.phase,
    );
    expect(phases).toEqual(['open', 'open', 'tracking']);
  });

  it('measures a straight-line distance, as UIMenu does (iOS 26.2: after a 1 pt first step)', () => {
    // UIKit lab: (0, 9) and (7, 7) [9.9] pick nothing; (0, 10), (10, 0) and
    // (9, 9) [12.7] pick.
    const phaseAfter = (dx: number, dy: number) =>
      run([...held(), moveTo(100, 100), moveTo(100 + dx, 100 + dy)]).gesture
        .phase;
    expect(phaseAfter(0, 9)).toBe('open');
    expect(phaseAfter(7, 7)).toBe('open');
    expect(phaseAfter(0, 10)).toBe('tracking');
    expect(phaseAfter(10, 0)).toBe('tracking');
    expect(phaseAfter(9, 9)).toBe('tracking');
    expect(phaseAfter(0, -10)).toBe('tracking');
  });

  it('counts from the first sample, not from where the finger was at the open (iOS 26.2: a 9 pt step, then 3 more, picks nothing)', () => {
    const {gesture, last} = run([
      ...held(),
      moveTo(200, 191),
      moveTo(200, 194),
      upAt(200, 194, 'A'),
    ]);
    expect(gesture.phase).toBe('idle');
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('Open → Tracking → Acted: after the handoff, the lift acts on the row under it', () => {
    const {last} = run([
      ...held(),
      moveTo(200, 189),
      moveTo(200, 230, 'A'),
      moveTo(200, 280, 'B'),
      upAt(200, 292, 'B'),
    ]);
    expect(last).toEqual({type: 'act', row: 'B'});
  });

  it('Open → Idle: a finger that moved under the distance and lifted over a row picks nothing', () => {
    const {last} = run([
      ...held(),
      moveTo(200, 189),
      moveTo(200, 195),
      upAt(200, 195, 'A'),
    ]);
    expect(last).toEqual({type: 'settle', stray: true, dismiss: false});
  });

  it('a pen follows the finger rules', () => {
    expect(run([...held('pen'), upAt(200, 182, 'A')]).last).toEqual({
      type: 'settle',
      stray: true,
      dismiss: false,
    });
  });

  it('a mouse keeps the settle rule: entering the menu tracks at once', () => {
    const {gesture, last} = run([
      downOnTrigger('mouse', 0),
      moveTo(200, 189, 'A', 40),
    ]);
    expect(gesture).toMatchObject({phase: 'tracking', row: 'A'});
    expect(last).toEqual({type: 'highlight', row: 'A'});
    expect(
      run([
        downOnTrigger('mouse', 0),
        upAt(200, 182, 'A', {time: MENU_PRESS_SETTLE_MS}),
      ]).last,
    ).toEqual({type: 'act', row: 'A'});
  });
});

describe('menuPressStep, the released public machine', () => {
  it('keeps the released shapes: no handoff state', () => {
    let gesture = menuPressStep(IDLE_MENU_PRESS, {
      type: 'down',
      target: 'menu',
      pointerType: 'touch',
      row: 'A' as Row,
      time: 0,
    }).gesture;
    gesture = menuPressStep(gesture, {
      type: 'move',
      row: 'B' as Row,
      isInMenu: true,
      time: 10,
    }).gesture;
    const {effect} = menuPressStep(gesture, {type: 'cancel'});
    expect(effect).toEqual({type: 'settle', stray: false, dismiss: false});
    const opened = menuPressStep(
      menuPressStep(IDLE_MENU_PRESS, {
        type: 'down',
        target: 'trigger',
        pointerType: 'touch',
        row: null,
        time: 0,
      }).gesture,
      {type: 'opened', time: 500},
    ).gesture;
    expect(Object.keys(opened).sort()).toEqual(
      ['openedAt', 'phase', 'pointerType'].sort(),
    );
  });
});

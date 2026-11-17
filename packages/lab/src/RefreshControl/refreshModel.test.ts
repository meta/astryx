// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file refreshModel.test.ts
 * @input vitest, refreshModel
 * @output Walks UIRefreshControl's state machine: trigger once with the
 *   finger down, settle targets, cancel, programmatic begin and end, a pull
 *   while refreshing, and no-ops
 * @position Testing; colocated with refreshModel.ts
 */

import {describe, expect, it} from 'vitest';
import {
  INITIAL_REFRESH_STATE,
  reduceRefresh,
  type RefreshEffect,
  type RefreshEvent,
  type RefreshState,
} from './refreshModel';

function run(
  events: ReadonlyArray<RefreshEvent>,
  from: RefreshState = INITIAL_REFRESH_STATE,
): {state: RefreshState; effects: RefreshEffect[]} {
  let state = from;
  const effects: RefreshEffect[] = [];
  for (const event of events) {
    const next = reduceRefresh(state, event);
    state = next.state;
    effects.push(...next.effects);
  }
  return {state, effects};
}

describe('reduceRefresh', () => {
  it('triggers once, with the finger down, when the pull reaches the trigger distance', () => {
    const {state, effects} = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 40, trigger: 74},
      {type: 'pullMove', overscroll: 73.33, trigger: 74},
      {type: 'pullMove', overscroll: 74, trigger: 74},
      {type: 'pullMove', overscroll: 95, trigger: 74},
    ]);
    expect(effects).toEqual([{type: 'trigger'}]);
    expect(state).toEqual({
      isRefreshing: true,
      isPulling: true,
      hasTriggered: true,
    });
  });

  it('settles onto the inset when released while refreshing', () => {
    const {state, effects} = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 80, trigger: 74},
      {type: 'pullEnd'},
    ]);
    expect(effects).toEqual([{type: 'trigger'}, {type: 'settle', to: 'inset'}]);
    expect(state.isPulling).toBe(false);
    expect(state.isRefreshing).toBe(true);
  });

  it('settles back to the top when released below the trigger', () => {
    const {state, effects} = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 50, trigger: 74},
      {type: 'pullEnd'},
    ]);
    expect(effects).toEqual([{type: 'settle', to: 'top'}]);
    expect(state.isRefreshing).toBe(false);
  });

  it('keeps refreshing when a pull that triggered is pushed back before the lift', () => {
    const {state, effects} = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 90, trigger: 74},
      {type: 'pullMove', overscroll: 10, trigger: 74},
      {type: 'pullEnd'},
    ]);
    expect(effects).toEqual([{type: 'trigger'}, {type: 'settle', to: 'inset'}]);
    expect(state.isRefreshing).toBe(true);
  });

  it('settles a cancelled pull like a release', () => {
    expect(
      run([
        {type: 'pullStart'},
        {type: 'pullMove', overscroll: 30, trigger: 74},
        {type: 'pullCancel'},
      ]).effects,
    ).toEqual([{type: 'settle', to: 'top'}]);
    expect(
      run([
        {type: 'pullStart'},
        {type: 'pullMove', overscroll: 99, trigger: 74},
        {type: 'pullCancel'},
      ]).effects,
    ).toEqual([{type: 'trigger'}, {type: 'settle', to: 'inset'}]);
  });

  it('never triggers from movement that no finger is pulling (a momentum overshoot)', () => {
    expect(
      run([{type: 'pullMove', overscroll: 120, trigger: 74}]).effects,
    ).toEqual([]);
  });

  it('never triggers again on a pull while refreshing: one refresh runs at a time', () => {
    const refreshing = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 80, trigger: 74},
      {type: 'pullEnd'},
    ]).state;
    // Far past the trigger, and past it beyond the inset too.
    const far = run(
      [
        {type: 'pullStart'},
        {type: 'pullMove', overscroll: 134, trigger: 74},
        {type: 'pullMove', overscroll: 200, trigger: 74},
        {type: 'pullEnd'},
      ],
      refreshing,
    );
    expect(far.effects).toEqual([{type: 'settle', to: 'inset'}]);
    expect(far.state.isRefreshing).toBe(true);
  });

  it('begins programmatically, calling the handler only for the user’s request', () => {
    expect(run([{type: 'begin', source: 'user'}]).effects).toEqual([
      {type: 'begin', callHandler: true},
    ]);
    expect(run([{type: 'begin', source: 'program'}]).effects).toEqual([
      {type: 'begin', callHandler: false},
    ]);
    // Already refreshing: nothing new starts.
    expect(
      run([
        {type: 'begin', source: 'program'},
        {type: 'begin', source: 'user'},
      ]).effects,
    ).toEqual([{type: 'begin', callHandler: false}]);
  });

  it('ends a running refresh once, and ignores an end with nothing running', () => {
    expect(run([{type: 'end'}]).effects).toEqual([]);
    const {state, effects} = run([
      {type: 'begin', source: 'program'},
      {type: 'end'},
      {type: 'end'},
    ]);
    expect(effects).toEqual([
      {type: 'begin', callHandler: false},
      {type: 'end'},
    ]);
    expect(state.isRefreshing).toBe(false);
  });

  it('ends a refresh under the finger without settling; the lift then settles to the top', () => {
    const {effects} = run([
      {type: 'pullStart'},
      {type: 'pullMove', overscroll: 80, trigger: 74},
      {type: 'end'},
      {type: 'pullEnd'},
    ]);
    expect(effects).toEqual([
      {type: 'trigger'},
      {type: 'end'},
      {type: 'settle', to: 'top'},
    ]);
  });

  it('ignores a release with no pull in progress', () => {
    expect(run([{type: 'pullEnd'}]).effects).toEqual([]);
  });
});

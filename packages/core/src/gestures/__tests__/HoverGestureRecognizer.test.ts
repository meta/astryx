// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HoverGestureRecognizer.test.ts
 * @input Hover entries, moves and exits from a mouse or a hovering pen
 * @output HoverGestureRecognizer's state machine: enter, move and exit
 * @position Unit tests of packages/core/src/gestures/HoverGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';

describe('HoverGestureRecognizer', () => {
  it('begins on enter, changes on move and ends on exit', () => {
    const hover = new HoverGestureRecognizer();
    const states: string[] = [];
    hover.addListener(r => states.push(r.state));
    hover.hoverEntered({x: 1, y: 1}, 'mouse');
    hover.hoverMoved({x: 2, y: 2});
    hover.hoverExited({x: 3, y: 3});
    expect(states).toEqual(['began', 'changed', 'ended']);
    expect(hover.state).toBe('possible');
    expect(hover.claimsTouches).toBe(false);
  });

  it('starts over at the next enter after a hover was cancelled mid-way', () => {
    const hover = new HoverGestureRecognizer();
    const states: string[] = [];
    hover.addListener(r => states.push(r.state));
    hover.hoverEntered({x: 1, y: 1}, 'mouse');
    hover.setEnabled(false);
    hover.setEnabled(true);
    hover.hoverEntered({x: 4, y: 4}, 'mouse');
    expect(states).toEqual(['began', 'cancelled', 'began']);
  });
});

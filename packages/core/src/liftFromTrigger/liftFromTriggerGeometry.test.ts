// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTriggerGeometry.test.ts
 * @input vitest, the lift geometry
 * @output Checks how far a source grows (the cap, the points on its larger
 *   side, the viewport's width), where it lands inside the gutter, and which
 *   side of it a surface takes, in either direction
 * @position Unit tests of packages/core/src/liftFromTrigger/liftFromTriggerGeometry.ts; a
 *   surface's own numbers (UIKit's, for ContextMenu) are tested with it
 */

import {describe, expect, it} from 'vitest';
import {
  liftFromTriggerRect,
  liftFromTriggerScale,
  surfacePlacement,
  type LiftFromTriggerViewport,
} from './liftFromTriggerGeometry';

const RULE = {maxScale: 1.15, scaleUpPoints: 26};
const VIEWPORT: LiftFromTriggerViewport = {
  width: 402,
  height: 874,
  gutter: {top: 82, bottom: 54, inline: 16},
};

describe('liftFromTriggerScale', () => {
  it('caps a small source at the rule’s largest factor', () => {
    expect(liftFromTriggerScale(60, 60, VIEWPORT, RULE)).toBe(1.15);
  });

  it('grows a larger source by the rule’s points on its larger side', () => {
    expect(liftFromTriggerScale(200, 120, VIEWPORT, RULE)).toBeCloseTo(
      226 / 200,
      10,
    );
  });

  it('shrinks a source wider than the viewport less its gutter', () => {
    expect(liftFromTriggerScale(402, 60, VIEWPORT, RULE)).toBeCloseTo(
      370 / 402,
      10,
    );
  });

  it('leaves an empty source alone', () => {
    expect(liftFromTriggerScale(0, 0, VIEWPORT, RULE)).toBe(1);
  });
});

describe('liftFromTriggerRect', () => {
  it('grows about the source’s center', () => {
    const lifted = liftFromTriggerRect(
      {x: 101, y: 400, width: 200, height: 120},
      VIEWPORT,
      RULE,
    );
    expect(lifted.x + lifted.width / 2).toBeCloseTo(201, 10);
    expect(lifted.y + lifted.height / 2).toBeCloseTo(460, 10);
    expect(lifted.width).toBeCloseTo(226, 10);
  });

  it('moves inside the gutter on every edge', () => {
    expect(
      liftFromTriggerRect({x: 4, y: 400, width: 60, height: 60}, VIEWPORT, RULE)
        .x,
    ).toBe(16);
    const right = liftFromTriggerRect(
      {x: 340, y: 400, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    expect(right.x + right.width).toBeCloseTo(386, 10);
    expect(
      liftFromTriggerRect(
        {x: 100, y: 60, width: 60, height: 60},
        VIEWPORT,
        RULE,
      ).y,
    ).toBe(82);
    const bottom = liftFromTriggerRect(
      {x: 100, y: 800, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    expect(bottom.y + bottom.height).toBeCloseTo(820, 10);
  });
});

describe('surfacePlacement', () => {
  const middle = {x: 88, y: 368, width: 226, height: 135.67};

  it('goes below the source, centered, where it fits above the bottom gutter', () => {
    expect(surfacePlacement(middle, 200, VIEWPORT, 16)).toEqual({
      side: 'below',
      alignment: 'center',
    });
  });

  it('goes above where it does not fit below', () => {
    expect(surfacePlacement(middle, 400, VIEWPORT, 16).side).toBe('above');
  });

  it('is flush with the edge the source is held against, and the sides swap in a right-to-left page', () => {
    const atLeft = {...middle, x: 16};
    const atRight = {...middle, x: 386 - middle.width};
    expect(surfacePlacement(atLeft, 200, VIEWPORT, 16).alignment).toBe('start');
    expect(surfacePlacement(atRight, 200, VIEWPORT, 16).alignment).toBe('end');
    const rtl: LiftFromTriggerViewport = {...VIEWPORT, direction: 'rtl'};
    expect(surfacePlacement(atLeft, 200, rtl, 16).alignment).toBe('end');
    expect(surfacePlacement(atRight, 200, rtl, 16).alignment).toBe('start');
  });
});

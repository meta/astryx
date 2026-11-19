// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTriggerGeometry.test.ts
 * @input vitest, the lift geometry
 * @output Checks how far a source grows: the cap, the points on its larger
 *   side and the viewport's width. It also checks that a lifted source never
 *   moves, at an edge too, the box a surface is placed against, and a
 *   surface's side in either direction
 * @position Unit tests of packages/core/src/liftFromTrigger/liftFromTriggerGeometry.ts; a
 *   surface's own numbers (UIKit's, for ContextMenu) are tested with it
 */

import {describe, expect, it} from 'vitest';
import {
  liftFromTriggerRect,
  liftFromTriggerScale,
  surfaceAnchorRect,
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

  it('shrinks a source taller than the viewport less its top and bottom gutters', () => {
    expect(liftFromTriggerScale(300, 900, VIEWPORT, RULE)).toBeCloseTo(
      738 / 900,
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

  it('never moves: a source at any edge grows about its own center, across the gutter if it must', () => {
    const sources = [
      {x: 4, y: 400, width: 60, height: 60},
      {x: 340, y: 400, width: 60, height: 60},
      {x: 100, y: 60, width: 60, height: 60},
      {x: 100, y: 800, width: 60, height: 60},
    ];
    for (const source of sources) {
      const lifted = liftFromTriggerRect(source, VIEWPORT, RULE);
      const detail = JSON.stringify({source, lifted});
      expect(lifted.x + lifted.width / 2, detail).toBeCloseTo(
        source.x + source.width / 2,
        10,
      );
      expect(lifted.y + lifted.height / 2, detail).toBeCloseTo(
        source.y + source.height / 2,
        10,
      );
      expect(lifted.width, detail).toBeCloseTo(69, 10);
    }
    // The left source grows past the inline gutter rather than moving in.
    expect(liftFromTriggerRect(sources[0], VIEWPORT, RULE).x).toBeLessThan(16);
  });

  it('shrinks a source taller than the room between the gutters about its center, without moving it', () => {
    const tall = liftFromTriggerRect(
      {x: 51, y: 0, width: 300, height: 900},
      VIEWPORT,
      RULE,
    );
    expect(tall.height).toBeCloseTo(874 - 82 - 54, 10);
    expect(tall.y + tall.height / 2).toBeCloseTo(450, 10);
  });
});

describe('surfaceAnchorRect', () => {
  it('keeps a lifted source that grew past the gutter inside it on the inline axis only', () => {
    const lifted = liftFromTriggerRect(
      {x: 4, y: 400, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    const box = surfaceAnchorRect(lifted, VIEWPORT);
    expect(box.x).toBe(16);
    expect(box.x + box.width).toBeCloseTo(lifted.x + lifted.width, 10);
    expect(box.y).toBe(lifted.y);
    expect(box.height).toBe(lifted.height);
    const right = liftFromTriggerRect(
      {x: 340, y: 400, width: 60, height: 60},
      VIEWPORT,
      RULE,
    );
    const rightBox = surfaceAnchorRect(right, VIEWPORT);
    expect(rightBox.x).toBeCloseTo(right.x, 10);
    expect(rightBox.x + rightBox.width).toBe(402 - 16);
  });

  it('is the lifted rect itself inside the gutter', () => {
    const lifted = liftFromTriggerRect(
      {x: 101, y: 400, width: 200, height: 120},
      VIEWPORT,
      RULE,
    );
    expect(surfaceAnchorRect(lifted, VIEWPORT)).toEqual(lifted);
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
    const low = {...middle, y: 600};
    expect(surfacePlacement(low, 400, VIEWPORT, 16).side).toBe('above');
  });

  it('with room on neither side and none beside, takes the roomier side, capped a pixel under the room there', () => {
    // 400 px fits neither above (270 px of room) nor below (300.33 px), and
    // a 160 px surface fits beside on neither side (56 px of room each).
    expect(surfacePlacement(middle, 400, VIEWPORT, 16, 160)).toEqual({
      side: 'below',
      alignment: 'center',
      maxBlockSize: 820 - (368 + 135.67) - 16 - 1,
    });
    const high = {...middle, y: 450};
    expect(surfacePlacement(high, 400, VIEWPORT, 16, 160)).toEqual({
      side: 'above',
      alignment: 'center',
      maxBlockSize: 450 - 16 - 82 - 1,
    });
  });

  it('goes beside the source, at the inline end first, where its width fits there', () => {
    const narrow = {x: 16, y: 300, width: 100, height: 500};
    expect(surfacePlacement(narrow, 400, VIEWPORT, 16, 160)).toEqual({
      side: 'end',
      alignment: 'start',
    });
    // The right side is the inline start in a right-to-left page.
    const rtl: LiftFromTriggerViewport = {...VIEWPORT, direction: 'rtl'};
    expect(surfacePlacement(narrow, 400, rtl, 16, 160)).toEqual({
      side: 'start',
      alignment: 'start',
    });
  });

  it('caps a surface beside the source to the room between the block gutters', () => {
    const narrow = {x: 16, y: 300, width: 100, height: 500};
    expect(surfacePlacement(narrow, 900, VIEWPORT, 16, 160)).toEqual({
      side: 'end',
      alignment: 'start',
      maxBlockSize: 874 - 82 - 54 - 1,
    });
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

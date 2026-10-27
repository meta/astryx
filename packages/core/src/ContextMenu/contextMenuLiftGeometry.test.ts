// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuLiftGeometry.test.ts
 * @input vitest, the context-menu constants, and the settled frames of
 *   UIKit's lifted previews measured on iOS 26.2 (iPhone 17 Pro, 402 × 874)
 * @output The lift geometry against UIKit: an icon, a card and a full-width
 *   row lift to UIKit's sizes about the same center, held inside the
 *   viewport's gutter; the menu's side and alignment; and the lift's springs
 *   against UIKit's measured frames
 * @position Unit tests of packages/core/src/ContextMenu/contextMenuLiftGeometry.ts
 */

import {describe, expect, it} from 'vitest';
import {solveSpring, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit';
import {contextMenu} from '../motion/uikit/contextMenu';
import {liftedBox, liftScale, menuPlacement} from './contextMenuLiftGeometry';
import {
  UIKIT_LIFT_FRAMES,
  UIKIT_LIFT_PREVIEW_FROM,
  UIKIT_LIFT_STARTS,
} from './__tests__/uikitLiftFrames';

const {screenInset, verticalMargin} = contextMenu.lift;
/**
 * UIKit's own margins as the gutter (16 pt at the sides, 20 pt plus the safe
 * area at the top and bottom), so the frames below are UIKit's.
 */
const uikitGutter = (safeTop: number, safeBottom: number) => ({
  top: safeTop + verticalMargin,
  bottom: safeBottom + verticalMargin,
  inline: screenInset,
});
const phone = {width: 402, height: 874, gutter: uikitGutter(0, 0)};
/** UIKit rounds the lifted size to device pixels (3× here): half of one. */
const HALF_PIXEL = 1 / 6;

describe('liftScale', () => {
  it('lifts a 60 pt icon to 69 pt (capped at 1.15)', () => {
    expect(60 * liftScale(60, 60, phone)).toBeCloseTo(69, 5);
  });

  it('lifts a 200 × 120 card to 226 × 135.67 (26 pt on its larger side)', () => {
    const scale = liftScale(200, 120, phone);
    expect(200 * scale).toBeCloseTo(226, 5);
    expect(Math.abs(120 * scale - 135.67)).toBeLessThan(HALF_PIXEL);
  });

  it('shrinks a full-width 402 × 60 row to 370 × 55.33 (the screen less 16 pt each side)', () => {
    const scale = liftScale(402, 60, phone);
    expect(402 * scale).toBeCloseTo(370, 5);
    expect(Math.abs(60 * scale - 55.33)).toBeLessThan(HALF_PIXEL);
  });
});

describe('liftedBox', () => {
  it('grows a card about its center, as UIKit’s platter does', () => {
    const box = liftedBox({x: 101, y: 377, width: 200, height: 120}, phone);
    expect(box.x).toBeCloseTo(88, 5);
    expect(box.width).toBeCloseTo(226, 5);
    expect(box.y + box.height / 2).toBeCloseTo(437, 5);
  });

  it('centers a full-width row inside the 16 pt side insets', () => {
    const box = liftedBox({x: 0, y: 300, width: 402, height: 60}, phone);
    expect(box.x).toBeCloseTo(16, 5);
    expect(box.x + box.width).toBeCloseTo(386, 5);
  });

  it('holds a card at the left edge at x 16, and one at the right edge at a right edge of 386', () => {
    expect(
      liftedBox({x: 4, y: 377, width: 200, height: 120}, phone).x,
    ).toBeCloseTo(16, 5);
    const right = liftedBox({x: 198, y: 377, width: 200, height: 120}, phone);
    expect(right.x + right.width).toBeCloseTo(386, 5);
  });

  it('holds a card at the top at y 82 and one at the bottom at a bottom of 820 (UIKit: the safe area and 20 pt)', () => {
    const safe = {...phone, gutter: uikitGutter(62, 34)};
    expect(
      liftedBox({x: 101, y: 70, width: 200, height: 120}, safe).y,
    ).toBeCloseTo(82, 5);
    const bottom = liftedBox({x: 101, y: 700, width: 200, height: 120}, safe);
    expect(bottom.y + bottom.height).toBeCloseTo(820, 5);
  });

  it("holds a card inside the layer runtime's gutter: the safe area itself where it is past 16, plus an app's bar", () => {
    // max(16, safe area) + the app's inset (spec:AST-059), here a 50 px bar.
    const runtime = {...phone, gutter: {top: 62, bottom: 34 + 50, inline: 16}};
    expect(
      liftedBox({x: 101, y: 40, width: 200, height: 120}, runtime).y,
    ).toBeCloseTo(62, 5);
    const bottom = liftedBox(
      {x: 101, y: 700, width: 200, height: 120},
      runtime,
    );
    expect(bottom.y + bottom.height).toBeCloseTo(874 - 84, 5);
  });
});

describe('menuPlacement', () => {
  const safe = {...phone, gutter: uikitGutter(62, 34)};

  it('puts the 3-action menu below the middle card, centered, as UIKit did', () => {
    const box = liftedBox({x: 101, y: 377, width: 200, height: 120}, safe);
    expect(menuPlacement(box, 146, safe)).toEqual({
      side: 'below',
      alignment: 'center',
    });
  });

  it('puts the menu above the bottom card, where it does not fit below', () => {
    const box = liftedBox({x: 101, y: 700, width: 200, height: 120}, safe);
    expect(menuPlacement(box, 146, safe).side).toBe('above');
  });

  it('aligns the menu with the edge a preview is held against', () => {
    const left = liftedBox({x: 4, y: 377, width: 200, height: 120}, safe);
    expect(menuPlacement(left, 146, safe).alignment).toBe('start');
    const right = liftedBox({x: 198, y: 377, width: 200, height: 120}, safe);
    expect(menuPlacement(right, 146, safe).alignment).toBe('end');
  });
});

describe('the lift’s springs against UIKit’s measured frames (iOS 26.2, 200 × 120 card)', () => {
  const at = (
    description: Parameters<typeof toSpring>[0],
    from: number,
    to: number,
    startMs: number,
    ms: number,
  ) =>
    ms <= startMs
      ? from
      : solveSpring(toSpring(description), {from, to}).value(
          (ms - startMs) / 1000,
        );
  const errors = (
    pick: (row: (typeof UIKIT_LIFT_FRAMES)[number]) => number | null,
    model: (ms: number) => number,
  ) =>
    UIKIT_LIFT_FRAMES.flatMap(row => {
      const uikit = pick(row);
      return uikit == null ? [] : [Math.abs(model(row[0]) - uikit)];
    });
  const rms = (e: number[]) =>
    Math.sqrt(e.reduce((sum, x) => sum + x * x, 0) / e.length);

  it('the backdrop fades on springs.contextMenuLift (alpha rms < 0.001)', () => {
    const e = errors(
      row => row[1],
      ms => at(springs.contextMenuLift, 0, 1, UIKIT_LIFT_STARTS.backdrop, ms),
    );
    expect(rms(e)).toBeLessThan(0.001);
    expect(Math.max(...e)).toBeLessThan(0.003);
  });

  it('the preview grows on from the press on springs.contextMenuLift (rms < 0.15 pt)', () => {
    const e = errors(
      row => row[2],
      ms =>
        at(
          springs.contextMenuLift,
          UIKIT_LIFT_PREVIEW_FROM,
          226,
          UIKIT_LIFT_STARTS.previewWidth,
          ms,
        ),
    );
    expect(rms(e)).toBeLessThan(0.15);
    expect(Math.max(...e)).toBeLessThan(0.4);
  });

  it('the menu content fades in on morphSpring (opacity rms < 0.01); its blur is not played, since only transform and opacity move (spec:AST-094 FR5)', () => {
    const morphSpring = springs.contextMenuMorph;
    const opacity = errors(
      row => row[3],
      ms => at(morphSpring, 0, 1, UIKIT_LIFT_STARTS.menuOpacity, ms),
    );
    expect(rms(opacity)).toBeLessThan(0.01);
    expect(Math.max(...opacity)).toBeLessThan(0.03);
  });
});

describe('menuPlacement in a right-to-left page', () => {
  const viewport = {...phone, direction: 'rtl' as const};

  it('keeps the menu flush with the edge the preview is held against: the alignment is logical, so the sides swap', () => {
    const atLeft = {x: 16, y: 300, width: 226, height: 136};
    const atRight = {x: 402 - 16 - 226, y: 300, width: 226, height: 136};
    expect(menuPlacement(atLeft, 150, viewport).alignment).toBe('end');
    expect(menuPlacement(atRight, 150, viewport).alignment).toBe('start');
    expect(
      menuPlacement(atLeft, 150, {...viewport, direction: 'ltr'}).alignment,
    ).toBe('start');
  });
});

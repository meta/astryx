// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.webkithold.fixture.ts
 * @input Two recorded runs of the harness's held-curve proof in Playwright's
 *   WebKit, with a compositor control box. The runner was loaded: 2 CPUs, 4
 *   workers and 2 busy loops.
 * @output `runs`: each run's block, caught animation and set position. Each
 *   run also holds the screencast frames each box was tracked in, as [ms
 *   after the block started, y or x in CSS px]. The curve holds from 114 and
 *   129 ms before the block. WebKit presents it about a frame late, so the
 *   hold first shows 33 to 35 ms after the block began. No frame came in the
 *   113 to 114 ms before it.
 * @position Fixture for busy.control.test.ts
 */

/** WebKit's cast reads positions in 2 px steps (see busy.webkittail.fixture.ts). */
export const step = {x: 2, y: 2};

export interface HeldRun {
  readonly block: {readonly from: number; readonly to: number};
  /** The caught animation: 2000 ms, held from 600 ms to 900 ms. */
  readonly animation: {readonly from: number; readonly to: number};
  /** The hold's position, as the page set it: the box's top plus 100.5 px. */
  readonly setBeforeBlock: number;
  /** The box's frames: [ms, y]. */
  readonly tracked: ReadonlyArray<readonly [number, number]>;
  /** The control's frames: [ms, x]. */
  readonly control: ReadonlyArray<readonly [number, number]>;
}

export const runs: readonly HeldRun[] = [
  {
    block: {from: 0, to: 602},
    animation: {from: -714, to: 1286},
    setBeforeBlock: 140.5,
    tracked: [
      [-958, 40],
      [-861, 40],
      [-707, 40],
      [-585, 40],
      [-446, 62],
      [-312, 84],
      [-202, 108],
      [-89, 126],
      [35, 142],
      [161, 142],
      [315, 142],
      [446, 196],
      [607, 248],
      [739, 318],
      [869, 372],
      [1027, 426],
      [1267, 548],
    ],
    control: [
      [-958, 32],
      [-861, 155],
      [-707, 215],
      [-585, 178],
      [-446, 105],
      [-312, 26],
      [-202, 62],
      [-89, 126],
      [35, 194],
      [161, 214],
      [315, 129],
      [446, 45],
      [607, 33],
      [739, 133],
      [869, 210],
      [1027, 193],
      [1267, 20],
    ],
  },
  {
    block: {from: 0, to: 619},
    animation: {from: -729, to: 1271},
    setBeforeBlock: 140.5,
    tracked: [
      [-1212, 40],
      [-1146, 40],
      [-1048, 40],
      [-953, 40],
      [-852, 40],
      [-729, 40],
      [-584, 40],
      [-449, 64],
      [-319, 88],
      [-199, 110],
      [-95, 130],
      [33, 142],
      [173, 142],
      [322, 142],
      [459, 202],
      [616, 262],
      [762, 326],
      [958, 390],
      [1122, 472],
      [1364, 594],
    ],
    control: [
      [-1212, 17],
      [-1146, 74],
      [-1048, 113],
      [-953, 178],
      [-852, 231],
      [-729, 190],
      [-584, 117],
      [-449, 32],
      [-319, 55],
      [-199, 130],
      [-95, 205],
      [33, 219],
      [173, 135],
      [322, 58],
      [459, 30],
      [616, 116],
      [762, 210],
      [958, 181],
      [1122, 62],
      [1364, 114],
    ],
  },
];

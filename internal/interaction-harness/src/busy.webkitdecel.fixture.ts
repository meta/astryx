// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.webkitdecel.fixture.ts
 * @input One recorded busy-main-thread run of a short coast through a 400 ms
 *   block in Playwright's WebKit, in the CI WebKit lane's container (4 CPUs,
 *   one worker), with a compositor control box
 * @output `step`, the cast's position step; `tracked` and `control`: the screencast frames each was tracked in,
 *   as [ms after the block started, x in CSS px, or null where it was not
 *   found]; `block`: the block's span on the same clock. The coast slows from
 *   about 4.5 px a frame to 1 within five frames on WebKit's 2 px cast: its
 *   frame at +52 ms holds the position before while the control moves 7 px
 *   (10 to 11 on the frames around it), and the next frame catches up 4 px.
 * @position Fixture for busy.test.ts
 */

/**
 * The cast's position step, CSS px: its frames are JPEGs at the viewport's
 * size whose 4:2:0 chroma holds color in 2 by 2 pixel blocks (their frame
 * headers: luma sampled 2x2, both chroma components 1x1).
 */
export const step = {x: 2, y: 2};

export const block = {from: 0, to: 400};

export const tracked: ReadonlyArray<readonly [number, number | null]> = [
  [-87.3, 146],
  [-76.7, 156],
  [-59.8, 156],
  [-49.4, 162],
  [-32.0, 162],
  [-21.5, 172],
  [-4.0, 176],
  [7.0, 180],
  [24.6, 184],
  [35.1, 188],
  [52.4, 188],
  [63.0, 192],
  [80.4, 192],
  [91.1, 194],
  [108.6, 196],
  [119.3, 198],
  [136.7, 198],
  [148.1, 198],
  [165.7, 200],
  [176.3, 200],
  [193.9, 200],
  [204.4, 202],
  [221.2, 202],
  [232.0, 202],
  [248.7, 202],
  [259.4, 202],
  [276.4, 202],
  [287.2, 202],
  [304.0, 202],
  [314.9, 202],
  [331.7, 202],
  [342.5, 202],
  [359.3, 202],
  [369.8, 202],
  [386.5, 202],
  [397.1, 202],
  [414.6, 202],
  [425.3, 202],
  [442.0, 202],
  [452.8, 202],
  [470.0, 202],
  [480.7, 202],
  [498.4, 202],
  [509.3, 202],
  [526.9, 202],
  [537.7, 202],
  [554.4, 202],
];

export const control: ReadonlyArray<readonly [number, number | null]> = [
  [-87.3, 117],
  [-76.7, 128],
  [-59.8, 134],
  [-49.4, 144],
  [-32.0, 150],
  [-21.5, 161],
  [-4.0, 167],
  [7.0, 178],
  [24.6, 184],
  [35.1, 194],
  [52.4, 201],
  [63.0, 212],
  [80.4, 218],
  [91.1, 228],
  [108.6, 235],
  [119.3, 237],
  [136.7, 230],
  [148.1, 220],
  [165.7, 213],
  [176.3, 202],
  [193.9, 196],
  [204.4, 186],
  [221.2, 178],
  [232.0, 169],
  [248.7, 162],
  [259.4, 153],
  [276.4, 146],
  [287.2, 136],
  [304.0, 130],
  [314.9, 120],
  [331.7, 113],
  [342.5, 103],
  [359.3, 96],
  [369.8, 86],
  [386.5, 80],
  [397.1, 70],
  [414.6, 64],
  [425.3, 53],
  [442.0, 46],
  [452.8, 37],
  [470.0, 30],
  [480.7, 20],
  [498.4, 14],
  [509.3, 2],
  [526.9, 6],
  [537.7, 16],
  [554.4, 23],
];

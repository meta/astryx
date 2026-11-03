// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.webkittail.fixture.ts
 * @input One recorded busy-main-thread run of a coast settling through a
 *   400 ms block in Playwright's WebKit, in the CI WebKit lane's container
 *   (4 CPUs, one worker), with a compositor control box
 * @output `step`, the cast's position step; `tracked` and `control`: the screencast frames each was tracked in,
 *   as [ms after the block started, x in CSS px, or null where it was not
 *   found]; `block`: the block's span on the same clock. WebKit's cast reports
 *   positions in 2 px steps, so the coast's tail shows plateaus of a frame or
 *   two within a few px of rest while the control keeps moving.
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
  [-91.9, 140],
  [-79.3, 146],
  [-64.3, 156],
  [-51.4, 156],
  [-35.8, 170],
  [-23.3, 176],
  [-7.8, 182],
  [4.1, 188],
  [20.4, 192],
  [31.1, 196],
  [48.3, 200],
  [59.3, 202],
  [76.2, 204],
  [87.0, 208],
  [103.9, 210],
  [115.4, 212],
  [131.9, 212],
  [142.8, 214],
  [159.5, 214],
  [170.3, 216],
  [187.2, 216],
  [197.6, 216],
  [214.9, 216],
  [225.1, 218],
  [242.5, 218],
  [253.2, 218],
  [270.1, 218],
  [281.6, 218],
  [297.4, 218],
  [309.3, 218],
  [325.8, 218],
  [337.3, 218],
  [353.8, 218],
  [364.7, 218],
  [382.0, 218],
  [392.3, 218],
  [409.4, 218],
  [419.7, 218],
  [436.6, 218],
  [446.9, 218],
  [464.2, 218],
  [474.6, 220],
  [491.5, 220],
  [502.4, 220],
  [519.8, 220],
  [530.3, 220],
  [547.9, 220],
];

export const control: ReadonlyArray<readonly [number, number | null]> = [
  [-91.9, 96],
  [-79.3, 105],
  [-64.3, 112],
  [-51.4, 121],
  [-35.8, 129],
  [-23.3, 138],
  [-7.8, 146],
  [4.1, 155],
  [20.4, 162],
  [31.1, 172],
  [48.3, 178],
  [59.3, 189],
  [76.2, 194],
  [87.0, 206],
  [103.9, 212],
  [115.4, 222],
  [131.9, 229],
  [142.8, 238],
  [159.5, 236],
  [170.3, 226],
  [187.2, 220],
  [197.6, 210],
  [214.9, 204],
  [225.1, 193],
  [242.5, 187],
  [253.2, 177],
  [270.1, 170],
  [281.6, 160],
  [297.4, 153],
  [309.3, 144],
  [325.8, 137],
  [337.3, 126],
  [353.8, 120],
  [364.7, 110],
  [382.0, 103],
  [392.3, 93],
  [409.4, 87],
  [419.7, 76],
  [436.6, 70],
  [446.9, 60],
  [464.2, 54],
  [474.6, 44],
  [491.5, 37],
  [502.4, 27],
  [519.8, 21],
  [530.3, 10],
  [547.9, 4],
];

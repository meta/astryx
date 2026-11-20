// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What is wrong with the radius scale a theme gives, judged by what
 *       Core builds from it.
 * @input A theme's raw `radius` input.
 * @output radiusInputProblems(): each problem, by its path.
 * @position Shared by the editor, which refuses each problem, and by theme
 *           build, which warns it at its line: one judge for one file, as
 *           typography-values.mjs is for the typography block.
 */

import {UNREAD} from './typography-values.mjs';

/** @param {unknown} value */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** What each field of the radius scale is, for the line that adds it. */
const FIELDS = /** @type {const} */ ({
  base: 'the step in pixels, such as radius: {base: 4, multiplier: …}',
  multiplier:
    'how far each step is scaled, such as radius: {base: …, multiplier: 1}',
});

/**
 * Every problem in a theme's own radius scale: Core multiplies the base by
 * the multiplier for each corner token, so a scale with no base or no
 * multiplier, or one that is no number, builds every scaled corner as
 * NaNpx, which the browser drops (the corners go square). A falsy radius
 * (0, '', false) Core skips: it builds no corner token, and the base's
 * corners stay.
 * @param {unknown} radius the raw `radius` input
 * @returns {Array<{path: string[], why: string, value: unknown}>}
 */
export function radiusInputProblems(radius) {
  /** @type {Array<{path: string[], why: string, value: unknown}>} */
  const out = [];
  // A value the source reader could not read is never judged as missing.
  if (radius == null || radius === UNREAD) return out;
  if (!radius) {
    out.push({
      path: ['radius'],
      why: `Core skips a radius of ${JSON.stringify(radius) ?? String(radius)} and builds no corner token from it, so the theme keeps its base theme's corners; for square corners give radius: {base: 0, multiplier: 1}`,
      value: radius,
    });
    return out;
  }
  if (!isBlock(radius)) {
    out.push({
      path: ['radius'],
      why: `radius is a block of a base and a multiplier, such as radius: {base: 4, multiplier: 1}, and Core reads ${JSON.stringify(radius) ?? String(radius)} as one with neither, so it builds every scaled corner as NaNpx, which the browser drops`,
      value: radius,
    });
    return out;
  }
  const r = /** @type {Record<string | symbol, unknown>} */ (radius);
  for (const field of /** @type {const} */ (['base', 'multiplier'])) {
    const value = r[field];
    if (value === UNREAD) continue;
    if (value === undefined && !r[UNREAD])
      out.push({
        path: ['radius'],
        why: `the radius scale is given no ${field}, and Core builds each corner from the base and the multiplier together, so every scaled corner is NaNpx, which the browser drops (the corners go square): add ${FIELDS[field]}`,
        value: radius,
      });
    // (Core multiplies what it is given: a boolean counts as 1 or 0.)
    else if (value !== undefined && !Number.isFinite(Number(value)))
      out.push({
        path: ['radius', field],
        why: `the radius scale's ${field} is a number, and Core builds every scaled corner from ${JSON.stringify(value) ?? String(value)} as NaNpx, which the browser drops: give ${FIELDS[field]}`,
        value,
      });
  }
  return out;
}

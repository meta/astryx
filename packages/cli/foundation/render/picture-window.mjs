// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The window the editor's pictures are taken in.
 * @input None.
 * @output `PICTURE_WINDOW`: its width and height in CSS pixels;
 *   `desktopMatches(query)`: whether a media query matches there.
 * @position Read by the picture scripts (picture-chrome.mjs,
 *   picture-playwright.mjs), which open the browser at this size, by the
 *   layer drawing (layers.mjs), which answers media queries for it, and by
 *   the stylesheet cut (css-cut.mjs), so a part drawn open or in a state
 *   lays out as the picture shows it.
 */

export const PICTURE_WINDOW = Object.freeze({width: 1280, height: 900});

/** The pointer of the window a picture is taken in. */
const DESKTOP_POINTER = Object.freeze({
  pointer: 'fine',
  'any-pointer': 'fine',
  hover: 'hover',
  'any-hover': 'hover',
});

/** CSS pixels in an em or a rem, at the browser's default font size. */
const EM_PX = 16;

/**
 * A length in a media query, in CSS pixels; NaN for one it cannot read.
 * @param {string} text
 * @returns {number}
 */
function mediaLength(text) {
  const m = /^\s*(-?[\d.]+)\s*(px|r?em)?\s*$/i.exec(text);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] && /em/i.test(m[2]) ? EM_PX : 1);
}

/**
 * How the picture's window answers the features a display mode sets: no
 * forced colors (a high-contrast mode), no contrast preference, colors not
 * inverted, a color screen. Each is the feature's off value, so a bare
 * `(name)` never holds in the window.
 */
const DESKTOP_DISPLAY = Object.freeze({
  'forced-colors': 'none',
  'prefers-contrast': 'no-preference',
  'inverted-colors': 'none',
  monochrome: '0',
});

/**
 * Whether one feature of a media query holds in the picture's window: its
 * width and height (with min- and max-, or a range), its orientation, a
 * mouse for the pointer, and its display (DESKTOP_DISPLAY). Null for a
 * feature the window does not judge (motion, the color scheme).
 * @param {string} feature what the parentheses hold
 * @returns {boolean | null}
 */
function featureHolds(feature) {
  const {width, height} = PICTURE_WINDOW;
  /** @type {Record<string, number>} */
  const size = {width, height};
  const plain = /^\s*([a-z-]+)\s*(?::\s*(.*?))?\s*$/i.exec(feature);
  if (plain) {
    const [, name, value] = plain;
    const pointer = /** @type {Record<string, string>} */ (DESKTOP_POINTER)[
      name
    ];
    if (pointer != null) return value == null || value.trim() === pointer;
    const display = /** @type {Record<string, string>} */ (DESKTOP_DISPLAY)[
      name
    ];
    if (display != null) return value != null && value.trim() === display;
    if (name === 'orientation')
      return (
        value == null ||
        value.trim() === (width >= height ? 'landscape' : 'portrait')
      );
    const dim = /^(min-|max-)?(width|height)$/.exec(name);
    if (!dim) return null;
    if (value == null) return true;
    const at = mediaLength(value);
    if (Number.isNaN(at)) return null;
    const own = size[dim[2]];
    return dim[1] === 'min-'
      ? own >= at
      : dim[1] === 'max-'
        ? own <= at
        : own === at;
  }
  // A range: `width < 640px`, `640px <= width`, `400px < width <= 700px`.
  const parts = feature.split(/(<=|>=|<|>|=)/).map(x => x.trim());
  const at = parts.findIndex(x => x === 'width' || x === 'height');
  if (at < 0) return null;
  const own = size[parts[at]];
  /** @param {number} a @param {string} op @param {number} b */
  const holds = (a, op, b) =>
    op === '<'
      ? a < b
      : op === '<='
        ? a <= b
        : op === '>'
          ? a > b
          : op === '>='
            ? a >= b
            : a === b;
  let ok = true;
  if (at >= 2) {
    const v = mediaLength(parts[at - 2]);
    if (!Number.isNaN(v)) ok &&= holds(v, parts[at - 1], own);
  }
  if (at + 2 < parts.length) {
    const v = mediaLength(parts[at + 2]);
    if (!Number.isNaN(v)) ok &&= holds(own, parts[at + 1], v);
  }
  return ok;
}

/**
 * Whether a media query matches in the window a picture is taken in
 * (PICTURE_WINDOW, a desktop's, with a mouse): each comma-separated query
 * matches when its media type is the screen's and every feature holds
 * (featureHolds); `not` turns it round. A feature the window does not judge
 * holds, as in the chart document (no motion); with `sure`, a query that
 * holds one never matches, so only what the window answers counts.
 * @param {string} query
 * @param {{sure?: boolean}} [options]
 * @returns {boolean}
 */
export function desktopMatches(query, {sure = false} = {}) {
  return String(query)
    .split(',')
    .some(part => {
      const type = /^\s*(?:not\s+|only\s+)?([a-z]+)\s*(?:and\b|$)/i.exec(
        part,
      )?.[1];
      const screen = type == null || !/^(print|speech)$/i.test(type);
      const answers = [...part.matchAll(/\(([^()]*)\)/g)].map(([, feature]) =>
        featureHolds(feature),
      );
      if (sure && answers.includes(null)) return false;
      const all = screen && answers.every(a => a !== false);
      return /^\s*not\s/.test(part) ? !all : all;
    });
}

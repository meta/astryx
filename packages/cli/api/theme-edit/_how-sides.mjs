// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border's sides said in a list ("a border on top and sides") and a
 * border color written one per side (`#eee #eee #ddd`), as the how reader
 * reads them.
 * @position api/theme-edit — a leaf read by _how-question.mjs
 */

import {parseColor} from './_color.mjs';

/**
 * The sides of one part's border said in a list joined as one ask: "a
 * border on top and sides", "the left and right edges", "a #ddd border on
 * top, left and right" (`top & left & right`), so no list or clause split
 * takes a side away. Only in a clause that names a border, an edge or an
 * outline: a list of padding sides is the spacing reader's.
 * @param {string} q
 * @returns {string}
 */
export function joinSideLists(q) {
  // ("above and below" are the top and the bottom.)
  const SIDE = String.raw`(?:top|bottom|left|right|sides|above|below)`;
  return q.replace(
    new RegExp(
      // (Each side may take its own "on" and "the": "the top and the
      // bottom", "on the left and on the right".)
      String.raw`\b${SIDE}(?:(?:\s*,\s*and\s+|\s*,\s*|\s+and\s+)(?:on\s+)?(?:the\s+)?${SIDE}\b)+`,
      'gi',
    ),
    (m, at, all) => {
      // (The list's own clause: from the comma, semicolon or full stop
      // before it to the one after it.)
      const text = String(all);
      const from =
        Math.max(
          text.lastIndexOf(',', at - 1),
          text.lastIndexOf(';', at - 1),
          text.lastIndexOf('.', at - 1),
        ) + 1;
      const after = text.slice(at + m.length).search(/[,;]|\.(?:\s|$)/);
      const clause = text.slice(
        from,
        after < 0 ? undefined : at + m.length + after,
      );
      // (The list is the border's when the look it follows is a border,
      // "a border on top and sides", or a border follows it, "top and
      // bottom borders"; "a border and padding top and bottom 6px" lists
      // the padding's sides.)
      const before = clause
        .slice(0, at - from)
        .match(
          /\b(?:borders?|bordered|edges?|outlines?|lines?|padding|margins?|spacing|gaps?|radius|corners?|space)\b/gi,
        );
      const owner = before?.at(-1) ?? '';
      // (A look said right after the list is its own: "a border and top
      // and bottom padding 6px" lists the padding's sides, and the clause
      // keeps both.)
      const next = text.slice(at + m.length).match(/^\s*([a-z]+)/i)?.[1] ?? '';
      const nextLook =
        /^(?:borders?|edges?|outlines?|lines?|padding|margins?|spacing|gaps?|radius|corners?|space)$/i.test(
          next,
        );
      // (Only a border's or a padding's sides are listed: "corners on top
      // and bottom" are every corner, read by the corner reader.)
      const sided =
        /^(?:borders?|bordered|edges?|outlines?|lines?|padding|margins?|spacing|space)$/i;
      // (A comma or an "and" before the last side, with a look after it
      // and another before the list, ends the first item there: "a border
      // on top and bottom padding 8px" is the border's top and the
      // padding's bottom. The sides before that comma are the earlier look's.)
      const lastComma =
        /(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:on\s+)?(?:the\s+)?[a-z]+$/i.exec(m);
      // (Only a list said as where the earlier look goes, "on top", "along
      // the top", "on its top", or right after it, "border top": "a border and top and bottom padding 6px"
      // lists the padding's sides.)
      const placed =
        /\b(?:on|at|along|across|around|over|down|by)(?:\s+(?:the|its|their))?\s*$/i.test(
          text.slice(0, at),
        ) ||
        /\b(?:borders?|bordered|edges?|outlines?|lines?|padding|margins?|spacing|space|shadows?|glows?|gradients?|underlines?|corners?|text|bold|uppercase)\s*$/i.test(
          text.slice(0, at),
        );
      // (Whatever look came before, a shadow or a glow too: only a border's
      // or a spacing's sides are joined.)
      // (Corners said on a side, "rounded corners on the left", are the
      // corner reader's: the list stays as said.)
      if (/^(?:corners?|radius)$/i.test(owner)) return m;
      // (A width, style or color between the look and the side, "border
      // 1px top, bottom padding 8px", is read as it always was: the list
      // stays as said.)
      if (
        /\b(?:borders?|edges?|outlines?|lines?|padding|margins?)(?:\s+(?!(?:top|bottom|left|right|sides|above|below|and|or|on|at|along|across|around|over|down|by|the|its|their|with|of|to)\b)[#\w.%()-]+)+\s*$/i.test(
          text.slice(0, at),
        )
      )
        return m;
      if (nextLook && placed && lastComma) {
        const head = m.slice(0, lastComma.index);
        const joinedHead = sided.test(owner)
          ? head.replace(
              /\s*,\s*(?:and\s+)?(?:on\s+)?(?:the\s+)?|\s+and\s+(?:on\s+)?(?:the\s+)?/gi,
              ' & ',
            )
          : head;
        return joinedHead + m.slice(lastComma.index);
      }
      // (Any look's list is kept whole, "top and bottom padding 6px", so
      // each side said takes the look: the border reader and the padding
      // reader each read the sides.)
      const look = nextLook ? sided.test(next) : sided.test(owner);
      return look
        ? m.replace(
            /\s*,\s*(?:and\s+)?(?:on\s+)?(?:the\s+)?|\s+and\s+(?:on\s+)?(?:the\s+)?/gi,
            ' & ',
          )
        : m;
    },
  );
}

/**
 * A border color written one per side, as CSS writes it (`#eee #eee #ddd`,
 * `rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)`): two to four written
 * colors (hex or a color function) with nothing but spaces between them,
 * as typed; null for a clause without one, or with more than four.
 * @param {string} text a clause, as typed
 * @returns {string[] | null}
 */
export function sideColorsIn(text) {
  const lower = text.toLowerCase();
  // (A CSS keyword color in the run, "#ddd #ddd transparent", "white", is
  // one of its sides, as typed; a run needs one written color, a hex or a
  // color function, so a list of color words is never read as sides.)
  const written = [
    ...lower.matchAll(
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|\b[a-z]+\b/g,
    ),
  ]
    .map(m => /** @type {[number, string]} */ ([m.index ?? 0, m[0]]))
    .filter(
      ([, v]) =>
        /^[#a-z]/.test(v) &&
        (v === 'transparent' || v === 'currentcolor' || parseColor(v) != null),
    );
  for (let i = 0; i < written.length;) {
    let j = i;
    while (
      j + 1 < written.length &&
      /^\s+$/.test(
        lower.slice(written[j][0] + written[j][1].length, written[j + 1][0]),
      )
    )
      j++;
    const run = written.slice(i, j + 1);
    // (A color word that names the next look, "#dddddd white background",
    // is that look's color, never a side of the run.)
    while (
      run.length &&
      /^[a-z]+$/.test(run[run.length - 1][1]) &&
      /^\s+(?:backgrounds?|bg|fills?|text|fonts?|colou?rs?|links?|headings?|titles?|labels?|icons?|accents?)\b/.test(
        lower.slice(run[run.length - 1][0] + run[run.length - 1][1].length),
      )
    )
      run.pop();
    if (run.length >= 2 && run.some(([, v]) => /^#|\(/.test(v)))
      return run.length > 4
        ? null
        : run.map(([at, v]) => text.slice(at, at + v.length));
    i = j + 1;
  }
  return null;
}

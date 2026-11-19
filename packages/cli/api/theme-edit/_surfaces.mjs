// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a part draws, read from the part census alone: the indicator
 * lines, the boxes drawn only when selected, the surfaces whose border the
 * shared border tokens never reach, and the dividers. Shared by the checks,
 * the build and the missed list, so each reads one answer.
 *
 * @position api/theme-edit — census readings
 */

import {FAMILIES} from './_tables.mjs';

/**
 * The lines a part draws as an indicator, by the census: a part with no
 * parts inside and one side of a fixed size of a few pixels at rest, the
 * other following what it marks (no fixed size), that shows a state: its
 * fill only when selected (a tab's underline) or its length taken from an
 * anchor (an outline's bar). Each with the side that is its thickness.
 * @param {any} C the part census
 * @returns {Array<{part: string, side: 'height' | 'width'}>}
 */
export function indicatorLines(C) {
  /** @type {Array<{part: string, side: 'height' | 'width'}>} */
  const out = [];
  for (const pt of Object.keys(C.MAP)) {
    if ((C.MAP[pt]?.contains ?? []).length) continue;
    const fills = C.partReads(pt, 'background') ?? [];
    if (!fills.length) continue;
    const at = C.MAP[pt]?.at ?? {};
    const selectedOnly = fills.every((/** @type {{when: string[]}} */ r) =>
      r.when.every(w => /selected=selected/.test(w)),
    );
    const anchored = Object.values(at)
      .flatMap(v => Object.values(/** @type {Record<string, unknown>} */ (v)))
      .some(v => /anchor-size\(/.test(String(v)));
    if (!selectedOnly && !anchored) continue;
    /** @param {string} side */
    const fixedPx = side =>
      Object.entries(at[side] ?? {})
        .filter(([sel]) => !/:/.test(sel))
        .map(([, v]) => /^\s*(\d*\.?\d+)px\s*$/.exec(String(v))?.[1])
        .find(px => px != null);
    for (const side of /** @type {const} */ (['height', 'width'])) {
      const px = fixedPx(side);
      const other = fixedPx(side === 'height' ? 'width' : 'height');
      if (px != null && Number(px) > 0 && Number(px) <= 4 && other == null) {
        out.push({part: pt, side});
        break;
      }
    }
  }
  return out;
}

/**
 * The parts that draw a box only when selected (a nav item's or a
 * segment's fill in its selected state, none at rest) and no border: a
 * border for them goes on that state. An indicator line and a table row
 * (its cells draw the rules) are none.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function selectedBoxes(C) {
  const lines = new Set(indicatorLines(C).map(x => x.part));
  const dividers = new Set(dividerParts(C));
  return Object.keys(C.MAP).filter(pt => {
    if (lines.has(pt)) return false;
    // A row of a table: its cells draw the rules between rows.
    if (
      (C.MAP[pt]?.contains ?? []).some((/** @type {string} */ c) =>
        dividers.has(c),
      )
    )
      return false;
    const fills = C.partReads(pt, 'background') ?? [];
    // A press or hover state written as an attribute is no resting fill.
    const atRest = fills.some((/** @type {{when: string[]}} */ r) =>
      r.when.some(w => !/:|selected|\[/.test(w)),
    );
    const selected = fills.some(
      (/** @type {{token: string, when: string[]}} */ r) =>
        /^--color-(?!overlay)/.test(r.token) &&
        r.when.some(w => /selected=selected/.test(w) && !/:/.test(w)),
    );
    const bordered = (C.partReads(pt, 'border') ?? []).some(
      (/** @type {{token: string}} */ r) =>
        r.token === '--border-width' || /^--color-border/.test(r.token),
    );
    return selected && !atRest && !bordered;
  });
}

/**
 * The surfaces whose border the shared border tokens never reach, as the
 * census reads them: the containers, menus and overlays (a part with an
 * elevation shadow, or one the layer runtime places: a tooltip), a framed
 * surface (container or element corners and a fill around other parts: a
 * banner, a segmented control), a label box (an inline box with a fill
 * and room around its label: a badge, a token), and every part that draws a fixed line of its own at rest (a popover's 1px,
 * a secondary button's edge), whose border reads no border width or
 * border color token. --border-width does not widen any of them. A family
 * member the census does not record is kept.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function borderlessSurfaces(C) {
  const rest = (/** @type {{when: string[]}} */ r) =>
    r.when.some(w => !/:|selected/.test(w));
  /** Whether the layer runtime places the part (its sizes read the layer's inset). @param {string} pt */
  const layered = pt =>
    Object.values(C.MAP[pt]?.own ?? {}).some((/** @type {any} */ x) =>
      (x?.values ?? []).some((/** @type {unknown} */ v) =>
        /--astryx-layer-/.test(String(v)),
      ),
    );
  /** A box with container or element corners and a fill around other parts (a banner, a segmented control). @param {string} pt */
  const framed = pt =>
    (C.partReads(pt, 'corners') ?? []).some(
      (/** @type {any} */ r) =>
        /^--radius-(?:container|element)$/.test(r.token) && rest(r),
    ) &&
    (C.partReads(pt, 'background') ?? []).some(rest) &&
    (C.MAP[pt]?.contains ?? []).length > 0;
  /** The values a part sets at rest. @param {string} pt @param {string} k */
  const atRest = (pt, k) =>
    Object.entries(C.MAP[pt]?.at?.[k] ?? {})
      .filter(([sel]) => !/:/.test(sel))
      .map(([, v]) => String(v));
  // A part that draws its box only when selected takes its border there.
  const selectedOnly = new Set(selectedBoxes(C));
  /** An inline box with a fill and room inside it around its label (a badge, a token). @param {string} pt */
  const labelBox = pt =>
    !selectedOnly.has(pt) &&
    atRest(pt, 'display').some(v => /^inline-(?:flex|block)$/.test(v.trim())) &&
    [...atRest(pt, 'padding-inline'), ...atRest(pt, 'padding')].some(
      v => !/^\s*0(?:px)?\s*$/.test(v),
    ) &&
    (C.partReads(pt, 'background') ?? []).some(rest);
  /** A line of a fixed width at rest (not a token, not 0). @param {string} pt */
  const fixedLine = pt =>
    Object.entries(C.MAP[pt]?.at ?? {}).some(
      ([k, v]) =>
        /^border(-[a-z-]+)?-width$/.test(k) &&
        Object.entries(/** @type {Record<string, unknown>} */ (v)).some(
          ([sel, w]) =>
            !/:/.test(sel) &&
            !/^\s*0(?:px)?\s*$/.test(String(w)) &&
            !/var\(/.test(String(w)),
        ),
    );
  const candidates = new Set([
    ...(FAMILIES.containers ?? []),
    ...(FAMILIES.menus ?? []),
    ...Object.keys(C.MAP).filter(
      pt =>
        layered(pt) ||
        framed(pt) ||
        labelBox(pt) ||
        fixedLine(pt) ||
        (C.partReads(pt, 'shadow') ?? []).some(
          (/** @type {any} */ r) => /^--shadow-/.test(r.token) && rest(r),
        ),
    ),
  ]);
  // (A line on some sides only, a grouped button's join with the one before
  // it, is no box of the part's own.)
  return [...candidates].filter(
    pt =>
      !(C.partReads(pt, 'border') ?? []).some(
        (/** @type {{token: string, props?: string[]}} */ r) =>
          (r.token === '--border-width' || /^--color-border/.test(r.token)) &&
          (r.props ?? ['border']).some(
            p =>
              !/^border-(top|bottom|left|right|(inline|block)(-(start|end))?)-/.test(
                p,
              ),
          ),
      ),
  );
}

/**
 * The parts that draw a divider with the shared border width: one side's
 * border (a table cell's bottom rule) or an inner line (a divider's), not
 * a box around the part nor an edge of a cornered box (a list row's). A wider --border-width makes their rules heavy.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function dividerParts(C) {
  return Object.keys(C.MAP).filter(pt => {
    const at = C.MAP[pt]?.at ?? {};
    /** @param {string} k */
    const reads = k =>
      Object.values(at[k] ?? {}).some(v => /--border-width/.test(String(v)));
    if (reads('border-width')) return false;
    const sides = Object.keys(at).filter(
      k => /^border-[a-z-]+-width$/.test(k) && reads(k),
    );
    const inner = (C.MAP[pt]?.inside?.['--border-width'] ?? []).some(
      (/** @type {string} */ p) =>
        /^(height|width|block-size|inline-size)$/.test(p),
    );
    // A rule, not a box: a part with corners of its own (a list row, a
    // button) draws an edge of the box it is.
    const cornered = (C.partReads(pt, 'corners') ?? []).some(
      (/** @type {{token: string}} */ r) => /^--radius-/.test(r.token),
    );
    return !cornered && (sides.length === 1 || (!sides.length && inner));
  });
}

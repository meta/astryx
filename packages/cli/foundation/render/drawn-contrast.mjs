// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text a picture's page draws too faint to read, measured in the
 *   page.
 * @input None: `lowContrastText` runs in the page the picture is taken of.
 * @output `lowContrastText`: each text the browser draws under the contrast
 *   text needs (4.5:1, or 3:1 when large), with the part it sits in and the
 *   two colors as drawn; `LOW_CONTRAST_PREFIX`, the line prefix a picture
 *   script prints it after.
 * @position run by picture-chrome.mjs and picture-playwright.mjs once the
 *   page is drawn as the picture shows it; read back by `takePictures` in
 *   foundation/pictures/pictures.mjs from the script's stdout
 */

/* global document, getComputedStyle -- lowContrastText runs in the page */

/** The line prefix a picture script prints the measurement after. */
export const LOW_CONTRAST_PREFIX = 'astryx-low-contrast:';

/**
 * Each text the page draws too faint to read: its own color, composited
 * over what is drawn behind it (the fills of the boxes around it, from the
 * page up), under 4.5:1, or 3:1 for large text (24px, or 18.66px bold).
 * Text that is not drawn (no box, hidden), text in a disabled control or
 * under a box drawn see-through (a disabled look), text in the theme's
 * disabled or placeholder color (which needs no 4.5:1), and text over an
 * image, a picture, a gradient between colors or a layer that covers only
 * part of its box (no one color behind it) are left out. A flat tint over
 * the whole box (a pressed state's one-color gradient) is a fill. `part` is
 * the nearest Astryx part the text sits in (its `astryx-<part>` class); text in
 * no part (a sheet's own labels) is left out. One entry for each part,
 * text and pair of colors.
 * Runs in the page: it uses nothing from outside its own body.
 * @returns {Array<{part: string, text: string, ratio: number, fg: string, bg: string}>}
 */
export function lowContrastText() {
  /** @param {string} v @returns {[number, number, number, number] | null} */
  const rgba = v => {
    const m =
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
        v.trim(),
      );
    const c =
      /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
        v.trim(),
      );
    /** @param {string | undefined} a */
    const alpha = a =>
      a == null
        ? 1
        : a.endsWith('%')
          ? Number(a.slice(0, -1)) / 100
          : Number(a);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), alpha(m[4])];
    if (c)
      return [
        Number(c[1]) * 255,
        Number(c[2]) * 255,
        Number(c[3]) * 255,
        alpha(c[4]),
      ];
    return null;
  };
  /** @param {number[]} top @param {number[]} under */
  const over = (top, under) =>
    [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]));
  /** @param {number[]} c */
  const lum = c => {
    const [r, g, b] = c.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** @param {number[]} a @param {number[]} b */
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  /** @param {number[]} c */
  const hex = c =>
    `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  /** @param {Element} el */
  const partOf = el => {
    for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
      const named = [...a.classList].find(
        c => c.startsWith('astryx-') && !c.startsWith('astryx-theme'),
      );
      if (named) return named.slice('astryx-'.length);
    }
    return null;
  };
  /** Whether two rectangles overlap. @param {DOMRect} p @param {DOMRect} q */
  const meet = (p, q) =>
    p.left < q.right &&
    q.left < p.right &&
    p.top < q.bottom &&
    q.top < p.bottom;
  /**
   * What is drawn behind an element's text, as one color, or null: a box
   * around it see-through or hidden, disabled, or drawn with an image that
   * is not one flat color over the whole box, before an opaque fill.
   * @param {Element} el
   */
  const behind = el => {
    /** @type {Array<[number, number, number, number]>} */
    const fills = [];
    for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (
        Number(cs.opacity) < 1 ||
        a.matches(':disabled, [aria-disabled="true"], [inert]')
      )
        return null;
      if (cs.display === 'contents') continue;
      if (a !== document.documentElement) {
        const r = a.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || cs.visibility !== 'visible')
          return null;
      }
      // (A flat tint drawn as an image, a hover or pressed state's
      // one-color gradient, is a fill like any other, drawn over the
      // box's color; any other image leaves no one color behind.)
      const tints = flatLayers(cs, a.getBoundingClientRect());
      if (!tints) return null;
      const f = rgba(cs.backgroundColor);
      // (Drawn bottom first: the box's color, then its layers, the last
      // listed lowest; fills are gathered top first.)
      const own = [...(f && f[3] > 0 ? [f] : []), ...[...tints].reverse()];
      fills.push(...own.reverse());
      if (own.some(x => x[3] >= 1)) break;
    }
    let under = [255, 255, 255];
    for (const f of fills.reverse()) under = over(f, under);
    return under;
  };
  /**
   * A box's image layers when each is one flat color (a gradient whose
   * stops are all the same color) that covers the whole box, top layer
   * first; [] for none. A layer that draws nothing (a size of 0) is left
   * out. null for any other image: a picture, a gradient between colors, or
   * a flat layer that covers only part of the box (an underline).
   * @param {CSSStyleDeclaration} cs the box's computed style
   * @param {DOMRect} box the box
   * @returns {Array<[number, number, number, number]> | null}
   */
  const flatLayers = (cs, box) => {
    const bgi = cs.backgroundImage;
    if (!bgi || bgi === 'none') return [];
    /** @type {string[]} */
    const layers = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < bgi.length; i++) {
      if (bgi[i] === '(') depth++;
      else if (bgi[i] === ')') depth--;
      else if (bgi[i] === ',' && depth === 0) {
        layers.push(bgi.slice(start, i));
        start = i + 1;
      }
    }
    layers.push(bgi.slice(start));
    /** @type {Array<[number, number, number, number]>} */
    const out = [];
    for (const [n, layer] of layers.entries()) {
      if (!/^\s*(?:linear|radial)-gradient\(/.test(layer)) return null;
      const covers = coverage(cs, n, box);
      if (covers === 'none') continue;
      if (covers === 'part') return null;
      const colors = (
        layer.match(
          /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/g,
        ) ?? []
      ).map(rgba);
      if (!colors.length || colors.some(c => c == null)) return null;
      const [first] = /** @type {Array<[number, number, number, number]>} */ (
        colors
      );
      if (
        colors.some(c =>
          /** @type {number[]} */ (c).some(
            (v, i) => Math.abs(v - first[i]) > 0.5 / (i === 3 ? 255 : 1),
          ),
        )
      )
        return null;
      out.push(first);
    }
    return out;
  };
  /**
   * How much of a box one of its image layers covers: 'all', 'part' or
   * 'none'. A gradient has no size of its own: it fills its size (the whole
   * box by default) once, or tiles it where it repeats.
   * @param {CSSStyleDeclaration} cs @param {number} n the layer, top first
   * @param {DOMRect} box
   * @returns {'all' | 'part' | 'none'}
   */
  const coverage = (cs, n, box) => {
    /** @param {string} list */
    const nth = list => {
      const items = list.split(',').map(x => x.trim());
      return items[n % items.length] ?? '';
    };
    const size = nth(cs.backgroundSize).split(/\s+/);
    const rep = nth(cs.backgroundRepeat).split(/\s+/);
    const repeats =
      rep[0] === 'repeat-x'
        ? [true, false]
        : rep[0] === 'repeat-y'
          ? [false, true]
          : [rep[0], rep[1] ?? rep[0]].map(
              r => r === 'repeat' || r === 'round',
            );
    const pos = [nth(cs.backgroundPositionX), nth(cs.backgroundPositionY)];
    // (Only a plain length or percentage is read: a size or a place the
    // browser keeps as calc(), or an edge keyword with an offset, is taken
    // as covering part of the box.)
    const plain = /^-?[\d.]+(px|%)?$/;
    let part = false;
    for (const [i, whole] of [box.width, box.height].entries()) {
      const s =
        size[0] === 'cover' || size[0] === 'contain'
          ? 'auto'
          : (size[i] ?? 'auto');
      if (s !== 'auto' && !plain.test(s)) return 'part';
      const len =
        s === 'auto'
          ? whole
          : s.endsWith('%')
            ? (parseFloat(s) / 100) * whole
            : parseFloat(s);
      if (!(len > 0)) return 'none';
      if (repeats[i]) continue;
      const at = pos[i] || '0%';
      if (!plain.test(at)) return 'part';
      const offset = at.endsWith('%')
        ? (parseFloat(at) / 100) * (whole - len)
        : parseFloat(at) || 0;
      // (It covers the box when it holds it whole, wherever it is placed.)
      if (offset > 0.5 || offset + len < whole - 0.5) part = true;
    }
    return part ? 'part' : 'all';
  };
  /**
   * The page's images, pictures and boxes with a background image (a
   * gradient or a tint), with their boxes, read once when first asked: a
   * page has many texts and few of them fail.
   * @type {Array<[Element, DOMRect]> | null}
   */
  let media = null;
  /**
   * Whether an image, a picture, a gradient or a tint is drawn over or under
   * an element's text from a box beside it (media under an overlay's
   * scrim): then no one color is behind the text.
   * @param {Element} el
   */
  const overImage = el => {
    media ??= [...document.querySelectorAll('body *')]
      .filter(m => {
        if (m.matches('img, picture, video, canvas, svg image')) return true;
        // (A box beside the text draws over or under it whatever its
        // image, a flat tint too: no one color is known behind the text.)
        return getComputedStyle(m).backgroundImage !== 'none';
      })
      .map(
        m => /** @type {[Element, DOMRect]} */ ([m, m.getBoundingClientRect()]),
      );
    const box = el.getBoundingClientRect();
    return media.some(
      ([m, r]) => !m.contains(el) && !el.contains(m) && meet(r, box),
    );
  };
  /**
   * Whether a color is the theme's disabled or placeholder text color where
   * an element sits (read from a probe there, as the page resolves it).
   * @param {Element} el @param {number[]} c
   */
  const exempt = (el, c) => {
    // (One probe for each theme scope and color: the tokens are the
    // scope's.)
    const scope = el.closest('[data-astryx-theme], [data-theme]');
    const key = hex(c);
    const known = exemptSeen.get(scope)?.get(key);
    if (known != null) return known;
    const said = exemptAt(el, c);
    if (!exemptSeen.has(scope)) exemptSeen.set(scope, new Map());
    /** @type {Map<string, boolean>} */ (exemptSeen.get(scope)).set(key, said);
    return said;
  };
  /** @type {Map<Element | null, Map<string, boolean>>} */
  const exemptSeen = new Map();
  /** @param {Element} el @param {number[]} c */
  const exemptAt = (el, c) => {
    const probe = document.createElement('span');
    el.appendChild(probe);
    try {
      return [
        '--color-text-disabled',
        '--color-icon-disabled',
        '--color-text-placeholder',
      ].some(t => {
        // (A token the page does not set gives the fallback, never the
        // color the probe would inherit.)
        probe.style.color = `var(${t}, rgb(1, 2, 3))`;
        const v = rgba(getComputedStyle(probe).color);
        return (
          v != null &&
          !(v[0] === 1 && v[1] === 2 && v[2] === 3) &&
          v.slice(0, 3).every((x, i) => Math.abs(x - c[i]) < 1)
        );
      });
    } finally {
      probe.remove();
    }
  };
  /** @type {Map<string, {part: string, text: string, ratio: number, fg: string, bg: string}>} */
  const found = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => (n.textContent ?? '').trim())
      .join(' ')
      .trim();
    if (!text) continue;
    const part = partOf(el);
    if (!part) continue;
    const cs = getComputedStyle(el);
    const fg = rgba(cs.color);
    if (!fg || fg[3] === 0) continue;
    const bg = behind(el);
    if (!bg) continue;
    const shown = over(fg, bg);
    const r = ratio(shown, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (r >= (large ? 3 : 4.5)) continue;
    // (The same text in the same colors is reported once. A copy left out,
    // one over a picture or in a disabled color, says nothing of a later
    // copy drawn faint on a plain ground: only a reported one is skipped.)
    const key = `${part}\u0000${text}\u0000${hex(shown)}\u0000${hex(bg)}`;
    if (found.has(key)) continue;
    if (exempt(el, fg) || overImage(el)) continue;
    found.set(key, {
      part,
      text: text.slice(0, 40),
      ratio: Math.floor(r * 100) / 100,
      fg: hex(shown),
      bg: hex(bg),
    });
    if (found.size >= 60) break;
  }
  return [...found.values()];
}

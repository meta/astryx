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
 *   page is drawn as the picture shows it; read back by `screenshot` in
 *   api/theme-edit/_preview.mjs from the script's stdout
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
 * image, a picture or a gradient (no one color behind it) are left out. `part` is the
 * nearest Astryx part the text sits in (its `astryx-<part>` class); text in
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
   * around it see-through or hidden, disabled, or drawn with an image, or
   * an image or picture under the text before an opaque fill.
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
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const f = rgba(cs.backgroundColor);
      if (f && f[3] > 0) fills.push(f);
      if (f && f[3] >= 1) break;
    }
    let under = [255, 255, 255];
    for (const f of fills.reverse()) under = over(f, under);
    return under;
  };
  /**
   * Whether an image, a picture or a gradient is drawn under an element's
   * text from a box beside it (media under an overlay's scrim): then no one
   * color is behind the text.
   * @param {Element} el
   */
  /**
   * The page's images, pictures and gradients with their boxes, read once
   * when first asked: a page has many texts and few of them fail.
   * @type {Array<[Element, DOMRect]> | null}
   */
  let media = null;
  /** @param {Element} el */
  const overImage = el => {
    media ??= [...document.querySelectorAll('body *')]
      .filter(m => {
        if (m.matches('img, picture, video, canvas, svg image')) return true;
        const bgi = getComputedStyle(m).backgroundImage;
        return Boolean(bgi) && bgi !== 'none';
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
  /** @type {Set<string>} */
  const seen = new Set();
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
    // (The same text in the same colors is measured once.)
    const key = `${part}\u0000${text}\u0000${hex(shown)}\u0000${hex(bg)}`;
    if (seen.has(key)) continue;
    seen.add(key);
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

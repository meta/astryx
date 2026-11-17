// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text a picture's page draws cut short, measured in the page.
 * @input None: `cutShortText` runs in the page the picture is taken of.
 * @output `cutShortText`: each text the browser draws cut short (an ellipsis
 *   or a line clamp, or text drawn past the side of a box that clips it),
 *   and each word it breaks across two lines inside the word (`broken`),
 *   with the part it sits in and whether keeping that part's width
 *   (`flex-shrink: 0` on it, the line the editor offers) draws it whole;
 *   `CUT_SHORT_PREFIX`, the line prefix a picture script prints it after.
 * @position run by picture-chrome.mjs and picture-playwright.mjs once the
 *   page is drawn as the picture shows it; read back by `screenshot` in
 *   api/theme-edit/_preview.mjs from the script's stdout
 */

/* global document, getComputedStyle, HTMLElement -- cutShortText runs in the page */

/** The line prefix a picture script prints the measurement after. */
export const CUT_SHORT_PREFIX = 'astryx-cut-short:';

/**
 * Each text the page draws cut short: an element whose text ends in an
 * ellipsis with its text wider than its box, whose lines are clamped with
 * its text taller than its box, or whose own text runs past the side of a
 * box around it that clips what overflows. Text that is not drawn (no box,
 * a box of a pixel kept for screen readers, hidden) is not counted. `part`
 * is the nearest Astryx part the text sits in (its `astryx-<part>` class),
 * or null. `whole` says whether the text is drawn whole once every element
 * of that part keeps its width (`flex-shrink: 0`), measured by applying it
 * in the page and taking it back.
 * A word drawn broken across lines inside it ("Headi" then "ng": a box
 * narrower than the word) comes back too, the word as its `text`, with
 * `broken`; a word broken where it may break (at a hyphen, a slash, a soft
 * hyphen) is not counted.
 * Runs in the page: it uses nothing from outside its own body.
 * @returns {Array<{part: string | null, text: string, whole: boolean, broken?: boolean}>}
 */
export function cutShortText() {
  /** @param {Element} el */
  const drawn = el => {
    for (
      let a = /** @type {Element | null} */ (el);
      a && a !== document.body;
      a = a.parentElement
    ) {
      const cs = getComputedStyle(a);
      if (cs.display === 'contents') continue;
      const r = a.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || cs.visibility !== 'visible')
        return false;
    }
    return true;
  };
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
  /** Whether an element draws text of its own, not only its children's. @param {Element} el */
  const ownText = el =>
    [...el.childNodes].some(
      n => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
    );
  /** The text an element draws cut by an ellipsis or a line clamp. @param {HTMLElement} el */
  const ellipsized = el => {
    const cs = getComputedStyle(el);
    const clamp = cs.getPropertyValue('-webkit-line-clamp');
    return (
      (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) ||
      (clamp !== '' && clamp !== 'none' && el.scrollHeight > el.clientHeight)
    );
  };
  /**
   * Own text drawn past the side of a box around it that clips (a text's
   * height runs past its line by its font's ascent and descent, so only
   * its width is read).
   * @param {HTMLElement} el
   */
  const clipped = el => {
    if (!ownText(el)) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    if (t.width < 1 || t.height < 1) return false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue;
      const left = a.getBoundingClientRect().left + a.clientLeft;
      if (t.left < left - 1 || t.right > left + a.clientWidth + 1) return true;
    }
    return false;
  };
  /** @param {HTMLElement} el */
  const cutShort = el => ellipsized(el) || clipped(el);
  /**
   * The words of an element's own text drawn on more than one line: the
   * boxes of a word's letters sit on lines with different tops.
   * @param {HTMLElement} el
   * @returns {string[]}
   */
  const brokenWords = el => {
    /** @type {string[]} */
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const s = n.textContent ?? '';
      for (const m of s.matchAll(/\S+/g)) {
        const word = m[0];
        if (word.length < 3 || /[-/\u00AD\u200B\u2010-\u2014]/.test(word))
          continue;
        const range = document.createRange();
        range.setStart(n, m.index ?? 0);
        range.setEnd(n, (m.index ?? 0) + word.length);
        const tops = [...range.getClientRects()]
          .filter(r => r.width > 0 && r.height > 0)
          .map(r => Math.round(r.top));
        if (tops.some(t => Math.abs(t - tops[0]) > 2)) out.push(word);
      }
    }
    return out;
  };
  /** @type {Array<{el: HTMLElement, part: string | null, text: string, broken?: boolean}>} */
  const found = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement)) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || !drawn(el)) continue;
    if (cutShort(el)) found.push({el, part: partOf(el), text});
    else
      for (const word of brokenWords(el))
        found.push({el, part: partOf(el), text: word, broken: true});
  }
  /** Whether each text is whole with its part's width kept. @type {Map<string | null, boolean>} */
  const whole = new Map();
  for (const part of new Set(found.map(f => f.part))) {
    if (part === null) {
      whole.set(part, false);
      continue;
    }
    const keep = document.createElement('style');
    keep.textContent = `.astryx-${part}{flex-shrink:0 !important}`;
    document.head.append(keep);
    whole.set(
      part,
      found
        .filter(f => f.part === part)
        .every(f =>
          f.broken ? !brokenWords(f.el).includes(f.text) : !cutShort(f.el),
        ),
    );
    keep.remove();
  }
  return found.map(({part, text, broken}) => ({
    part,
    text,
    whole: whole.get(part) ?? false,
    ...(broken ? {broken: true} : {}),
  }));
}

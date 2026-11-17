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

/**
 * The script run on a page before its picture: each animation that ends (an
 * overlay's fade-in) is run to its end, so the picture shows the part as it
 * looks once it has played, except a part drawn pressed, whose press
 * animation (a flash that fades) is held at its start, the moment of the
 * press; each that loops (a skeleton's shimmer, a pulsing
 * dot, a spinner) is held at the middle of its first round, a frame a person
 * sees as it plays, never its first frame, where a part can be faint or gone.
 */
export const SETTLE_ANIMATIONS = `for (const a of document.getAnimations()) {
  const t = a.effect?.getComputedTiming();
  if (!t) continue;
  if (typeof CSSAnimation === 'function' && a instanceof CSSAnimation && t.iterations !== Infinity && a.effect.target?.closest?.('[data-astryx-state~="active"]')) { a.pause(); a.currentTime = Number(a.effect.getTiming().delay) || 0; continue; }
  if (t.iterations !== Infinity) { a.finish(); continue; }
  a.pause();
  a.currentTime = (Number(a.effect.getTiming().delay) || 0) + (typeof t.duration === 'number' ? t.duration : 0) / 2;
}`;

/**
 * The script run before the picture: it waits until the page stops
 * changing, so a part drawn over animation frames (a responsive chart's
 * lines) is drawn whole. Quiet means no change to the document for
 * QUIET_MS; it waits QUIET_MOST_MS at most.
 */
export const AWAIT_QUIET = `new Promise(resolve => {
  const QUIET_MS = 300;
  const QUIET_MOST_MS = 4000;
  let timer = setTimeout(done, QUIET_MS);
  const most = setTimeout(done, QUIET_MOST_MS);
  const watch = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(done, QUIET_MS);
  });
  watch.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
  function done() {
    watch.disconnect();
    clearTimeout(timer);
    clearTimeout(most);
    resolve(true);
  }
})`;

/**
 * How a picture script hands back a batch: each line it prints for a job
 * starts with the job's place in the batch and a tab; a job's picture is
 * whole once it prints this word.
 */
export const PICTURE_TAKEN = 'taken';

/** How many pages of a batch a picture script draws at once. */
export const PICTURE_PAGES_AT_ONCE = 3;

/**
 * Run each job of a list in order, a few at a time. Once one fails, no
 * other starts; the ones running finish, then the first failure is thrown,
 * so every job before it has had its turn.
 * @template T
 * @param {T[]} jobs
 * @param {number} atOnce
 * @param {(job: T, i: number) => Promise<void>} run
 */
export async function eachAtOnce(jobs, atOnce, run) {
  let next = 0;
  /** @type {{error: unknown} | null} */
  let failed = null;
  await Promise.all(
    Array.from({length: Math.min(atOnce, jobs.length)}, async () => {
      while (!failed && next < jobs.length) {
        const i = next++;
        try {
          await run(jobs[i], i);
        } catch (error) {
          failed ??= {error};
        }
      }
    }),
  );
  const first = /** @type {{error: unknown} | null} */ (failed);
  if (first) throw first.error;
}

/**
 * The script run on a sheet before its picture: text a part cuts with an
 * ellipsis when it is narrow (a stepper's step names, a section heading)
 * gets the room it needs, and so does a row that scrolls sideways (a
 * carousel's slides), so its picture shows every item and cuts none at its
 * edge. Each sheet item holding such text or row grows by what it lacks,
 * up to the sheet's width, a few rounds while the layout
 * settles. A part whose own width is fixed keeps it, and what it still cuts
 * is the theme's to fix. A page with no sheet items is left as it is.
 */
export const FIT_CELLS = `(() => {
  for (let round = 0; round < 4; round++) {
    let grew = false;
    for (const item of document.querySelectorAll('.cs-item')) {
      let need = 0;
      for (const el of item.querySelectorAll('*')) {
        // A text cut by less than a pixel still ends in an ellipsis. Text
        // drawn in no width at all (a label only a screen reader reads) is
        // not cut: no width given to it would show it.
        if (el.clientWidth < 2 || el.scrollWidth <= el.clientWidth) continue;
        const cs = getComputedStyle(el);
        const scrolls = /^(?:auto|scroll)$/.test(cs.overflowX);
        if (cs.textOverflow !== 'ellipsis' && !scrolls) continue;
        need = Math.max(need, el.scrollWidth - el.clientWidth + 1);
      }
      if (!need) continue;
      const width = item.getBoundingClientRect().width;
      const most = item.closest('.cs-sheet')?.clientWidth ?? width;
      const next = Math.min(Math.ceil(width + need), Math.max(most, width));
      if (next > width + 0.5) {
        item.style.minWidth = next + 'px';
        grew = true;
      }
    }
    if (!grew) break;
  }
})()`;

/**
 * The script run on a sheet before its picture: an overlay drawn open
 * after its part (a toolbar's menu) moves along the row to sit under the
 * control that opens it, as a browser places it, as far as its item has
 * room for what it draws. A flyout drawn beside its menu stays there. A
 * panel as wide as the window is drawn as wide as its cell. A dialog drawn
 * in its cell is not in the top layer, so the browser draws no backdrop
 * for it: one with no background of its own (a lightbox, its controls
 * drawn for the dark backdrop) gets its backdrop's colour as its own.
 */
export const PLACE_LAYERS = `(() => {
  for (const layer of document.querySelectorAll('.cs-item [data-astryx-layer-root]')) {
    if (layer.parentElement?.closest('[data-astryx-layer-root], [data-astryx-layer-nest]')) continue;
    const item = layer.closest('.cs-item');
    const ids = [layer, ...layer.querySelectorAll('[id]')].map(e => e.id).filter(Boolean);
    const opener = [...item.querySelectorAll('[aria-controls]')].find(c => !layer.contains(c) && !c.closest('[data-astryx-layer-root]') && ids.includes(c.getAttribute('aria-controls')));
    if (!opener) continue;
    // The layer box spans its row; what it draws is its content, so the
    // room is measured from the content's right edge.
    const at = layer.getBoundingClientRect();
    const drawn = Math.max(at.left, ...[...layer.children].map(c => c.getBoundingClientRect().right));
    const shift = Math.min(opener.getBoundingClientRect().left - at.left, item.getBoundingClientRect().right - drawn);
    if (shift > 0.5) layer.style.setProperty('margin-inline-start', shift + 'px', 'important');
  }
  // A panel as wide as the window (a navigation drawer's dialog) is drawn as
  // wide as its cell: the window's width would stretch the cell, and the
  // page, past it.
  for (const dialog of document.querySelectorAll('.cs-cell dialog')) {
    if (dialog.getBoundingClientRect().width >= window.innerWidth - 0.5)
      dialog.style.setProperty('width', '100%', 'important');
  }
  const clear = color => /^transparent$|rgba\\([^)]*,\\s*0\\)$/.test(color.trim());
  for (const dialog of document.querySelectorAll('.cs-cell dialog')) {
    const backdrop = getComputedStyle(dialog, '::backdrop').backgroundColor;
    if (clear(getComputedStyle(dialog).backgroundColor) && backdrop && !clear(backdrop))
      dialog.style.setProperty('background-color', backdrop, 'important');
  }
})()`;

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

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
 * looks once it has played; each that loops (a skeleton's shimmer, a pulsing
 * dot, a spinner) is held at the middle of its first round, a frame a person
 * sees as it plays, never its first frame, where a part can be faint or gone.
 */
export const SETTLE_ANIMATIONS = `for (const a of document.getAnimations()) {
  const t = a.effect?.getComputedTiming();
  if (!t) continue;
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

/** @typedef {boolean | null} Answer true, false, or null where the window does not judge */

/** @param {Answer} a @returns {Answer} */
const not = a => (a == null ? null : !a);

/**
 * Thrown for a query the browser reads as invalid, which never matches: a
 * media type followed by a condition with `or` at its top level (after a
 * feature, a group, or `not` and a group), whatever the type and its `not`;
 * or `and` or `or` written straight against `(`.
 */
const INVALID_QUERY = new SyntaxError('invalid media query');

/**
 * The answer of a media condition (Media Queries level 4): a feature in
 * parentheses, `not` before one, or several joined by `and` or by `or` (not
 * both at one level), each of which can be a condition in parentheses.
 * A feature the window does not judge holds; with `sure` its answer is
 * unknown, stays unknown through `not`, and decides `and` and `or` only when
 * no known answer does. Throws on text it cannot read; with `withoutOr` (the
 * condition after a media type), throws INVALID_QUERY on `or` at its top
 * level.
 * @param {string} text
 * @param {boolean} sure
 * @param {boolean} [withoutOr]
 * @returns {Answer}
 */
function conditionAnswer(text, sure, withoutOr = false) {
  let at = 0;
  const skip = () => {
    while (at < text.length && /\s/.test(text[at])) at += 1;
  };
  /** @param {string} word */
  const take = word => {
    skip();
    const found = new RegExp(`^${word}(?![\\w-])`, 'i').exec(text.slice(at));
    if (!found) return false;
    // CSS reads `not(` as a function, never as the keyword: `and(` and `or(`
    // make the query invalid, and `not(…)` is an unknown group (operand).
    if (text[at + found[0].length] === '(') {
      if (word === 'not') return false;
      throw INVALID_QUERY;
    }
    at += found[0].length;
    return true;
  };
  /**
   * One operand: a group in parentheses, or `not(…)`, which the browser
   * reads as a group it cannot answer (unknown, even without `sure`).
   * @returns {Answer}
   */
  const operand = () => {
    skip();
    if (!/^not\(/i.test(text.slice(at))) return inParens();
    let depth = 0;
    for (at += 3; at < text.length; at += 1) {
      if (text[at] === '(') depth += 1;
      if (text[at] === ')' && --depth === 0) {
        at += 1;
        return null;
      }
    }
    throw new SyntaxError(text);
  };
  /** @returns {Answer} */
  const inParens = () => {
    skip();
    if (text[at] !== '(') throw new SyntaxError(text);
    at += 1;
    skip();
    if (text[at] === '(' || /^not(?![\w-])/i.test(text.slice(at))) {
      const answer = condition(false);
      skip();
      if (text[at] !== ')') throw new SyntaxError(text);
      at += 1;
      return answer;
    }
    const end = text.indexOf(')', at);
    const feature = text.slice(at, end);
    if (end < 0 || feature.includes('(')) throw new SyntaxError(text);
    at = end + 1;
    return featureHolds(feature) ?? (sure ? null : true);
  };
  /** @param {boolean} top @returns {Answer} */
  const condition = top => {
    if (take('not')) {
      const answer = not(inParens());
      const rest = at;
      if (top && withoutOr && take('or')) throw INVALID_QUERY;
      at = rest;
      return answer;
    }
    const answers = [operand()];
    let join = '';
    for (;;) {
      const word = take('and') ? 'and' : take('or') ? 'or' : '';
      if (!word) break;
      if (word === 'or' && top && withoutOr) throw INVALID_QUERY;
      if (join && word !== join) throw new SyntaxError(text);
      join = word;
      answers.push(operand());
    }
    const decided = join === 'or' ? true : false;
    if (answers.includes(decided)) return decided;
    if (answers.includes(null)) return null;
    return !decided;
  };
  const answer = condition(true);
  skip();
  if (at !== text.length) throw new SyntaxError(text);
  return answer;
}

/**
 * Whether one query of a list matches: its media type is the screen's and
 * its condition holds (conditionAnswer); `not` turns it round. Throws on text
 * conditionAnswer cannot read.
 * @param {string} part
 * @param {boolean} sure
 * @returns {Answer}
 */
function queryAnswer(part, sure) {
  const text = part.trim();
  if (/^(\(|not\s*\()/i.test(text)) return conditionAnswer(text, sure);
  const head = /^(?:(not|only)\s+)?([a-z]+)(?:\s+and\s+([\s\S]+))?$/i.exec(
    text,
  );
  if (!head) throw new SyntaxError(text);
  const [, modifier, type, rest] = head;
  const screen = !/^(print|speech)$/i.test(type);
  const condition = rest == null ? true : conditionAnswer(rest, sure, true);
  const answer = screen ? condition : false;
  return modifier?.toLowerCase() === 'not' ? not(answer) : answer;
}

/**
 * The reading for a query that queryAnswer cannot parse: every feature in
 * innermost parentheses must hold, and a leading `not` turns it round.
 * @param {string} part
 * @param {boolean} sure
 * @returns {boolean}
 */
function featuresMatch(part, sure) {
  const type = /^\s*(?:not\s+|only\s+)?([a-z]+)\s*(?:and\b|$)/i.exec(part)?.[1];
  const screen = type == null || !/^(print|speech)$/i.test(type);
  const answers = [...part.matchAll(/\(([^()]*)\)/g)].map(([, feature]) =>
    featureHolds(feature),
  );
  if (sure && answers.includes(null)) return false;
  const all = screen && answers.every(a => a !== false);
  return /^\s*not\s/.test(part) ? !all : all;
}

/**
 * The queries of a list, split at the commas outside parentheses.
 * @param {string} query
 * @returns {string[]}
 */
function queryList(query) {
  const parts = [''];
  let depth = 0;
  for (const char of query) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) parts.push('');
    else parts[parts.length - 1] += char;
  }
  return parts;
}

/**
 * Whether a media query matches in the window a picture is taken in
 * (PICTURE_WINDOW, a desktop's, with a mouse): one query of the list must
 * match, by its media type and its condition, read as Media Queries level 4
 * reads it (queryAnswer). A feature the window does not judge holds, as in
 * the chart document (no motion); with `sure`, a query whose answer depends
 * on one never matches, so only what the window answers counts. A query
 * the browser reads as invalid in the ways INVALID_QUERY names never
 * matches; a query the reader cannot parse falls back to featuresMatch.
 * @param {string} query
 * @param {{sure?: boolean}} [options]
 * @returns {boolean}
 */
export function desktopMatches(query, {sure = false} = {}) {
  return queryList(String(query)).some(part => {
    let answer;
    try {
      answer = queryAnswer(part, sure);
    } catch (error) {
      if (error === INVALID_QUERY) return false;
      return featuresMatch(part, sure);
    }
    return answer === true;
  });
}

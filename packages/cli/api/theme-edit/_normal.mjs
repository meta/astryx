// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's input normaliser: how a typed or saved thing and
 * value are read before any check (Unicode spaces, delimiting quotes, a
 * pasted declaration, JSON and copy debris, a font stack's families). Typed
 * input (`set`, `undo`) and saved settings (`loadTheme`, the stored checks)
 * both read through it.
 * @position packages/cli/api/theme-edit — pure helpers, no environment access
 */

import {DIALS} from './_tables.mjs';

/**
 * A value as CSS reads it, for every value type: every Unicode space
 * (no-break, thin, ideographic…) a plain space and zero-width and format
 * characters dropped, and quotes that delimit a value (curly ones, «», ‹›,
 * full-width, backticks) straight. A straight-quoted CSS string keeps what
 * it holds as written (`content: "it’s"`). Curly quotes pair by kind
 * (double with double, single with single, in any of their shapes: „Inter“,
 * ‚Inter‘); one left unpaired is read as the straight quote it stands for.
 * @param {string} v
 * @returns {string}
 */
export function normalValueText(v) {
  let out = '';
  let plain = '';
  const flush = () => {
    out += plain
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
    plain = '';
  };
  for (let i = 0; i < v.length;) {
    const c = v[i];
    // A straight-quoted CSS string keeps everything inside it.
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < v.length && v[j] !== c) j += v[j] === '\\' ? 2 : 1;
      if (j < v.length) {
        flush();
        out += v.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }
    const kind = CURLY_DOUBLE.has(c)
      ? CURLY_DOUBLE
      : CURLY_SINGLE.has(c)
        ? CURLY_SINGLE
        : null;
    /** @type {number} */
    let j = -1;
    if (kind) {
      for (let k = i + 1; k < v.length; k++)
        if (kind.has(v[k])) {
          j = k;
          break;
        }
    } else if (QUOTE_PAIRS[c]) j = v.indexOf(QUOTE_PAIRS[c], i + 1);
    if (j > i) {
      flush();
      // What the quotes hold, as typed (`“ / ”` is a slash between
      // spaces); a font family trims it (normalizeEntry).
      const inner = v.slice(i + 1, j);
      const single = kind === CURLY_SINGLE || c === '\uFF07';
      const mark = single
        ? inner.includes("'")
          ? '"'
          : "'"
        : inner.includes('"')
          ? "'"
          : '"';
      out += `${mark}${inner}${mark}`;
      i = j + 1;
      continue;
    }
    // An unpaired curly quote is the straight one it stands for.
    plain += kind === CURLY_DOUBLE ? '"' : kind === CURLY_SINGLE ? "'" : c;
    i += 1;
  }
  flush();
  return out;
}

/** Curly double quotes, in every shape; any one closes any other. */
const CURLY_DOUBLE = new Set(['\u201C', '\u201D', '\u201E', '\u201F']);
/** Curly single quotes, in every shape. */
const CURLY_SINGLE = new Set(['\u2018', '\u2019', '\u201A', '\u201B']);
/** The other delimiting quotes and the one that closes each. */
/** @type {Record<string, string>} */
const QUOTE_PAIRS = {
  '\u300C': '\u300D',
  '\u300E': '\u300F',
  '\u00AB': '\u00BB',
  '\u00BB': '\u00AB',
  '\u2039': '\u203A',
  '\u203A': '\u2039',
  '\uFF02': '\uFF02',
  '\uFF07': '\uFF07',
  '`': '`',
};

/**
 * The thing and value a setting was typed as, put right before any check: a
 * declaration pasted whole or split (`accent: #e11d48`, `--color-accent=red`,
 * `font:inter`, `accent:` with the value next), a token typed with an em or
 * en dash (`—color-accent`) or as `var(--color-accent)`, and the value's
 * Unicode spaces. A thing it cannot read is left as typed.
 * @param {string} thing
 * @param {string | undefined} value
 * @returns {{thing: string, value: string | undefined}}
 */
export function normalizeEntry(thing, value) {
  let t = normalValueText(String(thing ?? '')).trim();
  let v = value == null ? value : normalValueText(String(value));
  // A pasted declaration (the whole of it in the thing, or the thing with
  // its colon and the value next): its `;` and `!important` go with it.
  let pasted = false;
  // A JSON object around one entry (`{"accent": "#e11d48"}`), whole or
  // split at its colon.
  if ((v == null || v.trim() === '') && /^\{[\s\S]*\}$/.test(t))
    t = t.slice(1, -1).trim().replace(/,\s*$/, '');
  else if (t.startsWith('{') && typeof v === 'string' && /\}\s*$/.test(v)) {
    t = t.slice(1).trim();
    v = v.replace(/\s*\}\s*$/, '');
  }
  if (v == null || v.trim() === '') {
    const m = /^(\S+?)\s*[:=]\s*(.+?)\s*;?\s*$/.exec(t);
    if (m && !/^https?$/i.test(m[1])) {
      t = m[1];
      v = m[2];
      pasted = true;
    }
  }
  // A thing ending in its colon or equals sign, the value given next.
  if (/\s*[:=]+$/.test(t)) {
    t = t.replace(/\s*[:=]+$/, '');
    pasted = true;
  }
  // A thing in quotes, as a JSON or design-tokens file writes it
  // (`"accent": "#e11d48"`).
  const quotedThing = /^(["'])(.+)\1$/.exec(t);
  if (quotedThing) {
    t = quotedThing[2].trim();
    pasted = true;
    // Its value in JSON's double quotes is the value (`"#e11d48"`); a font
    // list keeps its own quotes.
    if (typeof v === 'string' && !/font/i.test(t)) {
      const jv = /^\s*"([^"]*)"\s*,?\s*$/.exec(v);
      if (jv) v = jv[1];
    }
  }
  // Dash-like characters where a token's two dashes go (an em or en dash,
  // a non-breaking hyphen, a minus sign, a full-width hyphen, alone or
  // mixed with hyphens): `--`.
  t = t.replace(/^[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]+/, run =>
    /[^-]/.test(run) ? '--' : run,
  );
  // A dash-like character inside a token's name is its hyphen.
  if (t.startsWith('--'))
    t = `--${t.slice(2).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')}`;
  // A token typed as a var() reference.
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(t);
  if (ref) t = ref[1];
  // A dial name written in another style (textSize, text_size, a dash-like
  // character for its hyphen) is the dial.
  if (
    !t.startsWith('-') &&
    /[_\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]|[a-z][A-Z]/.test(t)
  ) {
    const dial = t
      .replace(/[_\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    if (DIALS[dial]) t = dial;
  }
  // A second declaration pasted after the first (`accent: red; text-size:
  // 18`): the first is this setting.
  if (typeof v === 'string') v = withoutSecondDeclaration(v);
  if (pasted && typeof v === 'string') {
    v = v.replace(/\s*!\s*important\s*;?\s*$/i, '').replace(/;+\s*$/, '');
  }
  if (typeof v === 'string') v = withoutDebris(v);
  // A font stack written as a JSON string (`"\\"Open Sans\\", serif"`): the
  // stack it holds.
  if (
    typeof v === 'string' &&
    /font/i.test(t) &&
    /^"(?:[^"\\]|\\.)*"$/.test(v.trim()) &&
    v.includes('\\"')
  ) {
    try {
      const inner = JSON.parse(v.trim());
      if (typeof inner === 'string') v = inner;
    } catch {
      // Not a JSON string.
    }
  }
  // A font family's name never starts or ends with a space: French quotes
  // (« Inter », with a no-break or narrow no-break space) hold the name.
  if (typeof v === 'string' && /font/i.test(t)) v = trimInsideQuotes(v);
  return {thing: t, value: v};
}

/**
 * A font stack's pieces, split on the commas outside quotes, with each
 * piece's name and whether it was quoted; null when a quote is left open.
 * @param {string} v
 * @returns {Array<{name: string, quoted: boolean}> | null}
 */
export function familyPieces(v) {
  /** @type {Array<{name: string, quoted: boolean}>} */
  const out = [];
  let cur = '';
  let quoted = false;
  /** @type {string | null} */
  let q = null;
  let closed = false;
  for (const c of String(v)) {
    if (q) {
      if (c === q) {
        q = null;
        closed = true;
      } else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      // A quote opening after text, or a second quoted name before a
      // comma: not a stack of whole pieces.
      if (cur.trim() || closed) return null;
      q = c;
      quoted = true;
      continue;
    }
    // Text after a quoted name before its comma (`"Open Sans" serif`).
    if (closed && c !== ',' && c.trim()) return null;
    if (c === ',') {
      out.push({name: cur.trim(), quoted});
      cur = '';
      quoted = false;
      closed = false;
      continue;
    }
    cur += c;
  }
  if (q) return null;
  out.push({name: cur.trim(), quoted});
  return out;
}

/**
 * The families a typed font stack names: a trailing comma and empty pieces
 * dropped, and a stack wrapped in one more pair of the quotes it uses
 * inside (`""SF Mono", Monaco, monospace"`, as a JSON string) unwrapped.
 * Null when the stack does not read.
 * @param {string} v
 * @returns {string[] | null}
 */
export function familiesOf(v) {
  let s = String(v)
    .trim()
    .replace(/,+\s*$/, '');
  const w = /^(["'])([\s\S]*)\1$/.exec(s);
  if (w && w[2].includes(w[1])) s = w[2].trim().replace(/,+\s*$/, '');
  const pieces = familyPieces(s);
  if (!pieces) return null;
  return pieces.map(f => f.name).filter(Boolean);
}

/**
 * A value with the debris of a bad copy taken off: a leading `=` or `:`, a
 * trailing comma (a JSON or CSS list), and a quote or a closing bracket left
 * over at either end. A value without any is returned as it was.
 * @param {string} v
 * @returns {string}
 */
export function withoutDebris(v) {
  let s = v.replace(/^\s*[=:]\s*/, '').replace(/\s*,+\s*$/, '');
  // Quotes and brackets counted as CSS reads them: an escaped quote (\")
  // is no quote, and a bracket inside a string is the string's.
  const scan = (/** @type {string} */ t) => {
    /** @type {Record<string, number>} */
    const quotes = {'"': 0, "'": 0};
    let open = 0;
    let close = 0;
    /** @type {string | null} */
    let q = null;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') {
        i++;
        continue;
      }
      if (q) {
        if (c === q) {
          q = null;
          quotes[c]++;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        q = c;
        quotes[c]++;
      } else if (c === '(') open++;
      else if (c === ')') close++;
    }
    return {quotes, open, close};
  };
  for (const mark of /** @type {const} */ (['"', "'"])) {
    if (scan(s).quotes[mark] % 2 === 1) {
      if (s.endsWith(mark) && !s.endsWith(`\\${mark}`)) s = s.slice(0, -1);
      else if (s.startsWith(mark)) s = s.slice(1);
    }
  }
  const {open, close} = scan(s);
  if (close > open && s.endsWith(')')) s = s.slice(0, -1);
  return s === v.trim() ? v : s.trim();
}

/**
 * A value without a second declaration pasted after it (`#e11d48;
 * text-size: 18`): cut at the first `;` outside quotes that a `name:`
 * follows. A `;` inside a quoted string (`"Tip; note: x"`) is the string's.
 * @param {string} v
 * @returns {string}
 */
export function withoutSecondDeclaration(v) {
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (
      c === ';' &&
      /^\s*[a-z-]+\s*:/i.test(v.slice(i + 1)) &&
      // `light: red; dark: blue` is one value for two modes.
      !/^\s*(?:light|dark)\s*:/i.test(v.slice(i + 1))
    )
      return v.slice(0, i);
  }
  return v;
}

/**
 * A saved dial value read as typed input is (invisible or stray spaces,
 * quotes around it, a pasted `corners: pill`, a trailing `;`, other
 * letters): the value the dial may have meant.
 * @param {string} dial
 * @param {string} value
 * @returns {string}
 */
export function cleanDialValue(dial, value) {
  const read = normalizeEntry(dial, value).value ?? '';
  return read
    .trim()
    .replace(new RegExp(`^${dial.replace(/-/g, '\\-')}\\s*[:=]\\s*`, 'i'), '')
    .replace(/\s*!\s*important\s*$/i, '')
    .replace(/;+\s*$/, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim()
    .toLowerCase();
}

/**
 * A value with the spaces just inside each straight-quoted string taken off
 * (`" Inter "` is "Inter"), for a font family, whose name holds none there.
 * @param {string} v
 * @returns {string}
 */
export function trimInsideQuotes(v) {
  const SP = '[\\s\\u00A0\\u202F\\u2000-\\u200A\\u3000]*';
  return v.replace(
    new RegExp(`(["'])${SP}((?:(?!\\1)[^\\\\]|\\\\.)*?)${SP}\\1`, 'g'),
    '$1$2$1',
  );
}

/**
 * The other setting a dial's value is labeled with, when pasted with a
 * label that names a different dial or a token (`neutral: #64748b` given
 * to accent): that label and the value after it, else null. A label that
 * names this dial, or a CSS property (`color: #e11d48`), is no other
 * setting.
 * @param {string} dial
 * @param {string} value
 * @returns {{thing: string, value: string} | null}
 */
export function otherSettingLabel(dial, value) {
  const m =
    /^\s*["']?([a-z][a-z0-9-]*|--[a-z0-9-]+)["']?\s*[:=]\s*(.+?)\s*;?\s*$/i.exec(
      String(value),
    );
  if (!m) return null;
  const label = m[1].toLowerCase();
  if (label === dial) return null;
  if (!DIALS[label] && !label.startsWith('--')) return null;
  return {thing: label, value: m[2]};
}

/**
 * A light and a dark color typed as a pair: labeled (`light: red; dark:
 * blue`), a JSON object (`{"light": "red", "dark": "blue"}`), or two colors
 * with a slash or a comma between (`red / blue`, `red, blue`). Null when the
 * value is no such pair; the caller checks that both are colors.
 * @param {string} value
 * @returns {{light: string, dark: string} | null}
 */
export function colorPair(value) {
  const v = String(value).trim();
  const unq = (/** @type {string} */ x) =>
    x
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .trim();
  const labeled =
    /^\{?\s*["']?(light|dark)["']?\s*[:=]\s*(.+?)\s*[;,]\s*["']?(light|dark)["']?\s*[:=]\s*(.+?)\s*;?\s*\}?$/i.exec(
      v,
    );
  if (labeled && labeled[1].toLowerCase() !== labeled[3].toLowerCase()) {
    const a = unq(labeled[2]);
    const b = unq(labeled[4]);
    return labeled[1].toLowerCase() === 'light'
      ? {light: a, dark: b}
      : {light: b, dark: a};
  }
  const two = /^([^\s,/()]+)\s*(?:\s\/\s|,)\s*([^\s,/()]+)$/.exec(v);
  if (two) return {light: unq(two[1]), dark: unq(two[2])};
  return null;
}

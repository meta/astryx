// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's input normaliser: how a typed or saved thing and
 * value are read before any check (Unicode spaces, delimiting quotes, a
 * pasted declaration, JSON and copy debris, a font stack's families). Typed
 * input (`set`, `undo`) and saved settings (`loadTheme`, the stored checks)
 * both read through it.
 * @position packages/cli/api/theme-edit — pure helpers, no environment access
 */

import {DIALS, wordTable} from './_tables.mjs';
import {colorProblem, hex, parseColor} from './_color.mjs';
import {sameKindValues} from './_css.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';

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

/** CSS functions whose names a value may write in any case. */
const CSS_FUNCTIONS =
  /\b(light-dark|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|calc|min|max|clamp|var)\(/gi;

/**
 * A value as meant when typed with escapes or in another notation: CSS
 * function names in lower case (`LIGHT-DARK(` is `light-dark(`, as CSS reads
 * it); a shell or JSON backslash before `#`, a quote or a space taken off;
 * a JavaScript escape in a `content` string written as CSS writes it
 * (`\u2022` is `\2022 `, `\n` a line break, `\t` a tab); and the JSON
 * shapes a design-tokens file or an array writes (`{"$value": "#e11d48"}`,
 * `{"value": 18, "unit": "px"}`, `["#e11d48"]`, `["Inter", "sans-serif"]`).
 * @param {string} thing
 * @param {string} value
 * @returns {string}
 */
export function escapesMeant(thing, value) {
  let v = value;
  const content = /^content$/i.test(thing);
  if (content)
    return (
      v
        .replace(
          /\\u\{?([0-9a-f]{2,6})\}?/gi,
          (_, h) => `\\${h.toUpperCase()} `,
        )
        // `\x` with four hex digits is written for the code point (as
        // `\u`), with two for that character.
        .replace(
          /\\x([0-9a-f]{4}|[0-9a-f]{2})/gi,
          (_, h) => `\\${h.toUpperCase()} `,
        )
        .replace(/\\n/g, '\\A ')
        .replace(/\\t/g, '\\9 ')
        .replace(/\\r/g, '\\D ')
    );
  v = v.replace(CSS_FUNCTIONS, f => f.toLowerCase());
  // A JS escape of a printable character in a font family (`Inter\u0020
  // Tight`) is that character, as CSS would read its own escape.
  if (/font/i.test(thing))
    v = v.replace(
      /\\(?:u\{?([0-9a-f]{4,6})\}?|x([0-9a-f]{2}))/gi,
      (m, u, x) => {
        const c = String.fromCodePoint(parseInt(u ?? x, 16));
        return /^[\p{L}\p{N} _-]$/u.test(c) ? c : m;
      },
    );
  // (A JSON string holding escaped quotes is unwrapped whole later.)
  if (!/^\s*"(?:[^"\\]|\\.)*"\s*$/.test(v)) v = v.replace(/\\([#"' ])/g, '$1');
  else v = v.replace(/\\([# ])/g, '$1');
  const t = v.trim();
  if (/^[[{]/.test(t)) {
    /** @type {any} */
    let j;
    try {
      j = JSON.parse(t);
    } catch {
      // A list in single quotes, as a JS config writes it (`['Inter',
      // 'serif']`): read like the JSON one.
      const items =
        /^\[\s*('(?:[^'\\]|\\.)*'\s*(?:,\s*'(?:[^'\\]|\\.)*'\s*)*),?\s*\]$/.exec(
          t,
        );
      if (!items) return v;
      j = [...items[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x =>
        x[1].replace(/\\(.)/g, '$1'),
      );
    }
    /** @param {any} x */
    const text = x =>
      typeof x === 'string' || typeof x === 'number' ? String(x) : null;
    if (Array.isArray(j) && j.length && j.every(x => text(x) != null)) {
      if (j.length === 1) return String(j[0]);
      if (/font/i.test(thing))
        return j
          .map(x =>
            /\s/.test(String(x)) && !/^["']/.test(String(x))
              ? `"${x}"`
              : String(x),
          )
          .join(', ');
      return v;
    }
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const inner =
        '$value' in j ? j.$value : 'value' in j ? j.value : undefined;
      if (text(inner) != null)
        return `${inner}${typeof j.unit === 'string' ? j.unit : ''}`;
      // One labeled entry (`{"color": "#e11d48"}`) is read as the same
      // label in its CSS form (`color: #e11d48`): one reader for both.
      const keys = Object.keys(j);
      if (
        keys.length === 1 &&
        /^(--)?[a-z][a-z0-9-]*$/i.test(keys[0]) &&
        text(j[keys[0]]) != null
      )
        return `${keys[0]}: ${j[keys[0]]}`;
    }
  }
  return v;
}

/**
 * The thing and value a setting was typed as, put right before any check: a
 * declaration pasted whole or split (`accent: #e11d48`, `--color-accent=red`,
 * `font:inter`, `accent:` with the value next), a token typed with an em or
 * en dash (`—color-accent`) or as `var(--color-accent)`, and the value's
 * Unicode spaces. A thing it cannot read is left as typed.
 * @param {string} thing
 * @param {string | undefined} value
 * @returns {{thing: string, value: string | undefined, dropped?: string}} `dropped`: a second declaration pasted after the first, which is not set
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
  if (typeof v === 'string') v = escapesMeant(t, v);
  // A second declaration pasted after the first (`accent: red; text-size:
  // 18`): the first is this setting.
  /** A second declaration pasted after the first, which this does not set. @type {string | null} */
  let dropped = null;
  if (typeof v === 'string') {
    const cut = withoutSecondDeclaration(v);
    if (cut !== v)
      dropped = v
        .slice(cut.length)
        .replace(/^\s*;\s*/, '')
        .trim();
    v = cut;
  }
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
  // A font stack with its quotes escaped, as it sits inside a JSON or JS
  // string (`\"Inter\", sans-serif`): the stack.
  if (typeof v === 'string' && /font/i.test(t) && /\\["']/.test(v))
    v = v.replace(/\\(["'])/g, '$1');
  // A font family's name never starts or ends with a space: French quotes
  // (« Inter », with a no-break or narrow no-break space) hold the name.
  if (typeof v === 'string' && /font/i.test(t)) v = trimInsideQuotes(v);
  return {thing: t, value: v, ...(dropped ? {dropped} : {})};
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
    /^\s*["']?([a-z][a-z0-9_-]*|--[a-z0-9-]+)["']?\s*[:=]\s*["']?(.+?)["']?\s*;?\s*$/i.exec(
      String(value),
    );
  if (!m) return null;
  // A label in camelCase or snake_case (textSize, text_size) is the dial.
  const label = m[1]
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
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
    /^\{?\s*["']?(light|dark)["']?\s*[:=]\s*(.+?)\s*(?:[;,]\s*|\s+)["']?(light|dark)["']?\s*[:=]\s*(.+?)\s*;?\s*\}?$/i.exec(
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

/**
 * A value without the debris a copy brings along: a trailing `;`, a
 * `!important`, a comment. One of the exact cleanups a repair may offer.
 * @param {string} v
 * @returns {string}
 */
export function withoutCopyDebris(v) {
  return String(v)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*!\s*important\b/gi, '')
    .replace(/[\s;]+$/, '')
    .trim();
}

/**
 * Words with a documented reading on a CSS property: the exact value each
 * one means. A repair may offer these for the word typed.
 * @type {Record<string, Record<string, string>>}
 */
export const PROPERTY_WORDS = wordTable({
  opacity: {
    half: '0.5',
    'half-transparent': '0.5',
    opaque: '1',
    solid: '1',
  },
  'text-transform': {
    caps: 'uppercase',
    'all-caps': 'uppercase',
    upper: 'uppercase',
    lower: 'lowercase',
    title: 'capitalize',
    'no-caps': 'none',
  },
  'border-radius': {
    round: '9999px',
    rounded: '9999px',
    pill: '9999px',
    circle: '50%',
    square: '0',
  },
});

/** Weight words beyond the headings dial's, as their numbers. */
export const WEIGHT_WORDS = wordTable(
  /** @type {Record<string, string>} */ ({
    thin: '100',
    extralight: '200',
    light: '300',
    regular: '400',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
    extrabold: '800',
    ultrabold: '800',
    black: '900',
  }),
);

/**
 * Tailwind's radius classes, as the corners value each one is.
 * @type {Record<string, string>}
 */
export const TAILWIND_RADIUS = wordTable({
  'rounded-none': 'square',
  'rounded-sm': '2px',
  rounded: '4px',
  'rounded-md': '6px',
  'rounded-lg': '8px',
  'rounded-xl': '12px',
  'rounded-2xl': '16px',
  'rounded-3xl': '24px',
  'rounded-full': 'pill',
});

/** Words for more or less room, as the spacing rung each one means. */
export const DENSITY_WORDS = wordTable(
  /** @type {Record<string, string>} */ ({
    airy: 'roomy',
    loose: 'roomy',
    relaxed: 'roomy',
    comfortable: 'roomy',
    open: 'roomy',
    sparse: 'roomy',
    generous: 'roomy',
    dense: 'compact',
    cramped: 'compact',
    condensed: 'compact',
    packed: 'compact',
  }),
);

/**
 * A typed value as the repair gate reads it, in one reading: escapes and
 * full-width characters as the characters they are, a letter O inside a
 * number as a zero, a comma between digits as a decimal point (or before
 * exactly three digits, after a whole number other than 0, a thousands
 * mark), and without what is not the value: quotes and braces around it, a
 * label before it (`accent: red`), a flag inside it (`--mode dark`) or a
 * flag's label after it (`mode: dark`), copy debris (`;`, `!important`,
 * comments), and the axes of a Google Fonts family spec (`Inter:wght@400`
 * is the family Inter).
 * @param {string} typed
 * @returns {string}
 */
export function typedReading(typed) {
  let t = String(typed ?? '')
    .replace(/\\(?:u\{?([0-9a-f]{4,6})\}?|x([0-9a-f]{2}))/gi, (_, u, x) =>
      String.fromCodePoint(parseInt(u ?? x, 16)),
    )
    .replace(/\\(?=[#"' ])/g, '')
    .normalize('NFKC')
    .trim();
  t = t
    .replace(
      /\s+--(mode|state|on|when)(?:\s*=\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi,
      '',
    )
    .replace(
      /\s+(mode|theme|state|part|on|variant|size|when)\s*[:=]\s*[a-z][a-z0-9:-]*\s*;?\s*$/i,
      '',
    );
  t = withoutCopyDebris(t)
    // A flag's label before the value (`state=hover 4px`).
    .replace(
      /^(mode|theme|state|part|on|variant|size|when)\s*[:=]\s*[a-z][a-z0-9:-]*\s+(?=\S)/i,
      '',
    );
  const spec = /^([a-z][a-z +]*):(?:ital,)?(?:wght|ital)@/i.exec(t);
  if (spec) t = spec[1].replace(/\+/g, ' ');
  t = colorPair(t)
    ? t
    : t.replace(
        /^\s*\{?\s*["']?(?:--)?[a-z][a-z0-9 _-]*["']?\s*[:=](?!\/\/)\s*/i,
        '',
      );
  t = t
    .replace(/["']?\s*\}\s*$/, '')
    .replace(
      /^(["'`\u201C\u2018\u300C\u300E\u00AB])(.*?)(["'`\u201D\u2019\u300D\u300F\u00BB])$/,
      '$2',
    )
    .replace(/,\s*$/, '')
    .trim();
  t = commaNumbers(
    t
      .replace(/(\d)([oO]+)(?![a-z])/g, (_, d, os) => d + '0'.repeat(os.length))
      // A dot after a number's digits (`18.`, `16.px`) is no part of it, and
      // a unit split off by a space (`20 px`) is its number's.
      .replace(/(\d)\.(?=[a-z%]|\s|$)/gi, '$1')
      .replace(/(\d)\s+(px|rem|em|pt|%)(?![a-z])/gi, '$1$2'),
  )
    .replace(/\b0x([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi, '#$1')
    .toLowerCase();
  // An app's own variable with a fallback (`var(--brand, #e11d48)`) is the
  // fallback; Tailwind's arbitrary value (`rounded-[12px]`) is the value.
  t = t
    .replace(/^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/, '$1')
    .replace(/^[a-z]+(?:-[a-z]+)?-\[(.+)\]$/, '$1');
  // A light and a dark color typed as a pair (`light: red; dark: blue`,
  // `red / blue`) is that light-dark() pair.
  const pair = colorPair(t);
  return pair ? `light-dark(${pair.light}, ${pair.dark})` : t;
}

/**
 * A text with each comma between digits, outside parentheses, read as a
 * number mark: before exactly three digits after a whole number other than
 * 0 (`1,000`), a thousands mark; otherwise (`1,5`, `0,500`) a decimal
 * point. Inside a function (`rgb(255,0,0)`) a comma separates arguments.
 * @param {string} text
 * @returns {string}
 */
export function commaNumbers(text) {
  // Only outside parentheses: inside a function (`rgb(255,0,0)`,
  // `cubic-bezier(0,0,1,1)`) a comma separates its arguments.
  let depth = 0;
  let out = '';
  let plain = '';
  const flush = () => {
    out += plain.replace(/(\d+),(\d+)(?![\d.,])/g, (_, a, b) =>
      b.length === 3 && !/^0+$/.test(a) ? `${a}${b}` : `${a}.${b}`,
    );
    plain = '';
  };
  for (const c of String(text)) {
    if (c === '(') {
      if (depth === 0) flush();
      depth += 1;
    }
    if (depth > 0) out += c;
    else plain += c;
    if (c === ')' && depth > 0) depth -= 1;
  }
  flush();
  return out;
}

/** The CSS functions a value is written in, whose names carry no value. */
const FORM =
  /\b(?:light-dark|var|calc|(?:repeating-)?(?:linear|radial|conic)-gradient)\(/g;

/**
 * The tokens of a value: its words and numbers in order, the names of the
 * functions it is written in out.
 * @param {string} text already read (typedReading) or as offered
 * @returns {string[]}
 */
function tokensOf(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(FORM, '(')
      .match(/[a-z0-9.%]+/g) ?? []
  );
}

/** @param {string} w */
const numberOf = w => {
  const m = /^(\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em|pt|%)?$/.exec(w);
  return m ? {n: Number(m[1]), unit: m[2] ?? ''} : null;
};

/**
 * Whether two tokens are one: the same word, or the same number with a
 * unit added or taken off (`1.5` and `1.5px`; the vet checks the setting
 * takes it).
 * @param {string} a @param {string} b
 */
const sameToken = (a, b) => {
  if (a === b) return true;
  const x = numberOf(a);
  const y = numberOf(b);
  return Boolean(x && y && x.n === y.n && (!x.unit || !y.unit));
};

/**
 * The numbers one typed token may be read as, each exact: as it is, rem or
 * em in px (x16), pt in px (x4/3), a percent as a share of one or of the
 * 16px base size, a share of one as a percent.
 * @param {string} w
 * @returns {Set<string>}
 */
function numberReadings(w) {
  const r2 = (/** @type {number} */ x) => String(Math.round(x * 100) / 100);
  const m = numberOf(w);
  /** @type {Set<string>} */
  const out = new Set();
  if (!m) return out;
  out.add(r2(m.n));
  if (m.unit === 'rem' || m.unit === 'em') out.add(r2(m.n * 16));
  if (m.unit === 'pt') out.add(r2((m.n * 4) / 3));
  if (m.unit === '%') {
    out.add(r2(m.n / 100));
    out.add(r2((m.n * 16) / 100));
  }
  if (!m.unit && m.n > 0 && m.n < 1) out.add(r2(m.n * 100));
  return out;
}

/**
 * Whether the numbers of `offered` are the numbers of the whole typed
 * value written another exact way: position by position (numberReadings),
 * or one number that is a calc() of the typed lengths worked out. The rest
 * of `offered` is units and form words only.
 * @param {string} offered
 * @param {string} t the typed value, read
 */
function numbersEqual(offered, t) {
  const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
  const rest = offered
    .replace(NUM, '')
    .replace(/px|rem|em|%|[\s(),/*+-]|calc|var/g, '');
  const want = offered.match(NUM)?.map(w => Math.abs(Number(w))) ?? [];
  if (!want.length || rest) return false;
  const r2 = (/** @type {number} */ x) => String(Math.round(x * 100) / 100);
  const typedNumbers = (
    t.match(/\d*\.?\d+(?:e[+-]?\d+)?(?:px|rem|em|pt|%)?/gi) ?? []
  ).map(numberReadings);
  // The typed value is numbers only (any words in it are read elsewhere).
  if (
    tokensOf(t).every(w => numberOf(w)) &&
    typedNumbers.length === want.length &&
    want.every((w, i) => typedNumbers[i].has(r2(w)))
  )
    return true;
  if (want.length !== 1) return false;
  const inner = /^\s*calc\(([^()]*)\)\s*$/i.exec(t)?.[1];
  if (!inner) return false;
  const scale =
    /^\s*(\d*\.?\d+)\s*(px|rem|em)?\s*([*/])\s*(\d*\.?\d+)\s*$/i.exec(inner);
  if (scale) {
    const a = Number(scale[1]) * (/r?em/i.test(scale[2] ?? '') ? 16 : 1);
    return (
      r2(scale[3] === '*' ? a * Number(scale[4]) : a / Number(scale[4])) ===
      r2(want[0])
    );
  }
  if (/[*/]/.test(inner)) return false;
  let total = 0;
  for (const m of inner.matchAll(/([+-]?)\s*(\d*\.?\d+)\s*(px|rem|em)?/gi)) {
    const x = Number(m[2]) * (/r?em/i.test(m[3] ?? '') ? 16 : 1);
    total += m[1] === '-' ? -x : x;
  }
  return r2(total) === r2(want[0]);
}

/**
 * Documented readings: each typed word and the exact value it means,
 * registered by the table that documents it (a dial's words, a Tailwind
 * class, a property word). A repair may offer only these for a word that
 * was not typed as the value.
 * @type {Map<string, Set<string>>}
 */
const READINGS = new Map();

/**
 * Register a documented table's readings with the repair allowlist.
 * @param {Iterable<[string, string]>} pairs typed word, value it means
 */
export function documentReadings(pairs) {
  for (const [w, v] of pairs) {
    const k = String(w).trim().toLowerCase();
    if (!READINGS.has(k)) READINGS.set(k, new Set());
    /** @type {Set<string>} */ (READINGS.get(k)).add(String(v).toLowerCase());
  }
}

/**
 * Documented numeric tables (a rung and its number), each for the settings
 * that document it, registered where it is defined: a number typed for one
 * of those settings may be offered as its nearest rung.
 * @type {Array<{things: string[], table: Array<[string, number]>, domain: [number, number]}>}
 */
const NUMERIC_TABLES = [];

/**
 * Register a documented numeric table with the repair allowlist.
 * @param {string[]} things the settings whose values the table reads (a
 *   name ending in `*` names every setting it starts)
 * @param {Array<[string, number]>} table
 * @param {[number, number]} [domain] the numbers the table reads (by
 *   default every number)
 */
export function documentNumericTable(
  things,
  table,
  domain = [-Infinity, Infinity],
) {
  if (table.length) NUMERIC_TABLES.push({things, table, domain});
}

/**
 * Documented ranges: a number typed past either end of a setting's range
 * may be offered as that end.
 * @type {Array<{things: string[], min: number, max: number}>}
 */
const RANGES = [];

/**
 * Register a setting's documented range with the repair allowlist.
 * @param {string[]} things as for documentNumericTable
 * @param {number} min
 * @param {number} max
 */
export function documentRange(things, min, max) {
  RANGES.push({things, min, max});
}

/**
 * Whether a registered setting list names a setting.
 * @param {string[]} things
 * @param {string} key
 */
const names = (things, key) =>
  things.some(t =>
    t.endsWith('*') ? key.startsWith(t.slice(0, -1)) : t === key,
  );

/**
 * Values a setting documents as its own fallback, which a refusal may
 * offer whatever was typed: no base, the modes.
 * @type {Record<string, string[]>}
 */
const DECLARED_VALUES = wordTable({
  base: ['none'],
  mode: ['both', 'light-only', 'dark-only'],
});

/** The dials with a scale, which `more` and `less` step. */
const SCALED_DIALS = Object.keys(DIALS).filter(d =>
  String(DIALS[d].values ?? '')
    .split('|')
    .includes('more'),
);

/**
 * What a suggested value reads of the typed value: `true` when it is the
 * whole value under one of the gate's declared sources, an array of the
 * typed tokens it carries when it carries only part of them (one setting
 * of a value that holds several, as `Inter 600` holds a family and a
 * weight), or `false` when it reads nothing typed.
 *
 * The declared sources: (1) the value typed, under the exact readings of
 * typedReading, sameToken and numbersEqual, the words joined into a CSS
 * color name (`dark red` is darkred), or the color the typed color is
 * (rgb() as its hex, a see-through color opaque); (2) a documented table
 * registered with documentReadings, documentNumericTable or documentRange;
 * (3) the theme's own saved value of the line's setting, for a setting
 * other than the one typed (a keep or unlock line); (4) the setting's
 * documented fallback, or a step (`more`, `less`) on a dial with a scale,
 * offered for that dial or one of its tokens; (5) the correction of a
 * typo (typoOf). Several values of one kind typed for a setting that takes
 * one (`1.5 2`) may be read as the first.
 * @param {{offered: string, typed: string, thing?: string, typedThing?: string, saved?: Map<string, string[]>, mode?: string}} line
 * @returns {true | number[] | false}
 */
export function readsTyped({
  offered,
  typed,
  thing = '',
  typedThing = '',
  saved,
  mode = '',
}) {
  const o = String(offered)
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .toLowerCase();
  const t = typedReading(typed);
  const key = String(thing).toLowerCase();
  const typedKey = String(typedThing || thing).toLowerCase();
  const T = tokensOf(t);
  const O = tokensOf(o);
  // (1) The value typed.
  if (
    O.length &&
    O.length === T.length &&
    O.every((w, i) => sameToken(w, T[i]))
  )
    return true;
  if (O.length === 1 && T.length > 1 && O[0] === T.join('')) return true;
  if (numbersEqual(o, t)) return true;
  const color = parseColor(t);
  if (
    /^#[0-9a-f]{3,8}$/.test(o) &&
    (color ? hex(color) === o : colorProblem(t)?.opaque === o)
  )
    return true;
  // One half of a light and a dark pair: for the line that sets that mode,
  // or, as the light one, for a color dial, which makes both modes from
  // one color.
  const half = /^light-dark\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(t);
  if (half) {
    const [light, dark] = [half[1], half[2]];
    const only = /^(light|dark)-only$/.exec(saved?.get('mode')?.[0] ?? '')?.[1];
    const shown = mode || only || '';
    if (shown === 'dark' ? o === dark : shown === 'light' ? o === light : false)
      return true;
    if (o === light && DIALS[key] && !key.startsWith('--')) return true;
  }
  // A base named by its package (@astryxdesign/theme-butter is butter).
  if (key === 'base' && t.replace(/^(@astryxdesign\/)?theme-/, '') === o)
    return true;
  // (2) A documented reading of the whole value.
  const whole = [t, t.replace(/\s+/g, '-'), t.replace(/[\s-]+/g, '')];
  if (whole.some(k => READINGS.get(k)?.has(o))) return true;
  // A scale factor written as the dial's help writes it (x0.75) is that
  // number.
  const n = T.length === 1 ? numberOf(T[0].replace(/^x(?=\.?\d)/, '')) : null;
  if (n) {
    for (const {things, table, domain} of NUMERIC_TABLES)
      if (names(things, key) && n.n >= domain[0] && n.n <= domain[1]) {
        const [rung] = table.reduce((a, b) =>
          Math.abs(b[1] - n.n) < Math.abs(a[1] - n.n) ? b : a,
        );
        if (rung === o) return true;
      }
    for (const {things, min, max} of RANGES)
      if (names(things, key))
        if (
          (n.n > max && o === String(max)) ||
          (n.n < min && o === String(min))
        )
          return true;
    // A radius at or below zero is square; at or past half, or 1000px, pill.
    const signed = Number(/^-?\d*\.?\d+/.exec(t)?.[0] ?? NaN);
    if (key === 'corners' && o === 'square' && signed <= 0) return true;
    if (
      key === 'corners' &&
      o === 'pill' &&
      ((n.unit === '%' && n.n >= 50) || n.n >= 1000)
    )
      return true;
  }
  // Rounding said with a negation (not round, unrounded, rounded-none).
  if (
    o === 'square' &&
    /round/.test(t) &&
    /(^|[\s-])(not|no|non|without|never|less)([\s-]|$)|^un|-none$/.test(t)
  )
    return true;
  // (3) A saved value of the line's own setting, never the one typed.
  if (
    key &&
    key !== typedKey &&
    saved?.get(key)?.some(v => typedReading(v) === o)
  )
    return true;
  // (4) A documented fallback; a step on a dial with a scale.
  if (Object.hasOwn(DECLARED_VALUES, key) && DECLARED_VALUES[key].includes(o))
    return true;
  if (
    /^(more|less)$/.test(t) &&
    SCALED_DIALS.includes(typedKey) &&
    (key === typedKey || key.startsWith('--'))
  )
    return true;
  // A CSS font shorthand typed for a font family setting is its family:
  // what follows the size (`italic 700 16px/1.4 Georgia, serif`).
  // For the setting typed (the font dial, a family token) that is the
  // whole reading; for one longhand of a part's font it is the family's
  // part, beside the lines for the other longhands.
  if (/^font(-family)?$|^--font-family/.test(key)) {
    const family = /(?:^|\s)\d*\.?\d+(?:px|rem|em|pt|%)(?:\/\S+)?\s+(.+)$/.exec(
      t,
    )?.[1];
    const F = family ? tokensOf(family) : [];
    if (F.length && F.length === O.length && O.every((w, i) => w === F[i]))
      return key === typedKey
        ? true
        : Array.from({length: F.length}, (_, i) => T.length - F.length + i);
  }
  // (5) A typo, of a word or of a number's unit (16pxx is 16px).
  // The typed value is one word, dashes and all (`not-alowed` is one
  // keyword typed, not two words).
  if (/^[a-z][a-z-]*$/.test(t) && typoOf(t, o)) return true;
  const typedUnit = /^(\d*\.?\d+)([a-z]+)$/.exec(t);
  const offeredUnit = /^(\d*\.?\d+)([a-z]+)$/.exec(o);
  if (
    typedUnit &&
    offeredUnit &&
    typedUnit[1] === offeredUnit[1] &&
    // A unit is a short word: one edit, two letters swapped as one.
    levenshteinDistance(typedUnit[2], offeredUnit[2], 1, {swaps: true}) <= 1
  )
    return true;
  // Several values of one kind for a setting that takes one: the first
  // (the one reading the repair that offers it uses, sameKindValues).
  const same = sameKindValues(t);
  if (same) {
    const first = tokensOf(same.items[0]);
    if (first.length === O.length && O.every((w, i) => sameToken(w, first[i])))
      return true;
  }
  // Part of the value: a run of its tokens, or a documented reading of one.
  // (currentcolor stands for the color another line of the refusal sets:
  // the shape of a border in both modes, its color in one.)
  const part = O.filter(w => w !== 'currentcolor');
  if (part.length && part.length < T.length)
    for (const same of [
      (/** @type {string} */ a, /** @type {string} */ b) => a === b,
      sameToken,
    ])
      for (let i = 0; i + part.length <= T.length; i += 1)
        if (part.every((w, j) => same(w, T[i + j])))
          return Array.from({length: part.length}, (_, j) => i + j);
  for (const [i, w] of T.entries()) {
    if (T.length < 2) break;
    if (READINGS.get(w)?.has(o)) return [i];
    const m = numberOf(w);
    if (m)
      for (const {things, table, domain} of NUMERIC_TABLES)
        if (names(things, key) && m.n >= domain[0] && m.n <= domain[1]) {
          const [rung] = table.reduce((a, b) =>
            Math.abs(b[1] - m.n) < Math.abs(a[1] - m.n) ? b : a,
          );
          if (rung === o) return [i];
        }
  }
  return false;
}

/**
 * Whether the lines of one refusal, taken together, carry the whole typed
 * value: each reads it whole, or the parts they carry cover every typed
 * token. A part alone (`all` for `all 200`, `bold` for `extra bold`) is not
 * offered.
 * @param {Array<true | number[] | false>} reads
 * @param {string} typed
 */
export function coversTyped(reads, typed) {
  const T = tokensOf(typedReading(typed));
  // By token, counted: two lines may each carry one of two equal words
  // (`normal normal 16px serif`).
  /** @type {Map<string, number>} */
  const carried = new Map();
  for (const r of reads)
    if (Array.isArray(r))
      for (const i of r) carried.set(T[i], (carried.get(T[i]) ?? 0) + 1);
  /** @type {Map<string, number>} */
  const typedCount = new Map();
  for (const w of T) typedCount.set(w, (typedCount.get(w) ?? 0) + 1);
  return [...typedCount].every(([w, n]) => (carried.get(w) ?? 0) >= n);
}

/**
 * Whether a repair may offer `offered` as the whole typed value (the gate,
 * with no setting named).
 * @param {string} offered
 * @param {string} typed
 */
export const offersTyped = (offered, typed) =>
  readsTyped({offered, typed}) === true;

/**
 * Whether the values a refusal offers for one setting carry what was typed
 * (see readsTyped and coversTyped).
 * @param {string[]} offered
 * @param {string} typed
 */
export function offersAllTyped(offered, typed) {
  const reads = offered.map(o => readsTyped({offered: o, typed}));
  if (reads.includes(false)) return false;
  return reads.every(r => r === true) || coversTyped(reads, typed);
}

/** The gate's word for the whole typed value (tests and old callers). */
export const carriesTyped = offersTyped;

documentReadings([
  ['more', 'less'],
  ['less', 'more'],
]);
documentReadings(Object.entries(TAILWIND_RADIUS));
documentReadings(Object.values(PROPERTY_WORDS).flatMap(m => Object.entries(m)));
documentReadings(Object.entries(WEIGHT_WORDS));
documentReadings(Object.entries(WEIGHT_WORDS).map(([w, n]) => [n, w]));
documentReadings(Object.entries(DENSITY_WORDS));

/**
 * Whether a repair line may offer `offered` as the whole typed value (see
 * readsTyped).
 * @param {{offered: string, typed: string, thing?: string, typedThing?: string, saved?: Map<string, string[]>, mode?: string}} line
 */
export const allowedLine = line => readsTyped(line) === true;

/**
 * Whether a typed word is a typo of a word: both words of four letters or
 * more, within one edit for a typed word of five letters or fewer and two
 * for a longer one (`nnone` is none, `normall` normal; `line` is no none).
 * @param {string} typed
 * @param {string} word
 */
export function typoOf(typed, word) {
  const t = String(typed).trim().toLowerCase();
  const w = String(word).trim().toLowerCase();
  return (
    /^[a-z][a-z-]{3,}$/.test(t) && /^[a-z][a-z-]{3,}$/.test(w) && typoNear(t, w)
  );
}

/**
 * The edits a typo of a typed word may hold: none for a word under four
 * letters (leading dashes aside), so only that word in other letters is
 * near it; one for a word of five letters or fewer; two for a longer one.
 * Every typo reading of the editor (a value, a setting, a part, a state, a
 * theme or token name) uses this limit.
 * @param {string} typed
 */
export const typoLimit = typed => {
  const n = String(typed).trim().replace(/^-+/, '').length;
  return n < 4 ? 0 : n <= 5 ? 1 : 2;
};

/**
 * Whether `word` is within the typo limit of `typed` (two letters swapped
 * count as one edit, as typed: flxe is flex).
 * @param {string} typed
 * @param {string} word
 */
export function typoNear(typed, word) {
  const t = String(typed).trim().toLowerCase();
  const limit = typoLimit(t);
  return (
    levenshteinDistance(t, String(word).trim().toLowerCase(), limit, {
      swaps: true,
    }) <= limit
  );
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works.
 *
 * @position api/theme-edit — checks over the part data
 */

import {createRequire} from 'node:module';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {CSS_PROPERTIES} from './_css-properties.mjs';
import {
  AUTO_SPREAD,
  COLOR_PROPS,
  COMMON_STATES,
  CORNERS,
  DIALS,
  FAMILIES,
  FONTS,
  GROUPS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  HOW,
  OPEN_FONTS,
  CSS_WIDE_KEYWORDS,
  P,
  SPACING,
  TEXT_SIZE,
  THING_HINTS,
  familyOf,
} from './_tables.mjs';
import {
  COLOR_NAMES,
  colorProblem,
  isColorValue,
  isNumber,
  isSafeValue,
  isSize,
  parseColor,
} from './_color.mjs';
import {
  PALETTE_DIALS,
  PALETTE_TOKENS,
  VIBRANCY_DEFAULT,
  isGraySeed,
  paletteToken,
  seedOf,
} from './_palette.mjs';
import {
  camel,
  kebab,
  nearest,
  partDefault,
  partsOf,
  refuse,
  lengthPx,
  radiusAt,
} from './_settings.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

export {lengthPx};

/**
 * A token's value in px, following var() references through the tokens.
 * @param {{light: Record<string, string>}} base
 * @param {string} token
 * @returns {number | null}
 */
function tokenPx(base, token) {
  let v = base.light[token] ?? '';
  for (let i = 0; i < 5; i++) {
    const ref = /^\s*var\((--[\w-]+)\)\s*$/.exec(v);
    if (!ref) break;
    v = base.light[ref[1]] ?? '';
  }
  return lengthPx(v);
}

/** @param {string} v */
const cornerPxOf = v =>
  CORNERS.find(([n]) => n === v)?.[1] ?? lengthPx(v) ?? Number.NaN;

const E = ERROR_CODES;

/**
 * The value to carry into a suggestion for another dial: the one given when
 * that dial takes it, else the dial's example.
 * @param {string} dial @param {string} v
 */
function valueFor(dial, v) {
  if (PALETTE_DIALS.includes(dial)) return colorProblem(v) ? '#7c3aed' : v;
  if (dial === 'vibrancy')
    return /^(more|less)$/.test(v) || (/^\d{1,3}$/.test(v) && Number(v) <= 100)
      ? v
      : '60';
  return v;
}

/**
 * The other words for each color dial and vibrancy (gray, brand, error,
 * saturation), from the dial tables, without words that name a part, a CSS
 * property or a plain color.
 */
const COLOR_DIAL_WORDS = (() => {
  const generic = new Set([
    'color',
    'colour',
    'text',
    'background',
    'border',
    'surface',
    'surfaces',
    'main',
    'key',
    'link',
    'selection',
    'seed',
    'status',
    'tint',
    'highlight',
    'muted',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
  ]);
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const d of [...PALETTE_DIALS, 'vibrancy'])
    for (const w of String(DIALS[d]?.words ?? '').split(/\s+/)) {
      if (!w || w === d || generic.has(w)) continue;
      out.set(w, [...(out.get(w) ?? []), d]);
    }
  return out;
})();

/**
 * @typedef {object} SetFlags
 * @property {string} [on]
 * @property {string} [when]
 * @property {string} [state]
 * @property {string} [mode]
 * @property {boolean} [only]
 */

/**
 * The first exact token setting whose value the type rules refuse now (a
 * hand edit, or a value an earlier release took), with why; null when all
 * pass. `skip` is the thing the command changes or removes.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} [skip]
 * @returns {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean}>} every saved setting the editor no longer accepts
 */
export function storedProblems(ctx, slug, data, skip = '') {
  /** @type {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean}>} */
  const found = [];
  const TOKENS = ctx.project.core.tokenDefaults;
  // Where each saved setting applies names a real part, group, state and
  // variant of this Core, as `set` checks them.
  const WHOLE_ONLY = [
    'surfaces',
    'buttons',
    'base',
    'mode',
    'vibrancy',
    'text-size',
    'headings',
    'type',
    ...PALETTE_DIALS,
  ];
  for (const s of data.settings) {
    if (s.thing === skip) continue;
    /** @param {string} why */
    const scope = why => ({setting: s, why, scope: true});
    const problem = (() => {
      const t = s.on ? ctx.project.target.get(s.on) : null;
      if (s.on && !t && !FAMILIES[s.on])
        return scope(`there is no part or group "${s.on}"`);
      if (s.source === 'dial' && s.on && WHOLE_ONLY.includes(s.thing))
        return scope(`${s.thing} applies to the whole theme, not to ${s.on}`);
      if (s.mode && s.source === 'dial' && !PALETTE_DIALS.includes(s.thing))
        return scope(`${s.thing} is the same in light and dark`);
      if (t && s.state && ![...t.states, ...COMMON_STATES].includes(s.state))
        return scope(`"${s.state}" is not a state of ${s.on}`);
      if (t && s.when) {
        const [prop, value] = String(s.when).split(':');
        const values = ctx.C.variantValues(/** @type {string} */ (s.on));
        if (!(prop in values)) return scope(`${s.on} has no prop "${prop}"`);
        if (values[prop].length && !values[prop].includes(value))
          return scope(`${s.on} has no ${prop} "${value}"`);
      }
      return null;
    })();
    if (problem) found.push(problem);
  }
  for (const s of data.settings) {
    if (s.source !== 'token' || s.thing === skip || !(s.thing in TOKENS))
      continue;
    try {
      checkTypedValue(
        ctx.C.typeOf(s.thing),
        s.value,
        s.thing,
        TOKENS,
        ctx.C.typeOf,
        slug,
      );
      checkCycle(s.thing, s.value, TOKENS, data);
    } catch (e) {
      found.push({
        setting: s,
        why:
          e instanceof Error
            ? e.message.replace(/ Nothing was changed\.$/, '')
            : String(e),
      });
    }
  }
  return found;
}

/**
 * A value of a type to put in a suggestion, so a suggested command runs.
 * @param {string} type
 * @param {string} name
 */
export function exampleOf(type, name) {
  return (
    {
      color: '#1f2937',
      size: '6px',
      number: /weight/.test(name) ? '600' : '1.4',
      time: '150ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      font: 'Inter, sans-serif',
      shadow: '0 2px 4px rgb(0 0 0 / 0.2)',
    }[type] ?? (/style/.test(name) ? 'solid' : '0')
  );
}

/**
 * The value type a CSS property takes, for an example value.
 * @param {string} prop
 */
function groupOfPropType(prop) {
  if (COLOR_PROPS.test(prop)) return 'color';
  if (/shadow/.test(prop)) return 'shadow';
  if (/weight|line-height|opacity/.test(prop)) return 'number';
  if (/family/.test(prop)) return 'font';
  return 'size';
}

/**
 * Refuse a value that does not parse as the token's type.
 * @param {string} type @param {string} value @param {string} name
 * @param {Record<string, unknown>} TOKENS
 * @param {(token: string) => string} typeOf
 * @param {string} slug
 */
function checkTypedValue(type, value, name, TOKENS, typeOf, slug) {
  /** @param {string} what @param {string} example */
  const bad = (what, example) =>
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is ${what}; "${value}" is not one.`,
      {run: [`${P} set ${slug} ${name} ${quoteCommandArgument(example)}`]},
    );
  if (!isSafeValue(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.`,
      {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
        ],
      },
    );
  // A var() naming a design token must name one of the same kind; the
  // app's own variables are its business.
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*(,.*)?\)$/i.exec(value.trim());
  if (ref) {
    if (ref[1] in TOKENS && typeOf(ref[1]) !== type && type !== 'other')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${name} is a ${type}; ${ref[1]} is a ${typeOf(ref[1])}.`,
        {
          run: [
            `${HOW} --list tokens ${name.replace(/^--/, '').split('-')[0]}`,
          ],
        },
      );
    return;
  }
  if (type === 'color' && !isFixedColor(value)) bad('a color', '#1f2937');
  if (type === 'size' && !isSize(value, name)) bad('a size', '6px');
  if (type === 'number' && !isNumber(value, name))
    bad('a number', /weight/.test(name) ? '600' : '1.4');
  if (type === 'time' && !isTime(value)) bad('a time up to 60s', '150ms');
  if (type === 'easing' && !isEasing(value))
    bad('an easing', 'cubic-bezier(0.2, 0, 0, 1)');
  if (type === 'font' && !isFamilyList(value))
    bad('a font family list', 'Inter, sans-serif');
  if (type === 'shadow' && !isShadow(value))
    bad('a shadow', '0 2px 4px rgb(0 0 0 / 0.2)');
  if (
    /^--focus-outline-style$/.test(name) &&
    !/^(none|solid|dashed|dotted|double|groove|ridge|inset|outset|auto)$/.test(
      value.trim(),
    )
  )
    bad('an outline style', 'solid');
}

/**
 * Whether a value is a color that works on its own and inside
 * `light-dark()`: a color this editor can read, or one of the color
 * functions and keywords it cannot read but CSS can; never a CSS-wide
 * keyword or a function with broken insides.
 * @param {string} value
 * @returns {boolean}
 */
function isFixedColor(value) {
  const v = value.trim().toLowerCase();
  if (['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(v))
    return false;
  if (/^var\(/.test(v)) return true;
  if (SYSTEM_COLORS.includes(v)) return true;
  const inner = (/** @type {string} */ fn) =>
    splitTop(v.slice(fn.length + 1, -1), ',').map(x => x.trim());
  // Each mode's value, and each mixed color, must be a color itself.
  if (/^light-dark\(.*\)$/.test(v)) {
    const args = inner('light-dark');
    return args.length === 2 && args.every(isFixedColor);
  }
  if (/^color-mix\(.*\)$/.test(v)) {
    const [space, ...colors] = inner('color-mix');
    return (
      /^in\s+[a-z-]+/.test(space ?? '') &&
      colors.length === 2 &&
      colors.every(c => isFixedColor(c.replace(/\s+\d*\.?\d+%$/, '')))
    );
  }
  if (!isColorValue(v)) return false;
  // A relative color or channels from variables are read by the browser.
  if (/\bfrom\b|var\(|calc\(/.test(v)) return true;
  if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(v))
    return parseColor(v) != null;
  if (/^color\(/.test(v))
    return /^color\((srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\s/.test(
      v,
    );
  return true;
}

/** CSS system colors, which the browser resolves. */
const SYSTEM_COLORS = [
  'canvas',
  'canvastext',
  'linktext',
  'visitedtext',
  'activetext',
  'buttonface',
  'buttontext',
  'buttonborder',
  'field',
  'fieldtext',
  'highlight',
  'highlighttext',
  'selecteditem',
  'selecteditemtext',
  'mark',
  'marktext',
  'graytext',
  'accentcolor',
  'accentcolortext',
];

/**
 * Whether a value is a time the browser takes, at most a minute.
 * @param {string} value
 */
function isTime(value) {
  const v = value.trim().toLowerCase();
  if (/^(calc|min|max|clamp)\(/.test(v)) return true;
  const m = /^\+?(\d*\.?\d+(?:e[+-]?\d+)?)(ms|s)$/.exec(v);
  if (!m) return false;
  const ms = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
  return ms <= 60_000;
}

/**
 * Whether a value is an easing the browser takes: a keyword, a cubic-bezier
 * with four numbers (x1 and x2 from 0 to 1), steps(n), or linear() with two
 * stops or more.
 * @param {string} value
 */
function isEasing(value) {
  const v = value.trim().toLowerCase();
  if (
    /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/.test(v)
  )
    return true;
  const m = /^(cubic-bezier|steps|linear)\((.*)\)$/.exec(v);
  if (!m) return false;
  const args = splitTop(m[2], ',').map(x => x.trim());
  if (args.some(a => /var\(/.test(a))) return true;
  const num = (/** @type {string} */ a) => /^[+-]?\d*\.?\d+$/.test(a);
  if (m[1] === 'cubic-bezier')
    return (
      args.length === 4 &&
      args.every(num) &&
      [0, 2].every(i => Number(args[i]) >= 0 && Number(args[i]) <= 1)
    );
  if (m[1] === 'steps')
    return (
      /^\d+$/.test(args[0] ?? '') &&
      Number(args[0]) >= 1 &&
      args.length <= 2 &&
      (args.length === 1 ||
        /^(jump-start|jump-end|jump-none|jump-both|start|end)$/.test(
          args[1],
        )) &&
      !(args[1] === 'jump-none' && Number(args[0]) < 2)
    );
  return args.length >= 2 && args.every(a => /^[+-]?\d*\.?\d+(\s|$)/.test(a));
}

/**
 * Whether a value is a font family list: each family a quoted name, a name
 * of words that do not start with a digit, or a var().
 * @param {string} value
 */
function isFamilyList(value) {
  return splitTop(value.trim(), ',').every(f => {
    const t = f.trim();
    return (
      /^"[^"]+"$/.test(t) ||
      /^'[^']+'$/.test(t) ||
      /^var\(/i.test(t) ||
      /^[\p{L}_-][\p{L}\p{N}_-]*(\s+[\p{L}_-][\p{L}\p{N}_-]*)*$/u.test(t)
    );
  });
}

/**
 * Whether a value is a shadow list: each layer is `inset`, two to four
 * lengths, and a color, in any order; or `none`.
 * @param {string} value
 */
function isShadow(value) {
  const v = value.trim();
  if (v === 'none') return true;
  const layers = splitTop(v, ',');
  // light-dark() takes colors: a whole shadow per mode inside it is dropped.
  if (
    layers.length === 1 &&
    splitTop(v, ' ').length === 1 &&
    !/^var\(/i.test(v)
  )
    return false;
  return layers.every(layer => {
    const words = splitTop(layer.trim(), ' ');
    // One var() stacks a shadow token in the list.
    if (words.length === 1 && /^var\(/i.test(words[0])) return true;
    const insets = words.filter(w => w.toLowerCase() === 'inset').length;
    const nums = words.filter(w =>
      /^[+-]?\d*\.?\d+(px|rem|em|pt|pc|cm|mm|in|vw|vh|vmin|vmax|ch|ex|lh)?$|^(calc|min|max|clamp)\(/i.test(
        w,
      ),
    );
    const vars = words.filter(w => /^var\(/i.test(w));
    const rest = words.filter(
      w =>
        !nums.includes(w) && !vars.includes(w) && w.toLowerCase() !== 'inset',
    );
    // A blur (the third length) is never negative.
    if (nums.length >= 3 && nums[2].startsWith('-')) return false;
    // A var() fills a length or the color, whichever is missing.
    const color = rest.length ? 0 : Math.min(1, vars.length);
    const lengths = nums.length + vars.length - color;
    return (
      insets <= 1 &&
      lengths >= 2 &&
      lengths <= 4 &&
      rest.length <= 1 &&
      rest.every(w => isFixedColor(w))
    );
  });
}

/**
 * A value split at `sep` outside brackets: `a(b, c), d` by `,` is
 * [`a(b, c)`, ` d`]. A space separator also splits runs of spaces.
 * @param {string} v
 * @param {',' | ' '} sep
 * @returns {string[]}
 */
function splitTop(v, sep) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of v) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(c) : c === sep)) {
      if (cur.trim() || sep === ',') out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim() || sep === ',') out.push(cur);
  return out.filter(x => sep === ',' || x.trim());
}

/**
 * Refuse a value that would read the token itself, through other tokens.
 * @param {string} thing
 * @param {string} value
 * @param {Record<string, unknown>} TOKENS
 * @param {import('./_settings.mjs').ThemeData} data
 */
function checkCycle(thing, value, TOKENS, data) {
  /** @param {string} t */
  const valueOf = t =>
    String(
      [...data.settings]
        .reverse()
        .find(s => s.source === 'token' && s.thing === t && !s.on)?.value ??
        TOKENS[t] ??
        '',
    );
  const refs = (/** @type {string} */ v) =>
    [...v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(m => m[1]);
  /** @type {string[]} */
  const path = [];
  const seen = new Set();
  /** @param {string} t @returns {boolean} */
  const reaches = t => {
    if (t === thing) return true;
    if (seen.has(t)) return false;
    seen.add(t);
    path.push(t);
    if (refs(valueOf(t)).some(reaches)) return true;
    path.pop();
    return false;
  };
  if (refs(value).some(reaches))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${thing} would read itself${path.length ? ` through ${path.join(', ')}` : ''}, so it would have no value at all.`,
      {
        run: [
          `${P} set ${data.name} ${thing} <a value that does not read ${thing}>`,
        ],
      },
    );
}

const require = createRequire(import.meta.url);
/** @type {any} */
let tree = null;
/** css-tree, loaded on first use. */
const csstree = () => (tree ??= require('css-tree'));

/** What a var() or env() may stand for while the rest of a value is matched. */
const VAR_STANDS_FOR = ['0', '1px', '1ms', 'red', 'ease', 'serif', '0 0 red'];

/**
 * Whether a value matches a property's grammar as css-tree reads it (the
 * browser's grammar, from MDN's data). A var() or env() can hold anything,
 * so the value matches when some ordinary value in its place does.
 * @param {string} prop
 * @param {string} value
 */
function matchesProperty(prop, value) {
  const {lexer, parse} = csstree();
  const vars =
    value.match(/(?:var|env)\([^()]*(?:\([^()]*\)[^()]*)*\)/gi) ?? [];
  /** @param {string} v */
  const tryOne = v => {
    try {
      return !lexer.matchProperty(prop, parse(v, {context: 'value'})).error;
    } catch {
      return false;
    }
  };
  if (vars.length > 3) return false;
  /** @param {string} v @param {number} i @returns {boolean} */
  const fill = (v, i) =>
    i === vars.length
      ? tryOne(v)
      : VAR_STANDS_FOR.some(stand => fill(v.replace(vars[i], stand), i + 1));
  return fill(value, 0);
}

/**
 * The keywords a property's grammar takes, through the types it names.
 * @param {string} prop
 * @returns {string[]}
 */
function keywordsOf(prop) {
  const t = csstree();
  const seen = new Set();
  /** @type {Set<string>} */
  const words = new Set();
  /** @param {any} syntax */
  const walk = syntax => {
    if (!syntax) return;
    t.definitionSyntax.walk(syntax, (/** @type {any} */ n) => {
      if (n.type === 'Keyword') {
        if (!n.name.startsWith('-')) words.add(n.name);
      } else if (n.type === 'Type' && !seen.has(n.name)) {
        seen.add(n.name);
        walk(t.lexer.types[n.name]?.syntax);
      }
    });
  };
  walk(t.lexer.properties[prop]?.syntax);
  return [...words];
}

/**
 * A value the property takes, to put in a suggestion: its initial value
 * from MDN's data (a shorthand's first longhand's).
 * @param {string} prop
 * @returns {string | null}
 */
function initialOf(prop) {
  const mdn = /** @type {Record<string, {initial?: string | string[]}>} */ (
    createRequire(require.resolve('css-tree/package.json'))(
      'mdn-data/css/properties.json',
    )
  );
  const initial = mdn[prop]?.initial;
  if (Array.isArray(initial)) return initial[0] ? initialOf(initial[0]) : null;
  return typeof initial === 'string' && matchesProperty(prop, initial)
    ? initial
    : null;
}

/**
 * A property's grammar as text, cut at a whole term when it is long.
 * @param {any} syntax
 */
function grammarText(syntax) {
  const text = csstree().definitionSyntax.generate(syntax);
  if (text.length <= 120) return text;
  return `${text.slice(0, 120).replace(/\s*\|[^|]*$/, '')} | …`;
}

/**
 * Why a value is not one the property takes, or null. Colors are checked
 * by the editor's own color check; a property css-tree has no grammar for
 * is not checked.
 * @param {string} prop
 * @param {string} value
 * @returns {{takes: string, near: string | null} | null}
 */
function propertyProblem(prop, value) {
  const v = value.trim();
  const known = csstree().lexer.properties[prop];
  if (!known || COLOR_PROPS.test(prop) || matchesProperty(prop, v)) return null;
  const near = /^[a-z-]+$/i.test(v)
    ? (nearest(v.toLowerCase(), keywordsOf(prop))[0] ?? null)
    : null;
  return {
    takes: `a value its CSS grammar takes (${grammarText(known.syntax)})`,
    near: near ?? initialOf(prop),
  };
}

/** Words people use for a dial's values, by dial. */
const DIAL_WORDS = /** @type {Record<string, Record<string, string>>} */ ({
  surfaces: {
    elevated: 'raised',
    elevation: 'raised',
    shadow: 'raised',
    shadows: 'raised',
    lifted: 'raised',
    frosted: 'glass',
    blur: 'glass',
    blurred: 'glass',
    translucent: 'glass',
    bordered: 'outlined',
    border: 'outlined',
    borders: 'outlined',
    lined: 'outlined',
    outline: 'outlined',
    plain: 'flat',
    minimal: 'flat',
  },
  buttons: {
    uppercase: 'caps',
    upper: 'caps',
    allcaps: 'caps',
    capitals: 'caps',
    tint: 'soft',
    tinted: 'soft',
    subtle: 'soft',
    outlined: 'outline',
    bordered: 'outline',
    ghost: 'outline',
    filled: 'solid',
    fill: 'solid',
  },
  mode: {
    auto: 'both',
    system: 'both',
    default: 'both',
    light: 'light-only',
    dark: 'dark-only',
  },
});

/**
 * Check one setting and give it back ready to store, or refuse.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} [unset] an undo of one setting: only the identity of the setting is checked
 * @returns {import('./_settings.mjs').Setting}
 */
export function checkSetting(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset = false,
) {
  const {C} = ctx;
  const TARGET = ctx.project.target;
  const TOKENS = ctx.project.core.tokenDefaults;
  if (!thing)
    refuse(E.ERR_MISSING_ARGUMENT, 'Name the thing to change.', {
      run: [`${P} ${unset ? 'undo' : 'set'} --help`],
    });
  // `--token=value` is one word to the shell: say how to write it.
  if (thing.startsWith('--') && thing.includes('=')) {
    const [name, ...rest] = thing.split('=');
    refuse(
      E.ERR_MISSING_ARGUMENT,
      `Give the token and its value as two words: ${name} ${rest.join('=')}.`,
      {
        run: [
          `${P} ${unset ? 'undo' : 'set'} ${slug} ${name}${unset ? '' : ` ${quoteCommandArgument(rest.join('='))}`}`,
        ],
      },
    );
  }
  if (!unset && (value === undefined || value.trim() === ''))
    refuse(E.ERR_MISSING_ARGUMENT, `Give a value for ${thing}.`, {
      run: [`${P} set --help`],
    });
  // An empty flag is never read as no flag: --state '' would reach every
  // state.
  for (const k of /** @type {const} */ (['on', 'when', 'state', 'mode']))
    if (flags[k] === '')
      refuse(E.ERR_MISSING_ARGUMENT, `--${k} was given no value.`, {
        run: [`${P} ${unset ? 'undo' : 'set'} --help`],
      });
  // A value pasted over several lines is one value.
  const v = (value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
  // A var() that misspells a design token would read nothing.
  if (!unset)
    for (const [, name] of v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (name in TOKENS || name.startsWith('--_')) continue;
      const near = nearest(name, Object.keys(TOKENS)).filter(
        n => levenshteinDistance(n, name) <= 2,
      );
      if (near.length)
        refuse(
          E.ERR_THEME_UNKNOWN_TOKEN,
          `${name} is not a design token, so var(${name}) would read nothing.`,
          {
            didYouMean: near,
            run: [
              `${HOW} --list tokens ${near[0].replace(/^--/, '').split('-')[0]}`,
            ],
          },
        );
    }
  // A placeholder copied from a suggestion is not a value.
  if (!unset && /<[a-z][\w -]*>/i.test(v))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${v}" is a placeholder: put a real value in place of ${/<[a-z][\w -]*>/i.exec(v)?.[0]}.`,
      {run: [`${HOW} ${thing.replace(/^--/, '')}`]},
    );
  /** @type {import('./_settings.mjs').Setting} */
  const s = {thing, value: v, source: 'dial'};
  // A flag given only spaces names nothing; it is never read as absent.
  for (const k of /** @type {const} */ (['on', 'when', 'state', 'mode']))
    if (typeof flags[k] === 'string' && flags[k].trim() === '')
      refuse(E.ERR_MISSING_ARGUMENT, `--${k} is empty.`, {
        run: [
          k === 'mode'
            ? `${P} set ${slug} ${thing} ${quoteCommandArgument(v || '#1f2937')}`
            : `${HOW} --list parts`,
        ],
      });
  if (flags.on) s.on = flags.on.trim();
  if (flags.when) s.when = flags.when.trim();
  if (flags.state) s.state = flags.state.trim();
  if (flags.only) s.only = true;
  if (flags.mode) {
    const mode = flags.mode.toLowerCase();
    if (mode !== 'light' && mode !== 'dark')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `--mode takes light or dark, not "${flags.mode}".`,
        {didYouMean: nearest(mode, ['light', 'dark'])},
      );
    s.mode = mode;
  }
  const onFlag = s.on ? ` --on ${s.on}` : '';
  // A setting saved for a mode the theme no longer has can still be removed.
  if (s.mode && data.mode !== 'both' && !unset)
    refuse(
      E.ERR_THEME_NO_MODE,
      `This theme is ${data.mode}; --mode is for themes with both modes.`,
      {run: [`${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}`]},
    );
  if ((s.when || s.state) && !s.on)
    refuse(E.ERR_MISSING_ARGUMENT, '--when and --state need --on <part>.', {
      run: [`${HOW} --list parts`],
    });
  if (s.only) {
    const fam = s.on ? familyOf(s.on) : null;
    if (!fam || FAMILIES[/** @type {string} */ (s.on)])
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--only is for one member of a group, such as text-input (how --list groups).',
        {run: [`${HOW} --list groups`]},
      );
    if (!AUTO_SPREAD.includes(/** @type {string} */ (fam)))
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `${s.on} is styled on its own already: only ${AUTO_SPREAD.join(' and ')} spread to their group, so drop --only.`,
        {
          run: [
            unset
              ? `${P} undo ${slug} ${thing}${v ? ` ${quoteCommandArgument(v)}` : ''} --on ${s.on}`
              : `${P} set ${slug} ${thing} ${quoteCommandArgument(v)} --on ${s.on}`,
          ],
        },
      );
  }
  const isRole =
    thing === 'font' && ['body', 'heading', 'code'].includes(s.on ?? '');
  if (s.on && !isRole && !FAMILIES[s.on]) {
    const t = TARGET.get(s.on);
    if (!t) {
      // Another case of a part or group: that one, as a working command.
      const lower = s.on.toLowerCase();
      if (TARGET.has(lower) || FAMILIES[lower])
        refuse(
          E.ERR_THEME_UNKNOWN_PART,
          `"${s.on}" is not a part you can style; part names are lower case: ${lower}.`,
          {
            didYouMean: [lower],
            run: [
              `${P} ${unset ? 'undo' : 'set'} ${slug} ${thing}${v ? ` ${quoteCommandArgument(v)}` : ''} --on ${lower}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
            ],
          },
        );
      refuse(
        E.ERR_THEME_UNKNOWN_PART,
        `"${s.on}" is not a part you can style.`,
        {
          // A plural or another case names the part it means.
          didYouMean: nearest(s.on.toLowerCase().replace(/s$/, ''), [
            ...TARGET.keys(),
            ...Object.keys(FAMILIES),
          ]),
          run: [
            `${HOW} --list parts ${s.on.toLowerCase().replace(/s$/, '').split('-')[0]}`,
            `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
    }
    if (s.when) {
      const [p, wv, ...more] = s.when.split(':');
      if (!wv || more.length)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          '--when takes <prop>:<value>, such as variant:primary.',
          {run: [`${HOW} ${s.on}`]},
        );
      if (!t.props.includes(p))
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `${s.on} has no prop "${p}". It has: ${t.props.join(', ') || 'none'}.`,
          {didYouMean: nearest(p, t.props), run: [`${HOW} ${s.on}`]},
        );
      const vals = C.variantValues(s.on)[p] ?? [];
      if (vals.length && !vals.includes(wv))
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `${s.on} has no ${p} "${wv}". ${p} is one of: ${vals.join(', ')}.`,
          {didYouMean: nearest(wv, vals), run: [`${HOW} ${s.on}`]},
        );
    }
    const states = [...t.states, ...COMMON_STATES];
    if (s.state && !states.includes(s.state))
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of ${s.on}. States: ${states.join(', ')}.`,
        {didYouMean: nearest(s.state, states)},
      );
  }
  // On a group, a variant or state must belong to at least one member.
  if (s.on && FAMILIES[s.on] && (s.when || s.state)) {
    const members =
      /** @type {Array<[string, import('../../foundation/discovery/theming-targets.mjs').ThemingTarget]>} */ (
        FAMILIES[s.on].map(m => [m, TARGET.get(m)]).filter(([, t]) => t)
      );
    if (s.when) {
      const [p, wv, ...more] = s.when.split(':');
      const fits = members.some(([m, t]) => {
        if (!wv || more.length || !t.props.includes(p)) return false;
        const vals = C.variantValues(m)[p] ?? [];
        return !vals.length || vals.includes(wv);
      });
      if (!fits)
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `No member of the ${s.on} group has ${s.when}.`,
          {run: [`${HOW} ${s.on}`]},
        );
    }
    const state = s.state;
    if (
      state &&
      !members.some(([, t]) => [...t.states, ...COMMON_STATES].includes(state))
    )
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of any member of the ${s.on} group.`,
        {run: [`${HOW} ${s.on}`]},
      );
  }
  const step = v === 'more' || v === 'less';
  if (DIALS[thing]) {
    s.source = 'dial';
    if (['surfaces', 'buttons', 'type'].includes(thing)) {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} moves every part it covers; drop --on. For one part, set CSS properties --on <part>.`,
          {
            run: [
              `${P} set ${slug} ${thing} ${quoteCommandArgument(v || DIALS[thing].values.split('|')[0])}`,
            ],
          },
        );
      if (s.mode)
        refuse(
          E.ERR_THEME_NO_MODE,
          `${thing} is the same in light and dark; drop --mode.`,
          {run: [`${P} set ${slug} ${thing} ${quoteCommandArgument(v)}`]},
        );
      if (unset) return s;
      const ok = DIALS[thing].values.split('|');
      const lower = v.toLowerCase();
      if (!ok.includes(v)) {
        // A word that means one of the values names it; a word close in
        // spelling only, the nearest; anything else, no guess (never the
        // first value, which may be the opposite).
        const meant = DIAL_WORDS[thing]?.[lower];
        const near = ok.includes(lower)
          ? [lower]
          : meant
            ? [meant]
            : nearest(lower, ok);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} takes ${DIALS[thing].values}, not "${v}".`,
          {
            didYouMean: near,
            run: near[0] ? [`${P} set ${slug} ${thing} ${near[0]}`] : [],
          },
        );
      }
      return s;
    }
    if (thing === 'headings') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'headings applies to every heading; drop --on. For one heading level use font-weight or letter-spacing --on heading --when level:<1-6>.',
          {
            run: [
              `${P} set ${slug} font-weight 700 --on heading --when level:1`,
            ],
          },
        );
      if (s.mode)
        refuse(
          E.ERR_THEME_NO_MODE,
          'headings is the same in light and dark; drop --mode.',
          {
            run: [
              `${P} ${unset ? 'undo' : 'set'} ${slug} headings${v ? ` ${quoteCommandArgument(v)}` : ''}`,
            ],
          },
        );
      if (unset) {
        // With no word, the one headings setting the theme has.
        const held = data.settings.filter(x => x.thing === 'headings');
        s.axis =
          HEADING_TRACKING[v] !== undefined || v === 'tracking'
            ? 'tracking'
            : HEADING_WEIGHTS[v] !== undefined || v === 'weight'
              ? 'weight'
              : held.length === 1
                ? (held[0].axis ?? 'weight')
                : 'weight';
        return s;
      }
      if (HEADING_WEIGHTS[v] !== undefined) s.axis = 'weight';
      else if (HEADING_TRACKING[v] !== undefined) s.axis = 'tracking';
      else
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `headings takes ${DIALS.headings.values}, not "${v}".`,
          {
            didYouMean: nearest(v, [
              ...Object.keys(HEADING_WEIGHTS),
              ...Object.keys(HEADING_TRACKING),
            ]),
          },
        );
      return s;
    }
    if (unset) return s;
    /** @param {Array<[string, number]>} L @param {string | number} def */
    const ladder = (L, def) => {
      // The value in effect for the target: its own setting, else the
      // whole-theme one, else the starting point.
      // Same target: the part, and the same variant and state.
      const own = (/** @type {string} */ on) =>
        [...data.settings].reverse().find(
          x =>
            x.thing === thing &&
            (x.on ?? '') === on &&
            (x.when ?? '') === (on ? (s.when ?? '') : '') &&
            (x.state ?? '') === (on ? (s.state ?? '') : '') &&
            // A member set alone (--only) is not the member as the group
            // spreads it.
            Boolean(x.only) === (on === s.on ? Boolean(s.only) : false),
        )?.value;
      // A member of a group set on the group steps from the group's value.
      const fam = s.on ? familyOf(s.on) : null;
      const cur =
        own(s.on ?? '') ??
        (fam && fam !== s.on && !s.only ? own(fam) : undefined) ??
        // A part's own radius (a number) already counts a whole-theme
        // setting.
        (s.on && typeof def !== 'number' ? own('') : undefined) ??
        def;
      const at = L.findIndex(([n]) => n === cur);
      if (at >= 0)
        return L[
          Math.max(0, Math.min(L.length - 1, at + (v === 'more' ? 1 : -1)))
        ][0];
      // A size between rungs steps to the next rung that way, never past it.
      const px = typeof cur === 'number' ? cur : (lengthPx(cur) ?? Number.NaN);
      if (Number.isNaN(px)) return L[0][0];
      const next =
        v === 'more'
          ? L.find(([, n]) => n > px + 0.01)
          : [...L].reverse().find(([, n]) => n < px - 0.01);
      return (next ?? (v === 'more' ? L[L.length - 1] : L[0]))[0];
    };
    if (PALETTE_DIALS.includes(thing) && (s.on || s.mode)) {
      const token = paletteToken(thing);
      const value = quoteCommandArgument(v || '#7c3aed');
      /** @type {string[]} */
      let run = [
        `${P} set ${slug} ${token} ${value}${onFlag}${s.mode ? ` --mode ${s.mode}` : ''}`,
      ];
      // The token is suggested only where the part reads it; otherwise the
      // part's own route, as a token set on the part would be refused.
      if (s.on && !ctx.unchecked) {
        /** @param {string} t */
        const works = t => {
          try {
            checkSetting(ctx, slug, data, t, v || '#7c3aed', {
              on: s.on,
              when: s.when,
              state: s.state,
            });
            return true;
          } catch {
            return false;
          }
        };
        const direct = `${P} set ${slug} background-color ${value}${onFlag}`;
        // The neutral color is a surface: on a part, that is its background.
        if (thing === 'neutral') run = [direct, ...run];
        else if (!works(token) && works('background-color')) run = [direct];
      }
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${thing} generates the colors of the whole theme, light and dark from one color; drop ${s.on ? '--on' : '--mode'}. For an exact color on one part or in one mode, set ${thing === 'neutral' && s.on ? "the part's background, or " : ''}the token itself.`,
        {run},
      );
    }
    if (s.mode)
      refuse(
        E.ERR_THEME_NO_MODE,
        `${thing} is not a color, so it is the same in light and dark; drop --mode.`,
        {
          run: [
            `${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}`,
          ],
        },
      );
    if (thing === 'corners') {
      if (s.on) refuseInvisibleCorners(ctx, slug, s, data);
      // With no corners setting yet, a step starts from the base theme's
      // own radius.
      if (step) {
        // A step moves to the next rung the part SHOWS bigger or smaller:
        // each rung is measured as the build writes it for the radius token
        // the part reads (a card reads the container radius), and so is
        // what the part shows now.
        const base = ctx.base ?? {
          light: /** @type {Record<string, string>} */ ({}),
          dark: /** @type {Record<string, string>} */ ({}),
        };
        const token =
          (s.on
            ? /^var\((--radius-[\w-]+)\)$/.exec(
                partDefault(
                  ctx,
                  partsOf(ctx, s)[0] ?? s.on,
                  'borderRadius',
                  s.when,
                ) ?? '',
              )?.[1]
            : null) ?? '--radius-element';
        // What the part shows: a setting on it or on its group (the later
        // one wins), else a whole-theme setting, else the base theme.
        const fam = s.on ? familyOf(s.on) : null;
        const onPart = s.on
          ? [...data.settings].reverse().find(
              x =>
                x.thing === 'corners' &&
                (x.when ?? '') === (s.when ?? '') &&
                (x.state ?? '') === (s.state ?? '') &&
                // A member set alone shows that value too.
                (x.on === s.on ||
                  (fam && fam !== s.on && x.on === fam && !x.only)),
            )
          : undefined;
        // A step on a member set alone stays on that member alone.
        if (onPart && onPart.on === s.on && onPart.only && !s.only)
          s.only = true;
        const whole = [...data.settings]
          .reverse()
          .find(x => x.thing === 'corners' && !x.on);
        const isRung = (/** @type {string} */ x) =>
          CORNERS.some(([n]) => n === x);
        const shown = onPart
          ? isRung(onPart.value) || cornerPxOf(onPart.value) >= 1000
            ? radiusAt(base, onPart.value, token)
            : cornerPxOf(onPart.value)
          : whole
            ? radiusAt(base, whole.value, token)
            : // The base theme's radius; one it does not give in px (a var()
              // chain) counts as medium's.
              (tokenPx(base, token) ?? radiusAt(base, 'medium', token));
        const rungs = CORNERS.map(
          ([n]) => /** @type {const} */ ([n, radiusAt(base, n, token)]),
        );
        const next =
          v === 'more'
            ? rungs.find(([, n]) => n > shown + 0.01)
            : [...rungs].reverse().find(([, n]) => n < shown - 0.01);
        s.value =
          (next ??
            (Number.isNaN(shown)
              ? rungs.find(([n]) => n === 'medium')
              : v === 'more'
                ? rungs[rungs.length - 1]
                : rungs[0]))?.[0] ?? 'medium';
      } else {
        // A rung in any case, a size in px written any way: the plain form.
        const lower = v.toLowerCase();
        const px = /^(\d+(?:\.\d+)?|\.\d+)px$/.exec(lower);
        if (CORNERS.some(([n]) => n === lower)) s.value = lower;
        else if (px) s.value = `${Number(px[1])}px`;
        else if (lower === '0') s.value = 'square';
        else {
          // What it most likely means, as a value corners takes.
          const len = lengthPx(lower);
          const pct = /^(\d+(?:\.\d+)?)%$/.exec(lower);
          const meant =
            len != null
              ? `${len}px`
              : pct
                ? Number(pct[1]) >= 50
                  ? 'pill'
                  : null
                : (nearest(
                    lower,
                    CORNERS.map(([n]) => n),
                  )[0] ?? null);
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `corners takes ${DIALS.corners.values}, not "${v}".`,
            {
              ...(meant ? {didYouMean: [meant]} : {}),
              run: [
                `${P} set ${slug} corners ${meant ?? 'medium'}${onFlag}${s.when ? ` --when ${s.when}` : ''}`,
              ],
            },
          );
        }
      }
    } else if (thing === 'spacing') {
      // Spacing scales the space tokens a part reads; a state does not
      // change them, and a part that reads none shows nothing.
      if (s.state)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `spacing does not change in a state; drop --state.`,
          {
            run: [
              `${P} set ${slug} spacing ${quoteCommandArgument(v || 'roomy')}${onFlag}`,
            ],
          },
        );
      if (s.on && !ctx.unchecked) {
        // The tokens reach the parts inside it too.
        const reads = (/** @type {string} */ t) =>
          Object.values(ctx.C.MAP[t]?.own ?? {}).some(p =>
            Object.keys(p.tokens ?? {}).some(x =>
              /^--(spacing-|size-element-)/.test(x),
            ),
          );
        const spaced = partsOf(ctx, s).filter(
          t => reads(t) || (ctx.C.MAP[t]?.contains ?? []).some(reads),
        );
        if (!spaced.length)
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `${s.on} reads no spacing or control size, so spacing changes nothing you see there. For space around it, set margin or padding on it.`,
            {run: [`${P} set ${slug} padding 8px${onFlag}`]},
          );
      }
      if (step) s.value = ladder(SPACING, 'medium');
      else if (!SPACING.some(([n]) => n === v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing takes ${DIALS.spacing.values}, not "${v}".`,
          {
            didYouMean: nearest(
              v,
              SPACING.map(([n]) => n),
            ),
          },
        );
    } else if (thing === 'text-size') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'text-size applies to the whole theme; for one part use font-size.',
          {run: [`${P} set ${slug} font-size 13px --on ${s.on}`]},
        );
      if (step) s.value = ladder(TEXT_SIZE, 'medium');
      else if (
        !TEXT_SIZE.some(([n]) => n === v) &&
        !(/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) >= 10 && Number(v) <= 32)
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `text-size takes ${DIALS['text-size'].values} (a number is the body size in pixels, 10 to 32), not "${v}".`,
          {run: [`${P} set ${slug} text-size 16`]},
        );
      else if (!TEXT_SIZE.some(([n]) => n === v))
        s.value = String(Number(v.trim()));
    } else if (PALETTE_DIALS.includes(thing)) {
      if (step)
        refuse(E.ERR_THEME_BAD_VALUE, `${thing} takes a color, not a step.`, {
          run: [`${P} set ${slug} ${thing} ${quoteCommandArgument('#7c3aed')}`],
        });
      const problem = colorProblem(v);
      if (problem) {
        // What the value most likely meant: without quotes, a trailing `;`
        // or `!important`, a bare hex with its #, the opaque color, or the
        // nearest color name.
        const cleaned = v
          .replace(/^(["'])(.*)\1$/, '$2')
          .replace(/\s*!important\s*$/i, '')
          .replace(/;+\s*$/, '')
          .trim()
          .replace(/^([0-9a-f]{3}|[0-9a-f]{6})$/i, '#$1')
          // One hex digit short or over: repeat or drop the last one.
          .replace(/^#([0-9a-f]{4})([0-9a-f])$/i, '#$1$2$2')
          .replace(/^#([0-9a-f]{6})[0-9a-f]$/i, '#$1');
        const near =
          problem.kind === 'unknown'
            ? nearest(v.toLowerCase(), COLOR_NAMES)
            : [];
        const better =
          problem.opaque ??
          (cleaned !== v && !colorProblem(cleaned) ? cleaned : near[0]);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" ${problem.message}.${problem.kind === 'unknown' || problem.kind === 'malformed' ? ' Give a hex, a color name, or an rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() or color() color.' : ''}`,
          {
            didYouMean: better ? [better] : near,
            run: [
              `${P} set ${slug} ${thing} ${quoteCommandArgument(better ?? '#7c3aed')}`,
            ],
          },
        );
      }
    } else if (thing === 'vibrancy') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'vibrancy applies to every generated color of the theme; drop --on.',
          {run: [`${P} set ${slug} vibrancy ${quoteCommandArgument(v)}`]},
        );
      if (step) {
        const saved = [...data.settings]
          .reverse()
          .find(x => x.thing === 'vibrancy')?.value;
        // A value edited by hand that is not one steps from the default.
        const cur =
          saved != null && /^\d{1,3}$/.test(saved) && Number(saved) <= 100
            ? Number(saved)
            : VIBRANCY_DEFAULT;
        const next = Math.max(
          0,
          Math.min(100, cur + (v === 'more' ? 10 : -10)),
        );
        if (next === cur)
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `vibrancy is already ${cur}, the ${cur >= 100 ? 'most vivid' : 'grayest'}, so ${v} changes nothing.`,
            {
              run: [
                `${P} set ${slug} vibrancy ${v === 'more' ? 'less' : 'more'}`,
              ],
            },
          );
        s.value = String(next);
      } else if (!/^\d{1,3}$/.test(v) || Number(v) > 100) {
        // A number out of range suggests the nearest one in range.
        const n = Number(v);
        const near = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v)
          ? Math.max(0, Math.min(100, Math.round(n)))
          : 60;
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `vibrancy takes a whole number from 0 (gray) to 100 (most vivid), or more or less, not "${v}".`,
          {run: [`${P} set ${slug} vibrancy ${near}`]},
        );
      } else s.value = String(Number(v));
      const colors = data.settings.filter(
        x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      );
      // A gray has no color to saturate, so vibrancy changes nothing.
      if (!colors.some(x => !isGraySeed(seedOf(x.value))))
        refuse(
          E.ERR_THEME_NO_EFFECT,
          colors.length
            ? 'vibrancy sets how saturated the generated colors are, and every color this theme sets is a gray, so it would change nothing. Set a color first.'
            : 'vibrancy sets how saturated the generated colors are, and this theme sets no color yet. Set one first.',
          {run: [`${P} set ${slug} accent ${quoteCommandArgument('#7c3aed')}`]},
        );
    } else if (thing === 'font') {
      if (s.when || s.state)
        refuse(
          E.ERR_INVALID_ARGUMENT,
          'font sets a role (body, heading, code) for the whole theme; it takes no --when or --state. For one part use font-family.',
          {
            run: [
              `${P} set ${slug} font-family ${quoteCommandArgument(v)} --on heading${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
            ],
          },
        );
      if (s.on && !isRole)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          "font --on takes body, heading, or code. For one part's font use font-family.",
          {
            run: [
              `${P} set ${slug} font-family ${quoteCommandArgument(v)} --on ${s.on}`,
            ],
          },
        );
      if (step)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'font takes a preset or a family name, not a step.',
          {fix: `the values are ${DIALS.font.values}`},
        );
      // A family list: names, quoted or not, split by commas; nothing that
      // could end the CSS declaration or the preview's style block. A
      // preset typed in another case or spacing is the preset.
      s.value = v.trim();
      // A font package names its preset: @fontsource/inter is inter.
      const fromPackage = /^@fontsource(?:-variable)?\/([a-z0-9-]+)$/i.exec(
        s.value,
      )?.[1];
      if (fromPackage && OPEN_FONTS[fromPackage.toLowerCase()])
        s.value = fromPackage.toLowerCase();
      const key = s.value.toLowerCase().replace(/[\s_-]+/g, '');
      const preset = [...Object.keys(FONTS), ...Object.keys(OPEN_FONTS)].find(
        k => k.toLowerCase().replace(/[\s_-]+/g, '') === key,
      );
      if (preset) s.value = preset;
      // Each family is quoted whole, or a name that may hold an apostrophe
      // (O'Reilly Sans); the dial quotes it when it writes it.
      const family = (/** @type {string} */ f) =>
        /^"[^"]+"$/.test(f) || /^'[^']+'$/.test(f) || /^[^"',\s][^"]*$/.test(f);
      // A CSS-wide keyword inside a family list makes the browser drop
      // the whole declaration.
      const keyword = s.value
        .split(',')
        .map(f =>
          f
            .trim()
            .replace(/^["']|["']$/g, '')
            .toLowerCase(),
        )
        .find(f => CSS_WIDE_KEYWORDS.includes(f));
      if (keyword)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${keyword}" is a CSS keyword, not a font: inside a font list it makes the browser drop the whole font. Give a preset or a family name; to go back to the base theme's font, undo the font setting.`,
          {
            run: [
              `${P} set ${slug} font system${s.on ? ` --on ${s.on}` : ''}`,
              `${P} undo ${slug} font${s.on ? ` --on ${s.on}` : ''}`,
            ],
          },
        );
      if (s.value.split(',').some(f => f.trim().length > 100))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'A font family name is at most 100 characters.',
          {run: [`${P} set ${slug} font inter`]},
        );
      if (
        !s.value ||
        /[;{}<>\\\n]/.test(s.value) ||
        !s.value.split(',').every(f => family(f.trim()))
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" is not a font: give a preset (${DIALS.font.values}) or a family list such as "Inter, sans-serif".`,
          {run: [`${P} set ${slug} font inter`]},
        );
    } else if (thing === 'base') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'base applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} base ${quoteCommandArgument(v)}`]},
        );
      if (![...LIKE, 'none'].includes(v)) {
        // `NEUTRAL`, `base=neutral`, `None`: the base meant.
        const meant = v
          .toLowerCase()
          .replace(/^base\s*[=:]\s*/, '')
          .trim();
        const near = [...LIKE, 'none'].includes(meant)
          ? [meant]
          : nearest(meant, [...LIKE, 'none']);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `base takes ${DIALS.base.values}, not "${v}".`,
          {
            didYouMean: near,
            run: near[0] ? [`${P} set ${slug} base ${near[0]}`] : [],
          },
        );
      }
    } else if (thing === 'mode') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'mode applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} mode ${quoteCommandArgument(v)}`]},
        );
      if (!['both', 'light-only', 'dark-only'].includes(v)) {
        const lower = v.toLowerCase().replace(/^mode\s*[=:]\s*/, '');
        const meant =
          DIAL_WORDS.mode[lower] ??
          (['both', 'light-only', 'dark-only'].includes(lower) ? lower : null);
        const near = meant
          ? [meant]
          : nearest(lower, ['both', 'light-only', 'dark-only']);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `mode takes both, light-only, or dark-only, not "${v}".`,
          {
            didYouMean: near,
            run: near[0] ? [`${P} set ${slug} mode ${near[0]}`] : [],
          },
        );
      }
    }
    return s;
  }
  if (thing.startsWith('--')) {
    if (thing.startsWith('--_'))
      refuse(
        E.ERR_THEME_PRIVATE_TOKEN,
        `"${thing}" is private to a component; themes cannot set it.`,
        {run: [`${HOW} ${quoteCommandArgument(thing)}`]},
      );
    if (!(thing in TOKENS)) {
      refuse(E.ERR_THEME_UNKNOWN_TOKEN, `"${thing}" is not a design token.`, {
        didYouMean: nearest(thing, Object.keys(TOKENS)),
        run: [
          `${HOW} --list tokens ${thing
            .replace(/^-+(color-)?/, '')
            .split('-')[0]
            .trim()}`.trim(),
        ],
      });
    }
    const type = C.typeOf(thing);
    // Only colors differ by mode: a shadow list cannot sit inside
    // light-dark(), so a shadow per mode would remove it in both.
    // undo still removes a setting an earlier release saved for one mode.
    if (s.mode && type !== 'color' && !unset)
      refuse(
        E.ERR_THEME_NO_MODE,
        `${thing} is ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type === 'other' ? 'value of its own kind' : type}, so it is the same in light and dark; drop --mode. Only colors differ by mode.`,
        {
          run: [
            unset
              ? `${P} undo ${slug} ${thing}${onFlag}`
              : `${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}`,
          ],
        },
      );
    s.source = 'token';
    if (unset) return s;
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials (${Object.keys(DIALS).join(', ')}). Give ${thing} a ${type} value.`,
      );
    checkTypedValue(type, v, thing, TOKENS, C.typeOf, slug);
    checkCycle(thing, v, TOKENS, data);
    // With no part data, what reads the token is unknown: save, unchecked.
    if (ctx.unchecked) return s;
    const parts = partsOf(ctx, s);
    if (parts.length) {
      const results = parts.map(
        t =>
          /** @type {[string, import('./_compiler.mjs').CheckFailure | null]} */ ([
            t,
            C.checkTokenOn(slug, t, thing, v, P),
          ]),
      );
      const recorded = results.filter(([, r]) => !r?.soft);
      const hard = recorded.filter(([, r]) => r);
      const spread = Boolean(
        FAMILIES[s.on ?? ''] || (familyOf(s.on ?? '') && parts.length > 1),
      );
      // A part with no record is judged by its group: refused when no
      // member that has a record reads the token, as the group form is.
      const fam = s.on ? familyOf(s.on) : null;
      if (!recorded.length && fam && !spread) {
        const siblings = FAMILIES[fam].filter(t => C.MAP[t]);
        const famResults = siblings.map(
          t =>
            /** @type {[string, import('./_compiler.mjs').CheckFailure | null]} */ ([
              t,
              C.checkTokenOn(slug, t, thing, v, P),
            ]),
        );
        if (famResults.length && famResults.every(([, r]) => r)) {
          const r = /** @type {import('./_compiler.mjs').CheckFailure} */ (
            famResults[0][1]
          );
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `No part of the ${fam} group reads ${thing}, so ${s.on} cannot either. ${r.message}`,
            {
              run: r.run.map(x =>
                x.replace(`--on ${famResults[0][0]}`, `--on ${s.on}`),
              ),
              also: r.also,
            },
          );
        }
        if (famResults.length)
          s.note = `${s.on} has no compiled record; checked against the ${fam} group, where ${famResults
            .filter(([, r]) => !r)
            .map(([t]) => t)
            .join(', ')} read ${thing}`;
      } else if (
        recorded.length &&
        hard.length === recorded.length &&
        !statusTwin(C, recorded, thing, s.when)
      ) {
        const [t0, r0] =
          /** @type {[string, import('./_compiler.mjs').CheckFailure]} */ (
            hard[0]
          );
        refuse(E.ERR_THEME_NO_EFFECT, r0.message, {
          run: r0.run.map(x =>
            spread ? x.replace(`--on ${t0}`, `--on ${s.on}`) : x,
          ),
          also: r0.also,
        });
      } else if (hard.length)
        s.note = `no effect on ${hard.map(([t]) => t).join(', ')} (they never read ${thing})`;
      if (!s.note && recorded.length) {
        const fed = C.feeds(recorded[0][0], thing);
        if (fed.length) s.note = `feeds ${C.fmtFeeds(fed, recorded[0][0])}`;
      }
      const soft = results.filter(([, r]) => r?.soft);
      if (!s.note && soft.length && soft.length === results.length)
        s.note = /** @type {import('./_compiler.mjs').CheckFailure} */ (
          soft[0][1]
        ).message;
    } else {
      const r = C.checkTokenGlobal(thing, P);
      // Tokens whose default is built from this one: a part that reads
      // them sees the change.
      const fed = r
        ? Object.entries(TOKENS)
            .filter(
              ([k, v]) =>
                k !== thing && new RegExp(`var\\(${thing}[,)]`).test(String(v)),
            )
            .map(([k]) => k)
        : [];
      // A token a dial writes is always accepted, so a dial's notes never
      // name a token `set` refuses.
      if (r && fed.length)
        s.note = `no part reads ${thing} itself, but ${fed.slice(0, 4).join(', ')} ${fed.length > 1 ? 'are' : 'is'} built from it, so the change shows wherever ${fed.length > 1 ? 'those are' : 'that is'} used${fed.some(k => k.startsWith('--color-syntax-')) ? ' (such as diff rows in code blocks)' : ''}`;
      else if (r && dialWrites(thing))
        s.note = `no part of this Core reads ${thing}, and no token it feeds is read, so it changes nothing you see now; it is set as asked because a dial writes it too`;
      // The editor's record of what parts read comes from one render of
      // each part, so it misses variants it did not render: a whole-theme
      // token is set as asked, and the result says nothing was seen
      // reading it.
      else if (r)
        s.note = `no part the editor rendered reads ${thing} (each part is rendered once, with its default props, so a variant that reads it may be missed); it is set as asked, and reaches any part that reads it`;
    }
    return s;
  }
  const prop = kebab(thing);
  if (CSS_PROPERTIES.has(prop)) {
    if (!s.on)
      refuse(
        E.ERR_MISSING_ARGUMENT,
        `${prop} is a CSS property, so it needs --on <part|group>. For the whole theme use a dial or a token.`,
        {
          run: [
            `${P} set ${slug} ${prop} ${quoteCommandArgument(v || exampleOf(groupOfPropType(prop), prop))} --on card`,
            `${HOW} "${prop}"`,
          ],
        },
      );
    s.source = 'property';
    s.thing = prop;
    if (unset) return s;
    // Text, headings and links take their color from the color prop, whose
    // rule Core writes after part styles: a color set on them never shows.
    const textParts = ['text', 'heading', 'link'];
    if (
      (prop === 'color' || prop === '-webkit-text-fill-color') &&
      partsOf(ctx, s).some(t => textParts.includes(t))
    ) {
      if (partsOf(ctx, s).every(t => textParts.includes(t))) {
        const named = /^color:([\w-]+)$/.exec(s.when ?? '')?.[1];
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on} takes its color from the color prop, which Core sets after part styles, so a color set on ${s.on} never shows. Set the text color token instead.`,
          {
            run: [
              `${P} set ${slug} --color-text-${named ?? 'primary'} ${quoteCommandArgument(v || '#1f2937')}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ...(named
                ? []
                : [
                    `${P} set ${slug} --color-text-secondary ${quoteCommandArgument(v || '#1f2937')}${s.mode ? ` --mode ${s.mode}` : ''}`,
                  ]),
            ],
          },
        );
      }
      s.note = `text, heading and link inside ${s.on} keep the color their color prop gives; set --color-text-primary for those`;
    }
    // One mode on a part whose variants each read their own value: the
    // other mode cannot keep each variant's value in one rule.
    // With a state, the other mode would take one variant's value for
    // every variant, so any part whose variants read their own value needs
    // the variant named.
    if (s.mode && !s.when) {
      const g = C.groupOfProp(
        prop === 'background' ? 'background-color' : prop,
      );
      for (const t of partsOf(ctx, s)) {
        const reads = g
          ? C.partReads(t, g).filter(r => r.props.includes(prop))
          : [];
        const variantsOf = (
          /** @type {(w: string) => string | undefined} */ pick,
        ) => [
          ...new Set(
            reads
              .flatMap(r => r.when)
              .map(pick)
              .filter(Boolean),
          ),
        ];
        // Resting reads keyed by the variant alone, and reads in the state.
        const rest = variantsOf(w => /^variant=([\w-]+)$/.exec(w)?.[1]);
        const inState = s.state
          ? variantsOf(w =>
              w.includes(`:${s.state}`)
                ? /(?:^|,)variant=([\w-]+)/.exec(w)?.[1]
                : undefined,
            )
          : [];
        // A state that does not change this property shows each variant's
        // resting value, so that is what the other mode must keep.
        const variants = inState.length ? inState : rest;
        const perVariant = inState.length
          ? true
          : rest.length > 0 && !reads.some(r => r.when.includes(''));
        if (reads.length && variants.length && perVariant)
          refuse(
            E.ERR_THEME_NO_MODE,
            `Each variant of ${t} has its own ${prop}${s.state ? ` when ${s.state}` : ''}, so one mode cannot be set for all of them at once: the other mode would take one variant's color for every variant. Name the variant.`,
            {
              run: [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on} --when variant:${variants[0]}${s.state ? ` --state ${s.state}` : ''} --mode ${s.mode}`,
              ],
            },
          );
      }
    }
    if (!isSafeValue(v))
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${v}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.`,
        {run: [`${HOW} ${prop}`]},
      );
    if (/radius$/.test(prop)) refuseInvisibleCorners(ctx, slug, s, data);
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials. Give ${prop} an exact CSS value.`,
      );
    const grammar = propertyProblem(prop, v);
    if (grammar)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes ${grammar.takes}; "${v}" is not one.`,
        {
          ...(grammar.near && /^[a-z-]+$/i.test(v)
            ? {didYouMean: [grammar.near]}
            : {}),
          run: grammar.near
            ? [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(grammar.near)} --on ${s.on}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ]
            : [`${HOW} ${prop}`],
        },
      );
    if (COLOR_PROPS.test(prop) && !isColorValue(v)) {
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes a color; "${v}" is not one.${/gradient/.test(v) ? ' Gradients go in background.' : ''}`,
        {
          run: /gradient/.test(v)
            ? [
                `${P} set ${slug} background ${quoteCommandArgument(v)} --on ${s.on}`,
              ]
            : [],
        },
      );
    }
    const whenFlag = s.when ? ` --when ${s.when}` : '';
    if (
      s.mode &&
      !COLOR_PROPS.test(prop) &&
      !(prop === 'background' && isColorValue(v))
    ) {
      const alt =
        prop === 'border' || prop.startsWith('border-')
          ? 'border-color'
          : prop === 'background'
            ? 'background-color'
            : null;
      refuse(
        E.ERR_THEME_NO_MODE,
        `--mode works on plain colors; ${prop} ${prop === 'box-shadow' || prop === 'border' ? 'mixes a color with sizes' : 'is not a color'}, so it cannot differ between light and dark.`,
        {
          run: alt
            ? [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v.replace(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i, 'currentcolor'))} --on ${s.on}${whenFlag}   # the shape, both modes`,
                `${P} set ${slug} ${alt} ${quoteCommandArgument(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i.exec(v)?.[0] ?? '#1f2937')} --on ${s.on}${whenFlag} --mode ${s.mode}   # then the color per mode`,
              ]
            : [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on}${whenFlag}   # both modes`,
              ],
        },
      );
    }
    // In a state, the other mode keeps the state's own value there (or a
    // value set for both modes); with none to keep, the setting would
    // change that mode too. Without a state, the other mode keeps the
    // part's plain color.
    if (
      s.mode &&
      s.state &&
      !partsOf(ctx, s).every(t =>
        partDefault(ctx, t, camel(prop), s.when, s.state),
      ) &&
      !data.settings.some(
        x =>
          x.thing === prop &&
          x.on === s.on &&
          x.when === s.when &&
          x.state === s.state &&
          x.mode !== s.mode,
      )
    )
      refuse(
        E.ERR_THEME_NO_MODE,
        `${s.on} has no ${prop}${s.state ? ` when ${s.state}` : ''}${s.when ? ` for ${s.when}` : ''} of its own for the ${s.mode === 'light' ? 'dark' : 'light'} mode to keep, so a ${s.mode}-only value would change it too. Set it for both modes.`,
        {
          run: [
            `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
          ],
        },
      );
    return s;
  }
  // A property written with _ or spaces, a trailing colon, or in camel
  // case: the property meant.
  const meant = kebab(String(thing).trim().replace(/:$/, ''))
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
  if (meant !== prop && CSS_PROPERTIES.has(meant))
    refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property; the property is ${meant}.`,
      {
        didYouMean: [meant],
        run: [
          unset
            ? `${P} undo ${slug} ${meant}${onFlag}`
            : `${P} set ${slug} ${meant} ${quoteCommandArgument(v || exampleOf(groupOfPropType(meant), meant))}${onFlag || ' --on card'}`,
        ],
      },
    );
  const hint =
    /** @type {((v: string, on: string | undefined) => string[]) | undefined} */ (
      THING_HINTS[thing.toLowerCase()]
    );
  // A dial by another name or case: Accent, gray, saturation, error.
  const lower = thing.toLowerCase();
  const aliases = DIALS[lower] ? [lower] : (COLOR_DIAL_WORDS.get(lower) ?? []);
  if (!hint && aliases.length)
    return refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. ${aliases.length > 1 ? `The dials ${aliases.join(' and ')} mean that` : `The dial for that is ${aliases[0]}`}.`,
      {
        didYouMean: aliases,
        run: aliases.map(d =>
          unset
            ? `${P} undo ${slug} ${d}${onFlag}`
            : `${P} set ${slug} ${d} ${quoteCommandArgument(valueFor(d, v))}${onFlag}`,
        ),
      },
    );
  return refuse(
    E.ERR_THEME_UNKNOWN_THING,
    `"${thing}" is not a dial, a token, or a CSS property.`,
    {
      // A hint names this theme and the part (card when none is given),
      // and a corners value corners takes.
      run: hint
        ? hint(
            /corners/.test(String(hint('', '')))
              ? CORNERS.some(([n]) => n === v) || /^\d+(\.\d+)?px$/.test(v)
                ? v
                : ''
              : v,
            s.on,
          ).map(x =>
            x
              .replace(/<theme>/g, slug)
              .replace(/<part>/g, 'card')
              .replace(/"([^"]*)"/g, (_, q) => quoteCommandArgument(q)),
          )
        : // A list that answers, not a question the parser may not match.
          [`${HOW} --list properties`, `${HOW} --list dials`],
      didYouMean: hint
        ? []
        : nearest(prop, [...Object.keys(DIALS), ...CSS_PROPERTIES]),
    },
  );
}

/**
 * Refuse rounding a part that shows no edge: no background, border, shadow
 * or radius of its own, so a radius on it changes nothing you see.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @param {import('./_settings.mjs').ThemeData} data
 */
function refuseInvisibleCorners(ctx, slug, s, data) {
  if (ctx.unchecked) return;
  const parts = partsOf(ctx, s);
  if (!parts.length || parts.some(t => ctx.C.showsCorners(t))) return;
  // An edge the theme gives the part itself shows its corners too.
  const edged = data.settings.some(
    x =>
      x.source === 'property' &&
      /^(background|border|box-shadow|outline)/.test(x.thing) &&
      partsOf(ctx, x).some(t => parts.includes(t)),
  );
  if (edged) return;
  const kids = (ctx.C.MAP[parts[0]]?.contains ?? [])
    .filter(k => ctx.C.showsCorners(k) && ctx.C.MAP[k])
    .slice(0, 3);
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${s.on} has no background, border or shadow of its own, so rounding its corners changes nothing you see.${kids.length ? ` Parts inside it that do show an edge: ${kids.join(', ')}.` : ''}`,
    {
      run: kids.length
        ? kids.map(
            k =>
              `${P} set ${slug} corners ${quoteCommandArgument(s.value || 'round')} --on ${k}`,
          )
        : [`${HOW} ${s.on}`],
    },
  );
}

/**
 * Whether a token is the twin of one the part reads for another variant
 * value: the editor rendered each part once (a banner as info, an icon in
 * its default color), so `--color-error-muted` on a banner, or
 * `--color-icon-pink` on an icon, is read as surely as the recorded
 * `--color-info-muted` or `--color-icon-blue`.
 * @param {import('./_compiler.mjs').Compiler} C
 * @param {Array<[string, unknown]>} recorded
 * @param {string} thing
 * @param {string | undefined} when
 */
function statusTwin(C, recorded, thing, when) {
  const [wp, wv] = (when ?? '').split(':');
  return recorded.some(([t]) =>
    Object.entries(C.variantValues(t)).some(([p, values]) => {
      if (wp && wp !== p) return false;
      // Only the part's own values: a button's destructive variant makes no
      // --color-info its twin.
      const all = values;
      return all.some(
        w =>
          (!wv || w === wv) &&
          new RegExp(`-${w}(-|$)`).test(thing) &&
          all.some(
            o =>
              o !== w &&
              C.allReads(t).has(
                thing.replace(new RegExp(`-${w}(-|$)`), `-${o}$1`),
              ),
          ),
      );
    }),
  );
}

/**
 * Whether a dial writes the token: a color, a heading weight (type,
 * headings), a radius (corners), a spacing or control size (spacing), or a
 * font size (type, text-size).
 * @param {string} token
 */
const dialWrites = token =>
  PALETTE_TOKENS.has(token) ||
  /^--(text-(heading|display)-\d-weight|radius-|spacing-|size-element-|font-size-)/.test(
    token,
  );

/** The aspects `how` answers at the whole-theme level. */
export const ASPECTS = [...Object.keys(GROUPS), 'colors'];

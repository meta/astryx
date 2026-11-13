// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works.
 *
 * @position api/theme-edit — checks over the part data
 */

import {AstryxError} from '../error.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {partForWord} from './_how-question.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {baseInstalled, baseThemeFile, installLine} from './_project.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {
  withFallbacks,
  MATH_FUNCTION,
  cssNumber,
  belowRange,
  fontShorthandParts,
  cssProperties,
  familyListMeant,
  grammarText,
  initialOf,
  keywordsOf,
  matchType,
  matchValue,
  numbersIn,
  propertyGrammar,
  takesPercentage,
} from './_css.mjs';
import {calcVars, coreFallback, multipliedTokens} from './_parts.mjs';
import {
  AUTO_SPREAD,
  COLOR_PROP_PARTS,
  COLOR_PROPS,
  COMMON_STATES,
  CORNERS,
  DIALS,
  FAMILIES,
  FONT_ROLES,
  FONTS,
  GROUPS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  HOW,
  OPEN_FONTS,
  CSS_WIDE,
  CSS_WIDE_KEYWORDS,
  P,
  SPACING,
  TEXT_SIZE,
  THING_HINTS,
  TYPE_STYLES,
  familyOf,
  wordTable,
  WRAPPED_PARTS,
  CARD_LIKE,
} from './_tables.mjs';
import {
  COLOR_NAMES,
  colorProblem,
  isColorValue,
  isNumber,
  isSafeValue,
  isSize,
  parseColor,
  mixSide,
  splitTop,
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
  radiusTokenOf,
  focusStateOf,
  valueProblem,
  partComponentDocs,
  themeFiles,
  ownSourceTokenValues,
  baseTopTokens,
  baseComponentReads,
  partRuleTokens,
  cssFamily,
  familySpaces,
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

/**
 * The `type` preset nearest a scale ratio typed as a number (1.3 is
 * editorial), or null for a number that is no ratio (16).
 * @param {string} v
 * @returns {string | null}
 */
function ratioPreset(v) {
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const r = Number(v);
  if (!(r > 1 && r <= 2)) return null;
  return Object.entries(TYPE_STYLES).reduce((a, b) =>
    Math.abs(b[1].ratio - r) < Math.abs(a[1].ratio - r) ? b : a,
  )[0];
}

/**
 * A `set` (or `undo`) command for a setting, with its scope, to suggest.
 * @param {string} slug
 * @param {string} thing
 * @param {string} value
 * @param {{on?: string, when?: string, state?: string, mode?: string, only?: boolean}} s
 * @param {boolean} [unset]
 */
export const setLine = (slug, thing, value, s, unset = false) =>
  `${P} ${unset ? 'undo' : 'set'} ${slug} ${thing}${value ? ` ${quoteCommandArgument(value)}` : ''}${s.on ? ` --on ${s.on}` : ''}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}${s.only ? ' --only' : ''}`;

/** @param {string} v */
const cornerPxOf = v =>
  CORNERS.find(([n]) => n === v)?.[1] ?? lengthPx(v) ?? Number.NaN;

const E = ERROR_CODES;

/**
 * The fallbacks of the var() calls inside a value that is not one var()
 * alone (`calc(var(--x, 4px) * 2)`), in order. A var() with an empty
 * fallback (`var(--x,)`) gives ''.
 * @param {string} value
 * @returns {Array<{fallback: string, within: string[]}>} each fallback, with
 *   the names of the functions around its var(), innermost first
 */
function innerVarFallbacks(value) {
  const text = value.trim();
  if (/^var\(/i.test(text) && matchingParen(text, 3) === text.length - 1)
    return [];
  /** @type {Array<{fallback: string, within: string[]}>} */
  const out = [];
  const re = /\bvar\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchingParen(text, open);
    if (close < 0) break;
    const inner = text.slice(open + 1, close);
    let depth = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (c === ',' && depth === 0) {
        out.push({
          fallback: inner.slice(i + 1).trim(),
          within: enclosingFunctions(text, m.index),
        });
        break;
      }
    }
  }
  return out;
}

/**
 * The names of the functions whose parentheses are open at `at`, innermost
 * first.
 * @param {string} text
 * @param {number} at
 * @returns {string[]}
 */
function enclosingFunctions(text, at) {
  /** @type {string[]} */
  const open = [];
  for (let i = 0; i < at; i += 1) {
    if (text[i] === '(')
      open.push(/([a-z-]*)$/i.exec(text.slice(0, i))?.[1] ?? '');
    else if (text[i] === ')') open.pop();
  }
  return open.reverse();
}

/**
 * The index of the parenthesis that closes the one at `open`, or -1.
 * @param {string} text
 * @param {number} open
 */
function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * A text size written another way (20px, 2e1, +20, 1.25rem, 125%, `20 px`,
 * `1,25rem`) as the body size in pixels text-size takes, kept to its 10 to
 * 32 (a size past an end is that end); null when it reads as no size.
 * @param {string} v
 * @returns {number | null}
 */
function textSizePx(v) {
  const m = /^\+?(\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em|%)?$/i.exec(
    typedPlain(v)
      .replace(/(\d)\.(?=[a-z%]*$)/i, '$1')
      .replace(/\s+/g, '')
      .replace(/^(\d+),(\d+)/, '$1.$2'),
  );
  if (!m) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const n =
    Number(m[1]) * (/r?em/.test(unit) ? 16 : unit === '%' ? 16 / 100 : 1);
  const px = Math.round(n * 100) / 100;
  return Math.max(10, Math.min(32, px));
}

/**
 * A value as it reads once what an input method or a stylesheet adds is
 * taken off: full-width digits, letters and signs (`１８`, `＃`) as their
 * plain forms, and CSS comments.
 * @param {string} v
 */
function typedPlain(v) {
  return v
    .normalize('NFKC')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A value pasted as a CSS declaration (`color: #e11d48;`, `font-weight: 700
 * !important`), from devtools or a stylesheet: its property and value, with
 * the `;` and `!important` gone. Null when the value is not a declaration (a
 * URL's `https:` is not a property).
 * @param {string} v
 * @returns {{property: string, value: string} | null}
 */
export function pastedDeclaration(v) {
  const plain = typedPlain(v);
  const m = /^(--[a-z0-9-]+|[a-z][a-z-]*)\s*:\s*(?!\/\/)(.*)$/i.exec(plain);
  if (!m || /^(https?|data|file|blob)$/i.test(m[1])) return null;
  const value = m[2]
    .replace(/;+\s*$/, '')
    .replace(/\s*!\s*important\s*$/i, '')
    .replace(/;+\s*$/, '')
    .trim();
  // `font-family: ;` names a property and no value: value is ''.
  return {property: m[1].toLowerCase(), value};
}

/**
 * A font pasted as a declaration (`font-family: Georgia, serif;`, from
 * devtools or a stylesheet), as the family list it names; a `font:`
 * shorthand gives its family; '' when it names the property and no value.
 * Null when the value is not a pasted declaration.
 * @param {string} v
 * @returns {string | null}
 */
export function pastedFont(v) {
  const d = pastedDeclaration(v);
  if (!d || !/^font(-family)?$/.test(d.property)) return null;
  const rest = d.value;
  // `font-family: ;` gives no font: '' (the caller refuses it).
  if (!rest) return '';
  if (d.property === 'font-family') return rest;
  const parts = fontShorthandParts(rest);
  return parts && typeof parts['font-family'] === 'string'
    ? parts['font-family']
    : null;
}

/**
 * The values a value may have meant, when what is wrong is how it was
 * typed: plain (full-width characters, comments and a trailing `;` gone,
 * quotes around a whole non-font value dropped), and for a font list each
 * family quoted as CSS needs it (`Font Awesome 6 Free`). Only values that
 * differ from the one typed.
 * @param {string} type
 * @param {string} value
 */
function valueMeant(type, value) {
  // `!important` is not part of a token's value (the theme places its
  // rules itself): the value without it.
  /** @type {string} */
  let p = (
    type === 'font' || type === 'font-family'
      ? pastedFont(value) || value
      : pastedDeclaration(value)?.value || typedPlain(value)
  )
    .replace(/;+\s*$/, '')
    .replace(/\s*!\s*important\s*$/i, '')
    .replace(/;+\s*$/, '')
    .trim();
  const q = /^(["'])(.*)\1$/.exec(p);
  if (q && type !== 'font') p = q[2].trim();
  const out = [p];
  // A var() of the app's own variable with a fallback: the fallback is the
  // value meant (`var(--brand, #e11d48)` → #e11d48).
  const fb = /^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/i.exec(p);
  if (fb) out.push(fb[1].trim());
  if (type === 'font' || type === 'font-family') {
    // A comma left out between families (`"Open Sans" serif`), read with
    // css-tree.
    const listed = familyListMeant(p);
    if (listed) out.push(listed);
    // Each family quoted as CSS needs it, only when no family holds a
    // quote inside (the pieces are whole names).
    const pieces = p.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
    if (!listed && pieces.every(f => !/["'\\]/.test(f)))
      out.push(pieces.map(f => cssFamily(f, true)).join(', '));
  }
  return [...new Set(out)].filter(x => x && x !== value.trim());
}

/**
 * Whether a value is one length that works inside calc(): a length with a
 * unit, a variable (with a fallback that is one too), or calc(), min(),
 * max() or clamp() giving a length; never several values, a bare number
 * (calc() cannot add one to a length, 0 included), a percentage or a
 * keyword.
 * @param {string} v
 * @returns {boolean}
 */
function oneLength(v) {
  const t = v.trim();
  if (splitTop(t, ' ').length !== 1) return false;
  const ref = /^var\(\s*--[a-z0-9-]+\s*(?:,(.*))?\)$/i.exec(t);
  if (ref) return ref[1] == null || oneLength(ref[1]);
  if (MATH_FUNCTION.test(t)) return matchType('length', t) != null;
  const n = cssNumber(t);
  return !!n && !!n.unit && n.unit !== '%';
}

/** The size units a typo is read against. */
const SIZE_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw', 'ch'];

/**
 * The size meant by a value one slip away from one: a space inside
 * (`16 px`), a decimal comma (`1,5rem`), a doubled or mistyped unit
 * (`16pxx`), a dot with no digit after it (`1.px`); null when none reads.
 * @param {string} v
 * @param {(x: string) => boolean} ok
 */
function sizeMeant(v, ok) {
  const t = v.trim();
  const n = typedPlain(t);
  const tries = [
    n,
    n.replace(/(\d)\.(?=[a-z%]|$)/gi, '$1'),
    t.replace(/(\d)\.(?=[a-z%]|$)/gi, '$1'),
    t.replace(/\s+/g, ''),
    t.replace(/^([+-]?\d+),(\d+)/, '$1.$2').replace(/\s+/g, ''),
    mathSpaced(t),
  ];
  const m = /^([+-]?\d*\.?\d+)\s*([a-z%]+)$/i.exec(
    t.replace(/^([+-]?\d+),(\d+)/, '$1.$2'),
  );
  if (m) {
    // A unit typed with a letter too many (pxx, remm, pxs).
    const unit = [...SIZE_UNITS]
      .sort((a, b) => b.length - a.length)
      .find(u => m[2].toLowerCase().startsWith(u));
    if (unit) tries.push(`${m[1]}${unit}`);
  }
  return tries.find(x => x !== t && ok(x)) ?? null;
}

/**
 * A math function with the spaces CSS needs around `+` and `-` put back
 * (`calc(1rem+2px)` is `calc(1rem + 2px)`); the value as it is otherwise.
 * @param {string} v
 */
function mathSpaced(v) {
  if (!/^(calc|min|max|clamp)\(/i.test(v) || /\bvar\(/i.test(v)) return v;
  return v.replace(/(\d(?<![\d.]e)|[%a-z)])([+-])(?=[\d.(])/gi, '$1 $2 ');
}

/**
 * The number meant by a value one slip away from one: a unit on a number
 * (`700px`), a decimal comma (`1,5`), letter O for zero (`7OO`), a weight
 * past the range (`1001` is 1000), a math function with no spaces around
 * `+` or `-`; null when none reads.
 * @param {string} v
 * @param {string} name the token
 * @param {(x: string) => boolean} ok
 */
function numberMeant(v, name, ok) {
  const t = v.trim();
  const plain = typedPlain(t).replace(/(\d)\.$/, '$1');
  const comma = plain.replace(/^([+-]?\d+),(\d+)/, '$1.$2');
  const tries = [
    /^[\doO.]+$/.test(plain) && /\d/.test(plain)
      ? plain.replace(/[oO]/g, '0')
      : plain,
    comma.replace(/^([+-]?\d*\.?\d+)\s*[a-z]+$/i, '$1'),
    comma,
    mathSpaced(t),
  ];
  if (/weight/.test(name)) {
    const n = Number(tries[1]);
    if (Number.isFinite(n)) tries.push(String(Math.min(1000, Math.max(1, n))));
  }
  return tries.find(x => x !== t && ok(x)) ?? null;
}

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
 * @param {string | {thing: string, on?: string, when?: string, state?: string, mode?: string}} [skip]
 * @returns {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean}>} every saved setting the editor no longer accepts
 */
export function storedProblems(ctx, slug, data, skip = '') {
  // The setting the command replaces (its thing in the same scope); a
  // setting of the same thing elsewhere is still checked.
  const skipThing = typeof skip === 'string' ? skip : skip.thing;
  /** @param {import('./_settings.mjs').Setting} s */
  const replaced = s =>
    typeof skip === 'string'
      ? s.thing === skip
      : s.thing === skip.thing &&
        (s.on ?? '') === (skip.on ?? '') &&
        (s.when ?? '') === (skip.when ?? '') &&
        (s.state ?? '') === (skip.state ?? '') &&
        (s.mode ?? '') === (skip.mode ?? '');
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
    if (s.thing === skipThing) continue;
    /** @param {string} why */
    const scope = why => ({setting: s, why, scope: true});
    const problem = (() => {
      const t = s.on ? ctx.project.target.get(s.on) : null;
      if (
        s.on &&
        !t &&
        !FAMILIES[s.on] &&
        !(s.thing === 'font' && FONT_ROLES.includes(s.on))
      )
        return scope(`there is no part or group "${s.on}"`);
      // A token that is no design token, or a part property that is no
      // CSS property or names no part, styles nothing: reported, never
      // built.
      if (s.source === 'token' && !(s.thing in TOKENS))
        return {setting: s, why: `${s.thing} is not a design token`};
      if (s.source === 'property' && !s.on)
        return {
          setting: s,
          why: `${s.thing} is a CSS property, so it needs a part (--on)`,
        };
      if (
        s.source === 'property' &&
        !s.thing.startsWith('--') &&
        !cssProperties().has(s.thing)
      )
        return {setting: s, why: `${s.thing} is not a CSS property`};
      // A value its CSS grammar does not take (a hand edit: padding
      // banana) is dropped by the browser: reported by name, never built.
      if (s.source === 'property' && !s.thing.startsWith('--')) {
        const bad = propertyProblem(s.thing, String(s.value ?? ''));
        if (bad)
          return {
            setting: s,
            why: `${s.thing} takes ${bad.takes}, not "${String(s.value ?? '').slice(0, 60)}"`,
          };
      }
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
  // Every part setting and the font dial are checked as set checks a value
  // typed in (a CSS keyword where no family is, one length where Core reads
  // a padding inside calc(), a value the property's grammar refuses …), so
  // a hand edit set would refuse is reported, never built, as compile does.
  const scoped = new Set(found.map(f => f.setting));
  for (const s of data.settings) {
    if (replaced(s) || scoped.has(s)) continue;
    if (!(
      s.source === 'property' ||
      (s.source === 'dial' && s.thing === 'font')
    ))
      continue;
    try {
      checkSetting(
        ctx,
        slug,
        {...data, settings: data.settings.filter(x => x !== s)},
        s.thing,
        s.value,
        {on: s.on, when: s.when, state: s.state, mode: s.mode, only: s.only},
      );
    } catch (e) {
      if (!(e instanceof AstryxError)) throw e;
      found.push({
        setting: s,
        why:
          e instanceof Error
            ? e.message.replace(/ Nothing was changed\.$/, '')
            : String(e),
      });
    }
  }
  for (const s of data.settings) {
    if (s.source !== 'token' || s.thing === skipThing || !(s.thing in TOKENS))
      continue;
    // A var() a hand edit put in that names no design token reads nothing,
    // as set refuses it.
    const bad = unknownVarRef(String(s.value ?? ''), TOKENS, s.thing);
    if (bad) {
      found.push({setting: s, why: bad.message});
      continue;
    }
    try {
      checkTypedValue(
        ctx.C.typeOf(s.thing),
        s.value,
        s.thing,
        TOKENS,
        ctx.C.typeOf,
        slug,
        ctx.C.propsReading(s.thing),
        multipliedTokens(ctx.project).has(s.thing),
      );
      checkCycle(s.thing, s.value, TOKENS, data, ctx.project.cwd, s);
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
 * @param {string[]} [readers] the CSS properties that read the token
 * @param {boolean} [multiplied] whether Core multiplies the token by a size
 */
function checkTypedValue(
  type,
  value,
  name,
  TOKENS,
  typeOf,
  slug,
  readers = [],
  multiplied = false,
) {
  // The value meant, when what is wrong is how it was typed (a trailing
  // `;`, a comment, quotes around it, full-width characters, a font name
  // that needs quotes): the same value, if the token takes it.
  const meant = () => {
    for (const c of valueMeant(type, value))
      try {
        checkTypedValue(
          type,
          c,
          name,
          TOKENS,
          typeOf,
          slug,
          readers,
          multiplied,
        );
        return c;
      } catch {
        // Not this one.
      }
    return null;
  };
  /** @param {string} what @param {string} example */
  const bad = (what, example) =>
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is ${what}; "${value}" is not one.`,
      {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(meant() ?? example)}`,
        ],
      },
    );
  // A font file or a link is no family name: never quoted into one.
  if (type === 'font') {
    const file = fontFileReason(pastedFont(value) || value);
    if (file)
      refuse(E.ERR_THEME_BAD_VALUE, file, {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
        ],
      });
  }
  if (!isSafeValue(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.${/!\s*important/i.test(value) ? ' !important is not used: the theme places its own rules.' : ''}`,
      {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(meant() ?? exampleOf(type, name))}`,
        ],
      },
    );
  // A CSS-wide keyword on a token is no value: whatever reads the token
  // gets none, and drops its declaration (a font list falls back to the
  // browser's default font). On a part property it keeps its meaning.
  const keyword = value
    .split(',')
    .map(x => x.trim().toLowerCase())
    .find(x => CSS_WIDE.includes(x));
  if (keyword)
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${keyword}" is a CSS keyword, not a value: on ${name} it leaves the token empty, so what reads it drops its style. Give a value such as ${exampleOf(type, name)}, or undo ${name} to go back to the base theme's.`,
      {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
          `${P} undo ${slug} ${name}`,
        ],
      },
    );
  // A var() inside a larger value (calc, max, color-mix) has a fallback of
  // the token's kind too, checked like a whole-value var().
  if (type !== 'other')
    for (const {fallback, within} of innerVarFallbacks(value)) {
      // Inside a color's channels (rgb(var(--r, 0) 0 0)) a fallback is a
      // channel, not a color.
      if (
        type === 'color' &&
        within.some(f =>
          /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(f),
        )
      )
        continue;
      if (fallback === '')
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${name} is a ${type}; the var() in "${value}" has an empty fallback, which leaves it with no value when the variable is unset.`,
          {
            run: [
              `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
            ],
          },
        );
      if (!/\bvar\(/i.test(fallback) && !/^[a-z-]+\(/i.test(fallback))
        checkTypedValue(
          type,
          fallback,
          name,
          TOKENS,
          typeOf,
          slug,
          readers,
          multiplied,
        );
    }
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
    // The fallback is what shows when the variable is unset: it must be a
    // value of the token's kind too.
    const fallback = ref[2]?.slice(1).trim();
    if (fallback === '' && type !== 'other')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${name} is a ${type}; "${value}" has an empty fallback, which leaves it with no value when the variable is unset.`,
        {
          run: [
            `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
          ],
        },
      );
    if (fallback)
      checkTypedValue(
        type,
        fallback,
        name,
        TOKENS,
        typeOf,
        slug,
        readers,
        multiplied,
      );
    return;
  }
  if (type === 'color' && !isFixedColor(value)) bad('a color', '#1f2937');
  if (type === 'size' && !isSize(value, name)) {
    // With nothing to read from the value, the token's own default (a text
    // size stays readable), never one size for every token.
    // Followed through the tokens it reads (var(--font-size-base)).
    let own = String(TOKENS[name] ?? '').trim();
    for (let hop = 0; hop < 4; hop += 1) {
      const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(own)?.[1];
      if (!ref) break;
      own = String(TOKENS[ref] ?? '').trim();
    }
    const sizeExample =
      own && isSize(own, name) && !/var\(/.test(own) ? own : '6px';
    // The size meant, when one dot or sign is all that is wrong (1.px).
    const meant = value.trim().replace(/(\d)\.(?=[a-z%]|$)/gi, '$1');
    // A bare number is the size in px.
    // A bare number is the size in px; a minus sign is dropped.
    const plain = value.trim().replace(/^-(?=\d|\.\d)/, '');
    const px = /^[+]?\d*\.?\d+(e[+-]?\d+)?$/i.test(plain)
      ? `${Number(plain)}px`
      : /^\d*\.?\d+[a-z%]+$/i.test(plain) && plain !== value.trim()
        ? plain
        : null;
    const slip = sizeMeant(value, x => isSize(x, name));
    bad(
      'a size',
      meant !== value.trim() && isSize(meant, name)
        ? meant
        : px && isSize(px, name)
          ? px
          : (slip ?? sizeExample),
    );
  }
  // A percentage reaches every property that reads the token; one that
  // takes none (a border or outline width, an outline offset) drops it.
  if (type === 'size' && /%/.test(value.replace(/var\([^)]*\)/g, ''))) {
    const strict = readers.filter(p => !takesPercentage(p));
    if (strict.length)
      bad(
        `a length with no percentage (${strict.slice(0, 3).join(', ')} read${strict.length === 1 ? 's' : ''} it, and take${strict.length === 1 ? 's' : ''} none)`,
        '1px',
      );
  }
  if (type === 'number' && !isNumber(value, name))
    bad(
      'a number',
      numberMeant(value, name, x => isNumber(x, name)) ??
        (/weight/.test(name) ? '600' : '1.4'),
    );
  // A token Core's stylesheet multiplies by a size inside calc() (the line
  // heights) takes a number with no unit: there a length, a percentage or
  // normal is invalid.
  const coreDefault = String(TOKENS[name] ?? '').trim();
  const v0 = value.trim();
  const read = cssNumber(v0);
  if (
    type === 'number' &&
    multiplied &&
    !/^var\(--[a-z0-9-]+\)$/i.test(v0) &&
    read?.unit !== '' &&
    !(MATH_FUNCTION.test(v0) && matchType('number', v0) != null)
  ) {
    const unitless =
      read?.unit === 'em'
        ? String(read.value)
        : read?.unit === '%'
          ? String(read.value / 100)
          : coreDefault;
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} takes a number with no unit: Core multiplies it by a text size inside calc() (field heights, dialog headers, code blocks), where "${value}" is invalid. ${unitless === coreDefault ? `Core's own value is ${coreDefault}.` : `${unitless} is the same line height as a number.`}`,
      {
        run: [`${P} set ${slug} ${name} ${quoteCommandArgument(unitless)}`],
      },
    );
  }
  if (type === 'time' && !isTime(value)) bad('a time up to 60s', '150ms');
  if (type === 'easing' && !isEasing(value))
    bad('an easing', 'cubic-bezier(0.2, 0, 0, 1)');
  if (type === 'font' && !isFamilyList(value))
    bad('a font family list', 'Inter, sans-serif');
  if (type === 'shadow' && !isShadow(value))
    bad('a shadow', '0 2px 4px rgb(0 0 0 / 0.2)');
  if (
    /^--focus-outline-style$/.test(name) &&
    !matchValue('outline-style', value.trim())
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
  if (CSS_WIDE.includes(v)) return false;
  if (/^var\(/.test(v)) return true;
  if (SYSTEM_COLORS.includes(v)) return true;
  // Percentages that add up to 0 leave color-mix() no color.
  // A share is 0% to 100%.
  const zeroMix = (/** @type {string[]} */ colors) => {
    const pcts = colors.map(c => mixSide(c).pct);
    return (
      pcts.some(p => p != null && (p < 0 || p > 100)) ||
      (pcts.every(p => p != null) && pcts.every(p => p === 0))
    );
  };
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
      !zeroMix(colors) &&
      colors.every(c => isFixedColor(mixSide(c).color))
    );
  }
  if (!isColorValue(v)) return false;
  // A relative color is read by the browser (the grammar the editor reads
  // does not know it); channels with math or variables must still read as
  // a color, typed as the browser types them.
  if (/\bfrom\b/.test(v)) return true;
  if (MATH_FUNCTION.test(v) || /\b(var|env)\(/.test(v))
    return matchType('color', v) != null;
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
 * Whether a value is a time the browser takes, at most a minute and never
 * negative (the grammar has no range).
 * @param {string} value
 */
function isTime(value) {
  const ast = matchType('time', value.trim());
  return (
    ast != null &&
    numbersIn(ast).every(
      n =>
        !['s', 'ms'].includes(n.unit) ||
        (n.value >= 0 && n.value * (n.unit === 's' ? 1000 : 1) <= 60_000),
    )
  );
}

/**
 * Whether a value is an easing the browser takes. The grammar has no range
 * for a step count: steps() needs at least one step, and two with
 * `jump-none`.
 * @param {string} value
 */
function isEasing(value) {
  const ast = matchType('easing-function', value.trim());
  if (!ast) return false;
  const count = numbersIn(ast).find(n => n.fn === 'steps');
  return !count || count.value >= (/jump-none/i.test(value) ? 2 : 1);
}

/** Whether a value is a font family list. @param {string} value */
const isFamilyList = value => matchValue('font-family', value.trim()) != null;

/**
 * Whether a value is a shadow list. The grammar has no range for the blur
 * (the third length), which is never negative.
 * @param {string} value
 */
function isShadow(value) {
  if (!matchValue('box-shadow', value.trim())) return false;
  return splitTop(value.trim(), ',').every(layer => {
    const lengths = splitTop(layer.trim(), ' ').filter(w =>
      /^[+-]?\d*\.?\d+[a-z]*$/i.test(w),
    );
    return !(lengths[2] ?? '').startsWith('-');
  });
}

/**
 * Refuse a value that would read the token itself, through other tokens.
 * A token set on a part (`--on`) overrides only inside that part: there
 * it reads the part's own settings first and the whole theme's after, and
 * a whole-theme value never reads a part's. So a loop counts only when it
 * closes within one scope: a part token that reads a whole-theme token
 * reads the inherited value, which is already resolved.
 * @param {string} thing
 * @param {string} value
 * @param {Record<string, unknown>} TOKENS
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} [cwd] the project, whose `<slug>.theme.ts` tokens win
 *   over the settings and are read too
 * @param {{on?: string, state?: string, when?: string}} [scope] where
 *   the token is set; none for the whole theme
 */
function checkCycle(thing, value, TOKENS, data, cwd, scope = {}) {
  const own = cwd ? ownSourceTokenValues(cwd, data.name) : {};
  // The base theme's own values come under the settings: a base that maps
  // one token to another closes a loop too.
  const baseTokens = cwd ? baseTopTokens(cwd, data.like) : new Map();
  const on = scope.on ?? null;
  const settings = [...data.settings].reverse();
  /**
   * The token's value set on the part, or undefined: a setting with the
   * same state and variant wins over the part's plain one.
   * @param {string} t
   */
  const partValue = t => {
    if (on == null) return undefined;
    const onPart = settings.filter(
      s => s.source === 'token' && s.thing === t && s.on === on,
    );
    const same = onPart.find(
      s =>
        (s.state ?? null) === (scope.state ?? null) &&
        (s.when ?? null) === (scope.when ?? null),
    );
    const set = (same ?? onPart.find(s => s.state == null && s.when == null))
      ?.value;
    if (set !== undefined) return set;
    // Else what the part's plain rule holds as built: the own source's and
    // the base theme's part rules (neutral's progress-bar reads
    // --color-border-emphasized).
    // A state or variant rule of the part inherits its plain rule.
    if (!cwd) return undefined;
    const rule = partRule().get(t);
    return rule ?? undefined;
  };
  /** @type {Map<string, string | null> | null} */
  let rule = null;
  const partRule = () =>
    (rule ??= on
      ? partRuleTokens(/** @type {string} */ (cwd), data.name, data.like, on)
      : new Map());
  /** @param {string} t */
  const globalValue = t =>
    String(
      (Object.hasOwn(own, t) ? own[t] : null) ??
        settings.find(s => s.source === 'token' && s.thing === t && !s.on)
          ?.value ??
        baseTokens.get(t) ??
        TOKENS[t] ??
        '',
    );
  const refs = (/** @type {string} */ v) =>
    [...v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(m => m[1]);
  /** @type {string[]} */
  const path = [];
  const seen = new Set();
  /**
   * Whether `t`, read in the part (`inPart`) or the whole theme, reaches
   * the token being set in its own scope.
   * @param {string} t @param {boolean} inPart @returns {boolean}
   */
  const reaches = (t, inPart) => {
    // The token being set is reached only in the scope it is set in.
    if (t === thing && inPart === (on != null)) return true;
    const part = inPart ? partValue(t) : undefined;
    const local = part !== undefined;
    const key = `${local ? 'part' : 'theme'}:${t}`;
    if (seen.has(key)) return false;
    seen.add(key);
    path.push(
      local
        ? `${t} (on ${on})`
        : Object.hasOwn(own, t)
          ? `${t} (set in ${data.name}.theme.ts)`
          : t,
    );
    if (
      refs(local ? String(part) : globalValue(t)).some(r => reaches(r, local))
    )
      return true;
    path.pop();
    return false;
  };
  if (refs(value).some(r => reaches(r, on != null)))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${thing} would read itself${path.length ? ` through ${path.join(', ')}` : ''}, so it would have no value at all.`,
      {
        run: [
          `${P} set ${data.name} ${thing} <a value that does not read ${thing}>${on != null ? ` --on ${on}` : ''}`,
        ],
      },
    );
}

/**
 * The CSS color name nearest a word typed as a color (`banan` is not one,
 * `rd` is red), or null when none is near.
 * @param {string} v
 */
function nearestColorName(v) {
  const w = v.trim().toLowerCase();
  if (!/^[a-z]+$/.test(w)) return null;
  return nearest(w, COLOR_NAMES)[0] ?? null;
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
  const known = propertyGrammar(prop);
  if (!known || COLOR_PROPS.test(prop)) return null;
  // Each var() fallback is what shows when its variable is unset: the
  // value with the fallbacks in place must be one the property takes too.
  const unset = withFallbacks(v);
  if (unset != null && matchValue(prop, v) && !matchValue(prop, unset))
    return {
      takes: `a value its CSS grammar takes in each var() fallback too (${grammarText(known)})`,
      near: initialOf(prop),
    };
  if (matchValue(prop, v))
    return belowRange(prop, v)
      ? {
          takes: 'a value of 0 or more',
          near: v.replace(/(^|[\s(,/])-(?=\.?\d)/g, '$1'),
        }
      : null;
  // The same value as it was meant to be typed (a font name quoted, a
  // trailing `;` gone), when the property takes that.
  const fixed = valueMeant(prop === 'font-family' ? 'font' : 'other', v).find(
    c => matchValue(prop, c),
  );
  if (fixed)
    return {
      takes: `a value its CSS grammar takes (${grammarText(known)})`,
      near: fixed,
    };
  // Only keywords the property takes on their own are offered; the same
  // word without its dashes or a trailing -ed/-s comes first (no-wrap is
  // nowrap, underlined is underline), then the nearest in spelling.
  const own = keywordsOf(prop).filter(k => matchValue(prop, k));
  const typed = v.toLowerCase();
  const bare = (/** @type {string} */ w) => w.replace(/[-\s]/g, '');
  const near = /^[a-z-]+$/i.test(v)
    ? (own.find(k => bare(k) === bare(typed)) ??
      own.find(k => typed.replace(/(ed|d|s)$/, '') === k) ??
      nearest(typed, own)[0] ??
      null)
    : null;
  // A value that works, for the suggestion: a keyword near the one typed,
  // the property's initial value, or an example of its kind; each checked.
  const example = exampleOf(groupOfPropType(prop), prop);
  const initial = initialOf(prop);
  // A bare number on a length property means px (`padding 4` → `4px`, each
  // number in a list too), when the property takes that.
  // Each bare number token gets px (a mixed list `4 8px`, `8 / 4`, an
  // exponent `1e1`), a unit split off by a space (`4 px`) joins its number.
  const joined = v.replace(/(\d)\s+(px|rem|em|%)\b/gi, '$1$2');
  const withPx = /\d/.test(joined)
    ? joined.replace(
        /(^|[\s/(,])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?=$|[\s/),])/gi,
        (_, pre, num) =>
          Number(num) === 0 ? `${pre}${num}` : `${pre}${num}px`,
      )
    : null;
  // A suggestion is offered only when the property takes it, in range too.
  const takes = (/** @type {string | null} */ x) =>
    x != null && matchValue(prop, x) != null && !belowRange(prop, x);
  return {
    takes: `a value its CSS grammar takes (${grammarText(known)})`,
    near:
      (takes(withPx) ? withPx : null) ??
      // Below the property's range (a negative width): the same, 0 or more.
      (withPx && takes(withPx.replace(/(^|[\s/(,])-(?=\.?\d)/g, '$1'))
        ? withPx.replace(/(^|[\s/(,])-(?=\.?\d)/g, '$1')
        : null) ??
      (takes(joined) && joined !== v ? joined : null) ??
      // Several values on a property that takes one (padding-top with four):
      // the first of them, when it is one the property takes.
      (() => {
        const first = splitTop((withPx ?? joined).trim(), ' ')[0];
        return first && first !== v && takes(first) ? first : null;
      })() ??
      (near && takes(near) ? near : null) ??
      // A value with numbers never falls back to the property's reset
      // (padding 0 would remove what was asked for).
      (/\d/.test(v)
        ? null
        : ((takes(initial) ? initial : null) ??
          (takes(example) ? example : null))),
  };
}

/** Words people use for a dial's values, by dial. */
const DIAL_WORDS = wordTable(
  /** @type {Record<string, Record<string, string>>} */ ({
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
  }),
);

/**
/**
 * Whether the base theme's own part styles read a token (`var(--x)`), which
 * the editor's record of Core's parts does not cover.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} like
 * @param {string} token
 */
function baseReads(ctx, like, token) {
  try {
    return new RegExp(`var\\(${token}[,)]`).test(
      fs.readFileSync(baseThemeFile(ctx.project, like), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Check one setting and give it back ready to store, or refuse. What it
 * accepts, the settings loader takes too: the loader's own check runs last,
 * so a saved setting never blocks the theme.
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
  // Any other dial's value pasted with its property name (`font-size:
  // 18px;` for text-size, `color: #e11d48` for accent) is the value: one
  // path for every dial (the font dial reads its own below).
  if (!unset && typeof value === 'string' && DIALS[thing] && thing !== 'font') {
    const d = pastedDeclaration(value);
    if (d?.value) value = d.value;
  }
  // The font dial's value as pasted from a stylesheet (`Georgia, serif;`,
  // a comment, `!important`): a refusal suggests the font it names, when
  // set takes that.
  // A font pasted with its property name is the family list it names.
  if (
    !unset &&
    typeof value === 'string' &&
    (thing === 'font' ||
      (thing.startsWith('--') && ctx.C.typeOf(thing) === 'font'))
  ) {
    const pasted = pastedFont(value);
    if (pasted === '')
      refuse(
        E.ERR_MISSING_ARGUMENT,
        `"${value.trim()}" names a font property but gives no font. Give the family after the colon, or alone.`,
        {
          run: [
            `${P} set ${slug} ${thing} ${quoteCommandArgument(thing === 'font' ? 'inter' : 'Inter, sans-serif')}${flags.on ? ` --on ${quoteCommandArgument(flags.on)}` : ''}`,
          ],
        },
      );
    if (pasted) value = pasted;
  }
  if (thing === 'font' && !unset && typeof value === 'string') {
    const meant = typedPlain(value)
      .replace(/;+\s*$/, '')
      .replace(/\s*!\s*important\s*$/i, '')
      .replace(/;+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (meant && meant !== value.trim())
      try {
        return checkSettingAsTyped(ctx, slug, data, thing, value, flags);
      } catch (e) {
        try {
          checkSettingAsTyped(ctx, slug, data, thing, meant, flags);
        } catch {
          throw e;
        }
        if (e instanceof AstryxError)
          e.suggestions = [
            {
              name: `${P} set ${slug} font ${quoteCommandArgument(meant)}${flags.on ? ` --on ${quoteCommandArgument(flags.on)}` : ''}`,
              reason: 'do this instead',
            },
          ];
        throw e;
      }
  }
  const s = checkSettingAsTyped(ctx, slug, data, thing, value, flags, unset);
  // A var() with a fallback always gives a value; a name one slip from a
  // design token is noted as a likely typo, and the setting stands.
  if (!unset && typeof value === 'string' && !s.note) {
    const typo = fallbackVarTypo(value, ctx.project.core.tokenDefaults ?? {});
    if (typo) s.note = typo;
  }
  return s;
}

/**
 * A note for a var() with a fallback whose name is a letter or two off a
 * design token (`var(--spacing-xl, 2rem)` when the token is `--spacing-x1`):
 * the fallback shows until it is fixed. Null when there is none.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 */
function fallbackVarTypo(v, TOKENS) {
  for (const [, name] of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,/gi)) {
    if (name in TOKENS || name.startsWith('--_')) continue;
    const near = nearest(name, Object.keys(TOKENS)).filter(
      n => levenshteinDistance(n, name) <= 2,
    );
    if (near.length)
      return `${name} is not a design token, so its fallback always shows; did you mean ${near[0]}?`;
  }
  return null;
}

/**
 * checkSetting for the value as typed.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} [unset]
 * @returns {import('./_settings.mjs').Setting}
 */
function checkSettingAsTyped(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset = false,
) {
  const s = checkOne(ctx, slug, data, thing, value, flags, unset);
  const why = unset ? null : valueProblem(s);
  if (why)
    refuse(
      E.ERR_THEME_BAD_VALUE,
      /cannot be a CSS value$/.test(why)
        ? `${why}: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote, so the browser would drop it.`
        : `${why}.`,
      {
        run: [
          s.thing === 'font'
            ? `${P} set ${slug} font inter${s.on ? ` --on ${s.on}` : ''}`
            : `${HOW} ${s.thing}`,
        ],
      },
    );
  return s;
}

/**
 * The checks of one setting, before the loader's (see checkSetting).
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} unset
 * @returns {import('./_settings.mjs').Setting}
 */
function checkOne(ctx, slug, data, thing, value, flags, unset) {
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
  const v = normalValue(thing, value ?? '');
  // A var() that misspells a design token would read nothing.
  if (!unset) {
    const bad = unknownVarRef(v, TOKENS, thing);
    if (bad)
      refuse(E.ERR_THEME_UNKNOWN_TOKEN, bad.message, {
        didYouMean: bad.near,
        run: [
          bad.close
            ? `${HOW} --list tokens ${bad.near[0].replace(/^--/, '').split('-')[0]}`
            : `${HOW} --list tokens`,
        ],
      });
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
  // A state in any case or spelling of its words (focusVisible,
  // focus_visible, 'focus visible') is the state, written as CSS writes it.
  if (flags.state)
    s.state = flags.state
      .trim()
      .replace(/^:+/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  if (flags.only) s.only = true;
  if (flags.mode) {
    const mode = flags.mode.toLowerCase();
    if (mode !== 'light' && mode !== 'dark')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `--mode takes light or dark, not "${flags.mode}".`,
        {
          didYouMean: nearest(mode, ['light', 'dark']),
          // The same setting for both modes runs as printed; the mode it
          // probably meant is the did-you-mean.
          run: [setLine(slug, thing, v, {...s, mode: undefined}, unset)],
        },
      );
    s.mode = mode;
  }
  const onFlag = s.on ? ` --on ${s.on}` : '';
  // A value that already gives both modes takes no --mode.
  if (s.mode && !unset && /^\s*light-dark\(/i.test(v ?? ''))
    refuse(
      E.ERR_THEME_NO_MODE,
      `"${v}" already gives both modes, so it takes no --mode; drop --mode, or give the ${s.mode} color alone.`,
      {
        run: [
          `${P} set ${slug} ${thing} ${quoteCommandArgument(String(v))}${s.on ? ` --on ${s.on}` : ''}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
        ],
      },
    );
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
  const isRole = thing === 'font' && FONT_ROLES.includes(s.on ?? '');
  if (s.on && !isRole && !FAMILIES[s.on]) {
    const t = TARGET.get(s.on);
    if (!t) {
      // Another case of a part or group, its class name copied from the
      // page (`.astryx-card`), or its component (`<Card>`, `Card`): that
      // part, as a working command with every flag kept.
      const lower = s.on
        .trim()
        .replace(/^<\/?\s*|\s*\/?>$/g, '')
        .replace(/^\./, '')
        .replace(/^astryx-/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
      // A plain word how reads as a part or group (checkboxes: checks).
      const byWord = partForWord(lower);
      // A plain plural of a part (cards, dialogs, tabs) is that part.
      const singular = [
        lower.replace(/ies$/, 'y'),
        lower.replace(/(ch|sh|x|s)es$/, '$1'),
        lower.replace(/s$/, ''),
      ].find(x => x !== lower && (TARGET.has(x) || FAMILIES[x]));
      const named =
        TARGET.has(lower) || FAMILIES[lower]
          ? lower
          : singular
            ? singular
            : byWord && (TARGET.has(byWord) || FAMILIES[byWord])
              ? byWord
              : null;
      if (named)
        refuse(
          E.ERR_THEME_UNKNOWN_PART,
          `"${s.on}" is not a part name; the part is ${named}.`,
          {
            didYouMean: [named],
            run: [setLine(slug, thing, v, {...s, on: named}, unset)],
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
            `${HOW} --list parts ${quoteCommandArgument(lower.replace(/s$/, '').split('-')[0] || 'button')}`,
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
    // Other words for a state, mapped to the one the part has; with none
    // near, the list of its states (never a guess such as hover).
    const SYNONYMS = wordTable(
      /** @type {Record<string, string[]>} */ ({
        pressed: ['active'],
        press: ['active'],
        down: ['active'],
        clicked: ['active'],
        hovered: ['hover'],
        focused: ['focus-visible', 'focus-within', 'focus'],
        checked: ['checked', 'selected'],
        selected: ['selected', 'checked'],
        open: ['open', 'expanded'],
        expanded: ['expanded', 'open'],
        inactive: ['disabled'],
      }),
    );
    const meant =
      (SYNONYMS[String(s.state ?? '').toLowerCase()] ?? []).find(x =>
        states.includes(x),
      ) ?? nearest(String(s.state ?? ''), states)[0];
    if (s.state && !states.includes(s.state))
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of ${s.on}. States: ${states.join(', ')}.`,
        {
          ...(meant ? {didYouMean: [meant]} : {}),
          run: [
            meant
              ? setLine(slug, thing, v, {...s, state: meant}, unset)
              : `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
  }
  // A part whose styled element is a wrapper (a text input's box) shows
  // focus only through focus-within: focus or focus-visible there would
  // never apply. Named the way `how` names it.
  if (!unset && s.on && (s.state === 'focus' || s.state === 'focus-visible')) {
    const parts = partsOf(ctx, s).filter(t => focusStateOf(ctx, t));
    if (
      parts.length &&
      parts.every(t => focusStateOf(ctx, t) === 'focus-within')
    )
      refuse(
        E.ERR_THEME_NO_EFFECT,
        `${s.on} shows focus on its box, around the field itself, so ${s.state} never applies there; focus-within does (the box while the field inside has focus).`,
        {
          didYouMean: ['focus-within'],
          run: [setLine(slug, thing, v, {...s, state: 'focus-within'}, unset)],
        },
      );
  }
  // A state that depends on the element applies only where it can: focus
  // where Core's own styles key on it, disabled on a part whose component
  // takes a disabled prop (Core marks it with aria-disabled, which the
  // theme's selector matches too), never on a part with no styles of its
  // own.
  if (
    !unset &&
    !ctx.unchecked &&
    s.on &&
    s.state &&
    ['disabled', 'focus', 'focus-visible', 'focus-within', 'active'].includes(
      s.state,
    )
  ) {
    const parts = partsOf(ctx, s);
    const own = (/** @type {string} */ t) => ctx.C.MAP[t]?.own ?? {};
    const keys = (/** @type {string} */ t, /** @type {string} */ st) =>
      JSON.stringify(own(t)).includes(`:${st}`);
    const states = (/** @type {string} */ t) =>
      ctx.project.target.get(t)?.states ?? [];
    // The part's component, or the one named like the part (tab is Tab,
    // under TabList), takes a disabled prop.
    const disables = (/** @type {string} */ t) => {
      // Or its built module sets aria-disabled (a tab takes it through its
      // other props): what Core renders, read from Core itself.
      const marks = (/** @type {string} */ n, /** @type {any} */ doc) => {
        const at = doc?.importPath?.split('/').pop();
        const file =
          at && ctx.project.coreDir
            ? path.join(ctx.project.coreDir, 'dist', at, `${n}.js`)
            : null;
        try {
          return file
            ? fs.readFileSync(file, 'utf8').includes('aria-disabled')
            : false;
        } catch {
          return false;
        }
      };
      return partComponentDocs(ctx, t).some(
        ({name, doc}) =>
          Object.keys(doc.props ?? {}).some(p => /disabled/i.test(p)) ||
          marks(name, doc),
      );
    };
    // A part holds content that can take focus, so focus-within applies
    // there: its component takes children or elements in a prop (a dialog,
    // a section, a chat composer's input).
    const holdsContent = (/** @type {string} */ t) =>
      partComponentDocs(ctx, t).some(({doc}) =>
        Object.entries(doc.props ?? {}).some(
          ([k, v]) =>
            k === 'children' ||
            /\bReact(Node|Element)\b/.test(
              String(/** @type {any} */ (v)?.type ?? ''),
            ),
        ),
      );
    // A part Core never styles in focus is not what takes focus (the
    // focusable element is inside it, or beside it).
    const focusable = (/** @type {string} */ t) =>
      /:focus(?!-within)/.test(JSON.stringify(own(t)));
    const dead = parts.filter(
      t =>
        !states(t).includes(/** @type {string} */ (s.state)) &&
        ((Object.keys(own(t)).length === 0 &&
          !(s.state === 'focus-within' && holdsContent(t))) ||
          ((s.state === 'focus' || s.state === 'focus-visible') &&
            !focusable(t)) ||
          (s.state === 'disabled' &&
            !keys(t, 'disabled') &&
            !JSON.stringify(own(t)).includes('aria-disabled') &&
            !disables(t)) ||
          (s.state === 'active' && !keys(t, 'active')) ||
          // focus-within on a part Core never styles that way: nothing
          // focusable is inside it (a switch's input sits beside its track).
          (s.state === 'focus-within' &&
            !keys(t, 'focus-within') &&
            !focusable(t) &&
            !holdsContent(t))),
    );
    if (parts.length && dead.length === parts.length) {
      const bare = Object.keys(own(dead[0])).length === 0;
      const within = keys(dead[0], 'focus-within');
      refuse(
        E.ERR_THEME_NO_EFFECT,
        bare
          ? `${s.on} has no styles of its own (its looks come from the parts inside it), so --state ${s.state} never applies on it.`
          : s.state === 'active'
            ? `Core never styles ${s.on} while it is pressed, so --state active never applies on it.`
            : s.state === 'disabled'
              ? `${s.on} is never marked disabled (its component takes no disabled prop, and Core never styles it disabled), so --state disabled never applies on it.`
              : s.state === 'focus-within'
                ? `nothing inside ${s.on} takes focus (what takes focus sits beside it), so --state focus-within never applies on it.`
                : `${s.on} never takes focus itself (what takes focus is inside it or beside it), so --state ${s.state} never applies on it.${within ? ' focus-within does: the part while something inside it has focus.' : ''}`,
        {
          ...(within && !bare && /^focus/.test(s.state)
            ? {didYouMean: ['focus-within']}
            : {}),
          run: [
            within && !bare && /^focus/.test(s.state)
              ? setLine(slug, thing, v, {...s, state: 'focus-within'}, unset)
              : bare
                ? `${HOW} --list parts ${s.on.split('-')[0]}`
                : `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
    }
  }
  // Core expands a part's padding into its container tokens from a plain
  // padding only, so in a state that padding never reaches what sits edge
  // to edge inside it: refused, judged on the part named (a group member
  // spreads; when only another member is the reason, --only keeps it to
  // the part named).
  if (!unset && s.on && s.state && ctx.derived) {
    // A padding property goes through the padding model, which writes a
    // state's own side variables; the spacing dial does not.
    const prop = thing === 'spacing' ? 'padding' : null;
    const expands = (/** @type {string} */ t) =>
      (ctx.derived?.[t] ?? []).some(
        d => d.property === prop && d.expand === 'container',
      );
    const named = ctx.project.target.get(s.on) ? s.on : null;
    const hit = prop
      ? named && expands(named)
        ? named
        : partsOf(ctx, s).find(expands)
      : undefined;
    if (hit)
      refuse(
        E.ERR_THEME_NO_EFFECT,
        `Core sets ${hit}'s inner padding (what sits edge to edge inside it) from a plain padding setting only, so with --state ${s.state} it would stay behind.`,
        {
          // The value as set takes it: a bare number in px.
          run: (() => {
            const fixed =
              thing === 'spacing' ? v : (propertyProblem(thing, v)?.near ?? v);
            return [
              named && !expands(named) && !s.only
                ? setLine(slug, thing, fixed, {...s, only: true})
                : setLine(slug, thing, fixed, {...s, state: undefined}),
            ];
          })(),
        },
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
  // A comparative is a step from the value now (never a rung picked by
  // spelling, which can go the other way).
  if (!unset && (thing === 'corners' || thing === 'spacing')) {
    const w = v.toLowerCase();
    const MORE =
      thing === 'corners'
        ? /^(rounder|softer|bigger|larger|curvier|more rounded)$/
        : /^(roomier|looser|bigger|larger|wider|airier|more spacious)$/;
    const LESS =
      thing === 'corners'
        ? /^(sharper|squarer|smaller|tighter|harder|less rounded)$/
        : /^(tighter|denser|smaller|narrower|more compact|closer)$/;
    if (MORE.test(w))
      return checkOne(ctx, slug, data, thing, 'more', flags, unset);
    if (LESS.test(w))
      return checkOne(ctx, slug, data, thing, 'less', flags, unset);
  }
  const step = v === 'more' || v === 'less';
  // more/less step a dial with a scale; on a dial of named looks, they name
  // nothing, so the answer is what the dial takes, not one of its values.
  if (
    step &&
    !unset &&
    DIALS[thing] &&
    !['corners', 'spacing', 'text-size', 'vibrancy'].includes(thing)
  )
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${v}" steps a dial with a scale (corners, spacing, text-size, vibrancy); ${thing} takes one of ${DIALS[thing].values.replace(/\|/g, ', ')}.`,
      {run: [`${HOW} ${thing}`]},
    );
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
            run: near[0]
              ? [`${P} set ${slug} ${thing} ${near[0]}`]
              : // A type-scale ratio (1.25) is the nearest type preset.
                thing === 'type' && ratioPreset(lower)
                ? [`${P} set ${slug} type ${ratioPreset(lower)}`]
                : // A corner word or a size with a unit is the corners dial:
                  // on the buttons for `buttons`, for the whole theme
                  // otherwise. A bare number is no size: the dial's own
                  // words.
                  CORNERS.some(([n]) => lower.replace(/s$/, '') === n) ||
                    (/[a-z%]$/.test(lower) && lengthPx(lower) != null)
                  ? [
                      setLine(
                        slug,
                        'corners',
                        CORNERS.find(
                          ([n]) => lower.replace(/s$/, '') === n,
                        )?.[0] ?? lower,
                        thing === 'buttons' ? {on: 'button'} : {},
                      ),
                    ]
                  : [
                      ...(/^[+-]?\d*\.?\d+$/.test(lower) ? ok : [])
                        .filter(w => /^[a-z-]+$/.test(w))
                        .slice(0, 4)
                        .map(w => `${P} set ${slug} ${thing} ${w}`),
                      `${HOW} ${thing}`,
                    ],
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
            // The dial without --on, then the asked weight or tracking on
            // one level; a word with no meaning here gets neither.
            run: (() => {
              const w = String(v ?? '')
                .trim()
                .toLowerCase();
              if (HEADING_WEIGHTS[w] !== undefined)
                return [
                  `${P} set ${slug} headings ${w}`,
                  `${P} set ${slug} font-weight ${HEADING_WEIGHTS[w]} --on heading --when level:1`,
                ];
              if (HEADING_TRACKING[w] !== undefined)
                return [
                  `${P} set ${slug} headings ${w}`,
                  `${P} set ${slug} letter-spacing ${quoteCommandArgument(HEADING_TRACKING[w])} --on heading --when level:1`,
                ];
              return [`${HOW} headings`];
            })(),
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
        // The half word in any letters: `Tracking`, `TIGHT`.
        const w = String(v ?? '')
          .trim()
          .toLowerCase();
        s.axis =
          HEADING_TRACKING[w] !== undefined || w === 'tracking'
            ? 'tracking'
            : HEADING_WEIGHTS[w] !== undefined || w === 'weight'
              ? 'weight'
              : held.length === 1
                ? (held[0].axis ?? 'weight')
                : 'weight';
        return s;
      }
      if (HEADING_WEIGHTS[v] !== undefined) s.axis = 'weight';
      else if (HEADING_TRACKING[v] !== undefined) s.axis = 'tracking';
      else {
        // The word meant: in other letters (BOLD), or the rung nearest a
        // weight number (800 is heavy); never a rung the other way.
        const lower = v.trim().toLowerCase();
        const words = [
          ...Object.keys(HEADING_WEIGHTS),
          ...Object.keys(HEADING_TRACKING),
        ];
        const weight = /^\d+(\.\d+)?$/.test(lower) ? Number(lower) : null;
        const meant =
          words.find(w => w === lower) ??
          (weight != null
            ? Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
                Math.abs(Number(b[1]) - weight) <
                Math.abs(Number(a[1]) - weight)
                  ? b
                  : a,
              )[0]
            : nearest(lower, words)[0]);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `headings takes ${DIALS.headings.values}, not "${v}".${weight != null && meant ? ` ${meant} sets weight ${HEADING_WEIGHTS[meant]}.` : ''}`,
          {
            didYouMean: meant ? [meant] : [],
            run: meant
              ? [setLine(slug, 'headings', meant, s)]
              : [`${HOW} headings`],
          },
        );
      }
      return s;
    }
    if (unset) return s;
    /** @param {Array<[string, number]>} L @param {string | number} def */
    const ladder = (L, def) => {
      // The value in effect for the target: its own setting, else the
      // whole-theme one, else the starting point.
      // Same target: the part, and the same variant and state.
      const latest = (/** @type {string} */ on) =>
        [...data.settings].reverse().find(
          x =>
            x.thing === thing &&
            (x.on ?? '') === on &&
            (x.when ?? '') === (on ? (s.when ?? '') : '') &&
            (x.state ?? '') === (on ? (s.state ?? '') : '') &&
            // A member set alone (--only) is not the member as the group
            // spreads it.
            Boolean(x.only) === (on === s.on ? Boolean(s.only) : false),
        );
      const own = (/** @type {string} */ on) => latest(on)?.value;
      // A member covered by a later group setting shows the group's value
      // (the later one wins, as the build applies them).
      const fam = s.on ? familyOf(s.on) : null;
      // For a variant or state with no setting of its own, the part's
      // plain setting applies there too.
      const plainOn = (/** @type {string} */ on) =>
        [...data.settings]
          .reverse()
          .find(
            x =>
              x.thing === thing &&
              (x.on ?? '') === on &&
              !x.when &&
              !x.state &&
              !x.only === !(on === s.on && s.only),
          );
      const mine =
        latest(s.on ?? '') ??
        (s.on && (s.when || s.state) ? plainOn(s.on) : undefined);
      // With --only too: the member shows its group's value until it has one
      // of its own, as corners step.
      const group =
        fam && fam !== s.on
          ? (latest(fam) ?? (s.when || s.state ? plainOn(fam) : undefined))
          : undefined;
      const shown =
        mine && group
          ? data.settings.indexOf(group) > data.settings.indexOf(mine)
            ? group
            : mine
          : (mine ?? group);
      const cur =
        shown?.value ??
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
      const px =
        typeof cur === 'number'
          ? cur
          : (lengthPx(cur) ??
            (/^\d*\.?\d+$/.test(String(cur)) ? Number(cur) : Number.NaN));
      if (Number.isNaN(px)) return L[0][0];
      const next =
        v === 'more'
          ? L.find(([, n]) => n > px + 0.01)
          : [...L].reverse().find(([, n]) => n < px - 0.01);
      // Past the last step that way, a step would go back: give a size.
      if (!next) {
        const edge = /** @type {[string, number]} */ (
          v === 'more' ? L[L.length - 1] : L[0]
        );
        // The example stays inside what the dial takes (text-size: 10 to
        // 32); at that end, the exact token takes the size instead.
        const [lo, hi] = thing === 'text-size' ? [10, 32] : [0, Infinity];
        const want = Math.round(px + (v === 'more' ? 2 : -2));
        const atEnd = v === 'more' ? px >= hi : px <= lo;
        const example = String(cur).replace(
          /\d*\.?\d+/,
          String(Math.max(lo, Math.min(hi, want))),
        );
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} is ${typeof cur === 'number' ? `${cur}px` : cur}, already ${v === 'more' ? 'above' : 'below'} its ${v === 'more' ? 'largest' : 'smallest'} step (${edge[0]}, ${edge[1]}px), so "${v}" has nowhere to go.${atEnd ? ` It is also the ${v === 'more' ? 'largest' : 'smallest'} size ${thing} takes (${lo} to ${hi}); the base font size token takes any size.` : ' Give an exact size.'}`,
          {
            run: atEnd
              ? [
                  `${P} set ${slug} --font-size-base ${quoteCommandArgument(`${Math.max(1, want)}px`)}`,
                ]
              : [
                  `${P} set ${slug} ${thing} ${quoteCommandArgument(example)}${s.on ? ` --on ${s.on}` : ''}`,
                ],
          },
        );
      }
      return next[0];
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
        // The same scope, every other flag kept.
        {run: [setLine(slug, thing, v, {...s, mode: undefined})]},
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
        const token = s.on
          ? radiusTokenOf(ctx, partsOf(ctx, s)[0] ?? s.on, s.when)
          : '--radius-element';
        // What the part shows: a setting on it or on its group (the later
        // one wins), else a whole-theme setting, else the base theme.
        const fam = s.on ? familyOf(s.on) : null;
        // A setting reaches the part when it is on the part itself, on its
        // group, or spread from a member (pill on text-input reaches the
        // whole inputs group). One for the same variant and state wins,
        // else the part's plain one (it applies there too).
        const part = partsOf(ctx, s)[0] ?? s.on;
        const reaches = (/** @type {import('./_settings.mjs').Setting} */ x) =>
          x.thing === 'corners' &&
          x.on &&
          (x.on === s.on ||
            (fam && fam !== s.on && x.on === fam && !x.only) ||
            (!x.only && partsOf(ctx, x).includes(part)));
        const onPart = s.on
          ? ([...data.settings]
              .reverse()
              .find(
                x =>
                  reaches(x) &&
                  (x.when ?? '') === (s.when ?? '') &&
                  (x.state ?? '') === (s.state ?? ''),
              ) ??
            (s.when || s.state
              ? [...data.settings]
                  .reverse()
                  .find(x => reaches(x) && !x.when && !x.state)
              : undefined))
          : undefined;
        // A step on a member set alone stays on that member alone.
        if (onPart && onPart.on === s.on && onPart.only && !s.only)
          s.only = true;
        const whole = [...data.settings]
          .reverse()
          .find(x => x.thing === 'corners' && !x.on);
        const isRung = (/** @type {string} */ x) =>
          CORNERS.some(([n]) => n === x);
        // An exact border-radius on the part wins over any corners dial:
        // that is what it shows, and a step starts from it.
        const exactRadius = s.on
          ? [...data.settings]
              .reverse()
              .find(
                x =>
                  x.source === 'property' &&
                  x.thing === 'border-radius' &&
                  x.on &&
                  partsOf(ctx, x).includes(part) &&
                  (x.when ?? '') === (s.when ?? '') &&
                  (x.state ?? '') === (s.state ?? ''),
              )
          : undefined;
        const exactPx = exactRadius ? lengthPx(exactRadius.value) : null;
        const shown =
          exactPx != null
            ? exactPx
            : onPart
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
        // No rung that way: nothing is written, as for spacing.
        if (!next && !Number.isNaN(shown))
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `corners is already at the ${v === 'more' ? 'roundest' : 'squarest'} rung ${s.on ? `on ${s.on}` : 'for the theme'}, so ${v} has nowhere to go.`,
            {
              run: [
                setLine(slug, 'corners', v === 'more' ? 'less' : 'more', s),
              ],
            },
          );
        s.value = next ? next[0] : 'medium';
      } else {
        // A rung in any case, a size in px written any way: the plain form.
        const lower = v.toLowerCase();
        // Any CSS number in px (2e1px, +4px), the shared length parse.
        const pxLen = /px$/.test(lower) ? lengthPx(lower) : null;
        if (CORNERS.some(([n]) => n === lower)) s.value = lower;
        else if (pxLen != null && pxLen >= 0)
          s.value =
            pxLen >= 1000 ? 'pill' : `${Math.round(pxLen * 10000) / 10000}px`;
        // No rounding, said any way, is square.
        else if (/^(0|0%|none|sharp|zero|no|flat)$/.test(lower))
          s.value = 'square';
        else {
          // What it most likely means, as a value corners takes: a simple
          // calc() of px is worked out.
          const calc =
            /^calc\(\s*(\d*\.?\d+)px\s*([*/+-])\s*(\d*\.?\d+)(px)?\s*\)$/.exec(
              lower,
            );
          const calcPx = calc
            ? {
                '*': Number(calc[1]) * Number(calc[3]),
                '/': Number(calc[1]) / Number(calc[3]),
                '+': Number(calc[1]) + Number(calc[3]),
                '-': Number(calc[1]) - Number(calc[3]),
              }[/** @type {'*' | '/' | '+' | '-'} */ (calc[2])]
            : null;
          const len =
            calcPx != null && Number.isFinite(calcPx)
              ? calcPx
              : lengthPx(lower);
          const pct = /^(\d+(?:\.\d+)?)%$/.exec(lower);
          // A radius below zero means none: square.
          const meant =
            len != null
              ? len <= 0
                ? 'square'
                : `${Math.round(len * 100) / 100}px`
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
              // The same scope, flags included.
              run: [setLine(slug, 'corners', meant ?? 'medium', s)],
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
              setLine(slug, 'spacing', v || 'roomy', {
                ...s,
                state: undefined,
                mode: undefined,
              }),
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
      // A scale typed as a number (x0.75, 0.75, 75%) names the rung nearest
      // that factor.
      const factor = /^x?(\d*\.?\d+)(%)?$/i.exec(v);
      const nearFactor = factor
        ? SPACING.reduce((a, b) =>
            Math.abs(b[1] - Number(factor[1]) / (factor[2] ? 100 : 1)) <
            Math.abs(a[1] - Number(factor[1]) / (factor[2] ? 100 : 1))
              ? b
              : a,
          )[0]
        : null;
      if (step) s.value = ladder(SPACING, 'medium');
      else if (!SPACING.some(([n]) => n === v) && nearFactor)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing takes ${DIALS.spacing.values}, not "${v}"; the rung nearest that scale is ${nearFactor} (x${SPACING.find(([n]) => n === nearFactor)?.[1]}).`,
          {
            didYouMean: [nearFactor],
            run: [setLine(slug, 'spacing', nearFactor, s)],
          },
        );
      else if (/^(0|none|zero|no|off)$/i.test(v))
        // Spacing scales the theme's space; it never goes to nothing. The
        // tightest rung is the nearest that works.
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing scales the theme's space and never removes it; the tightest it goes is ${SPACING[0][0]}. For no space on one part, set padding or gap 0 on it.`,
          {
            didYouMean: [SPACING[0][0]],
            run: [setLine(slug, 'spacing', SPACING[0][0], s)],
          },
        );
      else if (!SPACING.some(([n]) => n === v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing takes ${DIALS.spacing.values}, not "${v}".`,
          {
            didYouMean: nearest(
              v,
              SPACING.map(([n]) => n),
            ),
            run: [
              setLine(
                slug,
                'spacing',
                nearest(
                  v,
                  SPACING.map(([n]) => n),
                )[0] ?? 'roomy',
                s,
              ),
            ],
          },
        );
    } else if (thing === 'text-size') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'text-size applies to the whole theme; for one part use font-size.',
          {
            // The asked size on the part: a rung's px (large is 15px), a
            // number as px; a step (more, less) has no size to carry.
            run: (() => {
              const w = String(v ?? '')
                .trim()
                .toLowerCase();
              const rung = TEXT_SIZE.find(([n]) => n === w)?.[1];
              const px =
                rung ?? (/^\d+(\.\d+)?(px)?$/.test(w) ? parseFloat(w) : null);
              return px != null && px > 0
                ? [setLine(slug, 'font-size', `${px}px`, s)]
                : [`${HOW} font-size`];
            })(),
          },
        );
      if (step) s.value = ladder(TEXT_SIZE, 'medium');
      else if (
        /^\d+\.\d+$/.test(v.trim()) &&
        Number(v) >= 10 &&
        Number(v) <= 32 &&
        Math.round(Number(v)) !== Number(v)
      ) {
        // Core builds the type scale in whole pixels: the size is saved as
        // the whole pixel it builds, and the result says so.
        s.value = String(Math.round(Number(v)));
        s.note = `text-size ${v.trim()} is saved as ${s.value}: the type scale is built in whole pixels`;
      } else if (
        !TEXT_SIZE.some(([n]) => n === v) &&
        !(/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) >= 10 && Number(v) <= 32)
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `text-size takes ${DIALS['text-size'].values} (a number is the body size in pixels, 10 to 32), not "${v}".`,
          (() => {
            // A rung in other letter case (Medium) or with px is that rung.
            const near =
              TEXT_SIZE.find(([n]) => n === v.trim().toLowerCase())?.[0] ??
              nearest(
                v.trim().toLowerCase(),
                TEXT_SIZE.map(([n]) => n),
              )[0];
            return near
              ? {
                  didYouMean: [near],
                  run: [`${P} set ${slug} text-size ${near}`],
                }
              : {
                  run: [
                    `${P} set ${slug} text-size ${
                      // A size typed full-width or with a trailing dot
                      // (１８, 18.) is that size.
                      /^\d+(\.\d+)?\.?$/.test(typedPlain(v)) &&
                      Number(typedPlain(v).replace(/\.$/, '')) >= 10 &&
                      Number(typedPlain(v).replace(/\.$/, '')) <= 32
                        ? String(Number(typedPlain(v).replace(/\.$/, '')))
                        : (textSizePx(v) ?? 16)
                    }`,
                  ],
                };
          })(),
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
        const cleaned = (pastedDeclaration(v)?.value || typedPlain(v))
          .replace(/^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/i, '$1')
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
        // light-dark(a, b): the dial takes one color, from which it makes
        // both modes; the light one is offered.
        const lightHalf =
          /^light-dark\(\s*([^,]+?)\s*,/i.exec(cleaned)?.[1] ?? null;
        const better =
          problem.opaque ??
          (cleaned !== v && !colorProblem(cleaned)
            ? cleaned
            : lightHalf && !colorProblem(lightHalf)
              ? lightHalf
              : near[0]);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" ${problem.message}.${problem.kind === 'unknown' || problem.kind === 'malformed' ? ' Give a hex, a color name, or an rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() or color() color.' : ''}${better && better === lightHalf ? ` ${thing} takes one color and makes both modes from it; the light one (${better}) is offered. For a dark value of your own, set --color-accent --mode dark after.` : ''}`,
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
      }
      const colors = data.settings.filter(
        x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      );
      // With no color to saturate, no vibrancy value is suggested.
      const canApply = colors.some(x => !isGraySeed(seedOf(x.value)));
      if (!step && canApply && (!/^\d{1,3}$/.test(v) || Number(v) > 100)) {
        // The value meant: a step in other letters (MORE), or the number
        // read as CSS reads it (70%, 7e1), kept in range.
        const word = v.trim().toLowerCase();
        const n = cssNumber(v);
        const near = ['more', 'less'].includes(word)
          ? word
          : n && (n.unit === '' || n.unit === '%')
            ? String(Math.max(0, Math.min(100, Math.round(n.value))))
            : null;
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `vibrancy takes a whole number from 0 (gray) to 100 (most vivid), or more or less, not "${v}".`,
          {
            run: near
              ? [`${P} set ${slug} vibrancy ${near}`]
              : [`${HOW} vibrancy`],
          },
        );
      } else if (!step && /^\d{1,3}$/.test(v)) s.value = String(Number(v));
      // A gray has no color to saturate, so vibrancy changes nothing.
      if (!canApply)
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
      if (s.on && !isRole) {
        // A CSS font shorthand goes to its longhands, each a command that
        // works; a value that is neither gets a family that works.
        // Every part of a font shorthand (or a lone keyword: bold) goes to
        // its own longhand; a family list is a family list.
        const parts = fontShorthandParts(v);
        const family = !parts && matchValue('font-family', v);
        const example = `${P} set ${slug} font-family ${quoteCommandArgument(exampleOf('font', 'font-family'))} --on ${s.on}`;
        const runs = parts
          ? parts.system || parts.repeat
            ? [example]
            : Object.entries(parts).map(
                ([k, x]) =>
                  `${P} set ${slug} ${k} ${quoteCommandArgument(x)} --on ${s.on}`,
              )
          : family
            ? [
                `${P} set ${slug} font-family ${quoteCommandArgument(v)} --on ${s.on}`,
              ]
            : [example];
        refuse(
          E.ERR_THEME_BAD_VALUE,
          parts?.repeat
            ? `font --on takes body, heading, or code, and "${v}" ${parts.part?.includes(',') ? `gives ${parts.repeat} more times than the parts that take it (${parts.part})` : `gives ${parts.part ?? 'one part of the font'} twice (${parts.repeat} is the second)`}, which no CSS font value does. For one part's font use font-family with a family, and set each other part of the font once.`
            : parts?.system
              ? `font --on takes body, heading, or code, and "${v}" is a system font keyword of the CSS font shorthand, which sets every part of the font at once. For one part's font use font-family with a family.`
              : `font --on takes body, heading, or code. For one part's font use font-family${parts ? ', and the other parts of the font shorthand one by one' : ''}.`,
          {run: runs},
        );
      }
      // A size, a weight or a whole CSS font value is no family: the font
      // dial and the roles take the family alone.
      // A variable is answered below, as the token form.
      const fontParts =
        step || /\b(var|env)\(/i.test(v) ? null : fontShorthandParts(v);
      if (
        fontParts &&
        (fontParts.repeat ||
          fontParts.system ||
          Object.keys(fontParts).some(k => k !== 'font-family'))
      ) {
        const fam = fontParts['font-family'];
        const on = s.on ? ` --on ${s.on}` : '';
        /** @type {string[]} */
        const runs = [
          `${P} set ${slug} font ${quoteCommandArgument(fam ?? 'inter')}${on}`,
        ];
        if (fontParts['font-size'] && (!s.on || s.on === 'body'))
          runs.push(
            `${P} set ${slug} --font-size-base ${quoteCommandArgument(fontParts['font-size'])}`,
          );
        const w = fontParts['font-weight'];
        if (w && (!s.on || s.on === 'heading')) {
          const num =
            w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w) || null;
          const rung = num
            ? Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
                Math.abs(Number(b[1]) - num) < Math.abs(Number(a[1]) - num)
                  ? b
                  : a,
              )[0]
            : null;
          if (rung) runs.push(`${P} set ${slug} headings ${rung}`);
        }
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `font${s.on ? ` --on ${s.on}` : ''} takes a family or a preset, and "${v}" ${fam ? 'is a whole CSS font value' : 'is no family'}: ${
            Object.keys(fontParts)
              .filter(k => !['font-family', 'repeat', 'system'].includes(k))
              .join(', ') || 'a keyword'
          } ${fam ? 'would be read as part of the family name' : 'would be read as a family name'}, and the text would fall back.`,
          {run: runs},
        );
      }
      if (step)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'font takes a preset or a family name, not a step.',
          {
            fix: `the values are ${DIALS.font.values}`,
            run: [`${P} set ${slug} font inter`, `${HOW} font`],
          },
        );
      // A family list: names, quoted or not, split by commas; nothing that
      // could end the CSS declaration or the preview's style block. A
      // preset typed in another case or spacing is the preset.
      s.value = v.trim();
      // A function (var(), env()) is no family name: the dial would quote
      // it as one. The role's token takes it as written.
      if (/[a-z-]+\(/i.test(s.value)) {
        const role = s.on && FONT_ROLES.includes(s.on) ? s.on : 'body';
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `font takes a preset or family names, not "${s.value}". To make ${s.on ? `the ${role} font` : 'a font'} read another token, set the token itself.`,
          {
            // The token's own rules decide: a value it refuses too is never
            // offered; a family name is.
            run: (() => {
              try {
                checkSetting(
                  ctx,
                  slug,
                  data,
                  `--font-family-${role}`,
                  s.value,
                  {},
                );
                return [
                  `${P} set ${slug} --font-family-${role} ${quoteCommandArgument(s.value)}`,
                ];
              } catch {
                return [`${P} set ${slug} font inter`, `${HOW} font`];
              }
            })(),
          },
        );
      }
      // A font package names its preset: @fontsource/inter is inter.
      const fromPackage = /^@fontsource(?:-variable)?\/([a-z0-9-]+)$/i.exec(
        s.value,
      )?.[1];
      if (fromPackage && OPEN_FONTS[fromPackage.toLowerCase()])
        s.value = fromPackage.toLowerCase();
      // A preset's package name (geist-sans for geist) is that preset.
      const byPackage = Object.keys(OPEN_FONTS).find(
        k =>
          OPEN_FONTS[k].pkg.split('/')[1] ===
          (fromPackage ?? s.value).toLowerCase(),
      );
      if (byPackage) s.value = byPackage;
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
      const file = fontFileReason(s.value);
      if (file)
        refuse(E.ERR_THEME_BAD_VALUE, file, {
          run: [`${P} set ${slug} font inter${s.on ? ` --on ${s.on}` : ''}`],
        });
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
          .trim()
          .replace(/^@astryxdesign\/theme-/, '')
          .replace(/^theme-/, '');
        // Only a base this project has installed is suggested; a theme
        // made here is never a base.
        const bases = [
          ...LIKE.filter(b => baseInstalled(ctx.project, b)),
          'none',
        ];
        // The base named in other letters is the one meant; a guess is
        // only among installed bases.
        const near =
          bases.includes(meant) || LIKE.includes(meant)
            ? [meant]
            : nearest(meant, bases);
        // A built-in base named that is not installed: install it, then the
        // same set.
        const install =
          LIKE.includes(meant) && !baseInstalled(ctx.project, meant)
            ? [installLine(ctx.project.cwd, [`@astryxdesign/theme-${meant}`])]
            : [];
        const madeHere = fs.existsSync(themeFiles(ctx.project.cwd, v).settings);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `base takes ${DIALS.base.values}, not "${v}".${madeHere ? ` ${v} is a theme made here, and a theme builds only on a built-in one.` : ''}`,
          {
            didYouMean: near,
            // With nothing near, every base that works here, none first.
            run: near[0]
              ? [...install, `${P} set ${slug} base ${near[0]}`]
              : [
                  'none',
                  ...LIKE.filter(b => baseInstalled(ctx.project, b)),
                ].map(b => `${P} set ${slug} base ${b}`),
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
    // A token typed with its declaration's colon (`--color-accent:`).
    const colonless = thing.replace(/\s*:+\s*$/, '');
    if (!(thing in TOKENS) && colonless !== thing && colonless in TOKENS)
      refuse(
        E.ERR_THEME_UNKNOWN_TOKEN,
        `"${thing}" ends with a colon; the token is ${colonless}.`,
        {
          run: [
            `${P} set ${slug} ${colonless}${v ? ` ${quoteCommandArgument(v.replace(/;+\s*$/, ''))}` : ''}`,
          ],
        },
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
        {run: [setLine(slug, thing, exampleOf(type, thing), s)]},
      );
    checkTypedValue(
      type,
      v,
      thing,
      TOKENS,
      C.typeOf,
      slug,
      C.propsReading(thing),
      multipliedTokens(ctx.project).has(thing),
    );
    checkCycle(thing, v, TOKENS, data, ctx.project.cwd, s);
    // With no part data, what reads the token is unknown: save, unchecked.
    if (ctx.unchecked) return s;
    const parts = partsOf(ctx, s);
    if (parts.length) {
      // A part the base theme's own rule makes read the token reads it.
      const results = parts.map(
        t =>
          /** @type {[string, import('./_compiler.mjs').CheckFailure | null]} */ ([
            t,
            baseComponentReads(ctx.project.cwd, data.like, t).has(thing)
              ? null
              : C.checkTokenOn(slug, t, thing, v, P),
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
        s.note = `the editor's render of ${hard.map(([t]) => t).join(', ')} did not read ${thing} (each part is rendered once, with its default props, so a variant that reads it may be missed); it is set as asked`;
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
      else if (r && data.like && baseReads(ctx, data.like, thing))
        s.note = `the ${data.like} theme's own part styles read ${thing}, so the change shows where they use it`;
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
  // A dial typed in other letters (Font, FONT) is the dial, not the CSS
  // property of the same name.
  if (thing !== thing.toLowerCase() && DIALS[thing.toLowerCase()])
    refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. The dial for that is ${thing.toLowerCase()}.`,
      {
        didYouMean: [thing.toLowerCase()],
        run: [
          unset
            ? `${P} undo ${slug} ${thing.toLowerCase()}${s.on ? ` --on ${s.on}` : ''}`
            : `${P} set ${slug} ${thing.toLowerCase()} ${quoteCommandArgument(v || 'inter')}${s.on ? ` --on ${s.on}` : ''}`,
        ],
      },
    );
  if (cssProperties().has(prop)) {
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
    // initial and unset leave a part's padding variables without a value:
    // the part takes Core's own default, which the result names.
    if (/^padding/.test(prop) && /^(initial|unset)$/i.test(v.trim()) && s.on) {
      const owner = (ctx.derived?.[s.on] ?? []).some(
        d => d.property === 'padding' && d.expand,
      )
        ? s.on
        : CARD_LIKE.includes(s.on)
          ? 'card'
          : null;
      const fallback = owner
        ? coreFallback(ctx.project, `--astryx-${owner}-padding`)
        : null;
      if (fallback) {
        const token = /^var\((--[a-z0-9-]+)\)$/i.exec(fallback)?.[1];
        const px = token
          ? lengthPx(String(ctx.project.core.tokenDefaults?.[token] ?? ''))
          : lengthPx(fallback);
        s.note = `${v.trim()} means ${s.on}'s own default padding from Core: ${fallback}${px != null ? ` (${px}px)` : ''}`;
      }
    }
    // A part whose Core box reads this property's variable inside calc()
    // (a composer's or a menu's padding in its corners): one length is all
    // that works there, whether a length, a variable, or calc(), min(),
    // max() or clamp() giving one.
    if (s.on && ctx.derived) {
      const inCalc = calcVars(ctx.project);
      const hit = partsOf(ctx, s).find(t =>
        (ctx.derived?.[t] ?? []).some(
          d =>
            d.property === camel(prop) &&
            (d.vars ?? []).some(x => inCalc.has(x.toLowerCase())),
        ),
      );
      if (hit && !oneLength(v)) {
        const first = splitTop(v.trim(), ' ')[0] ?? '';
        const n = cssNumber(first);
        const fix = oneLength(first)
          ? first
          : n && !n.unit
            ? `${n.value}px`
            : '12px';
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${hit} reads ${prop} inside calc() (its corners and inner rows follow it), where only one length works: a length, a variable, or calc(), min(), max() or clamp() giving one; not "${v.trim()}".`,
          {run: [setLine(slug, prop, fix, s)]},
        );
      }
    }
    // A part whose visible box is drawn inside its themed wrapper: only
    // what reaches that box is taken.
    const wrapped = s.on ? WRAPPED_PARTS[s.on] : undefined;
    if (wrapped) {
      const surface =
        /^(background|border|box-shadow|outline)(-|$)/.test(prop) &&
        !/radius/.test(prop);
      const side = /^padding-/.test(prop);
      const density = prop === 'padding' && /^density:/.test(s.when ?? '');
      if (surface || side || density)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          surface
            ? `${s.on}'s theme class is on a transparent wrapper; Core draws ${wrapped.box} inside it, and that box has no class of its own, so ${prop} would paint the wrapper's square corners, not the box. Its colors come from the theme's popover tokens.`
            : side
              ? `${s.on}'s theme class is on a transparent wrapper; ${wrapped.box} inside it reads one padding for every side, so a side padding would add a strip outside the box. Set padding (every side).`
              : `${s.on} sets its own padding on ${wrapped.box} for each density, which a theme padding for one density cannot reach. Set padding for every density.`,
          {
            run: surface
              ? [
                  `${P} set ${slug} --color-background-popover ${quoteCommandArgument('#ffffff')}`,
                  `${HOW} ${s.on}`,
                ]
              : [
                  `${P} set ${slug} padding ${quoteCommandArgument(v)} --on ${s.on}`,
                ],
          },
        );
    }
    // Core writes a container part's padding to variables of its own, where
    // a keyword that takes its value from elsewhere means no value at all.
    if (
      /^padding/.test(prop) &&
      /^(inherit|revert|revert-layer)$/i.test(v.trim()) &&
      (ctx.derived?.[/** @type {string} */ (s.on)] ?? []).some(
        d => d.property === 'padding' && d.expand,
      )
    )
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${s.on} writes ${prop} to variables of its own, where "${v.trim()}" has nothing to take its value from, so ${s.on} would fall back to its default padding. Give a length, or undo the padding to go back to the base theme's.`,
        {
          run: [
            `${P} set ${slug} ${prop} 0 --on ${s.on}`,
            `${P} undo ${slug} ${prop} --on ${s.on}`,
          ],
        },
      );
    // Text, headings and links take their color from the color prop.
    const textParts = COLOR_PROP_PARTS;
    if (
      (prop === 'color' || prop === '-webkit-text-fill-color') &&
      partsOf(ctx, s).some(t => textParts.includes(t))
    ) {
      if (partsOf(ctx, s).every(t => textParts.includes(t))) {
        const named = /^color:([\w-]+)$/.exec(s.when ?? '')?.[1];
        // The typed value goes into the token only when it is a plain color;
        // else the nearest color name, else an example.
        const color =
          v && isColorValue(v) && isFixedColor(v) && !/\bvar\(/i.test(v)
            ? v
            : (nearestColorName(v) ?? '#1f2937');
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on} takes its color from the color prop, which Core sets after part styles, so a color set on ${s.on} never shows. Set the text color token instead.`,
          {
            run: [
              `${P} set ${slug} --color-text-${named ?? 'primary'} ${quoteCommandArgument(color)}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ...(named
                ? []
                : [
                    `${P} set ${slug} --color-text-secondary ${quoteCommandArgument(color)}${s.mode ? ` --mode ${s.mode}` : ''}`,
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
    // Per-variant colors only: a value that is not a color is refused for
    // --mode below, with the reason that holds.
    if (
      s.mode &&
      !s.when &&
      (COLOR_PROPS.test(prop) || (prop === 'background' && isColorValue(v)))
    ) {
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
        {run: [`${HOW} ${prop}`]},
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
                // The same scope, --only included.
                setLine(slug, prop, grammar.near, s),
              ]
            : [`${HOW} ${prop}`],
        },
      );
    if (
      COLOR_PROPS.test(prop) &&
      !CSS_WIDE.includes(v.trim().toLowerCase()) &&
      (!isColorValue(v) || !isFixedColor(v))
    ) {
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes a color; "${v}" is not one.${/gradient/.test(v) ? ' Gradients go in background.' : ''}`,
        {
          run: /gradient/.test(v)
            ? [
                `${P} set ${slug} background ${quoteCommandArgument(v)} --on ${s.on}`,
              ]
            : [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(nearestColorName(v) ?? exampleOf('color', prop))} --on ${s.on}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ],
        },
      );
    }
    // A var() inside a color (color-mix(in srgb, var(--x, 12px), red)) shows
    // its fallback when the variable is unset: that must be a color too,
    // except in a color's channels (rgb(var(--r, 0) 0 0)).
    if (COLOR_PROPS.test(prop) || (prop === 'background' && isColorValue(v)))
      for (const {fallback, within} of innerVarFallbacks(v)) {
        if (
          within.some(f =>
            /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(f),
          ) ||
          /\bvar\(/i.test(fallback)
        )
          continue;
        if (fallback === '' || !isColorValue(fallback))
          refuse(
            E.ERR_THEME_BAD_VALUE,
            fallback === ''
              ? `${prop} takes a color; the var() in "${v}" has an empty fallback, which leaves it with no color when the variable is unset.`
              : `${prop} takes a color; "${fallback}", a var() fallback in "${v}", is not one, so the ${prop} is lost when the variable is unset.`,
            {run: [setLine(slug, prop, exampleOf('color', prop), s)]},
          );
      }
    // Every scope flag but --mode carries into the runs.
    const whenFlag = `${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.only ? ' --only' : ''}`;
    if (
      s.mode &&
      !COLOR_PROPS.test(prop) &&
      !(prop === 'background' && isColorValue(v))
    ) {
      // A color mixed into the value (a border's) can go per mode on its
      // own; a value with none (a radius) is just set for both modes.
      const hasColor = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v);
      const alt = !hasColor
        ? null
        : prop === 'border' || prop.startsWith('border-')
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
  if (meant !== prop && cssProperties().has(meant))
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
        : nearest(prop, [...Object.keys(DIALS), ...cssProperties()]),
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
        ? kids.map(k =>
            setLine(slug, 'corners', s.value || 'round', {...s, on: k}),
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

/**
 * A setting's value as set reads it: one line, and tabs as spaces; in a font
 * value every run of spaces or tabs is one space, so `'Open  Sans'` and
 * `'Open\tSans'` both name Open Sans.
 * @param {string} thing
 * @param {string} value
 */
export function normalValue(thing, value) {
  const one = value.replace(/\s*[\r\n]+\s*/g, ' ');
  return (
    thing === 'font' || thing.startsWith('--font-family')
      ? familySpaces(one)
      : one.replace(/\t+/g, ' ')
  ).trim();
}

/** @see familySpaces in _settings.mjs, re-exported for the checks. */
export {familySpaces};

/**
 * The first var() in a value that names no design token and would read
 * nothing (no fallback), or one a letter or two off a token, else null.
 * Dials take their own words, so a dial's var() with no near token passes.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 * @param {string} thing
 * @returns {{message: string, near: string[], close: boolean} | null}
 */
export function unknownVarRef(v, TOKENS, thing) {
  for (const [, name, comma] of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/gi)) {
    if (name in TOKENS || name.startsWith('--_')) continue;
    // A fallback always gives a value: never "reads nothing" (a likely
    // typo is noted when the setting is made).
    if (comma) continue;
    const near = nearest(name, Object.keys(TOKENS)).filter(
      n => levenshteinDistance(n, name) <= 2,
    );
    if (near.length)
      return {
        message: `${name} is not a design token, so var(${name}) would read nothing.`,
        near,
        close: true,
      };
    // Without a fallback, a variable no design token names reads nothing;
    // var(--x, <value>) falls back to the value.
    if (!comma && !DIALS[thing])
      return {
        message: `${name} is not a design token, so var(${name}) would read nothing. Give a fallback (var(${name}, <value>)) for a variable your app sets, or use a design token.`,
        near: nearest(name, Object.keys(TOKENS)).slice(0, 3),
        close: false,
      };
  }
  return null;
}

/**
 * Why a font value names a font file or a link rather than a family
 * (`./fonts/My.woff2`, `Inter.ttf`, `https://fonts.googleapis.com/…`,
 * `url(…)`), or null. A theme names families; a file is loaded with
 * @font-face or a font package.
 * @param {string} value
 * @returns {string | null}
 */
export function fontFileReason(value) {
  const hit = String(value)
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .find(
      f =>
        /^url\(/i.test(f) ||
        /:\/\//.test(f) ||
        /[\\/]/.test(f) ||
        /\.(woff2?|ttf|otf|eot)$/i.test(f),
    );
  const colon = String(value)
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .find(f => f.includes(':'));
  if (!hit && colon)
    return `"${colon}" holds a colon, so it is a pasted declaration or a link, not a font family name. Give the family alone, such as Inter, sans-serif.`;
  return hit
    ? `"${hit}" is a font file or a link, not a font family name. A theme names a family (such as Inter); load the file with @font-face in your app's CSS, or install a font package, then set the family it defines.`
    : null;
}

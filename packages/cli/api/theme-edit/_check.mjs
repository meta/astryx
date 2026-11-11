// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works.
 *
 * @position api/theme-edit — checks over the part data
 */

import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {CSS_PROPERTIES} from './_css-properties.mjs';
import {
  AUTO_SPREAD,
  COLOR_PROPS,
  COMMON_STATES,
  CORNERS,
  DIALS,
  FAMILIES,
  GROUPS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  HOW,
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
  q,
  refuse,
} from './_settings.mjs';

const E = ERROR_CODES;

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
      {run: [`${P} set ${slug} ${name} ${q(example)}`]},
    );
  if (!isSafeValue(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.`,
      {run: [`${P} set ${slug} ${name} <value>`]},
    );
  // A var() naming a design token must name one of the same kind; the
  // app's own variables are its business.
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value.trim());
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
  if (type === 'time' && !/^\d*\.?\d+(ms|s)$/.test(value.trim()))
    bad('a time', '150ms');
  if (
    type === 'easing' &&
    !/^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$|^(cubic-bezier|steps|linear)\([^()]*\)$/.test(
      value.trim(),
    )
  )
    bad('an easing', 'cubic-bezier(0.2, 0, 0, 1)');
  if (type === 'font' && !/^[^,]+(,[^,]+)*$/.test(value.trim()))
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
 */
function isFixedColor(value) {
  const v = value.trim().toLowerCase();
  if (['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(v))
    return false;
  if (!isColorValue(v)) return false;
  if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(v))
    return parseColor(v) != null;
  return true;
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
  if (layers.length === 1 && splitTop(v, ' ').length === 1) return false;
  return layers.every(layer => {
    const words = splitTop(layer.trim(), ' ');
    const lengths = words.filter(w =>
      /^-?\d*\.?\d+(px|rem|em)?$|^0$|^var\(--[a-z0-9-]+\)$|^calc\(/.test(w),
    );
    const rest = words.filter(w => !lengths.includes(w) && w !== 'inset');
    return (
      lengths.length >= 2 &&
      lengths.length <= 4 &&
      rest.length <= 1 &&
      rest.every(w => isColorValue(w))
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
    [...v.matchAll(/var\((--[a-z0-9-]+)/gi)].map(m => m[1]);
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
          `${P} ${unset ? 'undo' : 'set'} ${slug} ${name}${unset ? '' : ` ${q(rest.join('='))}`}`,
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
  const v = (value ?? '').trim();
  // A placeholder copied from a suggestion is not a value.
  if (!unset && /<[a-z][\w -]*>/i.test(v))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${v}" is a placeholder: put a real value in place of ${/<[a-z][\w -]*>/i.exec(v)?.[0]}.`,
      {run: [`${HOW} ${thing.replace(/^--/, '')}`]},
    );
  /** @type {import('./_settings.mjs').Setting} */
  const s = {thing, value: v, source: 'dial'};
  if (flags.on) s.on = flags.on;
  if (flags.when) s.when = flags.when;
  if (flags.state) s.state = flags.state;
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
  if (s.mode && data.mode !== 'both')
    refuse(
      E.ERR_THEME_NO_MODE,
      `This theme is ${data.mode}; --mode is for themes with both modes.`,
      {run: [`${P} set ${slug} ${thing} ${q(v)}${onFlag}`]},
    );
  if ((s.when || s.state) && !s.on)
    refuse(E.ERR_MISSING_ARGUMENT, '--when and --state need --on <part>.', {
      run: [`${HOW} <part>`],
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
              ? `${P} undo ${slug} ${thing}${v ? ` ${q(v)}` : ''} --on ${s.on}`
              : `${P} set ${slug} ${thing} ${q(v)} --on ${s.on}`,
          ],
        },
      );
  }
  const isRole =
    thing === 'font' && ['body', 'heading', 'code'].includes(s.on ?? '');
  if (s.on && !isRole && !FAMILIES[s.on]) {
    const t = TARGET.get(s.on);
    if (!t) {
      refuse(
        E.ERR_THEME_UNKNOWN_PART,
        `"${s.on}" is not a part you can style.`,
        {
          didYouMean: nearest(s.on, [
            ...TARGET.keys(),
            ...Object.keys(FAMILIES),
          ]),
          run: [
            `${HOW} ${s.on.split('-')[0]} --list parts`,
            `${HOW} "${s.on}"`,
          ],
        },
      );
    }
    if (s.when) {
      const [p, wv] = s.when.split(':');
      if (!wv)
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
              `${P} set ${slug} ${thing} ${q(v || DIALS[thing].values.split('|')[0])}`,
            ],
          },
        );
      if (s.mode)
        refuse(
          E.ERR_THEME_NO_MODE,
          `${thing} is the same in light and dark; drop --mode.`,
          {run: [`${P} set ${slug} ${thing} ${q(v)}`]},
        );
      if (unset) return s;
      const ok = DIALS[thing].values.split('|');
      if (!ok.includes(v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} takes ${DIALS[thing].values}, not "${v}".`,
          {didYouMean: nearest(v, ok)},
        );
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
      if (unset) {
        s.axis =
          HEADING_TRACKING[v] !== undefined || v === 'tracking'
            ? 'tracking'
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
    /** @param {Array<[string, number]>} L @param {string} def */
    const ladder = (L, def) => {
      const cur =
        [...data.settings]
          .reverse()
          .find(x => x.thing === thing && (x.on ?? '') === (s.on ?? ''))
          ?.value ?? def;
      let i = L.findIndex(([n]) => n === cur);
      if (i < 0) {
        const px = parseFloat(cur);
        i = L.findIndex(([, n]) => n >= px);
        if (i < 0) i = L.length - 1;
      }
      return L[
        Math.max(0, Math.min(L.length - 1, i + (v === 'more' ? 1 : -1)))
      ][0];
    };
    if (PALETTE_DIALS.includes(thing) && (s.on || s.mode)) {
      const token = paletteToken(thing);
      const value = q(v || '#7c3aed');
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
        {run: [`${P} set ${slug} ${thing} ${q(v)}${onFlag}`]},
      );
    if (thing === 'corners') {
      if (s.on) refuseInvisibleCorners(ctx, slug, s);
      if (step) s.value = ladder(CORNERS, 'medium');
      else if (!CORNERS.some(([n]) => n === v) && !/^\d+(\.\d+)?px$/.test(v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `corners takes ${DIALS.corners.values}, not "${v}".`,
          {
            didYouMean: nearest(
              v,
              CORNERS.map(([n]) => n),
            ),
          },
        );
    } else if (thing === 'spacing') {
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
          run: [`${P} set ${slug} ${thing} "#7c3aed"`],
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
          .replace(/^([0-9a-f]{3}|[0-9a-f]{6})$/i, '#$1');
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
            run: [`${P} set ${slug} ${thing} ${q(better ?? '#7c3aed')}`],
          },
        );
      }
    } else if (thing === 'vibrancy') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'vibrancy applies to every generated color of the theme; drop --on.',
          {run: [`${P} set ${slug} vibrancy ${q(v)}`]},
        );
      if (step) {
        const cur = Number(
          [...data.settings].reverse().find(x => x.thing === 'vibrancy')
            ?.value ?? VIBRANCY_DEFAULT,
        );
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
          {run: [`${P} set ${slug} accent "#7c3aed"`]},
        );
    } else if (thing === 'font') {
      if (s.on && !isRole)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          "font --on takes body, heading, or code. For one part's font use font-family.",
          {run: [`${P} set ${slug} font-family ${q(v)} --on ${s.on}`]},
        );
      if (step)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'font takes a preset or a family name, not a step.',
          {fix: `the values are ${DIALS.font.values}`},
        );
      // A family list: names, quoted or not, split by commas; nothing that
      // could end the CSS declaration or the preview's style block.
      s.value = v.trim();
      if (
        !s.value ||
        /[;{}<>\\\n]/.test(s.value) ||
        (s.value.match(/"/g) ?? []).length % 2 ||
        (s.value.match(/'/g) ?? []).length % 2
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
          {run: [`${P} set ${slug} base ${q(v)}`]},
        );
      if (![...LIKE, 'none'].includes(v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `base takes ${DIALS.base.values}, not "${v}".`,
          {didYouMean: nearest(v, LIKE)},
        );
    } else if (thing === 'mode') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'mode applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} mode ${q(v)}`]},
        );
      if (!['both', 'light-only', 'dark-only'].includes(v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `mode takes both, light-only, or dark-only, not "${v}".`,
          {didYouMean: nearest(v, ['both', 'light-only', 'dark-only'])},
        );
    }
    return s;
  }
  if (thing.startsWith('--')) {
    if (thing.startsWith('--_'))
      refuse(
        E.ERR_THEME_PRIVATE_TOKEN,
        `"${thing}" is private to a component; themes cannot set it.`,
        {run: [`${HOW} "<what you want>"`]},
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
              : `${P} set ${slug} ${thing} ${q(v)}${onFlag}`,
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
      } else if (recorded.length && hard.length === recorded.length) {
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
      else if (r)
        refuse(E.ERR_THEME_NO_EFFECT, r.message, {run: r.run, also: r.also});
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
            `${P} set ${slug} ${prop} ${q(v || '<value>')} --on <part>`,
            `${HOW} "${prop}"`,
          ],
        },
      );
    s.source = 'property';
    s.thing = prop;
    if (unset) return s;
    if (!isSafeValue(v))
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${v}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.`,
        {run: [`${HOW} ${prop}`]},
      );
    if (/radius$/.test(prop)) refuseInvisibleCorners(ctx, slug, s);
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials. Give ${prop} an exact CSS value.`,
      );
    if (COLOR_PROPS.test(prop) && !isColorValue(v)) {
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes a color; "${v}" is not one.${/gradient/.test(v) ? ' Gradients go in background.' : ''}`,
        {
          run: /gradient/.test(v)
            ? [`${P} set ${slug} background ${q(v)} --on ${s.on}`]
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
                `${P} set ${slug} ${prop} ${q(v.replace(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i, 'currentcolor'))} --on ${s.on}${whenFlag}   # the shape, both modes`,
                `${P} set ${slug} ${alt} "<color>" --on ${s.on}${whenFlag} --mode ${s.mode}   # then the color per mode`,
              ]
            : [
                `${P} set ${slug} ${prop} ${q(v)} --on ${s.on}${whenFlag}   # both modes`,
              ],
        },
      );
    }
    if (
      s.mode &&
      !partsOf(ctx, s).some(t => partDefault(ctx, t, camel(prop), s.when))
    )
      s.note = `the ${s.mode === 'light' ? 'dark' : 'light'} side keeps the part's current ${prop}`;
    return s;
  }
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
            : `${P} set ${slug} ${d} ${q(v)}${onFlag}`,
        ),
      },
    );
  return refuse(
    E.ERR_THEME_UNKNOWN_THING,
    `"${thing}" is not a dial, a token, or a CSS property.`,
    {
      run: hint
        ? hint(v, s.on)
        : [`${HOW} "${thing}${s.on ? ` on ${s.on}` : ''}"`],
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
 */
function refuseInvisibleCorners(ctx, slug, s) {
  if (ctx.unchecked) return;
  const parts = partsOf(ctx, s);
  if (!parts.length || parts.some(t => ctx.C.showsCorners(t))) return;
  const kids = (ctx.C.MAP[parts[0]]?.contains ?? [])
    .filter(k => ctx.C.showsCorners(k) && ctx.C.MAP[k])
    .slice(0, 3);
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${s.on} has no background, border or shadow of its own, so rounding its corners changes nothing you see.${kids.length ? ` Parts inside it that do show an edge: ${kids.join(', ')}.` : ''}`,
    {
      run: kids.length
        ? kids.map(
            k => `${P} set ${slug} corners ${q(s.value || 'round')} --on ${k}`,
          )
        : [`${HOW} ${s.on}`],
    },
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

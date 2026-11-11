// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works. Also `how`, which answers a
 * plain-words question with exact commands from the same part data.
 *
 * @position api/theme-edit — checks and questions over the part data
 */

import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {CSS_PROPERTIES} from './_css-properties.mjs';
import {
  AUTO_SPREAD,
  COLOR_PROPS,
  COMMON_STATES,
  CORNERS,
  DESIGN,
  DIALS,
  DIRECT,
  FAMILIES,
  GROUPS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  INTENTS,
  LIKE,
  HOW,
  P,
  PART_WORDS,
  SPACING,
  TEXT_SIZE,
  THING_HINTS,
  familyOf,
} from './_tables.mjs';
import {isColorValue, isNumber, isSize} from './_color.mjs';
import {MODAL} from './_compiler.mjs';
import {
  PALETTE_DIALS,
  PALETTE_TOKENS,
  VIBRANCY_DEFAULT,
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
 */
function checkTypedValue(type, value, name) {
  if (type === 'color' && !isColorValue(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is a color; "${value}" is not a CSS color.`,
      {fix: 'give one like "#1f2937", "rgb(31 41 55)" or "oklch(0.5 0.1 250)"'},
    );
  if (type === 'size' && !isSize(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is a size; "${value}" is not a CSS size.`,
      {fix: 'give one like 6px, 0.75rem or 0'},
    );
  if (type === 'number' && !isNumber(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is a number; "${value}" is not one.`,
      {fix: 'give one like 600 or 1.4'},
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
  if (!unset && (value === undefined || value === ''))
    refuse(E.ERR_MISSING_ARGUMENT, `Give a value for ${thing}.`, {
      run: [`${P} set --help`],
    });
  const v = value ?? '';
  /** @type {import('./_settings.mjs').Setting} */
  const s = {thing, value: v, source: 'dial'};
  if (flags.on) s.on = flags.on;
  if (flags.when) s.when = flags.when;
  if (flags.state) s.state = flags.state;
  if (flags.only) s.only = true;
  if (flags.mode) {
    if (flags.mode !== 'light' && flags.mode !== 'dark')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `--mode takes light or dark, not "${flags.mode}".`,
      );
    s.mode = flags.mode;
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
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${thing} generates the colors of the whole theme, light and dark from one color; drop ${s.on ? '--on' : '--mode'}. For an exact color on one part or in one mode, set the token itself.`,
        {
          run: [
            `${P} set ${slug} ${token} ${q(v || '#7c3aed')}${onFlag}${s.mode ? ` --mode ${s.mode}` : ''}`,
          ],
        },
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
      else if (!TEXT_SIZE.some(([n]) => n === v) && !Number.isFinite(Number(v)))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `text-size takes ${DIALS['text-size'].values}, not "${v}".`,
        );
    } else if (PALETTE_DIALS.includes(thing)) {
      if (step)
        refuse(E.ERR_THEME_BAD_VALUE, `${thing} takes a color, not a step.`, {
          run: [`${P} set ${slug} ${thing} "#7c3aed"`],
        });
      if (!isColorValue(v))
        refuse(E.ERR_THEME_BAD_VALUE, `"${v}" is not a CSS color.`, {
          fix: 'give one like "#7c3aed"',
        });
      if (!seedOf(v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" has no fixed color, so no shades can be generated from it.`,
          {
            fix: 'give a hex, a color name, or an rgb(), hsl(), hwb(), lab(), lch(), oklab() or oklch() color',
          },
        );
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
        s.value = String(
          Math.max(0, Math.min(100, cur + (v === 'more' ? 10 : -10))),
        );
      } else if (!/^\d{1,3}$/.test(v) || Number(v) > 100)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `vibrancy takes a whole number from 0 (gray) to 100 (most vivid), or more or less, not "${v}".`,
          {run: [`${P} set ${slug} vibrancy 60`]},
        );
      else s.value = String(Number(v));
      if (
        !data.settings.some(
          x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
        )
      )
        refuse(
          E.ERR_THEME_NO_EFFECT,
          'vibrancy sets how saturated the generated colors are, and this theme sets no color yet. Set one first.',
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
          `${HOW} ${thing.replace(/^--(color-)?/, '').split('-')[0]} --list tokens`,
        ],
      });
    }
    const type = C.typeOf(thing);
    if (s.mode && !MODAL.has(type))
      refuse(
        E.ERR_THEME_NO_MODE,
        `${thing} is a ${type}, so it is the same in light and dark; drop --mode. Only colors and shadows differ by mode.`,
        {run: [`${P} set ${slug} ${thing} ${q(v)}${onFlag}`]},
      );
    s.source = 'token';
    if (unset) return s;
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials (${Object.keys(DIALS).join(', ')}). Give ${thing} a ${type} value.`,
      );
    checkTypedValue(type, v, thing);
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

/** Hues a question can name, each with or without light, dark or pale. */
const HUES = [
  'gray',
  'grey',
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'navy',
];
/** Color words that can name a part's fill, longest first. */
const COLOR_WORDS = [
  ...HUES.flatMap(h => ['light', 'dark', 'pale'].map(s => `${s} ${h}`)),
  ...HUES,
  'white',
  'black',
  'cream',
  'beige',
];
/** Fills for the plain grays, so the command has a real value. */
const NAMED_FILLS = /** @type {Record<string, string>} */ ({
  'light gray': '#e5e7eb',
  'light grey': '#e5e7eb',
  gray: '#9ca3af',
  grey: '#9ca3af',
  'dark gray': '#374151',
  'dark grey': '#374151',
  'light blue': '#dbeafe',
  'pale blue': '#eff6ff',
  white: '#ffffff',
  black: '#000000',
});
/** Nouns for parts that have a fill. */
const PART_NOUNS = [
  'button',
  'card',
  'panel',
  'banner',
  'header',
  'input',
  'field',
  'badge',
  'tab',
  'chip',
  'pill',
  'toast',
  'tooltip',
  'dialog',
  'modal',
  'sidebar',
  'row',
];

/**
 * Answer a plain-words question with exact commands: the parts it names,
 * the aspects it asks about, and what each part really reads for them.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} question
 * @returns {{parts: string[], aspects: string[], results: Array<{text: string, commands: string[]}>}}
 */
export function answerHow(ctx, question) {
  const {C} = ctx;
  const TARGET = ctx.project.target;
  const TOKENS = ctx.project.core.tokenDefaults;
  const text = question.toLowerCase();
  /** @type {Array<string | null>} */
  let intents = INTENTS.filter(([, re]) => re.test(text)).map(([g]) => g);
  // "pill" is a corner shape when the question is about corners.
  const partText = intents.includes('corners')
    ? text.replace(/\bpills?\b/g, '')
    : text;
  /** @type {string[]} */
  let parts = [];
  for (const [re, ts] of PART_WORDS)
    if (re.test(partText))
      for (const t of ts) if (!parts.includes(t)) parts.push(t);
  // A variant of a part ("secondary button") answers for the part.
  parts = parts.filter(p => !parts.some(x => x.startsWith(`${p}:`)));
  const whiteText =
    /\bwhite (text|labels?|writing|words)\b|\b(text|labels?|writing|words) (in |is |are )?white\b/.test(
      text,
    );
  // A color word right before a part ("light gray button") is the part's
  // fill, so it keeps the background aspect beside text.
  const fillMatch =
    new RegExp(
      `\\b(${COLOR_WORDS.join('|')})\\s+(?:${PART_NOUNS.join('|')})s?\\b`,
    ).exec(text) ??
    new RegExp(
      `\\b(?:${PART_NOUNS.join('|')})s?\\s+(?:with\\s+an?\\s+|in\\s+|is\\s+)?(${COLOR_WORDS.join('|')})\\b(?!\\s+(?:text|labels?|writing|words))`,
    ).exec(text);
  const fillWord = Boolean(fillMatch);
  // A fill named outright ("a blue tint") keeps the background aspect.
  const namedFill =
    /background|fill|gradient|glossy|\btint(ed)?\b|\bbg\b/.test(text) ||
    fillWord;
  if (
    intents.includes('text') &&
    intents.includes('background') &&
    !namedFill &&
    !(/\bwhite\b/.test(text) && !whiteText)
  )
    intents = intents.filter(g => g !== 'background');
  // "border color" is the border's color, not a fill; a color word for
  // something else ("white with a gray border") still is one.
  const looseColor = new RegExp(
    `\\b(${COLOR_WORDS.join('|')})\\b(?!\\s+(border|outline|stroke|edge|text|labels?)s?\\b)`,
  ).test(text);
  if (
    intents.includes('border') &&
    intents.includes('background') &&
    !namedFill &&
    !looseColor
  )
    intents = intents.filter(g => g !== 'background');
  if (!intents.length && parts.length) intents = [null];
  const design = Object.keys(DESIGN).filter(w => text.includes(w));
  const tracking = /letter ?spacing|tracking|kerning/.test(text);
  // Letter spacing is a font answer, so a spacing intent it raised goes.
  if (tracking && intents.includes('font'))
    intents = intents.filter(g => g !== 'spacing');
  const weight = /\b(bold|weight|heav\w*|light(er)?|thin)\b/.test(text);
  const px = /\b(\d+(?:\.\d+)?px)\b/.exec(text)?.[1];
  /** @type {Array<{text: string, commands: string[]}>} */
  const results = [];
  /** @param {string | null} g */
  const V = g => {
    const bg = design.find(d => ['gradient', 'glossy'].includes(d));
    const sh = design.find(d =>
      ['bevel', 'raised', 'flat', 'sunken'].includes(d),
    );
    if (g === 'background' && bg) return DESIGN[bg];
    if (g === 'shadow' && sh) return DESIGN[sh];
    if (g === 'font' && tracking)
      return /tight/.test(text) ? '-0.02em' : '0.04em';
    if (g === 'font' && /bold|heav/.test(text)) return '700';
    if (g === 'font' && /\b(light(er)?|thin)\b/.test(text)) return '300';
    if (g === 'text' && whiteText) return '"#ffffff"';
    if (g === 'text' && /\bdark (text|labels?|writing|words)\b/.test(text))
      return '"#111827"';
    if (g === 'background' && fillMatch) {
      const named = NAMED_FILLS[fillMatch[1]];
      if (named) return `"${named}"`;
    }
    if (g === 'border')
      return `"${/\bthick\b/.test(text) ? '2px' : '1px'} solid <color>"`;
    if (g === 'text' && /\baccent[- ]?(colou?red )?(text|labels?)\b/.test(text))
      return '"var(--color-text-accent)"';
    if (g === 'background' && /\bwhite\b/.test(text) && !whiteText)
      return '"#ffffff"';
    return '<value>';
  };
  /**
   * A value for one token, of its own type: a whole border value suits only
   * the border property, so a color token takes a color and a width token a
   * width.
   * @param {string} token @param {string} group
   */
  const tokenValue = (token, group) => {
    const v = V(group);
    const whole = /\s(solid|dashed|dotted)\s/.test(v);
    if (!whole) return v;
    const type = C.typeOf(token);
    if (type === 'color') return '"<color>"';
    if (type === 'size' || /width/.test(token))
      return /\b2px\b/.test(v) ? '2px' : '1px';
    return '<value>';
  };
  for (const raw of parts.slice(0, 3)) {
    let [part, wp, wv] = raw.split(':');
    const named = Boolean(wp);
    const one = FAMILIES[part] ? FAMILIES[part][0] : part;
    if (!TARGET.has(one)) continue;
    // A size in the question ("small buttons") is a --when condition.
    if (!wp) {
      const sizes = C.variantValues(one).size ?? [];
      const word = /\b(small|sm)\b/.test(text)
        ? ['sm', 'small']
        : /\b(large|lg|big)\b/.test(text)
          ? ['lg', 'large']
          : /\b(medium|md)\b/.test(text)
            ? ['md', 'medium']
            : [];
      const hit = word.find(w => sizes.includes(w));
      if (hit) [wp, wv] = ['size', hit];
    }
    const when = wp ? ` --when ${wp}:${wv}` : '';
    // A part with variants: a change without --when reaches every variant.
    const variants = Object.entries(C.variantValues(one)).filter(
      ([p, vals]) =>
        ['status', 'variant', 'tone', 'color'].includes(p) && vals.length > 1,
    );
    for (const g of intents.slice(0, 3)) {
      if (g === null) {
        results.push({
          text: `what ${one} reads`,
          commands: [`${HOW} ${one}`],
        });
        continue;
      }
      if (g === 'corners' && !named) {
        // Each clause with its own size ("small 6px, large stay pill").
        const sizes = C.variantValues(one).size ?? [];
        const clauses = text
          .split(/,|;|\bbut\b|\band\b/)
          .map(c => {
            const size = /\b(small|sm)\b/.test(c)
              ? 'sm'
              : /\b(large|lg|big)\b/.test(c)
                ? 'lg'
                : /\b(medium|md)\b/.test(c)
                  ? 'md'
                  : null;
            const value =
              /\b(\d+(?:\.\d+)?px)\b/.exec(c)?.[1] ??
              (/pill|circ/.test(c)
                ? 'pill'
                : /sharp|square/.test(c)
                  ? 'square'
                  : null);
            return {size, value};
          })
          .filter(c => c.size && sizes.includes(c.size) && c.value);
        if (clauses.length > 1) {
          results.push({
            text: `corners on ${part}, by size`,
            commands: clauses.map(c =>
              /px$/.test(/** @type {string} */ (c.value))
                ? `${P} set <theme> border-radius ${c.value} --on ${part} --when size:${c.size}`
                : `${P} set <theme> corners ${c.value} --on ${part} --when size:${c.size}`,
            ),
          });
          continue;
        }
      }
      if (g === 'corners') {
        results.push({
          text: `corners on ${part}${when ? ` (${wp} ${wv})` : ''}`,
          commands: [
            `${P} set <theme> corners ${/pill|circ/.test(text) ? 'pill' : /sharp|square/.test(text) ? 'square' : 'round'} --on ${part}${when}`,
            `${P} set <theme> border-radius ${px ?? '6px'} --on ${part}${when}`,
          ],
        });
        continue;
      }
      if (g === 'shadow') {
        const shadows = Object.keys(ctx.project.core.tokenDefaults).filter(k =>
          /^--shadow-(low|med|high)$/.test(k),
        );
        const value =
          V('shadow') !== '<value>'
            ? V('shadow')
            : shadows.length
              ? `"var(${/soft|subtle|light/.test(text) ? shadows[0] : /strong|deep|heavy/.test(text) ? shadows[shadows.length - 1] : shadows[Math.min(1, shadows.length - 1)]})"`
              : '"0 2px 6px rgb(0 0 0 / 0.2)"';
        results.push({
          text: `shadow on ${part}${when ? ` (${wp} ${wv})` : ''}: box-shadow${shadows.length ? `; the theme's shadow tokens are ${shadows.join(', ')}` : ''}`,
          commands: [
            `${P} set <theme> box-shadow ${value} --on ${part}${when}`,
            ...(shadows.length
              ? [
                  `${P} set <theme> ${shadows[0]} "0 1px 3px rgb(0 0 0 / 0.12)"   # change the shared shadow everywhere`,
                ]
              : []),
          ],
        });
        continue;
      }
      if (g === 'spacing' && !tracking) {
        results.push({
          text: `room inside ${part}`,
          commands: [
            `${P} set <theme> spacing ${/dense|compact|tight|cramped/.test(text) ? 'compact' : 'roomy'} --on ${part}`,
            `${P} set <theme> padding ${px ?? '12px'} --on ${part}${when}`,
          ],
        });
        continue;
      }
      const group = g === 'spacing' ? 'font' : g;
      if (group === 'font' && tracking && weight)
        results.push({
          text: `${part} weight: font-weight on the part${part === 'heading' ? ', or the headings dial for every heading' : ''}`,
          commands: [
            `${P} set <theme> font-weight ${/\b(light(er)?|thin)\b/.test(text) ? 300 : 700} --on ${part}${when}`,
            ...(part === 'heading'
              ? [
                  `${P} set <theme> headings ${/\b(light(er)?|thin)\b/.test(text) ? 'light' : 'bold'}`,
                ]
              : []),
          ],
        });
      const reads = C.partReads(one, group);
      const filtered = wv
        ? reads.filter(
            r =>
              r.when.some(w => w.includes(`${wp}=${wv}`)) ||
              r.when.includes(''),
          )
        : reads;
      // Weight and tracking questions name only the tokens for them.
      const aspect =
        group === 'font' && tracking
          ? /letter|tracking/
          : group === 'font' && weight
            ? /weight/
            : null;
      const fitting = aspect
        ? (filtered.length ? filtered : reads).filter(r => aspect.test(r.token))
        : filtered.length
          ? filtered
          : reads;
      // Text with no color token of its own takes the page's text color.
      const inherited =
        !fitting.length && group === 'text' ? '--color-text-primary' : null;
      const list = fitting.slice(0, 4);
      const direct =
        group === 'font' && tracking
          ? 'letter-spacing'
          : group === 'font' && /bold|weight|heav/.test(text)
            ? 'font-weight'
            : group === 'font'
              ? 'font-family'
              : DIRECT[group];
      const restingBorder =
        group === 'border' && list.every(r => r.when.some(w => /:/.test(w)));
      const tokenRoute =
        (group === 'text' || group === 'background' || group === 'border') &&
        !restingBorder &&
        !/gradient|inset/.test(V(group));
      results.push({
        text: `${part} ${aspect ? (tracking ? 'letter spacing' : 'weight') : group}${when ? ` (${wp} ${wv})` : ''}: ${restingBorder ? `the resting border is the border property (no token sets it)${list.length ? `; in states it reads ${list.map(r => r.token + C.fmtWhen(r.when)).join(', ')}` : ''}` : list.length ? `comes from ${list.map(r => r.token + C.fmtWhen(r.when) + C.statusNote(one, r.token)).join(', ')}` : inherited ? `inherits the page's text color (${inherited} for the whole theme); set the property for this part alone` : 'no token of its own; set the property directly'}`,
        commands: [
          `${P} set <theme> ${direct} ${V(group)} --on ${part}${when}   # direct: always works`,
          ...(inherited
            ? [`${P} set <theme> ${inherited} ${V(group)}   # the whole theme`]
            : []),
          ...(tokenRoute
            ? list
                .slice(0, 2)
                .map(
                  r =>
                    `${P} set <theme> ${r.token} ${tokenValue(r.token, group)} --on ${part}   # via the token${C.fmtWhen(r.when)}`,
                )
            : []),
        ],
      });
      if (
        !when &&
        variants.length &&
        ['text', 'background', 'border'].includes(group)
      ) {
        const [vp, vals] = variants[0];
        results.push({
          text: `${part} has ${vp} ${vals.join('|')}: without --when the change reaches every ${vp}. To change one, add --when ${vp}:<value>.`,
          commands: [
            `${P} set <theme> ${direct} ${V(group)} --on ${part} --when ${vp}:${vals[0]}`,
          ],
        });
      }
      const kids = (C.MAP[one]?.contains ?? [])
        .filter(
          k =>
            C.partReads(k, group).length && !(FAMILIES[part] ?? []).includes(k),
        )
        .slice(0, 3);
      if (kids.length && group === 'text') {
        results.push({
          text: `parts inside ${part} with their own text color: ${kids.join(', ')}. A text token set --on ${part} reaches them; a color property does not.`,
          commands: kids.slice(0, 1).map(k => `${HOW} ${k}`),
        });
      }
    }
  }
  if (!parts.length) {
    if (tracking)
      results.push({
        text: 'letter spacing is a CSS property on a part; for headings there is a dial',
        commands: [
          `${P} set <theme> letter-spacing 0.02em --on <part>`,
          `${P} set <theme> headings tight`,
        ],
      });
    for (const g of /** @type {string[]} */ (intents.filter(Boolean)).slice(
      0,
      2,
    )) {
      const dial = /** @type {Record<string, string>} */ ({
        corners: 'corners',
        spacing: 'spacing',
        font: 'font',
        size: 'text-size',
      })[g];
      if (dial && !(tracking && (g === 'spacing' || g === 'font')))
        results.push({
          text: DIALS[dial].help,
          commands: DIALS[dial].examples.map(e => `${P} ${e}`),
        });
      // Text and background colors come from their tokens first; the brand
      // color after.
      results.push(...wholeThemeTokens(ctx, g));
      if (g === 'background' || g === 'text')
        results.push({
          text: DIALS.accent.help,
          commands: DIALS.accent.examples.map(e => `${P} ${e}`),
        });
    }
  }
  if (!results.length) {
    for (const d of Object.values(DIALS)) {
      if (d.words.split(' ').some(w => w.length > 3 && text.includes(w)))
        results.push({
          text: d.help,
          commands: d.examples.map(e => `${P} ${e}`),
        });
    }
  }
  void TOKENS;
  const seen = new Set();
  return {
    parts,
    aspects: /** @type {string[]} */ (intents.filter(Boolean)),
    results: results
      .filter(r => {
        const key = `${r.text}\n${r.commands.join('\n')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10),
  };
}

/**
 * The tokens most parts read for one aspect, for a whole-theme change.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} aspect
 * @returns {Array<{text: string, commands: string[]}>}
 */
export function wholeThemeTokens(ctx, aspect) {
  const {C} = ctx;
  const toks = Object.keys(ctx.project.core.tokenDefaults)
    .filter(k => C.groupOfToken(k) === aspect && C.anyReader(k).length)
    .sort((a, b) => C.anyReader(b).length - C.anyReader(a).length)
    .slice(0, 6);
  if (!toks.length) return [];
  return [
    {
      text: `whole-theme tokens for ${aspect}, most used first: ${toks.map(k => `${k} (${C.anyReader(k).length} parts)`).join(', ')}`,
      commands: [`${P} set <theme> ${toks[0]} <value>`],
    },
  ];
}

/** The aspects `how` answers at the whole-theme level. */
export const ASPECTS = [...Object.keys(GROUPS), 'colors'];

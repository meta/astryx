// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup behind `astryx experimental theme editor how`: a part, a
 * family, a setting, an aspect, a plain-words question, a PNG picture's
 * colors, or a list of what a change can name.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {CSS_PROPERTIES} from './_css-properties.mjs';
import {
  AUTO_SPREAD,
  COMMON_PROPERTIES,
  DIALS,
  FAMILIES,
  GROUPS,
  HOW,
  P,
  familyOf,
} from './_tables.mjs';
import {colorsAt, decodePng, mainColors} from './_png.mjs';
import {nearest, refuse} from './_settings.mjs';
import {ASPECTS, answerHow, wholeThemeTokens} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
import {PALETTE_DIALS, mappingRows, paletteFiles} from './_palette.mjs';
import {requireProject, context} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/** What `how --list` takes. */
const HOW_LISTS = ['dials', 'tokens', 'parts', 'families', 'properties'];

/**
 * Explain anything a theme change can name, or answer a question about one:
 * a part (what it reads for each aspect, its variants, states and the parts
 * inside it), a family (its members), a setting (a dial's rungs, a token's
 * type and readers, a CSS property), an aspect (colors, text, corners...: the
 * whole-theme tokens and dial), a plain-words question (exact commands), a
 * PNG picture (its main colors, or the color at points), or with `list` a
 * list of dials, tokens, parts, families or CSS properties.
 * @experimental
 * @param {string} subject a part, family, setting, aspect, question, or PNG file; with `list`, a filter
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  const {cwd = process.cwd(), list, at = [], count} = options;
  requireProject(cwd);
  const t = (subject ?? '').trim();
  if (list != null) {
    if (at.length)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--at reads a picture; --list lists names, so drop one of them.',
      );
    return {
      type: 'themeEdit.how',
      data: {kind: 'list', subject: t, ...(await listItems(list, t, cwd))},
    };
  }
  if (/\.png$/i.test(t))
    return {
      type: 'themeEdit.how',
      data: {kind: 'picture', subject: t, ...pictureColors(t, cwd, at, count)},
    };
  if (at.length)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--at reads the color at points of a PNG picture; name the picture first.',
      {run: [`${HOW} picture.png --at "40,20"`]},
    );
  if (count != null)
    refuse(E.ERR_INVALID_ARGUMENT, 'A count applies only to a picture.', {
      run: [`${HOW} picture.png --at "40,20;300,180"`],
    });
  if (!t) {
    refuse(
      E.ERR_MISSING_ARGUMENT,
      'Name a part, a family, a setting, an aspect, a question in quotes, or a PNG picture.',
      {
        run: [
          `${HOW} card`,
          `${HOW} "white text in the banner"`,
          `${HOW} --list dials`,
        ],
      },
    );
  }
  const ctx = await context(cwd);
  const {C} = ctx;
  if (FAMILIES[t]) {
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'family',
        subject: t,
        family: t,
        members: FAMILIES[t],
        spreads: AUTO_SPREAD.includes(t),
      },
    };
  }
  if (ctx.project.target.has(t)) {
    const fam = familyOf(t);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'part',
        subject: t,
        component: ctx.project.target.get(t)?.component ?? null,
        recorded: Boolean(C.MAP[t]),
        family: fam,
        familyMembers: fam ? FAMILIES[fam] : [],
        spreads: fam ? AUTO_SPREAD.includes(fam) : false,
        variants: C.variantValues(t),
        states: ctx.project.target.get(t)?.states ?? [],
        reads: Object.fromEntries(
          Object.keys(GROUPS).map(g => [g, C.partReads(t, g)]),
        ),
        contains: C.MAP[t]?.contains ?? [],
      },
    };
  }
  if (ASPECTS.includes(t)) {
    const aspects = t === 'colors' ? ['text', 'background', 'border'] : [t];
    const results = aspects.flatMap(a => wholeThemeTokens(ctx, a));
    const dial = /** @type {Record<string, string>} */ ({
      corners: 'corners',
      spacing: 'spacing',
      font: 'font',
      size: 'text-size',
    })[t];
    if (t === 'colors' || t === 'text' || t === 'background')
      results.unshift(
        ...['accent', 'neutral'].map(d => ({
          text: DIALS[d].help,
          commands: DIALS[d].examples.map(e => `${P} ${e}`),
        })),
      );
    if (dial)
      results.unshift({
        text: DIALS[dial].help,
        commands: DIALS[dial].examples.map(e => `${P} ${e}`),
      });
    results.push({
      text: `for one part: ${HOW} <part> lists what it reads for ${t}`,
      commands: [`${HOW} button`],
    });
    return {
      type: 'themeEdit.how',
      data: {kind: 'aspect', subject: t, results},
    };
  }
  if (t === 'palette') {
    const f = paletteFiles('<theme>');
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'aspect',
        subject: t,
        results: [
          {
            text: `The color dials (${PALETTE_DIALS.join(', ')}) each seed one family of the theme palette. The editor writes ${f.config} in the shape \`theme palette generate\` reads, runs the same generator to write ${f.palette} and its receipt, and points the color tokens at palette stops, light and dark from one color. The generated <theme>.settings.ts imports the palette, so regenerating it moves the theme with it. A token moves to a nearer stop of the same family when it must read: text at 4.5:1 on the surfaces, the focus ring and secondary icons at 3:1, a fill until the text on it reads at 4.5:1. It never mixes a new color. An exact token setting always wins over the palette. Undo a dial to remove its family and its tokens.`,
            commands: [
              `${P} set <theme> accent "#7c3aed"`,
              `${P} set <theme> neutral "#64748b"`,
              `${P} show <theme>`,
              `${P} set <theme> --color-accent "#7c3aed"`,
              `${P} undo <theme> accent`,
            ],
          },
          ...PALETTE_DIALS.map(d => ({
            text: `${d}: ${mappingRows(d).join('; ')}`,
            commands: DIALS[d].examples.map(e => `${P} ${e}`),
          })),
        ],
      },
    };
  }
  if (DIALS[t]) {
    const d = DIALS[t];
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'dial',
        values: d.values,
        help: d.help,
        ...(PALETTE_DIALS.includes(t) ? {stops: mappingRows(t)} : {}),
        examples: d.examples.map(e => `${P} ${e}`),
      },
    };
  }
  if (t.startsWith('--') && t in ctx.project.core.tokenDefaults) {
    const readers = C.anyReader(t);
    const type = C.typeOf(t);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'token',
        tokenType: type,
        default: String(ctx.project.core.tokenDefaults[t]),
        perMode: MODAL.has(type),
        readBy: readers,
        examples: [
          `${P} set <theme> ${t} <value>`,
          ...(readers[0]
            ? [`${P} set <theme> ${t} <value> --on ${readers[0]}`]
            : []),
        ],
      },
    };
  }
  if (CSS_PROPERTIES.has(t)) {
    const setters = Object.keys(C.MAP).filter(p => t in C.MAP[p].own);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'property',
        setBy: setters,
        examples: [
          `${P} set <theme> ${t} <value> --on ${setters[0] ?? '<part>'}`,
        ],
      },
    };
  }
  const h = answerHow(ctx, t);
  return {
    type: 'themeEdit.how',
    data: {
      kind: 'question',
      subject: t,
      understood: {parts: h.parts, aspects: h.aspects},
      results: h.results,
    },
  };
}

/**
 * The items of `how --list`.
 * @param {string} kind
 * @param {string} filter
 * @param {string} cwd
 * @returns {Promise<{list: string, items: Array<Record<string, unknown>>, common?: boolean}>}
 */
async function listItems(kind, filter, cwd) {
  if (!HOW_LISTS.includes(kind))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--list takes ${HOW_LISTS.join(', ')}${kind ? `, not "${kind}"` : ''}.`,
      {
        didYouMean: kind ? nearest(kind, HOW_LISTS) : [],
        run: [`${HOW} --list dials`],
      },
    );
  const f = (/** @type {string} */ x) =>
    x.toLowerCase().includes(filter.toLowerCase());
  if (kind === 'dials')
    return {
      list: kind,
      items: Object.entries(DIALS)
        .filter(([k]) => f(k))
        .map(([name, d]) => ({
          name,
          values: d.values,
          help: d.help,
          examples: d.examples.map(e => `${P} ${e}`),
        })),
    };
  if (kind === 'families')
    return {
      list: kind,
      items: Object.entries(FAMILIES)
        .filter(([k, v]) => f(k) || v.some(f))
        .map(([name, members]) => ({
          name,
          members,
          spreads: AUTO_SPREAD.includes(name),
        })),
    };
  if (kind === 'properties') {
    const props = filter
      ? [...CSS_PROPERTIES].filter(x => f(x)).slice(0, 60)
      : COMMON_PROPERTIES;
    return {list: kind, items: props.map(name => ({name})), common: !filter};
  }
  const ctx = await context(cwd);
  const {C} = ctx;
  if (kind === 'tokens') {
    const toks = Object.keys(ctx.project.core.tokenDefaults).filter(k => f(k));
    return {
      list: kind,
      items: toks.map(k => ({
        name: k,
        type: C.typeOf(k),
        default: String(ctx.project.core.tokenDefaults[k]),
        readBy: C.anyReader(k).length,
      })),
    };
  }
  const targets = ctx.project.targets.filter(x => f(x.key) || f(x.component));
  return {
    list: kind,
    items: targets.map(x => ({
      name: x.key,
      component: x.component,
      family: familyOf(x.key),
      variants: C.variantValues(x.key),
      states: x.states,
      recorded: Boolean(C.MAP[x.key]),
    })),
  };
}

/**
 * Read `--at` points: "x,y;x,y", "x,y x,y", repeated, or a flat "a,b,c,d".
 * @param {string[]} at
 */
export function parsePoints(at) {
  const nums = at
    .join(' ')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number);
  if (nums.length % 2)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--at takes x,y pairs; "${at.join(' ')}" has an odd count of numbers.`,
      {run: [`${HOW} picture.png --at "40,20;300,180"`]},
    );
  /** @type {Array<{x: number, y: number}>} */
  const points = [];
  for (let i = 0; i < nums.length; i += 2)
    points.push({x: nums[i], y: nums[i + 1]});
  return points;
}

/**
 * The main colors of a PNG picture, or the exact color at points.
 * @param {string} file
 * @param {string} cwd
 * @param {string[]} at
 * @param {number | undefined} count
 */
function pictureColors(file, cwd, at, count = 14) {
  const abs = path.resolve(cwd, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
    throw new AstryxError(`${file} does not exist.`, [], E.ERR_FILE_NOT_FOUND);
  if (!Number.isInteger(count) || count <= 0)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `The count must be a positive whole number, not "${count}".`,
    );
  /** @type {import('./_png.mjs').Picture} */
  let pic;
  try {
    pic = decodePng(fs.readFileSync(abs));
  } catch (e) {
    throw new AstryxError(
      `Could not read ${file} as a PNG picture: ${e instanceof Error ? e.message : String(e)}.`,
      [],
      E.ERR_INVALID_ARGUMENT,
    );
  }
  if (at.length)
    return {
      file,
      width: pic.width,
      height: pic.height,
      colors: null,
      points: colorsAt(pic, parsePoints(at)),
    };
  return {
    file,
    width: pic.width,
    height: pic.height,
    colors: mainColors(pic, count),
    points: null,
  };
}

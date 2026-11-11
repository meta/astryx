// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup behind `astryx experimental theme editor how`: a part, a
 * group, a setting, an aspect, a plain-words question, a PNG picture's
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
  INTENTS,
  P,
  PART_WORDS,
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
const HOW_LISTS = ['dials', 'tokens', 'parts', 'groups', 'properties'];

/** The in-app preview, whose Colors page shows every shade. */
const PREVIEW = 'astryx experimental theme preview';

/**
 * Explain anything a theme change can name, or answer a question about one:
 * a part (what it reads for each aspect, its variants, states and the parts
 * inside it), a group (its members), a setting (a dial's rungs, a token's
 * type and readers, a CSS property), an aspect (text, corners...: the
 * whole-theme tokens and dial), `colors` (how the theme's colors are made),
 * a plain-words question (exact commands), a PNG picture (its main colors,
 * or the color at points), or with `list` a list of dials, tokens, parts,
 * groups or CSS properties.
 * @experimental
 * @param {string} subject a part, group, setting, aspect, question, or PNG file; with `list`, a filter
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  const {cwd = process.cwd(), list, at = [], count} = options;
  requireProject(cwd);
  const t = (subject ?? '').trim();
  if (list === '')
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'list',
        subject: t,
        list: 'kinds',
        items: HOW_LISTS.map(name => ({
          name,
          example: `${HOW} --list ${name}`,
        })),
      },
    };
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
      'Name a part, a group, a setting, an aspect, a question in quotes, or a PNG picture.',
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
  // Without part data, what each part reads is unknown: answers that need
  // it say so instead of reporting nothing read.
  const unknown = ctx.unchecked
    ? {notChecked: {code: E.ERR_THEME_NOT_CHECKED, cause: ctx.unchecked}}
    : {};
  if (FAMILIES[t]) {
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'group',
        subject: t,
        group: t,
        members: FAMILIES[t],
        spreads: AUTO_SPREAD.includes(t),
      },
    };
  }
  if (ctx.project.target.has(t)) {
    const group = familyOf(t);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'part',
        subject: t,
        component: ctx.project.target.get(t)?.component ?? null,
        recorded: Boolean(C.MAP[t]),
        group,
        groupMembers: group ? FAMILIES[group] : [],
        spreads: group ? AUTO_SPREAD.includes(group) : false,
        variants: C.variantValues(t),
        states: ctx.project.target.get(t)?.states ?? [],
        reads: Object.fromEntries(
          Object.keys(GROUPS).map(g => [g, C.partReads(t, g)]),
        ),
        contains: C.MAP[t]?.contains ?? [],
        ...unknown,
      },
    };
  }
  if (t === 'colors' || t === 'palette')
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'aspect',
        subject: t,
        results: [
          ...colorsAnswer(),
          ...['text', 'background', 'border'].flatMap(a =>
            wholeThemeTokens(ctx, a),
          ),
        ],
      },
    };
  if (ASPECTS.includes(t)) {
    const results = wholeThemeTokens(ctx, t);
    const dial = /** @type {Record<string, string>} */ ({
      corners: 'corners',
      spacing: 'spacing',
      font: 'font',
      size: 'text-size',
    })[t];
    if (t === 'text' || t === 'background')
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
        ...(PALETTE_DIALS.includes(t) ? {shades: mappingRows(t)} : {}),
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
        ...unknown,
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
        ...unknown,
        examples: [
          `${P} set <theme> ${t} <value> --on ${setters[0] ?? '<part>'}`,
        ],
      },
    };
  }
  const colors = PART_WORDS.some(([re]) => re.test(t.toLowerCase()))
    ? null
    : colorQuestion(t);
  if (colors)
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'question',
        subject: t,
        understood: {parts: [], aspects: ['colors']},
        results: colors,
      },
    };
  const h = answerHow(ctx, t);
  return {
    type: 'themeEdit.how',
    data: {
      kind: 'question',
      subject: t,
      understood: {parts: h.parts, aspects: h.aspects},
      results: h.results,
      ...unknown,
    },
  };
}

/**
 * How the theme's colors are made, for `how colors`: one line on the
 * generator, one per color with the shade each token starts from, then
 * vibrancy, every shade, and the exact-token escape hatch.
 * @returns {Array<{text: string, commands: string[]}>}
 */
function colorsAnswer() {
  const f = paletteFiles('<theme>');
  return [
    {
      text: `Each color you set (${PALETTE_DIALS.join(', ')}) is one seed: the editor generates its shades from it, light and dark, with the same generator as \`theme palette generate\`, and points the color tokens at those shades. A token moves to a nearby shade when it must read: text at 4.5:1, the focus ring and secondary icons at 3:1, a fill until the text on it reads. It never mixes a new color. The generated files are ${f.palette}, made from ${f.config}, and the theme imports them, so every change moves the theme with it.`,
      commands: [
        `${P} set <theme> accent "#7c3aed"`,
        `${P} set <theme> neutral "#64748b"`,
        `${P} show <theme>`,
        `${P} undo <theme> accent`,
      ],
    },
    ...PALETTE_DIALS.map(d => ({
      text: `${d}: ${mappingRows(d).join('; ')}`,
      commands: DIALS[d].examples.map(e => `${P} ${e}`),
    })),
    {
      text: DIALS.vibrancy.help,
      commands: DIALS.vibrancy.examples.map(e => `${P} ${e}`),
    },
    {
      text: 'Every shade, light and dark, with the tokens that use each: the Colors page of the in-app preview. It changes with every set.',
      commands: [`${PREVIEW} add --theme <theme>`],
    },
    {
      text: 'An exact color for one token: set the token itself. It always wins over the generated colors, whatever order you set them in.',
      commands: [`${P} set <theme> --color-accent "#7c3aed"`],
    },
  ];
}

/**
 * Plain-words questions about colors, as `[words, answer]`: the first match
 * answers, with what happens and the commands. Asked only when the question
 * names no part.
 * @type {Array<[RegExp, (q: string) => {text: string, commands: string[]}]>}
 */
const COLOR_QUESTIONS = [
  [
    /\b(exact|one token|single token|specific token|override)\b/,
    () => ({
      text: 'An exact color for one token: set the token itself. It always wins over the generated colors, whatever order you set them in. Add --mode light|dark for one mode, or --on <part> for one part.',
      commands: [
        `${P} set <theme> --color-accent "#7c3aed"`,
        `${P} set <theme> --color-text-primary "#111827" --mode light`,
        `${HOW} --list tokens`,
      ],
    }),
  ],
  [
    /\b(shades?|swatch(es)?|ramps?|all (the )?colou?rs|every colou?r|see (the )?colou?rs)\b/,
    () => ({
      text: 'Every shade of every color, light and dark, with the tokens that use each, is on the Colors page of the in-app preview. It changes with every set.',
      commands: [`${PREVIEW} add --theme <theme>`, `${P} show <theme>`],
    }),
  ],
  [
    /\b(colou?rful|(de)?saturat\w*|vivid|vibran\w*|muted|dull|washed|pastel|intense|punch\w*|gr[ae]yer)\b/,
    q => {
      const less =
        /\b(less|desaturat\w*|muted|dull|washed|pastel|gr[ae]yer|calm\w*|softer)\b/.test(
          q,
        ) && !/\bmore\b/.test(q);
      return {
        text: `vibrancy sets how saturated every generated color is: 0 is gray, 100 the most vivid, 50 the default; ${less ? 'less' : 'more'} steps it by 10.`,
        commands: [
          `${P} set <theme> vibrancy ${less ? 'less' : 'more'}`,
          `${P} set <theme> vibrancy ${less ? 30 : 70}`,
        ],
      };
    },
  ],
  [
    /\bdark\b.*\b(colou?rs?|mode|shades?)\b|\bcolou?rs?\b.*\bdark\b/,
    () => ({
      text: 'Each color you set makes its dark shades too, so dark mode follows by itself. For one token in dark mode only, set it with --mode dark; for a theme with only a dark mode, set mode.',
      commands: [
        `${P} set <theme> accent "#7c3aed"`,
        `${P} set <theme> --color-background-body "#0b0b0f" --mode dark`,
        `${P} set <theme> mode dark-only`,
      ],
    }),
  ],
  [
    /\b(status|errors?|danger|destructive|success|warnings?|caution|info|notices?|red|green|yellow|amber)\b/,
    q => {
      const all = [
        ['danger', /\b(errors?|danger|destructive|red)\b/, '"#dc2626"'],
        ['success', /\b(success|green)\b/, '"#16a34a"'],
        ['warning', /\b(warnings?|caution|yellow|amber)\b/, '"#f59e0b"'],
        ['info', /\b(info|notices?)\b/, '"#0284c7"'],
      ];
      const named = all.filter(([, re]) => /** @type {RegExp} */ (re).test(q));
      const order = [...named, ...all.filter(x => !named.includes(x))];
      return {
        text: 'Status colors are four settings: danger (errors and destructive actions: the --color-error tokens), success, warning and info. Each one makes its light and dark shades from one color.',
        commands: order.map(([d, , v]) => `${P} set <theme> ${d} ${v}`),
      };
    },
  ],
  [
    /\b(brand|accent|primary colou?r|main colou?r|key colou?r)\b/,
    () => ({
      text: 'The brand color is accent: primary buttons, links, selection and the focus ring. It makes its light and dark shades from the one color, and the fill keeps that exact color.',
      commands: [`${P} set <theme> accent "#7c3aed"`, `${HOW} accent`],
    }),
  ],
  [
    /\b(gr[ae]y|neutral|warm|cool)\b/,
    () => ({
      text: 'The gray of surfaces, text and borders is neutral. A gray with a little color makes a cool or warm theme.',
      commands: [
        `${P} set <theme> neutral "#64748b"`,
        `${P} set <theme> neutral "#78716c"`,
      ],
    }),
  ],
];

/**
 * The answer to a plain-words color question, or null when it is not one:
 * a question that names a part, or an aspect other than color, is not.
 * @param {string} question
 * @returns {Array<{text: string, commands: string[]}> | null}
 */
export function colorQuestion(question) {
  const q = question.toLowerCase();
  // A question about another aspect ("make the text red", "override the
  // corner radius", "a yellow background") is answered for that aspect, not
  // as a color question. Color words alone raise the background aspect, so
  // only a background named outright counts.
  if (
    INTENTS.some(([aspect, re]) => aspect !== 'background' && re.test(q)) ||
    /\b(background|bg|backdrop|fill)\b/.test(q)
  )
    return null;
  const hit = COLOR_QUESTIONS.find(([re]) => re.test(q));
  return hit ? [hit[1](q)] : null;
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
  if (kind === 'groups')
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
        readBy: ctx.unchecked ? null : C.anyReader(k).length,
      })),
    };
  }
  const targets = ctx.project.targets.filter(x => f(x.key) || f(x.component));
  return {
    list: kind,
    items: targets.map(x => ({
      name: x.key,
      component: x.component,
      group: familyOf(x.key),
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

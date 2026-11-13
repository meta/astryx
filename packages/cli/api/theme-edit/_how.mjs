// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup behind `astryx experimental theme editor how`: a part, a
 * group, a setting, an aspect, a plain-words question, a PNG picture's
 * colors, or a list of what a change can name. Every command it suggests is
 * written for the user's theme, safe to paste into a shell, and checked as
 * `set` checks it, so it is accepted and changes the theme.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {cssProperties} from './_css.mjs';
import {
  AUTO_SPREAD,
  COLOR_PROPS,
  COMMON_PROPERTIES,
  COMMON_STATES,
  DIALS,
  FAMILIES,
  GROUPS,
  HOW,
  LIKE,
  P,
  familyOf,
} from './_tables.mjs';
import {colorsAt, decodePng, mainColors} from './_png.mjs';
import {baseInstalled, installLine} from './_project.mjs';
import {
  editedThemes,
  loadTheme,
  nearest,
  refuse,
  themeSourceProblem,
} from './_settings.mjs';
import {ASPECTS, checkSetting} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
import {PALETTE_DIALS, mappingRows, paletteFiles} from './_palette.mjs';
import {requireProject, context} from './_context.mjs';
import {checked, exampleStep, howTheme, render} from './_how-commands.mjs';
import {draftAnswer, valueAsked} from './_how-question.mjs';
import {
  getCliInvocation,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/** What `how --list` takes. */
const HOW_LISTS = ['dials', 'tokens', 'parts', 'groups', 'properties'];

/** The most points one `--at` reads. */
const MAX_POINTS = 1000;

/** The in-app preview, whose Colors page shows every shade. */
const PREVIEW = 'astryx experimental theme preview';

/** Picture formats people try that are not PNG, by their first bytes. */
const OTHER_FORMATS = /** @type {Array<[string, number[]]>} */ ([
  ['JPEG', [0xff, 0xd8, 0xff]],
  ['GIF', [0x47, 0x49, 0x46, 0x38]],
  ['WebP', [0x52, 0x49, 0x46, 0x46]],
  ['BMP', [0x42, 0x4d]],
]);

/** File names that are pictures, whatever their format. */
const PICTURE_NAME = /\.(png|jpe?g|gif|webp|bmp|avif|heic|tiff?|svg)$/i;

/**
 * Whether a subject names a picture: a picture file name, or a file that
 * exists.
 * @param {string} subject
 * @param {string} cwd
 */
export function isPicture(subject, cwd) {
  if (!subject) return false;
  // A file that exists is a picture whatever its name: macOS names every
  // screenshot "Screenshot … at 1.23.45 PM.png".
  try {
    if (fs.statSync(path.resolve(cwd, subject.trim())).isFile()) return true;
  } catch {
    // Not a file here.
  }
  return !/\s/.test(subject.trim()) && PICTURE_NAME.test(subject);
}

/**
 * A dial's help, with what `set` does now where that differs from it: Core
 * gives headings the body family when the theme names no heading family,
 * so `font --on body` moves headings too.
 * @param {string} key
 * @param {{bodyFontReachesHeadings: boolean}} env
 */
function dialHelp(key, env) {
  return key === 'font' && env.bodyFontReachesHeadings
    ? `${DIALS.font.help} Note: font --on body also sets the heading font while the theme sets no heading font; for body text alone, set --font-family-body.`
    : DIALS[key].help;
}

/**
 * Explain anything a theme change can name, or answer a question about one:
 * a part (what it reads for each aspect, under which `--when` or `--state`,
 * its variants, states and the parts inside it), a group (its members), a
 * setting (a dial's rungs, a token's type and readers, a CSS property), an
 * aspect (text, corners...: the whole-theme tokens and dial), `colors` (how
 * the theme's colors are made), a plain-words question (exact commands), a
 * PNG picture (its main colors, or the color at points), or with `list` a
 * list of dials, tokens, parts, groups or CSS properties.
 * @experimental
 * @param {string} subject a part, group, setting, aspect, question, or PNG file; with `list`, a filter
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  try {
    if (options.words) {
      // The words as typed: a picture first takes only a count after it;
      // anything else is one subject.
      const words = options.words;
      const picture = isPicture(words[0] ?? '', cwd);
      const again = `${HOW} ${quoteCommandArgument(words[0] ?? '')} 5`;
      if (picture && words.length > 2)
        throw new AstryxError(
          `After a picture, give only how many colors to list, not "${words.slice(1).join(' ')}".`,
          [{name: again, reason: 'do this instead'}],
          ERROR_CODES.ERR_INVALID_ARGUMENT,
        );
      // A missing picture is the first thing to say, before a bad count.
      if (
        picture &&
        words.length === 2 &&
        !/^[1-9]\d*$/.test(words[1]) &&
        fs.existsSync(path.resolve(cwd, words[0]))
      )
        throw new AstryxError(
          `The count after a picture must be a positive whole number, not "${words[1]}".`,
          [{name: again, reason: 'do this instead'}],
          ERROR_CODES.ERR_INVALID_ARGUMENT,
        );
      subject = picture ? words[0] : words.join(' ');
      if (picture && words.length === 2)
        options = {...options, count: Number(words[1])};
    }
    const data = await answer(subject, options, cwd);
    return {type: 'themeEdit.how', data: withPrefix(data, cwd)};
  } catch (e) {
    // A refusal's commands start the same way as an answer's.
    if (e instanceof AstryxError && e.suggestions)
      e.suggestions = withPrefix(e.suggestions, cwd);
    throw e;
  }
}

/**
 * Every command in the answer starts the way this project runs the CLI,
 * the same in JSON as in text.
 * @template T
 * @param {T} value
 * @param {string} cwd
 * @returns {T}
 */
function withPrefix(value, cwd) {
  const stem = `${getCliInvocation(cwd)} experimental theme`;
  if (stem === 'astryx experimental theme') return value;
  /** @param {any} v @returns {any} */
  const walk = v =>
    typeof v === 'string'
      ? v.split('astryx experimental theme').join(stem)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v;
  return walk(value);
}

/**
 * @param {string} subject
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} options
 * @param {string} cwd
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse['data']>}
 */
async function answer(subject, options, cwd) {
  const {list, at = [], count} = options;
  // "½rem": a fraction is a number before anything reads the question.
  const t = (subject ?? '')
    .trim()
    // "corners:", "var(--radius-element)": a setting pasted as written is
    // a lookup of it.
    .replace(/^([a-z][a-z -]*):\s*$/i, '$1')
    .replace(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i, '$1')
    // A lone "½" with no unit after it is a share of now ("card padding
    // ½"), never 0.5px.
    .replace(
      /(\d*)(?:½|1\u20442)(?!\s*(?:rem|px|em|%|x\b|×|times\b))/g,
      (_, n) => (n ? `${n}½` : ' half '),
    )
    .replace(/(\d*)(?:½|1\u20442)/g, (_, n) => `${n ? Number(n) + 0.5 : '0.5'}`)
    .replace(
      /(\d*)(?:¼|1\u20444)/g,
      (_, n) => `${n ? Number(n) + 0.25 : '0.25'}`,
    )
    .replace(
      /(\d*)(?:¾|3\u20444)/g,
      (_, n) => `${n ? Number(n) + 0.75 : '0.75'}`,
    );
  // "paddingLeft", "borderRadius": a property as JavaScript spells it is
  // that CSS property, as set takes it.
  if (/^[a-z]+(?:[A-Z][a-z]+)+$/.test(t)) {
    const kebab = t.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
    if (cssProperties().has(kebab)) return answer(kebab, options, cwd);
  }
  // "explain spacing", "tell me about the accent": the lookup of what is
  // named, never a change.
  const explain =
    /^(?:explain|describe|tell me about)\s+(?:the |my )?([a-z][a-z -]*?)\s*$/i.exec(
      t,
    );
  if (explain && explain[1] !== t) return answer(explain[1], options, cwd);
  // --theme names a theme whatever the subject, so a bad one is refused
  // for a picture and a list too.
  if (options.theme === '')
    refuse(E.ERR_INVALID_ARGUMENT, '--theme was given no name.', {
      run: [`${HOW} ${t ? JSON.stringify(t) : 'card'}`],
    });
  if (options.theme != null) {
    try {
      loadTheme(cwd, options.theme);
    } catch (e) {
      // A theme name near the one typed: the same question for it, never
      // only `show` (the question is kept).
      const err = /** @type {any} */ (e);
      // (A name typed in another case or as a path too.)
      if (err?.suggestions)
        for (const s of err.suggestions) {
          const near = / show ([a-z][a-z0-9-]*)$/.exec(
            String(s.name ?? ''),
          )?.[1];
          if (near)
            s.name = `${HOW} ${quoteCommandArgument(t || 'card')} --theme ${near}`;
        }
      throw e;
    }
    // A theme whose source no longer extends its settings takes no setting:
    // an answer would suggest commands that cannot run.
    const broken = themeSourceProblem(cwd, options.theme);
    if (broken)
      refuse(
        E.ERR_THEME_INVALID,
        `${broken}, so settings cannot take effect and no command here would change the theme. Put back the import, extends and name lines in themes/${options.theme}/${options.theme}.theme.ts, then ask again.`,
        {run: [`${P} show ${options.theme}`]},
      );
  }
  if (list != null) {
    if (at.length)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--at reads a picture; --list lists names, so drop one of them.',
        {run: [`${HOW} --list ${quoteCommandArgument(String(list))}`]},
      );
    const kind = listKind(list);
    if (kind === 'kinds')
      return {
        kind: 'list',
        subject: t,
        list: 'kinds',
        items: HOW_LISTS.map(name => ({
          name,
          example: `${HOW} --list ${name}`,
        })),
      };
    return {kind: 'list', subject: t, ...(await listItems(kind, t, cwd))};
  }
  if (isPicture(t, cwd))
    return {kind: 'picture', subject: t, ...pictureColors(t, cwd, at, count)};
  if (at.length)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--at reads the color at points of a PNG picture; name the picture first.',
      {run: [`${HOW} picture.png --at "40,20"`]},
    );
  if (count != null)
    refuse(E.ERR_INVALID_ARGUMENT, 'A count applies only to a picture.', {
      run: [`${HOW} picture.png 5`],
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
  // "how b make buttons pill": a first word typed as its own argument that
  // names an existing theme, with more words after it, is the theme, as for
  // set, show and undo. A quoted question ("how 'accent red'") is one
  // argument: its first word is never a theme.
  const argv = /** @type {string[] | undefined} */ (options.words);
  if (
    !options.theme &&
    argv &&
    argv.length >= 2 &&
    editedThemes(cwd).includes(argv[0])
  )
    return answer(
      argv.slice(1).join(' '),
      {...options, words: undefined, theme: argv[0]},
      cwd,
    );
  const ctx = await context(cwd);
  const {C} = ctx;
  const env = await howTheme(ctx, cwd, options.theme);
  // Without part data, what each part reads is unknown: answers that need
  // it say so instead of reporting nothing read.
  const unknown = ctx.unchecked
    ? {notChecked: {code: E.ERR_THEME_NOT_CHECKED, cause: ctx.unchecked}}
    : {};
  const themeFields = {
    theme: env.slug,
    themeChosenBy: env.chosenBy,
    ...(env.note ? {themeNote: env.note} : {}),
  };
  /**
   * Dial examples as commands for the theme, each checked.
   * @param {string} dial
   */
  const dialCommands = dial =>
    checked(
      env,
      DIALS[dial].examples
        .map(exampleStep)
        .filter(st => st != null)
        .map(st => [/** @type {import('./_how-commands.mjs').Step} */ (st)]),
    ).commands;
  const key = lookupKey(t, ctx);
  // A list's name alone ("dials", "tokens") is that list.
  if (/^(dials?|tokens?|parts?|groups?|propert(y|ies))$/.test(key)) {
    const kind = listKind(key);
    return {kind: 'list', subject: '', ...(await listItems(kind, '', cwd))};
  }
  if (Object.hasOwn(FAMILIES, key)) {
    return {
      kind: 'group',
      subject: t,
      group: key,
      members: FAMILIES[key],
      spreads: AUTO_SPREAD.includes(key),
    };
  }
  if (ctx.project.target.has(key))
    return partAnswer(ctx, env, t, key, unknown, themeFields);
  if (key === 'colors' || key === 'palette')
    return {
      kind: 'aspect',
      subject: t,
      ...themeFields,
      results: [
        ...colorsAnswer(env, dialCommands),
        ...['text', 'background', 'border'].flatMap(a =>
          wholeThemeTokens(ctx, env, a),
        ),
      ],
    };
  if (ASPECTS.includes(key)) {
    const results = wholeThemeTokens(ctx, env, key);
    const dial = /** @type {Record<string, string>} */ ({
      corners: 'corners',
      spacing: 'spacing',
      font: 'font',
      size: 'text-size',
      shadow: 'surfaces',
      border: 'surfaces',
    })[key];
    if (key === 'text' || key === 'background')
      results.unshift(
        ...['accent', 'neutral'].map(d => ({
          text: dialHelp(d, env),
          commands: dialCommands(d),
        })),
      );
    if (dial)
      results.unshift({
        text: dialHelp(dial, env),
        commands: dialCommands(dial),
      });
    results.push({
      text: `for one part: ${HOW} <part> lists what it reads for ${key}`,
      commands: [`${HOW} button`],
    });
    return {kind: 'aspect', subject: t, ...themeFields, results};
  }
  if (Object.hasOwn(DIALS, key)) {
    const d = DIALS[key];
    // A base is named only when it is installed here; the others are
    // listed with the line that installs them.
    const installed = (/** @type {string} */ b) =>
      baseInstalled(ctx.project, b);
    const missing = key === 'base' ? LIKE.filter(b => !installed(b)) : [];
    return {
      kind: 'setting',
      subject: t,
      source: 'dial',
      values:
        key === 'base'
          ? [...LIKE.filter(installed), 'none'].join('|')
          : d.values,
      help:
        dialHelp(key, env) +
        (missing.length
          ? ` Not installed here: ${missing.join(', ')} (${installLine(
              ctx.project.cwd,
              missing.map(b => `@astryxdesign/theme-${b}`),
            )}).`
          : ''),
      ...(PALETTE_DIALS.includes(key) ? {shades: mappingRows(key)} : {}),
      ...themeFields,
      examples: dialCommands(key),
    };
  }
  if (
    key.startsWith('--') &&
    Object.hasOwn(ctx.project.core.tokenDefaults, key)
  )
    return tokenAnswer(ctx, env, t, key, unknown, themeFields);
  if (cssProperties().has(key)) {
    const setters = Object.keys(C.MAP).filter(p => key in C.MAP[p].own);
    const value = exampleForProperty(key);
    const {commands, refused} = value
      ? checked(
          env,
          setters
            .slice(0, 3)
            .map(on => [
              {verb: /** @type {'set'} */ ('set'), thing: key, value, on},
            ]),
        )
      : {commands: [], refused: []};
    return {
      kind: 'setting',
      subject: t,
      source: 'property',
      setBy: setters,
      ...unknown,
      ...themeFields,
      examples: commands.slice(0, 1),
      ...(refused.length && !commands.length
        ? {refused: refused.slice(0, 2)}
        : {}),
    };
  }
  // "What does --color-accent do", "what's the variable for card padding":
  // "--focus-outline-width: 3px": a token typed with a value is set exactly,
  // or refused with the nearest names; never another token.
  const typedToken =
    /^\s*(--[a-z][a-z0-9-]*)\s*(?::|\s+to\s+|\s+)\s*([^;]+?)\s*;?\s*(?:\bin (light|dark) mode\b.*)?$/i.exec(
      t.replace(/^\s*(?:change|set|make|token)\s+/i, ' '),
    );
  if (
    typedToken &&
    (Object.hasOwn(
      ctx.project.core.tokenDefaults,
      typedToken[1].toLowerCase(),
    ) ||
      nearest(
        typedToken[1].toLowerCase(),
        Object.keys(ctx.project.core.tokenDefaults),
      ).length > 0) &&
    !/^--(on|when|state|mode|theme|list|at)$/.test(typedToken[1]) &&
    // "what does --color-accent do" is a lookup.
    !/^\s*(what|which|where|how|is|are|does|do|explain|why)\b/i.test(t) &&
    !/^(do|does|mean|means|for|control|controls)\b/i.test(typedToken[2].trim())
  ) {
    const token = typedToken[1].toLowerCase();
    const mode = /\bin (light|dark) mode\b/i.exec(t)?.[1]?.toLowerCase();
    const defaults = ctx.project.core.tokenDefaults;
    const near = nearest(token, Object.keys(defaults));
    // A token that does not exist is refused with the nearest real names;
    // a flag-like word with none near is read as words.
    if (!Object.hasOwn(defaults, token) && near.length)
      return refuse(E.ERR_INVALID_ARGUMENT, `There is no token ${token}.`, {
        run: near.map(k => `${HOW} ${k}`),
      });
    // Quotes come off only when the whole value is one quoted string: a
    // font stack keeps its quoted family.
    const typedValue = typedToken[2].trim();
    const value = /^(["'])([^"']*)\1$/.test(typedValue)
      ? typedValue.slice(1, -1)
      : typedValue;
    const {commands, refused} = checked(env, [
      [
        {
          verb: 'set',
          thing: token,
          value,
          ...(mode && env.data.mode === 'both' ? {mode} : {}),
        },
      ],
    ]);
    return {
      kind: 'question',
      subject: t,
      understood: {parts: [], aspects: []},
      ...themeFields,
      results: [
        {
          text: commands.length
            ? `the token ${token}, as you wrote it`
            : `${token} ${value}: ${refused[0]?.why ?? 'no command does it'}`,
          commands,
          ...(refused.length ? {refused} : {}),
        },
      ],
      ...unknown,
    };
  }
  // A question about the tool itself gets the command that answers it.
  const tool = toolAnswer(t, env, ctx.project.target);
  if (tool === 'list') {
    const kind =
      /\b(dials?|tokens?|parts?|groups?|properties|property)\b/i
        .exec(t)?.[1]
        ?.toLowerCase() ?? 'kinds';
    return answer('', {...options, list: kind}, cwd);
  }
  if (tool)
    return {
      kind: 'question',
      subject: t,
      understood: {parts: [], aspects: []},
      ...themeFields,
      results: tool,
      ...unknown,
    };
  // a question about what something is gets the lookup, not a change; a
  // question about a part's value now gets the value (draftAnswer).
  if (
    !valueAsked(t) &&
    (/^\s*(what|which|where)\b.*\b(variables?|tokens?|do|does|means?|controls?|for)\b|^\s*what('s| is) the (css )?(variable|token|property)/i.test(
      t,
    ) ||
      /^\s*(is there|are there|explain|what is|what's|what are)\b/i.test(t)) &&
    !/\b(command|make|makes|set|change)\b/i.test(t)
  ) {
    const tok = /--[a-z0-9-]+/i.exec(t)?.[0]?.toLowerCase();
    if (tok && Object.hasOwn(ctx.project.core.tokenDefaults, tok))
      return tokenAnswer(ctx, env, t, tok, unknown, themeFields);
    // "what does spacing more do": the dial's own lookup, its values and
    // what each does.
    const dial = Object.keys(DIALS).find(d =>
      new RegExp(`\\b${d}\\b`, 'i').test(t.replace(/--[a-z0-9-]+/gi, ' ')),
    );
    if (dial && !/\b(on|for)\s+(the\s+)?[a-z]+s?\b/i.test(t))
      return {...(await answer(dial, options, cwd)), subject: t};
    const q = draftAnswer(ctx, env, t);
    const groups = q.aspects.filter(a => Object.hasOwn(GROUPS, a));
    const results = q.parts
      .map(p => (FAMILIES[p] ? FAMILIES[p][0] : p))
      .filter(p => ctx.project.target.has(p))
      .map(p => {
        const toks = (groups.length ? groups : [null]).flatMap(g =>
          C.partReads(p, g).map(r => r.token),
        );
        return {
          text: toks.length
            ? `${p} reads ${[...new Set(toks)].slice(0, 6).join(', ')}${groups.length ? ` for ${groups.join(' and ')}` : ''}`
            : `what ${p} reads`,
          commands: [`${HOW} ${p}`],
        };
      });
    if (results.length)
      return {
        kind: 'question',
        subject: t,
        understood: {parts: q.parts, aspects: q.aspects},
        ...themeFields,
        results,
        ...unknown,
      };
    // "which token sets the page background?": the token the answer would
    // set, looked up.
    const token = q.parts.includes('page')
      ? '--color-background-body'
      : q.drafts
          .flatMap(d => d.options.flat())
          .find(st => st.thing.startsWith('--'))?.thing;
    if (token && Object.hasOwn(ctx.project.core.tokenDefaults, token))
      return {
        ...tokenAnswer(ctx, env, token, token, unknown, themeFields),
        subject: t,
      };
  }
  const h = draftAnswer(ctx, env, t);
  const results = finish(env, h.drafts);
  const empty = !results.some(r => r.commands.length);
  return {
    kind: 'question',
    subject: t,
    understood: {parts: h.parts, aspects: h.aspects},
    ...themeFields,
    results,
    ...unknown,
    ...(empty
      ? {
          hint: results.length
            ? `No command does all of "${t}" on ${env.slug}; the lines above say why.`
            : `No match for "${t}". Name the part (header, nav links, card, button, banner, input...) and what to change (text color, background, gradient, corners, border, shadow, spacing, bold), in English.`,
          run: [
            `${HOW} --list parts`,
            `${HOW} "rounder buttons"`,
            `${HOW} colors`,
          ],
        }
      : {}),
  };
}

/**
 * Check each draft's commands and keep what passes; a draft whose commands
 * are all refused says why, and points to the lookup that helps.
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {import('./_how-question.mjs').Draft[]} drafts
 */
function finish(env, drafts) {
  /** @type {Array<{text: string, commands: string[], sequence?: boolean, refused?: Array<{command: string, why: string}>}>} */
  const out = [];
  // The measured check runs first on the drafts that carry what their
  // clause asks; a draft that joins them ("all of it, in order") then keeps
  // only the steps some kept option still has, so it never brings back a
  // step the check left out.
  const key = (/** @type {import('./_how-commands.mjs').Step} */ st) =>
    JSON.stringify([
      st.verb,
      st.thing,
      st.value,
      st.on,
      st.when,
      st.state,
      st.mode,
    ]);
  /** @type {Set<string>} */
  const dropped = new Set();
  /** @type {Set<string>} */
  const kept = new Set();
  /** @type {Map<object, string[]>} */
  const unmetOf = new Map();
  if (typeof env.measure === 'function')
    for (const d of drafts) {
      if (!d.intent) continue;
      const intent = d.intent;
      /** @type {string[]} */
      const unmet = [];
      d.options = d.options.filter(o => {
        const why = env.measure(o, intent);
        for (const st of o) (why ? dropped : kept).add(key(st));
        if (why) unmet.push(why);
        return !why;
      });
      unmetOf.set(d, unmet);
    }
  for (const d of drafts) {
    if (!d.intent && dropped.size) {
      d.options = d.options
        .map(o => o.filter(st => !dropped.has(key(st)) || kept.has(key(st))))
        .filter(o => o.length);
      // A joined answer left holding what another answer already says is
      // that answer: it is not given twice (and never as "all of it").
      const same = (/** @type {import('./_how-commands.mjs').Step[]} */ o) =>
        drafts.some(
          x =>
            x !== d &&
            x.options.some(
              y =>
                y.length === o.length &&
                y.every((st, i) => key(st) === key(o[i])),
            ),
        );
      if (d.options.length && d.options.every(same)) continue;
    }
    // The measured check: an option whose built result does not do what
    // the question asks is left out, with a plain line saying why.
    const unmet = unmetOf.get(d) ?? [];
    if (unmet.length) {
      if (unmet.length && !d.options.length)
        d.text = `couldn't work out a command that does "${d.text}" as asked: ${[...new Set(unmet)].join('; ')}`;
      else if (unmet.length)
        d.text = `${d.text} (left out: ${[...new Set(unmet)].join('; ')})`;
    }
    const {commands, refused} = checked(env, d.options);
    const lookups = d.lookup ? [d.lookup] : [];
    if (!commands.length && !d.options.length && unmet.length) {
      out.push({text: d.text, commands: lookups});
      continue;
    }
    if (!commands.length && d.options.length && !lookups.length) {
      out.push({
        text: `${d.text}: no command does it on ${env.slug}${refused[0] ? `: ${refused[0].why}` : ''}`,
        commands: [],
        refused,
      });
      continue;
    }
    out.push({
      text: d.text,
      commands: [...commands, ...lookups],
      ...(d.sequence && commands.length ? {sequence: true} : {}),
      ...(refused.length ? {refused} : {}),
    });
  }
  if (!env.exists && out.some(r => r.commands.some(c => / set /.test(c))))
    out.unshift({
      text: `the app has no theme yet: make ${env.slug} first`,
      commands: [`${P} new ${env.slug} --like ${env.data.like ?? 'neutral'}`],
    });
  const seen = new Set();
  // Changes first; a lookup ("how card") after the commands that change.
  const changes = (/** @type {{commands: string[]}} */ r) =>
    r.commands.some(c => / editor (set|undo|new) /.test(c)) ? 0 : 1;
  return out
    .sort((a, b) => changes(a) - changes(b))
    .filter(r => {
      const k = `${r.text}\n${r.commands.join('\n')}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
}

/**
 * The key a lookup matches: lower case, without closing punctuation, a
 * plural part or aspect made singular, and a token name given its dashes.
 * @param {string} t
 * @param {import('./_settings.mjs').Ctx} ctx
 */
function lookupKey(t, ctx) {
  const k = t
    .toLowerCase()
    .replace(/[?.!]+$/, '')
    .trim();
  if (/\s/.test(k)) return t;
  const known = (/** @type {string} */ x) =>
    Object.hasOwn(FAMILIES, x) ||
    ctx.project.target.has(x) ||
    ASPECTS.includes(x) ||
    Object.hasOwn(DIALS, x) ||
    cssProperties().has(x) ||
    x === 'colors' ||
    x === 'palette';
  if (known(k)) return k;
  const token = `--${k.replace(/^-+/, '')}`;
  if (Object.hasOwn(ctx.project.core.tokenDefaults, token)) return token;
  for (const x of [k.replace(/s$/, ''), k.replace(/es$/, ''), `${k}s`])
    if (x !== k && known(x)) return x;
  return t;
}

/**
 * The answer for one part.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {string} subject
 * @param {string} key
 * @param {object} unknown
 * @param {object} themeFields
 * @returns {import('./theme-edit.type.mjs').ThemeEditHowResponse['data']}
 */
function partAnswer(ctx, env, subject, key, unknown, themeFields) {
  const {C} = ctx;
  const target = /** @type {{component?: string, states: string[]}} */ (
    ctx.project.target.get(key)
  );
  const group = familyOf(key);
  // Only the states set takes on this part (it refuses one that never
  // applies there).
  // Only the states set takes on this part: a state is dropped when the
  // same change without it passes and with it is refused.
  const takes = (/** @type {string | undefined} */ st) => {
    try {
      checkSetting(ctx, env.slug, env.data, 'opacity', '1', {
        on: key,
        ...(st ? {state: st} : {}),
      });
      return true;
    } catch {
      return false;
    }
  };
  const plainOk = takes(undefined);
  const states = [...new Set([...target.states, ...COMMON_STATES])].filter(
    st => !plainOk || takes(st),
  );
  const reads = Object.fromEntries(
    Object.keys(GROUPS).map(g => [
      g,
      C.partReads(key, g).map(r => ({
        token: r.token,
        props: r.props,
        when: [...new Set(r.when.map(w => condition(ctx, key, w)))],
      })),
    ]),
  );
  const components = [
    ...new Set(
      ctx.project.targets.filter(x => x.key === key).map(x => x.component),
    ),
  ];
  const recorded = Boolean(C.MAP[key]);
  /** @type {Record<string, unknown>} */
  const extra = {};
  if (!recorded && !ctx.unchecked) {
    const {commands} = checked(env, [
      [{verb: 'set', thing: 'background', value: '#f3f4f6', on: key}],
      [{verb: 'set', thing: 'color', value: '#111827', on: key}],
      [{verb: 'set', thing: 'border-radius', value: '8px', on: key}],
    ]);
    extra.unrecorded = {
      reason: `the part data comes from one render of every component, and it has no ${key}, so what ${key} reads is unknown; a CSS property set --on ${key} still applies`,
      examples: commands,
    };
  }
  return {
    kind: 'part',
    subject,
    component: target.component ?? null,
    components,
    recorded,
    group,
    groupMembers: group ? FAMILIES[group] : [],
    spreads: group ? AUTO_SPREAD.includes(group) : false,
    variants: C.variantValues(key),
    states,
    reads,
    contains: C.MAP[key]?.contains ?? [],
    ...extra,
    ...unknown,
    ...themeFields,
  };
}

/**
 * One condition a part reads a token under, written as the flags `set`
 * takes (`always` for none), or the condition and why no flag reaches it.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} target
 * @param {string} cond
 * @returns {string}
 */
export function condition(ctx, target, cond) {
  if (!cond.trim()) return 'always';
  const t = ctx.project.target.get(target);
  const props = t?.props ?? [];
  const states = [...(t?.states ?? []), ...COMMON_STATES];
  const values = ctx.C.variantValues(target);
  const words = cond.trim().split(/\s+/);
  const isAttr = (/** @type {string} */ w) => /^[a-z][\w-]*=[^\s]*$/i.test(w);
  const attrs = words.filter(isAttr).flatMap(w => w.split(','));
  const css = words.filter(w => !isAttr(w)).join(' ');
  /** @type {string[]} */
  const flags = [];
  /** @type {string | null} */
  let why = null;
  for (const kv of attrs) {
    const [k, v] = kv.split('=');
    if (k === 'selected' && states.includes('selected'))
      flags.push('--state selected');
    else if (props.includes(k) && (!values[k]?.length || values[k].includes(v)))
      flags.push(`--when ${k}:${v}`);
    else why ??= `${target} has no ${k} prop or state that set can name`;
  }
  if (css) {
    const m = /^:([a-z-]+)$/.exec(css);
    if (m && states.includes(m[1])) flags.push(`--state ${m[1]}`);
    else why ??= `${css} is a CSS selector that set cannot name`;
  }
  if (flags.filter(f => f.startsWith('--when')).length > 1)
    why ??= 'set names one --when at a time';
  if (flags.filter(f => f.startsWith('--state')).length > 1)
    why ??= 'set names one --state at a time';
  return why ? `${cond.trim()} (not settable: ${why})` : flags.join(' ');
}

/** Whether Core's stylesheet reads a token. @type {Map<string, string>} */
const sheets = new Map();
/**
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} token
 */
function stylesheetReads(ctx, token) {
  const file = ctx.project.req.resolve('@astryxdesign/core/astryx.css');
  let css = sheets.get(file);
  if (css == null) {
    try {
      css = fs.readFileSync(file, 'utf8');
    } catch {
      css = '';
    }
    sheets.set(file, css);
  }
  return new RegExp(`var\\(${token}[,)]`).test(css);
}

/**
 * A value of a token's own type that differs from the one it has now.
 * @param {string} type
 * @param {string} token
 * @param {string} now
 */
function exampleForToken(type, token, now) {
  const pick = (/** @type {string[]} */ xs) =>
    xs.find(x => x.toLowerCase() !== now.toLowerCase()) ?? xs[0];
  if (type === 'color') return pick(['#7c3aed', '#2563eb']);
  if (type === 'shadow') return '0 2px 8px rgb(0 0 0 / 0.15)';
  if (type === 'size') {
    const m = /^(\d*\.?\d+)(px|rem|em)$/.exec(now.trim());
    if (m) return `${Number((Number(m[1]) * 1.25).toFixed(3))}${m[2]}`;
    return pick(['8px', '10px']);
  }
  if (type === 'number')
    return /leading|line-height/.test(token)
      ? pick(['1.6', '1.4'])
      : pick(['600', '700']);
  if (type === 'font') return 'Georgia, serif';
  if (type === 'time') return pick(['200ms', '300ms']);
  if (type === 'easing') return 'ease-out';
  return null;
}

/** An example value for a CSS property. @param {string} prop */
function exampleForProperty(prop) {
  if (COLOR_PROPS.test(prop)) return '#7c3aed';
  /** @type {Record<string, string>} */
  const known = {
    background: '#f3f4f6',
    'background-image': 'linear-gradient(#ffffff, #e5e7eb)',
    border: '1px solid var(--color-border)',
    'border-width': '2px',
    'border-style': 'dashed',
    'box-shadow': 'var(--shadow-med)',
    'font-weight': '600',
    'font-family': 'Georgia, serif',
    'letter-spacing': '0.02em',
    'text-transform': 'uppercase',
    'font-style': 'italic',
    opacity: '0.8',
    transform: 'scale(0.97)',
    outline: 'none',
  };
  if (known[prop]) return known[prop];
  if (/radius$/.test(prop)) return '8px';
  if (/^(padding|margin|gap|row-gap|column-gap)/.test(prop)) return '12px';
  if (/^(font-size)$/.test(prop)) return '16px';
  if (/(height|width|block-size|inline-size)$/.test(prop)) return '40px';
  return null;
}

/**
 * The answer for one design token: its type, default, the parts that read
 * it, and commands that set it, each checked.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {string} subject
 * @param {string} key
 * @param {object} unknown
 * @param {object} themeFields
 * @returns {import('./theme-edit.type.mjs').ThemeEditHowResponse['data']}
 */
function tokenAnswer(ctx, env, subject, key, unknown, themeFields) {
  const {C} = ctx;
  const readers = C.anyReader(key);
  const type = C.typeOf(key);
  // The theme's own value (its settings applied), else the base theme's.
  const now =
    env.own?.light[key] ??
    env.base.light[key] ??
    String(ctx.project.core.tokenDefaults[key]);
  const value = exampleForToken(type, key, now);
  const {commands, refused} = value
    ? checked(env, [
        [{verb: 'set', thing: key, value}],
        ...(readers[0]
          ? [
              [
                {
                  verb: /** @type {'set'} */ ('set'),
                  thing: key,
                  value,
                  on: readers[0],
                },
              ],
            ]
          : []),
      ])
    : {commands: [], refused: []};
  // The part data comes from one render of each component, so a token only
  // a variant it does not render reads (heading level 5, an error toast)
  // shows no reader there; Core's stylesheet still names it.
  const inSheet = !readers.length && stylesheetReads(ctx, key);
  return {
    kind: 'setting',
    subject,
    source: 'token',
    tokenType: type,
    default: String(ctx.project.core.tokenDefaults[key]),
    perMode: MODAL.has(type),
    readBy: readers,
    ...(readers.length || ctx.unchecked
      ? {}
      : {
          readByNote: inSheet
            ? `no part in the part data reads ${key}, but Core's stylesheet does, in a variant or state the part data does not render; so readBy is incomplete`
            : `no part reads ${key}, and Core's stylesheet does not use it`,
        }),
    ...unknown,
    ...themeFields,
    examples: commands,
    ...(refused.length ? {refused} : {}),
  };
}

/**
 * How the theme's colors are made, for `how colors`: one line on the
 * generator, one per color with the shade each token starts from, then
 * vibrancy, every shade, and the exact-token escape hatch.
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {(dial: string) => string[]} dialCommands
 * @returns {Array<{text: string, commands: string[]}>}
 */
function colorsAnswer(env, dialCommands) {
  const f = paletteFiles(env.slug);
  const one = (/** @type {import('./_how-commands.mjs').Step[]} */ steps) =>
    checked(env, [steps]).commands;
  return [
    {
      text: `Each color you set (${PALETTE_DIALS.join(', ')}) is one seed: the editor generates its shades from it, light and dark, with the same generator as \`theme palette generate\`, and points the color tokens at those shades. The exact color you gave sits at its own shade, in dark too when it reads there. A token moves to a nearby shade when it must read: text at 4.5:1, the focus ring and secondary icons at 3:1. A fill never moves: the text on it changes instead. It never mixes a new color. The generated files are ${f.palette}, made from ${f.config}; the theme imports only the shades it uses, from ${f.refs}, so every change moves the theme with it. Hand edits to ${f.config} that no color setting owns are kept; a hand edit to ${f.palette} is never overwritten.`,
      commands: [
        ...one([{verb: 'set', thing: 'accent', value: '#7c3aed'}]),
        ...one([{verb: 'set', thing: 'neutral', value: '#64748b'}]),
        ...(env.exists ? [`${P} show ${env.slug}`] : []),
      ],
    },
    ...PALETTE_DIALS.map(d => ({
      text: `${d}: ${mappingRows(d).join('; ')}`,
      commands: dialCommands(d),
    })),
    {
      text: DIALS.vibrancy.help,
      commands: dialCommands('vibrancy'),
    },
    {
      text: 'Every shade, light and dark, with the tokens that use each: the Colors page of the in-app preview. It changes with every set.',
      commands: env.exists ? [`${PREVIEW} add --theme ${env.slug}`] : [],
    },
    {
      text: 'An exact color for one token: set the token itself. It always wins over the generated colors, whatever order you set them in.',
      commands: one([{verb: 'set', thing: '--color-accent', value: '#7c3aed'}]),
    },
  ];
}

/**
 * The answer to a question about the tool itself: help, a list, how to see
 * a change, or the difference between two things it names. 'list' means
 * the caller lists the kind the question names.
 * @param {string} t
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {Map<string, unknown>} targets the parts Core styles
 * @returns {Array<{text: string, commands: string[]}> | 'list' | null}
 */
function toolAnswer(t, env, targets) {
  const q = t
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/, '');
  if (
    /^(help|usage|\?|how does (this|it) work|what can (i|you) (ask|do))$/.test(
      q,
    )
  )
    return [
      {
        text: 'how answers a part, a setting, a plain-words question or a PNG picture with the commands that make the change; set makes it, show lists what a theme sets',
        commands: [`${HOW} --help`, `${HOW} --list kinds`],
      },
    ];
  if (
    /^(list|show)( me)? (all|every|the)? ?(the )?(dials?|tokens?|parts?|groups?|properties)\b/.test(
      q,
    )
  )
    return 'list';
  if (/\b(see|view|preview|check) (my |the )?(changes?|theme|edits?)\b/.test(q))
    return [
      {
        text: `show lists what ${env.slug} sets; a preview page shows the theme in the app`,
        commands: [
          `${P} show ${env.slug}`,
          `${PREVIEW} add --theme ${env.slug}`,
        ],
      },
    ];
  // Questions about the theme's files and life.
  if (
    /\b(use|import|apply|add|load) (this|the|my) theme (in|to|into) (my|the) app\b/.test(
      q,
    )
  )
    return [
      {
        text: `the theme is a module in themes/${env.slug}/; show names it and its files, and the theme docs say how an app loads a theme`,
        commands: [`${P} show ${env.slug}`, 'astryx docs theme'],
      },
    ];
  if (/\brename\b/.test(q))
    return [
      {
        text: 'no command renames a theme: make a new one, set what you need on it, and remove the old folder',
        commands: [
          `${P} new ${env.slug}-2 --like ${env.data.like ?? 'none'}`,
          `${P} show ${env.slug}`,
        ],
      },
    ];
  if (
    /\b(what|which) (changed|did i change|have i changed)\b|\bwhat (is|does) (my|this|the) theme set\b/.test(
      q,
    )
  )
    return [
      {
        text: `show lists every setting ${env.slug} has, in the order they were made`,
        commands: [`${P} show ${env.slug}`],
      },
    ];
  if (/\b(second|another|new|other) theme\b/.test(q))
    return [
      {
        text: 'new makes a theme beside the ones you have; how and set take --theme to pick one',
        commands: [`${P} new ${env.slug}-2 --like ${env.data.like ?? 'none'}`],
      },
    ];
  // Screen-size, print and device conditions: the editor has none.
  if (
    /\bmedia quer|^(on|for) (mobile|phones?|tablets?|desktops?|print)$|^(print|printing|print styles?)$/.test(
      q,
    )
  )
    return [
      {
        text: 'the theme editor has no screen-size, print or device conditions: every setting applies on every screen; a media query needs your own CSS',
        commands: [`${HOW} --help`],
      },
    ];
  // Questions about what is set now, or the choices: a lookup, never a
  // write.
  const asks =
    /^(how (round|big|small|large|thick|dark|light|bold|wide|tall) (is|are)|what (is|are) the (current|available)|which \w+ (does|do|is|are)|what (font|color|colour|radius|accent) (does|do|is|are)|what (values|options|choices))\b|\b(right now|currently|at the moment)\??$|\bnow\?$/.exec(
      q,
    );
  // "is my theme valid", "how many dials", "list every change".
  if (
    /^(is|are) (my|the|this) theme (valid|ok|okay|broken|working)\b|^(check|validate) (my|the) theme\b/.test(
      q,
    )
  )
    return [
      {
        text: `show builds ${env.slug} and says what is wrong with it, if anything`,
        commands: [`${P} show ${env.slug}`],
      },
    ];
  if (
    /^how many (dials|settings|tokens|parts)\b|^(list|show) (every|all|each) (dial|setting|token|part)s?\b/.test(
      q,
    )
  )
    return 'list';
  if (/^(list|show) (every|all|my) (changes?|edits?|settings)\b/.test(q))
    return [
      {
        text: `show lists every setting ${env.slug} has`,
        commands: [`${P} show ${env.slug}`],
      },
    ];
  if (
    // A question about a part's value now is answered with that value.
    (asks && !valueAsked(q)) ||
    /^which parts (are|does|do)\b/.test(q) ||
    (/^why (is|are|does|do)\b/.test(q) && !/\bnot\b|n'?t\b/.test(q))
  ) {
    // The part or setting the question names gets its own lookup.
    const named = q
      .split(/[^a-z-]+/)
      .find(
        w =>
          w.length > 2 &&
          (targets.has(w) ||
            targets.has(w.replace(/s$/, '')) ||
            ['inputs', 'checks'].includes(w)),
      );
    const key =
      named && !targets.has(named) && !['inputs', 'checks'].includes(named)
        ? named.replace(/s$/, '')
        : named;
    return [
      {
        text: key
          ? `how ${key} says what ${key} reads and what sets it; show lists what ${env.slug} sets now`
          : `show lists what ${env.slug} sets now; how <part> or how <setting> says what a part reads and the values a setting takes`,
        commands: [...(key ? [`${HOW} ${key}`] : []), `${P} show ${env.slug}`],
      },
    ];
  }
  if (
    /\b((astryx|cli) version|version of (the )?(cli|astryx)|which cli|what cli)\b/.test(
      q,
    )
  )
    return [{text: 'the CLI says its version', commands: ['astryx --version']}];
  if (/\bwhere (are|is|do) .*\b(stored|saved|kept|live|files?)\b/.test(q))
    return [
      {
        text: `everything is in themes/${env.slug}/: the settings file is the source, and the CSS and module are built from it`,
        commands: [`${P} show ${env.slug}`],
      },
    ];
  if (
    /\b(edit|change) (the )?(css|module|theme)?( files?)? by hand\b|\bhand[- ]edit/.test(
      q,
    )
  )
    return [
      {
        text: `the CSS and module in themes/${env.slug}/ are built from the settings file, so a hand edit is lost at the next set; make the change with set`,
        commands: [`${HOW} --help`],
      },
    ];
  const diff = /\bdifference between (.+?) and (.+)$/.exec(q);
  if (diff) {
    const props = cssProperties();
    return [diff[1], diff[2]].map(x => {
      const w = x.trim().replace(/^(the|a) /, '');
      return {
        text: Object.hasOwn(DIALS, w)
          ? `${w} is a dial: ${DIALS[w].help}`
          : props.has(w)
            ? `${w} is a CSS property: set it on one part with --on`
            : w.startsWith('--')
              ? `${w} is a token: one value the whole theme reads`
              : `what ${w} is`,
        commands: [`${HOW} ${w}`],
      };
    });
  }
  return null;
}

/**
 * The tokens most parts read for one aspect, for a whole-theme change.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {string} aspect
 * @returns {Array<{text: string, commands: string[]}>}
 */
function wholeThemeTokens(ctx, env, aspect) {
  const {C} = ctx;
  const toks = Object.keys(ctx.project.core.tokenDefaults)
    .filter(k => C.groupOfToken(k) === aspect && C.anyReader(k).length)
    .sort((a, b) => C.anyReader(b).length - C.anyReader(a).length)
    .slice(0, 6);
  if (!toks.length) return [];
  // The example uses the most read token whose example changes what shows:
  // a fully round corner (9999px) scaled up stays fully round.
  /** @type {string[]} */
  let commands = [];
  for (const tok of toks) {
    const now = env.own?.light[tok] ?? env.base.light[tok] ?? '';
    if (parseFloat(now) >= 999) continue;
    const value = exampleForToken(C.typeOf(tok), tok, now);
    if (!value) continue;
    commands = checked(env, [[{verb: 'set', thing: tok, value}]]).commands;
    if (commands.length) break;
  }
  return [
    {
      text: `whole-theme tokens for ${aspect}, most used first: ${toks.map(k => `${k} (${C.anyReader(k).length} parts)`).join(', ')}`,
      commands: commands.length ? commands : [`${HOW} ${toks[0]}`],
    },
  ];
}

/**
 * What `--list` lists: a kind in any case, singular or plural.
 * @param {string} list
 */
function listKind(list) {
  const k = list.trim().toLowerCase();
  if (k === '' || k === 'kinds' || k === 'kind') return 'kinds';
  const plural =
    k.endsWith('ies') || k.endsWith('s') ? k : k.replace(/y$/, 'ie') + 's';
  if (HOW_LISTS.includes(plural)) return plural;
  const near = nearest(k, [...HOW_LISTS, 'kinds']);
  return refuse(
    E.ERR_INVALID_ARGUMENT,
    `--list takes ${HOW_LISTS.join(', ')} or kinds, not "${list}".`,
    {
      didYouMean: near,
      run: [...near.map(n => `${HOW} --list ${n}`), `${HOW} --list kinds`],
    },
  );
}

/**
 * The items of `how --list`.
 * @param {string} kind
 * @param {string} filter
 * @param {string} cwd
 * @returns {Promise<{list: string, items: Array<Record<string, unknown>>, common?: boolean}>}
 */
async function listItems(kind, filter, cwd) {
  const f = (/** @type {string} */ x) =>
    x.toLowerCase().includes(filter.toLowerCase());
  if (kind === 'dials') {
    const ctx = await context(cwd);
    const env = await howTheme(ctx, cwd, undefined);
    return {
      list: kind,
      items: Object.entries(DIALS)
        .filter(([k]) => f(k))
        .map(([name, d]) => ({
          name,
          values: d.values,
          help: dialHelp(name, env),
          examples: d.examples
            .map(exampleStep)
            .filter(st => st != null)
            .map(st =>
              render(
                /** @type {import('./_how-commands.mjs').Step} */ (st),
                env.slug,
              ),
            ),
        })),
    };
  }
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
      ? [...cssProperties()].filter(x => f(x)).slice(0, 60)
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
  // One item per part name: a name two components share lists both.
  /** @type {Map<string, {key: string, components: string[], states: string[]}>} */
  const byKey = new Map();
  for (const x of ctx.project.targets) {
    if (!f(x.key) && !f(x.component)) continue;
    const e = byKey.get(x.key) ?? {key: x.key, components: [], states: []};
    if (!e.components.includes(x.component)) e.components.push(x.component);
    for (const s of x.states) if (!e.states.includes(s)) e.states.push(s);
    byKey.set(x.key, e);
  }
  // A filter no part name holds lists the closest names, never nothing.
  if (!byKey.size && filter) {
    const word = filter.toLowerCase().replace(/s$/, '');
    // The parts of components whose doc lists the word, else the names
    // nearest it.
    const owners = Object.entries(ctx.project.components)
      .filter(([, info]) =>
        (info.keywords ?? []).some(
          k => k.toLowerCase().replace(/s$/, '') === word,
        ),
      )
      .map(([name]) => name);
    const close = new Set(
      owners.length
        ? ctx.project.targets
            .filter(x => owners.includes(x.component))
            .map(x => x.key)
        : nearest(
            word,
            ctx.project.targets.map(x => x.key),
            5,
          ),
    );
    for (const x of ctx.project.targets) {
      if (!close.has(x.key)) continue;
      const e = byKey.get(x.key) ?? {key: x.key, components: [], states: []};
      if (!e.components.includes(x.component)) e.components.push(x.component);
      for (const st of x.states) if (!e.states.includes(st)) e.states.push(st);
      byKey.set(x.key, e);
    }
  }
  return {
    list: kind,
    items: [...byKey.values()].map(x => ({
      name: x.key,
      component: x.components.join(', '),
      group: familyOf(x.key),
      variants: C.variantValues(x.key),
      states: x.states,
      recorded: Boolean(C.MAP[x.key]),
    })),
  };
}

/**
 * Read `--at` points: "x,y;x,y", "x,y x,y", repeated, or a flat "a,b,c,d".
 * Each number is a whole pixel; anything else is refused by name.
 * @param {string[]} at
 * @returns {Array<{x: number, y: number}>}
 */
export function parsePoints(at) {
  const words = at
    .join(' ')
    .split(/[;\s]+/)
    .filter(Boolean);
  const example = `${HOW} picture.png --at "40,20;300,180"`;
  if (!words.length)
    refuse(E.ERR_INVALID_ARGUMENT, '--at names no point; give x,y pairs.', {
      run: [example],
    });
  /** @type {Array<{x: number, y: number}>} */
  const points = [];
  for (const w of words) {
    const nums = w.split(',');
    if (!nums.every(n => /^-?\d+$/.test(n)))
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `--at takes whole pixel numbers as x,y; "${w}" is not that.`,
        {run: [example]},
      );
    if (nums.length % 2)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `--at takes x,y pairs; "${w}" has an odd count of numbers.`,
        {run: [example]},
      );
    for (let i = 0; i < nums.length; i += 2)
      points.push({x: Number(nums[i]), y: Number(nums[i + 1])});
  }
  if (points.length > MAX_POINTS)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--at reads at most ${MAX_POINTS} points; it got ${points.length}.`,
      {run: [example]},
    );
  return points;
}

/**
 * The main colors of a PNG picture, or the exact color at points.
 * @param {string} file
 * @param {string} cwd
 * @param {string[]} at
 * @param {number | undefined} count
 */
function pictureColors(file, cwd, at, count) {
  const abs = path.resolve(cwd, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
    throw new AstryxError(
      `${file} does not exist.`,
      [{name: `${HOW} --list parts`, reason: 'or ask in plain words'}],
      E.ERR_FILE_NOT_FOUND,
    );
  if (count != null && at.length)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      'A count lists main colors; --at reads points. Give one of them.',
      {run: [`${HOW} ${quoteCommandArgument(file)} ${count}`]},
    );
  if (count != null && (!Number.isInteger(count) || count <= 0))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `The count must be a positive whole number, not "${count}".`,
      {run: [`${HOW} ${file} 5`]},
    );
  const points = at.length ? parsePoints(at) : null;
  // The header holds the size, so a huge picture is refused unread.
  const fd = fs.openSync(abs, 'r');
  const head = Buffer.alloc(8);
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  const other = OTHER_FORMATS.find(([, sig]) =>
    sig.every((b, i) => head[i] === b),
  );
  if (other)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${file} is a ${other[0]} picture; how reads PNG only. Save or convert it as PNG.`,
      {run: [`${HOW} --list`]},
    );
  /** @type {import('./_png.mjs').Picture} */
  let pic;
  try {
    pic = decodePng(fs.readFileSync(abs));
  } catch (e) {
    throw new AstryxError(
      `Could not read ${file} as a PNG picture: ${e instanceof Error ? e.message : String(e)}.`,
      [{name: `${HOW} --list`, reason: 'what how reads'}],
      E.ERR_INVALID_ARGUMENT,
    );
  }
  if (points) {
    const outside = points.filter(
      p => p.x < 0 || p.y < 0 || p.x >= pic.width || p.y >= pic.height,
    );
    if (outside.length)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `${outside
          .slice(0, 3)
          .map(p => `${p.x},${p.y}`)
          .join(
            '; ',
          )} ${outside.length > 1 ? 'are' : 'is'} outside the picture, which is ${pic.width}x${pic.height} (x from 0 to ${pic.width - 1}, y from 0 to ${pic.height - 1}).`,
        {run: [`${HOW} ${quoteCommandArgument(file)} --at 0,0`]},
      );
    return {
      file,
      width: pic.width,
      height: pic.height,
      colors: null,
      points: colorsAt(pic, points),
    };
  }
  const colors = mainColors(pic, count ?? 14);
  // Every pixel see-through: no color shows, as with a 0-pixel picture.
  if (!colors.length)
    throw new AstryxError(
      `Could not read ${file} as a PNG picture: every pixel is fully see-through, so it has no visible colors.`,
      [{name: `${HOW} --list`, reason: 'what how reads'}],
      E.ERR_INVALID_ARGUMENT,
    );
  return {
    file,
    width: pic.width,
    height: pic.height,
    colors,
    points: null,
  };
}

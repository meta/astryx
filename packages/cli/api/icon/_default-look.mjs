// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one rule for an icon set's default variant: it is the look each
 * icon's own export draws.
 * @input the set's data and generated module, the wrapped library's look
 *   words, and the variants and default variant a command names
 * @output the variants and default variant to write, or an AstryxError that
 *   names the library's look words, the command that moves the look, or the
 *   variant to add when the library's names name no looks
 * @position used by `new-set` (create, refresh, in place) and by
 *   `add --variant` (one icon or `--all`); every command that writes or keeps
 *   `default.variant`, or adds a look, asks this module first
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  generatedModulePath,
  generatedOrigins,
  iconIdOf,
  preferredLook,
  sameIconModule,
  splitLook,
} from '../../foundation/discovery/icon-set-writer.mjs';
import {shellArg} from '../../foundation/text/shell-arg.mjs';

/**
 * The variants and default variant a command declares.
 * @typedef {object} Looks
 * @property {string[]} variants
 * @property {string} default
 * @property {boolean} [named] whether `--default-variant` named the default
 */

/**
 * What a set's icons draw now, read from the look words of the library
 * exports its generated module re-exports.
 * @typedef {object} DrawnLooks
 * @property {string} module the library most of the set's icons come from
 * @property {Array<Set<string>>} positions that library's look positions,
 *   the last word of a name first; empty when its names encode no looks
 * @property {Array<string | null>} words the word most icons' exports have
 *   at each position
 * @property {number} icons how many of the set's icons come from it
 */

/**
 * @typedef {import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet} LookSet
 */

/**
 * A library's look words in the order its names write them, one position
 * after another: `filled or outline; 24; wght300, wght400, wght500`.
 * @param {string[][]} positions each position's words, sorted, the last
 *   word of a name first
 */
export function describedLooks(positions) {
  return [...positions]
    .reverse()
    .map(words =>
      words.length > 3
        ? `${words[0]} to ${words.at(-1)}`
        : words.join(words.length === 2 ? ' or ' : ', '),
    )
    .join('; ');
}

/** @param {Array<Set<string>>} positions */
const sortedWords = positions =>
  positions.map(position => [...position].sort());

/**
 * The words of the positions that name a style (`filled`, `outline`), not
 * only numbers (`24`, `wght400`): the words a variant is usually named by.
 * @param {Array<Set<string>>} positions
 */
function styleWords(positions) {
  return sortedWords(positions)
    .filter(words => words.some(word => !/^[a-z]*\d+$/u.test(word)))
    .reverse()
    .flat();
}

/**
 * The look the set's icons draw at the first position, in name order, whose
 * drawn word is one of `among`; else at the first style position.
 * @param {Array<Set<string>>} positions
 * @param {Array<string | null>} words the drawn word at each position
 * @param {string[]} [among]
 * @returns {string | null}
 */
function drawnWord(positions, words, among = []) {
  for (let index = positions.length - 1; index >= 0; index--) {
    const word = words[index];
    if (word != null && among.includes(word)) return word;
  }
  for (let index = positions.length - 1; index >= 0; index--) {
    const word = words[index];
    if (
      word != null &&
      [...positions[index]].some(w => !/^[a-z]*\d+$/u.test(w))
    )
      return word;
  }
  return null;
}

/**
 * What the set's icons draw now ({@link DrawnLooks}), or null when no icon
 * re-exports a named library export.
 * @param {LookSet} set
 * @param {string} packageDir
 * @param {(module: string) => Array<Set<string>> | null} positionsOf the
 *   look positions of a library the set's generated module names
 * @param {{module?: string}} [options] `module`: read only the icons that
 *   come from this library
 * @returns {DrawnLooks | null}
 */
export function drawnLooks(set, packageDir, positionsOf, options = {}) {
  const origins = generatedOrigins(
    packageDir,
    generatedModulePath(set, packageDir),
  );
  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const icon of set.data.icons) {
    if ((icon.module ?? set.data.module) !== set.data.module) continue;
    const origin = origins.get(icon.export);
    if (!origin || origin.source === 'default') continue;
    if (
      options.module != null &&
      !sameIconModule(origin.module, options.module)
    )
      continue;
    const sources = byModule.get(origin.module) ?? [];
    sources.push(origin.source);
    byModule.set(origin.module, sources);
  }
  const ranked = [...byModule].sort(
    (a, b) =>
      b[1].length - a[1].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  if (ranked.length === 0) return null;
  for (const [module, sources] of ranked) {
    const positions = positionsOf(module) ?? [];
    if (positions.length === 0) continue;
    /** @type {Array<Map<string, number>>} */
    const counts = positions.map(() => new Map());
    for (const source of sources) {
      const {look} = splitLook(iconIdOf(source).split('-'), positions);
      look.forEach((word, index) => {
        if (word != null) {
          counts[index].set(word, (counts[index].get(word) ?? 0) + 1);
        }
      });
    }
    const words = counts.map(count => {
      /** @type {string | null} */
      let best = null;
      let most = 0;
      for (const [word, n] of [...count].sort((a, b) =>
        a[0] < b[0] ? -1 : 1,
      )) {
        if (n > most) {
          best = word;
          most = n;
        }
      }
      return best;
    });
    return {module, positions, words, icons: sources.length};
  }
  const [module, sources] = ranked[0];
  return {module, positions: [], words: [], icons: sources.length};
}

/**
 * The refusal for a look word the library does not have.
 * @param {string} word
 * @param {string} flag `--default-variant` or `--variant`
 * @param {string} module
 * @param {Array<Set<string>>} positions
 */
function unknownLook(word, flag, module, positions) {
  return new AstryxError(
    `"${word}" is no look of ${module}: its exports name their looks with ${describedLooks(sortedWords(positions))}. Name one of these words, so each icon's export draws that look.`,
    styleWords(positions).map(each => ({
      name: `${flag} ${each}`,
      reason: `a look ${module} names`,
    })),
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/**
 * The command that wraps the library again in a new default look.
 * @param {string} name
 * @param {string | undefined} module
 * @param {Looks} looks
 */
function refreshCommand(name, module, looks) {
  return `astryx experimental icon new-set ${name} --from ${module ? shellArg(module) : '<module>'} --variants ${looks.variants.join(',')} --default-variant ${looks.default}`;
}

/**
 * The refusal for a default variant that would move in place.
 * @param {string} name
 * @param {number} count icons that draw `now`
 * @param {string} now the look they draw
 * @param {Looks} looks
 * @param {string | undefined} module
 * @param {string | undefined} current
 */
function inPlaceMove(name, count, now, looks, module, current) {
  return new AstryxError(
    `Icon set "${name}" can't ${current != null ? `move its default variant from "${current}" to "${looks.default}"` : `take "${looks.default}" as its default variant`} in place: each of its ${count} icons still draws "${now}". Wrap the library again with the new default, so each icon takes that look.`,
    [
      {
        name: refreshCommand(name, module, looks),
        reason: 'wrap the library again in the new default look',
      },
    ],
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/**
 * The refusal for a default variant that would move on a set whose
 * library's export names name no looks. The icons' exports stay as they
 * are on every path, so only another variant gives them another look.
 * @param {string} name
 * @param {number} count the set's icons
 * @param {string} current the set's default variant
 * @param {Looks} looks
 */
function unencodedMove(name, count, current, looks) {
  const variants = [...new Set([current, ...looks.variants])];
  return new AstryxError(
    `Icon set "${name}" can't move its default variant from "${current}" to "${looks.default}": its icons' export names name no looks, so each of its ${count} icons draws "${current}", the look its icons' module draws. Keep "${current}" as the default, declare "${looks.default}" as a variant, and add it from the module that draws it (fill <module> with that module).`,
    [
      {
        name: `astryx experimental icon new-set ${name} --variants ${variants.join(',')} --default-variant ${current}`,
        reason: `declare ${looks.default} as a variant and keep ${current} as the default`,
      },
      {
        name: `astryx experimental icon add --variant ${looks.default} --from <module> --all --set ${name}`,
        reason: `give each icon its ${looks.default} look from the module that draws it`,
      },
    ],
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/**
 * The refusal for `--variants` that leave out the default variant of a set
 * whose library's export names name no looks. Its icons keep their exports,
 * so they still draw the default, and the set must keep declaring it.
 * @param {string} name
 * @param {number} count the set's icons
 * @param {string} current the set's default variant
 * @param {Looks} looks
 * @param {string} from ` --from <module>` on a refresh, else empty
 */
function droppedDefault(name, count, current, looks, from) {
  const others = looks.variants.filter(variant => variant !== current);
  return new AstryxError(
    `--variants (${looks.variants.join(', ')}) leaves out "${current}", the default variant of icon set "${name}". Its icons' export names name no looks, so each of its ${count} icons still draws "${current}", the look its icons' module draws. List "${current}" in --variants, and add each other look as a variant from the module that draws it (fill <module> with that module).`,
    [
      {
        name: `astryx experimental icon new-set ${name}${from} --variants ${[current, ...others].join(',')}`,
        reason: `keep ${current}, the look each icon draws, as the default`,
      },
      ...others.map(variant => ({
        name: `astryx experimental icon add --variant ${variant} --from <module> --all --set ${name}`,
        reason: `give each icon its ${variant} look from the module that draws it`,
      })),
    ],
    ERROR_CODES.ERR_INVALID_OPTION,
  );
}

/**
 * The variants and default variant to write for a command that declares
 * looks, and whether the set's icons must move to a new look. Every path
 * that writes `default.variant` uses it:
 *
 * - The drawn look is read from every look word of the exports the set
 *   wraps (`drawn`), or, with no icons from the library yet, is the look
 *   the library is wrapped in by default.
 * - A named default must be a look word the library has.
 * - A named default other than the drawn look moves the icons only on a
 *   refresh (`library` given), where each glyph that has the look takes it;
 *   in place it is refused with the refresh command.
 * - With none named, the default is the drawn look, which `--variants` must
 *   list.
 *
 * A library whose names encode no looks has no look words: there the named
 * variant, the set's current default, or the first variant is the default.
 * Its icons keep their exports on every path, so a set with icons keeps a
 * declared default, `--variants` must list it, and with none declared the
 * command names it.
 * @param {object} args
 * @param {string} args.name the set
 * @param {Looks | null} args.given the variants and default the command names
 * @param {string | undefined} args.current the set's `default.variant`
 * @param {number} args.icons how many icons the set has
 * @param {DrawnLooks | null} args.drawn what the set's icons draw now
 * @param {{module: string, positions: Array<Set<string>>} | null} args.library
 *   the library `--from` wraps; null in place
 * @returns {{looks: Looks | null, moved: boolean}}
 */
export function resolveDefaultLook({
  name,
  given,
  current,
  icons,
  drawn,
  library,
}) {
  if (!given) return {looks: null, moved: false};
  const refresh = library != null;
  const positions =
    library != null ? library.positions : (drawn?.positions ?? []);
  const module = library?.module ?? drawn?.module;
  const now = drawn != null && drawn.positions.length > 0 ? drawn : null;
  if (positions.length === 0) {
    return unencodedDefault({name, given, current, icons, module, refresh});
  }
  if (given.named) {
    const chosen = given.default;
    const index = positions.findIndex(position => position.has(chosen));
    if (index < 0) {
      throw unknownLook(
        chosen,
        '--default-variant',
        /** @type {string} */ (module),
        positions,
      );
    }
    const drawnHere = now?.words[index] ?? null;
    if (now != null && drawnHere != null && drawnHere !== chosen) {
      if (!refresh) {
        throw inPlaceMove(name, now.icons, drawnHere, given, module, current);
      }
      return {looks: given, moved: true};
    }
    return {looks: given, moved: false};
  }
  const words = now != null ? now.words : preferredLook(positions, []);
  const look = drawnWord(positions, words, given.variants);
  if (look == null || !given.variants.includes(look)) {
    const shown = look ?? '<look>';
    throw new AstryxError(
      `None of --variants (${given.variants.join(', ')}) is the look ${now != null ? `the set's ${now.icons} icons draw` : `${module} is wrapped in by default`} ("${shown}"), and each icon's own export draws the default variant. List it in --variants, or name the default with --default-variant.`,
      [
        {
          name: `astryx experimental icon new-set ${name}${refresh ? ` --from ${shellArg(/** @type {string} */ (module))}` : ''} --variants ${[shown, ...given.variants].join(',')}`,
          reason: `declare ${shown}, the look each icon draws, as the default`,
        },
      ],
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
  return {looks: {...given, default: look}, moved: false};
}

/**
 * {@link resolveDefaultLook} for a library whose names encode no looks.
 * @param {{name: string, given: Looks, current: string | undefined, icons: number, module: string | undefined, refresh: boolean}} args
 * @returns {{looks: Looks, moved: boolean}}
 */
function unencodedDefault({name, given, current, icons, module, refresh}) {
  if (given.named) {
    if (current != null && given.default !== current && icons > 0) {
      throw unencodedMove(name, icons, current, given);
    }
    return {looks: given, moved: false};
  }
  if (current != null && given.variants.includes(current)) {
    return {looks: {...given, default: current}, moved: false};
  }
  const from = refresh && module ? ` --from ${shellArg(module)}` : '';
  if (current != null && icons > 0) {
    throw droppedDefault(name, icons, current, given, from);
  }
  if (current == null && icons > 0) {
    throw new AstryxError(
      `Icon set "${name}" declares no default variant, and its icons' export names name none of ${given.variants.join(', ')}. Name the look its ${icons} icons draw with --default-variant.`,
      given.variants.map(variant => ({
        name: `astryx experimental icon new-set ${name}${from} --variants ${given.variants.join(',')} --default-variant ${variant}`,
        reason: `if each icon draws ${variant}`,
      })),
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
  return {looks: given, moved: false};
}

/**
 * The default variant a command that declares `variant` beside the set's
 * variants names: the set's own, else the look its icons draw.
 * @param {LookSet} set
 * @param {DrawnLooks | null} drawn
 * @returns {string | null}
 */
function keptDefault(set, drawn) {
  const current = set.data.default?.variant;
  if (current) return current;
  if (drawn == null || drawn.positions.length === 0) return null;
  return drawnWord(drawn.positions, drawn.words, set.data.variants ?? []);
}

/**
 * The command that declares `variant` beside the set's variants. It names
 * the default variant the set keeps, so it runs as printed.
 * @param {LookSet} set
 * @param {string} variant
 * @param {DrawnLooks | null} drawn
 * @returns {{name: string, reason: string}}
 */
export function declareVariantSuggestion(set, variant, drawn) {
  const kept = keptDefault(set, drawn) ?? '<default>';
  const declared = set.data.variants ?? [];
  const variants = [
    ...new Set([
      ...(declared.includes(kept) ? [] : [kept]),
      ...declared,
      variant,
    ]),
  ];
  return {
    name: `astryx experimental icon new-set ${set.name} --variants ${variants.join(',')} --default-variant ${kept}`,
    reason:
      kept === '<default>'
        ? 'declare the variants; fill <default> with the look the icons draw'
        : 'declare the variants',
  };
}

/**
 * Check that `add --variant` may add `variant` to the set's icons: a look
 * word the library has, not the look each icon's own export draws (the
 * default, declared or drawn), and declared by the set.
 * @param {object} args
 * @param {LookSet} args.set
 * @param {string} args.variant
 * @param {string} args.module the module the variant comes from
 * @param {Array<Set<string>>} args.positions that module's look positions
 * @param {DrawnLooks | null} args.drawn what the set's icons draw now
 */
export function checkVariantLook({set, variant, module, positions, drawn}) {
  if (positions.length > 0 && !positions.some(each => each.has(variant))) {
    throw unknownLook(variant, '--variant', module, positions);
  }
  const drawnPositions = drawn?.positions ?? [];
  const index = drawnPositions.findIndex(each => each.has(variant));
  const drawnHere = index >= 0 ? drawn?.words[index] : null;
  if (set.data.default?.variant === variant || drawnHere === variant) {
    throw new AstryxError(
      `"${variant}" is the look each icon's own export in "${set.name}" already draws${set.data.default?.variant === variant ? ' (its default variant)' : ''}, so a variant of it would export the same artwork twice.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const declared = set.data.variants ?? [];
  if (!declared.includes(variant)) {
    throw new AstryxError(
      `Icon set "${set.name}" declares no variant "${variant}"${declared.length > 0 ? ` (it declares ${declared.join(', ')})` : ''}. Declare it first${keptDefault(set, drawn) == null ? ', and name the look its icons draw now as the default variant in place of <default>' : ''}.`,
      [declareVariantSuggestion(set, variant, drawn)],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set checks of `astryx integration check` and
 * `astryx doctor integration validate` (AST-084 FR12, FR15).
 *
 * For each set under a package's `iconSets` root it proves, without executing
 * anything, that the data file matches the package. The codes below are
 * exactly FR15's table:
 *   errors   `invalid_icon_set` (an invalid descriptor, data file, or
 *            definition file: a duplicate id, an icon with no words, a `map`
 *            key that is neither an Astryx icon definition nor one the set
 *            declares, a `map` value that is not an icon id, or a variant or
 *            default naming a variant the set does not declare);
 *            `icon_builtin_definition_missing`; `icon_module_not_public`;
 *            `icon_not_component`; `icon_export_missing` (an export, the
 *            generated module, or the adapter its module does not have, read
 *            statically with re-exports followed); `icon_module_invalid`;
 *            `icon_generated_types_mismatch`; `icon_theme_map_mismatch` (a
 *            theme map whose keys or values disagree with the built-in
 *            entries of `map`);
 *   warnings `icon_export_name` (an export not named `<Name>Icon`);
 *            `icon_definition_unused` and `icon_definition_shadowed` (a
 *            definition the set declares that `map` leaves out, or that has
 *            an Astryx definition's name); `icon_source_version_drift`;
 *            `icon_license_notice_missing`.
 * An optional (not built-in) Astryx definition the set leaves unmapped is no
 * issue: {@link iconSetCoverage} lists it, never counted, never failing.
 * Only what the static reader proves absent fails. What it cannot judge it
 * lists as not checked, never as an issue (`architecture:cli-surface` INV35,
 * DEC-7): an export whose module is a package `exports` target not built
 * yet; an icon or adapter export it cannot prove either way (behind a
 * re-export it cannot follow, bound to a default or namespace import, or
 * imported from a package that does not resolve); and a theme map or
 * theme-map entry it cannot read.
 *
 * @input A package directory and its loaded integration roots
 * @output Issues in the integration issue format, and the items not checked
 * @position packages/cli/foundation/discovery — read by validate-integration
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findInstalledPackage} from '../fs/paths.mjs';
import {satisfiesRange} from '../env/semver.mjs';
import {
  NOTICE_FILE_RE,
  discoverIconSetDirectory,
  resolveIconModule,
  splitSpecifier,
} from './icon-set-discovery.mjs';
import {inspectPackageExport} from './package-exports.mjs';
import {
  THEME_MAP_NAME,
  entryWiringNote,
  generatedTypesPath,
  otherNamesOf,
  generatedTypesText,
  readGeneratedStatements,
} from './icon-set-writer.mjs';
import {
  exportValueKind,
  aliasedOrigin,
  exportOriginVerdict,
  moduleParseFailure,
  staticExportBindings,
} from './module-exports.mjs';
import {astryxIconDefinitions} from './icon-definition-discovery.mjs';
import {rankIcons} from './icon-ranking.mjs';
import {
  issueError,
  issueWarning,
} from '../integrations/validate-contributions.mjs';

/** @typedef {import('../integrations/issue').AstryxIntegrationIssue} Issue */
/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */

/** An invalid descriptor or data file. */
export const INVALID_ICON_SET = 'invalid_icon_set';
/** An `export` (or module) the package does not provide at runtime. */
export const ICON_EXPORT_MISSING = 'icon_export_missing';
/** A theme map whose keys or values disagree with the built-in `map` entries. */
export const ICON_THEME_MAP_MISMATCH = 'icon_theme_map_mismatch';
/** A built-in definition missing from the set's `map`. */
export const ICON_BUILTIN_DEFINITION_MISSING =
  'icon_builtin_definition_missing';
/** A generated module's declaration file that is missing or out of date. */
export const ICON_GENERATED_TYPES_MISMATCH = 'icon_generated_types_mismatch';
/** A module of the set's package that does not parse. */
export const ICON_MODULE_INVALID = 'icon_module_invalid';
/** An icon read from a module other than the set's package public entry. */
export const ICON_MODULE_NOT_PUBLIC = 'icon_module_not_public';
/** An icon export not named `<Name>Icon`. */
export const ICON_EXPORT_NAME = 'icon_export_name';
/** An icon export that is a literal, not a component. */
export const ICON_NOT_COMPONENT = 'icon_not_component';
/** A definition the set declares whose name is an Astryx definition. */
export const ICON_DEFINITION_SHADOWED = 'icon_definition_shadowed';
/** A definition the set declares that is missing from its `map`. */
export const ICON_DEFINITION_UNUSED = 'icon_definition_unused';
/** Data generated from another upstream version than the package uses. */
export const ICON_SOURCE_VERSION_DRIFT = 'icon_source_version_drift';
/** A set with an upstream and no license notice. */
export const ICON_LICENSE_NOTICE_MISSING = 'icon_license_notice_missing';

/**
 * @param {string} file
 * @returns {Record<string, any> | null}
 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * One item a check could not judge: listed, never counted, never failing.
 * @typedef {object} IconSetUnchecked
 * @property {string} [icon] the icon whose export was not checked
 * @property {string} [entry] the theme-map entry that was not checked
 * @property {string} [adapter] the adapter export that was not checked
 * @property {string} reason why, and what would let the check judge it
 */

/**
 * Every icon-set issue of one integration package.
 * @param {string} packageDir
 * @param {{name: string, iconSets?: string}} loaded
 * @param {Map<string, IconSetUnchecked[]>} [unchecked] filled, by set name,
 *   with what the checks could not judge
 * @returns {Issue[]}
 */
export function iconSetIssues(packageDir, loaded, unchecked = new Map()) {
  if (!loaded.iconSets) return [];
  /** @type {Issue[]} */
  const issues = [];
  const found = discoverIconSetDirectory(loaded.iconSets, loaded.name);
  for (const each of found.errors) {
    issues.push(issueError(INVALID_ICON_SET, each.message));
  }
  const pkg = readJson(path.join(packageDir, 'package.json')) ?? {};
  for (const set of found.sets) {
    /** @type {IconSetUnchecked[]} */
    const notChecked = [];
    issues.push(
      ...checkContract({...set, packageDir}, loaded.name, pkg, notChecked),
    );
    issues.push(...checkDefinitions(set));
    // A module that does not parse hides every export behind it: report it
    // once instead of one missing export per icon.
    const broken = unparsedModule(set, packageDir, loaded.name);
    if (broken) issues.push(broken);
    else issues.push(...checkExports(set, packageDir, loaded.name, notChecked));
    if (notChecked.length > 0) unchecked.set(set.name, notChecked);
    issues.push(...checkUpstream(set, packageDir, pkg));
  }
  return issues;
}

/**
 * The set's module, its relative re-exports, or its generated module, when
 * one does not parse: one error naming the file and the parser's message.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {string} packageName
 * @returns {Issue | null}
 */
function unparsedModule(set, packageDir, packageName) {
  const entry = resolveIconModule(set.data.module, packageDir, {
    name: packageName,
    dir: packageDir,
  });
  const files = [
    ...(entry ? [entry] : []),
    ...(set.data.generated
      ? [path.join(packageDir, set.data.generated)].filter(file =>
          fs.existsSync(file),
        )
      : []),
  ];
  for (const file of files) {
    const failure = moduleParseFailure(file);
    if (failure) {
      return issueError(
        ICON_MODULE_INVALID,
        `Icon set "${set.name}": ${path.relative(packageDir, failure.file).split(path.sep).join('/')} does not parse (${failure.message}), so its exports cannot be read. Fix the file; for the generated icons module, delete the broken lines and run \`astryx experimental icon add\` again.`,
      );
    }
  }
  return null;
}

/**
 * The icon export contract of one set: every icon and variant is read from
 * the package's public entry (its name, or one of its `exports` subpaths),
 * and named `<Name>Icon`; a declared generated module and adapter exist.
 * @param {DiscoveredIconSet} set
 * @param {string} packageName
 * @param {Record<string, any>} pkg
 * @param {IconSetUnchecked[]} unchecked filled with what it cannot judge
 * @returns {Issue[]}
 */
function checkContract(set, packageName, pkg, unchecked) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const packageDir = /** @type {string} */ (set.packageDir);
  /**
   * Is `module` the package itself, or a subpath its `exports` map exposes
   * (pattern keys such as `./*` included)? With no `exports`, only the
   * package name is public.
   * @param {string} module
   */
  const isPublic = module => {
    if (module === packageName) return true;
    const {name, subpath} = splitSpecifier(module);
    if (name !== packageName || pkg.exports === undefined) return false;
    return inspectPackageExport(pkg, packageDir, subpath).exported;
  };
  /** @param {string} module @param {string} what */
  const checkModule = (module, what) => {
    if (!isPublic(module)) {
      issues.push(
        issueError(
          ICON_MODULE_NOT_PUBLIC,
          `${label}: ${what} is read from "${module}", which is not ${packageName} or one of its package.json "exports" subpaths. Every icon is a named export of the set's own package; re-export it there (\`astryx experimental icon add\` does this).`,
        ),
      );
    }
  };
  /** @param {string} name @param {string} what */
  const checkName = (name, what) => {
    if (!/^[A-Z][A-Za-z0-9]*Icon$/u.test(name)) {
      issues.push(
        issueWarning(
          ICON_EXPORT_NAME,
          `${label}: ${what} is exported as "${name}"; icon exports are named <Name>Icon, such as TrashIcon.`,
        ),
      );
    }
  };
  checkModule(set.data.module, 'the set');
  for (const icon of set.data.icons) {
    if (icon.module && icon.module !== set.data.module) {
      checkModule(icon.module, `icon "${icon.id}"`);
    }
    checkName(icon.export, `icon "${icon.id}"`);
    for (const variant of icon.variants ?? []) {
      if (
        variant.module &&
        variant.module !== (icon.module ?? set.data.module)
      ) {
        checkModule(variant.module, `a variant of icon "${icon.id}"`);
      }
      checkName(variant.export, `a variant of icon "${icon.id}"`);
    }
  }
  if (set.data.generated) {
    const file = path.join(packageDir, set.data.generated);
    const typesRel = generatedTypesPath(set.data.generated);
    if (fs.existsSync(file) && typesRel) {
      const typesFile = path.join(packageDir, typesRel);
      let expected = null;
      try {
        expected = generatedTypesText(
          readGeneratedStatements(
            fs.readFileSync(file, 'utf-8'),
            set.data.generated,
          ),
        );
      } catch {
        // A module that does not parse is reported on its own.
      }
      const actual = fs.existsSync(typesFile)
        ? fs.readFileSync(typesFile, 'utf-8')
        : null;
      // The header comment is the writer's, and changes between releases;
      // the declarations are what must match.
      const code = (/** @type {string} */ text) =>
        text
          .split('\n')
          .filter(line => !line.startsWith('//'))
          .join('\n');
      if (
        expected != null &&
        (actual == null || code(actual) !== code(expected))
      ) {
        issues.push(
          issueError(
            ICON_GENERATED_TYPES_MISMATCH,
            `${label}: ${typesRel} ${actual == null ? 'is missing' : 'does not match its generated module'}. Run \`astryx experimental icon map\` or \`astryx experimental icon add\` to rewrite it, or restore it from the generated module's exports.`,
          ),
        );
      }
    }
    if (!fs.existsSync(file)) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: its generated icons module "${set.data.generated}" does not exist. Run \`astryx experimental icon add\` for each icon, or remove "generated".`,
        ),
      );
    }
  }
  if (set.data.adapter) {
    const {module, export: name} = set.data.adapter;
    const file = resolveFile(path.join(packageDir, module));
    const found = file ? exportOriginVerdict(file, name) : null;
    if (found?.verdict === 'unknown') {
      // The reader cannot prove it either way: listed, never failed.
      unchecked.push({adapter: name, reason: found.reason});
    } else if (!found || found.verdict === 'lacks') {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: its adapter "${name}" from "${module}" does not exist. Export the function there, or fix "adapter".`,
        ),
      );
    }
  }
  return issues;
}

/** @param {string} base */
function resolveFile(base) {
  for (const candidate of [
    base,
    ...['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.mts'].map(
      extension => `${base}${extension}`,
    ),
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next.
    }
  }
  return null;
}

/**
 * The definition checks of one set's `map`: every built-in definition mapped
 * (error), and each definition the set declares mapped and not already an
 * Astryx definition (warnings). Another unmapped Astryx definition is not an
 * issue: a library need not draw every definition, so it is listed in
 * {@link iconSetCoverage} instead and never fails a check.
 * @param {DiscoveredIconSet} set
 * @returns {Issue[]}
 */
function checkDefinitions(set) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const mapped = new Set(Object.keys(set.data.map ?? {}));
  const astryx = astryxIconDefinitions().definitions.map(each => each.doc);
  for (const doc of astryx) {
    if (mapped.has(doc.name) || !doc.builtIn) continue;
    const suggestion = suggestIcon(set, doc);
    const hint = suggestion
      ? ` Suggested: astryx experimental icon map ${doc.name} ${suggestion.icon}.`
      : '';
    issues.push(
      issueError(
        ICON_BUILTIN_DEFINITION_MISSING,
        `${label} maps no icon to the built-in icon definition "${doc.name}" (${doc.description} Words: ${doc.words.join(', ')}.). Every set maps every built-in definition: run \`astryx experimental icon map ${doc.name} <icon id>\` with the icon that draws it${findHint(set, doc)}.${hint}`,
      ),
    );
  }
  const names = new Set(astryx.map(doc => doc.name));
  for (const {doc} of set.definitions) {
    if (names.has(doc.name)) {
      issues.push(
        issueWarning(
          ICON_DEFINITION_SHADOWED,
          `${label} declares the icon definition "${doc.name}", which Astryx now has. Map your icon to Astryx's definition and remove definitions/${doc.name}.doc.mjs; Astryx's is the one templates use.`,
        ),
      );
    } else if (!mapped.has(doc.name)) {
      const suggestion = suggestIcon(set, doc);
      issues.push(
        issueWarning(
          ICON_DEFINITION_UNUSED,
          `${label} declares the icon definition "${doc.name}", but "map" names no icon for it. Map it with \`astryx experimental icon map ${doc.name} <icon id>\`, or remove definitions/${doc.name}.doc.mjs.${suggestion ? ` Suggested: astryx experimental icon map ${doc.name} ${suggestion.icon}.` : ''}`,
        ),
      );
    }
  }
  return issues;
}

/**
 * @typedef {object} IconSetCoverage
 * @property {string} set the set's name
 * @property {Array<{name: string, description: string, words: string[]}>} unmappedDefinitions
 *   Astryx's optional (not built-in) definitions the set's `map` does not
 *   name. Mapping them is optional, so they never fail a check.
 * @property {Array<{definition: string, icon: string}>} suggestions for every
 *   unmapped definition, built-in, optional, or the set's own, the best icon
 *   {@link suggestedIcons} gives, if any
 * @property {IconSetUnchecked[]} unchecked what the checks could not judge:
 *   never counted, never failing, even under `--strict`
 */

/**
 * Which icon definitions each valid set under a package's
 * `experimental.iconSets` root leaves unmapped, and the icons that fit them.
 * Reported beside the issues, never as one (spec:AST-084 FR15).
 * @param {{name: string, iconSets?: string}} loaded
 * @param {Map<string, IconSetUnchecked[]>} [unchecked] what
 *   {@link iconSetIssues} could not judge, by set name
 * @returns {IconSetCoverage[]}
 */
export function iconSetCoverage(loaded, unchecked = new Map()) {
  if (!loaded.iconSets) return [];
  const found = discoverIconSetDirectory(loaded.iconSets, loaded.name);
  const astryx = astryxIconDefinitions().definitions.map(each => each.doc);
  const names = new Set(astryx.map(doc => doc.name));
  return found.sets.map(set => {
    const mapped = new Set(Object.keys(set.data.map ?? {}));
    const unmapped = [
      ...astryx,
      ...set.definitions
        .map(each => each.doc)
        .filter(doc => !names.has(doc.name)),
    ].filter(doc => !mapped.has(doc.name));
    return {
      set: set.name,
      unmappedDefinitions: unmapped
        .filter(doc => names.has(doc.name) && !doc.builtIn)
        .map(doc => ({
          name: doc.name,
          description: doc.description,
          words: [...doc.words],
        })),
      suggestions: unmapped.flatMap(doc => {
        const suggestion = suggestIcon(set, doc);
        return suggestion
          ? [{definition: doc.name, icon: suggestion.icon}]
          : [];
      }),
      unchecked: unchecked.get(set.name) ?? [],
    };
  });
}

/**
 * The best icon {@link suggestedIcons} gives for a definition, or null when
 * it gives none.
 * @param {DiscoveredIconSet} set
 * @param {import('../../authoring/doctypes/icon-definition/type').IconDefinitionDoc} doc
 * @returns {{map: string, icon: string} | null}
 */
export function suggestIcon(set, doc) {
  const [first] = suggestedIcons(set, doc);
  return first ? {map: doc.name, icon: first.icon} : null;
}

/**
 * Words that turn an icon into the opposite or a variation of its first
 * words: `lock-open`, `bell-off`, `video-camera-slash`, `audio-lines-x`.
 */
const NEGATING_WORDS = new Set([
  'off',
  'slash',
  'x',
  'open',
  'minus',
  'ban',
  'dashed',
  'dot',
  'code',
  'formatting',
  'exclamation',
  'question',
  'warning',
]);

/** Direction words that mean the other way. */
/** @type {Record<string, string>} */
const OPPOSITES = {
  horizontal: 'vertical',
  vertical: 'horizontal',
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
  in: 'out',
  out: 'in',
};

/**
 * A second id word that only sizes, shapes, or numbers the first: a number
 * or dimension (`2`, `3x3`), or one of a few style words. The icon then
 * still draws what its first word names.
 */
const QUALIFIER_RE =
  /^(?:\d+(?:x\d+)?|circle|square|small|big|large|alt|horizontal|vertical)$/u;

/** How many icons one definition is suggested at most. */
export const SUGGESTIONS_PER_DEFINITION = 3;

/**
 * The icons a definition might map to, best first, at most three, in the
 * order AST-084 FR13 gives: the name in another spelling, an icon the library
 * gives the name as another name, ids that start with the name (`video` →
 * `video-camera`, never `close` → `panel-left-close`), an id that is one of
 * its words (`delete` → `trash`), another name that is one of its words, and
 * two-word ids that are a one-word word sized, shaped, or numbered
 * (`grid-2x2`). An icon `map` already names
 * for another definition, or whose id is another definition's name, is left
 * out: it has a meaning of its own. Never a negated form or the opposite
 * direction, and never a guess from parts of words.
 * @param {{data: {icons: Array<{id: string, words?: string[]}>, map?: Record<string, string>}, definitions?: Array<{doc: {name: string}}>}} set
 * @param {{name: string, words: string[]}} doc
 * @returns {Array<{icon: string, word: string}>}
 */
export function suggestedIcons(set, doc) {
  const toId = (/** @type {string} */ name) =>
    name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();
  const nameId = toId(doc.name);
  const nameWords = nameId.split('-').map(stem);
  const map = set.data.map ?? {};
  const taken = new Set([
    ...Object.entries(map)
      .filter(([name]) => name !== doc.name)
      .map(([, id]) => id),
    ...[...astryxIconDefinitions().definitions, ...(set.definitions ?? [])]
      .map(each => toId(each.doc.name))
      .filter(id => id !== nameId),
  ]);
  const wordIds = doc.words.map(word =>
    word.trim().toLowerCase().replace(/\s+/gu, '-'),
  );
  // Every word the definition is known by, stemmed: its name's and its words'.
  const meaning = new Set([
    ...nameWords,
    ...wordIds.flatMap(id => id.split('-')).map(stem),
  ]);
  const icons = set.data.icons.map(icon => ({
    id: icon.id,
    words: icon.id.split('-').map(stem),
    raw: icon.id.split('-'),
    // The library's other names for it, the same ones `map` accepts.
    other: otherNamesOf(icon),
  }));
  /** How many of the definition's words an id has: more is a better fit. */
  const fit = (/** @type {string[]} */ words) =>
    words.filter(word => meaning.has(word)).length;
  /**
   * Candidates best first: most of the definition's words, then fewest
   * extra words, then by id.
   * @param {typeof icons} list
   */
  const ranked = list =>
    [...list].sort(
      (a, b) =>
        fit(b.words) - fit(a.words) ||
        a.words.length - b.words.length ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  // An id that turns the definition around (`ellipsis-vertical` for
  // moreHorizontal) is never its icon.
  const opposite = new Set(
    nameWords.flatMap(word => (OPPOSITES[word] ? [OPPOSITES[word]] : [])),
  );
  const negated = (/** @type {string[]} */ words) =>
    words.some(word => NEGATING_WORDS.has(word) || opposite.has(word));
  /** @type {Array<{icon: string, word: string}>} */
  const found = [];
  const add = (/** @type {string} */ icon, /** @type {string} */ word) => {
    if (taken.has(icon) || found.some(each => each.icon === icon)) return;
    found.push({icon, word});
  };
  const squashed = nameId.replace(/-/gu, '');
  // 1. The name itself, spelled with or without hyphens or a plural
  //    (`lightbulb` → `light-bulb`, `language` → `languages`).
  for (const icon of icons) {
    if (
      icon.id === nameId ||
      icon.id.replace(/-/gu, '') === squashed ||
      (icon.words.length === nameWords.length &&
        icon.words.every((word, index) => word === nameWords[index]))
    ) {
      add(icon.id, nameId);
    }
  }
  // 2. An icon the library once named after the definition, or that it
  //    gives the definition's name as another name (Lucide's
  //    `more-horizontal` on `ellipsis`, `unlock` on `lock-open`).
  for (const icon of icons) {
    if (icon.other.includes(nameId)) add(icon.id, nameId);
  }
  // 3. Ids that start with the name as written (`video` → `video-camera`),
  //    never a negated form. A plural is not the same start: `users` is not
  //    `user-plus`, and `apps` is not `app-window`.
  const nameRaw = nameId.split('-');
  ranked(
    icons.filter(
      icon =>
        icon.raw.length > nameRaw.length &&
        nameRaw.every((word, index) => icon.raw[index] === word) &&
        !negated(icon.raw.slice(nameRaw.length)),
    ),
  ).forEach(icon => add(icon.id, nameId));
  // 4. An icon whose whole id is one of the definition's words.
  for (const id of wordIds) {
    if (icons.some(icon => icon.id === id)) add(id, id.replace(/-/gu, ' '));
  }
  // 5. Another name the library gives an icon that is one of the
  //    definition's words (Lucide's `smile` on `face-slightly-smiling`).
  for (const [index, id] of wordIds.entries()) {
    for (const icon of icons) {
      if (icon.other.includes(id)) add(icon.id, doc.words[index]);
    }
  }
  // 6. Last, two-word ids that are a one-word word with only a size, shape,
  //    or number after it (`columns` → `columns-3`, `plus` → `plus-circle`,
  //    `grid` → `grid-2x2`), best fit first. Any other second word names
  //    another thing (`card-sim`, `fast-forward`, `hand-coins`), so it is
  //    never suggested from a word alone.
  for (const word of doc.words) {
    if (!/^[a-z]{3,}$/u.test(word)) continue;
    ranked(
      icons.filter(
        icon =>
          icon.raw.length === 2 &&
          icon.raw[0] === word &&
          icon.raw[1] !== word &&
          QUALIFIER_RE.test(icon.raw[1]) &&
          !negated(icon.raw.slice(1)),
      ),
    ).forEach(icon => add(icon.id, word));
  }
  return found.slice(0, SUGGESTIONS_PER_DEFINITION);
}

/**
 * A word in its singular form, so a plural meets its singular and nothing
 * else: `languages` meets `language`, `arrows` meets `arrow`. Only a
 * trailing plural `s` comes off (not `ss`, and not from a short word); a
 * verb ending never does, so `drafting` never meets `draft`.
 * @param {string} word
 */
function stem(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * The change that makes a set's generated module part of its package's
 * entry ({@link entryWiringNote}), or null when the entry exports its theme
 * map or any of its icons, the set has no generated module on disk, or the
 * entry is an `exports` target not built yet (listed as not checked).
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {string} packageName
 * @param {(specifier: string) => string | null} unbuiltTarget
 * @returns {string | null}
 */
function entryNotWired(set, packageDir, packageName, unbuiltTarget) {
  const generated = set.data.generated;
  if (!generated || !fs.existsSync(path.join(packageDir, generated))) {
    return null;
  }
  if (splitSpecifier(set.data.module).name !== packageName) return null;
  if (unbuiltTarget(set.data.module)) return null;
  const pkg = readJson(path.join(packageDir, 'package.json'));
  if (!pkg) return null;
  const note = entryWiringNote(packageDir, pkg, generated, {
    module: set.data.module,
    name: set.data.themeMap ?? THEME_MAP_NAME,
  });
  if (!note) return null;
  const entry = resolveIconModule(set.data.module, packageDir, {
    name: packageName,
    dir: packageDir,
  });
  const someIcon =
    entry &&
    set.data.icons.some(
      icon =>
        (icon.module ?? set.data.module) === set.data.module &&
        exportOriginVerdict(entry, icon.export)?.verdict !== 'lacks',
    );
  return someIcon ? null : note;
}

/**
 * The export and theme-map checks of one set.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {string} packageName
 * @param {IconSetUnchecked[]} unchecked filled with what it cannot judge
 * @returns {Issue[]}
 */
function checkExports(set, packageDir, packageName, unchecked) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  /** @type {Map<string, string | null>} */
  const files = new Map();
  /** @param {string} specifier */
  const fileOf = specifier => {
    if (!files.has(specifier)) {
      files.set(
        specifier,
        resolveIconModule(specifier, packageDir, {
          name: packageName,
          dir: packageDir,
        }),
      );
    }
    return /** @type {string | null} */ (files.get(specifier));
  };
  /**
   * The `exports` target a specifier of this package declares when its file
   * is not there yet, as before a build; null otherwise.
   * @param {string} specifier
   */
  const unbuiltTarget = specifier => {
    const {name, subpath} = splitSpecifier(specifier);
    if (name !== packageName) return null;
    const pkg = readJson(path.join(packageDir, 'package.json'));
    if (!pkg || pkg.exports === undefined) return null;
    const found = inspectPackageExport(pkg, packageDir, subpath);
    return found.exported && found.authoredTarget && !found.target
      ? found.authoredTarget
      : null;
  };
  /** @type {Map<string, {file: string, name: string} | null>} */
  const origins = new Map();
  /**
   * The origin of one export, or an issue when its module lacks it. What it
   * cannot judge it lists as not checked.
   * @param {string} specifier
   * @param {string} name
   * @param {string} what
   * @param {Omit<IconSetUnchecked, 'reason'>} subject
   * @param {boolean} [component] whether the export must be a component
   */
  const originOf = (specifier, name, what, subject, component = true) => {
    const key = `${specifier}\0${name}`;
    if (origins.has(key)) return origins.get(key) ?? null;
    const file = fileOf(specifier);
    const found = file ? exportOriginVerdict(file, name) : null;
    const origin = found?.verdict === 'exports' ? found.origin : null;
    origins.set(key, origin);
    const unbuilt = file ? null : unbuiltTarget(specifier);
    if (unbuilt) {
      unchecked.push({
        ...subject,
        reason: `${what} is read from "${specifier}", whose exports target ${unbuilt} is not there yet; build the package and run the check again.`,
      });
    } else if (!file) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: ${what} is read from "${specifier}", which does not resolve from the package. Fix "module" in ${set.name}.icons.json, or add the subpath to package.json "exports".`,
        ),
      );
    } else if (found?.verdict === 'unknown') {
      // Only an export the reader proves absent fails; anything it cannot
      // prove is listed (architecture:cli-surface INV35, DEC-7).
      unchecked.push({
        ...subject,
        reason: `${what} names export "${name}" of "${specifier}", which this check could not prove: ${found.reason}`,
      });
    } else if (!origin) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: ${what} names export "${name}", which "${specifier}" does not export at runtime. Export it, or fix the name in ${set.name}.icons.json.`,
        ),
      );
    } else if (component && exportValueKind(file, name) === 'data') {
      issues.push(
        issueError(
          ICON_NOT_COMPONENT,
          `${label}: ${what} names export "${name}", which is a value, not a component. Export a React component, or add it with \`astryx experimental icon add\` and declare an "adapter" that turns it into one.`,
        ),
      );
    }
    return origin;
  };

  // The theme map is keyed by the built-in definitions in `map`: the shared
  // names Core renders.
  const builtIn = new Set(
    astryxIconDefinitions()
      .definitions.filter(definition => definition.doc.builtIn)
      .map(definition => definition.doc.name),
  );
  // A generated module the package's entry does not export yet: one finding
  // with the exact change \`new-set\` names in its receipt, not one per icon.
  const wiring = entryNotWired(set, packageDir, packageName, unbuiltTarget);
  if (wiring) {
    issues.push(
      issueError(
        ICON_EXPORT_MISSING,
        `${label}: its icons are not exported from "${set.data.module}" yet. ${wiring}`,
      ),
    );
  }
  /** @type {Map<string, {file: string, name: string} | null>} */
  const iconOrigins = new Map();
  for (const icon of set.data.icons) {
    const module = icon.module ?? set.data.module;
    if (wiring && module === set.data.module) continue;
    iconOrigins.set(
      icon.id,
      originOf(module, icon.export, `icon "${icon.id}"`, {icon: icon.id}),
    );
    for (const variant of icon.variants ?? []) {
      originOf(
        variant.module ?? module,
        variant.export,
        `a variant of icon "${icon.id}"`,
        {icon: icon.id},
      );
    }
  }

  /** @type {Map<string, {id: string, origin: {file: string, name: string} | null}>} */
  const fillers = new Map();
  for (const [name, id] of Object.entries(set.data.map ?? {})) {
    if (builtIn.has(name)) {
      fillers.set(name, {id, origin: iconOrigins.get(id) ?? null});
    }
  }
  const themeMap = set.data.themeMap;
  if (fillers.size === 0) return issues;
  if (!themeMap) {
    issues.push(
      issueError(
        ICON_THEME_MAP_MISMATCH,
        `${label} maps the built-in icon definitions ${[...fillers.keys()].join(', ')} but names no "themeMap". Export an object keyed by exactly those names and name it in ${set.name}.icons.json.`,
      ),
    );
    return issues;
  }
  if (wiring) return issues;
  const mapOrigin = originOf(
    set.data.module,
    themeMap,
    `the theme map`,
    {entry: themeMap},
    false,
  );
  const file = fileOf(set.data.module);
  if (!mapOrigin || !file) return issues;
  const bindings = staticExportBindings(file, themeMap);
  // A theme map built at runtime cannot be read, so it is not checked.
  if (!bindings) {
    unchecked.push({
      entry: themeMap,
      reason: `Theme map "${themeMap}" is not one object literal the static reader can read, so none of its entries were checked. Export it as \`export const ${themeMap} = {...}\` to have it checked.`,
    });
    return issues;
  }
  for (const key of bindings.keys()) {
    if (!fillers.has(key)) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" has "${key}", which "map" does not map. Remove it, or add "${key}" to "map" with the id of the icon that draws it.`,
        ),
      );
    }
  }
  for (const [name, filler] of fillers) {
    if (!bindings.has(name)) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" has no "${name}", which "map" maps to icon "${filler.id}". Add it.`,
        ),
      );
      continue;
    }
    const value = bindings.get(name);
    if (!value) {
      unchecked.push({
        entry: name,
        reason: `Theme map "${themeMap}" has an entry for "${name}" the static reader cannot read. Write it as the icon's binding (${name}: TrashIcon), an element (<TrashIcon />), or createElement(TrashIcon) to have it checked.`,
      });
      continue;
    }
    if (!filler.origin) continue;
    // Compare the bindings each finally names: \`const XIcon = X\` is X. A
    // mismatch is reported only when both are followed to their declarations.
    const mapped = aliasedOrigin(value);
    const drawn = aliasedOrigin(filler.origin);
    if (!mapped || !drawn) {
      unchecked.push({
        entry: name,
        reason: `Theme map "${themeMap}" maps "${name}" through an alias the static reader cannot follow to its declaration, so it was not compared with icon "${filler.id}". Point it at the icon's export, or alias a binding declared in this package.`,
      });
      continue;
    }
    if (mapped.file !== drawn.file || mapped.name !== drawn.name) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" maps "${name}" to other artwork than icon "${filler.id}", which "map" names for it. Point it at the icon's export.`,
        ),
      );
    }
  }
  return issues;
}

/** The lowest search score a find hint needs: a whole word or a word start. */
const FIND_FLOOR = 60;

/**
 * A search that finds icons for a definition in the set, named only when it
 * answers: the definition's name, then each of its words, as a query against
 * the set's icon ids and words. Empty when none answers, so the message never
 * names a search that finds nothing.
 * @param {DiscoveredIconSet} set
 * @param {{name: string, words: string[]}} doc
 */
function findHint(set, doc) {
  const queries = [
    doc.name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase(),
    ...doc.words,
  ];
  for (const query of queries) {
    const found = rankIcons([set], query).filter(
      each => each.score >= FIND_FLOOR,
    );
    if (found.length > 0) {
      return ` (icons matching "${query}": \`astryx experimental icon ${query} --set ${set.name}\`)`;
    }
  }
  return ' (no icon in the set has its name or words: pick the library icon that draws it; if the library has none, map the closest, or add your own artwork with `astryx experimental icon add <Name> --from ./src/icons/<name>.js --definition <definition>`)';
}

/**
 * The upstream checks of one set: version drift and license notices.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {Record<string, any>} pkg
 * @returns {Issue[]}
 */
function checkUpstream(set, packageDir, pkg) {
  const source = set.data.source;
  if (!source) return [];
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const range = ['dependencies', 'peerDependencies', 'optionalDependencies']
    .map(field => pkg[field]?.[source.package])
    .find(value => typeof value === 'string');
  const installedDir = findInstalledPackage(
    packageDir,
    source.package,
    Infinity,
  );
  const installed = installedDir
    ? readJson(path.join(installedDir, 'package.json'))?.version
    : undefined;
  if (typeof installed === 'string' && installed !== source.version) {
    issues.push(
      issueWarning(
        ICON_SOURCE_VERSION_DRIFT,
        `${label} was generated from ${source.package}@${source.version}, but the package resolves ${source.package}@${installed}. Refresh it: \`astryx experimental icon new-set ${set.name} --from <the ${source.package} module it wraps>\`, then rerun any \`add --variant … --all\`.`,
      ),
    );
  } else if (
    installed == null &&
    range != null &&
    !safeSatisfies(source.version, range)
  ) {
    issues.push(
      issueWarning(
        ICON_SOURCE_VERSION_DRIFT,
        `${label} was generated from ${source.package}@${source.version}, but the package depends on ${source.package}@${range}. Refresh it: \`astryx experimental icon new-set ${set.name} --from <the ${source.package} module it wraps>\`, then rerun any \`add --variant … --all\`.`,
      ),
    );
  }
  const rootNotices = safeList(packageDir).filter(name =>
    NOTICE_FILE_RE.test(name),
  );
  if (set.notices.length === 0 && rootNotices.length === 0) {
    issues.push(
      issueWarning(
        ICON_LICENSE_NOTICE_MISSING,
        `${label} is generated from ${source.package} but ships no license notice. Copy the library's LICENSE (and NOTICE, if any) into the set directory or the package root.`,
      ),
    );
  }
  return issues;
}

/** @param {string} version @param {string} range */
function safeSatisfies(version, range) {
  try {
    return satisfiesRange(version, range);
  } catch {
    // A range this reader cannot judge is not reported.
    return true;
  }
}

/** @param {string} dir */
function safeList(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon definition discovery (AST-084): every definition file in a definitions
 * folder, read statically and checked as an IconDefinitionDoc.
 *
 * Astryx's own definitions are the files in the CLI's `assets/icons/definitions`
 * folder. An icon set adds its own in `<set>/definitions`. There is no index
 * file and no list: discovery reads every `<name>.doc.mjs` in the folder,
 * and the file name must equal the definition's `name`.
 *
 * @input A definitions folder and the package that ships it
 * @output The definitions, and the files that did not read
 * @position packages/cli/foundation/discovery — the definition seam every icon
 *   surface reads
 */

import * as path from 'node:path';
import {parseIconDefinition} from '../../authoring/doctypes/icon-definition/parse.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {listDirEntries} from '../fs/listing-cache.mjs';
import {readStaticDescriptorValue} from './theme-discovery.mjs';
import {compareText} from '../text/compare-text.mjs';
import {ReplacementAliases} from './replacement-aliases.mjs';

/** @typedef {import('../../authoring/doctypes/icon-definition/type').IconDefinitionDoc} IconDefinitionDoc */

/** The folder Astryx's own definitions live in. */
export const ASTRYX_DEFINITIONS_DIR = path.join(
  CLI_ROOT,
  'assets',
  'icons',
  'definitions',
);

/** The package that ships Astryx's definitions. */
export const ASTRYX_DEFINITIONS_PACKAGE = '@astryxdesign/cli';

/**
 * One definition, with the file and package it came from.
 * @typedef {object} DiscoveredIconDefinition
 * @property {IconDefinitionDoc} doc
 * @property {string} file absolute path
 * @property {string} package the package that ships it
 */

/**
 * Read every definition file in one folder, without executing any.
 * @param {string} dir
 * @param {string} owner the package that ships the folder
 * @returns {{definitions: DiscoveredIconDefinition[], errors: Array<{file: string, message: string}>}}
 */
export function readDefinitionsDir(dir, owner) {
  /** @type {DiscoveredIconDefinition[]} */
  const definitions = [];
  /** @type {Array<{file: string, message: string}>} */
  const errors = [];
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = listDirEntries(dir);
  } catch {
    return {definitions, errors};
  }
  for (const entry of entries.sort((a, b) => compareText(a.name, b.name))) {
    if (!entry.name.endsWith('.doc.mjs')) continue;
    const file = path.join(dir, entry.name);
    const label = `Icon definition ${entry.name} in ${owner}`;
    try {
      if (!entry.isFile()) {
        throw new Error(`${label} must be a regular file.`);
      }
      const doc = parseIconDefinition(
        readStaticDescriptorValue(file, label, 'IconDefinitionDoc', {
          data: true,
        }),
        label,
      );
      const stem = entry.name.slice(0, -'.doc.mjs'.length);
      if (doc.name !== stem) {
        throw new Error(
          `${label} names "${doc.name}"; a definition file is named after its definition (${doc.name}.doc.mjs).`,
        );
      }
      definitions.push({doc, file, package: owner});
    } catch (error) {
      errors.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {definitions, errors};
}

/**
 * One folder's definitions after `replaces`: the current ones, the ones a
 * later definition replaced, and the old names that now answer with a
 * current definition.
 * @typedef {object} IconDefinitionFolder
 * @property {DiscoveredIconDefinition[]} definitions the current definitions
 * @property {DiscoveredIconDefinition[]} replaced definitions whose name a
 *   later definition took over: their files keep their own old names
 *   answering through the chain, and they are not definitions any more
 * @property {ReplacementAliases} aliases each old name, pointing at the
 *   definition that replaced it
 * @property {Array<{file: string, message: string}>} errors
 */

/**
 * Apply each definition's `replaces` to one folder's definitions. A name
 * replaced twice answers with the newest definition: a replaced
 * definition's file may stay, so its own old names keep answering too. One
 * name has one successor, a built-in definition is never replaced (Core
 * renders it by name), and every chain ends at a current definition.
 * @param {{definitions: DiscoveredIconDefinition[], errors: Array<{file: string, message: string}>}} read
 * @param {Set<string>} [others] names of another folder's definitions, current
 *   or replaced, that this folder never replaces: a set's own definitions
 *   replace only each other, never Astryx's
 * @returns {IconDefinitionFolder}
 */
export function withReplacements({definitions, errors}, others = new Set()) {
  const problems = [...errors];
  const byName = new Map(definitions.map(each => [each.doc.name, each]));
  /** @type {Map<string, string>} replaced name → the definition replacing it */
  const successors = new Map();
  for (const {doc, file} of definitions) {
    const old = doc.replaces;
    if (old == null) continue;
    const earlier = successors.get(old);
    if (earlier != null) {
      problems.push({
        file,
        message: `Icon definition "${doc.name}" replaces "${old}", which "${earlier}" already replaces. A name has one successor.`,
      });
    } else if (others.has(old)) {
      problems.push({
        file,
        message: `Icon definition "${doc.name}" replaces "${old}", an Astryx icon definition. A set's own definition replaces only another of the set's own.`,
      });
    } else if (byName.get(old)?.doc.builtIn) {
      problems.push({
        file,
        message: `Icon definition "${doc.name}" replaces the built-in definition "${old}". A built-in definition is a name Core renders, so nothing replaces it.`,
      });
    } else {
      successors.set(old, doc.name);
    }
  }
  const aliases = new ReplacementAliases();
  for (const [old, next] of successors) aliases.record(old, next);
  const current = definitions.filter(each => !successors.has(each.doc.name));
  const currentNames = new Set(current.map(each => each.doc.name));
  for (const [old, next] of successors) {
    if (aliases.resolve(old, name => currentNames.has(name)) == null) {
      problems.push({
        file: /** @type {DiscoveredIconDefinition} */ (byName.get(next)).file,
        message: `Icon definition "${next}" replaces "${old}", but the chain of replacements from "${old}" never reaches a current definition.`,
      });
    }
  }
  return {
    definitions: current,
    replaced: definitions.filter(each => successors.has(each.doc.name)),
    aliases,
    errors: problems,
  };
}

/** @type {IconDefinitionFolder | undefined} */
let astryx;

/**
 * Astryx's own definitions, read once per process.
 * @returns {IconDefinitionFolder}
 */
export function astryxIconDefinitions() {
  astryx ??= withReplacements(
    readDefinitionsDir(ASTRYX_DEFINITIONS_DIR, ASTRYX_DEFINITIONS_PACKAGE),
  );
  return astryx;
}

/**
 * The current definition a name answers with: the name itself when it is a
 * current definition, else the definition that replaced it, following the
 * chain. A set's own definitions answer first, then Astryx's.
 * @param {string} name
 * @param {{definitions?: Array<{doc: {name: string}}>, definitionAliases?: ReplacementAliases}} [set]
 * @param {Pick<IconDefinitionFolder, 'definitions' | 'aliases'>} [folder]
 *   Astryx's definitions
 * @returns {string | undefined}
 */
export function currentDefinitionName(
  name,
  set,
  folder = astryxIconDefinitions(),
) {
  const own = new Set((set?.definitions ?? []).map(each => each.doc.name));
  if (own.has(name)) return name;
  const fromOwn = set?.definitionAliases?.resolve(name, each => own.has(each));
  if (fromOwn != null) return fromOwn;
  const names = new Set(folder.definitions.map(each => each.doc.name));
  return folder.aliases.resolve(name, each => names.has(each));
}

/**
 * The old names that answer with a definition, the set's own and Astryx's.
 * A stored copy of a set carries its own as `replacedDefinitions`.
 * @param {string} name a current definition
 * @param {{definitionAliases?: ReplacementAliases, replacedDefinitions?: Array<{name: string, definition: string}>}} [set]
 * @returns {string[]}
 */
export function replacedNamesOf(name, set) {
  const own =
    set?.definitionAliases?.aliasesOf(name) ??
    (set?.replacedDefinitions ?? [])
      .filter(each => each.definition === name)
      .map(each => each.name);
  return [...own, ...astryxIconDefinitions().aliases.aliasesOf(name)];
}

/**
 * Every name Astryx's definitions answer to: the current ones and the ones
 * they replaced.
 * @returns {Set<string>}
 */
export function astryxDefinitionNames() {
  const folder = astryxIconDefinitions();
  const names = folder.definitions.map(each => each.doc.name);
  return new Set([
    ...names,
    ...names.flatMap(name => folder.aliases.aliasesOf(name)),
  ]);
}

/**
 * A set's own old definition names as plain data, each with the current
 * definition it answers with, so a stored copy of the set answers them too.
 * @param {{definitions?: Array<{doc: {name: string}}>, definitionAliases?: ReplacementAliases}} set
 * @returns {Array<{name: string, definition: string}>}
 */
export function ownReplacedDefinitions(set) {
  return (set.definitions ?? []).flatMap(({doc}) =>
    (set.definitionAliases?.aliasesOf(doc.name) ?? []).map(name => ({
      name,
      definition: doc.name,
    })),
  );
}

/**
 * How many of Astryx's own definitions a set's `map` covers, of how many.
 * `experimental icon --list` reports it as `coverage.astryx`, and discover
 * prints it on an icon set's page.
 * @param {Iterable<string>} mapped the definitions the set's map covers
 * @returns {{mapped: number, total: number}}
 */
export function astryxDefinitionCoverage(mapped) {
  const covered = new Set(mapped);
  const {definitions} = astryxIconDefinitions();
  return {
    mapped: definitions.filter(each => covered.has(each.doc.name)).length,
    total: definitions.length,
  };
}

/**
 * Astryx's definitions by name.
 * @returns {Map<string, IconDefinitionDoc>}
 */
export function astryxDefinitionsByName() {
  return new Map(
    astryxIconDefinitions().definitions.map(m => [m.doc.name, m.doc]),
  );
}

/**
 * A related definition: one that shares a group with another.
 * @typedef {object} IconDefinitionRelative
 * @property {string} definition the related definition's name
 * @property {string} description what it means
 */

/**
 * The definitions related to `names`: every definition in `docs` that shares a
 * `group` with one of `names` and is not one of them, in `docs` order. The
 * first doc of a name wins, so Astryx's definitions come first in `docs`
 * (spec:AST-084 FR4). Groups are information only: nothing ranks by them.
 * @param {Iterable<string>} names
 * @param {Array<{name: string, description: string, group?: string}>} docs
 * @returns {IconDefinitionRelative[]}
 */
export function definitionRelatives(names, docs) {
  const own = new Set(names);
  /** @type {Map<string, {name: string, description: string, group?: string}>} */
  const byName = new Map();
  for (const doc of docs) if (!byName.has(doc.name)) byName.set(doc.name, doc);
  const groups = new Set();
  for (const name of own) {
    const group = byName.get(name)?.group;
    if (group) groups.add(group);
  }
  if (groups.size === 0) return [];
  return [...byName.values()]
    .filter(
      doc => doc.group != null && groups.has(doc.group) && !own.has(doc.name),
    )
    .map(doc => ({definition: doc.name, description: doc.description}));
}

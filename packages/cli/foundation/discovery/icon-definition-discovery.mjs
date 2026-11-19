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

/** @type {{definitions: DiscoveredIconDefinition[], errors: Array<{file: string, message: string}>} | undefined} */
let astryx;

/**
 * Astryx's own definitions, read once per process.
 * @returns {{definitions: DiscoveredIconDefinition[], errors: Array<{file: string, message: string}>}}
 */
export function astryxIconDefinitions() {
  astryx ??= readDefinitionsDir(
    ASTRYX_DEFINITIONS_DIR,
    ASTRYX_DEFINITIONS_PACKAGE,
  );
  return astryx;
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

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon placeholders: a bundled template can import each icon
 * by meaning from `@astryxdesign/template-icons` (`DeleteIcon`, one export
 * per icon definition). The import path names the look: the package root is
 * 24 outline, and `/24/solid`, `/20/solid`, `/16/solid` and `/lucide` name the
 * others. One table, assets/icons/template-icons.json, names the library icon
 * that draws each meaning in each look. The placeholder package re-exports
 * those icons, so previews draw them as they are; the CLI reads the same table
 * when it copies a template.
 *
 * Experimental (spec:AST-017 FR27).
 *
 * @input Import paths and export names; the table
 * @output The look, the meaning, and the library icon that draws it
 * @position packages/cli/foundation/discovery — read by the template copy step
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';

/** The package template sources import icon placeholders from. */
export const PLACEHOLDER_MODULE = '@astryxdesign/template-icons';

/** The look the package root draws. */
export const DEFAULT_PLACEHOLDER_LOOK = '24/outline';

/**
 * @typedef {object} PlaceholderTable
 * @property {number} schemaVersion
 * @property {string} module the placeholder package
 * @property {Record<string, string>} looks each look and the library module
 *   that draws it
 * @property {Record<string, {heroicons?: string, lucide?: string}>} meanings
 *   each icon definition and the library export that draws it: `heroicons` in
 *   the Heroicons looks, `lucide` in the lucide look
 */

/** @type {PlaceholderTable | null} */
let cached = null;

/** The meaning → library icon table. @returns {PlaceholderTable} */
export function placeholderTable() {
  cached ??= JSON.parse(
    fs.readFileSync(
      path.join(CLI_ROOT, 'assets/icons/template-icons.json'),
      'utf-8',
    ),
  );
  return /** @type {PlaceholderTable} */ (cached);
}

/**
 * The look an import path names, or null when the path is not the
 * placeholder package or one of its looks.
 * @param {string} module
 * @param {PlaceholderTable} [table]
 * @returns {string | null}
 */
export function placeholderLook(module, table = placeholderTable()) {
  if (module === PLACEHOLDER_MODULE) return DEFAULT_PLACEHOLDER_LOOK;
  if (!module.startsWith(`${PLACEHOLDER_MODULE}/`)) return null;
  const look = module.slice(PLACEHOLDER_MODULE.length + 1);
  return Object.hasOwn(table.looks, look) && look !== DEFAULT_PLACEHOLDER_LOOK
    ? look
    : null;
}

/**
 * The placeholder export for a meaning: `delete` → `DeleteIcon`.
 * @param {string} meaning
 * @returns {string}
 */
export function placeholderExportName(meaning) {
  return `${meaning[0].toUpperCase()}${meaning.slice(1)}Icon`;
}

/**
 * The import path that names a variant: the package root for 24 outline,
 * else `<package>/<variant>`.
 * @param {string} look
 * @returns {string}
 */
export function placeholderModule(look) {
  return look === DEFAULT_PLACEHOLDER_LOOK
    ? PLACEHOLDER_MODULE
    : `${PLACEHOLDER_MODULE}/${look}`;
}

/**
 * The meaning an export name says: `DeleteIcon` → `delete`. Null when the
 * name is not `<Meaning>Icon`.
 * @param {string} exportName
 * @returns {string | null}
 */
export function placeholderMeaning(exportName) {
  const match = /^([A-Z][A-Za-z0-9]*)Icon$/u.exec(exportName);
  return match ? `${match[1][0].toLowerCase()}${match[1].slice(1)}` : null;
}

/**
 * The library import that draws a meaning in a look, or null when the table
 * has no icon for it.
 * @param {string} meaning
 * @param {string} look
 * @param {PlaceholderTable} [table]
 * @returns {{module: string, export: string} | null}
 */
export function placeholderSource(meaning, look, table = placeholderTable()) {
  const entry = Object.hasOwn(table.meanings, meaning)
    ? table.meanings[meaning]
    : undefined;
  const library = Object.hasOwn(table.looks, look) ? table.looks[look] : null;
  const icon = look === 'lucide' ? entry?.lucide : entry?.heroicons;
  return entry && library && icon ? {module: library, export: icon} : null;
}

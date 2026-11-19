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
 * @output The look, the meaning, and the library icon that draws it; a
 *   source with its placeholder imports replaced by library imports
 * @position packages/cli/foundation/discovery — read by the template copy step
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {parseTemplateSource} from './template-source-tree.mjs';

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
 * @property {Record<string, {heroicons?: string, lucide?: string, fallback?: string}>} meanings
 *   each icon definition and the library export that draws it: `heroicons` in
 *   the Heroicons looks, `lucide` in the lucide look. `fallback` names the
 *   broader meaning an icon set draws when it maps no icon for this one
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

/**
 * The meanings an icon set tries for a meaning, in order: the meaning, then
 * each fallback the table names for it. A set that maps no icon for a
 * meaning draws the icon of its fallback, so a meaning that refines another
 * (`verified` refines `success`) never makes a set draw less than before.
 * @param {string} meaning
 * @param {PlaceholderTable} [table]
 * @returns {string[]}
 */
export function meaningWithFallbacks(meaning, table = placeholderTable()) {
  const chain = [meaning];
  for (;;) {
    const current = chain[chain.length - 1];
    const next = Object.hasOwn(table.meanings, current)
      ? table.meanings[current].fallback
      : undefined;
    if (!next || chain.includes(next)) return chain;
    chain.push(next);
  }
}

/** @param {string} module @param {string[]} specifiers */
function printImport(module, specifiers) {
  const line = `import {${specifiers.join(', ')}} from '${module}';`;
  if (line.length <= 80) return line;
  return `import {\n${specifiers.map(each => `  ${each},\n`).join('')}} from '${module}';`;
}

/**
 * Replace each placeholder import with the library import that draws it,
 * as a copy of the template writes it. Names in the file do not change:
 * `import {DeleteIcon} from '@astryxdesign/template-icons'` becomes
 * `import {TrashIcon as DeleteIcon} from '@heroicons/react/24/outline'`.
 * The result also declares the meaning each library icon draws, keyed by
 * the name it imports, as a template descriptor's `icons` does, so an icon
 * set maps it like any declared icon. An import from the placeholder package
 * that names no meaning in the table stays as written. A source without
 * placeholder imports comes back unchanged.
 * @param {string} source
 * @returns {{source: string, declared: Record<string, string>}}
 */
export function fillTemplatePlaceholders(source) {
  if (!source.includes(PLACEHOLDER_MODULE)) return {source, declared: {}};
  /** @type {any} */
  let ast;
  try {
    ast = parseTemplateSource(source);
  } catch {
    return {source, declared: {}};
  }
  const table = placeholderTable();
  /** @type {Record<string, string>} */
  const declared = {};
  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') {
      continue;
    }
    const look = placeholderLook(node.source.value, table);
    if (look == null) continue;
    /** @type {string[]} */
    const filled = [];
    /** @type {string[]} */
    const kept = [];
    let module = null;
    for (const specifier of node.specifiers) {
      const name =
        specifier.type === 'ImportSpecifier'
          ? (specifier.imported.name ?? specifier.imported.value)
          : null;
      const meaning = name ? placeholderMeaning(name) : null;
      const drawn = meaning ? placeholderSource(meaning, look, table) : null;
      if (!drawn || specifier.importKind === 'type') {
        kept.push(source.slice(specifier.start, specifier.end));
        continue;
      }
      module = drawn.module;
      const local = specifier.local.name;
      filled.push(
        drawn.export === local ? local : `${drawn.export} as ${local}`,
      );
      declared[drawn.export] = /** @type {string} */ (meaning);
    }
    if (!module) continue;
    const comments = (ast.comments ?? [])
      .filter(
        (/** @type {any} */ comment) =>
          comment.start > node.start && comment.end < node.end,
      )
      .map(
        (/** @type {any} */ comment) =>
          `${source.slice(comment.start, comment.end)}\n`,
      )
      .join('');
    const lines = [printImport(module, filled)];
    if (kept.length > 0) lines.push(printImport(node.source.value, kept));
    edits.push({
      start: node.start,
      end: node.end,
      text: comments + lines.join('\n'),
    });
  }
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return {source: out, declared};
}

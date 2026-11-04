// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template `icons` keys a template's source never imports (spec:AST-084
 * FR10).
 *
 * A template's `icons` names each icon it imports, by the name it imports or,
 * for a default import, its local name. A key that no import or re-export in
 * the template's source binds can never map to a project's icon set, so each
 * one gets a note with its fix.
 *
 * @input A loaded integration (absolute roots) and its package directory.
 * @output One `template_icon_not_imported` note per such key. A note is not an
 *   issue: it is never an error or a warning, and never fails a check, even
 *   under `--strict` (architecture:cli-surface INV35).
 * @position foundation/discovery; read by `doctor integration validate` (and
 *   so `integration check`) for the package being authored.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {iconsNotImported} from './template-icons.mjs';

/** A template `icons` key its source never imports. */
export const TEMPLATE_ICON_NOT_IMPORTED = 'template_icon_not_imported';

/**
 * One note per template `icons` key the template's source never imports.
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {string} packageDir
 * @returns {Promise<Array<{code: string, message: string}>>}
 */
export async function templateIconNotes(loaded, packageDir) {
  if (!loaded.templates) return [];
  const {templates} = await discoverIntegrationTemplatesForOne(loaded).catch(
    () => ({templates: []}),
  );
  /** @type {Array<{code: string, message: string}>} */
  const notes = [];
  /** @param {string} file */
  const shown = file =>
    path.relative(packageDir, file).split(path.sep).join('/');
  for (const template of templates) {
    if (!template.docPath || !template.filePath) continue;
    const doc = /** @type {any} */ (
      await loadTopicModule(template.docPath).catch(() => null)
    );
    const declared = doc?.icons;
    if (declared == null || typeof declared !== 'object') continue;
    let source;
    try {
      source = fs.readFileSync(template.filePath, 'utf-8');
    } catch {
      continue;
    }
    for (const key of iconsNotImported(source, declared) ?? []) {
      notes.push({
        code: TEMPLATE_ICON_NOT_IMPORTED,
        message: `${shown(template.docPath)} declares icon "${key}" in \`icons\`, which ${shown(template.filePath)} does not import, so it never maps to a project's icon set. Name a named import by the name it imports and a default import by its local name, or remove "${key}" from \`icons\`.`,
      });
    }
  }
  return notes;
}

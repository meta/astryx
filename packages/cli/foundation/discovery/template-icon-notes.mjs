// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A template's `icons` checked against the icons its source imports.
 *
 * A template's `icons` names each icon it imports, by the name it imports or,
 * for a default import, its local name. A key that no import or re-export in
 * the template's source binds can never map to a project's icon set, so each
 * one gets a note with its fix. An icon the template imports but does not
 * declare never maps either: in a package whose templates declare `icons`,
 * each one is a warning, which fails `--strict`.
 *
 * @input A loaded integration (absolute roots) and its package directory.
 * @output One `template_icon_not_imported` note per such key (a note is never
 *   an error or a warning, even under `--strict`), and one
 *   `template_icon_undeclared` warning per undeclared icon.
 * @position foundation/discovery; read by `doctor integration validate` (and
 *   so `integration check`) for the package being authored.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {iconsNotImported, undeclaredTemplateIcons} from './template-icons.mjs';

/** A template `icons` key its source never imports. */
export const TEMPLATE_ICON_NOT_IMPORTED = 'template_icon_not_imported';

/** An icon a template imports that its `icons` does not declare. */
export const TEMPLATE_ICON_UNDECLARED = 'template_icon_undeclared';

/**
 * Each template in the package, with its source and its doc's `icons`. A
 * template whose doc or source cannot be read is left out.
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {string} packageDir
 * @returns {Promise<Array<{id: string, docPath: string, source: string, declared: Record<string, string> | null}>>}
 */
async function readTemplates(loaded, packageDir) {
  if (!loaded.templates) return [];
  const {templates} = await discoverIntegrationTemplatesForOne(loaded).catch(
    () => ({templates: []}),
  );
  /** @param {string} file */
  const shown = file =>
    path.relative(packageDir, file).split(path.sep).join('/');
  /** @type {Array<{id: string, docPath: string, source: string, declared: Record<string, string> | null}>} */
  const read = [];
  for (const template of templates) {
    if (!template.docPath || !template.filePath) continue;
    const doc = /** @type {any} */ (
      await loadTopicModule(template.docPath).catch(() => null)
    );
    let source;
    try {
      source = fs.readFileSync(template.filePath, 'utf-8');
    } catch {
      continue;
    }
    read.push({
      id: shown(template.filePath),
      docPath: shown(template.docPath),
      source,
      declared:
        doc?.icons != null && typeof doc.icons === 'object' ? doc.icons : null,
    });
  }
  return read;
}

/**
 * One note per template `icons` key the template's source never imports.
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {string} packageDir
 * @returns {Promise<Array<{code: string, message: string}>>}
 */
export async function templateIconNotes(loaded, packageDir) {
  /** @type {Array<{code: string, message: string}>} */
  const notes = [];
  for (const template of await readTemplates(loaded, packageDir)) {
    if (!template.declared) continue;
    for (const key of iconsNotImported(template.source, template.declared) ??
      []) {
      notes.push({
        code: TEMPLATE_ICON_NOT_IMPORTED,
        message: `${template.docPath} declares icon "${key}" in \`icons\`, which ${template.id} does not import, so it never maps to a project's icon set. Name a named import by the name it imports and a default import by its local name, or remove "${key}" from \`icons\`.`,
      });
    }
  }
  return notes;
}

/**
 * One warning per icon a template imports but does not declare in `icons`.
 * Only a package whose templates declare `icons` gets them: a package that
 * never labels its icons sees no change.
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {string} packageDir
 * @returns {Promise<Array<{code: string, severity: 'warning', message: string}>>}
 */
export async function templateIconUndeclaredIssues(loaded, packageDir) {
  const read = (await readTemplates(loaded, packageDir)).map(each => ({
    ...each,
    declared: each.declared ?? {},
  }));
  if (!read.some(each => Object.keys(each.declared).length > 0)) return [];
  const docOf = new Map(read.map(each => [each.id, each.docPath]));
  return undeclaredTemplateIcons(read).map(({id, key, module}) => ({
    code: TEMPLATE_ICON_UNDECLARED,
    severity: /** @type {const} */ ('warning'),
    message: `${id} imports icon "${key}" from ${module}, but ${docOf.get(id)} does not declare it in \`icons\`, so it never follows a project's icon set. Add \`${key}: '<definition>'\` to \`icons\` (\`astryx experimental icon --definitions\` lists the definitions).`,
  }));
}

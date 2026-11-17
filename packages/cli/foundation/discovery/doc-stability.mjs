// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration descriptors an older CLI drops (spec:AST-017 FR21, FR27;
 * spec:AST-084 FR16).
 *
 * Published CLIs before 0.7.4 refuse an unknown field on a page or block
 * template, which they drop, and on a namespace doc, which hides every doc
 * topic the package ships. Component docs and guides keep loading there and
 * ignore it. So each template or namespace doc that sets `stability`, and
 * each template that declares `icons`, gets a note, unless the package's
 * `@astryxdesign/cli` peer range admits only CLIs that read the field.
 *
 * @input A loaded integration and its package.json.
 * @output One note per descriptor. A note is not an issue: it is never an
 *   error or a warning, and never fails a check, even under `--strict`.
 * @position foundation/discovery; read by `doctor integration validate`
 *   (and so `integration check`) for the package being authored.
 */

import * as path from 'node:path';
import {discoverIntegrationDocs, loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {
  STABILITY_CLI,
  TEMPLATE_ICONS_CLI,
  stabilityCliProblem,
  templateIconsCliProblem,
} from '../integrations/cli-requirement.mjs';

/**
 * @typedef {object} OlderCliNote
 * @property {string} file the descriptor, relative to the package
 * @property {'template' | 'namespace'} kind
 * @property {'stability' | 'icons'} field the field an older CLI refuses
 * @property {string} message what an older CLI does with it, and the fix
 */

/**
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {any} pkg its package.json
 * @param {string} packageDir
 * @returns {Promise<OlderCliNote[]>}
 */
export async function olderCliNotes(loaded, pkg, packageDir) {
  const stability = stabilityCliProblem(pkg) != null;
  const icons = templateIconsCliProblem(pkg) != null;
  if (!stability && !icons) return [];
  /** @type {Array<{file: string, kind: 'template' | 'namespace', field: 'stability' | 'icons'}>} */
  const found = [];
  if (stability && loaded.docs) {
    const {namespaces} = await discoverIntegrationDocs(loaded).catch(() => ({
      namespaces: [],
    }));
    for (const namespace of namespaces) {
      if (/** @type {any} */ (namespace.doc)?.stability != null) {
        // A namespace's source is `<package>/<path in the docs root>`.
        const inRoot = String(namespace.source).slice(
          String(loaded.name).length + 1,
        );
        found.push({
          file: path.join(loaded.docs, inRoot),
          kind: 'namespace',
          field: 'stability',
        });
      }
    }
  }
  if (loaded.templates) {
    const {templates} = await discoverIntegrationTemplatesForOne(loaded).catch(
      () => ({templates: []}),
    );
    for (const template of templates) {
      if (!template.docPath) continue;
      const doc = /** @type {any} */ (
        await loadTopicModule(template.docPath).catch(() => null)
      );
      if (stability && doc?.stability != null) {
        found.push({
          file: template.docPath,
          kind: 'template',
          field: 'stability',
        });
      }
      if (icons && doc?.icons != null) {
        found.push({file: template.docPath, kind: 'template', field: 'icons'});
      }
    }
  }
  return found.map(({file, kind, field}) => {
    const relative = path.relative(packageDir, file).split(path.sep).join('/');
    const floor = field === 'icons' ? TEMPLATE_ICONS_CLI : STABILITY_CLI;
    return {
      file: relative,
      kind,
      field,
      message: `${relative} ${field === 'icons' ? 'declares `icons`' : 'sets `stability`'}: CLIs before ${floor} drop this descriptor${kind === 'namespace' ? " and hide the package's doc topics" : ''}, and the package's @astryxdesign/cli peer range admits them. Declare "@astryxdesign/cli": ">=${floor}" in peerDependencies (optional in peerDependenciesMeta), or remove \`${field}\`.`,
    };
  });
}

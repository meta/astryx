// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The components an integration lists, each with the parts of its doc
 * the component matcher scores, kept between runs.
 *
 * @input A loaded integration.
 * @output {@link integrationComponentViews}: each component discovery records
 *   for it, in discovery's order, with its {@link ComponentMatchView}.
 * @position Read by the `component` lookup's not-found path
 *   (api/component/_adapter.mjs), so an unknown name is matched against the
 *   integration components the lookup reads as well as Core's. The summary is
 *   kept while the components folder, every doc it read and every path it
 *   probed keep their stamps, so a warm miss loads no integration doc.
 */

import {fileURLToPath} from 'node:url';
import {keptTreeSummaryAsync} from '../fs/kept-tree.mjs';
import {skipComponentsFolder} from './name-roots.mjs';

/**
 * @typedef {import('../text/string-utils.mjs').ComponentMatchView} ComponentMatchView
 */

/** The code that makes the kept views. */
const VIEWS_CODE = [
  fileURLToPath(import.meta.url),
  ...[
    './component-discovery.mjs',
    './component-loader.mjs',
    './module-exports.mjs',
    './name-roots.mjs',
    '../doc-compiler/read.mjs',
    '../text/string-utils.mjs',
  ].map(rel => fileURLToPath(new URL(rel, import.meta.url))),
];

/**
 * The components `integration` lists, as discovery records them, each with
 * its doc's {@link ComponentMatchView} (a member's: its family doc's entry for
 * it); `view` is null for a doc that does not load.
 * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
 * @returns {Promise<Array<{name: string, view: ComponentMatchView | null}>>}
 */
export async function integrationComponentViews(integration) {
  const componentsDir = integration?.components;
  if (!componentsDir) return [];
  return keptTreeSummaryAsync(
    {
      kind: 'integration-component-views',
      roots: [componentsDir],
      code: VIEWS_CODE,
      skip: skipComponentsFolder,
      key: [
        integration.name,
        integration.__packageDir ?? null,
        integration.__packageExports === undefined
          ? 'read'
          : JSON.stringify(integration.__packageExports),
      ],
      recorded: true,
    },
    async () => {
      const [discovery, {loadDocs}, {componentMatchView}] = await Promise.all([
        import('./component-discovery.mjs'),
        import('./component-loader.mjs'),
        import('../text/string-utils.mjs'),
      ]);
      /** @type {Array<{name: string, view: ComponentMatchView | null}>} */
      const views = [];
      for (const record of discovery.discoverIntegrationComponents(
        integration,
      )) {
        let view = null;
        try {
          const doc = await loadDocs(record.docPath);
          // A member is matched by the entry its family doc gives it.
          view = componentMatchView(
            discovery.isIntegrationMember(record)
              ? discovery.integrationMemberEntry(doc, record)
              : doc,
          );
        } catch {
          // A doc that does not load still names a component the lookup reads.
        }
        views.push({name: record.name, view});
      }
      return views;
    },
  );
}

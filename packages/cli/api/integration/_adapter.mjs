// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration subject's access to the environment (INV21): reading
 * one package's component docs and sources with the project's own TypeScript,
 * and its topics.
 *
 * @input a loaded integration and the directory the command runs in
 * @output the reports the integration checks attach to their results
 * @position api/integration (internal; not exported from ./api)
 */

import {
  discoverValidIntegrationComponents,
  forEachIntegrationDoc,
  integrationSourceForDoc,
} from '../../foundation/discovery/component-discovery.mjs';
import {Project} from '../../foundation/config/project.mjs';
import {discoverIntegrationDocs} from '../../foundation/discovery/docs-discovery.mjs';
import {packageDocTargets} from '../docs/_adapter.mjs';
import {comparePropDocs} from '../../foundation/discovery/prop-drift.mjs';
import {findCopiedPassages} from '../../foundation/discovery/copied-passages.mjs';
import {findFluff} from '../../foundation/discovery/doc-fluff.mjs';
import {findDocCommands} from '../../foundation/discovery/runner-commands.mjs';
import {findStrayPointers} from '../../foundation/discovery/stray-pointers.mjs';

/**
 * Each component doc's props compared with the component's TypeScript props,
 * read with the project's own compiler (spec:AST-039 FR12). Without one, the
 * report says the comparison was skipped.
 * @param {any} integration a loaded integration
 * @param {string} cwd
 * @returns {Promise<import('../../foundation/discovery/prop-drift.mjs').PropDriftReport>}
 */
export async function integrationPropDrift(integration, cwd) {
  const packageDir = /** @type {{__packageDir?: string}} */ (integration)
    .__packageDir;
  const {components} = await discoverValidIntegrationComponents(integration);
  // Every doc the package ships has its prop tables compared or listed as not
  // compared. A doc discovery leaves out (a hidden one, a second doc for one
  // name, or one whose source or own file doesn't load) gets a record under
  // its file name.
  const recorded = new Set(components.map(c => c.docPath));
  /** @type {typeof components} */
  const left = [];
  forEachIntegrationDoc(integration?.components, (docPath, stem) => {
    if (recorded.has(docPath)) return;
    recorded.add(docPath);
    left.push({
      name: stem,
      package: integration.name,
      docPath,
      sourcePath: integrationSourceForDoc(docPath),
      issuesUrl: integration.issuesUrl,
      group: null,
    });
  });
  return comparePropDocs([...components, ...left], {
    packageDir: packageDir ?? cwd,
    resolveFrom: [cwd, packageDir],
  });
}

/**
 * The passages two of a package's topics, or one of them and a Core topic,
 * repeat word for word (architecture:cli-surface DEC-8). Reads the package's
 * topics and Core's guides.
 *
 * @param {Parameters<typeof findCopiedPassages>[0]} discovered the package's
 *   docs, as discoverIntegrationDocs returns them
 */
export function integrationCopiedPassages(discovered) {
  return findCopiedPassages(discovered);
}

/**
 * Padding phrases and low-density topics in a package's prose
 * (architecture:cli-surface DEC-8). Reads the package's topics, and Core's
 * guides for the density median a finding names.
 *
 * @param {Parameters<typeof findFluff>[0]} discovered the package's docs, as
 *   discoverIntegrationDocs returns them
 */
export function integrationFluff(discovered) {
  return findFluff(discovered);
}

/**
 * Code spans in a package's prose that write `astryx docs <name>` for a doc
 * that exists, where `{@link generic:<name>}` would be checked
 * (architecture:cli-surface DEC-8). Reads the package's topics, its own
 * component docs, and the names of Core's docs.
 *
 * @param {Parameters<typeof findStrayPointers>[0]} discovered the package's
 *   docs, as discoverIntegrationDocs returns them
 * @param {any} [integration] the loaded integration, whose component docs are
 *   read too
 */
export async function integrationStrayPointers(discovered, integration) {
  /** @type {{name: string, file: string}[]} */
  const components = [];
  if (integration?.components) {
    const seen = new Set();
    try {
      const {components: records} =
        await discoverValidIntegrationComponents(integration);
      for (const record of records) {
        if (!record.docPath || seen.has(record.docPath)) continue;
        seen.add(record.docPath);
        components.push({name: record.name, file: record.docPath});
      }
    } catch {
      // `validate` reports component docs that do not load.
    }
  }
  return findStrayPointers({...discovered, components});
}

/**
 * What each doc in one integration's docs replaces or extends, read against
 * the CLI's docs and the package's own (see `packageDocTargets`); empty when
 * the docs do not load, which other checks report.
 * @param {any} integration a loaded integration
 * @returns {Promise<import('../docs/_adapter.mjs').DocTarget[]>}
 */
export async function integrationDocTargets(integration) {
  let discovered;
  try {
    discovered = await discoverIntegrationDocs(integration);
  } catch {
    return [];
  }
  // A doc that does not load is an issue already; its targets are not read.
  if (discovered.errors.length > 0) return [];
  try {
    return await packageDocTargets(integration, discovered);
  } catch {
    // A package whose docs cannot form a tree is reported by the docs check.
    return [];
  }
}

/**
 * The doc-syntax findings in a package's topics: commands written with a
 * runner, for one package manager, or bare, and tokens that do not parse. A
 * package whose topics cannot be discovered has none here: the other checks
 * report topics that do not load.
 * @param {any} integration a loaded integration
 * @returns {Promise<import('../../foundation/discovery/runner-commands.mjs').RunnerCommand[]>}
 */
export async function integrationDocCommands(integration) {
  let discovered;
  try {
    discovered = await discoverIntegrationDocs(integration);
  } catch {
    return [];
  }
  return findDocCommands(discovered);
}

/**
 * Whether the project at `cwd` opts in to icon sets (`experimental.iconSet`).
 * An installed package's experimental root is read only then
 * (spec:AST-017 FR27, spec:AST-084 FR0): a project without it gets what a CLI
 * without icon sets reports. A config that does not load opts in to nothing.
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
export async function projectUsesIconSets(cwd) {
  try {
    const project = await Project.load(cwd);
    return Boolean(project.config?.experimental?.iconSet);
  } catch {
    return false;
  }
}

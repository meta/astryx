// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Give each integration theme a typed descriptor instead of the
 *   `manifest.json` theme catalog.
 *
 * Astryx 0.6 scaffolded integration themes into one catalog,
 * `<themes root>/manifest.json`. Each theme now carries a strongly typed
 * same-stem `.doc.mjs` descriptor, and a themes root that still holds the
 * catalog is refused. This project codemod reads the package's integration
 * manifest, plans one descriptor per catalog entry beside that theme's source,
 * and removes the catalog. When any entry cannot convert, it plans nothing and
 * names the entry, so the package is never left half converted.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadManifestObject} from '../../../../foundation/integrations/integrations.mjs';
import {findLocalIntegrationManifestOrNull} from '../../../../foundation/integrations/manifest-writer.mjs';
import {themeDescriptorSource} from '../../../../foundation/integrations/theme-descriptor.mjs';

export const meta = {
  title:
    'Give each integration theme a typed descriptor instead of the manifest.json catalog',
  description:
    'Writes <name>Theme.doc.mjs beside each theme the catalog lists, then removes the catalog.',
  codemodType: 'project',
};

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SOURCE = /\.(?:ts|tsx|mjs|js)$/u;

/**
 * @param {string} root the package directory
 * @returns {Promise<import('../../runner.mjs').ProjectCodemodPlan>}
 */
export default async function migrateThemeCatalogToDescriptors(root) {
  /** @type {import('../../runner.mjs').ProjectCodemodPlan} */
  const plan = {writes: [], deletes: [], problems: []};
  /** @param {string} file @returns {string} */
  const rel = file => path.relative(root, file).split(path.sep).join('/');
  /** @param {string} file @param {string} message */
  const problem = (file, message) => plan.problems.push({file, message});

  const manifestFile = findLocalIntegrationManifestOrNull(root);
  if (!manifestFile) return plan;
  const manifest = await loadManifestObject(
    manifestFile,
    `Integration manifest ${path.basename(manifestFile)}`,
    {fresh: true},
  );
  if (typeof manifest.themes !== 'string') return plan;
  const themesRoot = path.resolve(root, manifest.themes);
  const fromRoot = path.relative(root, themesRoot);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return plan;
  const catalogFile = path.join(themesRoot, 'manifest.json');
  if (!fs.existsSync(catalogFile)) return plan;
  const catalogPath = rel(catalogFile);

  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    problem(catalogPath, `is not valid JSON (${reason}).`);
    return plan;
  }
  if (
    !catalog ||
    typeof catalog !== 'object' ||
    catalog.version !== 1 ||
    !Array.isArray(catalog.themes)
  ) {
    problem(catalogPath, 'is not a version 1 theme catalog.');
    return plan;
  }

  for (const [index, entry] of catalog.themes.entries()) {
    const slug = entry?.slug;
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      problem(
        catalogPath,
        `themes[${index}] has no lowercase kebab-case slug; fix the entry or add that theme's descriptor by hand.`,
      );
      continue;
    }
    const themeDir = path.join(themesRoot, slug);
    const source = entry.entry;
    if (
      typeof source !== 'string' ||
      !SOURCE.test(source) ||
      source !== path.basename(source)
    ) {
      problem(
        catalogPath,
        `theme "${slug}" has entry ${JSON.stringify(source)}; a descriptor sits beside a .ts, .tsx, .mjs, or .js source directly in ${rel(themeDir)}/.`,
      );
      continue;
    }
    const stem = source.replace(SOURCE, '');
    if (entry.exportName !== stem) {
      problem(
        catalogPath,
        `theme "${slug}" exports ${JSON.stringify(entry.exportName)} from ${source}; a descriptor takes the export name from the file name, so rename the export or the file to match.`,
      );
      continue;
    }
    if (typeof entry.displayName !== 'string' || !entry.displayName.trim()) {
      problem(catalogPath, `theme "${slug}" has no displayName.`);
      continue;
    }
    if (typeof entry.description !== 'string') {
      problem(catalogPath, `theme "${slug}" has no description string.`);
      continue;
    }
    if (typeof entry.maintained !== 'boolean') {
      problem(catalogPath, `theme "${slug}" has no maintained flag.`);
      continue;
    }
    if (!fs.existsSync(path.join(themeDir, source))) {
      problem(rel(themeDir), `holds no ${source} for theme "${slug}".`);
      continue;
    }
    const descriptor = path.join(themeDir, `${stem}.doc.mjs`);
    if (fs.existsSync(descriptor)) continue;
    plan.writes.push({
      path: descriptor,
      contents: themeDescriptorSource({
        type: 'theme',
        name: slug,
        displayName: entry.displayName,
        description: entry.description,
        maintained: entry.maintained,
      }),
    });
  }
  if (plan.problems.length > 0)
    return {writes: [], deletes: [], problems: plan.problems};
  plan.deletes.push(catalogFile);
  return plan;
}

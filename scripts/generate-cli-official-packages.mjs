#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes the official package list that `astryx discover` reads after
 * every other source (spec:AST-051 FR11 and DEC-5) to
 * `packages/cli/assets/discover/official-packages.json`.
 *
 * A package is official when the release workflow publishes it and it adds at
 * least one item discover lists. The publish rule is the workflow's own: an
 * `@astryxdesign/` name that is not private goes to `latest`, and a
 * `canaryOnly` package goes to `canary` only. What a package adds comes from
 * the CLI's own readers: the integration loader and contribution inventory for
 * an integration, and the theme descriptor reader for a theme package. The list
 * holds no versions: when discover reads it, each entry lists the CLI's own
 * version and the project's installed Core version, and pins the project's
 * Core version, else the Core range it declares, else the latest release. Run
 * from the repo root and commit the result; `--check` exits 1 when the
 * committed list is stale.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseTheme} from '../packages/cli/authoring/doctypes/theme/parse.mjs';
import {readThemeDescriptorValue} from '../packages/cli/foundation/discovery/theme-discovery.mjs';
import {collectIdentities} from '../packages/cli/foundation/integrations/contribution-inventory.mjs';
import {loadLocalIntegration} from '../packages/cli/foundation/integrations/integrations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** Where the list lives, relative to a repository root. */
export const OFFICIAL_LIST_PATH = path.join(
  'packages',
  'cli',
  'assets',
  'discover',
  'official-packages.json',
);

/** The folders the release workflow publishes from, in its order. */
const PACKAGE_FOLDERS = ['packages', path.join('packages', 'themes')];

/** The folder whose every published package is a theme package. */
const THEMES_FOLDER = path.join('packages', 'themes');

/**
 * @typedef {object} OfficialContribution
 * @property {import('../packages/cli/authoring/discover/type').DiscoverKind} kind
 * @property {string} name
 * @property {string} [title]
 * @property {string} [summary]
 */

/**
 * @typedef {object} OfficialPackage
 * @property {string} package
 * @property {string} [description]
 * @property {true} [canaryOnly] published only to `canary`
 * @property {true} [releasedWithCore] always released at Core's version
 * @property {OfficialContribution[]} contributions
 */

/** @param {string} file */
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf-8'));

/** @param {string} slug */
const toIdentifier = slug =>
  slug.replace(/-([a-z])/g, (_, character) => character.toUpperCase());

/**
 * Which dist-tag the release workflow publishes a package to: `latest` (and
 * `canary`) for a public `@astryxdesign/` package, `canary` only for a
 * `canaryOnly` one, and none otherwise.
 * @param {{name?: unknown, private?: unknown, astryx?: {canaryOnly?: unknown}}} pkg
 * @returns {'latest' | 'canary' | null}
 */
export function releaseChannel(pkg) {
  if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@astryxdesign/')) {
    return null;
  }
  const canaryOnly = Boolean(pkg.astryx?.canaryOnly);
  if (!pkg.private && !canaryOnly) return 'latest';
  return canaryOnly ? 'canary' : null;
}

/**
 * The packages released at Core's version: the changeset fixed group that
 * holds `@astryxdesign/core`.
 * @param {string} repoRoot
 * @returns {Set<string>}
 */
function packagesReleasedWithCore(repoRoot) {
  const file = path.join(repoRoot, '.changeset', 'config.json');
  if (!fs.existsSync(file)) return new Set();
  const groups = readJSON(file).fixed ?? [];
  const group = groups.find(
    (/** @type {unknown} */ names) =>
      Array.isArray(names) && names.includes('@astryxdesign/core'),
  );
  return new Set(group ?? []);
}

/**
 * @param {OfficialContribution[]} items
 * @returns {OfficialContribution[]}
 */
function byName(items) {
  return items.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/**
 * What an integration package adds, through the same discovery a project
 * that installs it runs.
 * @param {import('../packages/cli/foundation/integrations/integrations.mjs').LoadedIntegration} integration
 * @param {string} name
 * @returns {Promise<OfficialContribution[]>}
 */
async function integrationContributions(integration, name) {
  if (integration.__loadError) {
    throw new Error(
      `${name}: its integration manifest does not load: ${integration.__loadError}`,
    );
  }
  const {identities, errors} = await collectIdentities(integration);
  if (errors.length > 0) {
    throw new Error(
      `${name}: ${errors.map(e => `${e.kind}: ${e.message}`).join('; ')}`,
    );
  }
  return [
    ...byName(identities.components.map(n => ({kind: 'component', name: n}))),
    ...byName(identities.templates.map(t => ({kind: 'template', name: t.id}))),
    ...byName(identities.docs.map(n => ({kind: 'doc', name: n}))),
    ...byName(identities.themes.map(t => ({kind: 'theme', name: t.slug}))),
    ...byName(
      identities.codemods.map(c => ({
        kind: 'codemod',
        name: `${c.version}/${c.id}`,
      })),
    ),
  ].map(item => /** @type {OfficialContribution} */ (item));
}

/**
 * The theme a theme package adds, read by the CLI's theme descriptor reader:
 * `src/<name>Theme.ts` with its same-stem `.doc.mjs` descriptor.
 * @param {string} dir
 * @param {string} name
 * @returns {OfficialContribution[]}
 */
function themeContributions(dir, name) {
  const stem = `${toIdentifier(path.basename(dir))}Theme`;
  const source = path.join(dir, 'src', `${stem}.ts`);
  const descriptor = path.join(dir, 'src', `${stem}.doc.mjs`);
  if (!fs.existsSync(source) || !fs.existsSync(descriptor)) return [];
  const label = `Theme package ${name} descriptor src/${stem}.doc.mjs`;
  const theme = parseTheme(readThemeDescriptorValue(descriptor, label), label);
  return [
    {
      kind: 'theme',
      name: theme.name,
      title: theme.displayName,
      ...(theme.description ? {summary: theme.description} : {}),
    },
  ];
}

/**
 * Build the official list from a repository checkout. Throws when a package the
 * release publishes cannot be read, so a broken package never silently drops
 * out of the list.
 * @param {string} [repoRoot]
 * @returns {Promise<{packages: OfficialPackage[]}>}
 */
export async function buildOfficialList(repoRoot = REPO_ROOT) {
  const withCore = packagesReleasedWithCore(repoRoot);
  /** @type {OfficialPackage[]} */
  const packages = [];
  for (const folder of PACKAGE_FOLDERS) {
    const root = path.join(repoRoot, folder);
    if (!fs.existsSync(root)) continue;
    const dirs = fs
      .readdirSync(root, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(root, entry.name))
      .filter(dir => fs.existsSync(path.join(dir, 'package.json')))
      .sort();
    for (const dir of dirs) {
      const pkg = readJSON(path.join(dir, 'package.json'));
      const channel = releaseChannel(pkg);
      if (channel == null) continue;
      const integration = await loadLocalIntegration(dir);
      const contributions = integration
        ? await integrationContributions(integration, pkg.name)
        : themeContributions(dir, pkg.name);
      if (contributions.length === 0) {
        // A published theme package must read back, or it would silently
        // drop out of the list.
        if (folder === THEMES_FOLDER) {
          const stem = `${toIdentifier(path.basename(dir))}Theme`;
          throw new Error(
            `${pkg.name} (${path.relative(repoRoot, dir)}) is published but has no src/${stem}.ts with a same-stem src/${stem}.doc.mjs descriptor, so the official list cannot read its theme.`,
          );
        }
        // Core, the CLI, and the build plugins are the base: they add nothing
        // discover lists.
        continue;
      }
      packages.push({
        package: pkg.name,
        ...(typeof pkg.description === 'string' && pkg.description
          ? {description: pkg.description}
          : {}),
        ...(channel === 'canary' ? {canaryOnly: true} : {}),
        ...(withCore.has(pkg.name) ? {releasedWithCore: true} : {}),
        contributions,
      });
    }
  }
  packages.sort((a, b) => a.package.localeCompare(b.package, 'en'));
  return {packages};
}

/**
 * The file contents for a list.
 * @param {{packages: OfficialPackage[]}} list
 * @returns {string}
 */
export function serializeOfficialList(list) {
  return `${JSON.stringify(list, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes('--check');
  const out = path.join(REPO_ROOT, OFFICIAL_LIST_PATH);
  let text;
  try {
    text = serializeOfficialList(await buildOfficialList());
  } catch (error) {
    console.error(
      `generate-cli-official-packages: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
    return;
  }
  if (check) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf-8') : '';
    if (current !== text) {
      console.error(
        `generate-cli-official-packages: ${OFFICIAL_LIST_PATH} is stale. Run \`pnpm bundle:cli-official-packages\` and commit the result.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `generate-cli-official-packages: ${OFFICIAL_LIST_PATH} is current.`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, text);
  const count = JSON.parse(text).packages.length;
  console.log(
    `generate-cli-official-packages: wrote ${count} official packages to ${OFFICIAL_LIST_PATH}`,
  );
}

/** Whether this module is the entry point, however the path to it was spelled. */
function isEntryPoint() {
  try {
    return (
      fs.realpathSync(process.argv[1] ?? '') ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) await main();

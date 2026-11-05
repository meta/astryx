// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Resolve explicit changed-component scope for fast PR accessibility.
 * @input Exact PR analysis and canonical public-component ownership
 * @output Qualified filters matched like the audit consumer; empty never means full
 * @position PR-only projection; exhaustive accessibility belongs to release-check
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import componentPackages from '../../scripts/component-packages.cjs';
import {
  buildStoryComponentRoutes,
  componentRoutesForFilters,
} from '../../apps/storybook/rtl-audit/rtl-audit-coverage.mjs';
import storyIdentity from './lib/a11y-story-identity.js';

const {
  componentPackage,
  componentExportsFromBarrel,
  documentedComponentNames,
  COMPONENT_PACKAGES,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = componentPackages;

export function readPrA11yRoutes(repoRoot) {
  const index = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'apps/storybook/dist/index.json'),
      'utf8',
    ),
  );
  const entries = index.entries ?? index.stories;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('PR accessibility requires a valid Storybook index');
  }
  const stories = Object.entries(entries)
    .filter(([, story]) => story.type === 'story')
    .map(([id, story]) => ({id, title: story.title}));
  if (stories.length === 0)
    throw new Error('PR accessibility requires runnable stories');
  const publicComponentsByPackage = Object.fromEntries(
    COMPONENT_PACKAGES.map(pkg => [
      pkg.name,
      pkg.layout === 'flat'
        ? flatPackageComponentNames(repoRoot, pkg)
        : nestedPackageComponentNames(repoRoot, pkg),
    ]),
  );
  const targets = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'apps/storybook/rtl-audit/targets.json'),
      'utf8',
    ),
  );
  return buildStoryComponentRoutes({
    stories,
    targets,
    publicComponentsByPackage,
  }).map(route => ({
    ...route,
    component: storyIdentity.ownerForA11yStory(route.id) ?? route.component,
  }));
}

/**
 * The public components each changed multi-component folder (such as Chat or
 * Table) implements, from the analysis's unresolved component sources. Only
 * the changed folder expands, never the whole package roster. Shared by the
 * accessibility scope and the touched-components check.
 *
 * @param {string[]} sources - `package/Folder` entries
 * @param {string} [repoRoot]
 * @returns {{packageName: string, directory: string, name: string, owner: string}[]}
 */
export function changedFolderMembers(sources, repoRoot = process.cwd()) {
  const members = [];
  const publicComponentsByPackage = new Map();
  for (const source of sources) {
    const [packageName, directory, extra] = source.split('/');
    const pkg = componentPackage(packageName);
    if (
      !pkg ||
      extra !== undefined ||
      !/^[A-Za-z0-9_.-]+$/.test(directory ?? '') ||
      ['.', '..'].includes(directory)
    ) {
      throw new Error(`Invalid unresolved component source: ${source}`);
    }
    const sourceRoot = path.join(repoRoot, pkg.src);
    const changedDirectory = path.join(sourceRoot, directory);
    const names = documentedComponentNames(changedDirectory);
    if (names.length === 0) continue;
    let publicComponents = publicComponentsByPackage.get(packageName);
    if (publicComponents == null) {
      publicComponents = new Set(
        pkg.layout === 'flat'
          ? flatPackageComponentNames(repoRoot, pkg)
          : nestedPackageComponentNames(repoRoot, pkg),
      );
      publicComponentsByPackage.set(packageName, publicComponents);
    }
    const exports = componentExportsFromBarrel(
      path.join(sourceRoot, 'index.ts'),
      sourceRoot,
    );
    for (const name of names) {
      // Utility docs in shared source directories do not create component owners.
      if (!publicComponents.has(name)) continue;
      // A doc can mention a dependency such as Avatar; it does not make that
      // component part of the changed folder's scope.
      if (exports.get(name)?.startsWith(`${changedDirectory}${path.sep}`)) {
        members.push({
          packageName,
          directory,
          name,
          owner: `${packageName}/${name}`,
        });
      }
    }
  }
  return members;
}

export function resolvePrA11yComponents(
  analysis,
  repoRoot = process.cwd(),
  routes = null,
) {
  if (analysis?.diffMode !== 'three-dot') {
    throw new Error(
      'PR accessibility requires exact three-dot component analysis',
    );
  }
  for (const key of [
    'newComponentOwners',
    'modifiedComponentOwners',
    'unresolvedComponentSources',
  ]) {
    if (
      !Array.isArray(analysis[key]) ||
      analysis[key].some(value => typeof value !== 'string')
    ) {
      throw new Error(`PR accessibility requires explicit ${key}`);
    }
  }
  const owners = new Set([
    ...analysis.newComponentOwners,
    ...analysis.modifiedComponentOwners,
  ]);
  for (const owner of owners) {
    const [packageName, name, extra] = owner.split('/');
    if (
      extra !== undefined ||
      !componentPackage(packageName) ||
      !/^[A-Z][A-Za-z0-9]*$/.test(name ?? '')
    ) {
      throw new Error(`Invalid package-qualified component owner: ${owner}`);
    }
  }
  // Analysis deliberately leaves multi-component folders (such as Chat)
  // unresolved. Expand only that changed folder, not the whole package roster.
  for (const {packageName, directory, owner} of changedFolderMembers(
    analysis.unresolvedComponentSources,
    repoRoot,
  )) {
    routes ??= readPrA11yRoutes(repoRoot);
    const umbrella = `${packageName}/${directory}`;
    if (componentRoutesForFilters(routes, [owner]).length > 0) {
      owners.add(owner);
    } else if (componentRoutesForFilters(routes, [umbrella]).length > 0) {
      // Some grouped exports are exercised only by their family's stories.
      owners.add(umbrella);
    } else {
      throw new Error(`No scoped Storybook route for ${owner} or ${umbrella}`);
    }
  }
  return [...owners].sort();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const analysis = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(resolvePrA11yComponents(analysis).join(','));
}

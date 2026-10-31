#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Classify changed files by release channel for visual CI.
 *
 * @input  newline-separated paths on stdin (normally a base...head git diff)
 * @output JSON, and optionally GitHub outputs
 *
 * Visual baselines belong to the stable product. A package marked
 * `astryx.canaryOnly` deliberately has no stable visual baseline: Lab/charts/
 * richtext/vega still typecheck, test and build Storybook, but random or
 * experimental pixels are not a release decision and should not create a red
 * check everyone learns to ignore.
 *
 * This reads package metadata rather than naming today's canary packages, so a
 * package changing release channel changes classification in one place — its
 * own package.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import changeScope from './change-scope.cjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/** @param {string} file */
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** @param {string} repoRoot @param {string} file @param {Record<string, object>} manifests */
function readPackage(repoRoot, file, manifests) {
  if (Object.hasOwn(manifests, file)) return manifests[file];
  const absolute = path.join(repoRoot, file);
  return fs.existsSync(absolute) ? readJSON(absolute) : null;
}

/** A Changeset is release notes: it renders nothing. */
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

/**
 * @param {string[]} files
 * @param {string} repoRoot
 * @param {Record<string, object>} manifests - trusted snapshots keyed by repo-relative path
 * @param {{scoped?: boolean}} options - `scoped`: a pull request whose CI runs
 *   what it reaches (spec:AST-030 FR13); a Core module outside every
 *   component folder is audited through its reverse dependents, not the
 *   whole plan
 */
export function classifyVisualScope(
  files,
  repoRoot = ROOT,
  manifests = {},
  {scoped = false} = {},
) {
  const paths = files.map(file => file.trim()).filter(Boolean);
  const rendered = paths.filter(file => !CHANGESET.test(file));
  const stableCoreFiles = paths.filter(
    file =>
      /^packages\/core\/src\/.*\.(ts|tsx|css)$/.test(file) &&
      !/\.(test|doc)\./.test(file),
  );

  const stableThemes = new Set();
  const stableComponents = new Set();
  const canaryPackages = new Set();
  // Reuse the accepted surface taxonomy: unknown/shared inputs and the build
  // pipeline cannot rely on a daily backup once this is the only visual owner.
  const {surfaces} = changeScope.classifyChanges(rendered);
  const stableVisualInfrastructure =
    paths.length === 0 ||
    surfaces.some(surface =>
      ['shared-or-unknown', 'storybook-visual', 'runtime:build'].includes(
        surface,
      ),
    ) ||
    paths.includes('packages/core/package.json');
  let broadStableVisual = stableVisualInfrastructure;

  for (const file of stableCoreFiles) {
    const match = file.match(/^packages\/core\/src\/([^/]+)\//);
    if (match && /^[A-Z]/.test(match[1])) stableComponents.add(match[1]);
    else if (!scoped) broadStableVisual = true;
  }

  for (const file of paths) {
    const pkgMatch = file.match(/^packages\/([^/]+)\//);
    if (pkgMatch) {
      const relativeManifest = path.join(
        'packages',
        pkgMatch[1],
        'package.json',
      );
      const pkg = readPackage(repoRoot, relativeManifest, manifests);
      if (pkg?.astryx?.canaryOnly === true) {
        canaryPackages.add(pkg.name ?? pkgMatch[1]);
      }
    }

    const themeMatch = file.match(
      /^packages\/themes\/([^/]+)\/(src\/|package\.json$)/,
    );
    if (!themeMatch) continue;
    const relativeManifest = path.join(
      'packages',
      'themes',
      themeMatch[1],
      'package.json',
    );
    const baseManifest = path.join(repoRoot, relativeManifest);
    const basePkg = fs.existsSync(baseManifest) ? readJSON(baseManifest) : null;
    const hasTrustedHeadManifest = Object.hasOwn(manifests, relativeManifest);
    const headPkg = hasTrustedHeadManifest
      ? manifests[relativeManifest]
      : basePkg;
    const isStable = pkg =>
      pkg && pkg.private !== true && pkg.astryx?.canaryOnly !== true;
    const baseStable = isStable(basePkg);
    const headStable = isStable(headPkg);
    const sourceChanged = themeMatch[2] === 'src/';
    const releaseChannelChanged =
      hasTrustedHeadManifest && baseStable !== headStable;

    // Theme source affects pixels. A manifest-only edit enters visual scope only
    // when trusted base/head metadata proves that the release channel changed;
    // build scripts and dependency cleanup do not alter rendered output.
    if (
      (sourceChanged && (baseStable || headStable)) ||
      releaseChannelChanged
    ) {
      stableThemes.add(themeMatch[1]);
      continue;
    }
    if (headPkg?.astryx?.canaryOnly === true) {
      canaryPackages.add(headPkg.name ?? themeMatch[1]);
    }
  }

  return {
    hasStableVisual:
      stableVisualInfrastructure ||
      stableCoreFiles.length > 0 ||
      stableThemes.size > 0,
    broadStableVisual,
    stableComponents: [...stableComponents].sort(),
    stableCoreFiles,
    stableThemes: [...stableThemes].sort(),
    canaryPackages: [...canaryPackages].sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = fs.readFileSync(0, 'utf8').split('\n');
  const manifestsFlag = process.argv.indexOf('--manifests');
  const manifests =
    manifestsFlag === -1
      ? {}
      : readJSON(path.resolve(process.argv[manifestsFlag + 1]));
  const result = classifyVisualScope(files, ROOT, manifests, {
    scoped: process.argv.includes('--scoped'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);

  const output = process.argv[process.argv.indexOf('--github-output') + 1];
  if (process.argv.includes('--github-output') && output) {
    const outputValue = values => {
      if (values.some(value => /[\r\n]/.test(value))) {
        throw new Error('visual scope output contains a line break');
      }
      return values.join(',');
    };
    fs.appendFileSync(
      output,
      [
        `stable_themes=${outputValue(result.stableThemes)}`,
        `canary_packages=${outputValue(result.canaryPackages)}`,
        `has_stable_visual=${result.hasStableVisual}`,
        `broad_stable_visual=${result.broadStableVisual}`,
      ].join('\n') + '\n',
    );
  }
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file integrationTargets.mjs
 *
 * Single decision point for which workspace integration packages a docsite
 * content target admits (their component docs, runnable blocks, and
 * playground scope modules).
 *
 * @input A resolved docsite target ('canary' | 'latest'), the docsite
 *   astryx.config, and — for `latest` — a predicate saying which configured
 *   packages are stable releases
 * @output The admitted package names in configuration order
 * @position scripts/generate-data.mjs applies the rule and records the
 *   admitted list in src/generated/integrationPackages.json;
 *   scripts/generate-scope.mjs and scripts/generate-playground-types.mjs read
 *   that record (`readAdmittedIntegrationPackages`) so the three generators
 *   document one set of packages from one content snapshot. Canary admits
 *   every configured integration. The
 *   production (`latest`) site admits only the configured integrations that
 *   are stable releases: packages whose manifest carries neither `private`
 *   nor `astryx.canaryOnly`, the same predicate release.yml uses for the
 *   stable npm tag and resolve-content-root.mjs uses to materialize the
 *   `latest` content snapshot. Canary-only packages (e.g. @astryxdesign/lab,
 *   spec:AST-017) therefore never reach production.
 *   Unit-tested directly in src/__tests__/integration-targets.test.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Whether a package manifest describes a stable release: one the release
 * workflow publishes to the stable npm tag. Mirrors the publishable predicate
 * in .github/workflows/release.yml and resolve-content-root.mjs.
 *
 * @param {{private?: unknown, astryx?: {canaryOnly?: unknown}}} manifest
 * @returns {boolean}
 */
export function isStableRelease(manifest) {
  return manifest?.private !== true && manifest?.astryx?.canaryOnly !== true;
}

/**
 * Whether `target` admits every configured integration without looking at
 * the package. Only canary does: `latest` documents the published stable
 * release, so it admits a configured integration only when that package is a
 * stable release (see {@link integrationPackagesForTarget}).
 *
 * @param {string} target resolved docsite target ('canary' | 'latest')
 * @returns {boolean}
 */
export function integrationContentEnabled(target) {
  return target === 'canary';
}

/**
 * The integration packages a target admits, in configuration order (the order
 * is meaningful: the playground runner resolves unqualified globals with
 * later-wins across scope entries, so a later-configured package owns a
 * shared export name).
 *
 * On canary every configured package is admitted. On `latest` a configured
 * package is admitted only when `isStablePackage(name)` says it is a stable
 * release; without a predicate, `latest` admits nothing, which keeps the
 * production exclusion the default for every caller that has no manifest to
 * consult.
 *
 * @param {string} target resolved docsite target ('canary' | 'latest')
 * @param {{integrations?: unknown}} [config] the docsite astryx.config module
 * @param {(name: string) => boolean} [isStablePackage] whether a configured
 *   package is a stable release (publishable to the stable npm tag)
 * @returns {string[]} admitted package names
 */
export function integrationPackagesForTarget(
  target,
  config,
  isStablePackage = () => false,
) {
  const configured = Array.isArray(config?.integrations)
    ? [...config.integrations]
    : [];
  if (integrationContentEnabled(target)) return configured;
  if (target !== 'latest') return [];
  return configured.filter(name => isStablePackage(name) === true);
}

/**
 * The integration packages generate-data.mjs admitted for this build, read
 * back from src/generated/integrationPackages.json. Later generators use
 * this instead of applying the rule again, which on `latest` would resolve
 * (and, while a promoted package awaits its first stable release,
 * re-download) the content snapshot once per generator.
 *
 * @param {string} generatedDir the docsite's src/generated directory
 * @param {string} target the target this generator resolved, for the
 *   consistency check
 * @returns {string[]} admitted package names in configuration order
 */
export function readAdmittedIntegrationPackages(generatedDir, target) {
  const file = path.join(generatedDir, 'integrationPackages.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} is missing: run scripts/generate-data.mjs first (pnpm generate runs the generators in order).`,
    );
  }
  const record = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (record.target !== target) {
    throw new Error(
      `${file} was generated for target "${record.target}", but this run resolves "${target}": rerun pnpm generate.`,
    );
  }
  return Array.isArray(record.packages) ? [...record.packages] : [];
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-content target gating tests.
 *
 * The production (`latest`) docsite documents a configured integration
 * package only when it is a stable release; a canary-only package
 * (@astryxdesign/lab et al., spec:AST-017) never reaches production.
 * generate-data.mjs applies that rule once (src/lib/integrationTargets.mjs)
 * and the other generators read its result; this file unit-tests the rule
 * for every target and pins the canary-side invariants that make the
 * exclusion provable from the generated artifacts.
 *
 * @input The shared integration admission rule, docsite config, and the
 *   canary-generated registries
 * @output Regression coverage for which integration content each target admits
 * @position Build-time docsite target verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import docsiteConfig from '../../astryx.config.mjs';
import {
  integrationContentEnabled,
  integrationPackagesForTarget,
  isStableRelease,
  readAdmittedIntegrationPackages,
} from '../lib/integrationTargets.mjs';
import {blocks} from '../generated/blockRegistry';
import {components} from '../generated/componentRegistry';
import {packages} from '../generated/packageRegistry';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('integration target gate', () => {
  it('admits integration content only on canary', () => {
    expect(integrationContentEnabled('canary')).toBe(true);
    expect(integrationContentEnabled('latest')).toBe(false);
  });

  it('returns the configured packages, in order, on canary', () => {
    expect(integrationPackagesForTarget('canary', docsiteConfig)).toEqual(
      docsiteConfig.integrations,
    );
  });

  it('returns no packages on latest without a stability predicate', () => {
    expect(integrationPackagesForTarget('latest', docsiteConfig)).toEqual([]);
  });

  it('admits only the configured packages the predicate calls stable, in order, on latest', () => {
    const config = {
      integrations: ['@astryxdesign/a', '@astryxdesign/b', '@astryxdesign/c'],
    };
    expect(
      integrationPackagesForTarget('latest', config, name =>
        ['@astryxdesign/c', '@astryxdesign/a'].includes(name),
      ),
    ).toEqual(['@astryxdesign/a', '@astryxdesign/c']);
    // Canary ignores the predicate: every configured package is admitted.
    expect(integrationPackagesForTarget('canary', config, () => false)).toEqual(
      config.integrations,
    );
  });

  it('reads back the admitted list generate-data.mjs recorded, for the same target', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-admitted-'));
    try {
      expect(() => readAdmittedIntegrationPackages(dir, 'canary')).toThrow(
        /run scripts\/generate-data\.mjs first/,
      );
      fs.writeFileSync(
        path.join(dir, 'integrationPackages.json'),
        JSON.stringify({target: 'latest', packages: ['@astryxdesign/a']}),
      );
      expect(readAdmittedIntegrationPackages(dir, 'latest')).toEqual([
        '@astryxdesign/a',
      ]);
      expect(() => readAdmittedIntegrationPackages(dir, 'canary')).toThrow(
        /generated for target "latest"/,
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('calls a manifest stable only without private or canaryOnly', () => {
    expect(isStableRelease({})).toBe(true);
    expect(isStableRelease({private: true})).toBe(false);
    expect(isStableRelease({astryx: {canaryOnly: true}})).toBe(false);
    expect(isStableRelease({private: false, astryx: {canaryOnly: false}})).toBe(
      true,
    );
  });

  it('tolerates a config without an integrations list', () => {
    expect(integrationPackagesForTarget('canary', {})).toEqual([]);
    expect(integrationPackagesForTarget('canary', undefined)).toEqual([]);
  });
});

describe('production-exclusion invariants (asserted on canary artifacts)', () => {
  it('attributes every integration-sourced block to a configured package', () => {
    // Every block the canary build admits beyond Core's CLI assets must come
    // from a package named in astryx.config — those are exactly the entries
    // the latest build drops, so nothing integration-shaped can ride along
    // unattributed.
    const configured = new Set<string>(docsiteConfig.integrations);
    const sourced = blocks.filter(block => block.sourcePackage != null);
    expect(sourced.length).toBeGreaterThan(0);
    for (const block of sourced) {
      expect(configured.has(block.sourcePackage as string)).toBe(true);
    }
  });

  it('attributes every non-core component entry to a configured package', () => {
    const configured = new Set<string>(docsiteConfig.integrations);
    for (const packageName of Object.keys(components)) {
      if (packageName === '@astryxdesign/core') {
        continue;
      }
      expect(configured.has(packageName)).toBe(true);
    }
  });

  it('admits a configured integration on latest only when it is a stable release', () => {
    // resolve-content-root.mjs materializes the `latest` content root from the
    // packages published to the stable npm tag, excluding `private` and
    // `astryx.canaryOnly` manifests (mirroring release.yml). The admission rule
    // uses the same predicate, so a canary-only integration can never reach
    // the production data pipeline, and a configured package that is a stable
    // release is documented there once its first stable release is published.
    const manifestOf = (name: string) => {
      const registryEntry = packages.find(pkg => pkg.name === name);
      // Present on canary (documented at all) …
      expect(
        registryEntry,
        `${name} missing from canary packageRegistry`,
      ).toBeDefined();
      return JSON.parse(
        fs.readFileSync(
          path.join(REPO_ROOT, registryEntry!.packagePath, 'package.json'),
          'utf-8',
        ),
      );
    };
    const admitted = new Set(
      integrationPackagesForTarget('latest', docsiteConfig, name =>
        isStableRelease(manifestOf(name)),
      ),
    );
    for (const name of docsiteConfig.integrations) {
      const manifest = manifestOf(name);
      const excludedFromStable =
        manifest.private === true || manifest.astryx?.canaryOnly === true;
      expect(
        admitted.has(name),
        excludedFromStable
          ? `${name} is private or astryx.canaryOnly and must stay off latest`
          : `${name} is a stable release and belongs on latest`,
      ).toBe(!excludedFromStable);
    }
  });

  it('documents @astryxdesign/lab on canary (presence proof for the exclusion tests)', () => {
    // The latest-target run proves absence; this proves the same pipeline
    // genuinely admits Lab components and blocks on canary, so the absence is
    // exclusion, not a silently empty catalog.
    expect(Object.keys(components)).toContain('@astryxdesign/lab');
    expect(
      blocks.some(block => block.sourcePackage === '@astryxdesign/lab'),
    ).toBe(true);
  });
});

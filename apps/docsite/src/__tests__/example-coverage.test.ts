// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Example-coverage report (report-only).
 *
 * Prints, for every configured integration package and for Core, how many
 * authored doc-example labels have a paired runnable block — starting from the
 * AUTHORED files, so an example that silently renders as a CLI snippet (no
 * runnable demo) is visible in CI logs. This is a REPORT, not a gate: Core
 * does not require pairing and integration packages are intentionally no
 * stricter (owner decision, 2026-09-30); a repo-wide pairing gate remains an
 * open decision. It also prints each public hook with no hook doc or no
 * example block. That list is a report too and never fails the run.
 *
 * @input Authored component docs and template descriptors across documented
 *   packages, committed API reports, plus the generated block and component
 *   registries
 * @output CI-visible coverage inventory (components and public hooks) and
 *   regression coverage for authored-block admission into the registry
 * @position Build-time docsite documentation-coverage reporting
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import docsiteConfig from '../../astryx.config.mjs';
import {
  inventoryPackageExamples,
  pairExampleCoverage,
  formatCoverageReport,
  resolveTemplatesRoot,
  readReportedHooks,
  pairHookExampleCoverage,
  formatHookCoverageReport,
} from '../lib/exampleCoverage.mjs';
import {blocks as registeredBlocks} from '../generated/blockRegistry';
import {components as registeredEntries} from '../generated/componentRegistry';
import {packages} from '../generated/packageRegistry';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

interface PackageInventory {
  packageName: string;
  packageDir: string;
  components: Awaited<
    ReturnType<typeof inventoryPackageExamples>
  >['components'];
  blocks: Awaited<ReturnType<typeof inventoryPackageExamples>>['blocks'];
  coverage: ReturnType<typeof pairExampleCoverage>;
}

async function inventoryIntegration(
  packageName: string,
): Promise<PackageInventory> {
  const registryEntry = packages.find(pkg => pkg.name === packageName);
  expect(
    registryEntry,
    `${packageName} missing from packageRegistry`,
  ).toBeDefined();
  const packageDir = path.join(REPO_ROOT, registryEntry!.packagePath);
  const {components, blocks} = await inventoryPackageExamples({
    repoRoot: REPO_ROOT,
    srcDir: path.join(packageDir, 'src'),
    blocksDir: await resolveTemplatesRoot(packageDir),
  });
  return {
    packageName,
    packageDir,
    components,
    blocks,
    coverage: pairExampleCoverage(components, blocks),
  };
}

async function inventoryAllPackages(): Promise<PackageInventory[]> {
  const inventories: PackageInventory[] = [];
  for (const packageName of docsiteConfig.integrations) {
    inventories.push(await inventoryIntegration(packageName));
  }
  // Core authors its runnable blocks centrally in the CLI's assets tree.
  const coreDir = path.join(REPO_ROOT, 'packages/core');
  const {components, blocks} = await inventoryPackageExamples({
    repoRoot: REPO_ROOT,
    srcDir: path.join(coreDir, 'src'),
    blocksDir: path.join(REPO_ROOT, 'packages/cli/assets/templates/blocks'),
  });
  inventories.push({
    packageName: '@astryxdesign/core',
    packageDir: coreDir,
    components,
    blocks,
    coverage: pairExampleCoverage(components, blocks),
  });
  return inventories;
}

describe('example coverage (report-only)', () => {
  it('reports authored example-label ↔ runnable-block coverage per package', async () => {
    const inventories = await inventoryAllPackages();
    for (const inventory of inventories) {
      // Write straight to stdout: vitest's console interceptor hides
      // console.* output for passing tests, and this report's whole job is
      // to be readable in CI logs.
      process.stdout.write(
        formatCoverageReport(
          inventory.packageName,
          inventory.coverage,
          inventory.blocks,
        ) + '\n',
      );
      // Report-only: the inventory must compute, nothing more.
      expect(Array.isArray(inventory.coverage)).toBe(true);
    }
  }, 120_000);

  it('reports public hooks with no hook doc or no example block', async () => {
    const inventories = await inventoryAllPackages();
    // A block in any package can be the example for a hook.
    const allBlocks = inventories.flatMap(inventory => inventory.blocks);
    for (const inventory of inventories) {
      const reportPath = path.join(inventory.packageDir, 'api-report.md');
      if (!fs.existsSync(reportPath)) {
        continue;
      }
      const hooks = readReportedHooks(fs.readFileSync(reportPath, 'utf8'));
      // The generator gives a hook page params; other pages get null.
      const hookDocNames = new Set(
        (registeredEntries[inventory.packageName] ?? [])
          .filter(entry => entry.params != null)
          .map(entry => entry.name),
      );
      if (hooks.length === 0) {
        continue;
      }
      process.stdout.write(
        formatHookCoverageReport(
          inventory.packageName,
          pairHookExampleCoverage(hooks, hookDocNames, allBlocks),
        ) + '\n',
      );
    }
  }, 120_000);

  it('reads hook names only from Hooks sections, once each', () => {
    const report = [
      '## `.`',
      '### Hooks',
      '```text',
      'hook useAlpha: () => void',
      'hook useBeta',
      '  (value: string): void',
      '  (value: number): void',
      '```',
      '### Functions',
      '```text',
      'hook useNotAHook: () => void',
      '```',
      '## `./Beta`',
      '### Hooks',
      '```text',
      'hook useBeta',
      '```',
    ].join('\n');
    expect(readReportedHooks(report)).toEqual(['useAlpha', 'useBeta']);
  });

  it('counts only loaded blocks that name the hook', () => {
    const block = {
      file: 'x.doc.mjs',
      type: 'block' as const,
      exampleFor: null,
      alsoExampleFor: [] as string[],
      isShowcase: false,
      hasSource: true,
    };
    const coverage = pairHookExampleCoverage(
      ['useAlpha', 'useBeta', 'useGamma'],
      new Set(['useAlpha']),
      [
        {...block, name: 'AlphaDemo', exampleFor: 'useAlpha'},
        {
          ...block,
          name: 'Shared',
          exampleFor: 'Card',
          alsoExampleFor: ['useBeta'],
        },
        {
          ...block,
          name: 'GammaPage',
          type: 'page' as const,
          exampleFor: 'useGamma',
        },
        {
          ...block,
          name: 'GammaBroken',
          exampleFor: 'useGamma',
          loadError: 'boom',
        },
      ],
    );
    expect(coverage).toEqual([
      {hook: 'useAlpha', hasDoc: true, exampleBlocks: ['AlphaDemo']},
      {hook: 'useBeta', hasDoc: false, exampleBlocks: ['Shared']},
      {hook: 'useGamma', hasDoc: false, exampleBlocks: []},
    ]);
    expect(formatHookCoverageReport('pkg', coverage)).toContain(
      'no example block: useGamma',
    );
  });

  it('admits every authored Lab block into the generated registry', async () => {
    // Authored → generated direction: a well-formed descriptor pair sitting in
    // packages/lab/blocks that never reaches blockRegistry would be a silent
    // drop in the plumbing (as opposed to an authoring choice, which the
    // report above covers). Lab currently has no broken descriptors, so every
    // authored block must appear, attributed to the package.
    const lab = await inventoryIntegration('@astryxdesign/lab');
    const registeredLabNames = new Set(
      registeredBlocks
        .filter(block => block.sourcePackage === '@astryxdesign/lab')
        .map(block => block.name),
    );
    for (const block of lab.blocks) {
      if (
        block.type !== 'block' ||
        block.loadError != null ||
        !block.hasSource
      ) {
        continue;
      }
      expect(
        registeredLabNames.has(block.name),
        `${block.file} is authored but missing from the generated blockRegistry`,
      ).toBe(true);
    }
  }, 60_000);
});

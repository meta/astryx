// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file exampleCoverage.mjs
 *
 * Read-only inventory pairing AUTHORED component-doc example labels with
 * AUTHORED runnable block descriptors, per documented package. It reads
 * authored inputs ONLY — it does not look at the generated registries, so it
 * cannot detect a block lost between authoring and generation (the Lab
 * authored→blockRegistry admission check in example-coverage.test.ts covers
 * that, for blockRegistry only). What it surfaces is authoring-side: a doc
 * example with no same-named runnable block, a block named after no label,
 * a descriptor missing its source, a descriptor that fails to load. An
 * unpaired label is a NAME mismatch, not proof the component has no demos —
 * blocks attach to a page via exampleFor regardless of name.
 *
 * It also lists each public hook (a hook in a committed API report) that has
 * no hook doc, or no block that names it in exampleFor/alsoExampleFor. The
 * caller supplies the hook-doc names from the generated component registry,
 * so the list matches the hook pages the docsite renders. It cannot tell
 * whether a block really demonstrates its hook; review checks that.
 *
 * REPORTS, NEVER GATES. Core does not require doc examples to have paired
 * blocks, and integration packages are intentionally no stricter (owner
 * decision, 2026-09-30). Whether example↔block pairing should gate CI is an
 * open repo-wide decision; until then tests print this inventory for CI-log
 * visibility only.
 *
 * @input Authored component docs (src/X/X.doc.mjs), template descriptors
 *   (the package's declared templates root, e.g. packages/lab/blocks), and
 *   committed API reports (packages/X/api-report.md)
 * @output Per-component pairing of example labels to block names, structural
 *   findings (missing same-stem sources, descriptor load failures), and
 *   per-hook doc and example-block coverage
 * @position Shared by docsite reporting tests; no generator consumes this.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseReport} from '../../../../scripts/api-report/changes.mjs';

/**
 * Basename prefix reserved for the automaticity test fixture
 * (example-automaticity.test.ts writes a temporary block pair into
 * packages/charts/blocks at runtime). The inventory skips it so the coverage
 * report and the fixture test cannot interfere when vitest runs both files in
 * parallel workers.
 */
export const AUTOMATICITY_FIXTURE_PREFIX = 'ZzDocsiteAutomaticityProbe';

const SRC_SKIP_DIRS = new Set(['utils', '__tests__', 'node_modules']);

/**
 * Template descriptor suffixes this inventory can load natively. `.doc.ts` /
 * `.template.ts` descriptors are valid for the CLI (loaded via jiti) but none
 * exist in this repo; they are collected as `skipped` rather than imported.
 */
const DESCRIPTOR_SUFFIXES = [
  '.doc.mjs',
  '.doc.js',
  '.template.mjs',
  '.template.js',
];
const TS_DESCRIPTOR_SUFFIXES = ['.doc.ts', '.template.ts'];

/**
 * @param {string} dir
 * @param {(name: string) => boolean} matches
 * @param {Set<string>} skipDirs
 * @returns {string[]}
 */
function walk(dir, matches, skipDirs = new Set()) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) out.push(...walk(full, matches, skipDirs));
    } else if (matches(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Resolve the templates root a package declares in its integration manifest.
 * Returns null when the package has no manifest or declares no templates root.
 * (Only `.mjs`/`.js` manifests are readable here; every in-repo integration
 * uses `.mjs`.)
 *
 * @param {string} packageDir absolute package directory
 * @returns {Promise<string | null>} absolute templates root or null
 */
export async function resolveTemplatesRoot(packageDir) {
  for (const basename of ['astryx.integration.mjs', 'astryx.integration.js']) {
    const manifestPath = path.join(packageDir, basename);
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = (await import(pathToFileURL(manifestPath).href)).default;
    if (typeof manifest?.templates !== 'string') return null;
    return path.resolve(packageDir, manifest.templates);
  }
  return null;
}

/**
 * @typedef {object} AuthoredComponentExamples
 * @property {string} name component doc name
 * @property {string} file repo-relative doc path
 * @property {string[]} labels authored example labels ('' for an unlabeled example)
 */

/**
 * @typedef {object} AuthoredBlock
 * @property {string} file repo-relative descriptor path
 * @property {string} name descriptor name (pairs with an example label by equality)
 * @property {'page'|'block'|null} type
 * @property {string | null} exampleFor
 * @property {string[]} alsoExampleFor
 * @property {boolean} isShowcase
 * @property {boolean} hasSource same-stem .tsx exists
 * @property {string} [loadError]
 */

/**
 * Inventory one package's authored docs and template descriptors.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string} options.srcDir absolute component-doc root (may not exist)
 * @param {string | null} options.blocksDir absolute templates root (null = none declared)
 * @returns {Promise<{components: AuthoredComponentExamples[], blocks: AuthoredBlock[], skippedTsDescriptors: string[]}>}
 */
export async function inventoryPackageExamples({repoRoot, srcDir, blocksDir}) {
  /** @type {AuthoredComponentExamples[]} */
  const components = [];
  for (const file of walk(
    srcDir,
    name => name.endsWith('.doc.mjs'),
    SRC_SKIP_DIRS,
  )) {
    try {
      const mod = await import(pathToFileURL(file).href);
      const docs = mod.docs;
      if (!docs || !Array.isArray(docs.examples) || docs.examples.length === 0)
        continue;
      components.push({
        name: docs.name ?? path.basename(file, '.doc.mjs'),
        file: path.relative(repoRoot, file),
        labels: docs.examples.map(example => example.label ?? ''),
      });
    } catch {
      // A component doc that does not load contributes no examples; the
      // docsite generator already warns on these during generation.
    }
  }

  /** @type {AuthoredBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  const skippedTsDescriptors = [];
  if (blocksDir != null) {
    const descriptorFiles = walk(blocksDir, name =>
      [...DESCRIPTOR_SUFFIXES, ...TS_DESCRIPTOR_SUFFIXES].some(suffix =>
        name.endsWith(suffix),
      ),
    );
    for (const file of descriptorFiles) {
      const basename = path.basename(file);
      if (basename.startsWith(AUTOMATICITY_FIXTURE_PREFIX)) continue;
      const suffix = [...DESCRIPTOR_SUFFIXES, ...TS_DESCRIPTOR_SUFFIXES].find(
        s => basename.endsWith(s),
      );
      if (suffix == null) continue;
      if (TS_DESCRIPTOR_SUFFIXES.includes(suffix)) {
        skippedTsDescriptors.push(path.relative(repoRoot, file));
        continue;
      }
      const stem = file.slice(0, -suffix.length);
      const entry = {
        file: path.relative(repoRoot, file),
        name: path.basename(stem),
        type: /** @type {'page'|'block'|null} */ (null),
        exampleFor: /** @type {string | null} */ (null),
        alsoExampleFor: /** @type {string[]} */ ([]),
        isShowcase: false,
        hasSource: fs.existsSync(`${stem}.tsx`),
      };
      try {
        const mod = await import(pathToFileURL(file).href);
        const doc = mod.default ?? mod.doc;
        entry.type =
          doc?.type === 'page' || doc?.type === 'block' ? doc.type : null;
        entry.name = doc?.name ?? entry.name;
        entry.exampleFor = doc?.exampleFor ?? null;
        entry.alsoExampleFor = Array.isArray(doc?.alsoExampleFor)
          ? doc.alsoExampleFor
          : [];
        entry.isShowcase = doc?.isShowcase === true;
      } catch (error) {
        blocks.push({
          ...entry,
          loadError: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      blocks.push(entry);
    }
  }

  return {components, blocks, skippedTsDescriptors};
}

/**
 * Loaded blocks that name `target` in `exampleFor` or `alsoExampleFor`.
 *
 * @param {AuthoredBlock[]} blocks
 * @param {string} target component or hook name
 * @returns {AuthoredBlock[]}
 */
function blocksAttributedTo(blocks, target) {
  return blocks.filter(
    block =>
      block.type === 'block' &&
      block.loadError == null &&
      (block.exampleFor === target || block.alsoExampleFor.includes(target)),
  );
}

/**
 * @typedef {object} ComponentCoverage
 * @property {string} component
 * @property {string[]} labels
 * @property {string[]} pairedNames block names attributed to the component
 * @property {string[]} missing labels with no same-named block
 * @property {string[]} extra attributed block names matching no label
 * @property {string[]} showcases attributed block names with isShowcase
 */

/**
 * Pair authored example labels with authored blocks by the recommended
 * naming convention: a block belongs to a component via
 * `exampleFor`/`alsoExampleFor`, and pairs with the example whose label equals
 * the block's `name`.
 *
 * @param {AuthoredComponentExamples[]} components
 * @param {AuthoredBlock[]} blocks
 * @returns {ComponentCoverage[]}
 */
export function pairExampleCoverage(components, blocks) {
  return components.map(component => {
    const attributed = blocksAttributedTo(blocks, component.name);
    const pairedNames = attributed.map(block => block.name);
    const nameSet = new Set(pairedNames);
    return {
      component: component.name,
      labels: component.labels,
      pairedNames,
      missing: component.labels.filter(label => !nameSet.has(label)),
      extra: pairedNames.filter(name => !component.labels.includes(name)),
      showcases: attributed
        .filter(block => block.isShowcase)
        .map(block => block.name),
    };
  });
}

/**
 * Human-readable coverage summary for one package, for CI-log visibility.
 *
 * @param {string} packageName
 * @param {ComponentCoverage[]} coverage
 * @param {AuthoredBlock[]} blocks
 * @returns {string}
 */
export function formatCoverageReport(packageName, coverage, blocks) {
  const lines = [`example coverage — ${packageName}`];
  const unpaired = coverage.filter(
    entry => entry.missing.length > 0 || entry.extra.length > 0,
  );
  const paired = coverage.length - unpaired.length;
  lines.push(
    `  ${coverage.length} component doc(s) with examples; ${paired} with every label paired to a same-named block`,
  );
  // "Unpaired" is a NAME mismatch, not necessarily a missing demo: a
  // component's page still renders every block attributed to it via
  // exampleFor. An unpaired LABEL means that example exists only as a CLI
  // snippet; an unpaired BLOCK NAME means the demo renders but under a name
  // no authored example uses.
  for (const entry of unpaired) {
    const parts = [];
    if (entry.missing.length > 0) {
      parts.push(
        `${entry.missing.length}/${entry.labels.length} label(s) unpaired — no same-named block${entry.pairedNames.length > 0 ? ` (component has ${entry.pairedNames.length} block(s) under other names)` : ' (example ships as a CLI snippet only)'}: ${entry.missing.map(label => JSON.stringify(label)).join(', ')}`,
      );
    }
    if (entry.extra.length > 0) {
      parts.push(
        `block name(s) not matching any label: ${entry.extra.map(name => JSON.stringify(name)).join(', ')}`,
      );
    }
    lines.push(`  - ${entry.component}: ${parts.join(' | ')}`);
  }
  const broken = blocks.filter(
    block => block.loadError != null || !block.hasSource,
  );
  for (const block of broken) {
    lines.push(
      `  ! ${block.file}: ${block.loadError ?? 'missing same-stem .tsx source'}`,
    );
  }
  return lines.join('\n');
}

/**
 * Hook names that an API report lists in its Hooks sections, sorted and
 * listed once each.
 *
 * @param {string} reportText content of a committed api-report.md
 * @returns {string[]}
 */
export function readReportedHooks(reportText) {
  const hookRows = [...parseReport(reportText).values()].filter(
    row => row.section === 'Hooks' && row.member == null,
  );
  return [
    ...new Set(hookRows.map(row => row.item.replace(/^hook /, ''))),
  ].sort();
}

/**
 * @typedef {object} HookCoverage
 * @property {string} hook
 * @property {boolean} hasDoc
 * @property {string[]} exampleBlocks names of blocks that name the hook
 */

/**
 * @param {string[]} hooks public hook names
 * @param {Set<string>} hookDocNames names of the hook pages the docsite renders
 * @param {AuthoredBlock[]} blocks
 * @returns {HookCoverage[]}
 */
export function pairHookExampleCoverage(hooks, hookDocNames, blocks) {
  return hooks.map(hook => ({
    hook,
    hasDoc: hookDocNames.has(hook),
    exampleBlocks: blocksAttributedTo(blocks, hook).map(block => block.name),
  }));
}

/**
 * Human-readable hook coverage for one package, for CI-log visibility.
 *
 * @param {string} packageName
 * @param {HookCoverage[]} coverage
 * @returns {string}
 */
export function formatHookCoverageReport(packageName, coverage) {
  const withoutDoc = coverage.filter(entry => !entry.hasDoc);
  const withoutExample = coverage.filter(
    entry => entry.exampleBlocks.length === 0,
  );
  const lines = [
    `hook example coverage — ${packageName}`,
    `  ${coverage.length} public hook(s); ${withoutDoc.length} without a hook doc; ${withoutExample.length} without a block naming them in exampleFor/alsoExampleFor`,
  ];
  if (withoutDoc.length > 0) {
    lines.push(
      `  - no hook doc: ${withoutDoc.map(entry => entry.hook).join(', ')}`,
    );
  }
  if (withoutExample.length > 0) {
    lines.push(
      `  - no example block: ${withoutExample.map(entry => entry.hook).join(', ')}`,
    );
  }
  return lines.join('\n');
}

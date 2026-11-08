// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.mjs
 * Post-build script that extracts StyleX CSS from compiled source files
 * and outputs a combined stylesheet wrapped in @layer astryx-base.
 *
 * Usage:
 *   node scripts/build-css.mjs                 # core  → packages/core/dist/astryx.css
 *   node scripts/build-css.mjs --package lab   # lab   → packages/lab/dist/lab.css
 *
 * This script:
 * 1. Walks component sources and explicit distribution entries through StyleX imports
 * 2. Runs Babel over the reachable modules and collects their StyleX rules
 * 3. Fails when the stylesheet reads a StyleX-generated variable that nothing
 *    declares (see undefinedStyleXVariables)
 * 4. Outputs a combined stylesheet that registers the Astryx layer order and
 *    places all rules in @layer astryx-base
 *
 * Dist consumers import the full stylesheet, e.g.:
 *   import '@astryxdesign/core/astryx.css';
 *   import '@astryxdesign/lab/lab.css';
 */

import stylexResolution from './stylex-module-resolution.cjs';
import {STYLEX_GENERATED_VARIABLE} from './lib/stylex-generated-variable.mjs';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The walk, the compile options and the layer block come from the source build
// of @astryxdesign/build. So both builds print the same stylesheet.
const {
  PREBUILT_OPTIONS,
  STYLEX_ENTRIES,
  STYLEX_MODULE,
  LAYER_ORDER,
  coreAliases,
  reachableModules,
  collectRules,
  processRules,
  layerBlock,
} = createRequire(import.meta.url)(
  '../packages/build/src/source-stylesheet.js',
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CORE_SRC = path.resolve(ROOT, 'packages/core/src');

// Per-package build targets. Each entry defines where source lives, where the
// stylesheet is written, and any StyleX module-resolution aliases needed for
// cross-package theme-token imports (lab consumes @astryxdesign/core tokens).
export const TARGETS = {
  core: {
    src: CORE_SRC,
    dist: path.resolve(ROOT, 'packages/core/dist'),
    outFile: 'astryx.css',
    banner: 'Astryx Pre-compiled StyleX CSS — all components',
    aliases: {},
    // The public dist dataVars entry is already compiled to var() references.
    // Dist consumers cannot retain its defineVars call, so astryx.css provides
    // this group even without a Core component import (spec:AST-066 FR3).
    stylexEntries: STYLEX_ENTRIES['@astryxdesign/core'],
  },
  lab: {
    src: path.resolve(ROOT, 'packages/lab/src'),
    dist: path.resolve(ROOT, 'packages/lab/dist'),
    outFile: 'lab.css',
    banner: 'Astryx Lab Pre-compiled StyleX CSS — experimental components',
    // lab imports @astryxdesign/core/theme/tokens.stylex; point the resolver at
    // core's source so the cross-package token reference resolves.
    aliases: coreAliases(CORE_SRC),
    // astryx.css always loads with this stylesheet, so a Core variable group
    // it already declares is not repeated here.
    provider: 'core',
  },
  charts: {
    src: path.resolve(ROOT, 'packages/charts/src'),
    dist: path.resolve(ROOT, 'packages/charts/dist'),
    outFile: 'charts.css',
    banner:
      'Astryx Charts Pre-compiled StyleX CSS — data visualization components',
    // charts imports @astryxdesign/core/theme/tokens.stylex; point the resolver
    // at core's source so the cross-package token reference resolves.
    aliases: coreAliases(CORE_SRC),
    // astryx.css always loads with this stylesheet, so a Core variable group
    // it already declares is not repeated here.
    provider: 'core',
  },
  richtext: {
    src: path.resolve(ROOT, 'packages/richtext/src'),
    dist: path.resolve(ROOT, 'packages/richtext/dist'),
    outFile: 'richtext.css',
    banner:
      'Astryx Rich Text Pre-compiled StyleX CSS — Lexical editor and viewer',
    // richtext imports @astryxdesign/core/theme/tokens.stylex; point the
    // resolver at core's source so the cross-package token reference resolves.
    aliases: coreAliases(CORE_SRC),
    // astryx.css always loads with this stylesheet, so a Core variable group
    // it already declares is not repeated here.
    provider: 'core',
  },
};

function parseTarget() {
  const idx = process.argv.indexOf('--package');
  const name = idx !== -1 ? process.argv[idx + 1] : 'core';
  const target = TARGETS[name];
  if (!target) {
    console.error(
      `Unknown --package "${name}". Valid: ${Object.keys(TARGETS).join(', ')}`,
    );
    process.exit(1);
  }
  return {
    name,
    ...target,
    provider: target.provider ? TARGETS[target.provider] : undefined,
  };
}

/** A target's walk: its source, aliases and explicit distribution modules. */
function walkOf(target) {
  return {
    srcDir: target.src,
    aliases: target.aliases,
    entries: (target.stylexEntries ?? []).map(entry =>
      path.resolve(target.src, entry),
    ),
  };
}

export async function collectStyleXCSS(target) {
  // A satellite leaves the variable modules its provider emits to the
  // provider's stylesheet.
  const provided = target.provider
    ? new Set(
        [...reachableModules(walkOf(target.provider))].filter(file =>
          STYLEX_MODULE.test(file),
        ),
      )
    : new Set();
  const {modules, rules} = await collectRules(walkOf(target), provided, {
    ...PREBUILT_OPTIONS,
    aliases: target.aliases,
    // The packages' JavaScript builds name StyleX variables with this
    // resolution too.
    unstable_moduleResolution: stylexResolution.stylexModuleResolution,
  });
  console.log(
    `Collected ${rules.length} StyleX rules from ${modules.size} reachable files`,
  );
  return rules;
}

/**
 * The cascade-layer order every Astryx stylesheet registers before its own
 * rules (spec:AST-080 FR3), the same line theme output carries
 * (spec:AST-066 FR7). Registering it in each file keeps
 * `reset < astryx-base < astryx-theme` whichever Astryx stylesheet loads first.
 */
export const ASTRYX_LAYER_ORDER = LAYER_ORDER;

/**
 * Wrap a package's compiled StyleX rules as its prebuilt stylesheet: a banner,
 * the layer-order registration, then every rule inside `@layer astryx-base`.
 */
export function composePackageStylesheet(banner, css) {
  return `/* ${banner} */\n/* Auto-generated. Do not edit manually. */\n\n${layerBlock(css)}`;
}

/**
 * The StyleX-generated custom properties a stylesheet reads that neither it
 * nor its provider's stylesheet declares. StyleX names a variable it
 * generates `--x<hash>`. One that is read but never declared is a value that
 * compiled to a variable no rule sets, so every browser drops the declaration
 * or takes its fallback. That happens when a style reads, from a `.stylex.ts`
 * module, a value StyleX cannot inline in that position: a plain exported
 * object or string, or a `defineConsts` member passed to `firstThatWorks` on
 * its own. The dynamic-style variables StyleX sets inline (`--x-<property>`)
 * are not generated names and are never reported, nor is a name that is not
 * hash-shaped (see STYLEX_GENERATED_VARIABLE).
 *
 * SYNC: packages/build/src/undefinedVariables.ts is the same check for an
 * app's production build.
 */
export function undefinedStyleXVariables(css, providerCss = '') {
  const declared = new Set(
    [...`${css}\n${providerCss}`.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map(
      match => match[1],
    ),
  );
  const read = new Set(
    [
      ...css.matchAll(
        new RegExp(
          String.raw`var\(\s*(${STYLEX_GENERATED_VARIABLE})\s*[,)]`,
          'g',
        ),
      ),
    ].map(match => match[1]),
  );
  return [...read].filter(name => !declared.has(name)).sort();
}

/** The rules of `css` that read `name`, for the failure message. */
function rulesReading(css, name) {
  return [...css.matchAll(/[^{}]+\{[^{}]*\}/g)]
    .map(match => match[0].trim())
    .filter(rule => rule.includes(`var(${name}`));
}

/**
 * The provider package's built stylesheet, or `null` when it has not been
 * built: a satellite may read a variable group only the provider declares.
 */
async function readProviderCss(provider) {
  try {
    return await fs.readFile(
      path.resolve(provider.dist, provider.outFile),
      'utf8',
    );
  } catch {
    return null;
  }
}

async function main() {
  const target = parseTarget();
  const allRules = await collectStyleXCSS(target);

  if (allRules.length === 0) {
    console.error('No StyleX rules found!');
    process.exit(1);
  }

  await fs.mkdir(target.dist, {recursive: true});

  const combinedCSS = processRules(allRules);

  const providerCss = target.provider
    ? await readProviderCss(target.provider)
    : '';
  if (providerCss === null) {
    console.warn(
      `${target.provider.outFile} is not built yet, so StyleX variables ${target.outFile} reads are not checked.`,
    );
  } else {
    const missing = undefinedStyleXVariables(combinedCSS, providerCss);
    if (missing.length > 0) {
      const detail = missing
        .flatMap(name => rulesReading(combinedCSS, name))
        .map(rule => `  ${rule}`)
        .join('\n');
      console.error(
        `${target.outFile} reads StyleX variables nothing declares: ${missing.join(', ')}.\n` +
          `A style reads, from a .stylex.ts module, a value StyleX cannot inline there:\n` +
          `a plain exported object or string (compose defineVars tokens instead), or a\n` +
          `defineConsts member passed to firstThatWorks on its own (wrap it in calc()).\n` +
          detail,
      );
      process.exit(1);
    }
  }

  const outPath = path.resolve(target.dist, target.outFile);
  await fs.writeFile(
    outPath,
    composePackageStylesheet(target.banner, combinedCSS),
    'utf8',
  );
  console.log(
    `${target.outFile}: ${(combinedCSS.length / 1024).toFixed(1)} KB`,
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

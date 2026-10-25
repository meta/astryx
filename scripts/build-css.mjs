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

import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import stylexResolution from './stylex-module-resolution.cjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {glob} from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Per-package build targets. Each entry defines where source lives, where the
// stylesheet is written, and any StyleX module-resolution aliases needed for
// cross-package theme-token imports (lab consumes @astryxdesign/core tokens).
const TARGETS = {
  core: {
    src: path.resolve(ROOT, 'packages/core/src'),
    dist: path.resolve(ROOT, 'packages/core/dist'),
    outFile: 'astryx.css',
    banner: 'Astryx Pre-compiled StyleX CSS — all components',
    aliases: {},
    // The public dist dataVars entry is already compiled to var() references.
    // Dist consumers cannot retain its defineVars call, so astryx.css provides
    // this group even without a Core component import (spec:AST-066 FR3).
    stylexEntries: ['theme/dataTokens.stylex.ts'],
  },
  lab: {
    src: path.resolve(ROOT, 'packages/lab/src'),
    dist: path.resolve(ROOT, 'packages/lab/dist'),
    outFile: 'lab.css',
    banner: 'Astryx Lab Pre-compiled StyleX CSS — experimental components',
    // lab imports @astryxdesign/core/theme/tokens.stylex; point the resolver at
    // core's source so the cross-package token reference resolves.
    aliases: {
      '@astryxdesign/core/*': [path.join(ROOT, 'packages/core/src/*')],
      '@astryxdesign/core': [path.join(ROOT, 'packages/core/src')],
    },
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
    aliases: {
      '@astryxdesign/core/*': [path.join(ROOT, 'packages/core/src/*')],
      '@astryxdesign/core': [path.join(ROOT, 'packages/core/src')],
    },
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
    aliases: {
      '@astryxdesign/core/*': [path.join(ROOT, 'packages/core/src/*')],
      '@astryxdesign/core': [path.join(ROOT, 'packages/core/src')],
    },
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

function staticStyleXImports(source) {
  const specifiers = [];
  const pattern =
    /\b(?:import|export)\s+([^'";]*?\sfrom\s*)?['"]([^'"]+\.stylex)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const clause = (match[1] ?? '').replace(/\s+from\s*$/, '').trim();
    if (/^type(?:\s|\*|\{)/.test(clause)) {
      continue;
    }

    // TypeScript also permits `import {type Foo}` and
    // `export {type Foo}`. Keep a mixed list when any runtime binding remains,
    // but do not make an all-type list retain a variable module.
    const named = /^\{([^}]*)\}$/.exec(clause);
    if (
      named &&
      named[1]
        .split(',')
        .map(specifier => specifier.trim())
        .filter(Boolean)
        .every(specifier => /^type\b/.test(specifier))
    ) {
      continue;
    }

    specifiers.push(match[2]);
  }
  return specifiers;
}

async function firstExistingModule(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next supported source spelling.
    }
  }
  return null;
}

async function resolveStyleXImport(specifier, importer, aliases) {
  if (specifier.startsWith('.')) {
    return firstExistingModule(path.resolve(path.dirname(importer), specifier));
  }

  for (const [pattern, replacements] of Object.entries(aliases)) {
    const wildcard = pattern.indexOf('*');
    const prefix = wildcard === -1 ? pattern : pattern.slice(0, wildcard);
    const suffix = wildcard === -1 ? '' : pattern.slice(wildcard + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }
    const matched = specifier.slice(
      prefix.length,
      suffix ? -suffix.length : undefined,
    );
    for (const replacement of replacements) {
      const candidate = replacement.replace('*', matched);
      const resolved = await firstExistingModule(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }
  return null;
}

const STYLEX_MODULE = /\.stylex\.[cm]?[jt]sx?$/;

/**
 * Walks a package from its all-component entry set through static `.stylex`
 * imports. Non-StyleX source files and explicitly retained distribution modules
 * are the entries; other variable modules join only through reachable imports.
 * This keeps source-like graphs selective without omitting Core's public dist
 * defaults. Modules in `provided` are left to the stylesheet that emits them;
 * the ones this package imports are added to `providedImports`.
 */
async function reachableSourceFiles(
  target,
  provided = new Set(),
  providedImports = new Set(),
) {
  const files = await glob('**/*.{ts,tsx}', {
    cwd: target.src,
    absolute: true,
    ignore: ['**/*.test.*', '**/*.d.ts', '**/node_modules/**'],
  });

  const queue = [
    ...files.filter(file => !STYLEX_MODULE.test(file)),
    ...(target.stylexEntries ?? []).map(entry =>
      path.resolve(target.src, entry),
    ),
  ].filter(file => !provided.has(file));
  const reachable = new Map();

  while (queue.length > 0) {
    const file = queue.shift();
    if (reachable.has(file)) {
      continue;
    }

    const code = await fs.readFile(file, 'utf8');
    reachable.set(file, code);
    for (const specifier of staticStyleXImports(code)) {
      const dependency = await resolveStyleXImport(
        specifier,
        file,
        target.aliases,
      );
      if (!dependency) {
        throw new Error(
          `Could not resolve StyleX dependency "${specifier}" from ${path.relative(ROOT, file)}`,
        );
      }
      if (!provided.has(dependency)) {
        queue.push(dependency);
      } else {
        providedImports.add(dependency);
      }
    }
  }
  return reachable;
}

/**
 * The variable modules a provider package's own stylesheet emits. A satellite
 * package that imports one of them relies on that stylesheet instead of
 * declaring the same group a second time.
 */
async function providedStyleXModules(provider) {
  if (!provider) {
    return new Set();
  }
  const reachable = await reachableSourceFiles(provider);
  return new Set(
    [...reachable.keys()].filter(file => STYLEX_MODULE.test(file)),
  );
}

/** A `defineConsts` value as StyleX collects it: a rule with `constKey`/`constVal`. */
function isConstantRule(rule) {
  const body = Array.isArray(rule) ? rule[1] : undefined;
  return body?.constKey != null && body?.constVal != null;
}

export async function collectStyleXCSS(target) {
  const provided = await providedStyleXModules(target.provider);
  const providedImports = new Set();
  const reachable = await reachableSourceFiles(
    target,
    provided,
    providedImports,
  );
  const allRules = [];

  console.log(`Processing ${reachable.size} reachable source files...`);

  for (const [file, code] of reachable) {
    if (!code.includes('@stylexjs/stylex')) {
      continue;
    }
    allRules.push(...(await compileStyleX(file, code, target)));
  }

  // A constant read from a provider's module as a value (lab reading a core
  // motion duration) compiles to a placeholder that only the constant's own
  // rule resolves, and a constant is inlined where it is read; at-rule keys
  // stay literal. So the constants of
  // every provided module this package imports join its rules (they emit no
  // CSS); the module's variables stay in the provider's stylesheet.
  for (const file of providedImports) {
    const rules = await compileStyleX(
      file,
      await fs.readFile(file, 'utf8'),
      target,
    );
    allRules.push(...rules.filter(isConstantRule));
  }

  console.log(
    `Collected ${allRules.length} StyleX rules from ${reachable.size} reachable files`,
  );
  return allRules;
}

/** One file's StyleX rules, compiled as every package stylesheet compiles them. */
async function compileStyleX(file, code, target) {
  try {
    const result = await transformAsync(code, {
      babelrc: false,
      filename: file,
      presets: [
        ['@babel/preset-typescript', {isTSX: true, allExtensions: true}],
        ['@babel/preset-react', {runtime: 'automatic'}],
      ],
      plugins: [
        [
          stylexBabelPlugin,
          {
            dev: false,
            runtimeInjection: false,
            genConditionalClasses: true,
            treeshakeCompensation: true,
            aliases: target.aliases,
            unstable_moduleResolution: stylexResolution.stylexModuleResolution,
          },
        ],
      ],
    });

    return result?.metadata?.stylex ?? [];
  } catch (err) {
    throw new Error(
      `Could not process ${path.relative(ROOT, file)}: ${err.message}`,
      {cause: err},
    );
  }
}

/**
 * The cascade-layer order every Astryx stylesheet registers before its own
 * rules (spec:AST-080 FR3), the same line theme output carries
 * (spec:AST-066 FR7). Registering it in each file keeps
 * `reset < astryx-base < astryx-theme` whichever Astryx stylesheet loads first.
 */
export const ASTRYX_LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

/**
 * Wrap a package's compiled StyleX rules as its prebuilt stylesheet: a banner,
 * the layer-order registration, then every rule inside `@layer astryx-base`.
 */
export function composePackageStylesheet(banner, css) {
  const body = css
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');
  return `/* ${banner} */\n/* Auto-generated. Do not edit manually. */\n\n${ASTRYX_LAYER_ORDER}\n\n@layer astryx-base {\n${body}\n}\n`;
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
 * are not generated names and are never reported.
 */
export function undefinedStyleXVariables(css, providerCss = '') {
  const declared = new Set(
    [...`${css}\n${providerCss}`.matchAll(/(--x[a-z0-9]+)\s*:/g)].map(
      match => match[1],
    ),
  );
  const read = new Set(
    [...css.matchAll(/var\(\s*(--x[a-z0-9]+)\s*[,)]/g)].map(match => match[1]),
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

  const combinedCSS = stylexBabelPlugin.processStylexRules(allRules, false);

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

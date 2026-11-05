// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build` from a PACKED CLI resolving a genuinely older core.
 *
 * The unit-level sibling (build.adaptation-core-compat.test.mjs) drives
 * `themeBuild()` directly. This one reproduces the pairing a consumer actually
 * has: the CLI's published file set installed under
 * `node_modules/@astryxdesign/cli`, next to a `node_modules/@astryxdesign/core`
 * that behaves like the published 0.5.4. Nothing is mocked; the CLI binary runs
 * in its own process and resolves core the way Node does, which is the layer
 * the regression lived in (`astryx theme build` failed with ERR_CORE_NOT_FOUND
 * for every theme, adaptations or not).
 *
 * The old core is adaptation-BLIND, not "the current core minus one export".
 * Its `defineTheme` does what 0.5.4's did: it never reads `adaptations`, and
 * the theme it returns carries no adaptation metadata at all. That is what
 * makes the source analysis load-bearing — the resolved object is silent about
 * adaptations the author wrote, so a build that trusted it would emit CSS with
 * every rule missing. Its `./theme` entry exports exactly 0.5.4's surface,
 * which really does include `generateOnMediaCSS` and `dataTokenDefaults`; the
 * only capability it lacks is `generateAdaptationCSS`.
 *
 * On outputs: the CSS is compared with old and current cores, and must match.
 * The generated JS module is NOT: a current core resolves normalized
 * `__adaptations` metadata onto every theme and the module serializes it, so a
 * plain theme's `.js` legitimately differs between the two. That drift is
 * asserted rather than wished away — it is also why `theme build --check`
 * against outputs committed with a current core reports drift on an older one.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {findInstalledPackage} from '../../../foundation/fs/paths.mjs';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const CLI_PKG = path.join(REPO_ROOT, 'packages/cli');
const CORE_DIST = path.join(REPO_ROOT, 'packages/core/dist');
const CORE_THEME_ENTRY = path.join(CORE_DIST, 'theme/index.js');

/** The CLI's published file set (packages/cli package.json `files`). */
const PACKED_DIRS = ['clients', 'api', 'assets', 'authoring', 'foundation'];
/** Runtime dependencies the packed CLI resolves from its install root. */
const RUNTIME_DEPS = [
  '@babel/parser',
  'commander',
  'ignore',
  'jiti',
  'jscodeshift',
  'zod',
];

// Both Cores carry the packed CLI's own version: a run through the bin in a
// project whose Core is another release is handed to that release (spec
// AST-081 FR2), so the old surface is told apart by what it exports, not by
// its version.
const OLD_CORE_VERSION = CLI_VERSION;
const CURRENT_CORE_VERSION = CLI_VERSION;
const TSC_BIN = path.join(REPO_ROOT, 'node_modules/typescript/bin/tsc');

/**
 * A core that predates ordered adaptations.
 *
 * `defineTheme` is adaptation-blind on both sides: `adaptations` never reaches
 * the resolver, and no adaptation metadata comes back out — including through
 * `extends`, which is how 0.5.4 behaved for a base theme it did not understand.
 * It also predates retained `__axes` metadata: generative axes still produce
 * root tokens, but the resolved theme does not expose the inputs for a later
 * current-core child to complete a partial adaptation axis from. Everything
 * else is the real generator, so a CSS difference between this core and a
 * current one can only come from the CLI's own branching.
 *
 * The export list is 0.5.4's `./theme` surface. `generateOnMediaCSS` and
 * `dataTokenDefaults` are on it deliberately: they exist in 0.5.4, and
 * pretending otherwise would test a core that never shipped.
 */
const OLD_CORE_THEME_MODULE = `import {defineTheme as resolveTheme} from ${JSON.stringify(
  CORE_THEME_ENTRY,
)};

export {
  generateThemeCSS,
  generateThemeRules,
  generateThemeRulesSplit,
  generateOnMediaCSS,
  isDefinedTheme,
  tokenDefaults,
  dataTokenDefaults,
} from ${JSON.stringify(CORE_THEME_ENTRY)};

/** Strip every adaptation field and retained axis metadata; this core has no concept of them. */
function blind(value) {
  if (!value || typeof value !== 'object') return value;
  const {adaptations, __adaptations, __adaptationRules, __axes, ...rest} = value;
  if (rest.extends) rest.extends = blind(rest.extends);
  return rest;
}

export function defineTheme(input) {
  return blind(resolveTheme(blind(input)));
}
`;

/** A current core: the whole surface, adaptations included. */
const CURRENT_CORE_THEME_MODULE = `export * from ${JSON.stringify(
  CORE_THEME_ENTRY,
)};\n`;

let root;
let consumer;
let corePkg;

/**
 * Mirror a directory as a tree of symlinks to its entries, so the fixture can
 * replace ONE file of a large built package without copying the rest.
 * @param {string} from
 * @param {string} to
 * @param {string[]} [except] - entry names to skip
 */
function linkEntries(from, to, except = []) {
  fs.mkdirSync(to, {recursive: true});
  for (const entry of fs.readdirSync(from)) {
    if (except.includes(entry)) continue;
    fs.symlinkSync(path.join(from, entry), path.join(to, entry));
  }
}

/**
 * Install one of the two cores under the fixture's `node_modules`. The version
 * moves with the surface so generated provenance headers differ exactly as
 * they would between two real releases.
 * @param {'old' | 'current'} surface
 */
function useCore(surface) {
  const old = surface === 'old';
  fs.writeFileSync(
    path.join(corePkg, 'package.json'),
    `${JSON.stringify(
      {
        name: '@astryxdesign/core',
        version: old ? OLD_CORE_VERSION : CURRENT_CORE_VERSION,
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './theme': './dist/theme/index.js',
          './*': './dist/*/index.js',
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(corePkg, 'dist/theme/index.js'),
    old ? OLD_CORE_THEME_MODULE : CURRENT_CORE_THEME_MODULE,
  );
}

/**
 * Install a theme package under the fixture's `node_modules`, shaped like a
 * published Astryx theme: a `./built` subpath exporting the module
 * `generateBuiltModule` writes.
 * @param {string} name - Package name.
 * @param {string} exportName - The theme's export name.
 * @param {string} adaptationsLiteral - The `__adaptations` object source.
 * @param {{esmOnly?: boolean}} [options] - `esmOnly` publishes an `exports`
 *   map with only an `import` condition, which `require` resolution rejects.
 */
function installThemePackage(
  name,
  exportName,
  adaptationsLiteral,
  options = {},
) {
  const pkgRoot = path.join(root, 'node_modules', name);
  fs.mkdirSync(path.join(pkgRoot, 'dist'), {recursive: true});
  const builtFile = options.esmOnly ? 'built.mjs' : 'built.js';
  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: '0.5.4',
        type: 'module',
        ...(options.esmOnly
          ? {exports: {'./built': {import: `./dist/${builtFile}`}}}
          : {
              main: './dist/source.js',
              exports: {
                '.': './dist/source.js',
                './built': './dist/built.js',
              },
            }),
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(pkgRoot, 'dist', builtFile),
    `export const ${exportName} = {
  name: '${exportName}',
  __built: true,
  tokens: {'--color-surface': '#eee'},
  __adaptations: ${adaptationsLiteral},
};
`,
  );
  if (!options.esmOnly) {
    fs.writeFileSync(
      path.join(pkgRoot, 'dist/source.js'),
      `export {${exportName}} from './built.js';\n`,
    );
  }
}

/**
 * Install a package whose SOURCE calls `defineTheme` at load time, rather than
 * shipping a built object literal. Its core import must resolve to the wrapped
 * one for its author's adaptations to be observable at all.
 * @param {string} name
 * @param {string} exportName
 * @param {string} adaptationsSource - Source for the `adaptations:` entry, or ''.
 * @param {{cjs?: boolean, tla?: boolean}} [options]
 */
function installSourcePackage(
  name,
  exportName,
  adaptationsSource,
  options = {},
) {
  const pkgRoot = path.join(root, 'node_modules', name);
  fs.mkdirSync(path.join(pkgRoot, 'src'), {recursive: true});
  const entry = options.cjs ? 'src/index.cjs' : 'src/index.mjs';
  fs.writeFileSync(
    path.join(pkgRoot, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: '0.5.4',
        ...(options.cjs ? {} : {type: 'module'}),
        main: `./${entry}`,
        exports: {'.': `./${entry}`},
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(pkgRoot, entry),
    options.cjs
      ? `const {defineTheme} = require('@astryxdesign/core/theme');
exports.${exportName} = defineTheme({
  name: '${exportName}',
  tokens: {'--color-surface': '#eee'},
  ${adaptationsSource}
});
`
      : `import {defineTheme} from '@astryxdesign/core/theme';
${options.tla ? `const surface = await Promise.resolve('#eee');\n` : ''}export const ${exportName} = defineTheme({
  name: '${exportName}',
  tokens: {'--color-surface': ${options.tla ? 'surface' : "'#eee'"}},
  ${adaptationsSource}
});
`,
  );
}

/**
 * @param {string | string[]} themeFile
 * @param {string[]} [extraArgs]
 * @returns {{status: number, envelope: any}}
 */
function buildTheme(themeFile, extraArgs = []) {
  const bin = path.join(
    root,
    'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs',
  );
  try {
    // A packed CLI outside any project's package.json reads as installed for
    // the computer, so it gets a home folder of its own: nothing it keeps for
    // the computer lands in the real one.
    const home = path.join(root, 'home');
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      XDG_CACHE_HOME: path.join(home, '.cache'),
      NO_UPDATE_NOTIFIER: '1',
    };
    // prettier-ignore
    const stdout = execFileSync(process.execPath, [bin, 'theme', 'build', ...(Array.isArray(themeFile) ? themeFile : [themeFile]), ...extraArgs, '--json'], {cwd: consumer, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe']});
    return {status: 0, envelope: JSON.parse(stdout)};
  } catch (error) {
    const e = /** @type {any} */ (error);
    return {status: e.status ?? 1, envelope: JSON.parse(String(e.stdout))};
  }
}

/**
 * Generated content with only its leading `@generated` provenance header
 * removed. Split on the FIRST close marker: a generated JS module has a second
 * block comment of its own, and cutting at every marker would compare nothing
 * but that comment.
 */
function bodyOf(file) {
  const content = fs.readFileSync(path.join(consumer, file), 'utf8');
  const end = content.indexOf('*/\n');
  return end === -1 ? content : content.slice(end + 3);
}

/** @param {string} name @param {string} source */
function theme(name, source) {
  fs.writeFileSync(path.join(consumer, name), source);
  return name;
}

/** @param {string} base */
function outputsExist(base) {
  return ['css', 'js', 'd.ts'].some(ext =>
    fs.existsSync(path.join(consumer, `${base}.${ext}`)),
  );
}

/** Type-check the shipped template against 0.5.4's pre-adaptation input. */
function typecheckShippedTemplateAgainstCore054() {
  const fixture = path.join(consumer, 'template-core-0.5.4');
  fs.rmSync(fixture, {recursive: true, force: true});
  fs.mkdirSync(fixture, {recursive: true});

  const template = fs
    .readFileSync(path.join(CLI_PKG, 'assets/theme.template.ts'), 'utf8')
    .replace("from '@astryxdesign/core/theme';", "from './core-0.5.4.js';");
  fs.writeFileSync(path.join(fixture, 'theme.template.ts'), template);

  // Core 0.5.4's DefineThemeInput field set, with each field retaining its real
  // type from Core. Keeping the keys explicit prevents a future Core field from
  // making this compatibility fixture silently more permissive.
  fs.writeFileSync(
    path.join(fixture, 'core-0.5.4.d.ts'),
    `import type {
  DefineThemeInput as CurrentDefineThemeInput,
  DefinedTheme,
} from '@astryxdesign/core/theme';
export type DefineThemeInput = Pick<
  CurrentDefineThemeInput,
  | 'name'
  | 'extends'
  | 'typography'
  | 'motion'
  | 'radius'
  | 'color'
  | 'tokens'
  | 'localTokens'
  | 'components'
  | 'icons'
  | 'indicators'
  | 'syntax'
  | 'onDark'
  | 'onLight'
>;
export declare function defineTheme(input: DefineThemeInput): DefinedTheme;
`,
  );
  fs.writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['theme.template.ts', 'core-0.5.4.d.ts'],
      },
      null,
      2,
    )}\n`,
  );

  try {
    execFileSync(
      process.execPath,
      [TSC_BIN, '--project', path.join(fixture, 'tsconfig.json')],
      {cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
    );
    return {ok: true, output: ''};
  } catch (error) {
    const e = /** @type {any} */ (error);
    return {ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}`};
  }
}

const ADAPTATIONS = `{
    widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
    rules: [
      {when: {pointer: 'coarse'}, value: {tokens: {'--size-element-md': '44px'}}},
    ],
  }`;

const MALFORMED_ADAPTATIONS = [
  ['rules-string', `{rules: 'invalid'}`],
  ['rules-null', `{rules: null}`],
  ['rules-object', `{rules: {invalid: true}}`],
  ['points-array', `{widthBreakpoints: []}`],
  ['points-null', `{widthBreakpoints: null}`],
];

beforeAll(() => {
  // The `node` project's globalSetup builds core before any worker forks; a
  // missing dist here means that contract broke, not that this test is
  // optional.
  expect(
    fs.existsSync(CORE_THEME_ENTRY),
    'packages/core must be built before this suite (vitest.global-setup.node.mjs)',
  ).toBe(true);

  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-packed-old-core-'));
  consumer = path.join(root, 'app');
  fs.mkdirSync(consumer, {recursive: true});
  const modules = path.join(root, 'node_modules');

  // The packed CLI, as published.
  const cli = path.join(modules, '@astryxdesign/cli');
  fs.mkdirSync(cli, {recursive: true});
  for (const dir of PACKED_DIRS) {
    fs.cpSync(path.join(CLI_PKG, dir), path.join(cli, dir), {recursive: true});
  }
  fs.mkdirSync(path.join(cli, 'scripts'), {recursive: true});
  fs.copyFileSync(
    path.join(CLI_PKG, 'scripts/postinstall.mjs'),
    path.join(cli, 'scripts/postinstall.mjs'),
  );
  fs.copyFileSync(
    path.join(CLI_PKG, 'package.json'),
    path.join(cli, 'package.json'),
  );

  // Its runtime dependencies, resolved from the install root like a real one.
  // Found from the CLI package rather than the repo root: only a hoisted
  // node_modules puts a package's own dependencies at the workspace root.
  for (const dep of RUNTIME_DEPS) {
    const installed = findInstalledPackage(CLI_PKG, dep);
    if (!installed) throw new Error(`${dep} is not installed under ${CLI_PKG}`);
    const target = path.join(modules, dep);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.symlinkSync(fs.realpathSync(installed), target);
  }

  // The installed core. Real built implementations behind a swappable
  // `./theme` entry; component docs live in `src` in the published package
  // too, and the theme build reads them to validate component overrides.
  corePkg = path.join(modules, '@astryxdesign/core');
  fs.mkdirSync(corePkg, {recursive: true});
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages/core/src'),
    path.join(corePkg, 'src'),
  );
  linkEntries(CORE_DIST, path.join(corePkg, 'dist'), ['theme']);
  linkEntries(path.join(CORE_DIST, 'theme'), path.join(corePkg, 'dist/theme'), [
    'index.js',
  ]);
  useCore('old');

  // Two installed theme packages, shaped like a published one: a `./built`
  // subpath exporting a built theme module. The plain one carries the default
  // no-op width map every shipped built theme has; the adaptive one carries
  // rules. Both are resolved by bare specifier, from the consumer's file.
  installThemePackage(
    '@fixture/theme-plain',
    'plainPackageTheme',
    `{widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536}, rules: []}`,
  );
  installThemePackage(
    '@fixture/theme-adaptive',
    'adaptivePackageTheme',
    `{
    widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
    rules: [{when: {contrast: 'more'}, value: {tokens: {'--color-border': '#000'}}}],
  }`,
  );
  // ESM-only `exports` maps: `require` resolution throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED on these, the loader resolves them fine.
  installThemePackage(
    '@fixture/theme-esm',
    'esmAdaptiveTheme',
    `{widthBreakpoints: {sm: 600, md: 900, lg: 1200, xl: 1500, '2xl': 1800}, rules: []}`,
    {esmOnly: true},
  );
  installThemePackage(
    '@fixture/theme-esm-plain',
    'esmPlainTheme',
    `{widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536}, rules: []}`,
    {esmOnly: true},
  );
  // A CommonJS package artifact.
  const cjsRoot = path.join(root, 'node_modules/@fixture/theme-cjs');
  fs.mkdirSync(cjsRoot, {recursive: true});
  fs.writeFileSync(
    path.join(cjsRoot, 'package.json'),
    `${JSON.stringify({name: '@fixture/theme-cjs', version: '0.5.4', main: './index.js'}, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(cjsRoot, 'index.js'),
    `exports.cjsPackageTheme = {
  name: 'cjs-base',
  __built: true,
  tokens: {'--color-surface': '#eee'},
  __adaptations: {widthBreakpoints: {sm: 600, md: 900, lg: 1200, xl: 1500, '2xl': 1800}, rules: []},
};
`,
  );

  theme(
    'plain.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const plainTheme = defineTheme({
  name: 'plain',
  tokens: {'--color-background': '#fff'},
  components: {button: {base: {borderRadius: '4px'}}},
});
`,
  );
  theme(
    'adaptive.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const adaptiveTheme = defineTheme({
  name: 'adaptive',
  tokens: {'--color-background': '#fff'},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme(
    'shorthand.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const adaptations = ${ADAPTATIONS};
export const shorthandTheme = defineTheme({
  name: 'shorthand',
  tokens: {'--color-background': '#fff'},
  adaptations,
});
`,
  );
  theme(
    'shared-config.ts',
    `export const sharedConfig = {adaptations: ${ADAPTATIONS}};\n`,
  );
  theme(
    'spread.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {sharedConfig} from './shared-config';
export const spreadTheme = defineTheme({
  name: 'spread',
  tokens: {'--color-background': '#fff'},
  ...sharedConfig,
});
`,
  );
  theme(
    'adaptive-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const adaptiveBase = defineTheme({
  name: 'adaptive-base',
  tokens: {'--color-background': '#fff'},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme(
    'extending.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {adaptiveBase} from './adaptive-base';
export const extendingTheme = defineTheme({
  name: 'extending',
  tokens: {'--color-accent': '#09f'},
  extends: adaptiveBase,
});
`,
  );
  // Zero rules, but a CUSTOM width map: no CSS, yet real semantics an older
  // core drops (built metadata, AppShell breakpoint names, extends).
  theme(
    'breakpoints-only.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const breakpointsOnlyTheme = defineTheme({
  name: 'breakpoints-only',
  tokens: {'--color-background': '#fff'},
  adaptations: {
    widthBreakpoints: {sm: 600, md: 900, lg: 1200, xl: 1500, '2xl': 1800},
    rules: [],
  },
});
`,
  );
  theme(
    'no-op-adaptations.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const noOpAdaptationsTheme = defineTheme({
  name: 'no-op-adaptations',
  tokens: {'--color-background': '#fff'},
  adaptations: {
    widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
    rules: [],
  },
});
`,
  );
  for (const [name, adaptations] of MALFORMED_ADAPTATIONS) {
    theme(
      `malformed-${name}.ts`,
      `import {defineTheme} from '@astryxdesign/core/theme';
export const malformedTheme = defineTheme({
  name: 'malformed-${name}',
  tokens: {'--color-background': '#fff'},
  adaptations: ${adaptations},
});
`,
    );
  }
  // Extends a real INSTALLED theme package whose built artifact carries only
  // the default no-op width map — the documented pattern, and what every
  // shipped theme's `/built` subpath actually looks like. Must keep building.
  theme(
    'extends-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {plainPackageTheme} from '@fixture/theme-plain/built';
export const extendsPackageTheme = defineTheme({
  name: 'extends-package',
  tokens: {'--color-accent': '#09f'},
  extends: plainPackageTheme,
});
`,
  );
  // Same shape, but the installed package's built artifact carries rules.
  theme(
    'extends-adaptive-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {adaptivePackageTheme} from '@fixture/theme-adaptive/built';
export const extendsAdaptivePackageTheme = defineTheme({
  name: 'extends-adaptive-package',
  tokens: {'--color-accent': '#09f'},
  extends: adaptivePackageTheme,
});
`,
  );
  // Negative control: the word is everywhere, the declaration is nowhere.
  theme(
    'commented.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
/**
 * No adaptations here. A future revision might add:
 *   adaptations: {rules: [{when: {pointer: 'coarse'}, value: {}}]}
 */
// adaptations: {widthBreakpoints: {sm: 600}, rules: []},
const note = 'adaptations: none';
export const commentedTheme = defineTheme({
  name: 'commented',
  tokens: {'--color-background': '#fff'},
  components: {button: {base: {borderRadius: '4px'}}},
  /* adaptations: {rules: [{when: {pointer: 'coarse'}, value: {}}]}, */
});
export {note};
`,
  );
  // Re-export barrel — the shape every shipped theme's `src/source.ts` has.
  theme(
    'reexported-theme.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const reexportedTheme = defineTheme({
  name: 'reexport',
  tokens: {'--color-background': '#fff'},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme('reexport.ts', `export {reexportedTheme} from './reexported-theme';\n`);
  theme(
    'plain-reexported-theme.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const plainReexportedTheme = defineTheme({
  name: 'plain-reexport',
  tokens: {'--color-background': '#fff'},
  components: {button: {base: {borderRadius: '4px'}}},
});
`,
  );
  theme(
    'plain-reexport.ts',
    `export {plainReexportedTheme} from './plain-reexported-theme';\n`,
  );
  theme(
    'star-reexported-theme.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const starReexportedTheme = defineTheme({
  name: 'star-reexport',
  tokens: {'--color-background': '#fff'},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme('star-reexport.ts', `export * from './star-reexported-theme';\n`);
  // Local factory wrapper.
  theme(
    'factory.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const makeTheme = input => defineTheme({...input, tokens: {'--color-background': '#fff'}});
export const factoryTheme = makeTheme({name: 'factory', adaptations: ${ADAPTATIONS}});
`,
  );
  theme(
    'plain-factory.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const makeTheme = input => defineTheme({...input, tokens: {'--color-background': '#fff'}});
export const plainFactoryTheme = makeTheme({name: 'plain-factory'});
`,
  );
  // A theme whose only export the analysis cannot read at all.
  theme(
    'unreadable.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const build = () => defineTheme({name: 'unreadable', tokens: {}, adaptations: ${ADAPTATIONS}});
export const unreadableTheme = [build()][0];
`,
  );
  // Extends an ESM-only installed package: `require` cannot resolve its
  // `exports` map, the loader can.
  theme(
    'extends-esm-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {esmAdaptiveTheme} from '@fixture/theme-esm/built';
export const extendsEsmTheme = defineTheme({
  name: 'extends-esm-package',
  tokens: {'--color-accent': '#09f'},
  extends: esmAdaptiveTheme,
});
`,
  );
  theme(
    'extends-esm-plain-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {esmPlainTheme} from '@fixture/theme-esm-plain/built';
export const extendsEsmPlainTheme = defineTheme({
  name: 'extends-esm-plain-package',
  tokens: {'--color-accent': '#09f'},
  extends: esmPlainTheme,
});
`,
  );
  // A runtime BRANCH decides whether adaptations are used. No static reading
  // of the source can answer this; watching the call does.
  theme(
    'branch.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const wanted = ['a', 'daptive'].join('') === 'adaptive';
export const branchTheme = defineTheme({
  name: 'branch',
  tokens: {'--color-background': '#fff'},
  ...(wanted ? {adaptations: ${ADAPTATIONS}} : {}),
});
`,
  );
  theme(
    'branch-plain.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const wanted = ['a', 'daptive'].join('') === 'nope';
export const branchPlainTheme = defineTheme({
  name: 'branch-plain',
  tokens: {'--color-background': '#fff'},
  ...(wanted ? {adaptations: ${ADAPTATIONS}} : {}),
});
`,
  );
  // Object-SPREAD of a base theme rather than `extends:` — the case a WeakMap
  // alone would lose, since a spread makes a brand-new object.
  theme(
    'spread-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {adaptiveBase} from './adaptive-base';
export const spreadBaseTheme = defineTheme({
  ...adaptiveBase,
  name: 'spread-base',
});
`,
  );
  theme(
    'plain-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const plainBase = defineTheme({
  name: 'plain-base',
  tokens: {'--color-background': '#fff'},
});
`,
  );
  theme(
    'spread-plain-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {plainBase} from './plain-base';
export const spreadPlainBaseTheme = defineTheme({
  ...plainBase,
  name: 'spread-plain-base',
});
`,
  );
  // Direct `extends` of a raw object literal, no import at all.
  theme(
    'direct-extends.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const directExtendsTheme = defineTheme({
  name: 'direct-extends',
  tokens: {'--color-accent': '#09f'},
  extends: {name: 'inline-base', tokens: {}, adaptations: ${ADAPTATIONS}},
});
`,
  );
  // Imported from the package ROOT rather than the `/theme` subpath.
  theme(
    'root-import.ts',
    `import {defineTheme} from '@astryxdesign/core';
export const rootImportTheme = defineTheme({
  name: 'root-import',
  tokens: {'--color-background': '#fff'},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme(
    'root-import-plain.ts',
    `import {defineTheme} from '@astryxdesign/core';
export const rootImportPlainTheme = defineTheme({
  name: 'root-import-plain',
  tokens: {'--color-background': '#fff'},
});
`,
  );
  // A CommonJS installed base package.
  theme(
    'extends-cjs-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {cjsPackageTheme} from '@fixture/theme-cjs';
export const extendsCjsTheme = defineTheme({
  name: 'extends-cjs-package',
  tokens: {'--color-accent': '#09f'},
  extends: cjsPackageTheme,
});
`,
  );
  // An adaptive theme sitting UNUSED beside the selected plain one. Only the
  // selected theme's lineage may decide; this must build.
  theme(
    'unused-sibling.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const unusedAdaptive = defineTheme({
  name: 'unused-adaptive',
  tokens: {},
  adaptations: ${ADAPTATIONS},
});
export default defineTheme({
  name: 'unused-sibling',
  tokens: {'--color-background': '#fff'},
  components: {button: {base: {borderRadius: '4px'}}},
});
`,
  );
  // Same, one module away: the import graph carries an adaptive theme the
  // selected one never uses.
  theme(
    'unused-imported.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {adaptiveBase} from './adaptive-base';
export const unusedImportedTheme = defineTheme({
  name: 'unused-imported',
  tokens: {'--color-background': String(typeof adaptiveBase === 'object' ? '#fff' : '#000')},
});
`,
  );
  // Installed packages whose SOURCE calls defineTheme at runtime, rather than
  // shipping a built object literal. Their `defineTheme` must be the wrapped
  // one — a package resolving its own real core would erase the author's
  // adaptations where nothing can see it.
  installSourcePackage(
    '@fixture/theme-src-adaptive',
    'srcAdaptiveTheme',
    `adaptations: {
    widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
    rules: [{when: {pointer: 'coarse'}, value: {tokens: {'--size-element-md': '44px'}}}],
  },`,
  );
  installSourcePackage('@fixture/theme-src-plain', 'srcPlainTheme', '');
  installSourcePackage(
    '@fixture/theme-src-cjs-adaptive',
    'srcCjsAdaptiveTheme',
    `adaptations: {
    widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
    rules: [{when: {motion: 'reduce'}, value: {tokens: {'--motion-fast': '0ms'}}}],
  },`,
    {cjs: true},
  );

  theme(
    'extends-src-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {srcAdaptiveTheme} from '@fixture/theme-src-adaptive';
export const extendsSrcTheme = defineTheme({
  name: 'extends-src-package',
  tokens: {'--color-accent': '#09f'},
  extends: srcAdaptiveTheme,
});
`,
  );
  theme(
    'extends-src-plain-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {srcPlainTheme} from '@fixture/theme-src-plain';
export const extendsSrcPlainTheme = defineTheme({
  name: 'extends-src-plain-package',
  tokens: {'--color-accent': '#09f'},
  extends: srcPlainTheme,
});
`,
  );
  theme(
    'extends-src-cjs-package.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {srcCjsAdaptiveTheme} from '@fixture/theme-src-cjs-adaptive';
export const extendsSrcCjsTheme = defineTheme({
  name: 'extends-src-cjs-package',
  tokens: {'--color-accent': '#09f'},
  extends: srcCjsAdaptiveTheme,
});
`,
  );
  // Imports a NON-theme export from the package root. Mapping the root to the
  // theme namespace would delete it and break this build.
  theme(
    'root-only-export.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {Button} from '@astryxdesign/core';
export const rootOnlyExportTheme = defineTheme({
  name: 'root-only-export',
  tokens: {'--color-background': typeof Button === 'undefined' ? 'MISSING' : '#fff'},
});
`,
  );

  // A source theme with every generative axis and no adaptation intent. An old
  // core resolves its tokens but retains no `__axes`; the packed CLI must carry
  // the captured authoring metadata into the built artifact so a current-core
  // child can complete a partial adaptation axis source-equivalently.
  theme(
    'axis-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const axisBase = defineTheme({
  name: 'axis-base',
  typography: {scale: {base: 15, ratio: 1.2}},
  color: {accent: '#0064E0', neutralStyle: 'warm', contrast: 'high'},
  radius: {base: 6, multiplier: 1},
  motion: {fast: 120, medium: 300, slow: 700, ratio: 0.75},
});
`,
  );
  theme(
    'axis-roundtrip-child.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {axisBaseTheme} from './axis-base.js';
export const axisRoundTripChild = defineTheme({
  name: 'axis-child',
  extends: axisBaseTheme,
  adaptations: {
    rules: [{when: {pointer: 'coarse'}, value: {radius: {multiplier: 2}}}],
  },
});
`,
  );
  theme(
    'axis-source-child.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {axisBase} from './axis-base.ts';
export const axisSourceChild = defineTheme({
  name: 'axis-child',
  extends: axisBase,
  adaptations: {
    rules: [{when: {pointer: 'coarse'}, value: {radius: {multiplier: 2}}}],
  },
});
`,
  );

  // ── Top-level await: forces the DEGRADED load path ────────────────────
  // The sync loader cannot evaluate TLA, so the load falls back to the async
  // import. The entry's own `defineTheme` still routes through the wrapped
  // core there, so a self-contained theme stays fully observed and must build.
  // What the async path loses is TRANSPILING installed packages, so a package
  // SOURCE on that path resolves its own core and escapes observation.
  theme(
    'tla-entry.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const accent = await Promise.resolve('#09f');
export const tlaEntryTheme = defineTheme({
  name: 'tla-entry',
  tokens: {'--color-accent': accent},
  components: {button: {base: {borderRadius: '4px'}}},
});
`,
  );
  theme(
    'tla-entry-adaptive.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const accent = await Promise.resolve('#09f');
export const tlaEntryAdaptiveTheme = defineTheme({
  name: 'tla-entry-adaptive',
  tokens: {'--color-accent': accent},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme(
    'tla-sibling-helper.mjs',
    `export const accent = await Promise.resolve('#09f');\n`,
  );
  theme(
    'tla-sibling.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {accent} from './tla-sibling-helper.mjs';
export const tlaSiblingTheme = defineTheme({
  name: 'tla-sibling',
  tokens: {'--color-accent': accent},
  components: {button: {base: {borderRadius: '4px'}}},
});
`,
  );
  theme(
    'tla-sibling-base.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {accent} from './tla-sibling-helper.mjs';
export const tlaSiblingBase = defineTheme({
  name: 'tla-sibling-base-inner',
  tokens: {'--color-surface': accent},
  adaptations: ${ADAPTATIONS},
});
`,
  );
  theme(
    'tla-sibling-adaptive.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {tlaSiblingBase} from './tla-sibling-base';
export const tlaSiblingAdaptiveTheme = defineTheme({
  name: 'tla-sibling-adaptive',
  tokens: {'--color-accent': '#09f'},
  extends: tlaSiblingBase,
});
`,
  );
  // The genuinely escaped case: a TLA theme extending an installed package's
  // SOURCE, which the async path never transpiles, so its own core resolves
  // unwrapped and this core erases its adaptations unobserved.
  theme(
    'tla-dependency.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {srcPlainTheme} from '@fixture/theme-src-plain';
const accent = await Promise.resolve('#09f');
export const tlaDependencyTheme = defineTheme({
  name: 'tla-dependency',
  tokens: {'--color-accent': accent},
  extends: srcPlainTheme,
});
`,
  );
  // TLA with nothing unobservable in the lineage: degraded, but every member
  // is either recorded or carries its own metadata, so it must still build.
  theme(
    'tla-self-contained.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
const accent = await Promise.resolve('#09f');
export const tlaSelfContainedTheme = defineTheme({
  name: 'tla-self-contained',
  tokens: {'--color-accent': accent},
});
`,
  );
  // A genuine author error must surface AS ITSELF, never be downgraded to the
  // async path — which would also execute the module's side effects twice.
  theme(
    'author-throws.ts',
    `import * as fs from 'node:fs';
import {defineTheme} from '@astryxdesign/core/theme';
fs.appendFileSync(new URL('./author-throws.log', import.meta.url), 'x');
export const authorThrowsTheme = defineTheme({
  name: 'author-throws',
  tokens: {'--color-background': (() => { throw new Error('deliberate author bug'); })()},
});
`,
  );
}, 120_000);

afterAll(() => {
  if (root) fs.rmSync(root, {recursive: true, force: true});
});

describe('packed CLI against a core that predates adaptations', () => {
  beforeAll(() => useCore('old'));

  it('rejects a family before an old core can erase adaptations', () => {
    // prettier-ignore
    const result = buildTheme(['adaptive-base.ts', 'extending.ts'], ['--family', '--family-key', 'adaptive-family']);
    expect(result.envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
  });

  it('builds a non-adaptation theme', () => {
    const {status, envelope} = buildTheme('plain.ts');

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    expect(envelope.type).toBe('theme.build');
    const css = fs.readFileSync(path.join(consumer, 'plain.css'), 'utf8');
    expect(css).toContain('--color-background: #fff;');
    expect(css).toContain('border-radius: 4px;');
    expect(css).toContain(`Core: @astryxdesign/core@${OLD_CORE_VERSION}`);
  });

  it('keeps the shipped template type-compatible with Core 0.5.4', () => {
    const template = fs.readFileSync(
      path.join(CLI_PKG, 'assets/theme.template.ts'),
      'utf8',
    );
    expect(template).not.toMatch(/^\s{2}adaptations:/m);
    expect(template).toMatch(/^\s{2}\/\/ adaptations: \{/m);

    const result = typecheckShippedTemplateAgainstCore054();
    expect(
      result.ok,
      `Core 0.5.4 rejected the shipped theme template:\n${result.output}`,
    ).toBe(true);
  });

  it('builds a theme that only talks about adaptations in comments and strings', () => {
    const {status, envelope} = buildTheme('commented.ts');

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    expect(
      fs.readFileSync(path.join(consumer, 'commented.css'), 'utf8'),
    ).toContain('border-radius: 4px;');
  });

  it('builds a theme extending an installed theme package with no adaptation intent', () => {
    // The documented pattern — `extends` a shipped theme's `/built` subpath.
    // Its `__adaptations` is the default no-op map, so the bare specifier must
    // resolve and the theme must build, not become an unresolved guess.
    const {status, envelope} = buildTheme('extends-package.ts');

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    expect(
      fs.readFileSync(path.join(consumer, 'extends-package.css'), 'utf8'),
    ).toContain('--color-accent: #09f;');
  });

  it.each([
    ['a raw complete default adaptation map', 'no-op-adaptations'],
    ['a plain re-export barrel', 'plain-reexport'],
    ['a plain local factory', 'plain-factory'],
    ['an ESM-only package base with no intent', 'extends-esm-plain-package'],
    ['a runtime branch that skips adaptations', 'branch-plain'],
    ['a spread of a plain base theme', 'spread-plain-base'],
    ['a root `@astryxdesign/core` import', 'root-import-plain'],
    ['an unused adaptive sibling in the same module', 'unused-sibling'],
    ['an unused adaptive theme one module away', 'unused-imported'],
    [
      'a package whose SOURCE defines a plain theme',
      'extends-src-plain-package',
    ],
  ])('builds a theme reaching the loader through %s', (_label, base) => {
    const {status, envelope} = buildTheme(`${base}.ts`);

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    expect(fs.existsSync(path.join(consumer, `${base}.css`))).toBe(true);
  });

  it('preserves exports that only the package ROOT has', () => {
    // The wrapped root must be the root namespace, not the theme namespace
    // wearing its name — a theme importing a component from
    // `@astryxdesign/core` would otherwise get `undefined`.
    const {status, envelope} = buildTheme('root-only-export.ts');

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    const css = fs.readFileSync(
      path.join(consumer, 'root-only-export.css'),
      'utf8',
    );
    expect(css).not.toContain('MISSING');
    expect(css).toContain('--color-background: #fff;');
  });

  it.each([
    ['in the entry file', 'tla-entry'],
    ['in a relative sibling module', 'tla-sibling'],
    ['with no package base at all', 'tla-self-contained'],
  ])(
    'builds a plain theme when top-level await %s forces the fallback path',
    (_label, base) => {
      // Degraded, but not blind: the entry's own `defineTheme` still routes
      // through the wrapped core on the async path, so the whole lineage was
      // observed and there is nothing unproven. Failing these would make the
      // guard fire on ordinary correct themes.
      const {status, envelope} = buildTheme(`${base}.ts`);

      expect({status, error: envelope.error}).toEqual({
        status: 0,
        error: undefined,
      });
      expect(fs.existsSync(path.join(consumer, `${base}.css`))).toBe(true);
    },
  );

  it.each([
    ['declared in the entry file', 'tla-entry-adaptive'],
    ['inherited from a relative base', 'tla-sibling-adaptive'],
  ])('still detects adaptations %s under top-level await', (_label, base) => {
    // Degrading the load must not lose real intent: these are observed, and
    // their captured raw input still carries the author's `adaptations`.
    const {status, envelope} = buildTheme(`${base}.ts`);

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
    expect(envelope.error).toContain('generateAdaptationCSS');
    expect(outputsExist(base)).toBe(false);
  });

  it('refuses a package base that escaped observation on the fallback path', () => {
    // The one genuinely unprovable shape: the async path does not transpile
    // installed packages, so this base's own `defineTheme` is the real one.
    // This core erases adaptations while resolving, so whether it had any is
    // unknowable — and unproven must not build.
    const {status, envelope} = buildTheme('tla-dependency.ts');

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
    expect(envelope.error).toMatch(/could not be observed/);
    expect(envelope.error).toMatch(/top-level await/);
    expect(envelope.error).toContain('srcPlainTheme');
    expect(outputsExist('tla-dependency')).toBe(false);
  });

  it('surfaces a genuine author error without executing the theme twice', () => {
    // The narrow fallback exists for sync-loader limitations only. An author's
    // own exception must reach them as itself — never be swallowed into a
    // second, weaker load, which would also re-run every side effect the
    // module had already performed.
    const log = path.join(consumer, 'author-throws.log');
    fs.rmSync(log, {force: true});

    const {status, envelope} = buildTheme('author-throws.ts');

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_THEME_LOAD');
    expect(envelope.error).toContain('deliberate author bug');
    // One 'x' per execution of the theme module.
    expect(fs.readFileSync(log, 'utf8')).toBe('x');
  });

  it('never serializes the lineage marker into generated output', () => {
    buildTheme('unused-sibling.ts');

    for (const ext of ['css', 'js', 'd.ts']) {
      const content = fs.readFileSync(
        path.join(consumer, `unused-sibling.${ext}`),
        'utf8',
      );
      expect(content).not.toContain('astryx.theme.lineage');
      expect(content).not.toContain('Symbol');
    }
  });

  it.each(MALFORMED_ADAPTATIONS)(
    'refuses malformed adaptation metadata in %s',
    name => {
      const base = `malformed-${name}`;
      const {status, envelope} = buildTheme(`${base}.ts`);

      expect(status).toBe(1);
      expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
      expect(outputsExist(base)).toBe(false);
    },
  );

  it('refuses a CommonJS source package when its core namespace cannot be wrapped', () => {
    const base = 'extends-src-cjs-package';
    const {status, envelope} = buildTheme(`${base}.ts`);

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
    expect(envelope.error).toMatch(/could not be observed/i);
    expect(envelope.error).toMatch(/CommonJS/i);
    expect(outputsExist(base)).toBe(false);
  });

  it.each([
    ['a direct `adaptations` property', 'adaptive'],
    ['the object shorthand', 'shorthand'],
    ['a spread of an imported config', 'spread'],
    ['an `extends` base that declares them', 'extending'],
    ['a custom width map with no rules', 'breakpoints-only'],
    [
      'an installed theme package that declares them',
      'extends-adaptive-package',
    ],
    ['an `export {x} from` re-export barrel', 'reexport'],
    ['an `export * from` barrel', 'star-reexport'],
    ['a local factory wrapper', 'factory'],
    ['an ESM-only installed package', 'extends-esm-package'],
    ['a runtime branch that adds them', 'branch'],
    ['an object spread of an adaptive base', 'spread-base'],
    ['a direct `extends` of a raw object', 'direct-extends'],
    ['a root `@astryxdesign/core` import', 'root-import'],
    ['a CommonJS installed package base', 'extends-cjs-package'],
    ['a package whose SOURCE calls defineTheme', 'extends-src-package'],
  ])('refuses a theme declaring adaptations via %s', (_label, base) => {
    const {status, envelope} = buildTheme(`${base}.ts`);

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
    expect(envelope.error).toContain('generateAdaptationCSS');
    expect(outputsExist(base)).toBe(false);
  });

  it('refuses a theme whose export shape it could never have read statically', () => {
    // The loader builds this file happily, and no source analysis could
    // attribute its export. Interception does not have to: the call happened,
    // so the raw input was recorded.
    const {status, envelope} = buildTheme('unreadable.ts');

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
    expect(envelope.error).toContain('generateAdaptationCSS');
    expect(outputsExist('unreadable')).toBe(false);
  });

  it('fails --check the same way, without reporting drift instead', () => {
    const {status, envelope} = buildTheme('adaptive.ts', ['--check']);

    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CORE_INCOMPATIBLE');
  });
});

describe('the same themes once core supports adaptations', () => {
  beforeAll(() => useCore('current'));

  it.each([
    'adaptive',
    'shorthand',
    'spread',
    'extending',
    'breakpoints-only',
    'extends-package',
    'extends-adaptive-package',
    'reexport',
    'star-reexport',
    'factory',
    'unreadable',
    'extends-esm-package',
    'branch',
    'spread-base',
    'direct-extends',
    'root-import',
    'extends-cjs-package',
    'no-op-adaptations',
    'extends-src-package',
    'extends-src-plain-package',
    'extends-src-cjs-package',
    'root-only-export',
    'tla-entry',
    'tla-entry-adaptive',
    'tla-sibling',
    'tla-sibling-adaptive',
    'tla-dependency',
    'tla-self-contained',
  ])('builds %s', base => {
    const {status, envelope} = buildTheme(`${base}.ts`);

    expect({status, error: envelope.error}).toEqual({
      status: 0,
      error: undefined,
    });
    // Also pins each fixture's theme NAME to its file name, which is what
    // makes the "wrote nothing" assertions under the older core meaningful:
    // outputs are named after the theme, so a drifting name would quietly
    // turn those checks vacuous.
    expect(fs.existsSync(path.join(consumer, `${base}.css`))).toBe(true);
  });

  it('emits adaptation CSS from a CommonJS source package', () => {
    buildTheme('extends-src-cjs-package.ts');

    const css = fs.readFileSync(
      path.join(consumer, 'extends-src-cjs-package.css'),
      'utf8',
    );
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('--motion-fast: 0ms;');
  });

  it('emits the adaptation CSS the older core could not', () => {
    buildTheme('adaptive.ts');

    const css = fs.readFileSync(path.join(consumer, 'adaptive.css'), 'utf8');
    expect(css).toContain('pointer: coarse');
    expect(css).toContain('--size-element-md: 44px;');
  });
});

describe('old-Core generative-axis round trip', () => {
  it('preserves raw axes for a current-Core child with a partial radius adaptation', () => {
    useCore('old');
    const baseBuild = buildTheme('axis-base.ts');
    expect({status: baseBuild.status, error: baseBuild.envelope.error}).toEqual(
      {
        status: 0,
        error: undefined,
      },
    );
    const builtBase = bodyOf('axis-base.js');
    expect(builtBase).toContain('__axes');
    expect(builtBase).toContain('"typography"');
    expect(builtBase).toContain('"color"');
    expect(builtBase).toContain('"radius"');
    expect(builtBase).toContain('"motion"');
    expect(builtBase).toContain('"base": 6');

    useCore('current');
    const roundTripBuild = buildTheme('axis-roundtrip-child.ts');
    expect({
      status: roundTripBuild.status,
      error: roundTripBuild.envelope.error,
    }).toEqual({status: 0, error: undefined});
    const roundTripCss = bodyOf('axis-child.css');

    const sourceBuild = buildTheme('axis-source-child.ts');
    expect({
      status: sourceBuild.status,
      error: sourceBuild.envelope.error,
    }).toEqual({
      status: 0,
      error: undefined,
    });
    expect(roundTripCss).toBe(bodyOf('axis-child.css'));
    expect(roundTripCss).toContain('--radius-inner: 12px;');
    expect(roundTripCss).toContain('--radius-container: 36px;');
  });
});

describe('output parity across the two cores', () => {
  it('emits identical CSS for a theme with no adaptations', () => {
    useCore('old');
    buildTheme('plain.ts');
    const oldCss = bodyOf('plain.css');

    useCore('current');
    buildTheme('plain.ts');

    // Bodies only: the `@generated` header records the core version, which
    // differs between two releases by design.
    expect(oldCss).toBe(bodyOf('plain.css'));
  });

  it('emits a JS module that differs only by resolved adaptation metadata', () => {
    // Documented drift, not a defect: a current core normalizes `__adaptations`
    // onto every theme and the built module serializes it for `extends`. An
    // older core has no such metadata to serialize. This is why `--check`
    // against outputs committed with a current core reports JS drift on an
    // older one — the CSS is still identical.
    useCore('old');
    buildTheme('plain.ts');
    const oldJs = bodyOf('plain.js');

    useCore('current');
    buildTheme('plain.ts');
    const currentJs = bodyOf('plain.js');

    expect(oldJs).not.toBe(currentJs);
    expect(oldJs).not.toContain('__adaptations');
    expect(currentJs).toContain('__adaptations');
    // Nothing else moved: strip the metadata block and they agree.
    expect(
      currentJs.replace(/ {2}__adaptations: \{[\s\S]*?\n {2}\},\n/, ''),
    ).toBe(oldJs);
  });
});

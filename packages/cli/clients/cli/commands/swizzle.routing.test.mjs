// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-routing tests for `astryx swizzle`.
 *
 * The copy's module graph is tested in api/swizzle/copy/copy.test.mjs. These
 * tests exercise the end-to-end command behavior by running the CLI in-process
 * against hermetic fixtures: a fake @astryxdesign/core under node_modules plus, for the
 * integration cases, a configured integration package (astryx.config.mjs +
 * astryx.integration.mjs + a `components` dir) — all under node_modules so the
 * config/manifest loaders resolve normally.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
/** The StyleX runtime that Core ships with, resolved the way Core resolves it. */
const CORE_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../core/package.json',
);

/**
 * Build a fake @astryxdesign/core under <project>/node_modules with a single
 * swizzleable Button component (bare `Button.tsx`, no doc) that imports an
 * exported StyleX module.
 */
function buildFakeCore(project) {
  const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  const buttonDir = path.join(core, 'src', 'Button');
  fs.mkdirSync(buttonDir, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/core',
      version: '0.0.13',
      exports: {
        './theme/tokens.stylex': {
          source: './src/theme/tokens.stylex.ts',
          default: './dist/theme/tokens.stylex.js',
        },
      },
    }),
  );
  fs.mkdirSync(path.join(core, 'src', 'theme'), {recursive: true});
  fs.writeFileSync(
    path.join(core, 'src', 'theme', 'tokens.stylex.ts'),
    `export const tokens = {};\n`,
  );
  fs.writeFileSync(
    path.join(buttonDir, 'Button.tsx'),
    [
      `import {tokens} from '../theme/tokens.stylex';`,
      `import {helper} from './helper';`,
      `export const Button = () => null;`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(buttonDir, 'helper.ts'),
    `export const helper = 1;\n`,
  );
  return core;
}

/**
 * Build a configured integration package `@test/meta` under
 * <project>/node_modules with a same-stem component (source + doc) that
 * imports an unexported helper beside its folder, plus a colocated test file. Writes astryx.config.mjs at the
 * project root listing the integration.
 *
 * @param {string} project
 * @param {{issuesUrl?: string|null, componentName?: string}} [opts]
 */
function buildIntegration(project, {issuesUrl, componentName = 'MetaAppShell'} = {}) {
  const intDir = path.join(project, 'node_modules', '@test', 'meta');
  const compRoot = path.join(intDir, 'components');
  const compDir = path.join(compRoot, componentName);
  fs.mkdirSync(compDir, {recursive: true});
  fs.writeFileSync(
    path.join(intDir, 'package.json'),
    JSON.stringify({name: '@test/meta', version: '1.2.3'}),
  );
  const manifest = {components: './components'};
  if (issuesUrl) manifest.issuesUrl = issuesUrl;
  fs.writeFileSync(
    path.join(intDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify(manifest)};\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.tsx`),
    [
      `import x from '../utils/foo';`,
      `import {sib} from './sibling';`,
      `export function ${componentName}() { return x; }`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(compDir, 'sibling.ts'), `export const sib = 1;\n`);
  // An unexported helper beside the component folder.
  fs.mkdirSync(path.join(compRoot, 'utils'), {recursive: true});
  fs.writeFileSync(
    path.join(compRoot, 'utils', 'foo.ts'),
    `export default 1;\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.doc.mjs`),
    `export const docs = {name: '${componentName}', usage: {description: 'x'}};\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.test.tsx`),
    `it('noop', () => {});\n`,
  );
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    `export default {integrations: ['@test/meta']};\n`,
  );
  return {intDir, compDir};
}

function writeProjectPackageJson(project, extra = {}) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0', ...extra}),
  );
}

let tmpDir;
let project;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-routing-'));
  project = path.join(tmpDir, 'project');
  fs.mkdirSync(project, {recursive: true});
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('swizzle — core feedback routing via config', () => {
  it('routes core feedback to config.issuesUrl when set', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    fs.writeFileSync(
      path.join(project, 'astryx.config.mjs'),
      `export default {issuesUrl: 'https://github.com/acme/ds/issues'};\n`,
    );

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@astryxdesign/core');
    expect(env.data.feedback.issuesUrl).toBe('https://github.com/acme/ds/issues');
    // Escaping import rewritten to core; sibling import preserved.
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '@astryxdesign/core/theme/tokens.stylex'`);
    expect(out).toContain(`from './helper'`);
  });

  it('falls back to the default issues URL when config has none', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.feedback.issuesUrl).toBe(
      'https://github.com/meta/astryx/issues/new',
    );
  });
});

describe('swizzle — the npm packages a copy imports', () => {
  it('prints an install line with each range quoted for the shell', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    const manifest = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf-8'));
    manifest.dependencies = {'d3-scale': '^4.0.2'};
    manifest.peerDependencies = {react: '>=19.0.0'};
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(core, 'src', 'Button', 'Button.tsx'),
      `import {scaleLinear} from 'd3-scale';\nimport {useState} from 'react';\nexport const Button = () => [scaleLinear, useState];\n`,
    );

    const result = await runCli(['swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`d3-scale@"^4.0.2"`);
    expect(result.stdout).toContain(`react@">=19.0.0"`);
  });
});

describe('swizzle — the astryx-swizzle.json marker', () => {
  it('marks the output folder with each package the copies came from and its version', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {issuesUrl: 'https://example.com/meta/issues'});
    const marker = path.join(project, 'components', 'astryx', 'astryx-swizzle.json');

    const core = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(core.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(marker, 'utf-8'))).toEqual({
      packages: {'@astryxdesign/core': '0.0.13'},
    });
    // The marker is not one of the copy's files.
    const coreEnv = JSON.parse(core.stdout);
    expect(coreEnv.data.files.some(f => f.includes('astryx-swizzle'))).toBe(false);
    expect(coreEnv.data.marker).toEqual({path: 'components/astryx/astryx-swizzle.json', written: true});

    const integration = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(integration.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(marker, 'utf-8'))).toEqual({
      packages: {'@astryxdesign/core': '0.0.13', '@test/meta': '1.2.3'},
    });
  });

  it('does not mark a folder that holds files swizzle did not write, and says how to add the marker', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    // The product's own components live in src/components.
    fs.mkdirSync(path.join(project, 'src', 'components'), {recursive: true});
    fs.writeFileSync(path.join(project, 'src', 'components', 'Header.tsx'), `export const Header = 1;\n`);

    const json = await runCli(['--json', 'swizzle', 'Button', '--output', 'src/components', '-f'], project);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout).data.marker).toEqual({
      path: 'src/components/astryx-swizzle.json',
      written: false,
      found: ['Header.tsx'],
    });
    expect(fs.existsSync(path.join(project, 'src', 'components', 'astryx-swizzle.json'))).toBe(false);

    const text = await runCli(['swizzle', 'Button', '--output', 'src/components', '-f'], project);
    expect(text.stdout).toContain(
      'Did not mark src/components/ with astryx-swizzle.json: it already holds Button, Header.tsx and no astryx-swizzle.json',
    );
    expect(text.stdout).toContain('add src/components/astryx-swizzle.json to mark it');
  });

  it('leaves a folder of earlier copies unmarked on re-swizzle, and names what it holds', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    // Copies from a swizzle that wrote no marker.
    fs.mkdirSync(path.join(project, 'components', 'astryx', 'Button'), {recursive: true});
    fs.writeFileSync(path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'), `export const Button = 1;\n`);

    const result = await runCli(['swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(project, 'components', 'astryx', 'astryx-swizzle.json'))).toBe(false);
    expect(result.stdout).toContain('it already holds Button and no astryx-swizzle.json');
    expect(result.stdout).toContain('add components/astryx/astryx-swizzle.json to mark it');
  });

  it('reports a write failure when the output path is a file', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    fs.writeFileSync(path.join(project, 'notes.txt'), 'notes\n');
    const result = await runCli(['--json', 'swizzle', 'Button', '--output', 'notes.txt'], project);
    expect(result.code).not.toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.code).toBe('ERR_WRITE_FAILED');
    expect(envelope.error).toContain(`Could not write ${path.join('notes.txt', 'Button', 'Button.tsx')}:`);
    expect(envelope.error).toContain('Nothing was written.');
    expect(envelope.error).not.toContain(project);
    expect(fs.readFileSync(path.join(project, 'notes.txt'), 'utf-8')).toBe('notes\n');
  });

  it('marks a folder the copy creates, and says what the marker does', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const result = await runCli(['swizzle', 'Button', '--output', 'src/astryx', '-f'], project);
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(project, 'src', 'astryx', 'astryx-swizzle.json'))).toBe(true);
    expect(result.stdout).toContain('Marked src/astryx/ with astryx-swizzle.json');
  });
});

describe('swizzle — integration-owned components', () => {
  it('copies the component and the unexported helper it imports, without its test or doc, and routes feedback to the integration issuesUrl', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {issuesUrl: 'https://example.com/meta/issues'});
    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@test/meta');
    // Doc + test excluded from the copy.
    expect(env.data.files).toContain('MetaAppShell.tsx');
    expect(env.data.files).toContain('sibling.ts');
    expect(env.data.files).not.toContain('MetaAppShell.doc.mjs');
    expect(env.data.files.some(f => f.includes('.test.'))).toBe(false);
    // Feedback routed to the integration's issues URL.
    expect(env.data.feedback.issuesUrl).toBe('https://example.com/meta/issues');

    const outDir = path.join(project, 'components', 'astryx', 'MetaAppShell');
    expect(fs.existsSync(path.join(outDir, 'MetaAppShell.doc.mjs'))).toBe(false);
    const out = fs.readFileSync(path.join(outDir, 'MetaAppShell.tsx'), 'utf-8');
    // The helper is not exported, so the copy carries it in the same layout.
    expect(out).toContain(`from '../utils/foo'`);
    expect(env.data.files).toContain('../utils/foo.ts');
    expect(
      fs.existsSync(
        path.join(project, 'components', 'astryx', 'utils', 'foo.ts'),
      ),
    ).toBe(true);
    expect(out).toContain(`from './sibling'`);
  });

  it('carries a module beside the components folder, under the output folder by its package path', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const {intDir, compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    // A helper at the package root, beside `components/`.
    fs.mkdirSync(path.join(intDir, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(intDir, 'lib', 'helper.ts'), `export const helper = 2;\n`);
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import {helper} from '../../lib/helper';\nexport function MetaAppShell() { return helper; }\n`,
    );
    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    const output = path.join(project, 'components', 'astryx');
    const out = fs.readFileSync(
      path.join(output, 'MetaAppShell', 'MetaAppShell.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '../lib/helper'`);
    expect(env.data.files).toContain('../lib/helper.ts');
    expect(
      fs.readFileSync(path.join(output, 'lib', 'helper.ts'), 'utf-8'),
    ).toBe(`export const helper = 2;\n`);
  });

  it('keeps a root module apart from a same-named one inside the components folder', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const {intDir, compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    fs.mkdirSync(path.join(intDir, 'utils'), {recursive: true});
    fs.writeFileSync(path.join(intDir, 'utils', 'foo.ts'), `export const root = 3;\n`);
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import x from '../utils/foo';\nimport {root} from '../../utils/foo';\nexport function MetaAppShell() { return x + root; }\n`,
    );
    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const output = path.join(project, 'components', 'astryx');
    const out = fs.readFileSync(
      path.join(output, 'MetaAppShell', 'MetaAppShell.tsx'),
      'utf-8',
    );
    // The module inside `components/` keeps its layout; the root one moves
    // to a folder named after the package.
    expect(out).toContain(`import x from '../utils/foo';`);
    expect(out).toContain(`import {root} from '../meta/utils/foo';`);
    expect(fs.readFileSync(path.join(output, 'utils', 'foo.ts'), 'utf-8')).toBe(
      `export default 1;\n`,
    );
    expect(
      fs.readFileSync(path.join(output, 'meta', 'utils', 'foo.ts'), 'utf-8'),
    ).toBe(`export const root = 3;\n`);
  });

  it('imports a stylesheet the package exports from the package', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const {intDir, compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    fs.writeFileSync(
      path.join(intDir, 'package.json'),
      JSON.stringify({
        name: '@test/meta',
        version: '1.2.3',
        exports: {'./styles.css': './styles.css'},
      }),
    );
    fs.writeFileSync(path.join(intDir, 'styles.css'), `.meta {}\n`);
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import '../../styles.css';\nexport function MetaAppShell() { return null; }\n`,
    );
    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    const out = fs.readFileSync(
      path.join(
        project,
        'components',
        'astryx',
        'MetaAppShell',
        'MetaAppShell.tsx',
      ),
      'utf-8',
    );
    expect(out).toContain(`import '@test/meta/styles.css';`);
    expect(env.data.files.some(f => f.endsWith('styles.css'))).toBe(false);
  });

  it("refuses to replace an edited owner module in an integration's components folder without --overwrite", async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const {compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    const ownerDir = path.join(path.dirname(compDir), 'privateAttributes');
    fs.mkdirSync(ownerDir, {recursive: true});
    fs.writeFileSync(path.join(ownerDir, 'row.stylex.ts'), `export const row = 1;\n`);
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import {row} from '../privateAttributes/row.stylex';\nexport function MetaAppShell() { return row; }\n`,
    );
    const first = await runCli(['--json', 'swizzle', 'MetaAppShell'], project);
    expect(first.code).toBe(0);
    const owner = path.join(
      project,
      'components',
      'astryx',
      'privateAttributes',
      'row.stylex.ts',
    );
    fs.appendFileSync(owner, '// edited\n');
    fs.rmSync(path.join(project, 'components', 'astryx', 'MetaAppShell'), {
      recursive: true,
      force: true,
    });

    const again = await runCli(['--json', 'swizzle', 'MetaAppShell'], project);
    expect(again.code).not.toBe(0);
    expect(JSON.parse(again.stdout).code).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(owner, 'utf-8')).toContain('// edited');
  });
  /** Swizzle `Foo`, which imports its sibling `Bar`, from `@test/meta` with these exports. */
  async function swizzleFooBesideBar(exportsField) {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    const {intDir} = buildIntegration(project, {componentName: 'Foo'});
    fs.writeFileSync(path.join(intDir, 'package.json'), JSON.stringify({name: '@test/meta', version: '1.2.3', exports: exportsField}));
    fs.writeFileSync(path.join(intDir, 'components', 'index.ts'), `export {Bar} from './Bar/Bar';\n`);
    const bar = path.join(intDir, 'components', 'Bar');
    fs.mkdirSync(bar, {recursive: true});
    fs.writeFileSync(path.join(bar, 'Bar.tsx'), `export function Bar() { return null; }\n`);
    fs.writeFileSync(path.join(bar, 'index.ts'), `export {Bar} from './Bar';\n`);
    fs.writeFileSync(path.join(intDir, 'components', 'Foo', 'Foo.tsx'), `import {Bar} from '../Bar';\nexport function Foo() { return Bar(); }\n`);
    const result = await runCli(['--json', 'swizzle', 'Foo', '-f'], project);
    expect(result.code).toBe(0);
    return fs.readFileSync(path.join(project, 'components', 'astryx', 'Foo', 'Foo.tsx'), 'utf-8');
  }

  it.each([
    ['a `./*` pattern with a source condition', {'./*': {source: './components/*/index.ts', default: './dist/*/index.js'}}],
    ['a `./*` pattern with a plain string', {'./*': './components/*/index.ts'}],
    ['a plain-string subpath', {'./Bar': './components/Bar/index.ts'}],
    ['a `./*` pattern whose target repeats `*`', {'./*': './components/*/*.tsx'}],
    ['a `./*` pattern with a fallback array', {'./*': ['./components/*/index.ts']}],
  ])('imports another public component from the package when exports use %s', async (_shape, exportsField) => {
    expect(await swizzleFooBesideBar(exportsField)).toContain(`from '@test/meta/Bar'`);
  });

  it('imports from the package root when exports are a single condition object', async () => {
    const out = await swizzleFooBesideBar({source: './components/index.ts', default: './dist/index.js'});
    expect(out).toContain(`from '@test/meta';`);
  });

  it('copies a component whose subpath exports block beside a `./*` pattern', async () => {
    const out = await swizzleFooBesideBar({'./*': {source: './components/*/index.ts'}, './Bar': null});
    expect(out).not.toContain('@test/meta');
    expect(out).toContain(`from '../Bar`);
  });

  it("carries another Astryx package's internal module under a folder named after that package", async () => {
    const core = buildFakeCore(project);
    writeProjectPackageJson(project);
    const {compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(core, 'package.json'), 'utf-8'),
    );
    manifest.exports['.'] = {
      source: './src/index.ts',
      default: './dist/index.js',
    };
    manifest.exports['./internal/*'] = {
      source: './src/internal/*.ts',
      default: './dist/internal/*.js',
    };
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(manifest));
    fs.mkdirSync(path.join(core, 'src', 'internal'), {recursive: true});
    fs.mkdirSync(path.join(core, 'src', 'utils'), {recursive: true});
    fs.writeFileSync(
      path.join(core, 'src', 'index.ts'),
      `export {publicName} from './utils/pub';\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'utils', 'pub.ts'),
      `export const publicName = 1;\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'utils', 'priv.ts'),
      `export const priv = 2;\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'internal', 'touch.ts'),
      `import {publicName} from '../utils/pub';\nimport {priv} from '../utils/priv';\nexport const touch = publicName + priv;\n`,
    );
    // A StyleX identity module Core exports under internal/.
    fs.writeFileSync(
      path.join(core, 'src', 'internal', 'press.stylex.ts'),
      `export const pressScope = {};\n`,
    );
    manifest.exports['./internal/press.stylex'] = {
      source: './src/internal/press.stylex.ts',
      default: './dist/internal/press.stylex.js',
    };
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(project, 'node_modules', '@test', 'meta', 'package.json'),
      JSON.stringify({
        name: '@test/meta',
        version: '1.2.3',
        peerDependencies: {'@astryxdesign/core': '>=0.0.13'},
      }),
    );
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import {touch} from '@astryxdesign/core/internal/touch';\nimport {pressScope} from '@astryxdesign/core/internal/press.stylex';\nexport function MetaAppShell() { return [touch, pressScope]; }\n`,
    );

    const result = await runCli(
      ['--json', 'swizzle', 'MetaAppShell', '-f'],
      project,
    );
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    const output = path.join(project, 'components', 'astryx');
    const read = rel => fs.readFileSync(path.join(output, rel), 'utf-8');
    expect(read('MetaAppShell/MetaAppShell.tsx')).toContain(
      `from '../core/internal/touch'`,
    );
    // Its identity is its path, so the StyleX module keeps the package import.
    expect(read('MetaAppShell/MetaAppShell.tsx')).toContain(
      `from '@astryxdesign/core/internal/press.stylex'`,
    );
    expect(env.data.dependencies).toEqual({'@astryxdesign/core': '>=0.0.13'});
    expect(read('core/internal/touch.ts')).toContain(
      `import {publicName} from '@astryxdesign/core';`,
    );
    expect(read('core/internal/touch.ts')).toContain(`from '../utils/priv'`);
    expect(read('core/utils/priv.ts')).toBe(`export const priv = 2;\n`);
    expect(env.data.files).toEqual(
      expect.arrayContaining([
        '../core/internal/touch.ts',
        '../core/utils/priv.ts',
      ]),
    );
    for (const rel of env.data.files) {
      expect(read(path.join('MetaAppShell', rel)), rel).not.toMatch(
        /@astryxdesign\/core\/internal\/(?!press\.stylex)/,
      );
    }
  });

  it('refuses to replace a changed owner module carried from another package without --overwrite', async () => {
    const core = buildFakeCore(project);
    writeProjectPackageJson(project);
    const {compDir} = buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(core, 'package.json'), 'utf-8'),
    );
    manifest.exports['./internal/*'] = {
      source: './src/internal/*.ts',
      default: './dist/internal/*.js',
    };
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(manifest));
    fs.mkdirSync(path.join(core, 'src', 'internal'), {recursive: true});
    fs.mkdirSync(path.join(core, 'src', 'privateAttributes'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(core, 'src', 'privateAttributes', 'group.stylex.ts'),
      `export const group = 1;\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'internal', 'grouping.ts'),
      `import {group} from '../privateAttributes/group.stylex';\nexport const grouping = group;\n`,
    );
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      `import {grouping} from '@astryxdesign/core/internal/grouping';\nexport function MetaAppShell() { return grouping; }\n`,
    );

    expect(
      (await runCli(['--json', 'swizzle', 'MetaAppShell'], project)).code,
    ).toBe(0);
    const owner = path.join(
      project,
      'components',
      'astryx',
      'core',
      'privateAttributes',
      'group.stylex.ts',
    );
    fs.appendFileSync(owner, '// edited\n');
    fs.rmSync(path.join(project, 'components', 'astryx', 'MetaAppShell'), {
      recursive: true,
      force: true,
    });

    const again = await runCli(['--json', 'swizzle', 'MetaAppShell'], project);
    expect(again.code).not.toBe(0);
    expect(JSON.parse(again.stdout).code).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(owner, 'utf-8')).toContain('// edited');
  });

  it('omits the feedback note when the integration ships no issuesUrl', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {issuesUrl: null});
    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@test/meta');
    expect(env.data.feedback).toBeUndefined();
  });
});

describe('swizzle — ambiguous ownership', () => {
  it('errors when a name is owned by core + an integration and no --package is given', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    // Integration also provides "Button" (collides with core).
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).not.toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.code).toBe('ERR_AMBIGUOUS_COMPONENT');
    const pkgs = (env.suggestions ?? []).map(s => s.name);
    expect(pkgs).toContain('@astryxdesign/core');
    expect(pkgs).toContain('@test/meta');
  });

  it('--package resolves an ambiguous name to the integration', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(
      ['--json', 'swizzle', 'Button', '--package', '@test/meta', '-f'],
      project,
    );
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.package).toBe('@test/meta');
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    // The helper is not exported, so the copy carries it in the same layout.
    expect(out).toContain(`from '../utils/foo'`);
    expect(env.data.files).toContain('../utils/foo.ts');
    expect(
      fs.existsSync(
        path.join(project, 'components', 'astryx', 'utils', 'foo.ts'),
      ),
    ).toBe(true);
  });

  it('--package resolves an ambiguous name to core', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(
      ['--json', 'swizzle', 'Button', '--package', '@astryxdesign/core', '-f'],
      project,
    );
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.package).toBe('@astryxdesign/core');
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '@astryxdesign/core/theme/tokens.stylex'`);
  });
});

/**
 * Build a fake @astryxdesign/core with a component that imports StyleX directly
 * (so the swizzle StyleX-build note should fire) and one that doesn't.
 */
function buildStyleXCore(project) {
  const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  // StyleX component.
  const styledDir = path.join(core, 'src', 'Styled');
  fs.mkdirSync(styledDir, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/core',
      version: '0.0.13',
      exports: {
        './theme/tokens.stylex': {
          source: './src/theme/tokens.stylex.ts',
          default: './dist/theme/tokens.stylex.js',
        },
      },
    }),
  );
  fs.mkdirSync(path.join(core, 'src', 'theme'), {recursive: true});
  fs.writeFileSync(
    path.join(core, 'src', 'theme', 'tokens.stylex.ts'),
    `export const tokens = {};\n`,
  );
  fs.writeFileSync(
    path.join(styledDir, 'Styled.tsx'),
    [
      `import * as stylex from '@stylexjs/stylex';`,
      `const styles = stylex.create({base: {color: 'red'}});`,
      `export const Styled = () => null;`,
      '',
    ].join('\n'),
  );
  // Plain component (no StyleX).
  const plainDir = path.join(core, 'src', 'Plain');
  fs.mkdirSync(plainDir, {recursive: true});
  fs.writeFileSync(
    path.join(plainDir, 'Plain.tsx'),
    `export const Plain = () => null;\n`,
  );
  return core;
}

describe('swizzle — StyleX build setup note (#3373)', () => {
  it('reports usesStyleX and prints a setup note for StyleX components', async () => {
    buildStyleXCore(project);
    writeProjectPackageJson(project);

    // JSON payload carries the machine-readable flag.
    const jsonResult = await runCli(['--json', 'swizzle', 'Styled', '-f'], project);
    expect(jsonResult.code).toBe(0);
    const env = JSON.parse(jsonResult.stdout);
    expect(env.data.usesStyleX).toBe(true);

    // Human output surfaces the compiler requirement + Next.js caveat.
    const humanResult = await runCli(['swizzle', 'Styled', '-f'], project);
    expect(humanResult.code).toBe(0);
    expect(humanResult.stdout).toMatch(/StyleX compiler/i);
    expect(humanResult.stdout).toMatch(/importing them throws "Unexpected 'stylex\.create' call at runtime"/);
    expect(humanResult.stdout).not.toMatch(/unstyled/i);
    expect(humanResult.stdout).toMatch(/next\/font/i);
    // The fixture has no `astryx` bin installed, so the note names the scoped package.
    expect(humanResult.stdout).toMatch(/@astryxdesign\/cli@\S+ docs styling/);
  });

  // The note quotes what StyleX does without a compiler; this keeps it true.
  it('matches what the StyleX runtime does when styles are not compiled', () => {
    const stylex = createRequire(CORE_PACKAGE)('@stylexjs/stylex');
    expect(() => stylex.create({root: {color: 'red'}})).toThrow(
      /Unexpected 'stylex\.create' call at runtime/,
    );
  });
  it('does not print the StyleX note for components without StyleX', async () => {
    buildStyleXCore(project);
    writeProjectPackageJson(project);
    const jsonResult = await runCli(['--json', 'swizzle', 'Plain', '-f'], project);
    expect(jsonResult.code).toBe(0);
    const env = JSON.parse(jsonResult.stdout);
    expect(env.data.usesStyleX).toBe(false);

    const humanResult = await runCli(['swizzle', 'Plain', '-f'], project);
    expect(humanResult.code).toBe(0);
    expect(humanResult.stdout).not.toMatch(/StyleX compiler/i);
  });
});
describe('swizzle — shared modules outside the component folder (spec:AST-110 FR4)', () => {
  it('names the owner modules it copied beside the component', async () => {
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    const rowDir = path.join(core, 'src', 'Row');
    fs.mkdirSync(rowDir, {recursive: true});
    fs.mkdirSync(path.join(core, 'src', 'privateAttributes'), {recursive: true});
    fs.mkdirSync(path.join(core, 'src', 'motion'), {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.13"}',
    );
    fs.writeFileSync(
      path.join(rowDir, 'Row.tsx'),
      `import {rowStyles} from '../privateAttributes/row.stylex';\nexport const Row = () => null;\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'privateAttributes', 'row.stylex.ts'),
      `import {fade} from '../motion/fade.stylex';\nexport const rowStyles = fade;\n`,
    );
    fs.writeFileSync(
      path.join(core, 'src', 'motion', 'fade.stylex.ts'),
      `export const fade = 1;\n`,
    );
    writeProjectPackageJson(project);

    const humanResult = await runCli(['swizzle', 'Row', '-f'], project);
    expect(humanResult.code).toBe(0);
    expect(humanResult.stdout).toContain(
      "Copied beside it: ../privateAttributes/row.stylex.ts, ../motion/fade.stylex.ts (in the package's folder layout; imported by relative path)",
    );
    // The copy keeps relative imports of the modules it carries.
    expect(humanResult.stdout).toContain(
      'the internal modules the component needs are copied beside it',
    );
    expect(humanResult.stdout).not.toContain('have been rewritten');
  });
});

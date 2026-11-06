// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spec cli-surface INV28: every result names the package each artifact
 * comes from. A result about one artifact carries `package` in its envelope,
 * directly after `type`. A result that lists artifacts gives each one its own
 * `package`. Text names the same package; verbatim source output (`--source`,
 * `--showcase`, a template's source) prints only the source.
 *
 * The CLI cases run the real binary over this repository's Core. The
 * integration cases call the API with a project whose one integration
 * contributes a component, and show that the integration's package reaches
 * every projection and search with nothing written for it by its author.
 *
 * @position packages/cli/test — INV28 enforcement
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../test-utils/run-cli.mjs';

const CORE = '@astryxdesign/core';
const CLI = '@astryxdesign/cli';
const ACME = '@acme/widgets';

// The API reads integrations through Project.load(). Vitest cannot import an
// astryx.config.mjs from a temporary root, so the project is mocked the way
// component-ownership.test.mjs mocks it, with the integration's files on disk.
// The CLI cases fall through to the real Project.load; the integration cases
// install the temporary project mock in their scoped beforeEach.
const projectLoadMock = vi.fn();
vi.mock('../foundation/config/project.mjs', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    Project: {
      load: (/** @type {unknown[]} */ ...args) =>
        projectLoadMock.getMockImplementation()
          ? projectLoadMock(...args)
          : original.Project.load(...args),
    },
  };
});
const {component} = await import('../api/component/component.mjs');
const {search} = await import('../api/search/search.mjs');
const {themeAdd} = await import('../api/theme/add/add.mjs');
const {themeEject} = await import('../api/theme/eject/eject.mjs');
const {themeBuild} = await import('../api/theme/build/build.mjs');

// Each case scans the whole Core library; size the budget to the work.
vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

/** @param {string[]} args */
async function json(args) {
  const {status, stdout} = await runCli(['--json', ...args]);
  expect(status, stdout).toBe(0);
  return JSON.parse(stdout);
}

/** @param {string[]} args */
async function stderrOf(args) {
  const {status, stdout, stderr} = await runCli(args);
  expect(status, stdout).toBe(0);
  return stderr;
}

/** @param {string[]} args */
async function text(args) {
  const {status, stdout} = await runCli(args);
  expect(status, stdout).toBe(0);
  return stdout;
}

/** @param {unknown} item @param {string} label */
function expectPackage(item, label) {
  expect(/** @type {any} */ (item)?.package, label).toEqual(expect.any(String));
}

describe('INV28: a result about one artifact names its package after `type`', () => {
  /** @type {Array<[string, string[], string]>} */
  const cases = [
    ['component.detail', ['component', 'Button'], CORE],
    ['component.detail.props', ['component', 'Button', '--props'], CORE],
    ['component.detail.source', ['component', 'Button', '--source'], CORE],
    ['component.detail.showcase', ['component', 'Button', '--showcase'], CORE],
    ['component.detail.blocks', ['component', 'Button', '--blocks'], CORE],
    ['docs.detail', ['docs', 'theme'], CLI],
    ['docs.index', ['docs', 'theme', '--index'], CLI],
    ['docs.detail.section', ['docs', 'theme', 'quick-start'], CLI],
    ['docs.node', ['docs', 'cli'], CLI],
    ['template.show', ['template', 'dashboard'], CORE],
    ['template.skeleton', ['template', 'dashboard', '--skeleton'], CORE],
    ['hook.detail', ['hook', 'useCollapsible'], CORE],
    ['hook.detail.params', ['hook', 'useCollapsible', '--params'], CORE],
    ['hook.list', ['hook', '--list'], CORE],
    ['swizzle.list', ['swizzle', '--list'], CORE],
  ];
  for (const [type, args, owner] of cases) {
    it(`${type} names ${owner}, directly after type`, async () => {
      const res = await json(args);
      expect(res.type).toBe(type);
      expect(res.package).toBe(owner);
      expect(Object.keys(res).slice(0, 4)).toEqual([
        'apiVersion',
        'type',
        'package',
        'data',
      ]);
    });
  }
});

describe('INV28: a result that lists artifacts names each one', () => {
  it('search: every result, whatever its domain', async () => {
    const res = await json(['search', 'button']);
    expect(res.package).toBeUndefined();
    expect(res.data.results.length).toBeGreaterThan(0);
    for (const r of res.data.results) expectPackage(r, `${r.domain} ${r.name}`);
    const button = res.data.results.find(
      (/** @type {any} */ r) => r.domain === 'component' && r.name === 'Button',
    );
    expect(button?.package).toBe(CORE);
  });

  it('build.kit: the start, its alternatives, pages, blocks, and components', async () => {
    const res = await json(['build', 'user settings']);
    expect(res.package).toBeUndefined();
    const {start, pages, blocks, domain} = res.data;
    expect(start.package).toBe(CORE);
    for (const item of [...start.alternatives, ...pages, ...blocks, ...domain]) {
      expectPackage(item, item.name);
    }
  });

  it('component.detail.blocks: each block', async () => {
    const {data} = await json(['component', 'Button', '--blocks']);
    for (const block of [data.showcase, ...data.examples, ...data.related]) {
      expectPackage(block, block.name);
    }
  });

  it('docs.index and docs.detail: each section', async () => {
    const index = await json(['docs', 'theme', '--index']);
    for (const s of index.data.sections) expect(s.package, s.id).toBe(CLI);
    const detail = await json(['docs', 'theme']);
    for (const s of detail.data.sections) expect(s.package, s.id).toBe(CLI);
  });

  it('docs.node: each child', async () => {
    const {data} = await json(['docs', 'cli']);
    const children = data.slots.flatMap((/** @type {any} */ s) => s.children);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expectPackage(child, child.route);
  });

  it('upgrade.list: each codemod', async () => {
    const {data} = await json(['upgrade', '--list']);
    expect(data.length).toBeGreaterThan(0);
    for (const codemod of data) expect(codemod.package, codemod.name).toBe(CORE);
  });

  it('component.list: each entry, at every detail level', async () => {
    for (const args of [
      ['component', '--list'],
      ['component', '--list', '--detail', 'compact'],
      ['component', '--list', '--detail', 'full'],
    ]) {
      const {data} = await json(args);
      for (const [group, entries] of Object.entries(data.components)) {
        for (const entry of /** @type {any[]} */ (entries)) {
          expectPackage(entry, `${args.join(' ')}: ${group}/${entry.name}`);
        }
      }
    }
  });

  it('template.list and theme.list: each entry', async () => {
    const templates = await json(['template', '--list']);
    for (const t of templates.data) expectPackage(t, t.id);
    const themes = await json(['theme', 'list']);
    for (const t of themes.data) expectPackage(t, t.slug);
  });
});

describe('INV28: text names the same package', () => {
  it('a read of one artifact names its package', async () => {
    expect(await text(['component', 'Button'])).toContain(`package: ${CORE}`);
    expect(await text(['component', 'Button', '--props'])).toContain(`package: ${CORE}`);
    expect(await text(['docs', 'theme', '--index'])).toContain(`package: ${CLI}`);
    expect(await text(['docs', 'theme', 'quick-start'])).toContain(`package: ${CLI}`);
    expect(await text(['template', 'dashboard', '--skeleton'])).toContain(`package: ${CORE}`);
    expect(await text(['hook', 'useCollapsible'])).toContain(`package: ${CORE}`);
  });

  it('verbatim source output keeps stdout to the source and names the package on stderr', async () => {
    const source = await text(['component', 'Button', '--source']);
    expect(source).not.toContain('package:');
    expect(source.trimStart().startsWith('// Copyright')).toBe(true);
    for (const args of [
      ['component', 'Button', '--source'],
      ['component', 'Button', '--showcase'],
      ['template', 'dashboard'],
    ]) {
      expect(await stderrOf(args), args.join(' ')).toContain(`package: ${CORE}`);
    }
  });

  it('a batch names the package of each source row', async () => {
    const out = await text(['component', 'Button', 'Badge', '--source']);
    expect(out.match(/package:\s+@astryxdesign\/core/g)?.length).toBe(2);
  });

  it('build names the package of each template, block, and component', async () => {
    expect(await text(['build', 'user settings'])).toMatch(/package:\s+@astryxdesign\/core/);
  });
});

describe('INV28: theme add names the package that owns the added theme', () => {
  const THEMES = '@acme/themes';
  /** @type {string[]} */
  const dirs = [];

  /**
   * An app with one installed theme package that exports two built themes. It
   * lives under the working directory so the real Project.load can import the
   * package's integration entry.
   */
  function appWithThemePackage() {
    const dir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-inv28-theme-'),
    );
    dirs.push(dir);
    /** @param {string} rel @param {string} content */
    const write = (rel, content) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
      fs.writeFileSync(path.join(dir, rel), content);
    };
    write('tsconfig.json', '{}\n');
    write(
      'package.json',
      JSON.stringify({
        name: 'inv28-app',
        private: true,
        dependencies: {[THEMES]: '1.0.0', [CORE]: '1.0.0'},
      }),
    );
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({name: CORE, version: '1.0.0'}),
    );
    const pkg = 'node_modules/@acme/themes';
    write(
      `${pkg}/package.json`,
      JSON.stringify({
        name: THEMES,
        version: '1.0.0',
        type: 'module',
        peerDependencies: {[CORE]: '^1.0.0'},
        exports: {
          './themes/ocean': './dist/ocean.js',
          './themes/ocean.css': './dist/ocean.css',
          './themes/reef': './dist/reef.js',
          './themes/reef.css': './dist/reef.css',
        },
      }),
    );
    write(
      `${pkg}/astryx.integration.mjs`,
      "export default {themes: './themes'};\n",
    );
    for (const slug of ['ocean', 'reef']) {
      const source = `export const ${slug}Theme = {name: '${slug}', tokens: {}};\n`;
      write(
        `${pkg}/themes/${slug}/${slug}Theme.doc.mjs`,
        "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\n" +
          `export default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: true};\n`,
      );
      write(`${pkg}/themes/${slug}/${slug}Theme.ts`, source);
      write(`${pkg}/dist/${slug}.js`, source);
      write(
        `${pkg}/dist/${slug}.css`,
        `[data-astryx-theme="${slug}"] { --color-text: black; }\n`,
      );
    }
    return dir;
  }

  afterEach(() => {
    while (dirs.length > 0) {
      fs.rmSync(/** @type {string} */ (dirs.pop()), {
        recursive: true,
        force: true,
      });
    }
  });

  it('plain theme add names the package directly after type', async () => {
    const dir = appWithThemePackage();
    const {status, stdout, stderr} = await runCli(
      ['theme', 'add', 'ocean', '--package', THEMES, '--json'],
      dir,
    );
    expect(status, stderr).toBe(0);
    const res = JSON.parse(stdout);
    expect(res.type).toBe('theme.app');
    expect(res.package).toBe(THEMES);
    expect(Object.keys(res).slice(0, 4)).toEqual([
      'apiVersion',
      'type',
      'package',
      'data',
    ]);
  });

  it('theme.app names the package directly after type, and text names it', async () => {
    const dir = appWithThemePackage();
    const {status, stdout, stderr} = await runCli(
      ['--json', 'theme', 'add', 'ocean', '--import', '--package', THEMES],
      dir,
    );
    expect(status, stderr).toBe(0);
    const res = JSON.parse(stdout);
    expect(res.type).toBe('theme.app');
    expect(res.package).toBe(THEMES);
    expect(Object.keys(res).slice(0, 4)).toEqual([
      'apiVersion',
      'type',
      'package',
      'data',
    ]);

    const textRun = await runCli(
      ['theme', 'add', 'ocean', '--import', '--package', THEMES],
      appWithThemePackage(),
    );
    expect(textRun.status, textRun.stderr).toBe(0);
    expect(textRun.stdout).toContain(`package: ${THEMES}`);
  });

  it('use and remove report the record without a package', async () => {
    const dir = appWithThemePackage();
    await themeAdd('ocean', {cwd: dir, import: true, package: THEMES});
    const reef = /** @type {any} */ (
      await themeAdd('reef', {cwd: dir, import: true, package: THEMES})
    );
    expect(reef.package).toBe(THEMES);
    for (const args of [
      ['theme', 'use', 'reef'],
      ['theme', 'use', 'ocean'],
      ['theme', 'remove', 'reef'],
    ]) {
      const run = await runCli(['--json', ...args], dir);
      expect(run.status, run.stderr).toBe(0);
      const res = JSON.parse(run.stdout);
      expect(res.type, args.join(' ')).toBe('theme.app');
      expect(res, args.join(' ')).not.toHaveProperty('package');
    }
  });

  it('a local theme has no package to name', async () => {
    const dir = appWithThemePackage();
    await themeEject('ocean', {cwd: dir, package: THEMES});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    await themeBuild(sourceFile, {}, {cwd: dir});
    const local = /** @type {any} */ (
      await themeAdd('ocean', {cwd: dir, import: true})
    );
    expect(local.type).toBe('theme.app');
    expect(local.data.themes).toContainEqual(
      expect.objectContaining({slug: 'ocean', source: 'local'}),
    );
    expect(local).not.toHaveProperty('package');
  });
});

describe('INV28: an integration names its own package, with nothing written for it', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-inv28-'));
    const realCore = path.resolve(import.meta.dirname, '..', '..', 'core');
    fs.mkdirSync(path.join(tmp, 'packages'), {recursive: true});
    fs.symlinkSync(realCore, path.join(tmp, 'packages', 'core'));
    const intDir = path.join(tmp, 'node_modules', '@acme', 'widgets');
    const compDir = path.join(intDir, 'components');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(intDir, 'package.json'),
      JSON.stringify({name: ACME, version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(compDir, 'SuperButton.doc.mjs'),
      "export default {\n  type: 'component',\n  name: 'SuperButton',\n  keywords: ['superbutton'],\n" +
        "  usage: {description: 'A button from the widgets integration.'},\n" +
        "  props: [{name: 'power', type: \"'low' | 'high'\", description: 'Power level.'}],\n};\n",
    );
    fs.writeFileSync(
      path.join(compDir, 'SuperButton.tsx'),
      'export function SuperButton() { return null; }\n',
    );
    projectLoadMock.mockReset();
    projectLoadMock.mockResolvedValue({
      integrations: [ACME],
      loadedIntegrations: [
        {
          name: ACME,
          version: '1.0.0',
          components: compDir,
          templates: undefined,
          codemods: undefined,
          __packageDir: intDir,
        },
      ],
    });
  });

  afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
    // A case added after this block must not inherit the mocked project.
    projectLoadMock.mockReset();
  });

  it('component detail, props, and source name the integration', async () => {
    const detail = /** @type {any} */ (await component('SuperButton', {cwd: tmp}));
    expect(detail.type).toBe('component.detail');
    expect(detail.package).toBe(ACME);
    expect(detail.data.package).toBe(ACME);
    const props = /** @type {any} */ (await component('SuperButton', {cwd: tmp, props: true}));
    expect(props.package).toBe(ACME);
    const source = /** @type {any} */ (await component('SuperButton', {cwd: tmp, source: true}));
    expect(source.package).toBe(ACME);
  });

  it('a Core component in the same project still names Core', async () => {
    const props = /** @type {any} */ (await component('Button', {cwd: tmp, props: true}));
    expect(props.package).toBe(CORE);
  });

  it('search names the integration on its component', async () => {
    const res = await search('superbutton', {cwd: tmp});
    const hit = res.data.results.find(r => r.name === 'SuperButton');
    expect(hit?.package).toBe(ACME);
  });
});

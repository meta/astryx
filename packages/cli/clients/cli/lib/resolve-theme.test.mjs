// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Tests generated-record default resolution and released package-field fallback. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveTheme} from './resolve-theme.mjs';
import {themeAdd} from '../../../api/theme/add/add.mjs';
import {themeBuild} from '../../../api/theme/build/build.mjs';
import {themeEject} from '../../../api/theme/eject/eject.mjs';
import {themeUse} from '../../../api/theme/use/use.mjs';
import {renderThemeModule} from '../../../foundation/config/theme-state.mjs';
import {checkAppThemes} from '../../../api/doctor/theme-checks.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

/** @type {string[]} */
const dirs = [];

function fixture(pkg = {name: 'app'}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-theme-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

function writeTheme(dir, filename, name) {
  fs.writeFileSync(
    path.join(dir, filename),
    `module.exports = {name: '${name}', variants: {Button: ['${name}']}, fonts: {body: '${name}'}};\n`,
  );
}

function writeGeneratedRecord(dir) {
  const sourceDir = path.join(dir, 'src', 'themes', 'ocean');
  fs.mkdirSync(sourceDir, {recursive: true});
  const moduleFile = path.join(sourceDir, 'ocean.js');
  fs.writeFileSync(
    moduleFile,
    "export const oceanTheme = {name: 'ocean', variants: {Button: ['ocean']}};\n",
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'astryx-themes.js'),
    renderThemeModule(
      [
        {
          slug: 'ocean',
          owner: './src/themes',
          exportName: 'oceanTheme',
          module: '',
          stylesheet: '',
          moduleFile,
          stylesheetFile: path.join(sourceDir, 'ocean.css'),
          source: 'local',
        },
      ],
      'ocean',
      false,
    ),
  );
}

function writePackageRecord(dir, slugs, exportsMap, artifacts) {
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/themes']};\n",
  );
  const packageDir = path.join(dir, 'node_modules', '@acme', 'themes');
  fs.mkdirSync(path.join(packageDir, 'themes'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/themes',
      version: '1.0.0',
      type: 'module',
      exports: exportsMap,
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  for (const slug of slugs) {
    const themeDir = path.join(packageDir, 'themes', slug);
    fs.mkdirSync(themeDir, {recursive: true});
    fs.writeFileSync(
      path.join(themeDir, `${slug}Theme.ts`),
      `export const ${slug}Theme = {name: '${slug}', tokens: {}};\n`,
    );
    fs.writeFileSync(
      path.join(themeDir, `${slug}Theme.doc.mjs`),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme', maintained: true};\n`,
    );
  }
  for (const [file, content] of Object.entries(artifacts)) {
    const target = path.join(packageDir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
  }
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  const slug = slugs[0];
  fs.writeFileSync(
    path.join(dir, 'src', 'astryx-themes.ts'),
    renderThemeModule(
      [
        {
          slug,
          owner: '@acme/themes',
          exportName: `${slug}Theme`,
          module: `@acme/themes/themes/${slug}`,
          stylesheet: `@acme/themes/themes/${slug}.css`,
          source: 'package',
        },
      ],
      slug,
      true,
    ),
  );
}

/** @param {string} slug */
function builtTheme(slug) {
  return `export const ${slug}Theme = {name: '${slug}', tokens: {}, variants: {Button: ['${slug}']}};\n`;
}

function installCore(dir) {
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(scope, 'core'),
  );
}

/** @param {'missing'|'ambiguous'|'malformed'|'runtime'} kind */
function brokenThemeProject(kind) {
  const dir = fixture({
    name: 'app',
    type: 'module',
    dependencies: {
      '@acme/themes': '1.0.0',
      '@astryxdesign/core': '*',
    },
  });
  if (kind === 'missing') {
    writePackageRecord(
      dir,
      ['ocean'],
      {'./theme.css': './dist/theme.css'},
      {'dist/theme.css': '.ocean {}\n'},
    );
  } else if (kind === 'ambiguous') {
    writePackageRecord(
      dir,
      ['ocean', 'reef'],
      {'./built': './dist/built.js', './theme.css': './dist/theme.css'},
      {'dist/built.js': builtTheme('reef'), 'dist/theme.css': '.reef {}\n'},
    );
  } else if (kind === 'malformed') {
    writePackageRecord(
      dir,
      ['ocean'],
      {'./themes/ocean': './dist/ocean.js'},
      {'dist/ocean.js': 'export const oceanTheme = ;\n'},
    );
  } else {
    writePackageRecord(
      dir,
      ['ocean'],
      {'./themes/ocean': './dist/ocean.js'},
      {'dist/ocean.js': "throw new Error('runtime theme boom');\n"},
    );
  }
  installCore(dir);
  return dir;
}

/** @param {'single'|'explicit'} kind */
function workingThemeProject(kind) {
  const dir = fixture({
    name: 'app',
    type: 'module',
    dependencies: {
      '@acme/themes': '1.0.0',
      '@astryxdesign/core': '*',
    },
  });
  if (kind === 'single') {
    writePackageRecord(
      dir,
      ['ocean'],
      {'./built': './dist/built.js', './theme.css': './dist/theme.css'},
      {'dist/built.js': builtTheme('ocean'), 'dist/theme.css': '.ocean {}\n'},
    );
  } else {
    writePackageRecord(
      dir,
      ['ocean', 'reef'],
      {
        './themes/ocean': './dist/ocean.js',
        './themes/ocean.css': './dist/ocean.css',
        './built': './dist/built.js',
        './theme.css': './dist/theme.css',
      },
      {
        'dist/ocean.js': builtTheme('ocean'),
        'dist/ocean.css': '.ocean {}\n',
        'dist/built.js': builtTheme('reef'),
        'dist/theme.css': '.reef {}\n',
      },
    );
  }
  installCore(dir);
  return dir;
}

/** @param {string} dir @param {string[]} args */
function runComponent(dir, args) {
  return spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'packages/cli/clients/cli/bin/astryx.mjs'), ...args],
    {cwd: dir, encoding: 'utf-8', timeout: 30_000},
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ASTRYX_THEME;
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop(), {recursive: true, force: true});
  }
});

describe('resolveTheme package field', () => {
  it('keeps package.json astryx.theme behavior', async () => {
    const dir = fixture({name: 'app', astryx: {theme: './legacy.cjs'}});
    writeTheme(dir, 'legacy.cjs', 'legacy');

    expect(await resolveTheme(dir)).toEqual({
      name: 'legacy',
      variants: {Button: ['legacy']},
      fonts: {body: 'legacy'},
    });
  });

  it.each([123, ['a'], {x: 1}, true, ''])(
    'treats malformed value %j as absent',
    async value => {
      expect(await resolveTheme(fixture({astryx: {theme: value}}))).toBeNull();
    },
  );

  it('returns null with no theme field', async () => {
    expect(await resolveTheme(fixture())).toBeNull();
  });

  it('does not inherit astryx.theme from a parent package', async () => {
    const dir = fixture({name: 'app', astryx: {theme: './legacy.cjs'}});
    writeTheme(dir, 'legacy.cjs', 'legacy');
    const nested = path.join(dir, 'src', 'feature');
    fs.mkdirSync(nested, {recursive: true});

    expect(await resolveTheme(nested)).toBeNull();
  });

  it('does not resolve a bare legacy theme from project node_modules', async () => {
    const dir = fixture({name: 'app', astryx: {theme: 'project-theme'}});
    const packageDir = path.join(dir, 'node_modules', 'project-theme');
    fs.mkdirSync(packageDir, {recursive: true});
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({name: 'project-theme', main: 'index.cjs'}),
    );
    writeTheme(packageDir, 'index.cjs', 'project-only');

    expect(await resolveTheme(dir)).toBeNull();
  });
});

describe('resolveTheme source precedence', () => {
  it('uses the generated record default and ignores astryx.theme when a module exists', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      astryx: {theme: './legacy.cjs'},
    });
    writeTheme(dir, 'legacy.cjs', 'legacy');
    writeGeneratedRecord(dir);

    expect((await resolveTheme(dir))?.name).toBe('ocean');
  });

  it('uses the built shorthand for a proven single-theme package', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    });
    writePackageRecord(
      dir,
      ['ocean'],
      {'./built': './dist/built.js', './theme.css': './dist/theme.css'},
      {'dist/built.js': builtTheme('ocean'), 'dist/theme.css': '.ocean {}\n'},
    );

    expect((await resolveTheme(dir))?.name).toBe('ocean');
  });

  it('warns and returns no theme for an ambiguous multi-theme shorthand', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    });
    writePackageRecord(
      dir,
      ['ocean', 'reef'],
      {'./built': './dist/built.js', './theme.css': './dist/theme.css'},
      {'dist/built.js': builtTheme('reef'), 'dist/theme.css': '.reef {}\n'},
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(resolveTheme(dir)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('multi-theme package @acme/themes'),
    );
    warn.mockRestore();
  });

  it('warns and returns no theme when a single-theme package has no built export', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    });
    writePackageRecord(
      dir,
      ['ocean'],
      {'./theme.css': './dist/theme.css'},
      {'dist/theme.css': '.ocean {}\n'},
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(resolveTheme(dir)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not resolve the generated default theme'),
    );
    warn.mockRestore();
  });

  it('warns and returns no theme for a malformed recorded module', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    });
    writePackageRecord(
      dir,
      ['ocean'],
      {'./themes/ocean': './dist/ocean.js'},
      {'dist/ocean.js': 'export const oceanTheme = ;\n'},
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(resolveTheme(dir)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not load the recorded theme artifact'),
    );
    warn.mockRestore();
  });

  it('does not swallow an unrelated recorded-module runtime error', async () => {
    const dir = brokenThemeProject('runtime');

    await expect(resolveTheme(dir)).rejects.toThrow('runtime theme boom');
  });

  it('uses an explicit per-theme export from a multi-theme package', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    });
    writePackageRecord(
      dir,
      ['ocean', 'reef'],
      {
        './themes/ocean': './dist/ocean.js',
        './themes/ocean.css': './dist/ocean.css',
        './built': './dist/built.js',
        './theme.css': './dist/theme.css',
      },
      {
        'dist/ocean.js': builtTheme('ocean'),
        'dist/ocean.css': '.ocean {}\n',
        'dist/built.js': builtTheme('reef'),
        'dist/theme.css': '.reef {}\n',
      },
    );

    expect((await resolveTheme(dir))?.name).toBe('ocean');
  });

  it('loads a real built local default with an icon registry', async () => {
    const dir = fixture({
      name: 'app',
      type: 'module',
      dependencies: {'@astryxdesign/core': '*'},
    });
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(dir, 'node_modules'),
      'dir',
    );
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}\n');

    await themeEject('stone', {cwd: dir});
    await themeBuild('src/themes/stone/stoneTheme.ts', {}, {cwd: dir});
    await themeAdd('stone', {cwd: dir, import: true});
    await themeUse('stone', {cwd: dir});

    expect((await resolveTheme(dir))?.name).toBe('stone');
  }, 30_000);

  it('does not read ASTRYX_THEME', async () => {
    const dir = fixture();
    writeTheme(dir, 'environment.cjs', 'environment');
    process.env.ASTRYX_THEME = './environment.cjs';

    expect(await resolveTheme(dir)).toBeNull();
  });

  it('does not let ASTRYX_THEME replace astryx.theme', async () => {
    const dir = fixture({name: 'app', astryx: {theme: './legacy.cjs'}});
    writeTheme(dir, 'legacy.cjs', 'legacy');
    writeTheme(dir, 'environment.cjs', 'environment');
    process.env.ASTRYX_THEME = './environment.cjs';

    expect((await resolveTheme(dir))?.name).toBe('legacy');
  });
});

describe('component output with a broken recorded theme', () => {
  it.each([
    ['missing', 'could not resolve the generated default theme'],
    [
      'ambiguous',
      'theme "ocean" is recorded from multi-theme package @acme/themes',
    ],
    ['malformed', 'could not load the recorded theme artifact'],
  ])(
    'keeps text and JSON output valid for a %s artifact',
    async (kind, warning) => {
      const dir = brokenThemeProject(kind);

      const text = runComponent(dir, ['component', 'Button']);
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).toContain('# Button');
      expect(text.stderr).toContain(`⚠ theme: ${warning}`);
      expect(text.stderr.match(/⚠ theme:/gu) ?? []).toHaveLength(1);
      expect(text.stderr).not.toMatch(/\n\s+at /u);

      const json = runComponent(dir, ['--json', 'component', 'Button']);
      expect(json.status, json.stderr).toBe(0);
      expect(() => JSON.parse(json.stdout)).not.toThrow();
      expect(JSON.parse(json.stdout).type).toBe('component.detail');
      expect(json.stderr).toBe('');

      const checks = await checkAppThemes(dir);
      expect(
        checks.find(check => check.id === 'theme-owners')?.status,
      ).not.toBe('pass');
    },
    30_000,
  );

  it.each([
    ['list', ['component', '--list'], 'component.list'],
    ['props', ['component', 'Button', '--props'], 'component.detail.props'],
    ['source', ['component', 'Button', '--source'], 'component.detail.source'],
    [
      'showcase',
      ['component', 'Button', '--showcase'],
      'component.detail.showcase',
    ],
    ['blocks', ['component', 'Button', '--blocks'], 'component.detail.blocks'],
  ])(
    'keeps the ambiguous-theme %s projection alive in text and JSON',
    (projection, args, type) => {
      const dir = brokenThemeProject('ambiguous');

      const text = runComponent(dir, args);
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).not.toBe('');
      expect(text.stderr).toContain('multi-theme package @acme/themes');
      expect(text.stderr.match(/⚠ theme:/gu) ?? []).toHaveLength(1);
      expect(text.stderr).not.toMatch(/\n\s+at /u);

      const json = runComponent(dir, ['--json', ...args]);
      expect(json.status, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).type).toBe(type);
      expect(json.stderr).toBe('');
    },
    30_000,
  );

  it.each(['single', 'explicit'])(
    'keeps the %s package control silent',
    kind => {
      const dir = workingThemeProject(kind);
      const text = runComponent(dir, ['component', 'Button']);
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).toContain('# Button');
      expect(text.stderr).not.toContain('⚠ theme:');

      const json = runComponent(dir, ['--json', 'component', 'Button']);
      expect(json.status, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).type).toBe('component.detail');
      expect(json.stderr).toBe('');
    },
    30_000,
  );

  it('formats an unrelated loader error instead of swallowing it', () => {
    const dir = brokenThemeProject('runtime');

    const text = runComponent(dir, ['component', 'Button']);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain(
      'Could not load the recorded theme: runtime theme boom',
    );
    expect(text.stderr).not.toMatch(/\n\s+at /u);

    const json = runComponent(dir, ['--json', 'component', 'Button']);
    expect(json.status, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout).type).toBe('component.detail');
    expect(json.stderr).toBe('');
  });
});

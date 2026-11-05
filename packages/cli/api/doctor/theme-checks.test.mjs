// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Fault-injection coverage for all ten app-theme doctor checks. */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkAppThemes, checkThemes} from './theme-checks.mjs';
import {runChecks} from './doctor.mjs';
import {themeAdd} from '../theme/add/add.mjs';
import {themeEject} from '../theme/eject/eject.mjs';
import {themeBuild} from '../theme/build/build.mjs';
import {parseThemeModuleRecord} from '../../foundation/config/theme-state.mjs';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';
import {globalCli} from '../../test-utils/global-local-fixtures.mjs';

/** @type {string[]} */
const dirs = [];
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

/** @param {string} file @param {string} content */
function write(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

/**
 * @param {Array<{slug: string, css?: string, fontFamily?: string, fontCss?: string}>} themeSpecs
 * @param {{peerRange?: string, importModule?: boolean, root?: string}} [options]
 *   `root`: the folder the fixture is made in (default: this package)
 */
async function fixture(themeSpecs = [{slug: 'ocean'}], options = {}) {
  const dir = fs.mkdtempSync(
    path.join(options.root ?? process.cwd(), '.astryx-doctor-themes-'),
  );
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  write(path.join(dir, 'tsconfig.json'), '{}\n');
  write(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'doctor-app',
      private: true,
      dependencies: {
        '@acme/themes': '1.0.0',
        '@astryxdesign/core': '1.0.0',
      },
    }),
  );
  write(
    path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
  );

  const packageDir = path.join(dir, 'node_modules/@acme/themes');
  const exportsMap = {};
  for (const spec of themeSpecs) {
    exportsMap[`./themes/${spec.slug}`] = `./dist/${spec.slug}.js`;
    exportsMap[`./themes/${spec.slug}.css`] = `./dist/${spec.slug}.css`;
    if (spec.fontCss != null) {
      exportsMap[`./themes/${spec.slug}.fonts.css`] =
        `./dist/${spec.slug}.fonts.css`;
    }
  }
  write(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/themes',
      version: '1.0.0',
      type: 'module',
      peerDependencies: {
        '@astryxdesign/core': options.peerRange ?? `^${CLI_VERSION}`,
      },
      exports: exportsMap,
    }),
  );
  write(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );

  for (const spec of themeSpecs) {
    const exportName = `${spec.slug}Theme`;
    const sourceDir = path.join(packageDir, 'themes', spec.slug);
    const fontProperty = spec.fontFamily
      ? `, fontFamily: ${JSON.stringify(spec.fontFamily)}`
      : '';
    write(
      path.join(sourceDir, `${exportName}.doc.mjs`),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${spec.slug}', displayName: '${spec.slug}', description: '${spec.slug} theme.', maintained: true};\n`,
    );
    write(
      path.join(sourceDir, `${exportName}.ts`),
      `export const ${exportName} = {name: '${spec.slug}', tokens: {}${fontProperty}};\n`,
    );
    write(
      path.join(packageDir, `dist/${spec.slug}.js`),
      `export const ${exportName} = {name: '${spec.slug}', tokens: {}${fontProperty}};\n`,
    );
    write(
      path.join(packageDir, `dist/${spec.slug}.css`),
      spec.css ??
        `[data-astryx-theme="${spec.slug}"] { --color-text: black; }\n`,
    );
    if (spec.fontCss != null) {
      write(path.join(packageDir, `dist/${spec.slug}.fonts.css`), spec.fontCss);
    }
    await themeAdd(spec.slug, {
      cwd: dir,
      import: true,
      package: '@acme/themes',
    });
  }

  if (options.importModule !== false) {
    write(
      path.join(dir, 'src/index.tsx'),
      "import {themes, defaultThemeSlug} from './astryx-themes';\nvoid themes[defaultThemeSlug];\n",
    );
  }
  return {dir, packageDir, moduleFile: path.join(dir, 'src/astryx-themes.ts')};
}

/** @param {Awaited<ReturnType<typeof checkAppThemes>>} checks @param {string} id */
function check(checks, id) {
  const result = checks.find(item => item.id === id);
  if (!result) throw new Error(`Missing doctor check ${id}`);
  return result;
}

/** @param {string} dir */
function runDoctor(dir) {
  return spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'packages/cli/clients/cli/bin/astryx.mjs'), 'doctor'],
    {cwd: dir, encoding: 'utf-8', timeout: 30_000},
  );
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop(), {recursive: true, force: true});
  }
});

describe('the released themes check', () => {
  /** @param {string} name */
  function emptyApp(name) {
    const dir = fs.mkdtempSync(
      path.join(process.cwd(), `.astryx-doctor-${name}-`),
    );
    dirs.push(dir);
    write(path.join(dir, 'package.json'), '{"name":"app","private":true}\n');
    return dir;
  }

  /** @param {string} dir @param {string} slug */
  function installThemePackage(dir, slug) {
    write(
      path.join(
        dir,
        'node_modules/@astryxdesign',
        `theme-${slug}`,
        'package.json',
      ),
      JSON.stringify({name: `@astryxdesign/theme-${slug}`, version: '1.0.0'}),
    );
  }

  it('keeps its released id, label, fields, and statuses without a generated theme module', async () => {
    const dir = emptyApp('themes-none');
    expect(checkThemes(dir, await checkAppThemes(dir))).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'warn',
      message: 'No @astryxdesign/theme-* packages are installed.',
      fix: expect.stringContaining('theme add neutral`.'),
    });

    installThemePackage(dir, 'neutral');
    const unwired = checkThemes(dir, await checkAppThemes(dir));
    expect(unwired).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'warn',
      message:
        'Theme package(s) installed (@astryxdesign/theme-neutral) but no theme appears wired.',
      fix: expect.stringContaining('theme add <slug>`.'),
    });
    expect(unwired.fix).not.toContain('ASTRYX_THEME');

    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        astryx: {theme: '@astryxdesign/theme-neutral'},
      }),
    );
    expect(checkThemes(dir, await checkAppThemes(dir))).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'pass',
      message:
        'Theme package(s) installed (@astryxdesign/theme-neutral); wired via package.json astryx.theme.',
    });
  });

  it('reports the overall result of the app-theme checks with a generated module', async () => {
    const healthy = await fixture();
    expect(checkThemes(healthy.dir, await checkAppThemes(healthy.dir))).toEqual(
      {
        id: 'themes',
        label: 'Theme packages',
        status: 'pass',
        message:
          'App themes come from the generated theme module, and every theme check passes.',
      },
    );

    // A module is loaded once per process, so the broken one is a new fixture.
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      `import '@acme/definitely-missing-dep';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n`,
    );
    expect(checkThemes(dir, await checkAppThemes(dir))).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'fail',
      message: 'One theme check needs attention: theme-owners.',
      fix: 'Follow the fix on the theme-owners check.',
    });
  }, 30_000);

  it('passes the module rollup only when every summarized check passed', () => {
    /** @param {string} id @param {'pass'|'warn'|'fail'|'info'} status */
    const result = (id, status) => ({id, label: id, status, message: id});
    const passing = [
      result('theme-owners', 'pass'),
      result('theme-module', 'pass'),
    ];

    expect(
      checkThemes(process.cwd(), [
        ...passing,
        result('theme-stylesheet-imports', 'info'),
      ]),
    ).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'info',
      message:
        'One theme check could not prove its result: theme-stylesheet-imports.',
      fix: 'See the theme-stylesheet-imports check.',
    });
    expect(
      checkThemes(process.cwd(), [
        result('theme-owners', 'fail'),
        result('theme-module', 'pass'),
        result('theme-fonts', 'warn'),
        result('theme-global-rules', 'info'),
      ]),
    ).toMatchObject({
      status: 'fail',
      message: '2 theme checks need attention: theme-owners, theme-fonts.',
    });
    expect(checkThemes(process.cwd(), passing)).toMatchObject({
      status: 'pass',
    });
  });

  it('appears once in the doctor report, right after version alignment, with and without a module', async () => {
    const {dir} = await fixture();
    for (const cwd of [emptyApp('themes-report'), dir]) {
      const ids = (await runChecks({cwd})).checks.map(item => item.id);
      expect(ids.filter(id => id === 'themes')).toHaveLength(1);
      expect(ids.indexOf('themes')).toBe(ids.indexOf('version-alignment') + 1);
      expect(ids.indexOf('themes')).toBeLessThan(
        ids.findIndex(id => id === 'theme-management' || id === 'theme-owners'),
      );
    }
  }, 30_000);
});

describe('app-theme doctor checks', () => {
  it('returns ten positive passes for a healthy package theme', async () => {
    const {dir} = await fixture();
    const checks = await checkAppThemes(dir);

    expect(checks.map(item => item.id)).toEqual([
      'theme-owners',
      'theme-module',
      'theme-module-import',
      'theme-stylesheet-imports',
      'theme-local-builds',
      'theme-private-variables',
      'theme-core-peers',
      'theme-default',
      'theme-fonts',
      'theme-global-rules',
    ]);
    expect(checks.map(item => item.status)).toEqual(Array(10).fill('pass'));
    expect(check(checks, 'theme-owners').message).toContain(
      'every built module loads',
    );
  });

  it('fails theme-owners when a recorded module has a missing dependency', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      `import '@acme/definitely-missing-dep';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n`,
    );

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
    expect(result.message).toContain('Theme "ocean"');
    expect(result.message).toContain('@acme/definitely-missing-dep');
    expect(result.message).not.toMatch(/\n\s+at /u);
    const cli = runDoctor(dir);
    expect(cli.status).toBe(1);
    expect(cli.stdout).not.toContain('No failures');
    expect(cli.stdout).toContain('Theme owners and built imports');
    expect(cli.stdout).toContain('@acme/definitely-missing-dep');
    expect(cli.stderr).not.toMatch(/\n\s+at /u);
  }, 30_000);

  it('fails theme-owners when a recorded module is malformed', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      'export const oceanTheme = ;\n',
    );

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
    expect(result.message).toContain('Theme "ocean"');
    expect(result.message).toContain('does not export "oceanTheme"');
    expect(result.message).not.toMatch(/\n\s+at /u);
  });

  it('passes theme-owners when a built module imports its stylesheet', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import './ocean.css';\nimport '@acme/themes/themes/ocean.css';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n",
    );

    const checks = await checkAppThemes(dir);

    expect(checks.map(item => item.status)).toEqual(Array(10).fill('pass'));
    expect(check(checks, 'theme-owners').message).toContain(
      'every built module loads',
    );
    const cli = runDoctor(dir);
    expect(cli.status).toBe(0);
    expect(cli.stdout).not.toContain('could not load its built module');
  }, 30_000);

  it('passes every check for an entry that loads its fonts and stylesheet and re-exports the built module', async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          "@font-face { font-family: 'Ocean Sans'; src: local('Ocean Sans'); }\n",
      },
    ]);
    write(
      path.join(packageDir, 'dist/ocean.built.js'),
      "export const oceanTheme = {name: 'ocean', tokens: {}, fontFamily: 'Ocean Sans'};\n",
    );
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import './ocean.fonts.css';\nimport '@acme/themes/themes/ocean.css';\nexport {oceanTheme} from './ocean.built.js';\n",
    );

    const checks = await checkAppThemes(dir);

    expect(checks.map(item => [item.id, item.status])).toEqual(
      checks.map(item => [item.id, 'pass']),
    );
    expect(checks).toHaveLength(10);
    const cli = runDoctor(dir);
    expect(cli.status).toBe(0);
    expect(cli.stdout).not.toContain('could not load its built module');
  }, 30_000);

  it('passes every check for an entry that re-exports a theme whose own name differs from its slug', async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="deep-sea"] { --color-text: black; }\n',
        fontFamily: 'Ocean Sans',
        fontCss:
          "@font-face { font-family: 'Ocean Sans'; src: local('Ocean Sans'); }\n",
      },
    ]);
    write(
      path.join(packageDir, 'dist/deep-sea.js'),
      "export const deepSeaTheme = {name: 'deep-sea', tokens: {}, fontFamily: 'Ocean Sans'};\n",
    );
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import './ocean.fonts.css';\nimport './ocean.css';\nexport {deepSeaTheme as oceanTheme} from './deep-sea.js';\n",
    );

    const checks = await checkAppThemes(dir);

    expect(checks.map(item => [item.id, item.status])).toEqual(
      checks.map(item => [item.id, 'pass']),
    );
    expect(checks).toHaveLength(10);
  }, 30_000);

  it.each([
    [
      'a missing dependency',
      "import '@acme/definitely-missing-dep';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n",
      '@acme/definitely-missing-dep',
    ],
    [
      'a throwing module',
      "throw new Error('broken theme module');\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n",
      'broken theme module',
    ],
  ])(
    'still fails theme-owners when a built module imports its stylesheet and has %s',
    async (_label, rest, detail) => {
      const {dir, packageDir} = await fixture();
      write(
        path.join(packageDir, 'dist/ocean.js'),
        `import './ocean.css';\n${rest}`,
      );

      const result = check(await checkAppThemes(dir), 'theme-owners');

      expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
      expect(result.message).toContain(
        'Theme "ocean" from @acme/themes could not load its built module',
      );
      expect(result.message).toContain(detail);
    },
  );

  it("still fails theme-owners when the theme's stylesheet export is missing", async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import './ocean.css';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n",
    );
    fs.rmSync(path.join(packageDir, 'dist/ocean.css'));

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
    expect(result.message).toContain(
      'Missing stylesheet export @acme/themes/themes/ocean.css',
    );
  });

  it('still fails theme-owners when another stylesheet the built module imports is missing', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import './ocean.css';\nimport './fonts.css';\nexport const oceanTheme = {name: 'ocean', tokens: {}};\n",
    );

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
    expect(result.message).toContain(
      'Theme "ocean" from @acme/themes could not load its built module',
    );
    expect(result.message).toContain('fonts.css');
  });

  it('fails theme-owners for an ambiguous multi-theme record', async () => {
    const {dir, packageDir} = await fixture([{slug: 'ocean'}, {slug: 'reef'}]);
    const packageFile = path.join(packageDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
    delete pkg.exports['./themes/ocean'];
    write(packageFile, JSON.stringify(pkg));

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'fail'});
    expect(result.message).toContain('ocean');
    expect(result.message).not.toMatch(/\n\s+at /u);
  });

  it.each([
    'theme-local-builds',
    'theme-private-variables',
    'theme-core-peers',
    'theme-fonts',
    'theme-global-rules',
  ])('%s cannot pass when theme discovery throws', async id => {
    const {dir} = await fixture();
    write(
      path.join(dir, 'astryx.config.mjs'),
      "throw new Error('fixture discovery failure');\n",
    );

    expect(check(await checkAppThemes(dir), id)).toMatchObject({
      status: 'info',
    });
  });

  it('lets the static default check pass when discovery throws', async () => {
    const {dir} = await fixture();
    write(
      path.join(dir, 'astryx.config.mjs'),
      "throw new Error('fixture discovery failure');\n",
    );

    expect(check(await checkAppThemes(dir), 'theme-default')).toMatchObject({
      status: 'pass',
    });
  });

  it('check 1 fails when a recorded built stylesheet no longer resolves', async () => {
    const {dir, packageDir} = await fixture();
    fs.rmSync(path.join(packageDir, 'dist/ocean.css'));

    expect(check(await checkAppThemes(dir), 'theme-owners')).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('theme add ocean'),
    });
  });

  it('check 2 fails when the generated module is hand-edited', async () => {
    const {dir, moduleFile} = await fixture();
    fs.appendFileSync(moduleFile, '// hand edit\n');

    expect(check(await checkAppThemes(dir), 'theme-module')).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('theme use ocean'),
    });
  });

  it('check 3 warns when no project source imports the generated module', async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {importModule: false});

    expect(
      check(await checkAppThemes(dir), 'theme-module-import'),
    ).toMatchObject({
      status: 'warn',
      fix: expect.stringContaining('themes[defaultThemeSlug]'),
    });
  });

  it('check 4 fails when a built module import loses its stylesheet pair', async () => {
    const {dir, moduleFile} = await fixture();
    const source = fs
      .readFileSync(moduleFile, 'utf-8')
      .replace('import "@acme/themes/themes/ocean.css";\n', '');
    fs.writeFileSync(moduleFile, source);

    expect(
      check(await checkAppThemes(dir), 'theme-stylesheet-imports'),
    ).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('theme use ocean'),
    });
  });

  it('check 5 fails when an added local theme cannot reproduce its outputs', async () => {
    const {dir} = await fixture();
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const localDir = path.join(dir, 'src/themes/ocean');
    const sourceFile = path.join(localDir, 'oceanTheme.ts');
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(dir, 'src/astryx-themes.ts'), 'utf-8'),
      ),
    ).toMatchObject({themes: {ocean: './src/themes'}});
    fs.appendFileSync(path.join(localDir, 'ocean.css'), '\n.injected {}\n');

    expect(
      check(await checkAppThemes(dir), 'theme-local-builds'),
    ).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('theme build'),
    });
  });

  it("check 5 is info, and builds nothing, when the project's Core is not installed (spec AST-081 FR3)", async () => {
    // Outside this repository, whose own installed Core would be found above.
    const {dir} = await fixture(undefined, {root: os.tmpdir()});
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});
    // A fresh clone: the project declares Core but has not installed it.
    fs.rmSync(path.join(dir, 'node_modules/@astryxdesign/core'), {
      recursive: true,
      force: true,
    });

    expect(check(await checkAppThemes(dir), 'theme-local-builds')).toEqual({
      id: 'theme-local-builds',
      label: 'Local theme build freshness',
      status: 'info',
      message:
        "The project's Core isn't installed, so local theme builds were not checked. Install the project's dependencies, then run doctor again.",
    });
    // A build that may read only the project's Core refuses instead of
    // reading another one.
    await expect(
      themeBuild(sourceFile, {check: true}, {cwd: dir, projectCore: true}),
    ).rejects.toMatchObject({code: 'ERR_CORE_NOT_FOUND'});
  });

  it.skipIf(process.platform === 'win32')(
    'check 5 through a CLI installed for the computer, in a fresh clone: info, and no carried Core is read or fetched',
    async () => {
      const home = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-doctor-home-'),
      );
      dirs.push(home);
      const g = globalCli('npm', CLI_VERSION, {root: home});
      const {dir} = await fixture(undefined, {root: os.tmpdir()});
      await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
      const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
      await themeBuild(sourceFile, {}, {cwd: dir});
      await themeAdd('ocean', {cwd: dir, import: true});
      fs.rmSync(path.join(dir, 'node_modules/@astryxdesign/core'), {
        recursive: true,
        force: true,
      });
      const cache = path.join(home, '.cache');
      const result = spawnSync(process.execPath, [g.bin, 'doctor', '--json'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          PATH: path.dirname(process.execPath),
          HOME: home,
          USERPROFILE: home,
          XDG_CACHE_HOME: cache,
          XDG_CONFIG_HOME: path.join(home, '.config'),
          // Nothing can be fetched: a fetch of the carried Core would fail.
          npm_config_registry: 'http://127.0.0.1:9/',
          npm_config_update_notifier: 'false',
          NO_COLOR: '1',
        },
      });
      const checks = JSON.parse(result.stdout).data.checks;
      expect(checks.find(c => c.id === 'theme-local-builds')).toMatchObject({
        status: 'info',
      });
      expect(
        fs.existsSync(path.join(cache, 'astryx', 'releases', CLI_VERSION)),
      ).toBe(false);
    },
    180_000,
  );

  it('check 6 ignores private variables generated from guaranteed component properties', async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="ocean"] { --_button-radius: var(--radius-full); }\n',
      },
    ]);
    write(
      path.join(packageDir, 'themes/ocean/oceanTheme.ts'),
      "export const oceanTheme = {name: 'ocean', tokens: {}, components: {button: {base: {borderRadius: 'var(--radius-full)'}}}};\n",
    );

    expect(
      check(await checkAppThemes(dir), 'theme-private-variables'),
    ).toMatchObject({status: 'pass'});
  });

  it('check 6 fails on a private --_* key in theme input', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'themes/ocean/oceanTheme.ts'),
      "export const oceanTheme = {name: 'ocean', tokens: {}, components: {button: {base: {'--_button-radius': '2px'}}}};\n",
    );

    const result = check(await checkAppThemes(dir), 'theme-private-variables');
    expect(result).toMatchObject({status: 'fail'});
    expect(result.message).toContain('--_button-radius');
  });

  it('check 7 fails when a theme peer range rejects installed Core', async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {peerRange: '^9.0.0'});

    const result = check(await checkAppThemes(dir), 'theme-core-peers');
    expect(result).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('npm install'),
    });
    expect(result.message).toContain('^9.0.0');
  });

  it('check 8 fails when the static default is not an added slug', async () => {
    const {dir, moduleFile} = await fixture();
    const source = fs
      .readFileSync(moduleFile, 'utf-8')
      .replace('"defaultThemeSlug":"ocean"', '"defaultThemeSlug":"ghost"');
    fs.writeFileSync(moduleFile, source);

    expect(check(await checkAppThemes(dir), 'theme-default')).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('theme use ocean'),
    });
  });

  it('check 9 warns when a named font has no stylesheet loader', async () => {
    const {dir} = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);

    const checks = await checkAppThemes(dir);
    const result = check(checks, 'theme-fonts');
    expect(result).toMatchObject({
      status: 'warn',
      fix: expect.stringContaining('fonts.css'),
    });
    expect(result.message).toContain('Ocean Sans');
    expect(checks.some(item => item.status === 'fail')).toBe(false);
  });

  it('check 9 warns when a local theme has no font stylesheet', async () => {
    const {dir} = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});

    const checks = await checkAppThemes(dir);
    expect(check(checks, 'theme-fonts')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('Ocean Sans'),
      fix: expect.stringContaining('<slug>.fonts.css'),
    });
    expect(checks.some(item => item.status === 'fail')).toBe(false);
  });

  it('check 9 passes when a local @font-face proves the named family', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n',
      },
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'pass',
    });
  });

  it('check 9 warns when an external import cannot prove the named family', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss: '@import url("https://fonts.example/ocean.css");\n',
      },
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('Ocean Sans'),
    });
  });

  it('check 10 fails on conflicting unscoped rules across added themes', async () => {
    const {dir} = await fixture([
      {slug: 'ocean', css: 'body { color: blue; }\n'},
      {slug: 'sunset', css: 'body { color: red; }\n'},
    ]);

    const result = check(await checkAppThemes(dir), 'theme-global-rules');
    expect(result).toMatchObject({status: 'fail'});
    expect(result.message).toContain('body');
  });

  it('reports one information check when the CLI manages no themes', async () => {
    const dir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-doctor-empty-'),
    );
    dirs.push(dir);
    write(path.join(dir, 'package.json'), '{"name":"empty"}\n');

    const checks = await checkAppThemes(dir);
    expect(checks).toEqual([
      expect.objectContaining({
        id: 'theme-management',
        status: 'info',
        message: expect.stringContaining('manages no themes'),
        fix: expect.stringContaining('theme add <slug>'),
      }),
    ]);
    expect(checks[0]?.fix).not.toContain('--import');
  });

  it('reads astryx.theme from the app package when node_modules is hoisted to a workspace root', async () => {
    const root = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-doctor-monorepo-'),
    );
    dirs.push(root);
    write(
      path.join(root, 'package.json'),
      JSON.stringify({name: 'mono', private: true, workspaces: ['packages/*']}),
    );
    for (const name of ['@astryxdesign/core', '@astryxdesign/theme-neutral']) {
      write(
        path.join(root, 'node_modules', name, 'package.json'),
        JSON.stringify({name, version: CLI_VERSION}),
      );
    }
    const app = path.join(root, 'packages/app');
    write(
      path.join(app, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {
          '@astryxdesign/core': CLI_VERSION,
          '@astryxdesign/theme-neutral': CLI_VERSION,
        },
        astryx: {theme: '@astryxdesign/theme-neutral'},
      }),
    );

    expect(await checkAppThemes(app)).toEqual([
      expect.objectContaining({
        id: 'theme-management',
        status: 'info',
        message: expect.stringContaining(
          'astryx.theme value "@astryxdesign/theme-neutral" remains active',
        ),
      }),
    ]);
    const doctor = runDoctor(app);
    expect(doctor.stdout).toContain('remains active');
    expect(doctor.stdout).not.toContain('no theme appears wired');
  });

  it('names an unmigrated copy without failing a project that has no module', async () => {
    const dir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-doctor-unmigrated-'),
    );
    dirs.push(dir);
    write(path.join(dir, 'package.json'), '{"name":"empty"}\n');
    write(
      path.join(dir, 'src/themes/ocean/oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );

    const checks = await checkAppThemes(dir);

    expect(checks).toHaveLength(2);
    expect(checks.some(item => item.status === 'fail')).toBe(false);
    expect(checks).toContainEqual(
      expect.objectContaining({
        id: 'theme-unmigrated-copies',
        status: 'warn',
        message: expect.stringContaining('src/themes/ocean'),
        fix: expect.stringContaining('upgrade --from 0.6.4 --path . --apply'),
      }),
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Fault-injection coverage for all twelve app-theme doctor checks. */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  checkAppThemes,
  checkThemes,
  themeImportWiring,
} from './theme-checks.mjs';
import {runChecks} from './doctor.mjs';
import {recordDeclaredSettings} from '../../foundation/env/cli-command.mjs';
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
 * A root module whose root Theme wraps `inner`: an app root doctor can read
 * (a plain element paints no page).
 * @param {string} dir @param {string} [inner]
 */
function writeRoot(dir, inner = '<main />') {
  write(
    path.join(dir, 'src/root.tsx'),
    `import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]}>${inner}</Theme>;\n`,
  );
  // (The page shell: its mount node is what the census reads.)
  write(
    path.join(dir, 'index.html'),
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>\n',
  );
}

/**
 * @param {Array<{slug: string, css?: string, fontFamily?: string, fontCss?: string}>} themeSpecs
 * @param {{peerRange?: string, importModule?: boolean, root?: string, reset?: boolean}} [options]
 *   `root`: the folder the fixture is made in (default: this package);
 *   `reset`: whether the app loads Core's reset (default true; false is an
 *   app embedded in a page it does not own)
 */
async function fixture(themeSpecs = [{slug: 'ocean'}], options = {}) {
  const dir = fs.mkdtempSync(
    path.join(options.root ?? REPO_ROOT, '.astryx-doctor-themes-'),
  );
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  write(path.join(dir, 'tsconfig.json'), '{}\n');
  // (An app that owns its page loads Core's reset; `reset: false` is the
  // embedded, guest setup.)
  if (options.reset !== false)
    write(
      path.join(dir, 'src/core-reset.css'),
      "@import '@astryxdesign/core/reset.css';\n",
    );
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
    const exportName = spec.exportName ?? `${spec.slug}Theme`;
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
    const dir = fs.mkdtempSync(path.join(REPO_ROOT, `.astryx-doctor-${name}-`));
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
    recordDeclaredSettings(dir, [
      {
        name: '@acme/ui',
        installGuidance: 'Add {packages} to package.json, then relock',
      },
    ]);
    // Named at the release of the CLI that answers: the app has no Core.
    expect(checkThemes(dir, await checkAppThemes(dir)).fix).toContain(
      `\`Add @astryxdesign/theme-neutral@${CLI_VERSION} to package.json, then relock\``,
    );
    recordDeclaredSettings(dir, []);

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

  /**
   * An app with installed single-theme packages that export their built module
   * and stylesheet, as the published `@astryxdesign/theme-*` packages do.
   * @param {string} name @param {string[]} slugs
   */
  function appWithBuiltThemes(name, slugs) {
    const dir = emptyApp(name);
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: Object.fromEntries(
          slugs.map(slug => [`@astryxdesign/theme-${slug}`, CLI_VERSION]),
        ),
      }),
    );
    write(
      path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    for (const slug of slugs) {
      const packageDir = path.join(
        dir,
        'node_modules/@astryxdesign',
        `theme-${slug}`,
      );
      write(
        path.join(packageDir, 'package.json'),
        JSON.stringify({
          name: `@astryxdesign/theme-${slug}`,
          version: CLI_VERSION,
          type: 'module',
          exports: {
            '.': './dist/index.js',
            './built': `./dist/${slug}.js`,
            './theme.css': './dist/theme.css',
          },
        }),
      );
      write(
        path.join(packageDir, `dist/${slug}.js`),
        `export const ${slug}Theme = {name: '${slug}', tokens: {}};\n`,
      );
      write(
        path.join(packageDir, 'dist/index.js'),
        `export {${slug}Theme} from './${slug}.js';\n`,
      );
      write(
        path.join(packageDir, 'dist/theme.css'),
        `[data-astryx-theme="${slug}"] { --color-text: black; }\n`,
      );
    }
    return dir;
  }

  /** @param {string} dir */
  async function themesCheck(dir) {
    return checkThemes(
      dir,
      await checkAppThemes(dir),
      await themeImportWiring(dir),
    );
  }

  it('an editor theme and a theme source that extend a package theme wire nothing; the app importing it does', async () => {
    const dir = appWithBuiltThemes('themes-editor-unwired', ['neutral']);
    // The theme editor's generated settings module: it imports its base
    // only to extend it.
    write(
      path.join(dir, 'themes/t/t.settings.ts'),
      [
        '// Generated by `astryx experimental theme editor` from t.settings.json on every change: do not edit.',
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "import {neutralTheme as base} from '@astryxdesign/theme-neutral/built';",
        '',
        'export const tSettings = defineTheme({',
        '  extends: base,',
        '});',
        '',
      ].join('\n'),
    );
    // A built module of it, generated by a build.
    write(
      path.join(dir, 'themes/t/t.js'),
      "/**\n * @generated by `astryx theme build`\n */\nimport {neutralTheme} from '@astryxdesign/theme-neutral/built';\nexport const tTheme = {...neutralTheme, name: 't'};\n",
    );
    // A theme source of the user's own with no generated header: it too
    // only extends the package theme.
    write(
      path.join(dir, 'themes/own/own.theme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {neutralTheme} from '@astryxdesign/theme-neutral/built';\nexport const ownTheme = defineTheme({name: 'own', extends: neutralTheme});\n",
    );

    expect((await themeImportWiring(dir)).wired).toEqual([]);
    expect(await themesCheck(dir)).toMatchObject({
      status: 'warn',
      message:
        'Theme package(s) installed (@astryxdesign/theme-neutral) but no theme appears wired.',
    });

    // The app itself imports the theme: wired.
    write(
      path.join(dir, 'app/layout.tsx'),
      "import '@astryxdesign/theme-neutral/theme.css';\nexport default function Layout() { return null; }\n",
    );
    expect(await themesCheck(dir)).toMatchObject({
      status: 'pass',
      message: expect.stringContaining(
        'wired by import: neutral (app/layout.tsx)',
      ),
    });
  });

  it('counts themes the app imports by their built module or stylesheet as wired, naming the file', async () => {
    // The shape of an internal app template: a layout that imports each
    // theme stylesheet and a provider that imports each built theme.
    const dir = appWithBuiltThemes('themes-imported', ['neutral', 'butter']);
    write(
      path.join(dir, 'app/layout.tsx'),
      "import '@astryxdesign/core/astryx.css';\nimport '@astryxdesign/theme-neutral/theme.css';\nimport '@astryxdesign/theme-butter/theme.css';\nexport default function Layout() { return null; }\n",
    );
    write(
      path.join(dir, 'app/themes/ThemeProvider.tsx'),
      "import {butterTheme} from '@astryxdesign/theme-butter/built';\nimport {neutralTheme} from '@astryxdesign/theme-neutral/built';\nexport const themes = {butterTheme, neutralTheme};\n",
    );

    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'butter',
        owner: '@astryxdesign/theme-butter',
        file: 'app/layout.tsx',
      },
      {
        slug: 'neutral',
        owner: '@astryxdesign/theme-neutral',
        file: 'app/layout.tsx',
      },
    ]);
    expect(await themesCheck(dir)).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'pass',
      message:
        'Theme package(s) installed (@astryxdesign/theme-butter, @astryxdesign/theme-neutral); wired by import: butter (app/layout.tsx), neutral (app/layout.tsx).',
    });
    const report = await runChecks({cwd: dir});
    expect(report.checks.find(item => item.id === 'themes')).toMatchObject({
      status: 'pass',
      message: expect.stringContaining(
        'wired by import: butter (app/layout.tsx)',
      ),
    });
  }, 30_000);

  it('counts a built module import alone, and a stylesheet @import', async () => {
    const dir = appWithBuiltThemes('themes-module-only', ['neutral', 'stone']);
    write(
      path.join(dir, 'src/theme.ts'),
      "export {neutralTheme} from '@astryxdesign/theme-neutral/built';\n",
    );
    write(
      path.join(dir, 'src/globals.css'),
      '@import "@astryxdesign/theme-stone/theme.css";\n',
    );

    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'neutral',
        owner: '@astryxdesign/theme-neutral',
        file: 'src/theme.ts',
      },
      {
        slug: 'stone',
        owner: '@astryxdesign/theme-stone',
        file: 'src/globals.css',
      },
    ]);
  });

  it('reads a stylesheet @import in url() without quotes, in any case', async () => {
    const dir = appWithBuiltThemes('themes-css-url', ['stone']);
    write(
      path.join(dir, 'src/globals.css'),
      '@IMPORT url(@astryxdesign/theme-stone/theme.css);\n',
    );

    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'stone',
        owner: '@astryxdesign/theme-stone',
        file: 'src/globals.css',
      },
    ]);
  });

  it('keeps the warning when the app only installs a theme, imports its types, or imports it from outside its own source', async () => {
    const dir = appWithBuiltThemes('themes-not-imported', ['neutral']);
    const warning = {
      id: 'themes',
      label: 'Theme packages',
      status: 'warn',
      message:
        'Theme package(s) installed (@astryxdesign/theme-neutral) but no theme appears wired.',
      fix: expect.stringContaining('theme add <slug>`.'),
    };
    expect(await themesCheck(dir)).toEqual(warning);

    write(
      path.join(dir, 'src/types.ts'),
      "import type {neutralTheme} from '@astryxdesign/theme-neutral/built';\nexport type T = typeof neutralTheme;\n",
    );
    write(
      path.join(dir, 'dist/app.js'),
      "import '@astryxdesign/theme-neutral/theme.css';\n",
    );
    write(
      path.join(dir, 'node_modules/some-lib/index.js'),
      "import '@astryxdesign/theme-neutral/theme.css';\n",
    );
    // Any other subpath of the package is not the theme's built import.
    write(
      path.join(dir, 'src/source.ts'),
      "import {neutralTheme} from '@astryxdesign/theme-neutral';\nvoid neutralTheme;\n",
    );
    expect(await themeImportWiring(dir)).toEqual({wired: [], unconfirmed: []});
    expect(await themesCheck(dir)).toEqual(warning);
  });

  it('follows a theme passed to Theme through a variable to its package', async () => {
    // A provider that picks the theme into a variable, from the package root.
    const dir = appWithBuiltThemes('themes-variable', ['matcha']);
    write(
      path.join(dir, 'app/providers.tsx'),
      [
        "import {Theme} from '@astryxdesign/core/theme';",
        "import {matchaTheme} from '@astryxdesign/theme-matcha';",
        'const appTheme = matchaTheme;',
        'export function Providers({children}: {children: React.ReactNode}) {',
        '  return <Theme theme={appTheme} mode="system">{children}</Theme>;',
        '}',
        '',
      ].join('\n'),
    );

    expect(await themeImportWiring(dir)).toEqual({
      wired: [
        {
          slug: 'matcha',
          owner: '@astryxdesign/theme-matcha',
          file: 'app/providers.tsx',
        },
      ],
      unconfirmed: [],
    });
    expect(await themesCheck(dir)).toMatchObject({
      status: 'pass',
      message: expect.stringContaining(
        'wired by import: matcha (app/providers.tsx)',
      ),
    });
  });

  it('follows an aliased Theme, defineTheme extends and a relative re-export', async () => {
    const dir = appWithBuiltThemes('themes-traced', ['neutral', 'stone']);
    write(
      path.join(dir, 'src/brand.ts'),
      [
        "import {defineTheme} from '@astryxdesign/core';",
        "import {neutralTheme as base} from '@astryxdesign/theme-neutral';",
        "export const brandTheme = defineTheme({name: 'brand', extends: base});",
        "export {stoneTheme as quietTheme} from '@astryxdesign/theme-stone';",
        '',
      ].join('\n'),
    );
    write(
      path.join(dir, 'src/App.tsx'),
      [
        "import {Theme as AppTheme} from '@astryxdesign/core';",
        "import {brandTheme, quietTheme} from './brand';",
        'export const App = () => (',
        '  <AppTheme theme={brandTheme}><AppTheme theme={quietTheme as never} /></AppTheme>',
        ');',
        '',
      ].join('\n'),
    );

    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'neutral',
        owner: '@astryxdesign/theme-neutral',
        file: 'src/App.tsx',
      },
      {slug: 'stone', owner: '@astryxdesign/theme-stone', file: 'src/App.tsx'},
    ]);
  });

  it('never counts a theme whose package is not installed', async () => {
    // The CLI bundles a descriptor for every official theme; that is not the
    // package being installed.
    const dir = emptyApp('themes-not-installed');
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', private: true}),
    );
    write(
      path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    write(
      path.join(dir, 'app/providers.tsx'),
      [
        "import {Theme} from '@astryxdesign/core/theme';",
        "import {neutralTheme} from '@astryxdesign/theme-neutral/built';",
        "import '@astryxdesign/theme-neutral/theme.css';",
        'export const Providers = ({children}: any) => (',
        '  <Theme theme={neutralTheme}>{children}</Theme>',
        ');',
        '',
      ].join('\n'),
    );

    expect((await themeImportWiring(dir)).wired).toEqual([]);
    expect(await themesCheck(dir)).toMatchObject({
      status: 'warn',
      message: 'No @astryxdesign/theme-* packages are installed.',
    });
  });

  it('leaves a theme declared inside a component unconfirmed, like other module readers', async () => {
    const dir = appWithBuiltThemes('themes-inner-scope', ['matcha']);
    write(
      path.join(dir, 'app/providers.tsx'),
      [
        "import {Theme} from '@astryxdesign/core/theme';",
        "import {matchaTheme} from '@astryxdesign/theme-matcha';",
        'export function Providers({children}: any) {',
        '  const theme = matchaTheme;',
        '  return <Theme theme={theme}>{children}</Theme>;',
        '}',
        '',
      ].join('\n'),
    );

    expect(await themeImportWiring(dir)).toEqual({
      wired: [],
      unconfirmed: [{file: 'app/providers.tsx'}],
    });
  });

  it('says it could not confirm a theme passed to Theme that it cannot trace', async () => {
    const dir = appWithBuiltThemes('themes-untraced', ['matcha']);
    write(
      path.join(dir, 'app/providers.tsx'),
      [
        "import {Theme} from '@astryxdesign/core/theme';",
        'export function Providers({theme, children}: any) {',
        '  return <Theme theme={theme}>{children}</Theme>;',
        '}',
        '',
      ].join('\n'),
    );

    expect(await themeImportWiring(dir)).toEqual({
      wired: [],
      unconfirmed: [{file: 'app/providers.tsx'}],
    });
    expect(await themesCheck(dir)).toEqual({
      id: 'themes',
      label: 'Theme packages',
      status: 'info',
      message:
        'Theme package(s) installed (@astryxdesign/theme-matcha); app/providers.tsx passes a theme to Theme that doctor could not trace to a theme import, so it could not confirm which theme is wired.',
      fix: expect.stringContaining('theme add <slug>`.'),
    });
  });

  it('leaves package.json astryx.theme deciding the result, without scanning', async () => {
    const dir = appWithBuiltThemes('themes-astryx-theme', ['neutral']);
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        astryx: {theme: '@astryxdesign/theme-neutral'},
      }),
    );
    write(
      path.join(dir, 'app/layout.tsx'),
      "import '@astryxdesign/theme-neutral/theme.css';\n",
    );
    expect(await themeImportWiring(dir)).toEqual({wired: [], unconfirmed: []});
    expect(await themesCheck(dir)).toMatchObject({
      status: 'pass',
      message:
        'Theme package(s) installed (@astryxdesign/theme-neutral); wired via package.json astryx.theme.',
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
  it('returns eleven positive passes for a healthy package theme', async () => {
    const {dir} = await fixture();
    const checks = await checkAppThemes(dir);

    expect(checks.map(item => item.id)).toEqual([
      'theme-owners',
      'theme-module',
      'theme-module-import',
      'theme-stylesheet-imports',
      'theme-local-builds',
      'theme-setting-effects',
      'theme-private-variables',
      'theme-core-peers',
      'theme-default',
      'theme-fonts',
      'theme-global-rules',
    ]);
    expect(checks.map(item => item.status)).toEqual(Array(11).fill('pass'));
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

    expect(checks.map(item => item.status)).toEqual(Array(11).fill('pass'));
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
    expect(checks).toHaveLength(11);
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
    expect(checks).toHaveLength(11);
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

  it("warns on theme-owners when the theme's stylesheet imports a file its package does not ship", async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        css: '@import \'./ocean-base.css\';\n[data-astryx-theme="ocean"] { --color-text: black; background: url(./waves.svg); }\n',
      },
    ]);

    const checks = await checkAppThemes(dir);
    const result = check(checks, 'theme-owners');

    // A warning: the module itself loads.
    expect(result).toMatchObject({id: 'theme-owners', status: 'warn'});
    expect(checks.some(item => item.status === 'fail')).toBe(false);
    expect(result.message).toContain(
      'Theme "ocean" from @acme/themes: its built module loads, but it or its stylesheet names a file the package does not ship',
    );
    expect(result.message).toContain(
      'dist/ocean.css:1: imports "./ocean-base.css", which is not a file in the package',
    );
    expect(result.message).toContain('imports "./waves.svg"');
    expect(result.message).not.toContain('every built module loads');

    write(path.join(packageDir, 'dist/ocean-base.css'), ':root {}\n');
    write(path.join(packageDir, 'dist/waves.svg'), '<svg/>\n');
    expect(check(await checkAppThemes(dir), 'theme-owners').status).toBe(
      'pass',
    );
  });

  it('names both causes on theme-owners when a built module imports TypeScript source and its stylesheet names a file the package does not ship', async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        css: '@import \'./ocean-base.css\';\n[data-astryx-theme="ocean"] { --color-text: black; }\n',
      },
    ]);
    write(
      path.join(packageDir, 'dist/icons.ts'),
      'export const icons: Record<string, string> = {};\n',
    );
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "/**\n * @generated by `astryx theme build` — do not edit manually.\n */\nimport {icons} from './icons';\nexport const oceanTheme = {name: 'ocean', tokens: {}, icons};\n",
    );

    const result = check(await checkAppThemes(dir), 'theme-owners');

    expect(result).toMatchObject({id: 'theme-owners', status: 'warn'});
    expect(result.message).toContain(
      'its built module loads, but it or its stylesheet names a file the package does not ship, and it imports TypeScript source, so an app',
    );
    expect(result.message).toContain('"./ocean-base.css"');
    expect(result.message).toContain('"./icons"');
  });

  it('passes theme-owners when a built module imports a folder by its index file', async () => {
    const {dir, packageDir} = await fixture();
    write(
      path.join(packageDir, 'dist/icons/index.js'),
      'export const icons = {};\n',
    );
    write(
      path.join(packageDir, 'dist/ocean.js'),
      "import {icons} from './icons';\nexport const oceanTheme = {name: 'ocean', tokens: {}, icons};\n",
    );

    expect(check(await checkAppThemes(dir), 'theme-owners').status).toBe(
      'pass',
    );
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
    'theme-setting-effects',
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

  /**
   * A fresh clone of an app that added the neutral and stone themes: its
   * `node_modules` holds Core but neither theme package.
   * @param {string[]} listed the theme packages the app's package.json lists
   */
  async function freshCloneWithThemes(listed) {
    const dir = fs.mkdtempSync(
      path.join(REPO_ROOT, '.astryx-doctor-fresh-clone-'),
    );
    dirs.push(dir);
    write(path.join(dir, 'tsconfig.json'), '{}\n');
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'doctor-app',
        private: true,
        dependencies: {
          '@astryxdesign/core': CLI_VERSION,
          ...Object.fromEntries(listed.map(name => [name, CLI_VERSION])),
        },
      }),
    );
    write(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    write(
      path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    const packageDirs = [];
    for (const slug of ['neutral', 'stone']) {
      const packageDir = path.join(
        dir,
        `node_modules/@astryxdesign/theme-${slug}`,
      );
      packageDirs.push(packageDir);
      write(
        path.join(packageDir, 'package.json'),
        JSON.stringify({
          name: `@astryxdesign/theme-${slug}`,
          version: CLI_VERSION,
          type: 'module',
          exports: {
            './built': `./dist/${slug}.js`,
            './theme.css': './dist/theme.css',
          },
        }),
      );
      write(
        path.join(packageDir, `dist/${slug}.js`),
        `export const ${slug}Theme = {name: '${slug}', tokens: {}};\n`,
      );
      write(
        path.join(packageDir, 'dist/theme.css'),
        `[data-astryx-theme="${slug}"] { --color-text: black; }\n`,
      );
      await themeAdd(slug, {cwd: dir, import: true});
    }
    // The project's dependencies are not installed yet.
    for (const packageDir of packageDirs)
      fs.rmSync(packageDir, {recursive: true});
    return dir;
  }

  it("check 1, in a fresh clone that lists the theme packages, says to install the project's dependencies once", async () => {
    const dir = await freshCloneWithThemes([
      '@astryxdesign/theme-neutral',
      '@astryxdesign/theme-stone',
    ]);

    const owners = check(await checkAppThemes(dir), 'theme-owners');
    expect(owners).toMatchObject({
      status: 'fail',
      message: [
        'Theme package "@astryxdesign/theme-neutral" is not installed, though this project lists it: install the project\'s dependencies with `pnpm install`.',
        'Theme package "@astryxdesign/theme-stone" is not installed, though this project lists it: install the project\'s dependencies with `pnpm install`.',
      ].join(' '),
      fix: 'pnpm install',
    });
  });

  it('check 1, in a fresh clone that lists only one of two theme packages, names each fix as its own command', async () => {
    const dir = await freshCloneWithThemes(['@astryxdesign/theme-neutral']);

    const owners = check(await checkAppThemes(dir), 'theme-owners');
    expect(owners.status).toBe('fail');
    // The listed theme's install stays a command of its own, before the
    // steps that add the other theme: with the project's package manager, at
    // the Core release its exact Core peer needs, then the theme again.
    const steps = owners.fix.split('; ');
    expect(steps[0]).toBe('pnpm install');
    expect(steps[1]).toBe(
      `pnpm add -E @astryxdesign/theme-stone@${CLI_VERSION}`,
    );
    expect(steps[2]).toMatch(/ theme add stone$/);
    expect(steps).toHaveLength(3);
  });

  it('check 1 names the package to add a theme from when a bundled theme shares its slug', async () => {
    // The app adds stone from @acme/themes, which it no longer lists or
    // installs. The CLI carries a stone theme of its own.
    const {dir, packageDir} = await fixture([{slug: 'stone'}]);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    delete pkg.dependencies['@acme/themes'];
    write(path.join(dir, 'package.json'), JSON.stringify(pkg));
    write(path.join(dir, 'package-lock.json'), '{}\n');
    fs.rmSync(packageDir, {recursive: true});

    const owners = check(await checkAppThemes(dir), 'theme-owners');
    expect(owners.status).toBe('fail');
    expect(owners.fix).toMatch(
      /^npm install @acme\/themes; .* theme add stone --package @acme\/themes$/,
    );
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

  it('check 4 leaves files that only extend a theme: theme sources and generated files', async () => {
    const {dir, moduleFile} = await fixture();
    const specifier = /from ["']([^"']*ocean[^"']*)["']/.exec(
      fs.readFileSync(moduleFile, 'utf-8'),
    )?.[1];
    expect(specifier).toBeTruthy();
    const brand = path.join(dir, 'themes/brand');
    fs.mkdirSync(brand, {recursive: true});
    // A theme source that extends the added theme.
    fs.writeFileSync(
      path.join(brand, 'brand.theme.ts'),
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanTheme} from '${specifier}';\nexport const brandTheme = defineTheme({extends: oceanTheme, name: 'brand'});\n`,
    );
    // Its build and the editor's settings module, with their headers.
    fs.writeFileSync(
      path.join(brand, 'brand.js'),
      `/**\n * @generated by \`astryx theme build\` — do not edit manually.\n * Source: themes/brand/brand.theme.ts\n */\n\nimport {oceanTheme} from '${specifier}';\nexport const brandTheme = {...oceanTheme};\n`,
    );
    fs.writeFileSync(
      path.join(brand, 'brand.settings.ts'),
      `// Generated by \`astryx experimental theme editor\` from brand.settings.json on every change: do not edit.\nimport {oceanTheme} from '${specifier}';\nexport const brandSettings = oceanTheme;\n`,
    );
    expect(
      check(await checkAppThemes(dir), 'theme-stylesheet-imports'),
    ).toMatchObject({status: 'pass'});

    // An app file that renders the theme without its stylesheet still
    // fails, even beside an inline extends or a comment naming one.
    for (const body of [
      `export const page = oceanTheme;\n`,
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const themes = [oceanTheme, defineTheme({extends: oceanTheme, name: 'x'})];\n`,
      `// defineTheme({extends: oceanTheme})\nexport const page = oceanTheme;\n`,
      // An extend-only import beside another way of loading the module.
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const t = defineTheme({extends: oceanTheme, name: 'x'});\nexport * from '${specifier}';\n`,
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const t = defineTheme({extends: oceanTheme, name: 'x'});\nexport const later = () => import('${specifier}');\n`,
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const t = defineTheme({extends: oceanTheme, name: 'x'});\nexport const later = () => require('${specifier}');\n`,
    ]) {
      fs.writeFileSync(
        path.join(dir, 'src/Page.tsx'),
        `import {oceanTheme} from '${specifier}';\n${body}`,
      );
      expect(
        check(await checkAppThemes(dir), 'theme-stylesheet-imports'),
      ).toMatchObject({status: 'fail'});
    }
  });

  it('warns, with the theme, the setting and the fix, about a local theme setting that never shows', async () => {
    const {dir} = await fixture();
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const localDir = path.join(dir, 'src/themes/ocean');
    const sourceFile = path.join(localDir, 'oceanTheme.ts');
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}, components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});
    const result = check(await checkAppThemes(dir), 'theme-setting-effects');
    expect(result).toMatchObject({status: 'warn'});
    expect(result.message).toContain(
      '1 setting does not show as written: ocean: components.tab.selected.borderTopColor (#dddddd) never shows',
    );
    expect(result.fix).toBe(
      'ocean: write borderTopColor after border in components.tab.selected, or give its value in border.',
    );
    // Its outputs are current: the freshness check still passes.
    expect(
      check(await checkAppThemes(dir), 'theme-local-builds'),
    ).toMatchObject({status: 'pass'});
  });

  it("says a generated local theme's settings that never show as one note, as the build does", async () => {
    const {dir} = await fixture();
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    fs.writeFileSync(
      sourceFile,
      "// @generated by scripts/make-ocean.mjs\nconst oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}, components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});
    expect(check(await checkAppThemes(dir), 'theme-setting-effects')).toEqual({
      id: 'theme-setting-effects',
      label: 'Theme settings that show',
      status: 'info',
      message: expect.stringMatching(
        /^ocean: 1 setting that src\/themes\/ocean\/oceanTheme\.ts writes does not show as written; that file is generated, so fix it in its generator, scripts\/make-ocean\.mjs \(\S.* theme build src\/themes\/ocean\/oceanTheme\.ts --check --json lists it\)\.$/,
      ),
    });
  });

  it('never passes theme-setting-effects for a local theme whose build check did not run', async () => {
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
    // The source now sets a private variable: the build refuses it, so its
    // check never returns.
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}, components: {card: {base: {'--_card-radius': '4px'}}}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-setting-effects')).toEqual({
      id: 'theme-setting-effects',
      label: 'Theme settings that show',
      status: 'info',
      message:
        'Not checked, because its build check did not run: ocean (it sets a private variable).',
    });
  });

  it('names what the build said for a local theme whose source loads but is refused', async () => {
    const {dir} = await fixture();
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('ocean', {cwd: dir, import: true});
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}, motion: {fast: 100}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    const found = check(await checkAppThemes(dir), 'theme-setting-effects');
    expect(found.status).toBe('info');
    expect(found.message).toMatch(
      /^Not checked, because its build check did not run: ocean \(the build refused it: .+\)\.$/,
    );
    expect(found.message).not.toContain('did not load');
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

  it('check 5 compares a local theme another command generates, and its fix is that exact command', async () => {
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
    // The source now carries another command's generated mark, naming the
    // exact command that writes it.
    fs.writeFileSync(
      sourceFile,
      `// Written by \`astryx experimental theme editor show ocean\` after every build; do not edit it here.\n${fs.readFileSync(sourceFile, 'utf8')}`,
    );
    expect(
      check(await checkAppThemes(dir), 'theme-local-builds'),
    ).toMatchObject({status: 'pass'});

    // A hand-edited output is still found stale; the fix runs the command
    // the mark names, never a `theme build` of the generated source.
    const css = path.join(localDir, 'ocean.css');
    fs.writeFileSync(
      css,
      `${fs.readFileSync(css, 'utf8')}\n.mine { color: red; }\n`,
    );
    const fresh = check(await checkAppThemes(dir), 'theme-local-builds');
    expect(fresh.status).toBe('fail');
    expect(fresh.message).toContain('ocean');
    expect(fresh.fix).toMatch(
      / experimental theme editor show ocean; .* theme add ocean$/,
    );
    expect(fresh.fix).not.toMatch(/theme build/);

    // Its built module gone: the owners fix is the same exact command.
    fs.rmSync(path.join(localDir, 'ocean.js'));
    const owners = check(await checkAppThemes(dir), 'theme-owners');
    expect(owners.status).toBe('fail');
    expect(owners.fix).toMatch(
      / experimental theme editor show ocean; .* theme add ocean$/,
    );
    expect(owners.fix).not.toMatch(/theme build/);

    // A themes folder discovery refuses: the fix names the theme only when
    // the message does.
    write(path.join(dir, 'src/themes/manifest.json'), '{}\n');
    const broken = check(await checkAppThemes(dir), 'theme-owners');
    expect(broken.fix).not.toContain('<slug>');
    expect(broken.fix).not.toMatch(/theme add (?!ocean\b)/);
  });

  it('check 5 names the generating command when a marked source that re-exports its built module has none', async () => {
    for (const mark of [
      'Written by `astryx experimental theme editor show ocean`',
      // A copy written before files named their exact command.
      'Written by `astryx experimental theme editor`',
    ]) {
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
      // The source re-exports its built module, as a generated copy does.
      fs.writeFileSync(
        sourceFile,
        `// ${mark} after every build; do not edit it here.\nexport {oceanTheme, default} from './ocean.js';\n`,
      );
      fs.rmSync(path.join(localDir, 'ocean.js'));
      const owners = check(await checkAppThemes(dir), 'theme-owners');
      expect(owners.status, mark).toBe('fail');
      expect(owners.fix, mark).toMatch(
        / experimental theme editor show ocean; .* theme add ocean$/,
      );
      expect(owners.fix, mark).not.toMatch(/theme build/);
      expect(owners.message, mark).not.toMatch(/Run `[^`]*theme build/);
    }
    // A theme whose name has a dash: its source is named by the theme's
    // identifier (myThemeTheme.ts), as the editor and eject write it.
    const {dir} = await fixture([
      {slug: 'my-theme', exportName: 'myThemeTheme'},
    ]);
    await themeEject('my-theme', {cwd: dir, package: '@acme/themes'});
    const localDir = path.join(dir, 'src/themes/my-theme');
    const sourceFile = path.join(localDir, 'myThemeTheme.ts');
    expect(fs.existsSync(sourceFile)).toBe(true);
    fs.writeFileSync(
      sourceFile,
      "const myThemeTheme = {name: 'my-theme', tokens: {'--color-bg': '#000'}};\nexport {myThemeTheme};\nexport default myThemeTheme;\n",
    );
    await themeBuild(sourceFile, {}, {cwd: dir});
    await themeAdd('my-theme', {cwd: dir, import: true});
    fs.writeFileSync(
      sourceFile,
      "// Written by `astryx experimental theme editor show my-theme` after every build; do not edit it here.\nexport {myThemeTheme, default} from './my-theme.js';\n",
    );
    fs.rmSync(path.join(localDir, 'my-theme.js'));
    const owners = check(await checkAppThemes(dir), 'theme-owners');
    expect(owners.status).toBe('fail');
    expect(owners.fix).toMatch(
      / experimental theme editor show my-theme; .* theme add my-theme$/,
    );
  });

  it('check 5 leaves a local theme that sets a private var to the private-variables check', async () => {
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
    // A hand edit sets a private var after the theme was built and added.
    fs.writeFileSync(
      sourceFile,
      "const oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}, components: {button: {base: {'--_button-radius': '2px'}}}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );

    const checks = await checkAppThemes(dir);
    // Not a stale output, and never a pass: the build refuses the theme, so
    // its outputs were not compared.
    expect(check(checks, 'theme-local-builds')).toMatchObject({
      status: 'info',
      message: expect.stringContaining('Not checked: ocean'),
      fix: expect.stringContaining('theme-private-variables'),
    });
    const priv = check(checks, 'theme-private-variables');
    expect(priv).toMatchObject({status: 'fail'});
    expect(priv.message).toContain('--_button-radius');
  });

  it('check 5 names a package a local theme imports and the app lacks, with the install command', async () => {
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
    fs.writeFileSync(
      sourceFile,
      "import 'not-installed-icons';\nconst oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );

    expect(
      check(await checkAppThemes(dir), 'theme-local-builds'),
    ).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('not-installed-icons (ocean)'),
      fix: expect.stringMatching(
        /^(npm install|pnpm add|yarn add|bun add) not-installed-icons$/,
      ),
    });
  });

  it('check 5 names the install command and then the rebuild of another stale local theme', async () => {
    const {dir} = await fixture([{slug: 'ocean'}, {slug: 'reef'}]);
    for (const slug of ['ocean', 'reef']) {
      await themeEject(slug, {cwd: dir, package: '@acme/themes'});
      const sourceFile = path.join(dir, `src/themes/${slug}/${slug}Theme.ts`);
      fs.writeFileSync(
        sourceFile,
        `const ${slug}Theme = {name: '${slug}', tokens: {'--color-bg': '#000'}};\nexport {${slug}Theme};\nexport default ${slug}Theme;\n`,
      );
      await themeBuild(sourceFile, {}, {cwd: dir});
      await themeAdd(slug, {cwd: dir, import: true});
    }
    fs.writeFileSync(
      path.join(dir, 'src/themes/ocean/oceanTheme.ts'),
      "import 'not-installed-icons';\nconst oceanTheme = {name: 'ocean', tokens: {'--color-bg': '#000'}};\nexport {oceanTheme};\nexport default oceanTheme;\n",
    );
    fs.appendFileSync(
      path.join(dir, 'src/themes/reef/reef.css'),
      '\n.injected {}\n',
    );

    const result = check(await checkAppThemes(dir), 'theme-local-builds');
    expect(result).toMatchObject({
      status: 'fail',
      message: expect.stringContaining(
        'Local theme outputs are also missing or stale: reef.',
      ),
    });
    expect(result.fix).toMatch(
      /^(npm install|pnpm add|yarn add|bun add) not-installed-icons .*theme build .*reef/,
    );
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

  it.skipIf(process.platform === 'win32')(
    "check 6 through a CLI installed for the computer, which has no Core: reads the input with the project's Core",
    async () => {
      const home = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-doctor-home-'),
      );
      dirs.push(home);
      const g = globalCli('npm', CLI_VERSION, {root: home, withoutCore: true});
      const {dir, packageDir} = await fixture(undefined, {root: os.tmpdir()});
      const projectCore = path.join(dir, 'node_modules/@astryxdesign/core');
      fs.rmSync(projectCore, {recursive: true, force: true});
      fs.symlinkSync(path.join(REPO_ROOT, 'packages/core'), projectCore, 'dir');
      write(
        path.join(packageDir, 'themes/ocean/oceanTheme.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({name: 'ocean', tokens: {}});\n",
      );
      const privateCheck = () => {
        const result = spawnSync(
          process.execPath,
          [g.bin, 'doctor', '--json'],
          {
            cwd: dir,
            encoding: 'utf8',
            timeout: 120_000,
            env: {
              PATH: path.dirname(process.execPath),
              HOME: home,
              USERPROFILE: home,
              XDG_CACHE_HOME: path.join(home, '.cache'),
              XDG_CONFIG_HOME: path.join(home, '.config'),
              npm_config_registry: 'http://127.0.0.1:9/',
              npm_config_update_notifier: 'false',
              NO_COLOR: '1',
            },
          },
        );
        return JSON.parse(result.stdout).data.checks.find(
          c => c.id === 'theme-private-variables',
        );
      };

      expect(privateCheck()).toMatchObject({status: 'pass'});

      // A fresh clone: no Core to load the input with.
      fs.rmSync(projectCore, {recursive: true, force: true});
      expect(privateCheck()).toEqual({
        id: 'theme-private-variables',
        label: 'Private theme variables',
        status: 'info',
        message:
          "The project's Core isn't installed, so theme inputs were not checked for private variables. Install the project's dependencies, then run doctor again.",
      });
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

  it("check 6 reads a bundled theme's input from the package the project installs", async () => {
    const dir = fs.mkdtempSync(
      path.join(REPO_ROOT, '.astryx-doctor-bundled-input-'),
    );
    dirs.push(dir);
    write(path.join(dir, 'tsconfig.json'), '{}\n');
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'doctor-app',
        private: true,
        dependencies: {
          '@astryxdesign/core': CLI_VERSION,
          '@astryxdesign/theme-neutral': CLI_VERSION,
        },
      }),
    );
    write(
      path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    const packageDir = path.join(
      dir,
      'node_modules/@astryxdesign/theme-neutral',
    );
    write(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/theme-neutral',
        version: CLI_VERSION,
        type: 'module',
        exports: {
          './built': './dist/neutral.js',
          './theme.css': './dist/theme.css',
          './fonts.css': './fonts.css',
        },
      }),
    );
    write(
      path.join(packageDir, 'dist/neutral.js'),
      "export const neutralTheme = {name: 'neutral', tokens: {}};\n",
    );
    write(
      path.join(packageDir, 'dist/theme.css'),
      '[data-astryx-theme="neutral"] { --color-text: black; }\n',
    );
    write(path.join(packageDir, 'fonts.css'), '');
    await themeAdd('neutral', {cwd: dir, import: true});
    write(
      path.join(dir, 'src/index.tsx'),
      "import {themes, defaultThemeSlug} from './astryx-themes';\nvoid themes[defaultThemeSlug];\n",
    );

    // A package that ships no source of its own: the CLI's copy is read.
    expect(
      check(await checkAppThemes(dir), 'theme-private-variables'),
    ).toMatchObject({status: 'pass'});

    // The package's own copy is the one the app uses.
    write(
      path.join(packageDir, 'src/neutralTheme.ts'),
      "export const neutralTheme = {name: 'neutral', tokens: {}, components: {button: {base: {'--_button-radius': '2px'}}}};\n",
    );
    const result = check(await checkAppThemes(dir), 'theme-private-variables');
    expect(result).toMatchObject({status: 'fail'});
    expect(result.message).toContain('--_button-radius');
  });

  it('check 7 fails when a theme peer range rejects installed Core', async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {peerRange: '^9.0.0'});

    const result = check(await checkAppThemes(dir), 'theme-core-peers');
    // With the package manager of the project's folder.
    expect(result).toMatchObject({
      status: 'fail',
      fix: expect.stringMatching(
        /^(?:npm install|pnpm add) '@astryxdesign\/core@\^9\.0\.0'; /u,
      ),
    });
    expect(result.message).toContain('^9.0.0');
  });

  it("check 7's fix saves the one Core version a theme accepts exactly, in a project that pins its Core", async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {peerRange: '9.0.0'});

    expect(check(await checkAppThemes(dir), 'theme-core-peers').fix).toMatch(
      /^(?:npm install|pnpm add) -E @astryxdesign\/core@9\.0\.0; .*doctor$/u,
    );
  });

  it('check 7 passes a theme package whose Core range is empty, which accepts every Core', async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {peerRange: ''});

    expect(check(await checkAppThemes(dir), 'theme-core-peers')).toMatchObject({
      status: 'pass',
    });
  });

  it('reports an added theme package outside the Core range once, as theme-core-peers', async () => {
    const {dir} = await fixture([{slug: 'ocean'}], {peerRange: '^9.0.0'});

    const {checks} = await runChecks({cwd: dir});
    expect(check(checks, 'theme-core-peers')).toMatchObject({status: 'fail'});
    expect(
      checks.find(item => item.id === 'integration-core-range'),
    ).toBeUndefined();
  }, 30_000);

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

  it('check 9 passes when the page head links a font service stylesheet for the family, as a theme README gives it', async () => {
    const {dir} = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    write(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link\n  rel="stylesheet"\n  href="https://fonts.googleapis.com/css2?family=Ocean+Sans:wght@400;700&display=swap" /></head><body><div id="root"></div></body></html>\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'pass',
    });
  });

  it('check 9 reads a Next.js root layout, and never a commented link or a preload', async () => {
    const layout = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    write(
      path.join(layout.dir, 'app/layout.js'),
      'export default function RootLayout({children}) {\n  return (<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ocean+Sans&display=swap" /></head><body>{children}</body></html>);\n}\n',
    );
    expect(
      check(await checkAppThemes(layout.dir), 'theme-fonts'),
    ).toMatchObject({
      status: 'pass',
    });

    const lineComment = await fixture([
      {slug: 'ocean', fontFamily: 'Ocean Sans'},
    ]);
    write(
      path.join(lineComment.dir, 'app/layout.tsx'),
      'export default function RootLayout({children}) {\n  // <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ocean+Sans" />\n  return <html><head /><body>{children}</body></html>;\n}\n',
    );
    expect(
      check(await checkAppThemes(lineComment.dir), 'theme-fonts'),
    ).toMatchObject({status: 'warn'});

    const commented = await fixture([
      {slug: 'ocean', fontFamily: 'Ocean Sans'},
    ]);
    write(
      path.join(commented.dir, 'index.html'),
      '<!doctype html><html><head><!-- <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ocean+Sans" /> --><link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Ocean+Sans&stylesheet" /></head></html>\n',
    );
    expect(
      check(await checkAppThemes(commented.dir), 'theme-fonts'),
    ).toMatchObject({status: 'warn'});
  });

  it('check 9 counts only a known font service, and only the families it names', async () => {
    const other = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    write(
      path.join(other.dir, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="https://example.com/css2?family=Ocean+Sans" /></head></html>\n',
    );
    expect(check(await checkAppThemes(other.dir), 'theme-fonts')).toMatchObject(
      {
        status: 'warn',
      },
    );

    const wrong = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    write(
      path.join(wrong.dir, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap" /></head></html>\n',
    );
    expect(check(await checkAppThemes(wrong.dir), 'theme-fonts')).toMatchObject(
      {
        status: 'warn',
      },
    );
  });

  it('check 9 names the page file its font link goes in', async () => {
    const {dir} = await fixture([{slug: 'ocean', fontFamily: 'Ocean Sans'}]);
    write(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head></head></html>\n',
    );
    const result = check(await checkAppThemes(dir), 'theme-fonts');
    expect(result).toMatchObject({status: 'warn'});
    expect(result.fix).toContain('to the <head> of index.html');
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
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n',
      },
    ]);
    write(path.join(packageDir, 'dist/ocean.woff2'), 'font');

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'pass',
    });
  });

  it('check 9 names the package that loads a family the font stylesheet lacks', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Inter',
        fontCss:
          '/* No font stylesheets: no installed package loads them. */\n',
      },
    ]);

    const result = check(await checkAppThemes(dir), 'theme-fonts');
    expect(result).toMatchObject({status: 'fail'});
    expect(result.fix).toMatch(
      /^Install the packages that load them \((npm install|pnpm add|yarn add|bun add) @fontsource\/inter\), then /,
    );
  });

  it('check 9 keeps the stylesheet step for a self-hosted family, naming no package it would guess', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Acme Sans',
        fontCss:
          '/* No font stylesheets: no installed package loads them. */\n',
      },
    ]);

    const result = check(await checkAppThemes(dir), 'theme-fonts');
    expect(result).toMatchObject({status: 'fail'});
    expect(result.fix).toMatch(
      /^Add the missing font stylesheet export or local <slug>\.fonts\.css, then /,
    );
    expect(result.fix).not.toContain('@fontsource/acme-sans');
  });

  it("check 9 counts a family that another added theme's font stylesheet loads, as for a theme that extends it", async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n',
      },
      {slug: 'sunset', fontFamily: 'Ocean Sans'},
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'pass',
    });
  });

  it("check 9 reports an imported font stylesheet it cannot parse, even when another theme's stylesheet loads the family", async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n',
      },
      {
        slug: 'sunset',
        fontFamily: 'Ocean Sans',
        fontCss: '@font-face { font-family: "Ocean Sans"; src: url(\n',
      },
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'fail',
      message: expect.stringContaining(
        'sunset: font stylesheet could not be parsed',
      ),
    });
  });

  it('check 9 still warns for a family that no font stylesheet the module imports loads, naming only that one', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n',
      },
      {slug: 'sunset', fontFamily: '"Ocean Sans", "Sunset Serif"'},
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'warn',
      message:
        'Added themes name font families but import no font stylesheet (sunset: Sunset Serif (font stylesheet is not imported)).',
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

  it('check 9 passes when a font service URL names the family, as Google Fonts imports do', async () => {
    for (const fontCss of [
      "@import url('https://fonts.googleapis.com/css2?family=Ocean+Sans:wght@400;500;600;700&display=swap');\n",
      '@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&family=Ocean+Sans&display=swap");\n',
      '@import "//fonts.googleapis.com/css?family=Roboto:400,700|Ocean+Sans:400";\n',
    ]) {
      const {dir} = await fixture([
        {slug: 'ocean', fontFamily: 'Ocean Sans', fontCss},
      ]);
      expect(
        check(await checkAppThemes(dir), 'theme-fonts'),
        fontCss,
      ).toMatchObject({
        status: 'pass',
        message:
          'Every named non-system font is loaded by an @font-face rule or a font service URL that names it.',
      });
    }
  });

  it('check 9 still warns for a family the font service URL does not name', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss:
          "@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;700&display=swap');\n",
      },
    ]);

    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'warn',
      message: 'External font imports prevent proof for ocean: Ocean Sans.',
    });
  });

  it('check 9 follows a local font import, a relative file or a package stylesheet, and proves its families', async () => {
    for (const spec of [
      './ocean-faces.css',
      'ocean-faces.css',
      'url(ocean-faces.css)',
      '@fontsource/ocean-sans/index.css',
    ]) {
      const {dir, packageDir} = await fixture([
        {
          slug: 'ocean',
          fontFamily: 'Ocean Sans',
          fontCss: spec.startsWith('url(')
            ? `@import ${spec};\n`
            : `@import "${spec}";\n`,
        },
      ]);
      const faces =
        '@font-face { font-family: "Ocean Sans"; src: url("./ocean.woff2"); }\n';
      if (!spec.startsWith('@')) {
        write(path.join(packageDir, 'dist/ocean-faces.css'), faces);
        write(path.join(packageDir, 'dist/ocean.woff2'), 'font');
      } else {
        write(
          path.join(dir, 'node_modules/@fontsource/ocean-sans/package.json'),
          JSON.stringify({name: '@fontsource/ocean-sans', version: '1.0.0'}),
        );
        write(
          path.join(dir, 'node_modules/@fontsource/ocean-sans/index.css'),
          faces,
        );
      }
      expect(
        check(await checkAppThemes(dir), 'theme-fonts'),
        spec,
      ).toMatchObject({status: 'pass'});
    }
  });

  it('check 9 warns, never fails, on a local font import it cannot follow', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss: '@import "@fontsource/not-installed/index.css";\n',
      },
    ]);
    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('could not follow'),
    });
  });

  it('check 9 warns, never fails, when a chain of local imports runs past the files it follows', async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss: '@import "./f1.css";\n',
      },
    ]);
    for (let i = 1; i <= 22; i++)
      write(
        path.join(packageDir, `dist/f${i}.css`),
        i < 22
          ? `@import "./f${i + 1}.css";\n`
          : '@font-face { font-family: "Ocean Sans"; src: url("./o.woff2"); }\n',
      );
    write(path.join(packageDir, 'dist/o.woff2'), 'font');
    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('could not follow'),
    });
  });

  it("check 9 follows a package import from the stylesheet's real folder, as a linked install keeps it", async () => {
    const {dir, packageDir} = await fixture([
      {
        slug: 'ocean',
        fontFamily: 'Ocean Sans',
        fontCss: '@import "@fontsource/ocean-sans/index.css";\n',
      },
    ]);
    // The theme package really lives in a store folder beside its own
    // font package, and the app reaches it through a link.
    const store = path.join(dir, '.store/themes/node_modules');
    fs.mkdirSync(path.join(store, '@acme'), {recursive: true});
    fs.renameSync(packageDir, path.join(store, '@acme/themes'));
    fs.symlinkSync(path.join(store, '@acme/themes'), packageDir, 'dir');
    write(
      path.join(store, '@fontsource/ocean-sans/package.json'),
      JSON.stringify({name: '@fontsource/ocean-sans', version: '1.0.0'}),
    );
    write(
      path.join(store, '@fontsource/ocean-sans/index.css'),
      '@font-face { font-family: "Ocean Sans"; src: url("./o.woff2"); }\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-fonts')).toMatchObject({
      status: 'pass',
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

  it('warns when a one-mode theme page is painted by neither AppShell nor a body background', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="ocean"] { --color-background-body: #101314; --color-text-primary: #e8f1f6; }\n',
      },
    ]);
    writeRoot(dir);
    const result = check(await checkAppThemes(dir), 'theme-page-color');
    expect(result).toMatchObject({status: 'warn'});
    expect(result.message).toContain('drawn for dark mode only');
    expect(result.fix).toMatch(
      /^Wrap the page in AppShell; if you can't, pass the theme's mode to the root Theme \(mode="dark"\), or add `body \{ background: var\(--color-background-body\) \}` to global CSS/,
    );
  });

  it('passes the one-mode page check when the app renders AppShell or paints the body', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const shell = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(shell.dir, 'src/App.tsx'),
      "import {AppShell} from '@astryxdesign/core';\nexport const App = () => <AppShell />;\n",
    );
    expect(
      check(await checkAppThemes(shell.dir), 'theme-page-color'),
    ).toMatchObject({status: 'pass'});

    const subpath = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(subpath.dir, 'src/App.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const App = () => <AppShell />;\n",
    );
    expect(
      check(await checkAppThemes(subpath.dir), 'theme-page-color'),
    ).toMatchObject({status: 'pass'});

    // (The theme's recorded mode, passed to the root Theme.)
    const moded = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(moded.packageDir, 'dist/ocean.js'),
      'export const oceanTheme = {name: \'ocean\', tokens: {}};\nexport const colorModes = ["dark"];\n',
    );
    await themeAdd('ocean', {
      cwd: moded.dir,
      import: true,
      package: '@acme/themes',
    });
    write(
      path.join(moded.dir, 'src/App.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, themeModes, defaultThemeSlug} from './astryx-themes';\nexport const App = () => <Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug]} />;\n",
    );
    expect(
      check(await checkAppThemes(moded.dir), 'theme-page-color'),
    ).toMatchObject({status: 'pass'});

    const body = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(body.dir, 'src/global.css'),
      'body { background: var(--color-background-body); }\n',
    );
    expect(
      check(await checkAppThemes(body.dir), 'theme-page-color'),
    ).toMatchObject({status: 'pass'});
  });

  it('passes the one-mode page check when the root Theme takes a literal mode', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n',
      },
    ]);
    write(
      path.join(dir, 'src/main.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]} mode=\"dark\" />;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'pass',
    });
  });

  it('reads an oklch page color, and counts no nested Theme, other mode prop, custom property or commented rule', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: oklch(0.2 0.02 250); }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(dir, 'src/main.tsx'),
      'import {Theme} from \'@astryxdesign/core/theme\';\nimport {themes, defaultThemeSlug} from \'./astryx-themes\';\nconst MediaTheme = ({mode}) => <section data-mode={mode} />;\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]}><MediaTheme mode="dark" /><Theme theme={themes[defaultThemeSlug]} mode="light" /></Theme>;\n',
    );
    write(
      path.join(dir, 'src/global.css'),
      ':root { --page-background: var(--color-background-body); }\n/* body { background: var(--color-background-body); } */\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('reads the wiring theme add prints, and a light-dark pair of functional colors', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: light-dark(oklch(0.2 0.02 250), oklch(0.25 0.02 250)); }\n';
    const wired = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(wired.packageDir, 'dist/ocean.js'),
      'export const oceanTheme = {name: \'ocean\', tokens: {}};\nexport const colorModes = ["dark"];\n',
    );
    await themeAdd('ocean', {
      cwd: wired.dir,
      import: true,
      package: '@acme/themes',
    });
    writeRoot(wired.dir);
    const bare = check(await checkAppThemes(wired.dir), 'theme-page-color');
    expect(bare).toMatchObject({status: 'warn'});
    write(
      path.join(wired.dir, 'src/main.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, themeModes, defaultThemeSlug} from './astryx-themes';\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug] ?? 'system'} />;\n",
    );
    fs.rmSync(path.join(wired.dir, 'src/root.tsx'));
    expect(
      check(await checkAppThemes(wired.dir), 'theme-page-color'),
    ).toMatchObject({status: 'pass'});
  });

  it('counts a fixed mode only on the Theme that takes the default theme', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(dir, 'src/Section.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes} from './astryx-themes';\nexport const Section = () => <Theme theme={themes.ocean} mode=\"dark\" />;\n",
    );
    writeRoot(dir);
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('warns when the root Theme is given the other mode, and suggests themeModes for a recorded mode', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(dir, 'src/main.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]} mode=\"light\" />;\n",
    );
    const opposite = check(await checkAppThemes(dir), 'theme-page-color');
    expect(opposite).toMatchObject({status: 'warn'});
    expect(opposite.message).toMatch(/root Theme is given mode="light"/);

    const recorded = await fixture([{slug: 'ocean', css}]);
    write(
      path.join(recorded.packageDir, 'dist/ocean.js'),
      'export const oceanTheme = {name: \'ocean\', tokens: {}};\nexport const colorModes = ["dark"];\n',
    );
    await themeAdd('ocean', {
      cwd: recorded.dir,
      import: true,
      package: '@acme/themes',
    });
    writeRoot(recorded.dir);
    expect(
      check(await checkAppThemes(recorded.dir), 'theme-page-color').fix,
    ).toMatch(/mode=\{themeModes\[defaultThemeSlug\]\}/);
  });

  it('stays silent when the root Theme mode is a value it cannot evaluate', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    for (const mode of [
      'mode={mode}',
      "mode={dark ? 'dark' : 'light'}",
      'mode={useMode()}',
      '{...props}',
    ]) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      write(
        path.join(dir, 'src/root.tsx'),
        `import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\nexport const Root = ({mode, dark, props, useMode}) => <Theme theme={themes[defaultThemeSlug]} ${mode}><main /></Theme>;\n`,
      );
      expect(
        (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
        mode,
      ).toBe(false);
    }
  });

  it('counts no AppShell a story or a test renders', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'src/Shell.stories.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const Story = () => <AppShell />;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('stays silent when the app sets its own page color scheme', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    for (const [file, text] of [
      ['src/global.css', ':root { color-scheme: dark; }\n'],
      ['src/global.css', 'html { color-scheme: only dark; }\n'],
      [
        'src/app/layout.tsx',
        "export default function Layout({children}) { return <html style={{colorScheme: 'dark'}}><body>{children}</body></html>; }\n",
      ],
    ]) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir);
      write(path.join(dir, file), text);
      expect(
        (await checkAppThemes(dir)).find(c => c.id === 'theme-page-color'),
        text,
      ).toBeUndefined();
    }
  });

  it('reads a bare package import through a wildcard export to its stylesheet', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'node_modules/kit/package.json'),
      '{"name": "kit", "version": "1.0.0", "exports": {"./*": {"style": "./css/*.css"}}}\n',
    );
    write(
      path.join(dir, 'node_modules/kit/css/base.css'),
      'body { background: var(--color-background-body); }\n',
    );
    write(path.join(dir, 'src/main.tsx'), "import 'kit/base';\n");
    expect(
      (await checkAppThemes(dir)).find(c => c.id === 'theme-page-color'),
    ).toBeUndefined();
  });

  it('counts no AppShell or reset that only Storybook or test setup loads', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, '.storybook/preview.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const decorators = [Story => <AppShell><Story /></AppShell>];\n",
    );
    write(
      path.join(dir, 'src/setupTests.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const Wrap = () => <AppShell />;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('reads a project inside a folder named stories as the project, by its own paths', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const root = fs.mkdtempSync(
      path.join(REPO_ROOT, '.astryx-doctor-stories-'),
    );
    dirs.push(root);
    const nested = path.join(root, 'stories');
    fs.mkdirSync(nested, {recursive: true});
    const {dir} = await fixture([{slug: 'ocean', css}], {root: nested});
    write(
      path.join(dir, 'src/App.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const App = () => <AppShell />;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'pass',
    });
  });

  it('reads a project partial a Sass file loads, and a page link to a walked file', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(path.join(dir, 'src/_vars.scss'), '$gap: 4px;\n');
    write(
      path.join(dir, 'src/app.scss'),
      "@use 'sass:math';\n@use 'vars';\n.card { gap: math.div(vars.$gap, 2); }\n",
    );
    write(path.join(dir, 'public/site.css'), '.card { color: red; }\n');
    write(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head></html>\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('reads a Less import option and a forward list as the module they name', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(path.join(dir, 'src/vars.less'), '@gap: 4px;\n');
    write(path.join(dir, 'src/app.less'), "@import (reference) 'vars.less';\n");
    write(path.join(dir, 'src/_tokens.scss'), '$a: 1;\n$b: 2;\n');
    write(path.join(dir, 'src/index.scss'), "@forward 'tokens' hide a, $b;\n");
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('stays silent on a package whose entry is a stylesheet', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'node_modules/@picocss/pico/package.json'),
      '{"name": "@picocss/pico", "main": "css/pico.css"}\n',
    );
    write(
      path.join(dir, 'node_modules/@picocss/pico/css/pico.css'),
      'body { background: navy; }\n',
    );
    write(
      path.join(dir, 'src/kit.ts'),
      "import '@picocss/pico';\nexport {};\n",
    );
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('stays silent on a CSS-only package whose stylesheet only the import condition names', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'node_modules/css-only-kit/package.json'),
      '{"name": "css-only-kit", "exports": {".": {"import": "./kit.css"}}}\n',
    );
    write(
      path.join(dir, 'node_modules/css-only-kit/kit.css'),
      'body { background: navy; }\n',
    );
    write(path.join(dir, 'src/kit.ts'), "import 'css-only-kit';\nexport {};\n");
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('counts an attribute selector that reaches <html> with the page color as painting it', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'src/global.css'),
      '[data-astryx-theme] { background: var(--color-background-body); }\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'pass',
    });
  });

  it('counts no page-color rule for another element, or an id inside an attribute value, as painting', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    for (const rule of [
      'button:not([disabled])',
      'a:not([href])',
      'input:is([type="text"])',
      '.sidebar [aria-current]',
      'a[href="#top"]',
    ]) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir);
      write(
        path.join(dir, 'src/global.css'),
        `${rule} { background: var(--color-background-body); }\n`,
      );
      expect(
        check(await checkAppThemes(dir), 'theme-page-color').status,
        rule,
      ).toBe('warn');
    }
    // (A vendor-prefixed at-rule CSS defines writes nothing doctor misses.)
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'src/global.css'),
      '@-moz-keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color').status).toBe(
      'warn',
    );
  });

  it('judges a rule by its subject compound, nesting resolved', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const PAGE = 'background: var(--color-background-body);';
    /** @type {Array<[string, 'pass' | 'warn' | 'silent']>} */
    const table = [
      // (Another element, under a page, root or mount ancestor.)
      [`body .card { ${PAGE} }`, 'warn'],
      [`:root .card { ${PAGE} }`, 'warn'],
      [`#app .card { ${PAGE} }`, 'warn'],
      [`[data-astryx-theme] .card { ${PAGE} }`, 'warn'],
      [`body { .card { ${PAGE} } }`, 'warn'],
      [`body { & .card { ${PAGE} } }`, 'warn'],
      [`input:is([type="text"]) { ${PAGE} }`, 'warn'],
      [`.list > [data-x] { ${PAGE} }`, 'warn'],
      // (The page itself.)
      [`html body { ${PAGE} }`, 'pass'],
      [`:root { ${PAGE} }`, 'pass'],
      [`html, body { ${PAGE} }`, 'pass'],
      [`:where(body) { ${PAGE} }`, 'pass'],
      [`[data-astryx-theme="ocean"] { ${PAGE} }`, 'pass'],
      [`html { & { ${PAGE} } }`, 'pass'],
      // (The page, narrowed or conditioned, or what may be it.)
      [`body.dark { ${PAGE} }`, 'silent'],
      [`body:not(.embed) { ${PAGE} }`, 'silent'],
      [`body::before { ${PAGE} }`, 'silent'],
      [`:is(body, .x) { ${PAGE} }`, 'pass'],
      [`body, .card { ${PAGE} }`, 'pass'],
      [`@scope (body) { :scope { ${PAGE} } }`, 'pass'],
      // (The page under a narrowing ancestor, scope root, another theme or
      // an at-rule wrapper: may paint.)
      [`html.dark body { ${PAGE} }`, 'silent'],
      [`[data-theme="dark"] body { ${PAGE} }`, 'silent'],
      [`@scope (body.dark) { :scope { ${PAGE} } }`, 'silent'],
      [`@scope (#root) { :scope { ${PAGE} } }`, 'silent'],
      [`[data-astryx-theme="another"] { ${PAGE} }`, 'silent'],
      [`@starting-style { body { ${PAGE} } }`, 'silent'],
      [`body:hover { ${PAGE} }`, 'silent'],
      // (A full-viewport layer: a mount node or the page's direct child.)
      [`body > #root { ${PAGE} }`, 'silent'],
      [`html #root { ${PAGE} }`, 'silent'],
      // (An id, an attribute or a tag the census shows on none of the
      // page's elements proves the rule is no page.)
      [`html #app { ${PAGE} }`, 'warn'],
      [`aside { ${PAGE} }`, 'warn'],
      [`.card::before { ${PAGE} }`, 'warn'],
      [`@scope (.card) { div { ${PAGE} } }`, 'warn'],
      [`body > * { ${PAGE} }`, 'silent'],
      ['body > div { background: navy; }', 'silent'],
      // (A state alone paints no page; the page token by its exact name.)
      [`::selection { ${PAGE} }`, 'warn'],
      [`::-webkit-scrollbar { ${PAGE} }`, 'warn'],
      [`::backdrop { ${PAGE} }`, 'warn'],
      [`:focus-visible { ${PAGE} }`, 'silent'],
      ['body { background: var(--color-background-body-alt); }', 'silent'],
      // (A list is judged part by part: the page beside a may-paint part.)
      ['body, #root { background: navy; }', 'silent'],
      [':is(body, #root) { background: navy; }', 'silent'],
      ['html, body > div { background: navy; }', 'silent'],
      // (A universal, an attribute or a pseudo-only compound with only the
      // page before it may be <body> itself.)
      [`html * { ${PAGE} }`, 'silent'],
      [`:root * { ${PAGE} }`, 'silent'],
      [`body * { ${PAGE} }`, 'silent'],
      [`html [data-root] { ${PAGE} }`, 'warn'],
      // (Nothing in the subject proves it is not the page or its child.)
      [`[data-theme="dark"] > * { ${PAGE} }`, 'silent'],
      [`* > div { ${PAGE} }`, 'silent'],
      [`:not(.embed) > * { ${PAGE} }`, 'silent'],
      [`html > * > div { ${PAGE} }`, 'silent'],
      [`@scope (body) { > div { ${PAGE} } }`, 'silent'],
      [`@scope (body) { div { ${PAGE} } }`, 'silent'],
      [`body div { ${PAGE} }`, 'silent'],
      [`.card div { ${PAGE} }`, 'silent'],
      [`head ~ * { ${PAGE} }`, 'silent'],
      [`main { min-height: 100vh; ${PAGE} }`, 'silent'],
      [`.list > * { ${PAGE} }`, 'silent'],
      // (CSS Modules' :global() is its selector; a pseudo-only compound
      // that is no state may paint.)
      // (In a plain stylesheet :global() is a pseudo-class the browser
      // drops: may paint, never a pass; a .module.css reads it.)
      [`:global(body) { ${PAGE} }`, 'silent'],
      // (The page's direct child under a narrowed or wrapped page.)
      [`:where(body) > * { ${PAGE} }`, 'silent'],
      [`:is(body) > * { ${PAGE} }`, 'silent'],
      [`:where(body) > div { ${PAGE} }`, 'silent'],
      [`html.dark body > * { ${PAGE} }`, 'silent'],
      [`[data-theme="dark"] body > * { ${PAGE} }`, 'silent'],
      [`body.dark > * { ${PAGE} }`, 'silent'],
      [`body:not(.embed) > * { ${PAGE} }`, 'silent'],
      [`body.dark > div { ${PAGE} }`, 'silent'],
      [`body:not(.embed) > div { ${PAGE} }`, 'silent'],
      [`:dir(ltr) { ${PAGE} }`, 'silent'],
      [`:lang(en) { ${PAGE} }`, 'silent'],
      [`::before { ${PAGE} }`, 'silent'],
      [`:hover { ${PAGE} }`, 'silent'],
      [`#root { ${PAGE} }`, 'silent'],
      [`[data-mode] { ${PAGE} }`, 'warn'],
      [`body { @media print { ${PAGE} } }`, 'silent'],
      [`@-moz-document url-prefix() { body { ${PAGE} } }`, 'silent'],
      ['html body { background: navy; }', 'warn'],
    ];
    for (const [rule, want] of table) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir);
      write(path.join(dir, 'src/global.css'), `${rule}\n`);
      const got = (await checkAppThemes(dir)).find(
        c => c.id === 'theme-page-color',
      );
      expect(got ? got.status : 'silent', rule).toBe(want);
    }
  }, 120_000);

  it('reads the census from the page shell and the root, and proves nothing where it cannot read', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const PAGE = 'background: var(--color-background-body);';
    /** @type {Array<[string, string | null, string, 'warn' | 'silent']>} */
    const table = [
      // (A mount node the shell shows: its attribute and class are on it.)
      [
        '<div id="app" data-root class="shell"></div>',
        '<main />',
        `[data-root] { ${PAGE} }`,
        'silent',
      ],
      ['<div id="app"></div>', '<main />', `.shell { ${PAGE} }`, 'warn'],
      [
        '<div id="app" class="shell"></div>',
        '<main />',
        `.shell { ${PAGE} }`,
        'silent',
      ],
      // (The root element's own class and its direct child's tag.)
      [
        '<div id="root"></div>',
        '<main data-page><aside /></main>',
        `[data-page] { ${PAGE} }`,
        'silent',
      ],
      [
        '<div id="root"></div>',
        '<main data-page><aside /></main>',
        `aside { ${PAGE} }`,
        'silent',
      ],
      [
        '<div id="root"></div>',
        '<main data-page><aside /></main>',
        `section { ${PAGE} }`,
        'warn',
      ],
      // (Everything inside the root element: a deeper host element is on
      // the page, and a deeper component opens the census.)
      [
        '<div id="root"></div>',
        '<main><div><div className="backdrop" /></div></main>',
        `.backdrop { position: fixed; inset: 0; ${PAGE} }`,
        'silent',
      ],
      [
        '<div id="root"></div>',
        '<main><div className="content"><Nav /></div></main>',
        `.page { min-height: 100vh; ${PAGE} }`,
        'silent',
      ],
      // (Core's Theme renders a div of its own inside the mount node.)
      [
        '<main id="root"></main>',
        '<section />',
        `#root > div { min-height: 100vh; ${PAGE} }`,
        'silent',
      ],
      // (A custom element in the page shell renders content of its own.)
      [
        '<app-root id="root"></app-root>',
        '<main />',
        `.card { ${PAGE} }`,
        'silent',
      ],
      // (No page shell: the mount node is unknown, nothing proves.)
      [null, '<main />', `.card { ${PAGE} }`, 'silent'],
      // (A component child: the census cannot name what it renders.)
      [
        '<div id="root"></div>',
        '<main><Nav /></main>',
        `.card { ${PAGE} }`,
        'silent',
      ],
    ];
    for (const [mount, root, rule, want] of table) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir, root);
      if (mount == null) fs.rmSync(path.join(dir, 'index.html'));
      else
        write(
          path.join(dir, 'index.html'),
          `<!doctype html><html><head></head><body>${mount}</body></html>\n`,
        );
      if (root.includes('<Nav'))
        write(
          path.join(dir, 'src/root.tsx'),
          fs
            .readFileSync(path.join(dir, 'src/root.tsx'), 'utf8')
            .replace(
              'export const Root',
              'const Nav = () => <nav />;\nexport const Root',
            ),
        );
      write(path.join(dir, 'src/global.css'), `${rule}\n`);
      const got = (await checkAppThemes(dir)).find(
        c => c.id === 'theme-page-color',
      );
      expect(got ? got.status : 'silent', `${mount} | ${root} | ${rule}`).toBe(
        want,
      );
    }
  }, 120_000);

  it('counts the elements around the root Theme and around the app in a render call', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const PAGE = 'background: var(--color-background-body);';
    const THEME =
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\n";
    const ROOT = `${THEME}export const Root = () => <Theme theme={themes[defaultThemeSlug]}><main /></Theme>;\n`;
    const ENTRY =
      "import {StrictMode} from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {Root} from './root';\n";
    /** @type {Array<[Record<string, string>, string, 'pass' | 'warn' | 'silent']>} */
    const table = [
      // (A host element around the root Theme, in the root module.)
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <div className="app"><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>;\n`,
        },
        `.app { min-height: 100vh; ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <div className="app"><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>;\n`,
        },
        `.card { ${PAGE} }`,
        'warn',
      ],
      // (A host element around the app in the entry's render call; React's
      // StrictMode around it renders nothing.)
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}createRoot(document.getElementById('root')).render(<StrictMode><div id="shell"><Root /></div></StrictMode>);\n`,
        },
        `#shell { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}createRoot(document.getElementById('root')).render(<StrictMode><div id="shell"><Root /></div></StrictMode>);\n`,
        },
        `.card { ${PAGE} }`,
        'warn',
      ],
      // (An app held in a variable: the render call is not read.)
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}const app = <div id="shell"><Root /></div>;\ncreateRoot(document.getElementById('root')).render(app);\n`,
        },
        `#shell { ${PAGE} }`,
        'silent',
      ],
      // (A component of the app around the root Theme, local or through a
      // path alias, may render any element: nothing proves.)
      [
        {
          'src/root.tsx': `${THEME}const Shell = ({children}) => <div className="app">{children}</div>;\nexport const Root = () => <Shell><Theme theme={themes[defaultThemeSlug]}><main /></Theme></Shell>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `import {Shell} from '@/components/Shell';\n${THEME}export const Root = () => <Shell><Theme theme={themes[defaultThemeSlug]}><main /></Theme></Shell>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      // (A second root that never reaches the root Theme, a custom element
      // around it, and a mount node styled at run time: doctor does not read
      // them, so nothing proves.)
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}createRoot(document.getElementById('root')).render(<Root />);\ncreateRoot(document.getElementById('backdrop')).render(<div className="backdrop" />);\n`,
        },
        `.backdrop { position: fixed; inset: 0; ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <app-frame><Theme theme={themes[defaultThemeSlug]}><main /></Theme></app-frame>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}const el = document.getElementById('root');\nel.classList.add('app');\ncreateRoot(el).render(<Root />);\n`,
        },
        `.app { min-height: 100vh; ${PAGE} }`,
        'silent',
      ],
      // (Another component of the root Theme's module, around it or as a
      // backdrop root, renders elements doctor does not follow.)
      [
        {
          'src/root.tsx': `${THEME}const Frame = ({children}) => <div className="frame">{children}</div>;\nconst ThemedApp = () => <Theme theme={themes[defaultThemeSlug]}><main /></Theme>;\nexport const Root = () => <Frame><ThemedApp /></Frame>;\nexport const Backdrop = () => <div className="backdrop" />;\n`,
          'src/main.tsx': `${ENTRY}createRoot(document.getElementById('root')).render(<Root />);\n`,
        },
        `.frame { min-height: 100vh; ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <Theme theme={themes[defaultThemeSlug]}><main /></Theme>;\nexport const Backdrop = () => <div className="backdrop" />;\n`,
          'src/main.tsx': `${ENTRY.replace("import {Root} from './root';", "import {Root, Backdrop} from './root';")}createRoot(document.getElementById('root')).render(<Root />);\ncreateRoot(document.getElementById('backdrop')).render(<Backdrop />);\n`,
        },
        `.backdrop { position: fixed; inset: 0; ${PAGE} }`,
        'silent',
      ],
      // (A custom element in the page shell may paint the page on its own.)
      [
        {
          'src/root.tsx': ROOT,
          'index.html':
            '<!doctype html><html><head></head><body><app-root id="root"></app-root></body></html>\n',
        },
        '.card { color: red; }',
        'silent',
      ],
      // (React's own wrappers render nothing, but what they hold beside the
      // root Theme or the app renders.)
      [
        {
          'src/root.tsx': `import {Suspense} from 'react';\n${THEME}export const Root = () => <><Suspense><div className="backdrop" /></Suspense><Theme theme={themes[defaultThemeSlug]}><main /></Theme></>;\n`,
        },
        `.backdrop { position: fixed; inset: 0; ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `import {Fragment} from 'react';\nimport {Box} from 'ui-kit';\n${THEME}export const Root = () => <><Fragment><Box /></Fragment><Theme theme={themes[defaultThemeSlug]}><main /></Theme></>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY.replace('{StrictMode}', '{StrictMode, Suspense}')}createRoot(document.getElementById('root')).render(<Suspense><div className="backdrop" /><Root /></Suspense>);\n`,
        },
        `.backdrop { position: fixed; inset: 0; ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `import {Suspense} from 'react';\n${THEME}export const Root = () => <><Suspense fallback={<div className="backdrop" />}><span /></Suspense><Theme theme={themes[defaultThemeSlug]}><main /></Theme></>;\n`,
        },
        `.card { ${PAGE} }`,
        'warn',
      ],
      // (A package component may render and paint an element of its own.)
      [
        {
          'src/root.tsx': `import {Box} from 'ui-kit';\n${THEME}export const Root = () => <Box className="app"><Theme theme={themes[defaultThemeSlug]}><main /></Theme></Box>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      // (The root Theme and the element around it inside a prop.)
      [
        {
          'src/root.tsx': `import {Suspense} from 'react';\n${THEME}export const Root = () => <Suspense fallback={<div className="app"><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>} />;\n`,
        },
        `.app { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `import {Suspense} from 'react';\n${THEME}export const Root = () => <Suspense fallback={<div className="app"><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>} />;\n`,
        },
        `.card { ${PAGE} }`,
        'warn',
      ],
      // (An element around or beside the root Theme or the app is judged by
      // its own styling: an inline page color, StyleX or a class from an
      // expression may paint, and proves nothing.)
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <div style={{minHeight: '100vh', background: 'var(--color-background-body)'}}><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>;\n`,
        },
        '.card { color: red; }',
        'silent',
      ],
      [
        {
          'src/root.tsx': ROOT,
          'src/main.tsx': `${ENTRY}createRoot(document.getElementById('root')).render(<div style={{background: 'var(--color-background-body)'}}><Root /></div>);\n`,
        },
        '.card { color: red; }',
        'silent',
      ],
      [
        {
          'src/root.tsx': `import * as stylex from '@stylexjs/stylex';\n${THEME}const s = stylex.create({page: {minHeight: '100vh'}});\nexport const Root = () => <div {...stylex.props(s.page)}><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `${THEME}const page = 'page';\nexport const Root = () => <div className={page}><Theme theme={themes[defaultThemeSlug]}><main /></Theme></div>;\n`,
        },
        `.card { ${PAGE} }`,
        'silent',
      ],
      [
        {
          'src/root.tsx': `${THEME}export const Root = () => <><Theme theme={themes[defaultThemeSlug]}><main /></Theme><footer style={{background: 'var(--color-background-body)'}} /></>;\n`,
        },
        '.card { color: red; }',
        'silent',
      ],
    ];
    for (const [files, rule, want] of table) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir);
      for (const [file, text] of Object.entries(files))
        write(path.join(dir, file), text);
      write(path.join(dir, 'src/global.css'), `${rule}\n`);
      const got = (await checkAppThemes(dir)).find(
        c => c.id === 'theme-page-color',
      );
      expect(
        got ? got.status : 'silent',
        `${Object.values(files).join(' | ')} | ${rule}`,
      ).toBe(want);
    }
  }, 120_000);

  it('reads :global() in a CSS Modules file, and the theme attribute by the name the theme writes', async () => {
    const css =
      '[data-astryx-theme="deep-ocean"] { --color-background-body: #101314; }\n';
    const PAGE = 'background: var(--color-background-body);';
    /** @type {Array<[string, string, 'pass' | 'warn' | 'silent']>} */
    const table = [
      ['src/app.module.css', `:global(body) { ${PAGE} }`, 'pass'],
      ['src/app.module.css', `:global(html) { ${PAGE} }`, 'pass'],
      [
        'src/global.css',
        `[data-astryx-theme="deep-ocean"] { ${PAGE} }`,
        'pass',
      ],
      // (The slug is not the name the theme writes: another theme's.)
      ['src/global.css', `[data-astryx-theme="ocean"] { ${PAGE} }`, 'silent'],
    ];
    for (const [file, rule, want] of table) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir);
      write(path.join(dir, file), `${rule}\n`);
      const got = (await checkAppThemes(dir)).find(
        c => c.id === 'theme-page-color',
      );
      expect(got ? got.status : 'silent', `${file}: ${rule}`).toBe(want);
    }
  }, 120_000);

  it('reads the at-rules inside @font-feature-values and @page as CSS', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'src/global.css'),
      '@font-feature-values Font One { @styleset { nice-style: 12; } }\n@page { @top-center { content: "x"; } }\n',
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color').status).toBe(
      'warn',
    );
  });

  it('gives an app whose only reset import is in a story or a test no page check', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}], {reset: false});
    writeRoot(dir);
    write(
      path.join(dir, 'stories/preview.css'),
      "@import '@astryxdesign/core/reset.css';\n",
    );
    write(
      path.join(dir, 'src/App.test.tsx'),
      "import '@astryxdesign/core/reset.css';\n",
    );
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('counts no story or test, and no CSS import of a registered theme, as painting', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir, moduleFile} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    write(
      path.join(dir, 'src/Button.test.tsx'),
      "document.body.style.background = 'navy';\n",
    );
    write(
      path.join(dir, 'src/Intro.stories.tsx'),
      'export const S = () => <style>{`body { background: navy; }`}</style>;\n',
    );
    write(path.join(dir, 'stories/Intro.mdx'), '# Intro\n');
    const sheet = /import\s+['"]([^'"]+\.css)['"]/.exec(
      fs.readFileSync(moduleFile, 'utf8'),
    )?.[1];
    expect(sheet).toBeTruthy();
    write(path.join(dir, 'src/global.css'), `@import '${sheet}';\n`);
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('stays silent on a linked stylesheet the walk does not follow', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    const shared = fs.mkdtempSync(
      path.join(REPO_ROOT, '.astryx-doctor-shared-'),
    );
    dirs.push(shared);
    write(
      path.join(shared, 'global.css'),
      'body { background: var(--color-background-body); }\n',
    );
    fs.symlinkSync(
      path.join(shared, 'global.css'),
      path.join(dir, 'src/global.css'),
    );
    write(
      path.join(dir, 'src/styles.ts'),
      "import './global.css';\nexport {};\n",
    );
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('stays silent when the project is larger than the walk reads', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir);
    const many = path.join(dir, 'src/generated');
    fs.mkdirSync(many, {recursive: true});
    for (let i = 0; i < 5001; i++)
      fs.writeFileSync(path.join(many, `m${i}.ts`), 'export {};\n');
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  }, 120_000);

  it('reads a component by its own returns, never a helper declared inside it', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    writeRoot(dir, '<App />');
    write(
      path.join(dir, 'src/root.tsx'),
      fs
        .readFileSync(path.join(dir, 'src/root.tsx'), 'utf8')
        .replace(
          'export const Root',
          "function App() {\n  const Shell = () => <main style={{background: 'var(--color-background-body)'}} />;\n  return <main />;\n}\nexport const Root",
        ),
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('gives an app whose only reset link is commented out no page check', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}], {reset: false});
    writeRoot(dir);
    write(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head><!-- <link rel="stylesheet" href="/node_modules/@astryxdesign/core/dist/reset.css" /> --></head></html>\n',
    );
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('gives an embedded app, which loads no Core reset, no page check', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    const {dir} = await fixture([{slug: 'ocean', css}], {reset: false});
    expect(
      (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('warns when a local theme sets its own page color and nothing paints the page', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: light-dark(#f1f1f1, #1b1b1b); }\n';
    const {dir} = await fixture([{slug: 'ocean', css}]);
    await themeEject('ocean', {cwd: dir, package: '@acme/themes'});
    const sourceFile = path.join(dir, 'src/themes/ocean/oceanTheme.ts');
    await themeBuild(sourceFile, {}, {cwd: dir});
    const built = path.join(dir, 'src/themes/ocean/ocean.css');
    fs.appendFileSync(
      built,
      '[data-astryx-theme="ocean"] { --color-background-body: light-dark(#fdf6e3, #1c1a16); }\n',
    );
    await themeAdd('ocean', {cwd: dir, import: true});
    // (A built module that extends its base package, as the editor's
    // builds do.)
    const builtModule = path.join(dir, 'src/themes/ocean/ocean.js');
    fs.writeFileSync(
      builtModule,
      `import {oceanTheme as base} from '@acme/themes/themes/ocean';\n${fs.readFileSync(builtModule, 'utf8')}`,
    );
    writeRoot(dir);
    const own = check(await checkAppThemes(dir), 'theme-page-color');
    expect(own).toMatchObject({status: 'warn'});
    expect(own.message).toMatch(/sets its own page color/);
    expect(own.fix).toMatch(
      /^Wrap the page in AppShell; if you can't, add `body/,
    );
    // (The root Theme's own element, painted with the page color by its
    // style, in a component of another module, paints the page.)
    write(
      path.join(dir, 'src/main.tsx'),
      "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\nimport App from './App';\nexport const Root = () => <Theme theme={themes[defaultThemeSlug]} mode=\"light\"><App /></Theme>;\n",
    );
    write(
      path.join(dir, 'src/App.tsx'),
      "import {VStack} from '@astryxdesign/core/Layout';\nexport default function App() {\n  return (\n    <VStack style={{background: 'var(--color-background-body)'}}>\n      <VStack />\n    </VStack>\n  );\n}\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'pass',
    });
    fs.rmSync(path.join(dir, 'src/main.tsx'));
    fs.rmSync(path.join(dir, 'src/root.tsx'));
    write(
      path.join(dir, 'src/App.tsx'),
      "import {AppShell} from '@astryxdesign/core/AppShell';\nexport const App = () => <AppShell />;\n",
    );
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'pass',
    });
  });

  it('counts only a body background that uses the page color', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n',
      },
    ]);
    writeRoot(dir);
    write(path.join(dir, 'src/global.css'), 'body { background: white; }\n');
    expect(check(await checkAppThemes(dir), 'theme-page-color')).toMatchObject({
      status: 'warn',
    });
  });

  it('stays silent when it cannot read what paints the page', async () => {
    const css =
      '[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n';
    for (const inner of [
      '<main xstyle={styles.page} />',
      '<main className="page" />',
      '<main {...props} />',
      '<Router />',
      '{children}',
    ]) {
      const {dir} = await fixture([{slug: 'ocean', css}]);
      writeRoot(dir, inner);
      expect(
        (await checkAppThemes(dir)).some(c => c.id === 'theme-page-color'),
        inner,
      ).toBe(false);
    }
    // (Nor with no root Theme to read, or a body rule it cannot evaluate.)
    const noRoot = await fixture([{slug: 'ocean', css}]);
    expect(
      (await checkAppThemes(noRoot.dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
    // (Nor when the page may be styled where doctor does not read: a
    // preprocessor stylesheet, a page's own <style> or body style, a
    // CSS-in-JS global, an @apply rule.)
    for (const [file, text] of [
      ['src/global.scss', 'body { background: $page; }\n'],
      [
        'index.html',
        '<!doctype html><html><head><style>body { background: navy; }</style></head></html>\n',
      ],
      [
        'index.html',
        '<!doctype html><html><body style="background: navy"></body></html>\n',
      ],
      [
        'src/GlobalStyle.tsx',
        "import {createGlobalStyle} from 'styled-components';\nexport const G = createGlobalStyle`body { background: navy; }`;\n",
      ],
      ['src/global.css', 'body { @apply bg-slate-50; }\n'],
      ['src/global.css', 'body:not(.embed) { background: navy; }\n'],
      ['src/global.css', "@import 'some-kit/dist/base.css';\n"],
      ['src/kit.ts', "import 'some-kit/dist/base.css';\nexport {};\n"],
      [
        'app/layout.tsx',
        'export default function RootLayout({children}) {\n  return <html><body className="page">{children}</body></html>;\n}\n',
      ],
      [
        'app/root.tsx',
        "import kit from 'some-kit/dist/base.css?url';\nexport const links = () => [{rel: 'stylesheet', href: kit}];\n",
      ],
      [
        'app/head.tsx',
        'export const Head = () => <link rel="stylesheet" href="https://cdn.example.com/kit.css" />;\n',
      ],
      [
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example.com/kit.css"></head></html>\n',
      ],
      [
        'index.html',
        '<!doctype html><html><head><link rel=stylesheet href=https://cdn.example.com/kit.css></head></html>\n',
      ],
      [
        'app/head.tsx',
        'const KIT = process.env.KIT;\nexport const Head = () => <link rel="stylesheet" href={KIT} />;\n',
      ],
      [
        'app/head.tsx',
        'const CDN = process.env.CDN;\nexport const Head = () => <link rel="stylesheet" href={`${CDN}/kit.css`} />;\n',
      ],
      [
        'app/root.tsx',
        "export const links = () => [{rel: 'stylesheet', href: 'https://cdn.example.com/kit.css'}];\n",
      ],
      // (A stylesheet out of the project folder, which the sweep never reads.)
      ['src/shared.ts', "import '../../shared/global.css';\nexport {};\n"],
      ['src/global.css', "@import '../../shared/global.css';\n"],
      [
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="../shared/global.css"></head></html>\n',
      ],
      // (Or one inside it the walk never lists: under node_modules or a
      // build output.)
      ['src/global.css', "@import '../node_modules/some-kit/dist/base.css';\n"],
      ['src/shared.ts', "import '../styles/build/global.css';\nexport {};\n"],
      // (A root-absolute, bare or protocol-relative path the walk never
      // lists.)
      [
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="/dist/site.css"></head></html>\n',
      ],
      [
        'index.html',
        '<!doctype html><html><head><link rel="stylesheet" href="dist/site.css"></head></html>\n',
      ],
      ['src/global.css', "@import '/node_modules/some-kit/dist/base.css';\n"],
      ['src/global.css', "@import '//cdn.example.com/kit.css';\n"],
      // (A preprocessor stylesheet that loads a package.)
      ['src/app.scss', "@use 'some-kit/base';\n.card { color: red; }\n"],
      ['src/app.scss', "@import 'bootstrap/scss/bootstrap';\n"],
      ['src/app.scss', "@import 'vars', 'bootstrap/scss/bootstrap';\n"],
      ['src/app.sass', '@import bootstrap/scss/bootstrap\n'],
      ['src/app.styl', '@import nib\n'],
      ['src/app.scss', '@import url(https://cdn.example.com/kit.css);\n'],
      [
        'src/app.scss',
        "@use 'sass:meta';\n.app { @include meta.load-css('some-kit/base'); }\n",
      ],
      ['src/kit.ts', "import 'some-kit/dist/base.pcss';\nexport {};\n"],
      ['src/kit.ts', "import 'some-kit/dist/base.postcss';\nexport {};\n"],
      ['src/app.sss', 'body\n  background: var(--color-background-body)\n'],
      ['src/kit.ts', "import 'some-kit/base.stylus';\nexport {};\n"],
      ['src/kit.ts', "import 'some-kit/base.sss';\nexport {};\n"],
      // (A sheet added at run time, a preloaded style, a bundler or
      // workspace config's stylesheet, a component language doctor does
      // not parse, a CSS generator's base layer.)
      [
        'src/sheet.ts',
        "const s = new CSSStyleSheet();\ns.replaceSync('body { background: navy; }');\ndocument.adoptedStyleSheets = [s];\n",
      ],
      [
        'src/inject.ts',
        "const l = document.createElement('link');\nl.rel = 'stylesheet';\nl.href = 'https://cdn.example.com/kit.css';\ndocument.head.append(l);\n",
      ],
      [
        'index.html',
        '<!doctype html><html><head><link rel="preload" as="style" href="https://cdn.example.com/kit.css" onload="this.rel=\'stylesheet\'"></head></html>\n',
      ],
      [
        'vite.config.ts',
        "export default {build: {rollupOptions: {input: ['index.html', 'node_modules/kit/base.css']}}};\n",
      ],
      [
        'angular.json',
        '{"projects": {"app": {"architect": {"build": {"options": {"styles": ["node_modules/bootstrap/dist/css/bootstrap.css"]}}}}}}\n',
      ],
      [
        'src/App.vue',
        '<template><div /></template>\n<style>body { background: navy; }</style>\n',
      ],
      ['src/global.css', '@tailwind base;\n'],
      [
        'tailwind.config.js',
        "module.exports = {plugins: [({addBase}) => addBase({body: {background: 'navy'}})]};\n",
      ],
      // (A module doctor cannot parse, a template naming a sheet, a page
      // template, an inline script styling the document, a selector that
      // can match <html>, MUI's global styles.)
      [
        'src/legacy.ts',
        "const el = <HTMLElement>document.getElementById('app');\nexport {el};\n",
      ],
      [
        'src/kit.ts',
        "const kit = 'some-kit';\nexport const load = () => import(`${kit}/base.css`);\n",
      ],
      [
        'index.ejs',
        '<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example.com/kit.css"></head></html>\n',
      ],
      [
        'index.html',
        "<!doctype html><html><body><script>document.documentElement.classList.add('dark');</script></body></html>\n",
      ],
      [
        'index.html',
        "<!doctype html><html><body><script>document.querySelector('body').style.background = 'navy';</script></body></html>\n",
      ],
      ['src/global.css', '* { background: navy; }\n'],
      [
        'src/global.css',
        '@media (prefers-color-scheme: dark) { body { background: var(--color-background-body); } }\n',
      ],
      [
        'src/global.css',
        '@media print { body { background: var(--color-background-body); } }\n',
      ],
      [
        'src/global.css',
        '@scope (body) { :scope { background: var(--brand); } }\n',
      ],
      [
        'src/App.tsx',
        "import GlobalStyles from '@mui/material/GlobalStyles';\nexport const G = () => <GlobalStyles styles={{body: {background: 'navy'}}} />;\n",
      ],
    ]) {
      const f = await fixture([{slug: 'ocean', css}]);
      writeRoot(f.dir);
      write(path.join(f.dir, file), text);
      expect(
        (await checkAppThemes(f.dir)).some(c => c.id === 'theme-page-color'),
        file,
      ).toBe(false);
    }
    const unread = await fixture([{slug: 'ocean', css}]);
    writeRoot(unread.dir);
    write(
      path.join(unread.dir, 'src/global.css'),
      'body { background: var(--app-page); }\n',
    );
    expect(
      (await checkAppThemes(unread.dir)).some(c => c.id === 'theme-page-color'),
    ).toBe(false);
  });

  it('reads the page color a theme stylesheet gives last, comments ignored', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        css: '/* --color-background-body: #101314; */\n[data-astryx-theme="ocean"] { --color-background-body: #101314; }\n[data-astryx-theme="ocean"] { --color-background-body: light-dark(#f1f4f7, oklch(0.2 0.02 250)); }\n',
      },
    ]);
    const checks = await checkAppThemes(dir);
    expect(checks.some(item => item.id === 'theme-page-color')).toBe(false);
  });

  it('adds no page check for a theme with a light and a dark page', async () => {
    const {dir} = await fixture([
      {
        slug: 'ocean',
        css: '[data-astryx-theme="ocean"] { --color-background-body: light-dark(#f1f4f7, #111112); }\n',
      },
    ]);
    const checks = await checkAppThemes(dir);
    expect(checks.some(item => item.id === 'theme-page-color')).toBe(false);
  });

  it('reports one information check when the CLI manages no themes', async () => {
    const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-doctor-empty-'));
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
      path.join(REPO_ROOT, '.astryx-doctor-monorepo-'),
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
      path.join(REPO_ROOT, '.astryx-doctor-unmigrated-'),
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

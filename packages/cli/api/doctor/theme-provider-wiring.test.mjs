// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An integration that wires its themes with its own provider component
 * (its manifest's `themeProvider`): doctor counts the theme as wired only when
 * the app renders that component, and `theme list` names it.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {checkThemes, themeImportWiring} from './theme-checks.mjs';
import {runChecks} from './doctor.mjs';
import {themeListAvailable} from '../theme/list/list.mjs';
import {themeAdd} from '../theme/add/add.mjs';
import {themeRemove} from '../theme/remove/remove.mjs';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

/** @type {string[]} */
const dirs = [];
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/** @param {string} file @param {string} content */
function write(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

const PROVIDER = {export: 'AcmeThemeProvider', from: '@acme/ui/theme'};

/**
 * An app that depends on `@acme/ui`, an integration whose themes its own
 * provider wires, and on `@astryxdesign/theme-neutral`.
 * @param {string[]} slugs the integration's themes
 * @param {Record<string, string>} [extraExports] more exports of the package
 */
function app(slugs = ['brand'], extraExports = {}) {
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-theme-provider-'));
  dirs.push(dir);
  write(path.join(dir, 'tsconfig.json'), '{}\n');
  write(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'provider-app',
      private: true,
      dependencies: {
        '@acme/ui': '1.0.0',
        '@astryxdesign/core': CLI_VERSION,
        '@astryxdesign/theme-neutral': CLI_VERSION,
      },
    }),
  );
  write(
    path.join(dir, 'node_modules/@astryxdesign/core/package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
  );
  write(
    path.join(dir, 'node_modules/@astryxdesign/theme-neutral/package.json'),
    JSON.stringify({
      name: '@astryxdesign/theme-neutral',
      version: CLI_VERSION,
    }),
  );
  const packageDir = path.join(dir, 'node_modules/@acme/ui');
  /** @type {Record<string, string>} */
  const exportsMap = {'./theme': './dist/theme.js', ...extraExports};
  for (const slug of slugs) {
    exportsMap[`./themes/${slug}`] = `./dist/${slug}.js`;
    exportsMap[`./themes/${slug}.css`] = `./dist/${slug}.css`;
  }
  write(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/ui',
      version: '1.0.0',
      type: 'module',
      exports: exportsMap,
    }),
  );
  write(
    path.join(packageDir, 'astryx.integration.mjs'),
    `export default {themes: './themes', themeProvider: ${JSON.stringify(PROVIDER)}};\n`,
  );
  write(
    path.join(packageDir, 'dist/theme.js'),
    'export function AcmeThemeProvider({children}) { return children; }\n',
  );
  for (const slug of slugs) {
    const stem = `${slug}Theme`;
    write(
      path.join(packageDir, 'themes', slug, `${stem}.doc.mjs`),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: true};\n`,
    );
    write(
      path.join(packageDir, 'themes', slug, `${stem}.ts`),
      `export const ${stem} = {name: '${slug}', tokens: {}};\n`,
    );
    write(
      path.join(packageDir, `dist/${slug}.js`),
      `export const ${stem} = {name: '${slug}', tokens: {}};\n`,
    );
    write(
      path.join(packageDir, `dist/${slug}.css`),
      `[data-astryx-theme="${slug}"] { --color-text: black; }\n`,
    );
  }
  return dir;
}

/** @param {string} dir */
async function themesCheck(dir) {
  return checkThemes(dir, [], await themeImportWiring(dir));
}

const RENDERS = [
  "import {AcmeThemeProvider} from '@acme/ui/theme';",
  'export default function Layout({children}) {',
  '  return <AcmeThemeProvider>{children}</AcmeThemeProvider>;',
  '}',
  '',
].join('\n');

describe('a theme its integration wires with its own provider', () => {
  it('is wired when the app renders the provider, and doctor says so', async () => {
    const dir = app();
    write(path.join(dir, 'app/layout.tsx'), RENDERS);

    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'brand',
        owner: '@acme/ui',
        file: 'app/layout.tsx',
        wiredBy: 'AcmeThemeProvider from @acme/ui/theme',
      },
    ]);
    expect(await themesCheck(dir)).toMatchObject({
      status: 'pass',
      message: expect.stringContaining(
        'wired by import: brand (wired by AcmeThemeProvider from @acme/ui/theme in app/layout.tsx)',
      ),
    });
    const report = await runChecks({cwd: dir});
    expect(report.checks.find(item => item.id === 'themes')).toMatchObject({
      status: 'pass',
    });
    const management = report.checks.find(
      item => item.id === 'theme-management',
    );
    expect(management?.message).toBe(
      'The CLI manages no themes: brand is wired by AcmeThemeProvider from @acme/ui/theme in app/layout.tsx, the provider its package wires its themes with.',
    );
    expect(management?.fix).toBeUndefined();
  });

  it('is not wired when the app only imports the provider, or does not use it', async () => {
    const dir = app();
    write(
      path.join(dir, 'app/layout.tsx'),
      "import {AcmeThemeProvider} from '@acme/ui/theme';\nexport const provider = AcmeThemeProvider;\nexport default function Layout({children}) { return children; }\n",
    );
    expect((await themeImportWiring(dir)).wired).toEqual([]);
    expect(await themesCheck(dir)).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('but no theme appears wired'),
    });

    // A component of the same name from another module is not the provider.
    write(
      path.join(dir, 'app/layout.tsx'),
      RENDERS.replace("'@acme/ui/theme'", "'./AcmeThemeProvider'"),
    );
    expect((await themeImportWiring(dir)).wired).toEqual([]);
  });

  it('wires the theme whose stylesheet the app imports when the integration has several', async () => {
    const dir = app(['brand', 'night']);
    write(
      path.join(dir, 'app/layout.tsx'),
      `import '@acme/ui/themes/night.css';\n${RENDERS}`,
    );
    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'night',
        owner: '@acme/ui',
        file: 'app/layout.tsx',
        wiredBy: 'AcmeThemeProvider from @acme/ui/theme',
      },
    ]);

    // With no stylesheet to tell them apart, which theme it wires is not known.
    write(path.join(dir, 'app/layout.tsx'), RENDERS);
    expect(await themeImportWiring(dir)).toEqual({
      wired: [],
      unconfirmed: [
        {
          file: 'app/layout.tsx',
          wiredBy: 'AcmeThemeProvider from @acme/ui/theme',
          themes: ['brand', 'night'],
          stylesheets: [],
        },
      ],
    });
    expect(await themesCheck(dir)).toMatchObject({
      status: 'info',
      message:
        'app/layout.tsx renders AcmeThemeProvider from @acme/ui/theme, which wires one of brand, night; doctor could not tell which, because the app imports none of their stylesheets.',
    });
  });

  it('counts a stylesheet of the package at another path as the theme it is', async () => {
    // The package keeps the night stylesheet at a path of its own too.
    const dir = app(['brand', 'night'], {
      './Theme/Night/nightTheme.css': './dist/night.css',
      './xds.css': './dist/xds.css',
    });
    write(path.join(dir, 'node_modules/@acme/ui/dist/xds.css'), 'x {}\n');
    write(
      path.join(dir, 'app/layout.tsx'),
      `import '@acme/ui/Theme/Night/nightTheme.css';\n${RENDERS}`,
    );
    expect((await themeImportWiring(dir)).wired).toEqual([
      {
        slug: 'night',
        owner: '@acme/ui',
        file: 'app/layout.tsx',
        wiredBy: 'AcmeThemeProvider from @acme/ui/theme',
      },
    ]);

    // A stylesheet of the package that is no theme's: named, never missing.
    write(
      path.join(dir, 'app/layout.tsx'),
      `import '@acme/ui/xds.css';\n${RENDERS}`,
    );
    const check = await themesCheck(dir);
    expect(check).toMatchObject({status: 'info'});
    expect(check.message).toBe(
      'app/layout.tsx renders AcmeThemeProvider from @acme/ui/theme, which wires one of brand, night, and the app imports @acme/ui/xds.css from that package; doctor could not tell which of those themes it is.',
    );
    expect(check.message).not.toContain('imports none');
  });

  it('names the theme a stylesheet of the package belongs to: in its folder, or imported by its stylesheet', async () => {
    const dir = app(['brand', 'night'], {
      './themes/night/night.extra.css': './themes/night/night.extra.css',
      './base.css': './dist/base.css',
    });
    const pkg = path.join(dir, 'node_modules/@acme/ui');
    // A stylesheet in night's own folder.
    write(path.join(pkg, 'themes/night/night.extra.css'), 'x {}\n');
    write(
      path.join(dir, 'app/layout.tsx'),
      `import '@acme/ui/themes/night/night.extra.css';\n${RENDERS}`,
    );
    expect((await themeImportWiring(dir)).wired).toMatchObject([
      {slug: 'night', wiredBy: 'AcmeThemeProvider from @acme/ui/theme'},
    ]);

    // A stylesheet only brand's stylesheet imports.
    write(path.join(pkg, 'dist/base.css'), 'y {}\n');
    write(
      path.join(pkg, 'dist/brand.css'),
      '@import \'./base.css\';\n[data-astryx-theme="brand"] {}\n',
    );
    write(
      path.join(dir, 'app/layout.tsx'),
      `import '@acme/ui/base.css';\n${RENDERS}`,
    );
    expect((await themeImportWiring(dir)).wired).toMatchObject([
      {slug: 'brand', wiredBy: 'AcmeThemeProvider from @acme/ui/theme'},
    ]);
  });

  it('theme list names the provider beside each of its themes', async () => {
    const dir = app();
    const {data} = await themeListAvailable({cwd: dir, package: '@acme/ui'});
    expect(data).toEqual([
      expect.objectContaining({
        slug: 'brand',
        package: '@acme/ui',
        wiredBy: PROVIDER,
      }),
    ]);
    // The JSON keeps added and default as they are, and so does the text.
    expect(data[0]).toMatchObject({added: false, default: false});
    const text = (await runCli(['theme', 'list', '--package', '@acme/ui'], dir))
      .stdout;
    expect(text).toMatch(/added:\s+no/);
    // The list reads no app source: the line says when the provider applies
    // and that doctor checks where, even when the app renders it.
    write(path.join(dir, 'app/layout.tsx'), RENDERS);
    const shown = (
      await runCli(['theme', 'list', '--package', '@acme/ui'], dir)
    ).stdout;
    expect(shown).toMatch(
      /wiredBy:\s+wired by AcmeThemeProvider from @acme\/ui\/theme when the app renders it; `.* doctor` checks where/,
    );
    expect(shown).not.toContain('rendered in');
    expect(shown).toMatch(/added:\s+no/);
    const json = await themeListAvailable({cwd: dir, package: '@acme/ui'});
    expect(json.data[0]).not.toHaveProperty('renderedIn');
    expect(json.meta?.appTheme).toBeUndefined();
  });
});

describe('theme add with an installed package that names its provider', () => {
  it('says how its Theme and the provider nest, without reading the app', async () => {
    const dir = app();
    const text = (
      await runCli(['theme', 'add', 'brand', '--package', '@acme/ui'], dir)
    ).stdout;
    expect(text).toMatch(
      /This app may already get its theme from AcmeThemeProvider \(from @acme\/ui\/theme, declared by @acme\/ui\)\. Replacing AcmeThemeProvider applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps\./,
    );
    // Without a themeProp the usual Theme wiring follows.
    expect(text).toContain('Wire the generated module once in the app root:');
    expect(text).toContain('<Theme theme={themes[defaultThemeSlug]}');

    // In JSON, on the first add only.
    const again = app();
    const r = await themeAdd('brand', {cwd: again, package: '@acme/ui'});
    expect(r.data.appProvider).toMatchObject({
      wiredBy: [{export: 'AcmeThemeProvider', from: '@acme/ui/theme'}],
    });
    expect(r.data.appProvider.wire).not.toContain('doctor');
    const second = await themeAdd('brand', {cwd: again, package: '@acme/ui'});
    expect(second.data.appProvider).toBeUndefined();
  });

  it('with the themeProp the manifest names, gives the one change that passes the theme', async () => {
    const dir = app();
    write(
      path.join(dir, 'node_modules/@acme/ui/astryx.integration.mjs'),
      `export default {themes: './themes', themeProvider: ${JSON.stringify({...PROVIDER, themeProp: 'theme'})}};\n`,
    );
    const text = (
      await runCli(['theme', 'add', 'brand', '--package', '@acme/ui'], dir)
    ).stdout;
    expect(text).toContain(
      'This app may already get its theme from AcmeThemeProvider (from @acme/ui/theme, declared by @acme/ui; it takes the theme as theme). Pass this theme to it in the app root:',
    );
    // The wiring is the provider's, with the module's theme passed to it:
    // one instruction, no Theme wrap beside it.
    expect(text).toContain("import {AcmeThemeProvider} from '@acme/ui/theme';");
    expect(text).toContain(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>\n  <App />\n</AcmeThemeProvider>',
    );
    expect(text).not.toContain('<Theme ');
    expect(text).not.toContain('Wire the generated module');
    expect(text).not.toContain('Replacing');

    const again = app();
    write(
      path.join(again, 'node_modules/@acme/ui/astryx.integration.mjs'),
      `export default {themes: './themes', themeProvider: ${JSON.stringify({...PROVIDER, themeProp: 'theme'})}};\n`,
    );
    const r = await themeAdd('brand', {cwd: again, package: '@acme/ui'});
    expect(r.data.appProvider).toMatchObject({
      wiredBy: [{...PROVIDER, themeProp: 'theme'}],
      themeProp: 'theme',
      line: '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>',
    });
  });

  /**
   * An app whose provider takes the theme and, with `modeProp`, its mode;
   * with `oneMode`, the theme has the one color mode dark.
   * @param {{modeProp?: string, oneMode?: boolean, slugs?: string[], themeProp?: string | null}} opts
   *   `slugs`: the integration's themes (`night`, when listed, has the one
   *   color mode dark); `themeProp: null` declares none
   */
  const withProps = ({modeProp, oneMode, slugs, themeProp = 'theme'}) => {
    const dir = app(slugs);
    if (slugs?.includes('night'))
      write(
        path.join(dir, 'node_modules/@acme/ui/dist/night.js'),
        'export const nightTheme = {name: \'night\', tokens: {}};\nexport const colorModes = ["dark"];\n',
      );
    write(
      path.join(dir, 'node_modules/@acme/ui/astryx.integration.mjs'),
      `export default {themes: './themes', themeProvider: ${JSON.stringify({...PROVIDER, ...(themeProp ? {themeProp} : {}), ...(modeProp ? {modeProp} : {})})}};\n`,
    );
    if (oneMode)
      write(
        path.join(dir, 'node_modules/@acme/ui/dist/brand.js'),
        'export const brandTheme = {name: \'brand\', tokens: {}};\nexport const colorModes = ["dark"];\n',
      );
    return dir;
  };

  it('passes a one-mode theme its mode when the provider names a modeProp', async () => {
    const dir = withProps({modeProp: 'themeMode', oneMode: true});
    const text = (
      await runCli(['theme', 'add', 'brand', '--package', '@acme/ui'], dir)
    ).stdout;
    expect(text).toContain(
      "import {themes, defaultThemeSlug, themeModes} from './astryx-themes';",
    );
    expect(text).toContain(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]} themeMode={themeModes[defaultThemeSlug]}>',
    );
    const again = withProps({modeProp: 'themeMode', oneMode: true});
    const r = await themeAdd('brand', {cwd: again, package: '@acme/ui'});
    expect(r.data.appProvider.line).toBe(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]} themeMode={themeModes[defaultThemeSlug]}>',
    );
  });

  it('passes no mode for a one-mode theme when the provider names no modeProp', async () => {
    const dir = withProps({oneMode: true});
    const r = await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    expect(r.data.appProvider.line).toBe(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>',
    );
  });

  it('passes no mode for a theme with both modes, even with a modeProp', async () => {
    const dir = withProps({modeProp: 'themeMode'});
    const text = (
      await runCli(['theme', 'add', 'brand', '--package', '@acme/ui'], dir)
    ).stdout;
    expect(text).not.toContain('themeMode=');
    expect(text).not.toContain('themeModes');
    // The text names the mode prop the provider takes all the same.
    expect(text).toContain(
      '(from @acme/ui/theme, declared by @acme/ui; it takes the theme as theme and the mode as themeMode)',
    );
    const again = withProps({modeProp: 'themeMode'});
    const r = await themeAdd('brand', {cwd: again, package: '@acme/ui'});
    expect(r.data.appProvider.line).toBe(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>',
    );
  });

  /** @param {string[]} args @param {string} dir */
  const cliText = async (args, dir) => (await runCli(args, dir)).stdout;

  it('a later one-mode theme passes its mode to the provider, not to a Theme', async () => {
    const dir = withProps({modeProp: 'themeMode', slugs: ['brand', 'night']});
    await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    const text = await cliText(
      ['theme', 'add', 'night', '--package', '@acme/ui'],
      dir,
    );
    expect(text).toContain(
      "The theme module now exports themeModes. Pass the selected theme's mode to AcmeThemeProvider in the app root:",
    );
    expect(text).toContain(
      "import {themes, defaultThemeSlug, themeModes} from './astryx-themes';",
    );
    expect(text).toContain(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]} themeMode={themeModes[defaultThemeSlug]}>',
    );
    expect(text).not.toContain('<Theme ');
  });

  it('a later one-mode theme leaves the wiring of a provider that takes no mode', async () => {
    const dir = withProps({slugs: ['brand', 'night']});
    await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    const again = await themeAdd('night', {cwd: dir, package: '@acme/ui'});
    expect(again.data.change.wireModes).toBe(true);
    expect(again.data.appProvider?.wire).toBe(
      'The theme module now exports themeModes; AcmeThemeProvider (from @acme/ui/theme), which takes the theme as theme, takes no mode, so its wiring stays as it is.',
    );
    expect(again.data.appProvider?.line).toBeUndefined();
  });

  it('removing the last theme undoes the props passed to the provider and keeps it', async () => {
    const dir = withProps({});
    await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    const text = await cliText(['theme', 'remove', 'brand'], dir);
    expect(text).toContain(
      "Undo its wiring in the app root: delete the module's import and the props that pass its theme to AcmeThemeProvider, and keep AcmeThemeProvider, which may set up more than the theme:",
    );
    expect(text).toContain(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>\n  <App />\n</AcmeThemeProvider>',
    );
    expect(text).not.toContain('<Theme ');
  });

  it('a removal from a module without themeModes leaves out the mode prop it does not pass', async () => {
    const dir = withProps({modeProp: 'themeMode'});
    await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    const r = await themeRemove('brand', {cwd: dir});
    expect(r.data.appProvider?.wiredBy).toEqual([
      {...PROVIDER, themeProp: 'theme'},
    ]);
    expect(r.data.appProvider?.line).toBe(
      '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>',
    );
  });

  it('with two installed providers, names both and their trade-offs above the Theme wiring', async () => {
    const dir = withProps({});
    const beta = path.join(dir, 'node_modules/@beta/ui');
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'provider-app',
        private: true,
        dependencies: {
          '@acme/ui': '1.0.0',
          '@beta/ui': '1.0.0',
          '@astryxdesign/core': CLI_VERSION,
          '@astryxdesign/theme-neutral': CLI_VERSION,
        },
      }),
    );
    write(
      path.join(beta, 'package.json'),
      JSON.stringify({
        name: '@beta/ui',
        version: '1.0.0',
        type: 'module',
        exports: {
          './provider': './dist/provider.js',
          './themes/sky': './dist/sky.js',
          './themes/sky.css': './dist/sky.css',
        },
      }),
    );
    write(
      path.join(beta, 'astryx.integration.mjs'),
      "export default {themes: './themes', themeProvider: {export: 'BetaProvider', from: '@beta/ui/provider', themeProp: 'theme'}};\n",
    );
    write(
      path.join(beta, 'dist/provider.js'),
      'export function BetaProvider({children}) { return children; }\n',
    );
    write(
      path.join(beta, 'themes/sky/skyTheme.doc.mjs'),
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'sky', displayName: 'sky', description: 'sky theme.', maintained: true};\n",
    );
    write(
      path.join(beta, 'themes/sky/skyTheme.ts'),
      "export const skyTheme = {name: 'sky', tokens: {}};\n",
    );
    write(
      path.join(beta, 'dist/sky.js'),
      "export const skyTheme = {name: 'sky', tokens: {}};\n",
    );
    write(path.join(beta, 'dist/sky.css'), '[data-astryx-theme="sky"] {}\n');
    const text = await cliText(
      ['theme', 'add', 'brand', '--package', '@acme/ui'],
      dir,
    );
    expect(text).toContain(
      'This app may already get its theme from AcmeThemeProvider (from @acme/ui/theme, declared by @acme/ui; it takes the theme as theme) or BetaProvider (from @beta/ui/provider, declared by @beta/ui; it takes the theme as theme).',
    );
    expect(text).toContain(
      'Replacing AcmeThemeProvider applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps.',
    );
    expect(text).toContain(
      'Replacing BetaProvider applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps.',
    );
    expect(text).toContain('Wire the generated module once in the app root:');
    expect(text).toContain('<Theme theme={themes[defaultThemeSlug]}');
    expect(text).not.toContain('Pass this theme to it');
    expect(text).not.toContain('<AcmeThemeProvider theme=');
  });

  it('says nothing when no installed package names a provider', async () => {
    const dir = app();
    write(
      path.join(dir, 'node_modules/@acme/ui/astryx.integration.mjs'),
      "export default {themes: './themes'};\n",
    );
    const r = await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
    expect(r.data.appProvider).toBeUndefined();
  });
});

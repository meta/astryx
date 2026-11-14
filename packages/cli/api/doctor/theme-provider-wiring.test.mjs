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
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';

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
 */
function app(slugs = ['brand']) {
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
  const exportsMap = {'./theme': './dist/theme.js'};
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
        },
      ],
    });
    expect(await themesCheck(dir)).toMatchObject({
      status: 'info',
      message:
        'app/layout.tsx renders AcmeThemeProvider from @acme/ui/theme, which wires one of brand, night; doctor could not tell which, because the app imports none of their stylesheets.',
    });
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
  });
});

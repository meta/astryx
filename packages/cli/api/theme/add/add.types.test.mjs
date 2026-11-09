// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file TypeScript proof for generated app modules with package and local themes. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {themeBuild} from '../build/build.mjs';
import {themeAdd} from './add.mjs';

vi.setConfig({testTimeout: 120_000});

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const TSC_BIN = path.join(REPO_ROOT, 'node_modules/typescript/bin/tsc');
/** @type {string[]} */
const dirs = [];

/** @param {string} file @param {string} contents */
function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
}

function makeProject() {
  const project = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-theme-app-types-'));
  dirs.push(project);
  write(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'theme-app-types',
      private: true,
      type: 'module',
      dependencies: {'@acme/themes': '1.0.0'},
    }),
  );

  const packageDir = path.join(project, 'node_modules/@acme/themes');
  write(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/themes',
      version: '1.0.0',
      type: 'module',
      exports: {
        './themes/ocean': {
          types: './dist/ocean.d.ts',
          import: './dist/ocean.js',
        },
        './themes/ocean.css': {
          types: './dist/ocean.css.d.ts',
          default: './dist/ocean.css',
        },
      },
    }),
  );
  write(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  write(
    path.join(packageDir, 'themes/ocean/oceanTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n",
  );
  write(
    path.join(packageDir, 'themes/ocean/oceanTheme.ts'),
    "export const oceanTheme = {name: 'ocean', tokens: {}};\n",
  );
  write(
    path.join(packageDir, 'dist/ocean.js'),
    "export const oceanTheme = {name: 'ocean', tokens: {}};\n",
  );
  write(
    path.join(packageDir, 'dist/ocean.d.ts'),
    "export declare const oceanTheme: {readonly name: 'ocean'};\n",
  );
  write(
    path.join(packageDir, 'dist/ocean.css'),
    '[data-astryx-theme="ocean"] { color: navy; }\n',
  );
  write(path.join(packageDir, 'dist/ocean.css.d.ts'), 'export {};\n');

  write(
    path.join(project, 'src/themes/stone/stoneTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'stone', displayName: 'Stone', description: 'Stone theme.', maintained: false};\n",
  );
  write(
    path.join(project, 'src/themes/stone/stoneTheme.ts'),
    "export const stoneTheme = {name: 'stone', tokens: {'--color-text': '#111'}};\nexport default stoneTheme;\n",
  );
  write(
    path.join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2022',
        strict: true,
        noEmit: true,
        noUncheckedSideEffectImports: true,
        noUnusedLocals: true,
        skipLibCheck: true,
      },
      include: ['src/astryx-themes.ts', 'src/use-themes.ts'],
    }),
  );
  return project;
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop(), {recursive: true, force: true});
  }
});

describe('generated app-theme module types', () => {
  it('type-checks package and local CSS imports under strict side-effect checking', async () => {
    const project = makeProject();
    await themeBuild('src/themes/stone/stoneTheme.ts', {}, {cwd: project});
    expect(
      fs.existsSync(path.join(project, 'src/themes/stone/stone.css.d.ts')),
    ).toBe(true);

    await themeAdd('ocean', {
      cwd: project,
      package: '@acme/themes',
    });
    await themeAdd('stone', {cwd: project, import: true});
    write(
      path.join(project, 'src/use-themes.ts'),
      "import {defaultThemeSlug, themes} from './astryx-themes.js';\nimport type {ThemeSlug} from './astryx-themes.js';\nexport const activeTheme = themes[defaultThemeSlug];\nexport const activeSlug: ThemeSlug = defaultThemeSlug;\n",
    );

    try {
      execFileSync(
        process.execPath,
        [TSC_BIN, '--project', path.join(project, 'tsconfig.json')],
        {cwd: project, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']},
      );
    } catch (error) {
      const failure = /** @type {{stdout?: unknown, stderr?: unknown}} */ (
        error
      );
      throw new Error(`${failure.stdout ?? ''}${failure.stderr ?? ''}`, {
        cause: error,
      });
    }
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeAdd} from './add/add.mjs';
import {themeEject} from './eject/eject.mjs';

let tmpDir;

function installThemeIntegration(packageName, slug, source, extraFiles = {}) {
  const packageDir = path.join(
    tmpDir,
    'node_modules',
    ...packageName.split('/'),
  );
  const themeDir = path.join(packageDir, 'themes', slug);
  const stem = `${slug.replace(/-([a-z0-9])/gu, (_, character) => character.toUpperCase())}Theme`;
  fs.mkdirSync(themeDir, {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      exports: {
        [`./themes/${slug}`]: `./dist/${slug}.js`,
        [`./themes/${slug}.css`]: `./dist/${slug}.css`,
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    `export default {themes: './themes'};
`,
  );
  fs.writeFileSync(
    path.join(themeDir, `${stem}.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {type: 'theme', name: '${slug}', displayName: '${slug === 'neutral' ? 'Neutral Plus' : 'Ocean'}', description: 'Integration-owned theme.', maintained: true};
`,
  );
  fs.writeFileSync(
    path.join(themeDir, `${stem}.ts`),
    source ??
      `export const ${stem} = {};
`,
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist', `${slug}.js`),
    `export const ${stem} = {name: '${slug}', __built: true};\n`,
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist', `${slug}.css`),
    `[data-astryx-theme="${slug}"] {}\n`,
  );
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const file = path.join(themeDir, relativePath);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, contents);
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-theme-integration-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      dependencies: {'@acme/themes': '^1.0.0'},
    }),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('package and integration themes', () => {
  it('ejects source from an installed integration and records its owner', async () => {
    installThemeIntegration('@acme/themes', 'ocean');
    const result = await themeEject('ocean', {cwd: tmpDir});

    expect(result.data.package).toBe('@acme/themes');
    expect(result.data.outputDir).toBe(path.join('src', 'themes', 'ocean'));
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'src', 'themes', 'ocean', 'oceanTheme.ts'),
        'utf-8',
      ),
    ).toContain('oceanTheme');
  });

  it('ejects the complete nested integration theme directory', async () => {
    installThemeIntegration(
      '@acme/themes',
      'ocean',
      "import {oceanBlue} from './tokens/colors';\nexport const oceanTheme = {oceanBlue};\n",
      {
        'tokens/colors.ts': "export const oceanBlue = '#0064e0';\n",
        'receipts/palette.json': '{"version":1}\n',
      },
    );

    const result = await themeEject('ocean', {cwd: tmpDir});

    expect(result.data.files).toEqual([
      'oceanTheme.ts',
      'oceanTheme.doc.mjs',
      'receipts/palette.json',
      'tokens/colors.ts',
    ]);
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'src', 'themes', 'ocean', 'oceanTheme.doc.mjs'),
        'utf-8',
      ),
    ).toContain("type: 'theme'");
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'src', 'themes', 'ocean', 'oceanTheme.doc.mjs'),
        'utf-8',
      ),
    ).toContain('maintained: false');
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'src', 'themes', 'ocean', 'tokens', 'colors.ts'),
        'utf-8',
      ),
    ).toContain('oceanBlue');
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'src', 'themes', 'ocean', 'receipts', 'palette.json'),
        'utf-8',
      ),
    ).toBe('{"version":1}\n');
  });

  it('rejects a nested destination symlink that escapes the project', async () => {
    installThemeIntegration(
      '@acme/themes',
      'ocean',
      "import {oceanBlue} from './tokens/colors';\nexport const oceanTheme = {oceanBlue};\n",
      {'tokens/colors.ts': "export const oceanBlue = '#0064e0';\n"},
    );
    const outsideDir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-theme-outside-'),
    );
    try {
      const targetDir = path.join(tmpDir, 'src', 'themes', 'ocean');
      fs.mkdirSync(targetDir, {recursive: true});
      fs.symlinkSync(
        outsideDir,
        path.join(targetDir, 'tokens'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      await expect(themeEject('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_PATH_TRAVERSAL',
      });
      expect(fs.existsSync(path.join(outsideDir, 'colors.ts'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, 'oceanTheme.ts'))).toBe(false);
    } finally {
      fs.rmSync(outsideDir, {recursive: true, force: true});
    }
  });

  it('fails closed on a duplicate slug and resolves it with package scope', async () => {
    installThemeIntegration('@acme/themes', 'neutral');

    await expect(themeAdd('neutral', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_AMBIGUOUS_THEME',
    });
    const result = await themeAdd('neutral', {
      cwd: tmpDir,
      import: true,
      package: '@acme/themes',
    });
    expect(result.data.themes[0]?.owner).toBe('@acme/themes');
  });

  it('reports a selected installed package with a corrupted theme directory', async () => {
    installThemeIntegration(
      '@acme/themes',
      'ocean',
      "export {oceanBlue} from './tokens/colors';\n",
      {'tokens/colors.ts': "export const oceanBlue = '#0064e0';\n"},
    );
    fs.rmSync(
      path.join(
        tmpDir,
        'node_modules',
        '@acme',
        'themes',
        'themes',
        'ocean',
        'tokens',
        'colors.ts',
      ),
    );

    await expect(
      themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'}),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining('./tokens/colors'),
    });
  });

  it('reports an unknown package selection without falling back to another owner', async () => {
    installThemeIntegration('@acme/themes', 'ocean');
    await expect(
      themeAdd('ocean', {cwd: tmpDir, package: '@other/themes'}),
    ).rejects.toMatchObject({code: 'ERR_UNKNOWN_THEME'});
  });
});

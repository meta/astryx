// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeAdd} from '../add/add.mjs';
import {themeUse} from './use.mjs';
import {parseThemeModuleRecord} from '../../../foundation/config/theme-state.mjs';

let tmpDir;

function installThemes() {
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'themes');
  fs.mkdirSync(path.join(packageDir, 'themes'), {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  const exports = {};
  for (const slug of ['ocean', 'reef']) {
    const sourceDir = path.join(packageDir, 'themes', slug);
    fs.mkdirSync(sourceDir);
    exports[`./themes/${slug}`] = `./dist/${slug}.js`;
    exports[`./themes/${slug}.css`] = `./dist/${slug}.css`;
    fs.writeFileSync(
      path.join(sourceDir, `${slug}Theme.doc.mjs`),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type:'theme',name:'${slug}',displayName:'${slug}',description:'${slug}',maintained:true};\n`,
    );
    fs.writeFileSync(
      path.join(sourceDir, `${slug}Theme.ts`),
      `export const ${slug}Theme = {};\n`,
    );
    fs.writeFileSync(
      path.join(packageDir, `dist/${slug}.js`),
      `export const ${slug}Theme = {name:'${slug}',__built:true};\n`,
    );
    fs.writeFileSync(path.join(packageDir, `dist/${slug}.css`), '/* css */\n');
  }
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: '@acme/themes', version: '1.0.0', exports}),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes:'./themes'};\n",
  );
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-theme-use-'));
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@acme/themes': '^1.0.0'}}),
  );
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}\n');
  installThemes();
  await themeAdd('ocean', {cwd: tmpDir, import: true, package: '@acme/themes'});
  await themeAdd('reef', {cwd: tmpDir, import: true, package: '@acme/themes'});
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('themeUse', () => {
  it('changes the default and regenerates the module', async () => {
    const result = await themeUse('ReEf', {cwd: tmpDir});
    expect(result).toMatchObject({
      type: 'theme.app',
      data: {
        default: 'reef',
        change: {action: 'use', slug: 'reef', changed: true},
      },
    });
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(tmpDir, 'src/astryx-themes.ts'), 'utf-8'),
      ),
    ).toEqual({
      themes: {ocean: '@acme/themes', reef: '@acme/themes'},
      defaultSlug: 'reef',
    });
  });

  it('regenerates and reports no change when already default', async () => {
    await themeUse('reef', {cwd: tmpDir});
    const moduleFile = path.join(tmpDir, 'src/astryx-themes.ts');
    fs.appendFileSync(moduleFile, '// edited\n');
    const result = await themeUse('reef', {cwd: tmpDir});
    expect(result.data.change.changed).toBe(false);
    expect(fs.readFileSync(moduleFile, 'utf-8')).not.toContain('// edited');
  });

  it('names theme add when the slug is not added', async () => {
    await expect(themeUse('missing', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_THEME',
      message: expect.stringContaining(' theme add missing`'),
    });
  });
});

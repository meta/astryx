// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeAdd} from '../add/add.mjs';
import {themeRemove} from './remove.mjs';
import {parseThemeModuleRecord} from '../../../foundation/config/theme-state.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';

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
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-theme-remove-'));
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

describe('themeRemove', () => {
  it('removes a non-default theme and regenerates the module', async () => {
    const result = await themeRemove('ReEf', {cwd: tmpDir});
    expect(result).toMatchObject({
      type: 'theme.app',
      data: {
        default: 'ocean',
        change: {action: 'remove', slug: 'reef', changed: true},
      },
    });
    expect(result.data.themes.map(theme => theme.slug)).toEqual(['ocean']);
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(tmpDir, 'src/astryx-themes.ts'), 'utf-8'),
      ),
    ).toEqual({themes: {ocean: '@acme/themes'}, defaultSlug: 'ocean'});
  });

  it('refuses to remove the default and names theme use', async () => {
    await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining(' theme use reef`'),
      suggestions: [{name: expect.stringMatching(/ theme use reef$/)}],
    });
  });

  it('names theme list when no theme by that slug is available', async () => {
    await expect(themeRemove('missing', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_THEME',
      message: expect.stringContaining(
        ' theme list` for the themes you can add.',
      ),
      suggestions: [{name: expect.stringMatching(/ theme list$/)}],
    });
  });

  it('names theme add when an available theme is not added', async () => {
    await expect(themeRemove('butter', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_THEME',
      message: expect.stringContaining(' theme add butter`'),
      suggestions: [{name: expect.stringMatching(/ theme add butter$/)}],
    });
  });

  it('still refuses to remove the default when its source is gone, and names theme use', async () => {
    fs.rmSync(path.join(tmpDir, 'node_modules/@acme/themes/themes/ocean'), {
      recursive: true,
    });
    await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining(' theme use reef`'),
    });
  });

  it('removes a non-default theme whose source is gone', async () => {
    fs.rmSync(path.join(tmpDir, 'node_modules/@acme/themes/themes/reef'), {
      recursive: true,
    });
    const result = await themeRemove('reef', {cwd: tmpDir});
    expect(result.data.themes.map(theme => theme.slug)).toEqual(['ocean']);
  });

  describe('the only added theme', () => {
    const modulePath = () => path.join(tmpDir, 'src/astryx-themes.ts');

    beforeEach(async () => {
      await themeRemove('reef', {cwd: tmpDir});
    });

    it('is removed by deleting the generated module', async () => {
      const result = await themeRemove('ocean', {cwd: tmpDir});
      expect(result).toEqual({
        type: 'theme.app',
        data: {
          themes: [],
          default: '',
          modulePath: 'src/astryx-themes.ts',
          change: {
            action: 'remove',
            slug: 'ocean',
            changed: true,
            firstAdd: false,
            moduleRemoved: true,
          },
        },
      });
      expect(fs.existsSync(modulePath())).toBe(false);
      const again = await themeAdd('ocean', {
        cwd: tmpDir,
        package: '@acme/themes',
      });
      expect(again.data.change.firstAdd).toBe(true);
    });

    it('is removed after its package is uninstalled', async () => {
      fs.rmSync(path.join(tmpDir, 'node_modules/@acme'), {recursive: true});
      const result = await themeRemove('ocean', {cwd: tmpDir});
      expect(result.data.change.moduleRemoved).toBe(true);
      expect(fs.existsSync(modulePath())).toBe(false);
    });

    it('leaves a module whose import line was edited by hand', async () => {
      const source = fs.readFileSync(modulePath(), 'utf-8');
      const edited = source.replace(
        'import "@acme/themes/themes/ocean.css";',
        'import "./ocean-overrides.css";',
      );
      expect(edited).not.toBe(source);
      fs.writeFileSync(modulePath(), edited);
      await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
      });
      fs.rmSync(path.join(tmpDir, 'node_modules/@acme'), {recursive: true});
      await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
      });
      expect(fs.readFileSync(modulePath(), 'utf-8')).toBe(edited);
    });

    it('after a package upgrade adds an import, names theme use to rewrite the module', async () => {
      const packageDir = path.join(tmpDir, 'node_modules/@acme/themes');
      const pkg = JSON.parse(
        fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
      );
      pkg.exports['./themes/ocean.fonts.css'] = './dist/ocean.fonts.css';
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify(pkg),
      );
      fs.writeFileSync(
        path.join(packageDir, 'dist/ocean.fonts.css'),
        '/* fonts */\n',
      );
      const before = fs.readFileSync(modulePath(), 'utf-8');
      await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining('as after a theme package upgrade'),
        suggestions: [{name: expect.stringMatching(/ theme use ocean$/)}],
      });
      expect(fs.readFileSync(modulePath(), 'utf-8')).toBe(before);
    });

    it('never deletes a module outside the project through a symlinked src', async () => {
      const outside = fs.mkdtempSync(
        path.join(REPO_ROOT, '.astryx-theme-outside-'),
      );
      try {
        fs.cpSync(path.join(tmpDir, 'src'), outside, {recursive: true});
        fs.rmSync(path.join(tmpDir, 'src'), {recursive: true});
        fs.symlinkSync(outside, path.join(tmpDir, 'src'), 'dir');
        await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject(
          {
            code: 'ERR_THEME_INVALID',
          },
        );
        expect(fs.existsSync(path.join(outside, 'astryx-themes.ts'))).toBe(
          true,
        );
      } finally {
        fs.rmSync(outside, {recursive: true, force: true});
      }
    });

    it('leaves a module with changes the CLI did not write, and says how to finish', async () => {
      const edited = `${fs.readFileSync(modulePath(), 'utf-8')}// mine\n`;
      fs.writeFileSync(modulePath(), edited);
      await expect(themeRemove('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining(
          'src/astryx-themes.ts has changes the CLI did not write, so the CLI leaves it.',
        ),
      });
      expect(fs.readFileSync(modulePath(), 'utf-8')).toBe(edited);
    });
  });
});

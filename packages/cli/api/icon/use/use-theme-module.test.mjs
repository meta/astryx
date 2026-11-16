// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `iconUse()` and the generated theme module: in an app with one, it
 * rewrites the module so every added theme draws the built-in icons from the
 * main set's theme map. The theme commands keep the set when they rewrite the
 * module, Doctor's exact-module check agrees, and an app without the module
 * is left as it is.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {iconUse} from './use.mjs';
import {themeAdd} from '../../theme/add/add.mjs';
import {themeUse} from '../../theme/use/use.mjs';
import {checkAppThemes} from '../../doctor/theme-checks.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-theme-module-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * Install one built package theme in the app and declare it.
 * @param {string} dir
 * @param {string} slug
 */
function installTheme(dir, slug) {
  const packageDir = path.join(dir, 'node_modules', '@acme', 'themes');
  const exportName = `${slug}Theme`;
  const sourceDir = path.join(packageDir, 'themes', slug);
  fs.mkdirSync(sourceDir, {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  const pkgFile = path.join(packageDir, 'package.json');
  const pkg = fs.existsSync(pkgFile)
    ? JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
    : {name: '@acme/themes', version: '1.0.0', type: 'module', exports: {}};
  pkg.exports[`./themes/${slug}`] = `./dist/${slug}.js`;
  pkg.exports[`./themes/${slug}.css`] = `./dist/${slug}.css`;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg));
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  fs.writeFileSync(
    path.join(sourceDir, `${exportName}.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: true};\n`,
  );
  fs.writeFileSync(
    path.join(sourceDir, `${exportName}.ts`),
    `export const ${exportName} = {};\n`,
  );
  fs.writeFileSync(
    path.join(packageDir, `dist/${slug}.js`),
    `export const ${exportName} = {name: '${slug}', __built: true};\n`,
  );
  fs.writeFileSync(
    path.join(packageDir, `dist/${slug}.css`),
    `[data-astryx-theme="${slug}"] {}\n`,
  );
  const appFile = path.join(dir, 'package.json');
  const app = JSON.parse(fs.readFileSync(appFile, 'utf8'));
  app.dependencies['@acme/themes'] = '^1.0.0';
  fs.writeFileSync(appFile, JSON.stringify(app));
}

/** @param {string} dir */
const moduleText = dir =>
  fs.readFileSync(path.join(dir, 'astryx-themes.js'), 'utf8');

const GLYPHS = {
  set: '@acme/glyphs/glyphs',
  module: '@acme/glyphs',
  export: 'themeIcons',
};

describe('iconUse and the generated theme module', () => {
  it("rewrites the module, so every theme draws the built-in icons from the main set's theme map", async () => {
    const dir = writeIconSetProject(tmp);
    installTheme(dir, 'ocean');
    await themeAdd('ocean', {cwd: dir});
    expect(moduleText(dir)).not.toContain('_astryxIconSet');

    const result = await iconUse('glyphs', {cwd: dir});

    expect(result.data.themeModule).toEqual({
      path: 'astryx-themes.js',
      changed: true,
      iconSet: GLYPHS,
    });
    const source = moduleText(dir);
    expect(source).toContain(
      'import {themeIcons as _astryxIconSet} from "@acme/glyphs";',
    );
    expect(source).toContain('"ocean": _astryxWithIconSet(_astryxTheme0),');
    const again = await iconUse('glyphs', {cwd: dir});
    expect(again.data.themeModule).toMatchObject({changed: false});
  });

  it('keeps the set when a theme command rewrites the module', async () => {
    const dir = writeIconSetProject(tmp);
    installTheme(dir, 'ocean');
    await themeAdd('ocean', {cwd: dir});
    await iconUse('glyphs', {cwd: dir});
    installTheme(dir, 'dusk');

    const added = await themeAdd('dusk', {cwd: dir});
    expect(added.data.iconSet).toEqual(GLYPHS);
    expect(moduleText(dir)).toContain(
      '"dusk": _astryxWithIconSet(_astryxTheme1),',
    );
    const used = await themeUse('dusk', {cwd: dir});
    expect(used.data.iconSet).toEqual(GLYPHS);
    expect(moduleText(dir)).toContain(
      '"ocean": _astryxWithIconSet(_astryxTheme0),',
    );
  });

  it("passes Doctor's exact generated-module check with the set", async () => {
    const dir = writeIconSetProject(tmp);
    installTheme(dir, 'ocean');
    await themeAdd('ocean', {cwd: dir});
    await iconUse('glyphs', {cwd: dir});

    const checks = await checkAppThemes(dir);
    expect(checks.find(check => check.id === 'theme-module')).toMatchObject({
      status: 'pass',
    });
  });

  it('leaves an app without a generated theme module as it is', async () => {
    const dir = writeIconSetProject(tmp);

    const result = await iconUse('glyphs', {cwd: dir});

    expect(result.data).not.toHaveProperty('themeModule');
    expect(fs.existsSync(path.join(dir, 'astryx-themes.js'))).toBe(false);
  });

  it('adds no set to the module of a project that names no icon set', async () => {
    const dir = writeIconSetProject(tmp);
    installTheme(dir, 'ocean');

    const added = await themeAdd('ocean', {cwd: dir});

    expect(added.data).not.toHaveProperty('iconSet');
    expect(moduleText(dir)).not.toContain('_astryxIconSet');
  });
});

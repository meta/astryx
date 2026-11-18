// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme map for each look: a set's generated module writes
 * `themeIcons<Variant>` beside `themeIcons` for each other variant an icon
 * draws, each built-in entry drawing the icon's export for that variant or
 * its own export; the declaration file types it; and `integration check`
 * holds it to `map`: a missing map names the command that writes it, and
 * other artwork or a map the entry does not export fail.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {iconNewSet} from './new-set/new-set.mjs';
import {iconAdd} from './add/add.mjs';
import {iconMap} from './map/map.mjs';
import {iconSetIssues} from '../../foundation/discovery/icon-set-checks.mjs';
import {lookThemeMap} from '../../foundation/discovery/icon-set-theme-maps.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-looks-')),
  );
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const FROM = '@acme/glyph-library';
const GENERATED = 'icon-sets/glyphs/glyphs.generated.js';

/**
 * An icon-set package `@acme/icons` whose entry exports its generated
 * module, with an installed library of two icons in an outline module and a
 * solid one, and its set `glyphs` made from the outline module.
 * @returns {Promise<string>}
 */
async function makePackage() {
  const dir = fs.mkdtempSync(path.join(tmp, 'pkg-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@acme/icons',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        dependencies: {[FROM]: '^2.0.0'},
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export * from './${GENERATED}';\n`,
  );
  const lib = path.join(dir, 'node_modules', '@acme', 'glyph-library');
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: FROM,
      version: '2.0.0',
      license: 'ISC',
      type: 'module',
      exports: {'.': './index.js', './solid': './solid.js'},
    }),
  );
  const icons =
    'export function Bin(props) { return null; }\nexport function Close(props) { return null; }\n';
  fs.writeFileSync(path.join(lib, 'index.js'), icons);
  fs.writeFileSync(path.join(lib, 'solid.js'), icons);
  fs.writeFileSync(path.join(lib, 'LICENSE'), 'ISC License\n');
  await iconNewSet('glyphs', {
    cwd: dir,
    from: FROM,
    variants: 'outline,solid',
    defaultVariant: 'outline',
  });
  return dir;
}

/** @param {string} dir */
const generated = dir => fs.readFileSync(path.join(dir, GENERATED), 'utf8');

/**
 * The set's theme-map and export findings.
 * @param {string} dir
 */
function themeIssues(dir) {
  const notChecked = new Map();
  const issues = iconSetIssues(
    dir,
    {name: '@acme/icons', iconSets: path.join(dir, 'icon-sets')},
    notChecked,
  );
  return {
    issues: issues
      .filter(issue =>
        ['icon_theme_map_mismatch', 'icon_export_missing'].includes(issue.code),
      )
      .map(issue => [issue.code, issue.message]),
    notChecked: [...notChecked.values()].flat(),
  };
}

describe('the theme map for each look', () => {
  it('is written once an icon draws the look, with the built-in entries in it, and typed', async () => {
    const dir = await makePackage();
    // No icon draws solid yet: only themeIcons.
    expect(generated(dir)).not.toContain('themeIconsSolid');
    await iconAdd(undefined, {
      cwd: dir,
      from: `${FROM}/solid`,
      variant: 'solid',
      all: true,
    });
    await iconMap('delete', 'bin', {cwd: dir});
    const js = generated(dir);
    expect(js).toContain(
      "export const themeIcons = {\n  close: createElement(CloseIcon, {'aria-hidden': true, 'width': '1em', 'height': '1em', 'style': {'width': '1em', 'height': '1em'}}),\n};",
    );
    expect(js).toContain(
      "export const themeIconsSolid = {\n  close: createElement(CloseSolidIcon, {'aria-hidden': true, 'width': '1em', 'height': '1em', 'style': {'width': '1em', 'height': '1em'}}),\n};",
    );
    // The solid export gets a local name the map reads, as themeIcons' do.
    expect(js).toContain(
      `import {Close as CloseSolidIcon} from '${FROM}/solid';`,
    );
    expect(
      fs.readFileSync(
        path.join(dir, 'icon-sets/glyphs/glyphs.generated.d.ts'),
        'utf8',
      ),
    ).toContain(
      'export declare const themeIconsSolid: {readonly close: ReactElement};',
    );
    expect(themeIssues(dir)).toEqual({issues: [], notChecked: []});
  });

  it("draws an icon's own export for a built-in that has no export in the look", async () => {
    const dir = await makePackage();
    await iconAdd('Bin', {
      cwd: dir,
      from: `${FROM}/solid`,
      variant: 'solid',
    });
    const js = generated(dir);
    expect(js).toContain(
      'export const themeIconsSolid = {\n  close: createElement(CloseIcon,',
    );
    expect(themeIssues(dir).issues).toEqual([]);
  });

  it('names the command that writes a missing map, and that command writes it', async () => {
    const dir = await makePackage();
    await iconAdd(undefined, {
      cwd: dir,
      from: `${FROM}/solid`,
      variant: 'solid',
      all: true,
    });
    const file = path.join(dir, GENERATED);
    const js = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(
      file,
      js.replace(/export const themeIconsSolid = \{\n[\s\S]*?\n\};\n/u, ''),
    );
    expect(themeIssues(dir).issues).toEqual([
      [
        'icon_theme_map_mismatch',
        `Icon set "glyphs": its generated module ./${GENERATED} has no theme map "themeIconsSolid", which draws the built-in icons in the solid look an icon draws. Rewrite the module: \`astryx experimental icon add --variant solid --from ${FROM}/solid --all --set glyphs\`.`,
      ],
    ]);
    await iconAdd(undefined, {
      cwd: dir,
      from: `${FROM}/solid`,
      variant: 'solid',
      all: true,
      set: 'glyphs',
    });
    expect(generated(dir)).toContain('export const themeIconsSolid = {');
    expect(themeIssues(dir).issues).toEqual([]);
  });

  it('fails a map entry that draws other artwork, and a map the entry does not export', async () => {
    const dir = await makePackage();
    await iconAdd(undefined, {
      cwd: dir,
      from: `${FROM}/solid`,
      variant: 'solid',
      all: true,
    });
    const file = path.join(dir, GENERATED);
    const js = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(
      file,
      js.replace(
        'export const themeIconsSolid = {\n  close: createElement(CloseSolidIcon,',
        'export const themeIconsSolid = {\n  close: createElement(CloseIcon,',
      ),
    );
    expect(themeIssues(dir).issues).toEqual([
      [
        'icon_theme_map_mismatch',
        'Icon set "glyphs": theme map "themeIconsSolid" maps "close" to other artwork than the solid variant of icon "close", which "map" names for it. Point it at CloseSolidIcon, the icon\'s solid export.',
      ],
    ]);
    fs.writeFileSync(file, js);
    fs.writeFileSync(
      path.join(dir, 'index.js'),
      `export {BinIcon, CloseIcon, BinSolidIcon, CloseSolidIcon, themeIcons} from './${GENERATED}';\n`,
    );
    expect(themeIssues(dir).issues).toEqual([
      [
        'icon_export_missing',
        `Icon set "glyphs": theme map "themeIconsSolid" is in ./${GENERATED}, but "@acme/icons" does not export it. Export it from the package's entry, as it exports "themeIcons".`,
      ],
    ]);
  });

  it('lookThemeMap names the map a theme takes for a look', () => {
    const data = /** @type {any} */ ({
      generated: './glyphs.generated.js',
      themeMap: 'themeIcons',
      variants: ['outline', 'solid', 'two-tone'],
      default: {variant: 'outline'},
      icons: [
        {
          id: 'x',
          export: 'XIcon',
          words: ['x'],
          variants: [{variant: 'two-tone', export: 'XTwoToneIcon'}],
        },
      ],
    });
    expect(lookThemeMap(data, 'outline')).toBe('themeIcons');
    expect(lookThemeMap(data, null)).toBe('themeIcons');
    expect(lookThemeMap(data, 'two-tone')).toBe('themeIconsTwoTone');
    // No icon draws solid, so themeIcons already is that look's map.
    expect(lookThemeMap(data, 'solid')).toBe('themeIcons');
    // A theme map the CLI does not write has no map per look.
    expect(
      lookThemeMap({...data, themeMap: 'brandIcons'}, 'two-tone'),
    ).toBeNull();
    expect(lookThemeMap({...data, themeMap: undefined}, 'outline')).toBeNull();
  });
});

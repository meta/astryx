// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LOCAL_THEME_ROOT,
  THEME_MODULE_MARKER,
  parseThemeModuleRecord,
  planThemeAppWrite,
  readThemeState,
  renderThemeModule,
  resolveThemeModule,
} from './theme-state.mjs';

/** @type {string[]} */
const dirs = [];

function project(pkg = {name: 'app'}) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-theme-state-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg)}\n`);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop(), {recursive: true, force: true});
  }
});

function packageEntry(slug = 'ocean') {
  return {
    slug,
    owner: '@acme/themes',
    exportName: `${slug}Theme`,
    module: `@acme/themes/themes/${slug}`,
    stylesheet: `@acme/themes/themes/${slug}.css`,
    moduleFile: `/node_modules/@acme/themes/themes/${slug}.js`,
    stylesheetFile: `/node_modules/@acme/themes/themes/${slug}.css`,
    source: /** @type {const} */ ('package'),
  };
}

describe('generated theme-module state', () => {
  it('keeps released package.json astryx.theme meaning only without a module', () => {
    const dir = project({name: 'app', astryx: {theme: '@acme/legacy'}});
    expect(readThemeState(dir)).toMatchObject({
      themes: {},
      defaultSlug: null,
      legacyTheme: '@acme/legacy',
      configured: false,
    });
  });

  it('renders and statically reads the complete record without executing it', () => {
    const source = renderThemeModule([packageEntry()], 'ocean', true);
    expect(source).toContain(THEME_MODULE_MARKER);
    expect(source).toContain('export type ThemeSlug = keyof typeof themes');
    expect(
      [...source.matchAll(/^export (?:const|type) (\w+)/gmu)].map(
        match => match[1],
      ),
    ).toEqual(['themes', 'ThemeSlug', 'defaultThemeSlug']);
    expect(source).not.toContain('export const themeOwners');
    expect(parseThemeModuleRecord(source)).toEqual({
      themes: {ocean: '@acme/themes'},
      defaultSlug: 'ocean',
    });
  });

  it('emits JavaScript without TypeScript syntax', () => {
    const source = renderThemeModule([packageEntry()], 'ocean', false);
    expect(source).not.toContain('export type');
    expect(source).not.toContain(' as const');
    expect(
      [...source.matchAll(/^export const (\w+)/gmu)].map(match => match[1]),
    ).toEqual(['themes', 'defaultThemeSlug']);
    expect(parseThemeModuleRecord(source)).toEqual({
      themes: {ocean: '@acme/themes'},
      defaultSlug: 'ocean',
    });
  });

  it('uses src for a TypeScript project and the project root without src', () => {
    const typed = project();
    fs.mkdirSync(path.join(typed, 'src'));
    fs.writeFileSync(path.join(typed, 'tsconfig.json'), '{}\n');
    expect(resolveThemeModule(typed).path).toBe('src/astryx-themes.ts');

    const plain = project();
    expect(resolveThemeModule(plain).path).toBe('astryx-themes.js');
  });

  it('preserves an existing marked module when project shape changes', () => {
    const dir = project();
    const existing = path.join(dir, 'astryx-themes.js');
    fs.writeFileSync(
      existing,
      renderThemeModule([packageEntry()], 'ocean', false),
    );
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}\n');
    expect(resolveThemeModule(dir).file).toBe(existing);
  });

  it('fails closed when two generated modules exist', () => {
    const dir = project();
    fs.mkdirSync(path.join(dir, 'src'));
    const source = renderThemeModule([packageEntry()], 'ocean', false);
    fs.writeFileSync(path.join(dir, 'astryx-themes.js'), source);
    fs.writeFileSync(path.join(dir, 'src', 'astryx-themes.js'), source);
    expect(() => readThemeState(dir)).toThrow(
      /more than one generated theme module/i,
    );
  });

  it('refuses to replace an authored file at the selected path', () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'astryx-themes.js'),
      'export const mine = true;\n',
    );
    const state = readThemeState(dir);
    expect(() =>
      planThemeAppWrite(state, {ocean: '@acme/themes'}, 'ocean', [
        packageEntry(),
      ]),
    ).toThrow(/refusing to replace/i);
  });

  it('rejects a generated-module write through a symlink outside the project', () => {
    const dir = project();
    const outside = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-theme-state-outside-'),
    );
    dirs.push(outside);
    fs.symlinkSync(outside, path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}\n');
    const state = readThemeState(dir);

    expect(() =>
      planThemeAppWrite(state, {ocean: '@acme/themes'}, 'ocean', [
        packageEntry(),
      ]),
    ).toThrow(/outside the project root.*symlink/i);
    expect(fs.existsSync(path.join(outside, 'astryx-themes.ts'))).toBe(false);
  });

  it('records a local owner and renders local paths relative to the module', () => {
    const dir = project();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}\n');
    const state = readThemeState(dir);
    const sourceDir = path.join(dir, 'src', 'themes', 'ocean');
    const prepared = planThemeAppWrite(
      state,
      {ocean: LOCAL_THEME_ROOT},
      'ocean',
      [
        {
          slug: 'ocean',
          owner: LOCAL_THEME_ROOT,
          exportName: 'oceanTheme',
          module: '',
          stylesheet: '',
          moduleFile: path.join(sourceDir, 'ocean.js'),
          stylesheetFile: path.join(sourceDir, 'ocean.css'),
          source: 'local',
        },
      ],
    );
    expect(prepared.moduleContents).toContain('from "./themes/ocean/ocean.js"');
    expect(prepared.moduleContents).toContain(
      'import "./themes/ocean/ocean.css"',
    );
    expect(parseThemeModuleRecord(prepared.moduleContents)).toEqual({
      themes: {ocean: LOCAL_THEME_ROOT},
      defaultSlug: 'ocean',
    });
  });
});

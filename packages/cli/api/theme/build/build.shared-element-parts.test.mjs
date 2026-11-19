// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file build.shared-element-parts.test.mjs
 * @input Themes with and without an entry for a part that sits on another
 *   component's element (`toggle-button` on Button's), built as one theme and
 *   as a family
 * @output Verifies the CLI build writes the same astryx-theme sub-layers as
 *   the runtime compiler: the part's rules in `parts`, after every other rule
 *   in `components`, the color-scheme rules outside both, and the single
 *   layer, unchanged, for a theme with no such entry
 *   (architecture:theme-compilation INV22)
 * @position CLI build test beside build.family.test.mjs
 */
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {generateThemeCSS, defineTheme} from '@astryxdesign/core/theme';
import {themeBuild, themeBuildFamily} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

vi.setConfig({testTimeout: 120_000});
const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string[]} */ let dirs;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => (dirs = []));
afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
});

function makeDir() {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-shared-parts-')),
  );
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'themes'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries(LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
  return dir;
}

const STRIP = {
  name: 'strip',
  tokens: {'--color-accent': 'light-dark(rgb(0 90 200), rgb(120 170 255))'},
  components: {
    button: {'variant:secondary': {borderColor: 'rgb(200 200 200)'}},
    'toggle-button': {base: {borderColor: 'rgb(255 0 0)'}},
  },
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse'},
        value: {
          components: {'toggle-button': {base: {borderColor: 'rgb(0 0 255)'}}},
        },
      },
    ],
  },
  onDark: {
    components: {'toggle-button': {base: {borderColor: 'rgb(255 255 255)'}}},
  },
};

const PLAIN = {
  name: 'plain',
  components: {button: {base: {borderColor: 'rgb(255 0 0)'}}},
};

/** The astryx-theme text after the one top-level layer statement. */
function themed(css) {
  return css.slice(css.indexOf('@layer astryx-theme {'));
}

describe('theme build writes the shared-element parts in a later sub-layer', () => {
  it('puts the part in `parts`, its component in `components`, as the runtime does', async () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, 'themes/strip.mjs'),
      `export default ${JSON.stringify(STRIP)};\n`,
    );
    await themeBuild('themes/strip.mjs', {}, {cwd: dir});
    const css = fs.readFileSync(path.join(dir, 'themes/strip.css'), 'utf8');
    const body = themed(css);
    const partsAt = body.indexOf('@layer parts {');
    expect(body).toContain('@layer components, parts;');
    expect(partsAt).toBeGreaterThan(body.indexOf('@layer components {'));
    const parts = body.slice(partsAt);
    // Root, adaptation, media-surface order inside `parts`.
    const red = parts.indexOf('rgb(255 0 0)');
    const blue = parts.indexOf('rgb(0 0 255)');
    const white = parts.indexOf('rgb(255 255 255)');
    expect(red).toBeGreaterThan(-1);
    expect(blue).toBeGreaterThan(red);
    expect(white).toBeGreaterThan(blue);
    expect(parts).not.toContain('astryx-button[data-variant');
    const components = body.slice(0, partsAt);
    expect(components).toContain('.astryx-button[data-variant="secondary"]');
    expect(components).not.toContain('astryx-toggle-button');
    // The color-scheme rules stay outside both sub-layers.
    const scheme = body.indexOf('html[data-theme="light"] { color-scheme: light; }');
    expect(scheme).toBeGreaterThan(-1);
    expect(scheme).toBeLessThan(body.indexOf('@layer components, parts;'));
    // The runtime compiler writes the same two sub-layers for this theme.
    const runtime = generateThemeCSS(defineTheme(STRIP)).component;
    expect(runtime.startsWith('@layer components, parts;')).toBe(true);
  });

  it('keeps one layer, as before, for a theme with no part entry', async () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, 'themes/plain.mjs'),
      `export default ${JSON.stringify(PLAIN)};\n`,
    );
    await themeBuild('themes/plain.mjs', {}, {cwd: dir});
    const css = fs.readFileSync(path.join(dir, 'themes/plain.css'), 'utf8');
    expect(themed(css)).not.toMatch(/@layer (components|parts)\b/);
    expect(css).toContain('.astryx-button');
  });

  it('writes the same sub-layers in a family build', async () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, 'themes/strip.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const stripTheme = defineTheme(${JSON.stringify(STRIP)});\nexport default stripTheme;\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'themes/strip-calm.mjs'),
      `import {stripTheme} from './strip.mjs';\nexport default {name: 'strip-calm', extends: stripTheme, components: {button: {base: {color: 'rgb(1 2 3)'}}}};\n`,
    );
    await themeBuildFamily(
      ['themes/strip.mjs', 'themes/strip-calm.mjs'],
      {familyKey: 'strip-family'},
      {cwd: dir},
    );
    const css = fs.readFileSync(
      path.join(dir, 'themes/strip-family.css'),
      'utf8',
    );
    const body = themed(css);
    const partsAt = body.indexOf('@layer parts {');
    expect(body).toContain('@layer components, parts;');
    expect(partsAt).toBeGreaterThan(body.indexOf('@layer components {'));
    expect(body.slice(partsAt)).toContain('astryx-toggle-button');
    expect(body.slice(0, partsAt)).not.toContain('astryx-toggle-button');
  });
});

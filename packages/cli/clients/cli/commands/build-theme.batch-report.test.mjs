// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The human report of `astryx theme build`.
 *
 * By default the report is one line per built theme, one line naming the
 * fonts the themes do not load, and a hint. `--detail full` adds the install
 * example and the font recipe: once for one theme, as the report always had,
 * and once for a batch instead of once per theme. `--detail compact|brief`
 * prints the short report without the hint. `--json` and `--check` keep their
 * output at every detail level.
 *
 * `astryx theme build` needs a compiled @astryxdesign/core, so this suite
 * builds core once via the shared ensureCoreBuilt() helper.
 */

import {describe, it, expect, beforeAll, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const GOLDEN = path.resolve(import.meta.dirname, '../../../test/__golden__');

const NAMES = [
  'amber',
  'basil',
  'cedar',
  'dune',
  'ember',
  'fjord',
  'grove',
  'harbor',
  'iris',
  'juniper',
  'kelp',
  'lagoon',
  'meadow',
  'nimbus',
  'orchid',
];
const BODY_FONTS = [
  '"Space Grotesk", sans-serif',
  '"Space Grotesk", sans-serif',
  'Figtree, sans-serif',
  '"JetBrains Mono", monospace',
  'system-ui, sans-serif',
];
const FILES = NAMES.map(name => `themes/${name}.mjs`);
const FONT_NOTE =
  '[note] Fonts named but not loaded: ' +
  '"Space Grotesk" (amber, basil, fjord, grove, kelp, lagoon), ' +
  '"JetBrains Mono" (amber, dune, grove, iris, juniper, meadow, nimbus), ' +
  '"Figtree" (cedar, harbor, meadow). Load them in your app (recipe: astryx docs typography).';
const HINT = 'Run with --detail full for the install example and font recipe.';
const OK_LINE =
  /^\[ok\] themes\/([a-z]+)\.css \(\d+(\.\d+)? KB, \d+ token overrides, \d+ component overrides\)$/;

/** @type {string[]} */
const dirs = [];

/** A fresh project holding the fifteen theme sources. */
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-batch-'));
  fs.mkdirSync(path.join(dir, 'themes'));
  NAMES.forEach((name, i) => {
    /** @type {Record<string, string>} */
    const tokens = {
      '--color-bg': `#${[13, 29, 47]
        .map(n => ((i * n) % 256).toString(16).padStart(2, '0'))
        .join('')}`,
      '--font-family-body': BODY_FONTS[i % BODY_FONTS.length],
    };
    if (i % 3 === 0) {
      tokens['--font-family-code'] = '"JetBrains Mono", monospace';
    }
    fs.writeFileSync(
      path.join(dir, 'themes', `${name}.mjs`),
      `export default ${JSON.stringify({name, tokens})};\n`,
    );
  });
  dirs.push(dir);
  return dir;
}

/** @param {string} text @param {string} pattern */
function count(text, pattern) {
  return text.split(pattern).length - 1;
}

/** @param {string} stdout */
function lines(stdout) {
  return bareRecipe(stdout).split('\n').filter(Boolean);
}

/**
 * The font recipe names `docs typography` with the project's CLI invocation,
 * which depends on where the test runs; compare it as bare `astryx`.
 * @param {string} stdout
 */
function bareRecipe(stdout) {
  return stdout.replace(
    /(recipe: |guidance: )\S.*? docs typography/g,
    '$1astryx docs typography',
  );
}

/** @param {string} stdout The sizes follow Core's CSS, so goldens keep the shape. */
function normalized(stdout) {
  return bareRecipe(stdout).replace(/\d+(\.\d+)? KB/g, '<size> KB');
}

/** Bytes of the full report printed by one invocation per theme. */
async function separateFullReports(dir) {
  let bytes = 0;
  for (const file of FILES) {
    const one = await runCli(['--detail', 'full', 'theme', 'build', file], dir);
    expect(one.status).toBe(0);
    expect(one.stdout).toContain('Install in your app');
    bytes += Buffer.byteLength(one.stdout);
  }
  return bytes;
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('theme build report', () => {
  it('prints one line per theme, one font note and a hint by default', async () => {
    const dir = project();
    const batch = await runCli(['theme', 'build', ...FILES], dir);
    expect(batch.status).toBe(0);

    const out = lines(batch.stdout);
    expect(out).toHaveLength(NAMES.length + 3);
    NAMES.forEach((name, i) => {
      expect(out[i]).toMatch(OK_LINE);
      expect(out[i]).toContain(`themes/${name}.css`);
    });
    expect(out.slice(NAMES.length)).toEqual([
      FONT_NOTE,
      HINT,
      '[ok] Built 15 themes.',
    ]);
    expect(batch.stdout).not.toContain('Building theme from');
    expect(batch.stdout).not.toContain('Install in your app');
    expect(batch.stdout).not.toContain('fonts.googleapis.com');
    expect(fs.existsSync(path.join(dir, 'themes', 'orchid.js'))).toBe(true);
    await expect(normalized(batch.stdout)).toMatchFileSnapshot(
      path.join(GOLDEN, 'theme-build-batch.txt'),
    );

    const separate = await separateFullReports(dir);
    expect(Buffer.byteLength(batch.stdout)).toBeLessThan(separate * 0.1);
  }, 300_000);

  it('--detail full prints the install example once and each unloaded font once', async () => {
    const dir = project();
    const batch = await runCli(
      ['--detail', 'full', 'theme', 'build', ...FILES],
      dir,
    );
    expect(batch.status).toBe(0);
    const out = batch.stdout;

    for (const name of NAMES) {
      expect(out).toContain(`Building theme from themes/${name}.mjs...`);
      expect(out).toContain(`[ok] themes/${name}.css\n`);
      expect(out).toContain(
        `  import { ${name}Theme } from './themes/${name}'; import './themes/${name}.css';`,
      );
    }
    expect(count(out, 'Install in your app')).toBe(1);
    expect(count(out, 'Or with a <link> tag:')).toBe(1);
    expect(
      count(out, "import { Theme } from '@astryxdesign/core/theme';"),
    ).toBe(2);
    expect(count(out, '[note]')).toBe(1);
    expect(count(out, 'note: Font')).toBe(0);
    expect(count(out, 'fonts.googleapis.com/css2')).toBe(1);
    expect(out).toContain(
      '  "Space Grotesk" (amber, basil, fjord, grove, kelp, lagoon)\n' +
        '  "JetBrains Mono" (amber, dune, grove, iris, juniper, meadow, nimbus)\n' +
        '  "Figtree" (cedar, harbor, meadow)\n',
    );
    expect(out).toContain(
      'family=Space+Grotesk&family=JetBrains+Mono&family=Figtree&display=swap',
    );
    expect(out).not.toContain(HINT);
    expect(out.trimEnd().endsWith('[ok] Built 15 themes.')).toBe(true);
    await expect(normalized(out)).toMatchFileSnapshot(
      path.join(GOLDEN, 'theme-build-batch-full.txt'),
    );

    const separate = await separateFullReports(dir);
    expect(Buffer.byteLength(out)).toBeLessThan(separate * 0.3);
  }, 300_000);

  it.each(['compact', 'brief'])(
    '--detail %s prints the short report without the hint',
    async detail => {
      const dir = project();
      const r = await runCli(
        ['--detail', detail, 'theme', 'build', ...FILES],
        dir,
      );
      expect(r.status).toBe(0);
      const out = lines(r.stdout);
      expect(out).toHaveLength(NAMES.length + 2);
      NAMES.forEach((_, i) => expect(out[i]).toMatch(OK_LINE));
      expect(out.slice(NAMES.length)).toEqual([
        FONT_NOTE,
        '[ok] Built 15 themes.',
      ]);
    },
    120_000,
  );

  it('prints one line for one theme, and a font note only when fonts are missing', async () => {
    const dir = project();
    const ember = await runCli(
      ['--detail', 'brief', 'theme', 'build', 'themes/ember.mjs'],
      dir,
    );
    expect(ember.status).toBe(0);
    expect(lines(ember.stdout)).toHaveLength(1);
    expect(ember.stdout).toMatch(
      /^\[ok\] themes\/ember\.css \(\d+(\.\d+)? KB, 2 token overrides, 0 component overrides\)\n$/,
    );

    const amber = await runCli(['theme', 'build', 'themes/amber.mjs'], dir);
    expect(amber.status).toBe(0);
    expect(lines(amber.stdout).slice(1)).toEqual([
      '[note] Fonts named but not loaded: "Space Grotesk", "JetBrains Mono". Load them in your app (recipe: astryx docs typography).',
      HINT,
    ]);
  }, 120_000);

  it('--detail full keeps the standalone report for one theme', async () => {
    const dir = project();
    const r = await runCli(
      ['--detail', 'full', 'theme', 'build', 'themes/amber.mjs'],
      dir,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Building theme from themes/amber.mjs...');
    expect(r.stdout).toContain("import { amberTheme } from './themes/amber';");
    expect(r.stdout).toContain('Or with a <link> tag:');
    expect(r.stdout).toContain('note: Font "Space Grotesk"');
    expect(r.stdout).toContain(
      '[note] Theme "amber" names fonts it does not load: "Space Grotesk", "JetBrains Mono"',
    );
    expect(r.stdout).not.toContain('Each built theme imports the same way');
    expect(r.stdout).not.toContain(HINT);
  }, 120_000);

  it('keeps the guidance for themes already written when a batch fails', async () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'themes', 'broken.mjs'),
      'export default {\n',
    );
    const files = ['themes/amber.mjs', 'themes/basil.mjs', 'themes/broken.mjs'];

    const short = await runCli(['theme', 'build', ...files], dir);
    expect(short.status).toBe(1);
    expect(short.stderr).toContain('themes/broken.mjs: ');
    expect(short.stdout).toContain(
      '[note] Fonts named but not loaded: "Space Grotesk" (amber, basil), "JetBrains Mono" (amber).',
    );
    expect(short.stdout).not.toContain('Built 3 themes');

    const full = await runCli(
      ['--detail', 'full', 'theme', 'build', ...files],
      dir,
    );
    expect(full.status).toBe(1);
    expect(count(full.stdout, 'Install in your app')).toBe(1);
    expect(full.stdout).toContain(
      "  import { basilTheme } from './themes/basil'; import './themes/basil.css';",
    );
    expect(full.stdout).toContain('  "Space Grotesk" (amber, basil)\n');
    expect(full.stdout).not.toContain('Built 3 themes');
  }, 120_000);

  it('names the file on each warning in the short report', async () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'themes', 'warny.mjs'),
      `export default ${JSON.stringify({
        name: 'warny',
        tokens: {'--color-bg': '#123456'},
        components: {notAComponent: {base: {color: 'red'}}},
      })};\n`,
    );
    const short = await runCli(
      ['theme', 'build', 'themes/amber.mjs', 'themes/warny.mjs'],
      dir,
    );
    expect(short.status).toBe(0);
    expect(short.stderr).toMatch(
      /\[warn\] themes\/warny\.mjs: Unknown component "notAComponent"/,
    );

    const full = await runCli(
      ['--detail', 'full', 'theme', 'build', 'themes/warny.mjs'],
      dir,
    );
    expect(full.stderr).toContain('  [warn] Unknown component "notAComponent"');
  }, 120_000);

  it('keeps --json and --check the same at every detail level', async () => {
    const dir = project();
    const plain = await runCli(['--json', 'theme', 'build', ...FILES], dir);
    expect(plain.status).toBe(0);
    for (const detail of ['full', 'compact', 'brief']) {
      const r = await runCli(
        ['--json', '--detail', detail, 'theme', 'build', ...FILES],
        dir,
      );
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(JSON.parse(plain.stdout));
    }
    expect(
      JSON.parse(plain.stdout).data.results[0].receipt.data.notices,
    ).toEqual([
      'Font "Space Grotesk" is named by this theme but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)',
      'Font "JetBrains Mono" is named by this theme but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)',
    ]);

    const check = await runCli(['theme', 'build', '--check', ...FILES], dir);
    expect(check.status).toBe(0);
    for (const detail of ['full', 'brief']) {
      const r = await runCli(
        ['--detail', detail, 'theme', 'build', '--check', ...FILES],
        dir,
      );
      expect(r.stdout).toBe(check.stdout);
    }
  }, 180_000);
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme create <name> --traits`: help lists
 * every trait field; an unknown field, a missing --traits and a second
 * name are refused, and nothing is written; it writes, builds, adds and
 * checks a theme, and its exit follows the check. `experimental theme
 * compile` stays the copy of `theme build`, byte for byte, and neither
 * takes --traits.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../../test-utils/base-theme-fixture.mjs';
import {TRAIT_NAMES} from '../../../api/theme-edit/_traits.mjs';

const SOURCE = `export default {
  name: 'ocean',
  tokens: {'--color-accent': ['#0064e0', '#4c9bff'], '--radius-element': '6px'},
  components: {button: {base: {letterSpacing: '0.02em'}}},
};
`;

/** @type {string[]} */
const dirs = [];

/** A fresh folder holding the theme source. */
function sourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-compile-same-'));
  fs.writeFileSync(path.join(dir, 'ocean.mjs'), SOURCE);
  dirs.push(dir);
  return dir;
}

/** @type {string} */
let app;

beforeAll(() => {
  ensureCoreBuilt();
  app = makeLinkedFixture('astryx-compile-cli-', FIXTURE_PACKAGES);
  fs.mkdirSync(path.join(app, 'src'));
  fs.writeFileSync(
    path.join(app, 'src/main.tsx'),
    "import '@astryxdesign/core/astryx.css';\n",
  );
}, 200_000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
  removeLinkedFixture(app);
});

describe('experimental theme compile stays theme build', () => {
  it('writes the same bytes and the same JSON result as theme build', async () => {
    const built = sourceDir();
    const compiled = sourceDir();
    const b = await runCli(['--json', 'theme', 'build', 'ocean.mjs'], built);
    const c = await runCli(
      ['--json', 'experimental', 'theme', 'compile', 'ocean.mjs'],
      compiled,
    );
    expect(b.status).toBe(0);
    expect(c.status).toBe(0);
    for (const file of ['ocean.css', 'ocean.js', 'ocean.d.ts'])
      expect(fs.readFileSync(path.join(compiled, file), 'utf8')).toBe(
        fs.readFileSync(path.join(built, file), 'utf8'),
      );
    expect(JSON.parse(c.stdout)).toEqual(JSON.parse(b.stdout));
  });

  it('prints the same text receipt, in its own words', async () => {
    const b = await runCli(['theme', 'build', 'ocean.mjs'], sourceDir());
    const c = await runCli(
      ['experimental', 'theme', 'compile', 'ocean.mjs'],
      sourceDir(),
    );
    expect(
      c.stdout.replaceAll('experimental theme compile', 'theme build'),
    ).toBe(b.stdout);
  });
});

describe('experimental theme create', () => {
  it('help lists every trait field', async () => {
    const r = await runCli(['experimental', 'theme', 'create', '--help'], app);
    expect(r.status).toBe(0);
    const help = r.stdout.replace(/\s+/g, ' ');
    expect(help).toContain('--traits <json>');
    for (const field of TRAIT_NAMES) expect(help).toContain(`${field}: `);
  });

  it('refuses an unknown field with the list of fields, and writes nothing', async () => {
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'create',
        'brand',
        '--traits',
        '{"accent": "#c2410c", "glow": 1}',
      ],
      app,
    );
    expect(r.status).toBe(1);
    const err = JSON.parse(r.stdout || r.stderr);
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    expect(err.error).toContain(`Traits take: ${TRAIT_NAMES.join(', ')}`);
    expect(fs.existsSync(path.join(app, 'src/themes/brand'))).toBe(false);
  });

  it('refuses a missing --traits and a second name, and writes nothing', async () => {
    const missing = await runCli(
      ['--json', 'experimental', 'theme', 'create', 'brand'],
      app,
    );
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout || missing.stderr).code).toBe(
      'ERR_MISSING_ARGUMENT',
    );
    const two = await runCli(
      ['experimental', 'theme', 'create', 'brand', 'other', '--traits', '{}'],
      app,
    );
    expect(two.status).toBe(1);
    expect(fs.existsSync(path.join(app, 'src/themes/brand'))).toBe(false);
  });

  it('writes, builds, adds and checks a theme', async () => {
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'create',
        'brand',
        '--traits',
        '{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}',
      ],
      app,
    );
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.type).toBe('themeEdit.create');
    expect(out.data).toMatchObject({
      theme: 'brand',
      file: 'src/themes/brand/brandTheme.ts',
      look: 'both',
      built: 'src/themes/brand/brand.css',
    });
    expect(out.data.check.problems).toEqual([]);
  }, 120_000);

  it('prints what it wrote and the check of it', async () => {
    const r = await runCli(
      [
        'experimental',
        'theme',
        'create',
        'texted',
        '--traits',
        '{"accent": "#7c3aed"}',
      ],
      app,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/file: +src\/themes\/texted\/textedTheme\.ts/);
    expect(r.stdout).toMatch(/check texted --fix:/);
    expect(r.stdout).toContain('[ok] nothing broken');
  }, 120_000);

  it('is no option of theme build or experimental theme compile', async () => {
    for (const args of [
      ['theme', 'build', 'brand', '--traits', '{}'],
      ['experimental', 'theme', 'compile', 'brand', '--traits', '{}'],
    ]) {
      const r = await runCli(args, app);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.stderr).toMatch(/unknown option '--traits'/i);
    }
  });
});

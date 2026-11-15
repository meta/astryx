// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text output of `astryx experimental theme editor show` on a theme
 * with a generated color: each color with its seed and one line per token
 * with its shades, the notes one per line, and the generated files last. A
 * string is never split into one character per line.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../../test-utils/base-theme-fixture.mjs';
import {
  themeEditNew,
  themeEditSet,
} from '../../../api/theme-edit/theme-edit.mjs';

/** @type {string} */
let cwd;
/** @type {string} */
let text;
/** @type {any} */
let json;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-show-text-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src', 'app'), {recursive: true});
  // A routes folder has a root layout, which loads Core's stylesheet.
  if (!fs.existsSync(path.join(cwd, 'src/app/layout.tsx')))
    fs.writeFileSync(
      path.join(cwd, 'src/app/layout.tsx'),
      "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
    );
  await themeEditNew('brand', {cwd, like: 'neutral'});
  await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
  const args = ['experimental', 'theme', 'editor', 'show', 'brand'];
  const t = await runCli(args, {cwd});
  expect(t.status).toBe(0);
  text = t.stdout;
  const j = await runCli([...args, '--json'], {cwd});
  json = JSON.parse(j.stdout).data;
}, 180_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('experimental theme editor show text output', () => {
  const flat = () => text.replace(/[ \t]+/g, ' ');

  it('lists each color with its seed, and one line per token with its shades', () => {
    const [color] = json.colors;
    expect(color).toMatchObject({color: 'accent', seed: '#7c3aed'});
    expect(flat()).toContain('colors:\n');
    expect(flat()).toContain('color: accent\nseed: #7c3aed');
    expect(Object.keys(color.tokens).length).toBeGreaterThan(1);
    for (const [token, shades] of Object.entries(color.tokens))
      expect(flat()).toContain(`${token}: ${shades}`);
  });

  it('never splits a string into one character per line', () => {
    expect(text).not.toMatch(/^\s*\d+:\s+\S?\s*$/m);
  });

  it('prints each color note whole', () => {
    for (const note of json.colorNotes) expect(text).toContain(`- ${note}`);
  });

  it('lists the generated files last, each on one line', () => {
    const lines = text.trimEnd().split('\n');
    const tail = lines.slice(-3).map(l => l.replace(/\s+/g, ' '));
    expect(tail).toEqual([
      `config: ${json.colorFiles.config}`,
      `module: ${json.colorFiles.module}`,
      `receipt: ${json.colorFiles.receipt}`,
    ]);
  });

  it('says colors, never palette or family, before the file names', () => {
    const words = text.slice(0, text.indexOf('colorFiles:'));
    expect(words).not.toMatch(/palette|(?<!font-)famil/i);
  });
});

describe('experimental theme editor new with setting flags', () => {
  it('applies every dial flag in one build, with one result', async () => {
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'new',
        'flagged',
        '--like',
        'neutral',
        '--accent',
        '#7c3aed',
        '--corners',
        'round',
        '--text-size',
        'large',
        '--vibrancy',
        '60',
      ],
      {cwd},
    );
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.settings).toEqual([
      'corners = round (whole theme)',
      'accent = #7c3aed (whole theme)',
      'vibrancy = 60 (whole theme)',
      'text-size = large (whole theme)',
    ]);
    const bad = await runCli(
      ['experimental', 'theme', 'editor', 'new', 'nope', '--corners', 'wobbly'],
      {cwd},
    );
    expect(bad.status).toBe(1);
    expect(bad.stderr + bad.stdout).toContain('corners takes');
    expect(fs.existsSync(path.join(cwd, 'themes', 'nope'))).toBe(false);
  }, 120_000);
});

describe('experimental theme editor how --list', () => {
  it('is a switch: the first word is what to list, the rest filters it', async () => {
    const kinds = await runCli(
      ['--json', 'experimental', 'theme', 'editor', 'how', '--list'],
      {cwd},
    );
    expect(JSON.parse(kinds.stdout).data.list).toBe('kinds');
    const tokens = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'how',
        '--list',
        'tokens',
        'accent',
      ],
      {cwd},
    );
    const data = JSON.parse(tokens.stdout).data;
    expect(data.list).toBe('tokens');
    expect(data.subject).toBe('accent');
    expect(
      data.items.every((/** @type {any} */ x) => x.name.includes('accent')),
    ).toBe(true);
  }, 120_000);

  it('reads the built theme without leaving a file in the theme folder', async () => {
    await runCli(['experimental', 'theme', 'editor', 'show', 'brand'], {cwd});
    expect(
      fs
        .readdirSync(path.join(cwd, 'themes', 'brand'))
        .filter(f => /\.load[-.]/.test(f)),
    ).toEqual([]);
  }, 120_000);
});

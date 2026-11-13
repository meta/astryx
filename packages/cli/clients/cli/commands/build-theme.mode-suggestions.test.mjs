// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A build refusal's suggested build keeps the caller's mode: a
 * `--check` stays a check and `--out` stays where it was, for `theme build`
 * and `experimental theme compile`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {buildSuggestion} from '../../../api/theme/build/build.mjs';

/** @type {string} */
let app;
beforeEach(() => {
  app = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mode-')));
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}');
  fs.mkdirSync(path.join(app, 'themes'));
  fs.writeFileSync(
    path.join(app, 'themes', 'a.theme.mjs'),
    "export default { name: 'a', tokens: { '--color-bg': '#000' } };\n",
  );
});
afterEach(() => {
  fs.rmSync(app, {recursive: true, force: true});
});

const COMMANDS = [
  ['theme', 'build'],
  ['experimental', 'theme', 'compile'],
];

describe('a build refusal keeps --check and --out', () => {
  for (const words of COMMANDS)
    it.each([
      ['a Windows-style path', 'themes\\a.theme.mjs'],
      ['a folder', 'themes'],
    ])(`${words.join(' ')} with %s`, async (_, given) => {
      const r = await runCli(
        ['--json', ...words, given, '--check', '--out', 'o.css'],
        {cwd: app},
      );
      expect(r.status).toBe(1);
      const names = JSON.parse(r.stdout).suggestions.map(
        (/** @type {any} */ x) => x.name,
      );
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) {
        expect(n).toContain(` ${words.join(' ')} themes/a.theme.mjs`);
        expect(n).toMatch(/ --check$/);
        expect(n).toContain('--out o.css');
      }
      // Following it checks and writes nothing.
      expect(fs.existsSync(path.join(app, 'o.css'))).toBe(false);
    });
});

describe('a family check refusal keeps --check', () => {
  it('theme build --family with a folder member', async () => {
    fs.writeFileSync(
      path.join(app, 'themes', 'b.theme.mjs'),
      "export default { name: 'b', tokens: { '--color-bg': '#111' } };\n",
    );
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        '--family',
        'themes',
        'themes/b.theme.mjs',
        '--family-key',
        'fam',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const names = JSON.parse(r.stdout).suggestions.map(
      (/** @type {any} */ x) => x.name,
    );
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/ --check$/);
  });
});

describe('buildSuggestion quotes for the shell it runs in', () => {
  it.each(['linux', 'win32'])('%s', platform => {
    const real = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {value: platform});
    try {
      const line = buildSuggestion(
        "themes/Macy's.theme.mjs",
        {check: true, iconsSpecifier: './icons.mjs'},
        app,
      );
      // POSIX: '\'' inside single quotes; PowerShell: the quote doubled.
      expect(line).toContain(
        platform === 'win32'
          ? "'themes/Macy''s.theme.mjs'"
          : "'themes/Macy'\\''s.theme.mjs'",
      );
      expect(line).toMatch(/--icons-specifier \.\/icons\.mjs --check$/);
    } finally {
      if (real) Object.defineProperty(process, 'platform', real);
    }
  });
});

describe('a write build refusal keeps --icons-specifier and quotes the source', () => {
  it.each(['linux', 'win32'])('%s', async platform => {
    const {themeBuild} = await import('../../../api/theme/build/build.mjs');
    fs.writeFileSync(
      path.join(app, "Macy's.theme.mjs"),
      "export default { name: 'macys', tokens: { '--color-bg': '#000' } };\n",
    );
    // A file the build did not write sits where --out points.
    fs.writeFileSync(path.join(app, 'mine.css'), 'body {}\n');
    const real = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {value: platform});
    /** @type {any} */
    let err;
    try {
      await themeBuild(
        "Macy's.theme.mjs",
        {out: 'mine.css', iconsSpecifier: './icons.mjs'},
        {cwd: app},
      );
    } catch (e) {
      err = e;
    } finally {
      if (real) Object.defineProperty(process, 'platform', real);
    }
    const names = (err?.suggestions ?? []).map(
      (/** @type {any} */ x) => x.name,
    );
    expect(names.length, String(err)).toBeGreaterThan(0);
    const source =
      platform === 'win32' ? "'Macy''s.theme.mjs'" : "'Macy'\\''s.theme.mjs'";
    for (const n of names) {
      expect(n).toContain(` theme build ${source}`);
      expect(n).toContain('--icons-specifier ./icons.mjs');
    }
    // One of them drops --out: the outputs beside the source.
    expect(names.some((/** @type {string} */ n) => !n.includes('--out'))).toBe(
      true,
    );
  });
});

describe('the glob and --family refusals keep the mode', () => {
  it('a quoted glob stays unquoted, its flags follow quoted', async () => {
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        'themes/*.mjs',
        '--icons-specifier',
        './icons.mjs',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const [first] = JSON.parse(r.stdout).suggestions;
    expect(first.name).toMatch(
      / theme build themes\/\*\.mjs --icons-specifier \.\/icons\.mjs --check$/,
    );
  });

  it('--family without --family-key keeps --icons-specifier', async () => {
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        '--family',
        'themes/a.theme.mjs',
        '--icons-specifier',
        './icons.mjs',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const [first] = JSON.parse(r.stdout).suggestions;
    expect(first.name).toMatch(/--icons-specifier \.\/icons\.mjs --check$/);
  });

  it('a quoted glob in a family run keeps --family and --family-key', async () => {
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        '--family',
        'themes/*.mjs',
        '--family-key',
        'fam',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const [first] = JSON.parse(r.stdout).suggestions;
    expect(first.name).toMatch(
      / theme build --family themes\/\*\.mjs --family-key fam --check$/,
    );
  });

  it('a quoted glob in a keyless family run names no key and no --out', async () => {
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        '--family',
        'themes/*.mjs',
        '--out',
        'o.css',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const names = JSON.parse(r.stdout)
      .suggestions.map(s => s.name)
      .join('\n');
    expect(names).not.toContain('undefined');
    expect(names).not.toContain('--out');
    expect(names).toMatch(/ theme build --family themes\/\*\.mjs --check$/m);
    expect(fs.existsSync(path.join(app, 'themes', 'undefined.css'))).toBe(
      false,
    );
  });
});

describe('a family build output given as the source', () => {
  it('suggests the family build through buildSuggestion, its flags kept', async () => {
    fs.writeFileSync(
      path.join(app, 'themes', "b's.theme.mjs"),
      "export default { name: 'b', tokens: {} };\n",
    );
    // An output a family build wrote: its header names both sources and
    // the family key.
    fs.writeFileSync(
      path.join(app, 'fam.css'),
      [
        '/*',
        ' * @generated by `astryx theme build`',
        " * Source: themes/a.theme.mjs, themes/b's.theme.mjs",
        " * Command: astryx theme build --family themes/a.theme.mjs themes/b's.theme.mjs --family-key fam",
        ' */',
        '',
      ].join('\n'),
    );
    const r = await runCli(
      [
        '--json',
        'theme',
        'build',
        'fam.css',
        '--icons-specifier',
        './icons.mjs',
        '--check',
      ],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const [first] = JSON.parse(r.stdout).suggestions;
    expect(first.name).toBe(
      buildSuggestion(
        ['themes/a.theme.mjs', "themes/b's.theme.mjs"],
        {iconsSpecifier: './icons.mjs', check: true},
        app,
        undefined,
        {familyKey: 'fam'},
      ),
    );
    expect(first.name).toMatch(
      / theme build --family themes\/a\.theme\.mjs 'themes\/b'\\''s\.theme\.mjs' --family-key fam --icons-specifier \.\/icons\.mjs --check$/,
    );
  });
});

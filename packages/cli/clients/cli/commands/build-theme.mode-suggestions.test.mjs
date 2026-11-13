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

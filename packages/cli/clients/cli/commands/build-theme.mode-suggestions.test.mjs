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

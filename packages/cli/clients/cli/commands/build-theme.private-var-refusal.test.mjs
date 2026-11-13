// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme that sets a private var is refused by `theme build` and
 * `experimental theme compile`: exit 1, nothing written, a JSON error
 * envelope with ERR_THEME_INVALID, never `[ok]` or a success receipt (a
 * --check too).
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** @type {string} */
let app;
beforeEach(() => {
  app = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pv-')));
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}');
  fs.writeFileSync(
    path.join(app, 'pv.theme.mjs'),
    "export default { name: 'pv', tokens: {}, components: { button: { base: { '--_button-radius': '2px' } } } };\n",
  );
});
afterEach(() => {
  fs.rmSync(app, {recursive: true, force: true});
});

const COMMANDS = [
  ['theme', 'build'],
  ['experimental', 'theme', 'compile'],
];

describe('a private var fails the build', () => {
  for (const words of COMMANDS) {
    for (const check of [false, true])
      it(`${words.join(' ')}${check ? ' --check' : ''} --json`, async () => {
        const r = await runCli(
          ['--json', ...words, 'pv.theme.mjs', ...(check ? ['--check'] : [])],
          {cwd: app},
        );
        expect(r.status).toBe(1);
        const env = JSON.parse(r.stdout);
        expect(env.code).toBe('ERR_THEME_INVALID');
        expect(env.error).toContain('--_button-radius');
        expect(env.data).toBeUndefined();
        expect(
          fs
            .readdirSync(app)
            .filter(f => f !== 'pv.theme.mjs' && f !== 'package.json'),
        ).toEqual([]);
      });

    for (const check of [false, true])
      it(`${words.join(' ')}${check ? ' --check' : ''} text`, async () => {
        const r = await runCli(
          [...words, 'pv.theme.mjs', ...(check ? ['--check'] : [])],
          {cwd: app},
        );
        expect(r.status).toBe(1);
        // Text names the refusal; the code rides the --json envelope.
        expect(`${r.stdout}${r.stderr}`).toContain('private var error');
        expect(`${r.stdout}${r.stderr}`).not.toContain('[ok]');
        expect(
          fs
            .readdirSync(app)
            .filter(f => f !== 'pv.theme.mjs' && f !== 'package.json'),
        ).toEqual([]);
      });
  }

  it('a batch names the file once', async () => {
    fs.writeFileSync(
      path.join(app, 'ok.theme.mjs'),
      "export default { name: 'ok', tokens: {} };\n",
    );
    const r = await runCli(['theme', 'build', 'ok.theme.mjs', 'pv.theme.mjs'], {
      cwd: app,
    });
    expect(r.status).toBe(1);
    const text = `${r.stdout}${r.stderr}`;
    expect(text).toContain('pv.theme.mjs: ');
    expect(text).not.toContain('pv.theme.mjs: pv.theme.mjs');
  });
});

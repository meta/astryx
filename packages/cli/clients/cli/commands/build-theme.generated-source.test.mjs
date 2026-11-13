// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build` of a file another command generates (its leading
 * comment carries that command's mark) builds it as any local theme, and a
 * missing file in a folder of such files is called generated, naming that
 * command, never answered with a blank theme template.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

const MARK =
  '// Written by `astryx experimental theme editor` after every build; do not edit it here.\n';

/** @type {string} */
let app;
beforeEach(() => {
  app = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gen-')));
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}');
  fs.mkdirSync(path.join(app, 'src/themes/d'), {recursive: true});
  fs.writeFileSync(
    path.join(app, 'src/themes/d/dTheme.ts'),
    `${MARK}export default { name: 'd', tokens: {} };\n`,
  );
  fs.writeFileSync(
    path.join(app, 'src/themes/d/dTheme.doc.mjs'),
    `${MARK}export default {};\n`,
  );
});
afterEach(() => {
  fs.rmSync(app, {recursive: true, force: true});
});

describe('a generated theme source', () => {
  it('present, is built by theme build as any local theme is', async () => {
    const r = await runCli(
      ['--json', 'theme', 'build', 'src/themes/d/dTheme.ts'],
      {cwd: app},
    );
    expect(r.status, r.stdout).toBe(0);
    expect(fs.existsSync(path.join(app, 'src/themes/d/d.css'))).toBe(true);
  });

  it('missing, in a folder of generated files, is called generated', async () => {
    fs.rmSync(path.join(app, 'src/themes/d/dTheme.ts'));
    const r = await runCli(
      ['--json', 'theme', 'build', 'src/themes/d/dTheme.ts'],
      {cwd: app},
    );
    expect(r.status).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.code).toBe('ERR_FILE_NOT_FOUND');
    expect(env.error).toContain('It is a generated file');
    expect(JSON.stringify(env.suggestions)).not.toContain('theme template');
    expect(env.suggestions[0].name).toMatch(/ experimental theme editor$/);
  });

  it('a theme source of your own still builds', async () => {
    fs.writeFileSync(
      path.join(app, 'own.theme.mjs'),
      "export default { name: 'own', tokens: {} };\n",
    );
    const r = await runCli(['--json', 'theme', 'build', 'own.theme.mjs'], {
      cwd: app,
    });
    expect(r.status, r.stdout).toBe(0);
  });
});

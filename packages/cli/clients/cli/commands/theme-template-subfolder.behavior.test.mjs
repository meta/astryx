// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme template` from a project subfolder: the next step it prints
 * works from that folder, its refusals suggest a template that lands at the
 * project root, and an absolute path is told it is read from the current
 * folder.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {commandInFolder} from '../../../foundation/env/package-manager.mjs';

/** @type {string} */
let root;
/** @type {string} */
let deep;
beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-tpl-sub-')),
  );
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"app"}');
  deep = path.join(root, 'src', 'deep');
  fs.mkdirSync(deep, {recursive: true});
});
afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('theme template from a subfolder', () => {
  it('prints a build step that changes to the project root first', async () => {
    const {status, stdout} = await runCli(['theme', 'template'], {cwd: deep});
    expect(status).toBe(0);
    expect(fs.existsSync(path.join(root, 'theme.template.ts'))).toBe(true);
    // The shared form of "in that folder" (cd … && on POSIX).
    expect(stdout).toContain(commandInFolder('../..', '').replace(/\s*$/, ''));
    expect(stdout).toMatch(/ theme build theme\.template\.ts/);
  });

  it('suggests a template with no path, and says a path is read from here', async () => {
    const blank = await runCli(['--json', 'theme', 'template', ' '], {
      cwd: deep,
    });
    const names = JSON.parse(blank.stdout).suggestions.map(
      (/** @type {any} */ x) => x.name,
    );
    expect(names.join('\n')).toMatch(/ theme template$/m);
    expect(names.join('\n')).not.toMatch(/theme template theme\.template\.ts/);

    const abs = await runCli(
      ['--json', 'theme', 'template', path.join(os.tmpdir(), 'x.ts')],
      {cwd: deep},
    );
    const out = JSON.parse(abs.stdout);
    expect(out.error).not.toContain('relative to the project root');
  });
});

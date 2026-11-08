// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file test-routing.test.ts
 * @position Guards how this app's tests are reached, which has failed twice.
 *
 * The palette-generator suite once belonged to no Vitest project at all: the
 * app carried its own `vitest.config.ts`, the root config's projects did not
 * include `apps/sandbox`, and `pnpm test` — the only thing CI runs — never
 * collected it. Eighteen tests passed nothing and failed nothing for as long
 * as that lasted.
 *
 * Routing it into the root `node` project fixed that and removed the app's
 * config. But removing the app's `test` script broke the other half of the
 * contract: `pnpm --filter @astryxdesign/sandbox test`, the command this
 * page's README gives contributors, exited 0 with no output. A command that
 * silently succeeds while running nothing is worse than one that fails.
 *
 * So both halves are asserted here: the suite is reachable by the documented
 * command, and it is collected once by the root config rather than by a
 * config of this app's own.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function packageJson(): {scripts?: Record<string, string>} {
  return JSON.parse(
    fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'),
  ) as {scripts?: Record<string, string>};
}

describe('sandbox test routing', () => {
  it('keeps a test script, so the documented command runs something', () => {
    // Without this, `pnpm --filter @astryxdesign/sandbox test` exits 0 having
    // run nothing at all — no output, no failure, no tests.
    expect(packageJson().scripts?.test).toBeTruthy();
  });

  it('routes that script at this app, in the root node project', () => {
    // `--root ../..` alone is not enough: a script that reaches the root config
    // but names the wrong path, or omits the project, passes a "forwarding"
    // check while running none of this app's tests. All three parts are the
    // contract — reach the root config, scope it to this app, pick the project
    // whose include list actually collects these files.
    const test = packageJson().scripts?.test ?? '';

    expect(test).toContain('--root ../..');
    expect(test).toContain('apps/sandbox');
    expect(test).toContain('--project node');
  });

  it('has no app-level Vitest config to shadow the root projects', () => {
    const shadowing = fs
      .readdirSync(appDir)
      .filter(entry => /^vitest\.config\.[cm]?[jt]s$/.test(entry));

    expect(shadowing).toEqual([]);
  });

  it('documents a command that matches the script that exists', () => {
    const readme = fs.readFileSync(
      path.join(appDir, 'src/app/(sandbox)/pages/palette-generator/README.md'),
      'utf8',
    );
    // The README wraps prose, so compare on collapsed whitespace rather than
    // on the line breaks a reflow would move.
    const prose = readme.replace(/\s+/g, ' ');

    expect(prose).toContain('pnpm --filter @astryxdesign/sandbox test');
  });
});

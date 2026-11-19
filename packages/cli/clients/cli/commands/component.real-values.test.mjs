// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component <Name> --detail full` names the lookup that gives a part's
 * real values in the project's theme, and the command it prints runs.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../../test-utils/base-theme-fixture.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';

vi.mock('../../../api/theme-edit/_preview.mjs', async importOriginal =>
  (await import('../../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-component-real-values-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 180_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

const LINE =
  /^Real values in your theme \(padding, radius, color, height, size, with each token per mode\): `(.+)`$/m;

describe('the real-values line', () => {
  it.each([
    ['Button', 'button'],
    ['Card', 'card'],
    ['Badge', 'badge'],
  ])(
    '%s --detail full names show --on %s, and that command runs',
    async (name, part) => {
      const run = await runCli(['component', name, '--detail', 'full'], {cwd});
      expect(run.status, run.stderr).toBe(0);
      const printed = run.stdout.match(LINE)?.[1];
      expect(printed).toBe(
        `${getCliInvocation(cwd)} experimental theme editor show <theme> --on ${part}`,
      );
      // The line follows the defineTheme override line.
      expect(run.stdout).toMatch(
        /^Override in defineTheme: .*\n\nReal values/m,
      );
      const args = /** @type {string} */ (printed)
        .slice(getCliInvocation(cwd).length)
        .trim()
        .split(' ')
        .map(a => (a === '<theme>' ? 'neutral' : a));
      const show = await runCli(args, {cwd});
      expect(show.status, show.stderr).toBe(0);
    },
    120_000,
  );

  it.each(['compact', 'brief'])('is not in --detail %s', async detail => {
    const run = await runCli(['component', 'Button', '--detail', detail], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).not.toContain('Real values in your theme');
  });

  it('leaves the JSON unchanged', async () => {
    const base = await runCli(['component', 'Button', '--json'], {cwd});
    const full = await runCli(
      ['component', 'Button', '--detail', 'full', '--json'],
      {cwd},
    );
    expect(base.status, base.stderr).toBe(0);
    expect(full.stdout).toBe(base.stdout);
    expect(base.stdout).not.toContain('Real values');
  });
});

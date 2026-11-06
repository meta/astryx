// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CLI behavior for `astryx theme targets`.
 *
 * The API leaf is covered by api/theme/targets/targets.test.mjs; what is only
 * reachable here is the terminal binding — the table a human reads, the JSON
 * envelope a lint script reads, and the route into component overrides from
 * `theme --help`, which is where the question gets asked.
 */

import {describe, it, expect} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';

describe('astryx theme targets', () => {
  it('prints one greppable line per target, with props and states', async () => {
    const {status, stdout} = await runCli(['theme', 'targets', 'Switch']);

    expect(status).toBe(0);
    // Inline layout: key  component - props - states - className
    expect(stdout).toMatch(
      /^switch\s+Switch - size - checked, disabled - astryx-switch$/m,
    );
    expect(stdout).toMatch(
      /^switch-thumb\s+Switch - size - checked - astryx-switch-thumb$/m,
    );
    expect(stdout).toMatch(/4 across 1 component/);
  });

  it('omits removed aliases from the target list', async () => {
    const {status, stdout} = await runCli(['theme', 'targets', 'Popover']);

    expect(status).toBe(0);
    expect(stdout).toMatch(/^popover\s{2,}Popover/m);
    expect(stdout).not.toContain('popover-surface');
  });

  it('lists the whole surface when unfiltered', async () => {
    const {status, stdout} = await runCli(['theme', 'targets']);

    expect(status).toBe(0);
    const rows = stdout
      .split('\n')
      .filter(l => /^[a-z][a-z0-9-]*\s{2,}/.test(l));
    expect(rows.length).toBeGreaterThan(100);
    expect(stdout).toMatch(/^button\s/m);
    expect(stdout).toMatch(/^switch-thumb\s/m);
  }, 30_000);

  it('returns a theme.targets envelope under --json', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'theme',
      'targets',
      'Switch',
    ]);

    expect(status).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.type).toBe('theme.targets');
    expect(payload.data.targets).toContainEqual({
      key: 'switch-thumb',
      className: 'astryx-switch-thumb',
      component: 'Switch',
      props: ['size'],
      states: ['checked'],
    });
  });

  it('fails a filter that matches nothing', async () => {
    const {status, stderr} = await runCli(['theme', 'targets', 'nosuchthing']);

    expect(status).toBe(1);
    expect(stderr).toMatch(/No theming target matches "nosuchthing"/);
  });

  it('routes a theming question from `theme --help` to component overrides', async () => {
    const {stdout} = await runCli(['theme', '--help']);

    expect(stdout).toMatch(/Component style overrides:/);
    expect(stdout).toMatch(/theme targets/);
    expect(stdout).toMatch(/component <Name>/);
  });
});

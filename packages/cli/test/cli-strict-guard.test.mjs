// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Only `astryx integration check` may fail on a warning
 * (architecture:cli-surface INV32, DEC-4).
 *
 * A command's exit code does not depend on its warnings: a warning is for the
 * reader, and a build that runs the command must not break when a release
 * adds one. `integration check --strict` is the one command a package runs to
 * fail its build on warnings, and the CLI surface spec admits it by name.
 * Two lists, read from the live CLI, keep it the only one:
 * - every command that offers `--strict`, from the options each command
 *   parses (so an option missing from its CommandDoc still counts);
 * - every command whose documented exit codes make a warning fail it: a
 *   non-zero exit code whose condition names a warning, unless it says the
 *   warning does not change the exit code.
 * Both must be exactly `integration check`. A new entry fails here until the
 * spec admits it.
 */

import {describe, expect, it} from 'vitest';
import {JSON_SUPPORTED, program} from '../clients/cli/index.mjs';
import {buildManifest} from '../clients/cli/lib/manifest.mjs';

/** The commands the CLI surface spec allows to fail on a warning. */
const ALLOWED = ['integration check'];

const manifest = buildManifest(program, {
  jsonSupported: JSON_SUPPORTED,
  version: '0.0.0-test',
});

/** @type {any[]} */
const commands = [];
const walk = (/** @type {any} */ command) => {
  commands.push(command);
  (command.subcommands ?? []).forEach(walk);
};
manifest.commands.forEach(walk);

/**
 * Whether an exit-code condition makes a warning fail the command.
 * @param {string} when
 */
function failsOnWarning(when) {
  return (
    /\bwarn/i.test(when) &&
    !/\b(?:does not|doesn't|never)\s+(?:change|affect)\b[^.]*\bexit code\b/i.test(
      when,
    ) &&
    !/\bwarnings?\s+(?:are|is)\s+allowed\b/i.test(when)
  );
}

describe('only integration check fails on warnings', () => {
  it('reads every command', () => {
    expect(commands.length).toBeGreaterThan(30);
  });

  it('is the only command that offers --strict', () => {
    const strict = commands
      .filter(command =>
        (command.options ?? []).some(
          (/** @type {any} */ option) =>
            /(?:^|[\s,])--strict\b/.test(
              String(option.flags ?? option.flag ?? ''),
            ) || option.long === '--strict',
        ),
      )
      .map(command => command.name)
      .sort();
    expect(
      strict,
      'A new --strict needs the CLI surface spec to admit it first.',
    ).toEqual(ALLOWED);
  });

  it('is the only command whose exit code depends on a warning', () => {
    const onWarning = commands
      .filter(command =>
        (command.exitCodes ?? []).some(
          (/** @type {{code: number, when: string}} */ exit) =>
            exit.code !== 0 && failsOnWarning(exit.when),
        ),
      )
      .map(command => command.name)
      .sort();
    expect(
      onWarning,
      'A command that fails on a warning needs the CLI surface spec to admit it first.',
    ).toEqual(ALLOWED);
  });

  it('does not count a mode that exists to detect a condition, which reports it as an error', () => {
    // `theme build --check` fails on stale outputs, and the deprecated
    // `integration pack --check` on an incomplete tarball: errors their own
    // mode exists to detect, not warnings.
    const names = commands.map(command => command.name);
    expect(names).toEqual(
      expect.arrayContaining(['theme build', 'integration pack']),
    );
    for (const name of ['theme build', 'integration pack']) {
      const command = commands.find(each => each.name === name);
      expect(
        (command.exitCodes ?? []).some(
          (/** @type {{code: number, when: string}} */ exit) =>
            exit.code !== 0 && failsOnWarning(exit.when),
        ),
        name,
      ).toBe(false);
    }
  });

  it('tells a condition that fails on a warning from one that does not', () => {
    expect(
      failsOnWarning(
        'with --strict, also any warning, or a check that did not run',
      ),
    ).toBe(true);
    expect(
      failsOnWarning(
        'a doc is invalid. A link that names no doc is a warning, and does not change the exit code',
      ),
    ).toBe(false);
    expect(
      failsOnWarning('no error-severity issues (warnings are allowed)'),
    ).toBe(false);
    expect(failsOnWarning('the tarball is incomplete or invalid')).toBe(false);
  });
});

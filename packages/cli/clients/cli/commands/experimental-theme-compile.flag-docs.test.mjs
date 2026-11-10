// Copyright (c) Meta Platforms, Inc. and affiliates.

// The same assertions as build-theme.flag-docs.test.mjs, run against the experimental copy of the command
// (`astryx experimental theme`, where `theme build` is called `compile`).

/**
 * @file Every `experimental theme compile` flag interaction is discoverable.
 *
 * Each combination the command refuses is refused before any work, and the
 * refusal is named in the machine-readable manifest's description of at least
 * one of the flags involved. Flags that fill in a value when omitted state
 * their default there too.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/** @type {string} */
let dir;
/** @type {Map<string, string>} flag token -> manifest description */
let descriptions;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-flag-docs-'));
  // Refusals happen before a theme loads; the files only need to exist.
  for (const name of ['a.mjs', 'b.mjs']) {
    fs.writeFileSync(path.join(dir, name), 'export default {};\n');
  }

  const manifest = JSON.parse(
    (await runCli(['--json', 'manifest'], dir)).stdout,
  ).data;
  const experimental = manifest.commands.find(
    command => command.name === 'experimental',
  );
  const theme = experimental.subcommands.find(
    command => command.name === 'experimental theme',
  );
  const build = theme.subcommands.find(
    command => command.name === 'experimental theme compile',
  );
  descriptions = new Map(
    build.options.map(option => [
      /** @type {string} */ (option.flag.match(/--[a-z-]+/)?.[0]),
      option.description,
    ]),
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} flag */
function description(flag) {
  const text = descriptions.get(flag);
  expect(text, `manifest has no ${flag} option`).toBeDefined();
  return /** @type {string} */ (text);
}

/**
 * Whether `a`'s description names `b`, or `b`'s names `a`. `b` may also be a
 * pattern for a condition that is not a flag.
 * @param {string} a
 * @param {string | RegExp} b
 */
function documented(a, b) {
  const partner = typeof b === 'string' ? new RegExp(`${b}\\b`) : b;
  if (partner.test(description(a))) return true;
  return (
    typeof b === 'string' &&
    descriptions.has(b) &&
    new RegExp(`${a}\\b`).test(description(b))
  );
}

const REFUSED = [
  {
    pair: ['--family', '--out'],
    args: ['--family', 'a.mjs', 'b.mjs', '--family-key', 'k', '--out', 'x.css'],
  },
  {
    pair: ['--family', '--watch'],
    args: ['--family', 'a.mjs', 'b.mjs', '--family-key', 'k', '--watch'],
  },
  {pair: ['--family', '--family-key'], args: ['--family', 'a.mjs', 'b.mjs']},
  {pair: ['--family-key', '--family'], args: ['a.mjs', '--family-key', 'k']},
  {pair: ['--check', '--watch'], args: ['a.mjs', '--check', '--watch']},
  {
    pair: ['--out', /several|more than one|single theme|one theme/i],
    args: ['a.mjs', 'b.mjs', '--out', 'x.css'],
  },
  {pair: ['--watch', '--json'], args: ['a.mjs', '--watch']},
];

describe('experimental theme compile flag interactions are documented', () => {
  for (const {pair, args} of REFUSED) {
    const [a, b] = pair;
    it(`${a} with ${String(b)} is refused and documented`, async () => {
      const result = await runCli(
        ['--json', 'experimental', 'theme', 'compile', ...args],
        dir,
      );

      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout).code).toBe(
        ERROR_CODES.ERR_THEME_INVALID,
      );
      expect(documented(a, b)).toBe(true);
    });
  }

  it('flags that fill in an omitted value state their default', () => {
    expect(description('--out')).toMatch(/default/i);
    expect(description('--icons-specifier')).toMatch(/default/i);
  });
});

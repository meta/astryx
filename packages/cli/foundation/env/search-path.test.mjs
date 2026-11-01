// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reading the `astryx` commands on the search path (spec AST-081
 * FR11): links, and each package manager's shim, down to the CLI package and
 * its version.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {astryxCommandsOnSearchPath, astryxCliRootOf} from './search-path.mjs';
import {
  cleanupFixtures,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

/**
 * A CLI package at `dir`, with or without the hand-off.
 * @param {string} dir
 * @param {string} version
 * @param {boolean} [handsOff]
 */
function cliPackage(dir, version, handsOff = false) {
  writeJson(path.join(dir, 'package.json'), {
    name: '@astryxdesign/cli',
    version,
  });
  if (handsOff) {
    fs.mkdirSync(path.join(dir, 'foundation', 'release'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'foundation', 'release', 'choose.mjs'), '');
  }
  return dir;
}

/**
 * An executable shim at `file` with `text`.
 * @param {string} file
 * @param {string} text
 */
function shim(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o755);
  return file;
}

describe.skipIf(process.platform === 'win32')('astryxCliRootOf', () => {
  it('reads a pnpm 10 shim ($basedir)', () => {
    const home = tempDir('pnpm');
    const pkg = cliPackage(
      path.join(home, 'global', '5', 'node_modules', '@astryxdesign', 'cli'),
      '0.6.8',
    );
    const bin = shim(
      path.join(home, 'astryx'),
      '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node "$basedir/global/5/node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs" "$@"\n',
    );
    expect(astryxCliRootOf(bin)).toBe(pkg);
  });

  it('reads a pnpm 12 shim ($basedir_abs, a folder above the shim)', () => {
    const home = tempDir('pnpm12');
    const pkg = cliPackage(
      path.join(
        home,
        'global',
        'v11',
        '3f2a',
        'node_modules',
        '@astryxdesign',
        'cli',
      ),
      '0.6.8',
    );
    const bin = shim(
      path.join(home, 'bin', 'astryx'),
      [
        '#!/bin/sh',
        'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
        'basedir_abs=$(cd "$basedir" && pwd)',
        'exec node "$basedir_abs/../global/v11/3f2a/node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs" "$@"',
        '',
      ].join('\n'),
    );
    expect(astryxCliRootOf(bin)).toBe(pkg);
    const [row] = astryxCommandsOnSearchPath({
      searchPath: path.dirname(bin),
      platform: 'linux',
    });
    expect(row).toEqual({
      file: bin,
      astryx: true,
      cliRoot: pkg,
      version: '0.6.8',
      handsOff: false,
    });
  });

  it('reads a cmd-shim-target comment with an absolute target', () => {
    const elsewhere = tempDir('target');
    const pkg = cliPackage(
      path.join(elsewhere, 'node_modules', '@astryxdesign', 'cli'),
      '0.8.0',
      true,
    );
    const bin = shim(
      path.join(tempDir('bin'), 'astryx'),
      `#!/bin/sh\n# cmd-shim-target=${path.join(pkg, 'clients', 'cli', 'bin', 'astryx.mjs')}\nexec node "$TARGET" "$@"\n`,
    );
    expect(astryxCliRootOf(bin)).toBe(pkg);
    expect(
      astryxCommandsOnSearchPath({
        searchPath: path.dirname(bin),
        platform: 'linux',
      })[0],
    ).toMatchObject({version: '0.8.0', handsOff: true});
  });
});

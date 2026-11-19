// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` from a folder inside a project: a `--path` you type
 * is read from that folder, however you spell it, and without `--path` the
 * upgrade scans the project's own src. The option's default must not read as
 * a typed `./src`. The `--json` result names files relative to the folder the
 * command ran in.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** Core 0.7.0 renamed this prop; its codemod renames it on Typeahead. */
const OLD_PROP_SOURCE =
  "import {Typeahead} from '@astryxdesign/core';\n" +
  'export const App = () => <Typeahead label="Fruit" emptySearchResultsText="None" />;\n';

let root;

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

/** @param {string} rel */
const renamed = rel =>
  fs
    .readFileSync(path.join(root, rel), 'utf-8')
    .includes('emptySearchText="None"');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-subfolder-'));
  write(
    'package.json',
    JSON.stringify({
      name: 'app',
      private: true,
      dependencies: {'@astryxdesign/core': '0.7.0'},
    }),
  );
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: '0.7.0'}),
  );
  write('src/App.tsx', OLD_PROP_SOURCE);
  // A folder inside the project with source of its own and no package.json.
  write('frontend/src/App.tsx', OLD_PROP_SOURCE);
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/** @param {string[]} args @param {string} [folder] */
async function upgradeFrom(args, folder = 'frontend') {
  const r = await runCli(
    ['upgrade', '--from', '0.6.8', ...args, '--apply', '--json'],
    {
      cwd: path.join(root, folder),
    },
  );
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout);
}

describe('upgrade --path from a folder inside the project', () => {
  it.each([['./src'], ['src'], ['src/'], ['./src/']])(
    'reads --path %s from the folder you ran in',
    async spelling => {
      const result = await upgradeFrom(['--path', spelling]);

      expect(result.data.modifiedFiles).toEqual(['src/App.tsx']);
      expect(renamed('frontend/src/App.tsx')).toBe(true);
      expect(renamed('src/App.tsx')).toBe(false);
    },
  );

  it("scans the project's src without --path", async () => {
    const result = await upgradeFrom([]);

    expect(result.data.modifiedFiles).toEqual(['../src/App.tsx']);
    expect(renamed('src/App.tsx')).toBe(true);
    expect(renamed('frontend/src/App.tsx')).toBe(false);
  });

  it('names files from the project root when run there', async () => {
    const result = await upgradeFrom([], '.');

    expect(result.data.modifiedFiles).toEqual(['src/App.tsx']);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every `astryx docs <route> [section]` an icon-set error, hint, or
 * receipt names resolves (spec:AST-084): the icon-set commands, discovery,
 * checks, writer, and template mapping point at docs that exist, so a moved
 * guide cannot leave a dead pointer in a message.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

const CLI_BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');

/** The icon-set sources whose text names docs routes. */
const SOURCES = [
  'api/icon',
  'clients/cli/commands/experimental',
  'foundation/discovery/icon-set-discovery.mjs',
  'foundation/discovery/icon-set-writer.mjs',
  'foundation/discovery/icon-set-checks.mjs',
  'foundation/discovery/icon-definition-discovery.mjs',
  'foundation/discovery/template-icons.mjs',
];

/** @param {string} entry @returns {string[]} */
function files(entry) {
  const full = path.join(CLI_ROOT, entry);
  if (!fs.statSync(full).isDirectory()) return [full];
  return fs
    .readdirSync(full, {recursive: true, encoding: 'utf8'})
    .filter(name => name.endsWith('.mjs') && !name.includes('.test.'))
    .map(name => path.join(full, name));
}

describe('icon-set docs pointers', () => {
  it('every `astryx docs` route and section an icon-set message names resolves', () => {
    /** @type {Set<string>} */
    const pointers = new Set();
    for (const file of SOURCES.flatMap(files)) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const match of text.matchAll(
        /astryx docs ([a-z][\w/-]*)(?: ([a-z][\w-]*)(?=[)`'.]))?/gu,
      )) {
        pointers.add(match[2] ? `${match[1]} ${match[2]}` : match[1]);
      }
    }
    expect(pointers.size).toBeGreaterThan(0);
    for (const pointer of pointers) {
      const run = spawnSync(
        process.execPath,
        [CLI_BIN, 'docs', ...pointer.split(' '), '--json'],
        {cwd: CLI_ROOT, encoding: 'utf8'},
      );
      expect(run.status, `astryx docs ${pointer}: ${run.stderr}`).toBe(0);
    }
  }, 60_000);
});

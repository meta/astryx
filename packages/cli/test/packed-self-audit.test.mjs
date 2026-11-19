// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package's `doctor` reuses the audit of the CLI's own
 * authoring docs that `prepack` stores: the package script writes it, the
 * packed tarball ships it, and the CLI run from that tarball answers the
 * check without parsing the authoring sources.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  cliTarball,
  extractTarball,
  tarballFiles,
} from '../test-utils/global-local-fixtures.mjs';

const STORE = 'assets/self-audit.generated.json';

/** @type {string} */
let work;
/** @type {string} */
let packed;
/**
 * A project of no CLI of its own, where each CLI answers itself: inside a
 * project with its own CLI (such as apps/sandbox), a run hands off to that
 * copy.
 * @type {string}
 */
let outside;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-self-audit-'));
  // The run's packed CLI unpacked as an install holds it: the audit reads the
  // package's own package.json, which a placed copy rewrites.
  packed = path.join(work, 'package');
  extractTarball(cliTarball(), packed);
  fs.symlinkSync(
    path.join(CLI_ROOT, 'node_modules'),
    path.join(packed, 'node_modules'),
    'dir',
  );
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-self-audit-run-'));
  fs.writeFileSync(
    path.join(outside, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  fs.mkdirSync(path.join(outside, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.resolve(CLI_ROOT, '..', 'core'),
    path.join(outside, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
}, 120_000);

afterAll(() => {
  if (work) fs.rmSync(work, {recursive: true, force: true});
  if (outside) fs.rmSync(outside, {recursive: true, force: true});
});

/**
 * Run a CLI's `doctor`, counting the authoring sources its surface audit
 * parses.
 * @param {string} cliRoot
 * @returns {{check: unknown, parses: number}}
 */
function doctorAuthoringCheck(cliRoot) {
  const counter = path.join(work, `parses-${path.basename(cliRoot)}.txt`);
  // Counts the parses the authoring-surface audit makes: jscodeshift parses
  // each authoring source with its own @babel/parser, required.
  const preload = path.join(work, 'count-parses.cjs');
  fs.writeFileSync(
    preload,
    `const fs = require('node:fs');
const Module = require('node:module');
const load = Module._load;
const wrapped = new WeakSet();
Module._load = function (request, ...rest) {
  const loaded = load.call(this, request, ...rest);
  if (request === '@babel/parser' && !wrapped.has(loaded)) {
    wrapped.add(loaded);
    const parse = loaded.parse;
    loaded.parse = function (...args) {
      if (new Error().stack.includes('authoring-surface.mjs')) fs.appendFileSync(process.env.COUNT_TO, '.');
      return parse.apply(this, args);
    };
  }
  return loaded;
};
`,
  );
  fs.writeFileSync(counter, '');
  const run = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
      'doctor',
      '--json',
    ],
    {
      cwd: outside,
      encoding: 'utf8',
      env: {...process.env, COUNT_TO: counter, NO_UPDATE_NOTIFIER: '1'},
    },
  );
  const out = JSON.parse(run.stdout);
  // The copy run answered, not one it handed off to.
  expect(out.meta.answeredBy.copy).not.toBe('project');
  return {
    check: out.data.checks.find(
      (/** @type {{id: string}} */ c) => c.id === 'authoring-docs',
    ),
    parses: fs.readFileSync(counter, 'utf8').length,
  };
}

describe('the packed package', () => {
  it('writes the audit in prepack and removes it after packing', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain('scripts/generate-self-audit.mjs');
    expect(pkg.scripts.postpack).toContain(
      'node scripts/generate-self-audit.mjs --clean',
    );
  });

  it('ships the audit', () => {
    expect(tarballFiles(cliTarball())).toContain(STORE);
  });

  it('still answers from the audit after a packer adds files and rewrites package.json', () => {
    // As pnpm publishes it: a LICENSE beside package.json, `catalog:` ranges
    // resolved, lifecycle scripts dropped.
    const copy = path.join(work, 'pnpm-packed');
    fs.cpSync(packed, copy, {
      recursive: true,
      filter: source => path.basename(source) !== 'node_modules',
    });
    fs.symlinkSync(
      path.join(CLI_ROOT, 'node_modules'),
      path.join(copy, 'node_modules'),
      'dir',
    );
    fs.writeFileSync(path.join(copy, 'LICENSE'), 'MIT\n');
    const pkgFile = path.join(copy, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    delete pkg.scripts.prepack;
    delete pkg.scripts.postpack;
    pkg.dependencies = {...pkg.dependencies, 'left-pad': '^1.3.0'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
    const fromCopy = doctorAuthoringCheck(copy);
    expect(fromCopy.parses).toBe(0);
    expect(fromCopy.check).toEqual(doctorAuthoringCheck(CLI_ROOT).check);
  });

  it('answers the authoring-docs check without parsing, the same way', () => {
    const fromTarball = doctorAuthoringCheck(packed);
    const fromCheckout = doctorAuthoringCheck(CLI_ROOT);
    expect(fromCheckout.parses).toBeGreaterThan(0);
    expect(fromTarball.parses).toBe(0);
    expect(fromTarball.check).toEqual(fromCheckout.check);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `icon-sets` check (AST-084 FR17).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {checkIconSets, runChecks} from './doctor.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doctor-icons-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Parameters<typeof writeIconSetProject>[1]} options */
async function iconCheckOf(options) {
  const cwd = writeIconSetProject(tmp, options);
  // A project declares Core, so doctor checks the project, not the computer.
  const pkgFile = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  const report = await runChecks({cwd});
  return report.checks.find(check => check.id === 'icon-sets');
}

describe('icon-sets check', () => {
  it('a project without experimental.iconSet has no check, sets installed or not', async () => {
    // Icon sets are experimental (spec:AST-017 FR27): the report is unchanged
    // until the project opts in.
    expect(await iconCheckOf({packages: []})).toBeUndefined();
    expect(await iconCheckOf({})).toBeUndefined();
    expect(
      await iconCheckOf({packages: [{}, {name: '@acme/lines'}]}),
    ).toBeUndefined();
  });

  it('the configured set installed passes', async () => {
    const check = await iconCheckOf({
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toMatch(/experimental.iconSet names "glyphs"/);
  });

  it('experimental.iconSet that two packages ship warns, naming the qualified form', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', set: 'glyphs'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.fix).toMatch(/experimental.iconSet/);
  });

  it('experimental.iconSet naming a set that is not installed fails', async () => {
    expect(
      await iconCheckOf({config: {experimental: {iconSet: 'nope'}}}),
    ).toMatchObject({
      status: 'fail',
    });
  });

  it('experimental.iconSet naming an installed set that was withdrawn fails, saying withdrawn and why', async () => {
    const invalid = await iconCheckOf({
      packages: [{data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(invalid).toMatchObject({status: 'fail'});
    expect(invalid?.message).toMatch(
      /names "glyphs", which is installed but withdrawn: .*not valid JSON/,
    );
    expect(invalid?.message).not.toMatch(/no installed set has that name/);
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp);
    const unresolved = await iconCheckOf({
      packages: [{data: {...glyphsData(), module: '@acme/not-installed'}}],
      config: {experimental: {iconSet: '@acme/glyphs/glyphs'}},
    });
    expect(unresolved).toMatchObject({status: 'fail'});
    expect(unresolved?.message).toMatch(
      /installed but withdrawn: .*does not resolve from the project/,
    );
  });

  it('an invalid data file warns with the reason', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toMatch(/not valid JSON/);
  });

  it('has no check when the project could not be read', () => {
    const check = checkIconSets(
      /** @type {any} */ ({cwd: tmp, iconSets: null, projectError: 'boom'}),
    );
    expect(check).toBeNull();
  });
});

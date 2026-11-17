// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor scans the project's source for the placeholder icon only when
 * the `icon-placeholders` check can run: icon features are on and a main set
 * is decided. With no icon-set package, or two and no `experimental.iconSet`,
 * there is no check and no scan.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';

const scans = vi.hoisted(() => ({count: 0}));

vi.mock('./_adapter.mjs', async importOriginal => {
  const actual = /** @type {Record<string, any>} */ (await importOriginal());
  return {
    ...actual,
    /** @param {string} dir */
    findIconPlaceholders: dir => {
      scans.count += 1;
      return actual.findIconPlaceholders(dir);
    },
  };
});

const {placeholderMainSet, runChecks} = await import('./doctor.mjs');

const SLOW = 60_000;

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-placeholder-scan-'));
  scans.count = 0;
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * Doctor's placeholder check in a project with these icon packages, and how
 * many times it scanned the source.
 * @param {Array<Record<string, unknown>>} packages
 */
async function placeholderRun(packages) {
  const cwd = writeIconSetProject(tmp, {packages});
  // An app: doctor reads icon facts for a project that depends on Core.
  const pkgFile = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  const report = await runChecks({cwd});
  return {
    check: report.checks.find(check => check.id === 'icon-placeholders'),
    scans: scans.count,
  };
}

describe('the placeholder scan', () => {
  it(
    'no icon-set package: no check and no scan',
    async () => {
      expect(await placeholderRun([])).toEqual({check: undefined, scans: 0});
    },
    SLOW,
  );

  it(
    'two icon-set packages and no experimental.iconSet: no check and no scan',
    async () => {
      expect(await placeholderRun([{}, {name: '@acme/lines'}])).toEqual({
        check: undefined,
        scans: 0,
      });
    },
    SLOW,
  );

  it(
    'one icon-set package: the check runs on one scan',
    async () => {
      const {check, scans: count} = await placeholderRun([{}]);
      expect(check).toMatchObject({status: 'pass'});
      expect(count).toBe(1);
    },
    SLOW,
  );

  it('the main set is the configured one, else the only installed set', () => {
    const set = {name: 'glyphs', package: '@acme/glyphs'};
    expect(placeholderMainSet(null)).toBeNull();
    expect(
      placeholderMainSet(
        /** @type {any} */ ({choice: {status: 'ambiguous', reason: ''}}),
      ),
    ).toBeNull();
    expect(
      placeholderMainSet(
        /** @type {any} */ ({choice: {status: 'selected', set, reason: ''}}),
      ),
    ).toBe('glyphs');
    expect(
      placeholderMainSet(
        /** @type {any} */ ({
          choice: {status: 'missing', configured: 'outline', reason: ''},
        }),
      ),
    ).toBe('outline');
  });
});

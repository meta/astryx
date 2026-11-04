// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental icon` end to end (AST-084 FR6, FR7): text and JSON, exit
 * codes, and the envelope package, driving the real program in-process.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-cli-'));
  cwd = writeIconSetProject(tmp);
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

describe('astryx experimental icon', () => {
  it('prints ranked matches with import lines; every word is the query', async () => {
    const res = await runCli(['experimental', 'icon', 'delete'], cwd);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Icons for "delete" (1)');
    expect(res.stdout).toMatch(
      /import: +import \{TrashIcon\} from '@acme\/glyphs';/,
    );
    expect(res.stdout).toMatch(/package: +@acme\/glyphs/);
    expect(res.stdout).toMatch(/variant: +solid \(TrashSolidIcon\)/);
    const many = await runCli(
      ['experimental', 'icon', 'magni', 'fier', '--json'],
      cwd,
    );
    expect(JSON.parse(many.stdout).data.query).toBe('magni fier');
  });

  it('answers icon.search, icon.detail, and icon.list as JSON', async () => {
    const search = JSON.parse(
      (await runCli(['experimental', 'icon', 'close', '--json'], cwd)).stdout,
    );
    expect(search).toMatchObject({type: 'icon.search', data: {matchCount: 1}});
    const detail = JSON.parse(
      (await runCli(['experimental', 'icon', 'glyphs/x', '--json'], cwd))
        .stdout,
    );
    expect(Object.keys(detail).slice(0, 3)).toEqual([
      'apiVersion',
      'type',
      'package',
    ]);
    expect(detail).toMatchObject({
      type: 'icon.detail',
      package: '@acme/glyphs',
    });
    const list = JSON.parse(
      (await runCli(['experimental', 'icon', '--list', '--json'], cwd)).stdout,
    );
    expect(list).toMatchObject({type: 'icon.list', data: {status: 'selected'}});
  });

  it('exits 1 with ERR_NOT_FOUND for an unknown icon, the same way in text and JSON', async () => {
    const text = await runCli(['experimental', 'icon', 'glyphs/nope'], cwd);
    const json = await runCli(
      ['experimental', 'icon', 'glyphs/nope', '--json'],
      cwd,
    );
    expect(text.code).toBe(1);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout).code).toBe('ERR_NOT_FOUND');
  });

  it('no match exits 0 and points at the set list', async () => {
    const res = await runCli(['experimental', 'icon', 'zebra'], cwd);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('No icons match "zebra".');
    expect(res.stdout).toContain('icon --list');
  });

  it('lists the sets in text, with the withdrawn ones', async () => {
    const broken = writeIconSetProject(path.join(tmp, 'b'), {
      packages: [{}, {name: '@acme/lines', data: '{nope'}],
    });
    const res = await runCli(['experimental', 'icon', '--list'], broken);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('name:        glyphs');
    expect(res.stdout).toContain('Withdrawn');
    expect(res.stdout).toContain('@acme/lines/lines');
  });
});

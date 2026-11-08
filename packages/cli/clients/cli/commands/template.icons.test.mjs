// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Copied and printed templates follow the project's icon set
 * (AST-084 FR9, FR10): the JSON and the copy receipt report every icon,
 * and printed source keeps stdout to the source with the report on stderr.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-icons-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

// ai-chat imports XMarkIcon (the close definition) and icons the fixture set lacks.
const TEMPLATE = 'ai-chat';

describe('template icon mapping', () => {
  it('printed source maps icons; the report goes to stderr', async () => {
    const cwd = writeIconSetProject(tmp, {
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const res = await runCli(['template', TEMPLATE], cwd);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("import {XIcon} from '@acme/glyphs';");
    expect(res.stdout).not.toMatch(/\bXMarkIcon\b/);
    expect(res.stdout).not.toContain('icons: ');
    expect(res.stderr).toContain(
      'icons: mapped XMarkIcon (@heroicons/react/24/outline) -> XIcon (@acme/glyphs) by definition',
    );
    expect(res.stderr).toMatch(
      /icons: kept \w+ \(@heroicons\/react\/24\/outline\)/,
    );
  });

  it('the JSON and the copy receipt report mapped and kept icons; kept libraries stay needed', async () => {
    const cwd = writeIconSetProject(tmp, {
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const shown = JSON.parse(
      (await runCli(['template', TEMPLATE, '--json'], cwd)).stdout,
    );
    expect(shown.data.icons).toMatchObject({
      status: 'selected',
      set: '@acme/glyphs/glyphs',
    });
    const copied = JSON.parse(
      (await runCli(['template', TEMPLATE, './out', '--json'], cwd)).stdout,
    );
    expect(copied.data.icons).toEqual(shown.data.icons);
    expect(copied.data.icons.mapped[0]).toMatchObject({
      source: {module: '@heroicons/react/24/outline', export: 'XMarkIcon'},
      target: {set: 'glyphs', id: 'x', export: 'XIcon'},
      by: 'definition',
    });
    expect(copied.data.icons.kept.length).toBeGreaterThan(0);
    expect(copied.data.missingPackages).toContain('@heroicons/react');
    const written = fs.readFileSync(path.join(cwd, 'out', 'page.tsx'), 'utf-8');
    expect(written).toBe(shown.data.source);
  });

  it('experimental.iconSet that two packages ship: source unchanged, status ambiguous', async () => {
    // A name both packages ship names no set.
    const cwd = writeIconSetProject(tmp, {
      packages: [{}, {name: '@acme/lines', set: 'glyphs'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const res = await runCli(['template', TEMPLATE, '--json'], cwd);
    const data = JSON.parse(res.stdout).data;
    expect(data.icons).toMatchObject({
      status: 'ambiguous',
      mapped: [],
      kept: [],
    });
    expect(data.source).toMatch(/\bXMarkIcon\b/);
    const text = await runCli(['template', TEMPLATE], cwd);
    expect(text.stderr).toContain('icons: unchanged (ambiguous)');
  });

  it('a set installed but experimental.iconSet not set: no report, and the output it always had', async () => {
    // Icon sets are experimental (spec:AST-017 FR27): nothing changes
    // until the project opts in.
    const cwd = writeIconSetProject(path.join(tmp, 'none'));
    const res = await runCli(['template', TEMPLATE, '--json'], cwd);
    const data = JSON.parse(res.stdout).data;
    expect(data).not.toHaveProperty('icons');
    expect(data.source).toMatch(/\bXMarkIcon\b/);
    const text = await runCli(['template', TEMPLATE], cwd);
    expect(text.stderr).not.toContain('icons:');
    const copied = await runCli(['template', TEMPLATE, 'out', '--json'], cwd);
    expect(JSON.parse(copied.stdout).data).not.toHaveProperty('icons');
    const copiedText = await runCli(['template', TEMPLATE, 'out2'], cwd);
    expect(`${copiedText.stdout}${copiedText.stderr}`).not.toContain('icons:');
  });

  it('a configured set that is installed but withdrawn says so, with why, and maps nothing', async () => {
    const cwd = writeIconSetProject(path.join(tmp, 'withdrawn'), {
      packages: [{data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const res = await runCli(['template', TEMPLATE, '--json'], cwd);
    const icons = JSON.parse(res.stdout).data.icons;
    expect(icons).toMatchObject({status: 'withdrawn', set: null, mapped: []});
    expect(icons.reason).toMatch(
      /names "glyphs", which is installed but withdrawn: .*not valid JSON/,
    );
    const text = await runCli(['template', TEMPLATE], cwd);
    expect(text.stderr).toContain('icons: unchanged (withdrawn):');
  });

  it('a configured set that is not installed reports why nothing was mapped', async () => {
    const cwd = writeIconSetProject(path.join(tmp, 'missing'), {
      packages: [],
      config: {experimental: {iconSet: 'nope'}},
    });
    const res = await runCli(['template', TEMPLATE, '--json'], cwd);
    expect(JSON.parse(res.stdout).data.icons).toMatchObject({
      status: 'missing',
      mapped: [],
    });
  });
});

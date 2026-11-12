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
import {
  glyphsData,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';

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
    // Nothing in the list has share: the local placeholder, and both fixes.
    expect(res.stdout).toContain('MissingIcon /* missing icon: share */');
    expect(res.stdout).toContain('function MissingIcon(');
    expect(res.stdout).not.toContain('@heroicons/react');
    expect(res.stdout).not.toContain('MissingIcon_experimental');
    expect(res.stderr).toContain(
      'icons: placeholder ShareIcon (@heroicons/react/24/outline) -> MissingIcon: no set in your list has "share", so the file draws a placeholder it declares. Fix: add a backup set that has it, `astryx experimental icon use glyphs --backup <set>`; or, if you author your main set, map it there, `astryx experimental icon map share <icon> --set glyphs`.',
    );
  });

  it('the JSON and the copy receipt report mapped and placeholder icons; the library is no longer needed', async () => {
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
    expect(copied.data.icons.kept).toEqual([]);
    expect(
      copied.data.icons.placeholder.map(
        (/** @type {any} */ each) => each.definitions[0],
      ),
    ).toEqual(
      expect.arrayContaining(['mention', 'share', 'attach', 'document']),
    );
    expect(copied.data.icons.sets).toEqual([
      {set: '@acme/glyphs/glyphs', license: 'MIT', icons: 1},
    ]);
    expect(copied.data.missingPackages ?? []).not.toContain('@heroicons/react');
    const written = fs.readFileSync(path.join(cwd, 'out', 'page.tsx'), 'utf-8');
    expect(written).toBe(shown.data.source);
  });

  it('a main set with a backup: each icon comes from the first set that has it', async () => {
    const cwd = writeIconSetProject(tmp, {
      packages: [
        {},
        {
          name: '@acme/lines',
          data: {
            ...glyphsData(),
            module: '@acme/lines',
            map: {close: 'x', share: 'home'},
          },
        },
      ],
      config: {experimental: {iconSet: ['glyphs', 'lines']}},
    });
    const res = await runCli(['template', TEMPLATE, '--json'], cwd);
    const icons = JSON.parse(res.stdout).data.icons;
    expect(icons.order).toEqual(['@acme/glyphs/glyphs', '@acme/lines/lines']);
    const from = Object.fromEntries(
      icons.mapped.map((/** @type {any} */ each) => [
        each.source.export,
        `${each.target.package}/${each.target.set}`,
      ]),
    );
    // Both sets have close: the main set wins. Only the backup has share.
    expect(from).toEqual({
      XMarkIcon: '@acme/glyphs/glyphs',
      ShareIcon: '@acme/lines/lines',
    });
    expect(
      icons.placeholder.map((/** @type {any} */ each) => each.source.export),
    ).not.toContain('ShareIcon');
    const text = await runCli(['template', TEMPLATE], cwd);
    expect(text.stdout).toContain("import {HomeIcon} from '@acme/lines';");
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

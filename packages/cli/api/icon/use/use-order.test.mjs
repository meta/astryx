// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `iconUse()` with backup sets, and `icon --list` showing the order: a
 * main set and backups write `experimental.iconSet` as a list, the receipt
 * names each set, and two installed sets with no main set say which command
 * chooses one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {icon} from '../icon.mjs';
import {iconUse} from './use.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {
  CONFIG_ICON_SET_LIST_CLI,
  projectIconSetCliWarning,
} from '../../../foundation/integrations/cli-requirement.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-order-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** Two installed sets: glyphs and lines. */
function twoSets(
  config = /** @type {Record<string, unknown> | null} */ (null),
) {
  return writeIconSetProject(tmp, {
    packages: [{}, {name: '@acme/lines'}],
    config,
  });
}

/** @param {string} dir */
const configText = dir =>
  fs.readFileSync(path.join(dir, 'astryx.config.mjs'), 'utf8');

/** @param {string} dir */
async function listed(dir) {
  const result = await icon(undefined, {cwd: dir, list: true});
  if (result.type !== 'icon.list') throw new Error(result.type);
  return result.data;
}

describe('iconUse with backups', () => {
  it('writes a plain string with no backup, as before', async () => {
    const dir = twoSets();
    const result = await iconUse('glyphs', {cwd: dir});
    expect(configText(dir)).toContain("iconSet: 'glyphs'");
    expect(result.data).toMatchObject({
      iconSet: 'glyphs',
      set: '@acme/glyphs/glyphs',
      backups: [],
      unlisted: ['@acme/lines/lines'],
    });
    expect(result.data.next).toBe(
      '2 icon sets are installed and lines is not in your list. Add it as backup with `astryx experimental icon use glyphs --backup lines`, or uninstall it.',
    );
  });

  it('names every set in the fix one way, however the main set was written', async () => {
    const dir = twoSets();
    const result = await iconUse('@acme/glyphs/glyphs', {cwd: dir});
    expect(result.data.next).toBe(
      '2 icon sets are installed and lines is not in your list. Add it as backup with `astryx experimental icon use glyphs --backup lines`, or uninstall it.',
    );
    // A name two packages ship is written as <package>/<set>, for every set.
    const shared = writeIconSetProject(path.join(tmp, 'shared'), {
      packages: [{}, {name: '@acme/lines'}, {name: '@other/glyphs'}],
    });
    const both = await iconUse('@acme/glyphs/glyphs', {cwd: shared});
    expect(both.data.next).toBe(
      '3 icon sets are installed and lines, @other/glyphs/glyphs are not in your list. Add them as backup with `astryx experimental icon use @acme/glyphs/glyphs --backup lines --backup @other/glyphs/glyphs`, or uninstall them.',
    );
  });

  it('writes the main set and backups as a list, in order, and the config loads', async () => {
    const dir = twoSets();
    const result = await iconUse('lines', {cwd: dir, backups: ['glyphs']});
    expect(configText(dir)).toContain("iconSet: ['lines', 'glyphs']");
    expect(result.data).toMatchObject({
      iconSet: 'lines',
      set: '@acme/lines/lines',
      backups: [{iconSet: 'glyphs', set: '@acme/glyphs/glyphs'}],
      changed: true,
      unlisted: [],
    });
    expect(result.data).not.toHaveProperty('next');
    const project = await Project.load(dir);
    const {choice, sets} = await project.iconSets();
    expect(choice.status).toBe('selected');
    expect(choice.order?.map(set => set.name)).toEqual(['lines', 'glyphs']);
    expect(sets.map(set => set.name)).toEqual(['lines', 'glyphs']);
  });

  it('reports the list it replaced, and nothing changed when it already matches', async () => {
    const dir = twoSets({experimental: {iconSet: ['lines', 'glyphs']}});
    const again = await iconUse('lines', {cwd: dir, backups: ['glyphs']});
    expect(again.data.changed).toBe(false);
    const swapped = await iconUse('glyphs', {cwd: dir, backups: ['lines']});
    expect(swapped.data.previous).toEqual(['lines', 'glyphs']);
    expect(configText(dir)).toContain("['glyphs', 'lines']");
  });

  it('refuses a backup that is not installed, and a set named twice', async () => {
    const dir = twoSets();
    await expect(
      iconUse('glyphs', {cwd: dir, backups: ['nope']}),
    ).rejects.toMatchObject({code: 'ERR_NOT_FOUND'});
    await expect(
      iconUse('glyphs', {cwd: dir, backups: ['@acme/glyphs/glyphs']}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('is in the list twice'),
    });
    expect(fs.existsSync(path.join(dir, 'astryx.config.mjs'))).toBe(false);
  });

  it('names the order command when the set is missing', async () => {
    const dir = twoSets();
    await expect(iconUse('', {cwd: dir})).rejects.toMatchObject({
      code: 'ERR_MISSING_ARGUMENT',
      suggestions: expect.arrayContaining([
        expect.objectContaining({
          name: 'astryx experimental icon use <main> --backup <set>',
        }),
      ]),
    });
  });
});

describe('icon --list order', () => {
  it('says so, with the command, when two sets are installed and none is the main set', async () => {
    const data = await listed(twoSets());
    expect(data.status).toBe('ambiguous');
    expect(data.next).toBe(
      '2 icon sets are installed and none is your main set: run `astryx experimental icon use <main> --backup <set>`.',
    );
    expect(data.order).toEqual([]);
    expect(data.sets.map(set => set.role)).toEqual([null, null]);
  });

  it('shows the main set and backups in order', async () => {
    const data = await listed(
      twoSets({experimental: {iconSet: ['lines', 'glyphs']}}),
    );
    expect(data.order).toEqual(['@acme/lines/lines', '@acme/glyphs/glyphs']);
    expect(data.sets.map(set => [set.name, set.role, set.rank])).toEqual([
      ['lines', 'main', 1],
      ['glyphs', 'backup', 2],
    ]);
    expect(data).not.toHaveProperty('next');
    expect(data.backups).toEqual([
      {
        iconSet: 'glyphs',
        status: 'selected',
        reason: 'experimental.iconSet names "glyphs".',
      },
    ]);
  });

  it('reports a backup that is not installed', async () => {
    const data = await listed(
      twoSets({experimental: {iconSet: ['lines', 'nope']}}),
    );
    expect(data.order).toEqual(['@acme/lines/lines']);
    expect(data.backups[0]).toMatchObject({iconSet: 'nope', status: 'missing'});
  });
});

describe('the older-CLI warning for a list', () => {
  it('needs a later release for a list than for a string', () => {
    const pkg = {devDependencies: {'@astryxdesign/cli': '>=0.7.4'}};
    expect(projectIconSetCliWarning(pkg)).toBeNull();
    expect(projectIconSetCliWarning(pkg, {list: true})).toContain(
      `before ${CONFIG_ICON_SET_LIST_CLI}, which refuses \`experimental.iconSet\` written as a list`,
    );
    expect(
      projectIconSetCliWarning(
        {
          devDependencies: {
            '@astryxdesign/cli': `>=${CONFIG_ICON_SET_LIST_CLI}`,
          },
        },
        {list: true},
      ),
    ).toBeNull();
  });
});

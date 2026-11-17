// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `iconUse()` with a variant: the project picks the look every icon
 * draws. `experimental.iconVariant` is written beside
 * `experimental.iconSet` in one write and removed when no variant is named;
 * the main set must declare it; the receipt names the look each set in the
 * list draws and the theme map for that look; `icon --list` shows it; and a
 * config that names a variant without sets is refused.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {icon} from '../icon.mjs';
import {iconUse} from './use.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {
  CONFIG_ICON_VARIANT_CLI,
  projectIconSetCliWarning,
} from '../../../foundation/integrations/cli-requirement.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-variant-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * The default set's data with one look: no variants anywhere.
 * @param {string} module
 */
function oneLook(module) {
  const {variants, default: _default, ...data} = glyphsData();
  return {
    ...data,
    module,
    icons: data.icons.map(({variants: _variants, ...each}) => each),
  };
}

/**
 * glyphs (outline and solid; its trash has a solid look) and lines (one
 * look) installed.
 * @param {{config?: Record<string, unknown> | null, glyphs?: Record<string, unknown>, devDependencies?: Record<string, string>}} [options]
 */
function project({config = null, glyphs = {}, devDependencies} = {}) {
  const dir = writeIconSetProject(tmp, {
    packages: [
      {data: {...glyphsData(), module: '@acme/glyphs', ...glyphs}},
      {name: '@acme/lines', data: oneLook('@acme/lines')},
    ],
    config,
  });
  if (devDependencies) {
    const file = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({...pkg, devDependencies}));
  }
  return dir;
}

/** @param {string} dir */
const configText = dir =>
  fs.readFileSync(path.join(dir, 'astryx.config.mjs'), 'utf8');

describe('iconUse with a variant', () => {
  it('writes the variant beside the sets in one write, and names the look each set draws', async () => {
    const dir = project();
    const result = await iconUse('glyphs', {
      cwd: dir,
      backups: ['lines'],
      variant: 'solid',
    });
    expect(configText(dir)).toBe(
      "export default {\n  experimental: {\n    iconSet: ['glyphs', 'lines'],\n    iconVariant: 'solid',\n  },\n};\n",
    );
    expect(result.data).toMatchObject({
      variant: 'solid',
      previousVariant: null,
      created: true,
      changed: true,
      looks: [
        {set: '@acme/glyphs/glyphs', variant: 'solid'},
        {set: '@acme/lines/lines', variant: null},
      ],
    });
    // glyphs has no generated module, so no theme map is written for the look.
    expect(result.data).not.toHaveProperty('themeMap');
    const {choice} = await (await Project.load(dir)).iconSets();
    expect(choice.variant).toBe('solid');
  });

  it("names the main set's theme map for the look: its own map, or themeIcons for the default look", async () => {
    const dir = project({
      glyphs: {generated: './icon-sets/glyphs/glyphs.generated.js'},
    });
    const solid = await iconUse('glyphs', {
      cwd: dir,
      backups: ['lines'],
      variant: 'solid',
    });
    expect(solid.data.themeMap).toEqual({
      module: '@acme/glyphs',
      export: 'themeIconsSolid',
    });
    const outline = await iconUse('glyphs', {
      cwd: dir,
      backups: ['lines'],
      variant: 'outline',
    });
    expect(outline.data.themeMap).toEqual({
      module: '@acme/glyphs',
      export: 'themeIcons',
    });
    expect(outline.data.previousVariant).toBe('solid');
  });

  it('removes the variant when none is named, and says what it was', async () => {
    const dir = project({
      config: {
        experimental: {iconSet: ['glyphs', 'lines'], iconVariant: 'solid'},
      },
    });
    const result = await iconUse('glyphs', {cwd: dir, backups: ['lines']});
    expect(configText(dir)).not.toContain('iconVariant');
    // A config module this process loaded before is read again from disk.
    const {choice} = await (await Project.load(dir, {fresh: true})).iconSets();
    expect(choice.order?.map(set => set.name)).toEqual(['glyphs', 'lines']);
    expect(choice).not.toHaveProperty('variant');
    expect(result.data).toMatchObject({
      variant: null,
      previousVariant: 'solid',
      changed: true,
    });
    expect(result.data).not.toHaveProperty('looks');
    expect(result.data).not.toHaveProperty('themeMap');
  });

  it('changes nothing when the config already names the sets and the look', async () => {
    const dir = project({
      config: {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
    });
    const before = configText(dir);
    const result = await iconUse('glyphs', {cwd: dir, variant: 'solid'});
    expect(result.data.changed).toBe(false);
    expect(configText(dir)).toBe(before);
  });

  it('refuses a variant the main set does not declare, names each of its looks with the command that picks it, and writes nothing', async () => {
    const dir = project();
    await expect(
      iconUse('glyphs', {cwd: dir, backups: ['lines'], variant: 'filled'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message:
        'Icon set "@acme/glyphs/glyphs" declares no "filled" variant. Its variants: outline, solid.',
      suggestions: [
        {
          name: 'astryx experimental icon use glyphs --backup lines --variant outline',
          reason: 'its default look, outline',
        },
        {
          name: 'astryx experimental icon use glyphs --backup lines --variant solid',
          reason: 'its solid look',
        },
      ],
    });
    // A backup's looks do not count: the look is one of the main set's.
    await expect(
      iconUse('lines', {cwd: dir, backups: ['glyphs'], variant: 'solid'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message:
        'Icon set "@acme/lines/lines" declares no variants: it draws one look, so it takes no --variant.',
      suggestions: [
        {
          name: 'astryx experimental icon use lines --backup glyphs',
          reason: 'use it in its one look',
        },
      ],
    });
    await expect(
      iconUse('glyphs', {cwd: dir, variant: ' '}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
    expect(fs.existsSync(path.join(dir, 'astryx.config.mjs'))).toBe(false);
  });

  it('writes neither key when the config cannot be updated, and names both edits', async () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      "const base = {};\nexport default {...base, experimental: {iconSet: 'lines'}};\n",
    );
    const before = configText(dir);
    await expect(
      iconUse('glyphs', {cwd: dir, variant: 'solid'}),
    ).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
      message: expect.stringContaining(
        'Set "experimental.iconSet: \'glyphs\'" and set "experimental.iconVariant: \'solid\'" in it yourself.',
      ),
    });
    expect(configText(dir)).toBe(before);
  });

  it("warns when the project's CLI range admits a release that refuses the variant", async () => {
    const dir = project({
      devDependencies: {'@astryxdesign/cli': '^0.7.12'},
    });
    const result = await iconUse('glyphs', {cwd: dir, variant: 'solid'});
    expect(result.data.warning).toBe(
      `The project's @astryxdesign/cli range "^0.7.12" (devDependencies) admits a release before ${CONFIG_ICON_VARIANT_CLI}, which refuses an astryx.config that sets \`experimental.iconVariant\` ("Unrecognized key"), so commands that load the project configuration, such as \`doctor\` and \`discover\`, fail there. Require "@astryxdesign/cli": ">=${CONFIG_ICON_VARIANT_CLI}".`,
    );
    // The same range reads a set name and a list.
    const plain = await iconUse('glyphs', {cwd: dir, backups: ['lines']});
    expect(plain.data).not.toHaveProperty('warning');
    expect(
      projectIconSetCliWarning(
        {dependencies: {'@astryxdesign/cli': `>=${CONFIG_ICON_VARIANT_CLI}`}},
        {list: true, variant: true},
      ),
    ).toBeNull();
  });
});

describe('the project variant in astryx.config and icon --list', () => {
  it('refuses a variant without the sets it is the look of', async () => {
    const dir = project({config: {experimental: {iconVariant: 'solid'}}});
    await expect(Project.load(dir)).rejects.toThrow(
      /experimental\.iconVariant.*iconVariant is the look of the icon sets experimental\.iconSet names/su,
    );
  });

  it('lists the variant and the look each set draws', async () => {
    const dir = project({
      config: {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
    });
    const result = await icon(undefined, {cwd: dir, list: true});
    if (result.type !== 'icon.list') throw new Error(result.type);
    expect(result.data.variant).toBe('solid');
    expect(result.data.sets.map(set => [set.name, set.look])).toEqual([
      ['glyphs', 'solid'],
      ['lines', null],
    ]);
    const plain = writeIconSetProject(path.join(tmp, 'plain'), {
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const without = await icon(undefined, {cwd: plain, list: true});
    if (without.type !== 'icon.list') throw new Error(without.type);
    expect(without.data.variant).toBeNull();
    expect(without.data.sets[0]).not.toHaveProperty('look');
  });
});

/**
 * Run a printed `astryx experimental icon use` command through `iconUse`.
 * @param {string} command
 * @param {string} cwd
 */
function runUseCommand(command, cwd) {
  const words = command
    .replace(/^astryx experimental icon use /u, '')
    .split(' ');
  const [main, ...rest] = words;
  /** @type {string[]} */
  const backups = [];
  /** @type {string | undefined} */
  let variant;
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--backup') backups.push(rest[i + 1]);
    else if (rest[i] === '--variant') variant = rest[i + 1];
    else throw new Error(`unexpected word ${rest[i]} in ${command}`);
  }
  return iconUse(main, {cwd, backups, variant});
}

describe('every use command printed for a choice with a look', () => {
  it('adds the unlisted sets and keeps the look, so running it keeps experimental.iconVariant', async () => {
    const dir = project({
      config: {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
    });
    const result = await iconUse('glyphs', {cwd: dir, variant: 'solid'});
    const command =
      'astryx experimental icon use glyphs --backup lines --variant solid';
    expect(result.data.next).toContain(`\`${command}\``);
    await runUseCommand(command, dir);
    const {choice} = await (await Project.load(dir, {fresh: true})).iconSets();
    expect(choice.order?.map(set => set.name)).toEqual(['glyphs', 'lines']);
    expect(choice.variant).toBe('solid');
  });

  it("names a refused variant's alternatives with the list's backups", async () => {
    const dir = project();
    await expect(
      iconUse('glyphs', {cwd: dir, backups: ['lines'], variant: 'bold'}),
    ).rejects.toMatchObject({
      suggestions: expect.arrayContaining([
        expect.objectContaining({
          name: 'astryx experimental icon use glyphs --backup lines --variant solid',
        }),
      ]),
    });
  });
});

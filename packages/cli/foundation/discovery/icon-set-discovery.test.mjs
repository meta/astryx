// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set discovery and the project's icon-set choice (AST-084 FR1–FR5,
 * FR8, FR17), over the synthetic fixture package.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {Project} from '../config/project.mjs';
import {
  chooseProjectIconSet,
  discoverIconSetDirectory,
  resolveIconModule,
  splitSpecifier,
} from './icon-set-discovery.mjs';
import {
  definitionSource,
  glyphsData,
  writeIconPackage,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-sets-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Parameters<typeof writeIconSetProject>[1]} [options] */
async function iconSetsOf(options) {
  const project = await Project.load(writeIconSetProject(tmp, options), {
    fresh: true,
  });
  return {
    state: await project.iconSets({experimental: true}),
    issues: await project.issues(),
  };
}

describe('discoverIconSetDirectory', () => {
  it('reads one valid set: descriptor, data, and notices', () => {
    const dir = path.join(tmp, 'pkg');
    writeIconPackage(dir);
    const {sets, errors} = discoverIconSetDirectory(
      path.join(dir, 'icon-sets'),
      '@acme/glyphs',
    );
    expect(errors).toEqual([]);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      name: 'glyphs',
      license: 'MIT',
      package: '@acme/glyphs',
      notices: ['LICENSE'],
    });
    expect(sets[0].data.icons.map(icon => icon.id)).toEqual([
      'x',
      'search',
      'trash',
      'home',
    ]);
  });

  it("keeps a set valid whose own definition is marked stability: 'experimental'", () => {
    const dir = path.join(tmp, 'pkg');
    writeIconPackage(dir, {
      definitions: {
        rotate: definitionSource('rotate').replace(
          '"type": "icon-definition",',
          '"type": "icon-definition",\n  "stability": "experimental",',
        ),
      },
      data: {
        ...glyphsData(),
        module: '@acme/glyphs',
        map: {...glyphsData().map, rotate: 'x'},
      },
    });
    const {sets, errors} = discoverIconSetDirectory(
      path.join(dir, 'icon-sets'),
      '@acme/glyphs',
    );
    expect(errors).toEqual([]);
    expect(sets.map(set => set.name)).toEqual(['glyphs']);
    expect(sets[0].definitions?.map(each => each.doc ?? each)).toContainEqual(
      expect.objectContaining({name: 'rotate', stability: 'experimental'}),
    );
  });

  it.each([
    ['no descriptor', {docSource: null}, /has no descriptor/],
    ['no data file', {data: null}, /has no data file/],
    [
      'a misnamed descriptor',
      {doc: {name: 'other'}},
      /must equal its directory name/,
    ],
    [
      'a descriptor that runs code',
      {docSource: "import fs from 'node:fs';\nexport default {};\n"},
      /must contain only/,
    ],
    [
      'an untyped descriptor',
      {docSource: 'export default {type: "icon-set"};\n'},
      /must declare its public IconSetDoc type/,
    ],
    ['data that is not JSON', {data: '{nope'}, /not valid JSON/],
    [
      'data with schemaVersion 2',
      {data: {...glyphsData(), schemaVersion: 2}},
      /schemaVersion/,
    ],
  ])(
    'reports a set with %s, without hiding siblings',
    (_label, spec, message) => {
      const dir = path.join(tmp, 'pkg');
      writeIconPackage(dir, /** @type {any} */ (spec));
      // A second, valid set beside the broken one.
      const sibling = path.join(dir, 'icon-sets', 'extra');
      fs.mkdirSync(sibling, {recursive: true});
      fs.writeFileSync(
        path.join(sibling, 'extra.doc.mjs'),
        "/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */\nexport default {type: 'icon-set', name: 'extra', displayName: 'Extra', description: '', maintained: true, license: 'MIT'};\n",
      );
      fs.writeFileSync(
        path.join(sibling, 'extra.icons.json'),
        JSON.stringify({...glyphsData(), module: '@acme/glyphs'}),
      );
      const {sets, errors} = discoverIconSetDirectory(
        path.join(dir, 'icon-sets'),
        '@acme/glyphs',
      );
      expect(sets.map(set => set.name)).toEqual(['extra']);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(message);
    },
  );

  it('never executes the icon module', () => {
    const dir = path.join(tmp, 'pkg');
    writeIconPackage(dir, {
      modules: {
        'index.js': "throw new Error('executed');\nexport const XIcon = 1;\n",
      },
    });
    const {sets} = discoverIconSetDirectory(
      path.join(dir, 'icon-sets'),
      '@acme/glyphs',
    );
    expect(sets).toHaveLength(1);
  });

  it('ignores dot folders and non-kebab folders', () => {
    const dir = path.join(tmp, 'pkg');
    writeIconPackage(dir);
    fs.mkdirSync(path.join(dir, 'icon-sets', '.cache'));
    fs.mkdirSync(path.join(dir, 'icon-sets', 'Draft'));
    const {sets, errors} = discoverIconSetDirectory(
      path.join(dir, 'icon-sets'),
      '@acme/glyphs',
    );
    expect(sets.map(set => set.name)).toEqual(['glyphs']);
    expect(errors).toEqual([]);
  });
});

describe('resolveIconModule', () => {
  it('splits scoped and unscoped specifiers', () => {
    expect(splitSpecifier('@acme/glyphs/solid')).toEqual({
      name: '@acme/glyphs',
      subpath: './solid',
    });
    expect(splitSpecifier('glyphs')).toEqual({name: 'glyphs', subpath: '.'});
  });

  it('resolves through node_modules and the exports map, and refuses an unexported subpath', () => {
    const project = writeIconSetProject(tmp);
    expect(resolveIconModule('@acme/glyphs', project)).toBe(
      path.join(project, 'node_modules', '@acme', 'glyphs', 'index.js'),
    );
    expect(resolveIconModule('@acme/glyphs/icons/x.js', project)).toBeNull();
    expect(resolveIconModule('@acme/missing', project)).toBeNull();
  });
});

describe('Project.iconSets', () => {
  it('reads no set, and records no issue, without experimental.iconSet unless asked', async () => {
    const project = await Project.load(
      writeIconSetProject(tmp, {packages: [{data: '{nope'}]}),
      {fresh: true},
    );
    expect((await project.iconSets()).sets).toEqual([]);
    expect(await project.issues()).toEqual([]);
  });

  it('answers one installed set as the project set', async () => {
    const {state, issues} = await iconSetsOf();
    expect(state.sets.map(set => set.name)).toEqual(['glyphs']);
    expect(state.choice.status).toBe('selected');
    expect(state.withdrawn).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('withdraws a set whose data is invalid, and reports it', async () => {
    const {state, issues} = await iconSetsOf({
      packages: [
        {
          data: {
            ...glyphsData(),
            module: '@acme/glyphs',
            icons: [{id: 'x', export: 'XIcon', words: []}],
          },
        },
      ],
    });
    expect(state.sets).toEqual([]);
    expect(state.withdrawn).toEqual([
      expect.objectContaining({name: 'glyphs', kind: 'invalid'}),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'invalid_icon_set',
        package: '@acme/glyphs',
      }),
    ]);
    expect(state.choice.status).toBe('none');
  });

  it('withdraws a set whose module does not resolve from the project', async () => {
    const {state} = await iconSetsOf({
      packages: [{data: {...glyphsData(), module: '@acme/not-installed'}}],
    });
    expect(state.sets).toEqual([]);
    expect(state.withdrawn[0]).toMatchObject({kind: 'unresolved'});
    expect(state.withdrawn[0].reason).toMatch(
      /does not resolve from the project/,
    );
  });

  it('two sets and no iconSet: ambiguous, never one picked silently', async () => {
    const {state} = await iconSetsOf({
      packages: [{}, {name: '@acme/lines'}],
    });
    expect(state.sets.map(set => set.name)).toEqual(['glyphs', 'lines']);
    expect(state.choice.status).toBe('ambiguous');
    expect(state.choice.set).toBeUndefined();
  });

  it('two sets with iconSet: that set first, by name or <package>/<set>', async () => {
    for (const iconSet of ['lines', '@acme/lines/lines']) {
      fs.rmSync(tmp, {recursive: true, force: true});
      fs.mkdirSync(tmp);
      const {state} = await iconSetsOf({
        packages: [{}, {name: '@acme/lines'}],
        config: {experimental: {iconSet}},
      });
      expect(state.choice.status).toBe('selected');
      expect(state.sets.map(set => set.name)).toEqual(['lines', 'glyphs']);
    }
  });

  it('iconSet naming an installed set that was withdrawn is withdrawn, with why', async () => {
    const {state} = await iconSetsOf({
      packages: [{data: {...glyphsData(), module: '@acme/not-installed'}}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(state.choice.status).toBe('withdrawn');
    expect(state.choice.reason).toMatch(
      /names "glyphs", which is installed but withdrawn: .*does not resolve/,
    );
  });

  it('iconSet naming a set that is not installed is missing', async () => {
    const {state} = await iconSetsOf({
      config: {experimental: {iconSet: 'nope'}},
    });
    expect(state.choice.status).toBe('missing');
    expect(state.choice.reason).toMatch(/no installed set has that name/);
  });
});

describe('chooseProjectIconSet', () => {
  it('no sets: none', () => {
    expect(chooseProjectIconSet([], undefined).status).toBe('none');
  });

  it('a set name two packages share is ambiguous', () => {
    const a = /** @type {any} */ ({name: 'outline', package: '@acme/a'});
    const b = /** @type {any} */ ({name: 'outline', package: '@acme/b'});
    expect(chooseProjectIconSet([a, b], 'outline').status).toBe('ambiguous');
    expect(chooseProjectIconSet([a, b], '@acme/b/outline').set).toBe(b);
  });

  it('a configured name only a withdrawn set has is withdrawn; a valid set wins over it', () => {
    const gone = /** @type {any} */ ({
      name: 'outline',
      package: '@acme/a',
      kind: 'invalid',
      reason: 'its data is not valid JSON.',
    });
    const valid = /** @type {any} */ ({name: 'outline', package: '@acme/b'});
    expect(chooseProjectIconSet([], 'outline', [gone])).toMatchObject({
      status: 'withdrawn',
      reason:
        'experimental.iconSet names "outline", which is installed but withdrawn: its data is not valid JSON.',
    });
    expect(chooseProjectIconSet([], '@acme/a/outline', [gone]).status).toBe(
      'withdrawn',
    );
    expect(chooseProjectIconSet([], 'other', [gone]).status).toBe('missing');
    expect(chooseProjectIconSet([valid], 'outline', [gone]).set).toBe(valid);
  });
});

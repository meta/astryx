// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An icon definition's `replaces`: the old name answers with the
 * definition that replaced it, through a second and a third replacement, in a
 * set's `map`, the set checks, the search, and `experimental icon map`; and a
 * folder whose replacements cannot hold is refused.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  currentDefinitionName,
  readDefinitionsDir,
  replacedNamesOf,
  withReplacements,
} from './icon-definition-discovery.mjs';
import {discoverIconSetDirectory} from './icon-set-discovery.mjs';
import {iconSetIssues} from './icon-set-checks.mjs';
import {rankIcons} from './icon-ranking.mjs';
import {iconMap} from '../../api/icon/map/map.mjs';
import {icon} from '../../api/icon/icon.mjs';
import {
  exportIconIndex,
  rankIconIndex,
} from '../../api/icon/search/icon-index.mjs';
import {
  definitionSource,
  glyphsData,
  writeIconPackage,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let dir;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-replaces-'));
  dir = path.join(tmp, 'glyphs');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * Three replacements of the set's own definition: `planet` became `orbit`,
 * `orbit` became `comet`, `comet` became `meteor`. The replaced files stay,
 * so each keeps its own old name answering.
 */
const CHAIN = {
  orbit: definitionSource('orbit', {replaces: 'planet'}),
  comet: definitionSource('comet', {replaces: 'orbit'}),
  meteor: definitionSource('meteor', {replaces: 'comet'}),
};

/**
 * Write a definitions folder and read it as discovery does.
 * @param {Record<string, string>} files
 */
function folder(files) {
  const definitions = fs.mkdtempSync(path.join(tmp, 'definitions-'));
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(definitions, `${name}.doc.mjs`), source);
  }
  return withReplacements(readDefinitionsDir(definitions, '@acme/glyphs'));
}

/** The fixture package's one set, as discovery reads it. */
const readSet = () =>
  discoverIconSetDirectory(path.join(dir, 'icon-sets'), '@acme/glyphs').sets[0];

/** @param {(data: any) => void} change */
function data(change) {
  const value = /** @type {any} */ ({...glyphsData(), module: '@acme/glyphs'});
  value.map = {...value.map};
  change(value);
  return value;
}

describe('a definition that replaces another', () => {
  it('answers each old name with the newest definition: one, two and three replacements back', () => {
    const read = folder(CHAIN);
    expect(read.errors).toEqual([]);
    expect(read.definitions.map(each => each.doc.name)).toEqual(['meteor']);
    expect(read.replaced.map(each => each.doc.name).sort()).toEqual([
      'comet',
      'orbit',
    ]);
    const set = {
      definitions: read.definitions,
      definitionAliases: read.aliases,
    };
    expect(currentDefinitionName('comet', set)).toBe('meteor');
    expect(currentDefinitionName('orbit', set)).toBe('meteor');
    expect(currentDefinitionName('planet', set)).toBe('meteor');
    expect(currentDefinitionName('meteor', set)).toBe('meteor');
    expect(currentDefinitionName('nebula', set)).toBeUndefined();
    expect(replacedNamesOf('meteor', set).sort()).toEqual([
      'comet',
      'orbit',
      'planet',
    ]);
  });

  it("answers Astryx's old names after the set's own, three replacements back", () => {
    const astryx = folder({
      remove: definitionSource('remove', {replaces: 'delete'}),
      delete: definitionSource('delete', {replaces: 'trash'}),
      trash: definitionSource('trash', {replaces: 'bin'}),
    });
    expect(astryx.errors).toEqual([]);
    for (const old of ['delete', 'trash', 'bin']) {
      expect(currentDefinitionName(old, undefined, astryx)).toBe('remove');
    }
    const own = {
      definitions: [{doc: {name: 'bin'}}],
      definitionAliases: astryx.aliases,
    };
    expect(currentDefinitionName('bin', own, astryx)).toBe('bin');
  });

  it('refuses two successors for one name, a replaced built-in, and a chain that ends nowhere', () => {
    expect(
      folder({
        orbit: definitionSource('orbit', {replaces: 'planet'}),
        comet: definitionSource('comet', {replaces: 'planet'}),
      }).errors.map(each => each.message),
    ).toEqual([
      expect.stringContaining(
        'replaces "planet", which "comet" already replaces',
      ),
    ]);
    const builtIn = folder({
      close: `/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */\nexport default ${JSON.stringify({type: 'icon-definition', name: 'close', description: 'Close.', words: ['close'], builtIn: true})};\n`,
      dismiss: definitionSource('dismiss', {replaces: 'close'}),
    });
    expect(builtIn.errors.map(each => each.message)).toEqual([
      expect.stringContaining('replaces the built-in definition "close"'),
    ]);
    const loop = folder({
      orbit: definitionSource('orbit', {replaces: 'comet'}),
      comet: definitionSource('comet', {replaces: 'orbit'}),
    });
    expect(loop.errors.map(each => each.message)).toEqual([
      expect.stringContaining('never reaches a current definition'),
      expect.stringContaining('never reaches a current definition'),
    ]);
  });

  it("maps a set's old key to the newest definition, and the check names the key to rename", () => {
    writeIconPackage(dir, {
      data: data(d => (d.map.planet = 'home')),
      definitions: CHAIN,
    });
    const set = readSet();
    expect(set.data.map).toMatchObject({meteor: 'home'});
    expect(set.data.map).not.toHaveProperty('planet');
    expect(set.replacedKeys).toEqual([{key: 'planet', definition: 'meteor'}]);
    const issues = iconSetIssues(dir, {
      name: '@acme/glyphs',
      iconSets: path.join(dir, 'icon-sets'),
    }).filter(issue => issue.code === 'icon_definition_replaced');
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'icon_definition_replaced',
        severity: 'warning',
      }),
    ]);
    expect(issues[0].message).toContain(
      'maps "planet", an icon definition that "meteor" replaced',
    );
    expect(issues[0].message).toContain(
      'astryx experimental icon map meteor home --set glyphs',
    );
  });

  it('keeps the entry the map already has for the newest definition', () => {
    writeIconPackage(dir, {
      data: data(d => {
        d.map.orbit = 'trash';
        d.map.meteor = 'home';
      }),
      definitions: CHAIN,
    });
    const set = readSet();
    expect(set.data.map.meteor).toBe('home');
    expect(set.replacedKeys).toEqual([{key: 'orbit', definition: 'meteor'}]);
  });

  it('finds the icon by an old name, two and three replacements back', () => {
    writeIconPackage(dir, {
      data: data(d => (d.map.meteor = 'home')),
      definitions: CHAIN,
    });
    const set = readSet();
    for (const old of ['orbit', 'planet']) {
      const [first] = rankIcons([set], old);
      expect(first).toMatchObject({id: 'home', score: 100});
      expect(first.reason).toBe(`definition "meteor" (replaced "${old}")`);
    }
  });

  it('`experimental icon map` writes an old key under the newest definition', async () => {
    writeIconPackage(dir, {
      data: data(d => (d.map.planet = 'home')),
      definitions: CHAIN,
    });
    const result = await iconMap('meteor', 'home', {cwd: dir});
    expect(result.data).toMatchObject({
      definition: 'meteor',
      changed: true,
      replacedKeys: [{key: 'planet', definition: 'meteor'}],
    });
    const written = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'icon-sets', 'glyphs', 'glyphs.icons.json'),
        'utf-8',
      ),
    );
    expect(written.map).toMatchObject({meteor: 'home'});
    expect(written.map).not.toHaveProperty('planet');
    expect(readSet().replacedKeys).toBeUndefined();
    const byOld = await iconMap('comet', 'trash', {cwd: dir});
    expect(byOld.data.definition).toBe('meteor');
  });
  it("refuses a set's own definition that replaces an Astryx definition", () => {
    writeIconPackage(dir, {
      data: data(d => (d.map.dismiss = 'x')),
      definitions: {dismiss: definitionSource('dismiss', {replaces: 'close'})},
    });
    const read = discoverIconSetDirectory(
      path.join(dir, 'icon-sets'),
      '@acme/glyphs',
    );
    expect(read.sets).toEqual([]);
    expect(read.errors.map(each => each.message).join(' ')).toContain(
      'replaces "close", an Astryx icon definition',
    );
  });

  it('a stored index answers an old name as `icon()` does', async () => {
    const cwd = writeIconSetProject(tmp, {
      packages: [
        {data: data(d => (d.map.meteor = 'home')), definitions: CHAIN},
      ],
    });
    const stored = JSON.parse(JSON.stringify(await exportIconIndex({cwd})));
    for (const old of ['comet', 'orbit', 'planet']) {
      const direct = await icon(old, {cwd});
      const ranked = await rankIconIndex(old, stored);
      expect(ranked).toEqual(direct);
      expect(/** @type {any} */ (ranked).data.matches[0]).toMatchObject({
        id: 'home',
        score: 100,
      });
    }
  });
});

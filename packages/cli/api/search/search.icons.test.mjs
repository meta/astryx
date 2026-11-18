// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's icon section: with an icon set installed, a query that asks
 * for an icon also lists the installed icons that answer it, after the
 * results, and never changes them. Every other query, and every query with
 * no set installed, answers exactly as before.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';
import {
  glyphsData,
  writeIconPackage,
} from '../../test-utils/icon-set-fixture.mjs';
import {asksForIcon} from '../../foundation/discovery/icon-ranking.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./search.mjs')} */
const {search} = require('./search.mjs');
/** @type {typeof import('../icon/icon.mjs')} */
const {icon} = require('../icon/icon.mjs');

const SLOW = 120_000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const packages = path.resolve(HERE, '../../..');
const BIN = path.resolve(HERE, '../../clients/cli/bin/astryx.mjs');

const ICON_ASKS = ['trash icon', 'SearchIcon', 'glyphs remove', 'delete icons'];
const OTHER_QUERIES = [
  'trash',
  'button',
  'dark mode',
  'delete',
  'Icon',
  'IconButton',
  'NavIcon',
];

/**
 * The fixture set, with an icon tagged `icon`, a plus icon, icons tagged
 * `card` and `avatar`, and four more icons that share the word `shape`.
 */
function shapesData() {
  const data = glyphsData();
  data.icons.push({
    id: 'image',
    export: 'ImageIcon',
    words: ['icon', 'picture'],
  });
  data.icons.push({id: 'plus', export: 'PlusIcon', words: ['add', 'new']});
  // Icons the feature phrases would list without the rule.
  data.icons.push({
    id: 'credit-card',
    export: 'CreditCardIcon',
    words: ['card', 'payment'],
  });
  data.icons.push({
    id: 'user',
    export: 'UserIcon',
    words: ['avatar', 'person'],
  });
  for (const id of ['circle', 'square', 'triangle', 'star']) {
    data.icons.push({
      id,
      export: `${id[0].toUpperCase()}${id.slice(1)}Icon`,
      words: ['shape'],
    });
  }
  return {...data, module: '@acme/glyphs'};
}

/**
 * An integration whose one component declares the keyword `icon`.
 * @param {string} dir the package directory
 */
function writeTilesIntegration(dir) {
  fs.mkdirSync(path.join(dir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"@acme/tiles","version":"1.0.0","main":"components/KindTile.tsx"}',
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  fs.writeFileSync(
    path.join(dir, 'components', 'KindTile.doc.mjs'),
    `export default {
      type: 'component',
      name: 'KindTile',
      import: '@acme/tiles',
      keywords: ['icon', 'tile'],
      usage: {description: 'A tile that shows a kind of work with its icon.'},
      props: [],
    };\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'components', 'KindTile.tsx'),
    'export function KindTile() {\n  return null;\n}\n',
  );
}

/**
 * A project with Core and an integration that declares the keyword `icon`
 * installed and, when `pack`, the fixture icon set.
 * @param {string} dir
 * @param {boolean} pack
 * @param {Record<string, unknown>} [config] astryx.config.mjs contents
 */
function writeProject(dir, pack, config) {
  fs.rmSync(dir, {recursive: true, force: true});
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(path.join(packages, 'core'), path.join(scope, 'core'), 'dir');
  writeTilesIntegration(path.join(dir, 'node_modules', '@acme', 'tiles'));
  /** @type {Record<string, string>} */
  const dependencies = {'@astryxdesign/core': '*', '@acme/tiles': '1.0.0'};
  if (pack) {
    dependencies['@acme/glyphs'] = '1.0.0';
    writeIconPackage(path.join(dir, 'node_modules', '@acme', 'glyphs'), {
      data: shapesData(),
    });
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', private: true, dependencies}),
  );
  if (config) {
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      `export default ${JSON.stringify(config)};\n`,
    );
  }
}

/** @param {string} cwd @param {string} query */
function cliText(cwd, query) {
  return execFileSync(process.execPath, [BIN, 'search', ...query.split(' ')], {
    cwd,
    encoding: 'utf-8',
    env: {...process.env, CI: '1', NO_COLOR: '1'},
  });
}

describe('asksForIcon', () => {
  const names = {
    setNames: ['glyphs'],
    declaredNames: ['Icon', 'IconButton', 'NavIcon'],
    answersEntry: true,
  };

  it('reads `icon` and `icons` as typed, set names, and icon export names', () => {
    expect(asksForIcon('trash icon', names)).toBe(true);
    expect(asksForIcon('Icons for delete', names)).toBe(true);
    expect(asksForIcon('icon', names)).toBe(true);
    expect(asksForIcon('SearchIcon', names)).toBe(true);
    expect(asksForIcon('ChevronDownIcon', names)).toBe(true);
    expect(asksForIcon('glyphs trash', names)).toBe(true);
    expect(asksForIcon('Glyphs', names)).toBe(true);
  });

  it('an icon word that names a feature of an answered entry asks for nothing', () => {
    expect(asksForIcon('card with an icon', names)).toBe(false);
    expect(asksForIcon('avatar with icon', names)).toBe(false);
    expect(asksForIcon('list with the icons', names)).toBe(false);
    expect(asksForIcon('card with an icon of a star', names)).toBe(true);
    expect(asksForIcon('menu with icons for actions', names)).toBe(true);
    expect(asksForIcon('button with plus icon', names)).toBe(true);
    expect(
      asksForIcon('card with an icon', {...names, answersEntry: false}),
    ).toBe(true);
  });

  it('a component or hook name, or a word that only holds `icon`, asks for nothing', () => {
    expect(asksForIcon('Icon', names)).toBe(false);
    expect(asksForIcon('IconButton', names)).toBe(false);
    expect(asksForIcon('NavIcon', names)).toBe(false);
    expect(asksForIcon('iconography', names)).toBe(false);
    expect(asksForIcon('trash', names)).toBe(false);
    expect(asksForIcon('button', names)).toBe(false);
  });
});

describe('search icon section', () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let bare;
  /** @type {string} */
  let packed;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-icons-'));
    bare = path.join(root, 'bare');
    packed = path.join(root, 'packed');
    writeProject(bare, false);
    writeProject(packed, true);
  });
  afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

  it(
    'with no icon set, no query lists icons',
    async () => {
      for (const query of [...ICON_ASKS, ...OTHER_QUERIES]) {
        const {data} = await search(query, {cwd: bare});
        expect(Object.keys(data), query).toEqual([
          'query',
          'matchCount',
          'results',
        ]);
      }
    },
    SLOW,
  );

  it(
    'with an icon set, a query that does not ask for an icon answers exactly as with none',
    async () => {
      for (const query of OTHER_QUERIES) {
        expect(await search(query, {cwd: packed}), query).toEqual(
          await search(query, {cwd: bare}),
        );
      }
    },
    SLOW,
  );

  it(
    'an icon ask lists the icons last and keeps `results` and `matchCount`',
    async () => {
      for (const query of ICON_ASKS) {
        const withPack = await search(query, {cwd: packed});
        const without = await search(query, {cwd: bare});
        const {icons, ...rest} = withPack.data;
        expect(rest, query).toEqual(without.data);
        expect(Object.keys(withPack.data).at(-1), query).toBe('icons');
        expect(icons?.results.length, query).toBeGreaterThan(0);
      }
      const {data} = await search('trash icon', {cwd: packed});
      expect(data.icons).toEqual({
        matchCount: 1,
        results: [
          {
            domain: 'icon',
            name: 'glyphs/trash',
            set: 'glyphs',
            id: 'trash',
            package: '@acme/glyphs',
            score: 90,
            reason: 'id "trash"',
            import: "import {TrashIcon} from '@acme/glyphs';",
            command: 'astryx experimental icon glyphs/trash',
          },
        ],
      });
    },
    SLOW,
  );

  it(
    'an entry that declares the keyword `icon` keeps its place: the icons only follow',
    async () => {
      for (const query of ['icon', 'icons']) {
        const withPack = await search(query, {cwd: packed});
        const without = await search(query, {cwd: bare});
        const {icons, ...rest} = withPack.data;
        expect(JSON.stringify(rest), query).toBe(JSON.stringify(without.data));
        expect(Object.keys(withPack.data), query).toEqual([
          'query',
          'matchCount',
          'results',
          'icons',
        ]);
        expect(
          icons?.results.map(each => each.id),
          query,
        ).toEqual(['image']);
      }
    },
    SLOW,
  );

  it(
    "draws each icon in the project's look, as the icon finder does",
    async () => {
      const looked = path.join(root, 'looked');
      writeProject(looked, true, {
        experimental: {iconSet: 'glyphs', iconVariant: 'solid'},
      });
      const {data} = await search('trash icon', {cwd: looked});
      const finder = await icon('trash', {cwd: looked});
      if (finder.type !== 'icon.search') throw new Error(finder.type);
      expect(data.icons?.results[0]).toMatchObject({
        id: 'trash',
        import: "import {TrashSolidIcon} from '@acme/glyphs';",
      });
      expect(data.icons?.results[0].import).toBe(finder.data.matches[0].import);
    },
    SLOW,
  );

  it(
    'names a set two packages ship as <package>/<set>, so its command runs',
    async () => {
      const twin = path.join(root, 'twin');
      writeProject(twin, true);
      writeIconPackage(path.join(twin, 'node_modules', '@other', 'glyphs'), {
        name: '@other/glyphs',
        set: 'glyphs',
        data: {...glyphsData(), module: '@other/glyphs'},
      });
      const pkg = JSON.parse(
        fs.readFileSync(path.join(twin, 'package.json'), 'utf8'),
      );
      pkg.dependencies['@other/glyphs'] = '1.0.0';
      fs.writeFileSync(path.join(twin, 'package.json'), JSON.stringify(pkg));
      const {data} = await search('trash icon', {cwd: twin});
      const entries = data.icons?.results ?? [];
      expect(entries.map(each => [each.name, each.command])).toEqual([
        [
          '@acme/glyphs/glyphs/trash',
          'astryx experimental icon @acme/glyphs/glyphs/trash',
        ],
        [
          '@other/glyphs/glyphs/trash',
          'astryx experimental icon @other/glyphs/glyphs/trash',
        ],
      ]);
      for (const entry of entries) {
        const detail = await icon(entry.name, {cwd: twin});
        expect(detail.type, entry.name).toBe('icon.detail');
      }
    },
    SLOW,
  );

  it(
    'an icon that is a feature of an answered component lists no icons and keeps the answer',
    async () => {
      for (const query of ['card with an icon', 'avatar with icon']) {
        const withPack = await search(query, {cwd: packed});
        expect(withPack.data.icons, query).toBeUndefined();
        expect(
          withPack.data.results.some(result => result.domain === 'component'),
          query,
        ).toBe(true);
        expect(withPack, query).toEqual(await search(query, {cwd: bare}));
      }
      for (const [query, id] of [
        ['card with an icon of a star', 'star'],
        ['button with plus icon', 'plus'],
        ['trash icon', 'trash'],
      ]) {
        const {data} = await search(query, {cwd: packed});
        expect(
          data.icons?.results.map(each => each.id),
          query,
        ).toContain(id);
      }
    },
    SLOW,
  );

  it(
    'lists at most three icons, fewer when `limit` is smaller',
    async () => {
      const {data} = await search('shape icon', {cwd: packed});
      expect(data.icons?.matchCount).toBe(4);
      expect(data.icons?.results.map(each => each.id)).toEqual([
        'circle',
        'square',
        'star',
      ]);
      const one = await search('shape icon', {cwd: packed, limit: 1});
      expect(one.data.icons?.results).toHaveLength(1);
      expect(one.data.icons?.matchCount).toBe(4);
    },
    SLOW,
  );

  it(
    'a search for one `type` lists no icons',
    async () => {
      const {data} = await search('trash icon', {cwd: packed, type: 'doc'});
      expect(data.icons).toBeUndefined();
    },
    SLOW,
  );

  it(
    'installing or removing the set shows on the next search',
    async () => {
      const flip = path.join(root, 'flip');
      writeProject(flip, false);
      expect((await search('trash icon', {cwd: flip})).data.icons).toBe(
        undefined,
      );
      writeProject(flip, true);
      expect(
        (await search('trash icon', {cwd: flip})).data.icons?.results[0].id,
      ).toBe('trash');
      writeProject(flip, false);
      expect((await search('trash icon', {cwd: flip})).data.icons).toBe(
        undefined,
      );
    },
    SLOW,
  );

  it(
    'the text view lists the icons last, one line each, and is unchanged otherwise',
    () => {
      const asked = cliText(packed, 'trash icon');
      expect(asked.trimEnd().split('\n').slice(-2)).toEqual([
        'Icons (1)',
        "trash (glyphs): import {TrashIcon} from '@acme/glyphs';",
      ]);
      expect(cliText(bare, 'trash icon')).toBe(
        asked.slice(0, asked.lastIndexOf('\nIcons (1)')).trimEnd() + '\n',
      );
      expect(cliText(packed, 'button')).toBe(cliText(bare, 'button'));
    },
    SLOW,
  );
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon sets over a library of icon data objects that ships each look as
 * its own package, shaped like Font Awesome: `add --variant <look> --from
 * <other package> --all` adds the look for every icon, and a pack export
 * (`fas`, an object of the other exports) is no icon and keeps the library
 * prefix coming off, also in TypeScript source under `as` or `satisfies`.
 * An icon of the set that the look's package does not
 * export is listed as missing, and a glyph whose name starts with a digit
 * (`fa0`) keeps the prefix.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {ICON_NAMES} from '../../../authoring/doctypes/icon-set/icon-names.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const SOLID = '@acme/free-solid-glyphs';
const REGULAR = '@acme/free-regular-glyphs';

/**
 * One look's package: data objects declared first and exported in one list,
 * with alias names, a prefix string, an optional pack of every icon, and a
 * declaration file.
 * @param {string} name
 * @param {string} prefix the look's prefix, `fas` or `far`
 * @param {boolean} pack whether it exports the pack under the prefix
 * @param {Array<[string, string]>} [extra] more glyphs, as export name and
 *   icon name
 * @param {boolean} [typed] whether the package is TypeScript source whose
 *   pack wraps each value in `as` or `satisfies`
 */
function writeLook(name, prefix, pack, extra = [], typed = false) {
  const lib = path.join(pkg, 'node_modules', ...name.split('/'));
  fs.mkdirSync(lib, {recursive: true});
  const source = typed ? 'index.ts' : 'index.mjs';
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name,
      version: '7.0.0',
      license: 'MIT',
      main: typed ? source : 'index.js',
      module: source,
      types: typed ? source : 'index.d.ts',
      exports: {
        '.': typed
          ? `./${source}`
          : {
              types: './index.d.ts',
              import: './index.mjs',
              require: './index.js',
            },
      },
    }),
  );
  fs.writeFileSync(path.join(lib, 'LICENSE.txt'), 'MIT License\n');
  const glyph = (/** @type {string} */ iconName, /** @type {string} */ d) =>
    `{prefix: '${prefix}', iconName: '${iconName}', icon: [512, 512, [], 'f000', '${d}']}`;
  const packValue = (/** @type {string} */ each, /** @type {number} */ at) =>
    !typed
      ? each
      : `${each} ${at % 2 === 0 ? 'as' : 'satisfies'} IconDefinition`;
  const exported = [
    'faClose',
    'faHome',
    'faHouse',
    'faMagnifyingGlass',
    'faXmark',
    ...extra.map(([each]) => each),
  ];
  fs.writeFileSync(
    path.join(lib, source),
    [
      ...(typed
        ? [
            'type IconDefinition = {prefix: string; iconName: string; icon: unknown[]};',
          ]
        : []),
      `var prefix = '${prefix}';`,
      `var faXmark = ${glyph('xmark', 'M0 0')};`,
      'var faClose = faXmark;',
      `var faHouse = ${glyph('house', 'M1 1')};`,
      'var faHome = faHouse;',
      `var faMagnifyingGlass = ${glyph('magnifying-glass', 'M2 2')};`,
      ...extra.map(
        ([each, iconName]) => `var ${each} = ${glyph(iconName, 'M3 3')};`,
      ),
      `var icons = {${exported.map((each, at) => `${each}: ${packValue(each, at)}`).join(', ')}};`,
      '',
      `export { ${pack ? `icons as ${prefix}, ` : ''}prefix, ${exported.join(', ')} };`,
      '',
    ].join('\n'),
  );
  if (typed) return;
  fs.writeFileSync(
    path.join(lib, 'index.d.ts'),
    [
      ...(pack ? [`export const ${prefix}: object;`] : []),
      'export const prefix: string;',
      ...exported.map(each => `export const ${each}: object;`),
      '',
    ].join('\n'),
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-look-packages-'));
  pkg = path.join(tmp, 'icons');
  fs.mkdirSync(path.join(pkg, 'src'), {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify(
      {
        name: '@acme/icons',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        dependencies: {[SOLID]: '^7.0.0', [REGULAR]: '^7.0.0'},
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(pkg, 'src', 'adapt.js'),
    'export function adapt(data) { return () => null; }\n',
  );
  fs.writeFileSync(
    path.join(pkg, 'index.js'),
    "export * from './icon-sets/glyphs/glyphs.generated.js';\n",
  );
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], pkg);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

const dataFile = () =>
  path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.icons.json');
const dataOf = () => JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));

/** A set with solid and regular variants and the adapter, wrapping solid. */
async function wrapSolid() {
  const created = await json([
    'experimental',
    'icon',
    'new-set',
    'glyphs',
    '--variants',
    'solid,regular',
    '--default-variant',
    'solid',
  ]);
  expect(created.code, JSON.stringify(created.body)).toBe(0);
  const data = dataOf();
  data.adapter = {module: './src/adapt.js', export: 'adapt'};
  fs.writeFileSync(dataFile(), JSON.stringify(data));
  const wrapped = await json([
    'experimental',
    'icon',
    'new-set',
    'glyphs',
    '--from',
    SOLID,
  ]);
  expect(wrapped.code, JSON.stringify(wrapped.body)).toBe(0);
}

const addRegular = () =>
  json([
    'experimental',
    'icon',
    'add',
    '--variant',
    'regular',
    '--from',
    REGULAR,
    '--all',
  ]);

/** The set's icons as `[id, export, ...variant exports]`. */
const iconRows = () =>
  dataOf().icons.map((/** @type {any} */ icon) => [
    icon.id,
    icon.export,
    ...(icon.variants ?? []).map((/** @type {any} */ each) => each.export),
  ]);

/**
 * Map every built-in definition to one icon and run the strict check.
 * Returns every issue it reports and every failure, without the skipped
 * TypeScript work.
 */
async function strictFailures() {
  const mapped = await json([
    'experimental',
    'icon',
    'map',
    '--pairs',
    ICON_NAMES.map(name => `${name}=xmark`).join(','),
  ]);
  expect(mapped.code, JSON.stringify(mapped.body)).toBe(0);
  const res = await runCli(['integration', 'check', '--strict', '--json'], pkg);
  const {checks, failures} = JSON.parse(res.stdout).data;
  return [
    ...checks.flatMap(
      (/** @type {any} */ each) => each.response?.data?.issues ?? [],
    ),
    ...failures,
  ]
    .filter(
      (/** @type {{code: string}} */ each) => each.code !== 'doc_types_skipped',
    )
    .map(
      (/** @type {{code: string, message: string}} */ each) =>
        `${each.code}: ${each.message}`,
    );
}

describe('a library of icon data objects with one package per look', () => {
  it('add --variant regular --all from the regular package adds the variant for every icon', async () => {
    writeLook(SOLID, 'fas', false);
    writeLook(REGULAR, 'far', false);
    await wrapSolid();
    const added = await addRegular();
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data).toMatchObject({added: 3, missing: []});
    expect(iconRows()).toEqual([
      ['house', 'HouseIcon', 'HouseRegularIcon'],
      ['magnifying-glass', 'MagnifyingGlassIcon', 'MagnifyingGlassRegularIcon'],
      ['xmark', 'XmarkIcon', 'XmarkRegularIcon'],
    ]);
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.generated.js'),
      'utf-8',
    );
    expect(generated).toContain(
      `import {faXmark as XmarkRegularIconSource} from '${REGULAR}';`,
    );
    expect(generated).toContain(
      'export const XmarkRegularIcon = adaptIcon(XmarkRegularIconSource);',
    );
    const again = await addRegular();
    expect(again.body.data).toMatchObject({added: 0, changed: false});
    expect(await strictFailures()).toEqual([]);
  });

  it('a pack export (`fas`) is no icon, and the `fa` prefix still comes off the names', async () => {
    writeLook(SOLID, 'fas', true);
    writeLook(REGULAR, 'far', true);
    await wrapSolid();
    expect(iconRows()).toEqual([
      ['house', 'HouseIcon'],
      ['magnifying-glass', 'MagnifyingGlassIcon'],
      ['xmark', 'XmarkIcon'],
    ]);
    const added = await addRegular();
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data).toMatchObject({added: 3, missing: []});
    expect(await strictFailures()).toEqual([]);
  });

  it('a TypeScript pack whose values use `as` or `satisfies` is no icon either', async () => {
    writeLook(SOLID, 'fas', true, [], true);
    writeLook(REGULAR, 'far', true, [], true);
    await wrapSolid();
    expect(iconRows()).toEqual([
      ['house', 'HouseIcon'],
      ['magnifying-glass', 'MagnifyingGlassIcon'],
      ['xmark', 'XmarkIcon'],
    ]);
  });

  it('icons whose names start with a digit (`fa0`, `fa500px`) keep the `fa` prefix, and the set passes the strict check', async () => {
    writeLook(SOLID, 'fas', true, [
      ['fa0', '0'],
      ['fa500px', '500px'],
    ]);
    writeLook(REGULAR, 'far', true);
    await wrapSolid();
    expect(iconRows()).toEqual([
      ['fa-0', 'Fa0Icon'],
      ['fa-500px', 'Fa500pxIcon'],
      ['house', 'HouseIcon'],
      ['magnifying-glass', 'MagnifyingGlassIcon'],
      ['xmark', 'XmarkIcon'],
    ]);
    expect(await strictFailures()).toEqual([]);
  });

  it('add --variant regular --all lists the icons the regular package does not export as missing', async () => {
    writeLook(SOLID, 'fas', true, [
      ['fa0', '0'],
      ['faTrash', 'trash'],
    ]);
    writeLook(REGULAR, 'far', true);
    await wrapSolid();
    const added = await addRegular();
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data).toMatchObject({
      added: 3,
      missing: ['fa-0', 'trash'],
    });
    expect(iconRows()).toEqual([
      ['fa-0', 'Fa0Icon'],
      ['house', 'HouseIcon', 'HouseRegularIcon'],
      ['magnifying-glass', 'MagnifyingGlassIcon', 'MagnifyingGlassRegularIcon'],
      ['trash', 'TrashIcon'],
      ['xmark', 'XmarkIcon', 'XmarkRegularIcon'],
    ]);
    const res = await runCli(
      [
        'experimental',
        'icon',
        'add',
        '--variant',
        'regular',
        '--from',
        REGULAR,
        '--all',
      ],
      pkg,
    );
    expect(res.stdout).toContain(
      `2 icons have no regular export in ${REGULAR} and keep none: fa-0, trash`,
    );
    expect(await strictFailures()).toEqual([]);
  });
});

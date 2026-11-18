// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `icon-sets` check (AST-084 FR17).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {checkIconSets, runChecks} from './doctor.mjs';
import {
  mapTemplateIcons,
  placeholderDeclaration,
} from '../../foundation/discovery/template-icons.mjs';
import {
  glyphsData,
  glyphsModules,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doctor-icons-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Parameters<typeof writeIconSetProject>[1]} options */
async function iconCheckOf(options) {
  const cwd = writeIconSetProject(tmp, options);
  // A project declares Core, so doctor checks the project, not the computer.
  const pkgFile = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  const report = await runChecks({cwd});
  return report.checks.find(check => check.id === 'icon-sets');
}

describe('icon-sets check', () => {
  it('a project with no icon-set package and no experimental.iconSet has no check', async () => {
    // Icon sets are experimental (spec:AST-017 FR27): the report is unchanged
    // until the icon feature gate is on.
    expect(await iconCheckOf({packages: []})).toBeUndefined();
  });

  it('one installed icon-set package and no experimental.iconSet passes, naming the set', async () => {
    const check = await iconCheckOf({});
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toContain(
      '"@acme/glyphs/glyphs" is the only installed icon set.',
    );
  });

  it('two installed icon-set packages and no experimental.iconSet pass, saying none is the main set', async () => {
    const check = await iconCheckOf({packages: [{}, {name: '@acme/lines'}]});
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toContain('2 icon sets installed.');
    expect(check?.message).toContain('so none is your main set');
  });

  it('the configured set installed passes', async () => {
    const check = await iconCheckOf({
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toMatch(/experimental.iconSet names "glyphs"/);
  });

  it('experimental.iconSet that two packages ship fails, naming the qualified form', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', set: 'glyphs'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.fix).toMatch(/"<package>\/<set>"/);
  });

  it('a main set and a backup, both installed, pass and name the order', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {experimental: {iconSet: ['glyphs', 'lines']}},
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toContain('"@acme/lines/lines" as backup');
  });

  it('passes with a variant the main set declares, and says each icon draws that look', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {
        experimental: {iconSet: ['glyphs', 'lines'], iconVariant: 'solid'},
      },
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toContain(
      'Each icon draws its "solid" look where its set has one.',
    );
  });

  it('fails a variant the main set does not declare, naming its variants and the command that picks one', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {
        experimental: {iconSet: ['glyphs', 'lines'], iconVariant: 'filled'},
      },
    });
    expect(check).toEqual({
      id: 'icon-sets',
      label: 'Icon sets',
      status: 'fail',
      message:
        'experimental.iconVariant names "filled", but the main set glyphs declares no such variant. Its variants: outline, solid.',
      fix: 'Pick one of its variants: `astryx experimental icon use glyphs --backup lines --variant <variant>`.',
    });
  });

  it('an unlisted set fails with a fix that keeps the look', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup lines --variant solid`',
    );
  });

  it('fails a variant for a main set with one look, with the command that removes it', async () => {
    const {variants, default: _default, ...data} = glyphsData();
    const check = await iconCheckOf({
      packages: [
        {
          data: {
            ...data,
            module: '@acme/glyphs',
            icons: data.icons.map(({variants: _variants, ...each}) => each),
          },
        },
      ],
      config: {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
    });
    expect(check).toMatchObject({
      status: 'fail',
      message:
        'experimental.iconVariant names "solid", but the main set glyphs declares no variants: it draws one look.',
      fix: 'Remove experimental.iconVariant: run `astryx experimental icon use glyphs`.',
    });
  });

  it('a backup that is not installed fails', async () => {
    const check = await iconCheckOf({
      config: {experimental: {iconSet: ['glyphs', 'nope']}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.message).toMatch(/names "nope", but no installed set/);
  });

  it('two sets installed and one left out of the list fails, with the command that adds it', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.message).toContain(
      '2 icon sets are installed and lines is not in your list (experimental.iconSet)',
    );
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup lines`',
    );
  });

  it('experimental.iconSet naming a set that is not installed fails', async () => {
    expect(
      await iconCheckOf({config: {experimental: {iconSet: 'nope'}}}),
    ).toMatchObject({
      status: 'fail',
    });
  });

  it('experimental.iconSet naming an installed set that was withdrawn fails, saying withdrawn and why', async () => {
    const invalid = await iconCheckOf({
      packages: [{data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(invalid).toMatchObject({status: 'fail'});
    expect(invalid?.message).toMatch(
      /names "glyphs", which is installed but withdrawn: .*not valid JSON/,
    );
    expect(invalid?.message).not.toMatch(/no installed set has that name/);
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp);
    const unresolved = await iconCheckOf({
      packages: [{data: {...glyphsData(), module: '@acme/not-installed'}}],
      config: {experimental: {iconSet: '@acme/glyphs/glyphs'}},
    });
    expect(unresolved).toMatchObject({status: 'fail'});
    expect(unresolved?.message).toMatch(
      /installed but withdrawn: .*does not resolve from the project/,
    );
  });

  it('an invalid data file of an unlisted set warns with the reason', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toMatch(/not valid JSON/);
  });

  it('has no check when the project could not be read', () => {
    const check = checkIconSets(
      /** @type {any} */ ({cwd: tmp, iconSets: null, projectError: 'boom'}),
    );
    expect(check).toBeNull();
  });
});

describe('icon-placeholders check', () => {
  /**
   * @param {Record<string, unknown> | null} config
   * @param {Record<string, string>} files project files by relative path
   * @param {Array<Record<string, unknown>>} [packages] the icon packages
   *   installed; one valid set when omitted
   */
  async function placeholderCheckOf(config, files, packages = undefined) {
    const cwd = writeIconSetProject(tmp, {
      config,
      ...(packages ? {packages} : {}),
    });
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
      fs.writeFileSync(path.join(cwd, rel), text);
    }
    const report = await runChecks({cwd});
    return report.checks.find(check => check.id === 'icon-placeholders');
  }

  const PAGE = [
    "import {Icon} from '@astryxdesign/core/Icon';",
    '',
    placeholderDeclaration('MissingIcon'),
    '',
    'export const A = () => (',
    '  <>',
    '    <Icon icon={MissingIcon /* missing icon: cut */} />',
    '    <MissingIcon /* missing icon: fire */ className="x" />',
    '  </>',
    ');',
    '',
  ].join('\n');

  it('warns for each placeholder in copied code, naming the file, the meaning and both fixes', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': PAGE},
    );
    expect(check).toMatchObject({status: 'warn', label: 'Placeholder icons'});
    expect(check?.message).toContain(
      '2 placeholder icons in copied code: no set in your list has "cut", "fire"',
    );
    expect(check?.message).toContain('src/page.tsx (cut, fire)');
    expect(check?.fix).toContain(
      '`astryx experimental icon map cut <icon> --set glyphs`',
    );
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup <set>`',
    );
    expect(check?.fix).toContain(
      'replace each use of the placeholder (`MissingIcon`)',
    );
  });

  it("keeps the project's look in the fix that adds a backup", async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs', iconVariant: 'solid'}},
      {'src/page.tsx': PAGE},
    );
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup <set> --variant solid`',
    );
  });

  it('names the same fixes `astryx template` reports for the placeholder it writes', async () => {
    const set = /** @type {any} */ ({
      name: 'glyphs',
      package: '@acme/glyphs',
      license: 'MIT',
      data: {...glyphsData(), module: '@acme/glyphs', map: {close: 'x'}},
    });
    const copied = mapTemplateIcons(
      [
        "import {PencilGlyph} from '@acme/library';",
        'export const A = () => <PencilGlyph />;',
        '',
      ].join('\n'),
      {sets: [set], choice: {status: 'selected', set, reason: 'only set'}},
      {PencilGlyph: 'edit'},
    );
    const fixes = copied.icons.placeholder.flatMap(each => each.fixes);
    expect(fixes).toHaveLength(2);
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': copied.source},
    );
    expect(check).toMatchObject({status: 'warn'});
    for (const fix of fixes) expect(check?.fix).toContain(`\`${fix}\``);
  });

  it('a commented-out or quoted copy of the placeholder is not a use', async () => {
    const commented = [
      placeholderDeclaration('MissingIcon'),
      'const B = () => <MissingIcon /* missing icon: cut */ />;',
    ]
      .join('\n')
      .split('\n')
      .map(line => `// ${line}`)
      .concat(['export const A = 1;', ''])
      .join('\n');
    const quoted = [
      `export const SAMPLE = ${JSON.stringify(
        `${placeholderDeclaration('MissingIcon')}\n<MissingIcon /* missing icon: cut */ />`,
      )};`,
      '',
    ].join('\n');
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/commented.tsx': commented, 'src/quoted.tsx': quoted},
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('a declaration with no uses left is not a warning', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {
        'src/page.tsx': `${placeholderDeclaration('MissingIcon')}\nexport const A = 1;\n`,
      },
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('passes when no copied code uses the placeholder', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': 'export const A = 1;\n'},
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('a project with no icon-set package and no experimental.iconSet has no check', async () => {
    expect(
      await placeholderCheckOf(null, {'src/page.tsx': PAGE}, []),
    ).toBeUndefined();
  });

  it('one installed icon-set package and no experimental.iconSet warns about a placeholder in use', async () => {
    const check = await placeholderCheckOf(null, {'src/page.tsx': PAGE});
    expect(check).toMatchObject({status: 'warn'});
  });

  it('two installed icon-set packages and no main set have no placeholder check', async () => {
    expect(
      await placeholderCheckOf(null, {'src/page.tsx': PAGE}, [
        {},
        {name: '@acme/lines'},
      ]),
    ).toBeUndefined();
  });
});

describe('icon-imports check', () => {
  /**
   * @param {Parameters<typeof writeIconSetProject>[1]} options
   * @param {Record<string, string>} files project files by relative path
   * @param {Record<string, string>} [extraDependencies]
   * @param {Record<string, unknown>} [packageFields] more package.json fields
   */
  async function importsCheckOf(
    options,
    files,
    extraDependencies = {},
    packageFields = {},
  ) {
    const cwd = writeIconSetProject(tmp, options);
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.dependencies = {
      ...pkg.dependencies,
      '@astryxdesign/core': '*',
      ...extraDependencies,
    };
    Object.assign(pkg, packageFields);
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
      fs.writeFileSync(path.join(cwd, rel), text);
    }
    const report = await runChecks({cwd});
    return report.checks.find(check => check.id === 'icon-imports');
  }

  /** A second set whose icon `ring` draws `search` and `trash` draws `delete`; it maps no `close`. */
  const lines = () => ({
    name: '@acme/lines',
    data: {
      ...glyphsData(),
      module: '@acme/lines',
      map: {search: 'ring', delete: 'trash'},
      icons: [
        ...glyphsData().icons,
        {id: 'ring', export: 'RingIcon', words: ['ring']},
      ],
    },
    modules: {
      ...glyphsModules(),
      'index.js': `${glyphsModules()['index.js']}export {SearchIcon as RingIcon} from './icons/search.js';\n`,
    },
  });

  const PAGE = [
    "import {RingIcon, XIcon, HomeIcon, TrashIcon} from '@acme/lines';",
    "import {SearchIcon} from '@acme/glyphs';",
    'export const A = () => <><RingIcon /><XIcon /><HomeIcon /><TrashIcon /><SearchIcon /></>;',
    '',
  ].join('\n');

  it('has no check with no pack and no experimental.iconSet, or while the main set is undecided', async () => {
    expect(
      await importsCheckOf({packages: []}, {'src/page.tsx': PAGE}),
    ).toBeUndefined();
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp);
    expect(
      await importsCheckOf({packages: [{}, lines()]}, {'src/page.tsx': PAGE}),
    ).toBeUndefined();
  });

  it('the only installed pack is the main set without a list', async () => {
    const check = await importsCheckOf(
      {packages: [lines()]},
      {
        'src/page.tsx': [
          "import {TrashIcon} from '@acme/gone';",
          'export const A = () => <TrashIcon />;',
          '',
        ].join('\n'),
      },
    );
    expect(check).toMatchObject({status: 'fail'});
  });

  it('passes when every icon comes from the set the list picks for it', async () => {
    const check = await importsCheckOf(
      {
        packages: [{}, lines()],
        config: {experimental: {iconSet: ['glyphs', 'lines']}},
      },
      {
        'src/page.tsx': [
          "import {SearchIcon, XIcon} from '@acme/glyphs';",
          // `home` draws no definition the main set maps: the backup supplies it.
          "import {HomeIcon} from '@acme/lines';",
          'export const A = () => <><SearchIcon /><XIcon /><HomeIcon /></>;',
          '',
        ].join('\n'),
      },
    );
    expect(check).toMatchObject({status: 'pass', label: 'Icon imports'});
  });

  it('warns for an icon from a backup when the main set draws the same meaning, naming the file, the import and its replacement', async () => {
    const check = await importsCheckOf(
      {
        packages: [{}, lines()],
        config: {experimental: {iconSet: ['glyphs', 'lines']}},
      },
      {'src/page.tsx': PAGE},
    );
    expect(check).toEqual({
      id: 'icon-imports',
      label: 'Icon imports',
      status: 'warn',
      message:
        '1 icon import in 1 file come from @acme/lines/lines, not the set your list (experimental.iconSet) picks for that meaning: src/page.tsx (@acme/lines → @acme/glyphs: RingIcon → SearchIcon).',
      fix: 'Import each icon named after → from the module named after →. An icon with no → needs a set in your list that has its meaning, or your own choice of icon: `astryx experimental icon use glyphs --backup lines --backup <set>`.',
    });
  });

  it('warns for every icon from an installed set the list leaves out, with or without a replacement', async () => {
    const check = await importsCheckOf(
      {
        packages: [{}, lines()],
        config: {experimental: {iconSet: 'glyphs'}},
      },
      {'src/page.tsx': PAGE},
    );
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toContain(
      'src/page.tsx (@acme/lines → @acme/glyphs: RingIcon → SearchIcon; @acme/lines: XIcon (its set maps it to no Astryx meaning), HomeIcon (its set maps it to no Astryx meaning), TrashIcon (no set in your list has "delete"))',
    );
  });

  it('reads an import of the library a set wraps through that set', async () => {
    const wrapper = {
      name: '@acme/hero',
      data: {
        schemaVersion: 1,
        module: '@acme/hero',
        source: {package: '@acme/library', version: '1.0.0'},
        generated: './generated.js',
        map: {close: 'x'},
        icons: [{id: 'x', export: 'XIcon', words: ['close']}],
      },
      modules: {
        'index.js': "export * from './generated.js';\n",
        'generated.js': "export {XMarkIcon as XIcon} from '@acme/library';\n",
      },
    };
    const page = [
      "import {XMarkIcon} from '@acme/library/24/outline';",
      'export const A = () => <XMarkIcon />;',
      '',
    ].join('\n');
    const generated =
      "export {XMarkIcon as XIcon} from '@acme/library/24/outline';\n";
    const check = await importsCheckOf(
      {
        packages: [
          {},
          {
            ...wrapper,
            modules: {...wrapper.modules, 'generated.js': generated},
          },
        ],
        config: {experimental: {iconSet: ['glyphs', 'hero']}},
      },
      {'src/page.tsx': page},
    );
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toContain(
      'src/page.tsx (@acme/library/24/outline → @acme/glyphs: XMarkIcon → XIcon)',
    );
  });

  it('the main set’s own library is the icon the project chose', async () => {
    const check = await importsCheckOf(
      {
        packages: [
          {
            data: {
              ...glyphsData(),
              source: {package: '@acme/library', version: '1.0.0'},
            },
          },
        ],
        config: {experimental: {iconSet: 'glyphs'}},
      },
      {
        'src/page.tsx': [
          "import {XMarkIcon} from '@acme/library';",
          'export const A = () => <XMarkIcon />;',
          '',
        ].join('\n'),
      },
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('fails for an icon-named import of a package that is not installed or declared, and only that', async () => {
    const check = await importsCheckOf(
      {config: {experimental: {iconSet: 'glyphs'}}},
      {
        'src/page.tsx': [
          "import {TrashIcon, PlusIcon} from '@acme/uninstalled';",
          "import {helper} from '@acme/not-icons';",
          "import Thing from '@acme/default-only';",
          "import {CogIcon} from '@acme/declared';",
          "import type {BoltIcon} from '@acme/types-only';",
          "import * as Glyphs from '@acme/namespace-only';",
          'export const A = () => <><TrashIcon /><PlusIcon /><CogIcon /><Glyphs.StarIcon /></>;',
          '',
        ].join('\n'),
      },
      {'@acme/declared': '1.0.0'},
    );
    expect(check).toEqual({
      id: 'icon-imports',
      label: 'Icon imports',
      status: 'fail',
      message:
        '2 icon imports in 1 file name a package that is not installed, so the build fails: src/page.tsx (@acme/uninstalled: TrashIcon, PlusIcon).',
      fix: 'Replace each import of a package that is not installed with the icon `astryx experimental icon <meaning>` prints; or install that package again, and doctor names the icon of your list that draws the same meaning.',
    });
  });

  it('an icon component of your own, reached through a path alias, baseUrl, or package.json imports, is not a missing package', async () => {
    const check = await importsCheckOf(
      {config: {experimental: {iconSet: 'glyphs'}}},
      {
        'tsconfig.json': JSON.stringify({
          compilerOptions: {baseUrl: 'src', paths: {'@/*': ['src/*']}},
        }),
        'src/icons/logo.tsx': 'export const LogoIcon = () => null;\n',
        'src/page.tsx': [
          "import {BrandIcon} from '@/components/BrandIcon';",
          "import {LogoIcon} from 'icons/logo';",
          "import {HomeIcon} from '~/icons';",
          "import {MenuIcon} from '#icons';",
          'export const A = () => <><BrandIcon /><LogoIcon /><HomeIcon /><MenuIcon /></>;',
          '',
        ].join('\n'),
        'src/menu.tsx': 'export const MenuIcon = () => null;\n',
      },
      {},
      {imports: {'#icons': './src/menu.tsx'}},
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('an icon component of your own, imported through baseUrl with a .js name for its .tsx source, is not a missing package', async () => {
    const check = await importsCheckOf(
      {config: {experimental: {iconSet: 'glyphs'}}},
      {
        'tsconfig.json': JSON.stringify({compilerOptions: {baseUrl: '.'}}),
        'src/rows.tsx': 'export const RowsIcon = () => null;\n',
        'src/page.tsx': ["import {RowsIcon} from 'src/rows.js';", 'export const A = () => <RowsIcon />;', ''].join('\n'),
      },
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('still fails for imports of the main set once its package is uninstalled', async () => {
    const check = await importsCheckOf(
      {packages: [], config: {experimental: {iconSet: '@acme/glyphs/glyphs'}}},
      {
        'src/page.tsx': [
          "import {XIcon} from '@acme/glyphs';",
          'export const A = () => <XIcon />;',
          '',
        ].join('\n'),
      },
    );
    expect(check).toMatchObject({
      status: 'fail',
      message:
        '1 icon import in 1 file name a package that is not installed, so the build fails: src/page.tsx (@acme/glyphs: XIcon).',
    });
  });

  it('reads a named re-export like an import', async () => {
    const check = await importsCheckOf(
      {config: {experimental: {iconSet: 'glyphs'}}},
      {
        'src/icons.ts': [
          "export {TrashIcon} from '@acme/uninstalled';",
          "export type {BoltIcon} from '@acme/types-only';",
          "export * from '@acme/everything';",
          '',
        ].join('\n'),
      },
    );
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.message).toContain(
      'src/icons.ts (@acme/uninstalled: TrashIcon)',
    );
    expect(check?.message).not.toContain('types-only');
  });

  it('a project whose code imports no icon passes', async () => {
    const check = await importsCheckOf(
      {config: {experimental: {iconSet: 'glyphs'}}},
      {'src/page.tsx': 'export const A = 1;\n'},
    );
    expect(check).toMatchObject({status: 'pass'});
  });
});

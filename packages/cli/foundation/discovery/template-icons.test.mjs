// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon mapping (AST-084 FR9, FR10): a template's declared
 * icon definitions, an installed set's icons and reviewed matches, a kept
 * icon, a variant, a name collision, and no set. Nothing is guessed from
 * names or words.
 */

import {describe, expect, it} from 'vitest';
import {
  iconsNotImported,
  mapTemplateIcons,
  matchIcon,
  placeholderDeclaration,
  placeholderUses,
} from './template-icons.mjs';
import {glyphsData} from '../../test-utils/icon-set-fixture.mjs';

const SET = /** @type {any} */ ({
  name: 'glyphs',
  package: '@acme/glyphs',
  license: 'MIT',
  data: {
    ...glyphsData(),
    module: '@acme/glyphs',
    map: {close: 'x', search: 'search', delete: 'trash', home: 'home'},
  },
});

/** @type {any} */
const SELECTED = {status: 'selected', set: SET, reason: 'only set'};

/**
 * @param {string} source
 * @param {Record<string, string>} [declared]
 * @param {any} [choice]
 * @param {any[]} [sets]
 */
const map = (source, declared = {}, choice = SELECTED, sets = [SET]) =>
  mapTemplateIcons(source, {sets, choice}, declared);

describe('matchIcon', () => {
  it("maps by the project set's map for the declared definition, and never by name", () => {
    expect(
      matchIcon(
        {
          setName: null,
          export: 'BinIcon',
          id: 'BinIcon',
          definitions: ['delete'],
        },
        SET,
      ),
    ).toMatchObject({by: 'definition', icon: {id: 'trash'}});
    // Same id as a set icon, but no definition: not mapped.
    expect(
      matchIcon(
        {setName: null, export: 'HomeIcon', id: 'home', definitions: []},
        SET,
      ),
    ).toBeNull();
    // A definition the set does not map: not mapped.
    expect(
      matchIcon(
        {
          setName: null,
          export: 'PencilIcon',
          id: 'PencilIcon',
          definitions: ['edit'],
        },
        SET,
      ),
    ).toBeNull();
  });
});

describe('mapTemplateIcons', () => {
  const SOURCE = [
    "import React from 'react';",
    "import {CloseGlyph, PencilGlyph, HomeGlyph as House} from '@acme/library';",
    "import {BinGlyph} from '@acme/library/solid';",
    '',
    'export default function Page() {',
    '  const icons = {CloseGlyph};',
    '  return <div><CloseGlyph className="x" /><PencilGlyph /><House /><BinGlyph />{icons.CloseGlyph}</div>;',
    '}',
    '',
  ].join('\n');
  const DECLARED = {
    CloseGlyph: 'close',
    PencilGlyph: 'edit',
    HomeGlyph: 'home',
    BinGlyph: 'delete',
  };

  it('rewrites each declared icon the set maps, every reference too, and draws the local placeholder for the rest', () => {
    const {source, icons} = map(SOURCE, DECLARED);
    expect(source).toContain(
      "import {XIcon, HomeIcon, TrashIcon} from '@acme/glyphs';\n",
    );
    expect(source).not.toContain('@acme/library');
    expect(source).not.toContain('@astryxdesign/core/Icon');
    expect(source).toContain('<XIcon className="x" />');
    expect(source).toContain('<HomeIcon />');
    expect(source).toContain('<MissingIcon /* missing icon: edit */ />');
    expect(source).not.toContain('PencilGlyph');
    // Declared once, above the first statement that is not an import.
    expect(source.split('function MissingIcon(').length).toBe(2);
    expect(source).toContain(`${placeholderDeclaration('MissingIcon')}\n\n`);
    expect(source).not.toMatch(/data-[a-z]/u);
    // A property name keeps its text; a shorthand property keeps its key.
    expect(source).toContain('const icons = {CloseGlyph: XIcon};');
    expect(source).toContain('{icons.CloseGlyph}');
    expect(icons.status).toBe('selected');
    expect(
      icons.mapped.map(each => [
        each.source.export,
        each.target.export,
        each.by,
      ]),
    ).toEqual([
      ['CloseGlyph', 'XIcon', 'definition'],
      ['HomeGlyph', 'HomeIcon', 'definition'],
      ['BinGlyph', 'TrashIcon', 'definition'],
    ]);
    expect(icons.kept).toEqual([]);
    expect(icons.placeholder).toEqual([
      {
        source: {module: '@acme/library', export: 'PencilGlyph'},
        target: {local: 'MissingIcon'},
        definitions: ['edit'],
        fixes: [
          'astryx experimental icon map edit <icon> --set glyphs',
          'astryx experimental icon use glyphs --backup <set>',
        ],
      },
    ]);
    expect(icons.sets).toEqual([
      {set: '@acme/glyphs/glyphs', license: 'MIT', icons: 3},
    ]);
  });

  it("drops a library's sizing props from a mapped icon and reports them", () => {
    const {source, icons} = map(
      [
        "import {CloseGlyph, PencilGlyph} from '@acme/library';",
        '',
        'export const A = () => (',
        '  <div>',
        '    <CloseGlyph size={16} strokeWidth={2} className="x" />',
        '    <CloseGlyph',
        '      absoluteStrokeWidth',
        '    />',
        '    <PencilGlyph size={16} />',
        '  </div>',
        ');',
        '',
      ].join('\n'),
      DECLARED,
    );
    expect(source).toContain('<XIcon className="x" />');
    expect(source).toMatch(/<XIcon\s*\/>/u);
    expect(source).not.toContain('absoluteStrokeWidth');
    // A placeholder takes its size from CSS too.
    expect(source).toContain('<MissingIcon /* missing icon: edit */ />');
    expect(icons.mapped[0].dropped).toEqual([
      'absoluteStrokeWidth',
      'size',
      'strokeWidth',
    ]);
    expect(icons.placeholder[0].dropped).toEqual(['size']);
  });

  it('keeps comments inside and after a rewritten import line', () => {
    const {source} = map(
      [
        "import {CloseGlyph /* close */, PencilGlyph /* pen */} from '@acme/library'; // tools",
        "import {HomeGlyph} from '@acme/library/home'; // the home link",
        '',
        'export const A = () => <><CloseGlyph /><PencilGlyph /><HomeGlyph /></>;',
        '',
      ].join('\n'),
      DECLARED,
    );
    expect(source).toContain('/* close */');
    expect(source).toContain('/* pen */');
    expect(source).toContain('// tools');
    expect(source).toContain('// the home link');
    // Each comment is outside any code it would swallow.
    expect(source).not.toContain("from '@acme/library'");
    expect(source).toMatch(/^\/\/ tools$/mu);
    expect(source).toMatch(/^\/\/ the home link$/mu);
  });

  it('an undeclared import is not an icon: it is left alone and not reported', () => {
    const source =
      "import {CloseGlyph} from '@acme/library';\nexport const A = () => <CloseGlyph />;\n";
    expect(map(source)).toEqual({
      source,
      icons: expect.objectContaining({mapped: [], kept: []}),
    });
  });

  it("a declaration never matches an import from an Astryx package: Core's Table stays", () => {
    const source = [
      "import {Table} from '@astryxdesign/core/Table';",
      "import {Table as TableIcon, CloseGlyph} from '@acme/library';",
      'export const A = () => <Table icon={TableIcon} close={CloseGlyph} />;',
      '',
    ].join('\n');
    const declared = {Table: 'search', CloseGlyph: 'close'};
    const {source: out, icons} = map(source, declared);
    expect(out).toContain("import {Table} from '@astryxdesign/core/Table';");
    expect(out).toContain("import {SearchIcon, XIcon} from '@acme/glyphs';");
    expect(out).not.toContain('@acme/library');
    expect(out).toContain('<Table icon={SearchIcon} close={XIcon} />');
    expect(
      icons.mapped.map(each => [each.source.module, each.source.export]),
    ).toEqual([
      ['@acme/library', 'Table'],
      ['@acme/library', 'CloseGlyph'],
    ]);
  });

  it('imports under an alias when the mapped name is taken', () => {
    const {source} = map(
      "import {CloseGlyph} from '@acme/library';\nconst XIcon = 1;\nexport const A = () => <CloseGlyph />;\n",
      {CloseGlyph: 'close'},
    );
    expect(source).toContain("import {XIcon as XIcon2} from '@acme/glyphs';");
    expect(source).toContain('<XIcon2 />');
    expect(source).toContain('const XIcon = 1;');
  });

  it('without a project icon set the source is unchanged and the report says why', () => {
    for (const status of ['none', 'ambiguous']) {
      const {source, icons} = map(SOURCE, DECLARED, {status, reason: 'why'});
      expect(source).toBe(SOURCE);
      expect(icons).toEqual({
        status,
        set: null,
        reason: 'why',
        mapped: [],
        placeholder: [],
        kept: [],
        sets: [],
      });
    }
  });

  it('leaves imports from the project set alone, and reports them as kept', () => {
    const source =
      "import {XIcon} from '@acme/glyphs';\nexport const A = () => <XIcon />;\n";
    expect(map(source, {XIcon: 'close'})).toEqual({
      source,
      icons: expect.objectContaining({
        mapped: [],
        kept: [
          {
            module: '@acme/glyphs',
            export: 'XIcon',
            reason: 'it is already imported from @acme/glyphs/glyphs',
          },
        ],
      }),
    });
  });
});

describe('every binding form a declared key can name (FR10)', () => {
  it('a named import maps by the name it imports', () => {
    const {source, icons} = map(
      "import {BinGlyph} from '@acme/library';\nexport const A = () => <BinGlyph />;\n",
      {BinGlyph: 'delete'},
    );
    expect(source).toContain("import {TrashIcon} from '@acme/glyphs';");
    expect(source).toContain('<TrashIcon />');
    expect(icons?.mapped).toHaveLength(1);
    expect(icons?.kept).toEqual([]);
  });

  it('an aliased named import maps by the name it imports, not its local name', () => {
    const {source, icons} = map(
      "import {BinGlyph as Bin} from '@acme/library';\nexport const A = () => <Bin />;\n",
      {BinGlyph: 'delete'},
    );
    expect(source).toContain("import {TrashIcon} from '@acme/glyphs';");
    expect(source).toContain('<TrashIcon />');
    expect(icons?.mapped[0].source).toEqual({
      module: '@acme/library',
      export: 'BinGlyph',
    });
    // Its local name is not a key.
    expect(
      map(
        "import {BinGlyph as Bin} from '@acme/library';\nexport const A = () => <Bin />;\n",
        {Bin: 'delete'},
      ).icons?.kept,
    ).toEqual([
      {module: null, export: 'Bin', reason: 'the template does not import it'},
    ]);
  });

  it("a default import maps by its local name, to the set's named import under that name", () => {
    const {source, icons} = map(
      "import DeleteIcon from '@mui/icons-material/Delete';\nexport const A = () => <DeleteIcon />;\n",
      {DeleteIcon: 'delete'},
    );
    expect(source).toBe(
      "import {TrashIcon as DeleteIcon} from '@acme/glyphs';\nexport const A = () => <DeleteIcon />;\n",
    );
    expect(icons?.mapped).toEqual([
      expect.objectContaining({
        source: {module: '@mui/icons-material/Delete', export: 'default'},
        target: expect.objectContaining({export: 'TrashIcon'}),
        by: 'definition',
      }),
    ]);
    expect(icons?.kept).toEqual([]);
  });

  it('a default import beside named ones keeps the rest of its import', () => {
    const {source} = map(
      "import DeleteIcon, {useThing} from '@acme/library';\nexport const A = () => <DeleteIcon />;\n",
      {DeleteIcon: 'delete'},
    );
    expect(source).toContain(
      "import {TrashIcon as DeleteIcon} from '@acme/glyphs';",
    );
    expect(source).toContain("import {useThing} from '@acme/library';");
  });

  it('a default import the set cannot map draws the local placeholder', () => {
    const result = map(
      "import PencilIcon from '@acme/library/pencil';\nexport const A = () => <PencilIcon />;\n",
      {PencilIcon: 'edit'},
    );
    expect(result.source).toBe(
      `${placeholderDeclaration('MissingIcon')}\n\nexport const A = () => <MissingIcon /* missing icon: edit */ />;\n`,
    );
    expect(result.icons?.placeholder).toEqual([
      expect.objectContaining({
        source: {module: '@acme/library/pencil', export: 'default'},
        definitions: ['edit'],
      }),
    ]);
  });

  it('a namespace import is kept, with why', () => {
    const source =
      "import * as Icons from '@acme/library';\nexport const A = () => <Icons.BinGlyph />;\n";
    const result = map(source, {Icons: 'delete'});
    expect(result.source).toBe(source);
    expect(result.icons?.kept).toEqual([
      {
        module: '@acme/library',
        export: '*',
        reason:
          'it is a namespace import, which is not mapped: import the icon by name',
      },
    ]);
  });

  it('a side-effect import binds nothing: the key is not imported', () => {
    const source =
      "import '@acme/library/styles.css';\nexport const A = () => null;\n";
    const result = map(source, {BinGlyph: 'delete'});
    expect(result.source).toBe(source);
    expect(result.icons?.kept).toEqual([
      {
        module: null,
        export: 'BinGlyph',
        reason: 'the template does not import it',
      },
    ]);
  });

  it('a re-export is kept, with why', () => {
    const source =
      "export {BinGlyph} from '@acme/library';\nexport const A = () => null;\n";
    const result = map(source, {BinGlyph: 'delete'});
    expect(result.source).toBe(source);
    expect(result.icons?.kept).toEqual([
      {
        module: '@acme/library',
        export: 'BinGlyph',
        reason:
          'the template re-exports it rather than importing it, so it is not mapped',
      },
    ]);
  });

  it('a type-only import is kept, with why', () => {
    for (const line of [
      "import type {BinGlyph} from '@acme/library';",
      "import {type BinGlyph} from '@acme/library';",
    ]) {
      const source = `${line}\nexport const A = (p: BinGlyph) => null;\n`;
      const result = map(source, {BinGlyph: 'delete'});
      expect(result.source).toBe(source);
      expect(result.icons?.kept).toEqual([
        {
          module: '@acme/library',
          export: 'BinGlyph',
          reason: 'it is a type-only import, which draws no icon',
        },
      ]);
    }
  });

  it('an import from an Astryx package only is kept, with why', () => {
    const source =
      "import {Table} from '@astryxdesign/core/Table';\nexport const A = () => <Table />;\n";
    expect(map(source, {Table: 'table'}).icons?.kept).toEqual([
      {
        module: '@astryxdesign/core/Table',
        export: 'Table',
        reason:
          'it is imported from an Astryx package, which ships components, not icons',
      },
    ]);
  });

  it('iconsNotImported lists the keys no import or re-export binds', () => {
    const source = [
      "import '@acme/side-effect';",
      "import Def from 'a';",
      "import * as Ns from 'b';",
      "import {Named as Local} from 'c';",
      "import type {Typed} from 'd';",
      "export {Again} from 'e';",
      'export const A = () => null;',
      '',
    ].join('\n');
    expect(
      iconsNotImported(source, {
        Def: 'a',
        Ns: 'b',
        Named: 'c',
        Local: 'c',
        Typed: 'd',
        Again: 'e',
        Missing: 'f',
      }),
    ).toEqual(['Local', 'Missing']);
    expect(iconsNotImported('not ( valid', {X: 'y'})).toBeNull();
  });
});

describe('icons another installed set ships', () => {
  const OTHER = /** @type {any} */ ({
    name: 'lines',
    package: '@acme/lines',
    data: {
      schemaVersion: 1,
      module: '@acme/lines',
      variants: ['outline', 'solid'],
      default: {variant: 'outline'},
      map: {close: 'cross'},
      icons: [
        {
          id: 'cross',
          export: 'CrossIcon',
          words: ['cross'],
          variants: [{variant: 'solid', export: 'CrossSolidIcon'}],
        },
        {id: 'bin', export: 'BinIcon', words: ['bin']},
      ],
    },
  });

  it("maps by the source set's map, with no declaration, and keeps the variant", () => {
    const {source, icons} = map(
      "import {CrossIcon, CrossSolidIcon, BinIcon} from '@acme/lines';\nexport const A = () => <><CrossIcon /><CrossSolidIcon /><BinIcon /></>;\n",
      {},
      SELECTED,
      [SET, OTHER],
    );
    expect(
      icons.mapped.map(each => [each.source.export, each.target.export]),
    ).toEqual([
      ['CrossIcon', 'XIcon'],
      ['CrossSolidIcon', 'XIcon'],
    ]);
    // bin draws no definition the lines set maps: kept.
    expect(icons.kept.map(each => each.export)).toEqual(['BinIcon']);
    expect(source).toContain("import {BinIcon} from '@acme/lines';");
  });

  it('a reviewed exact match beats the definition, and a likely one is only suggested', () => {
    const REVIEWED = /** @type {any} */ ({
      ...SET,
      data: {
        ...SET.data,
        icons: SET.data.icons.map((/** @type {any} */ icon) =>
          icon.id === 'home'
            ? {
                ...icon,
                matches: [
                  {set: 'lines', export: 'CrossIcon', confidence: 'exact'},
                  {set: 'lines', export: 'BinIcon', confidence: 'likely'},
                ],
              }
            : icon,
        ),
      },
    });
    const {icons} = map(
      "import {CrossIcon, BinIcon} from '@acme/lines';\nexport const A = () => <><CrossIcon /><BinIcon /></>;\n",
      {},
      {status: 'selected', set: REVIEWED, reason: 'only set'},
      [REVIEWED, OTHER],
    );
    expect(icons.mapped).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({id: 'home'}),
        by: 'match',
      }),
    ]);
    expect(icons.kept).toEqual([
      expect.objectContaining({
        export: 'BinIcon',
        suggestion: expect.objectContaining({id: 'home', confidence: 'likely'}),
      }),
    ]);
  });
});

describe('one key for a name imported from two modules (FR9)', () => {
  it('maps both imports by the one key, and each keeps its variant', () => {
    const LINES = /** @type {any} */ ({
      name: 'lines',
      package: '@acme/lines',
      data: {
        schemaVersion: 1,
        module: '@acme/lines',
        variants: ['outline', 'solid'],
        default: {variant: 'outline'},
        map: {delete: 'trash'},
        icons: [
          {
            id: 'trash',
            export: 'TrashIcon',
            words: ['trash'],
            variants: [
              {
                variant: 'solid',
                export: 'TrashIcon',
                module: '@acme/lines/solid',
              },
            ],
          },
        ],
      },
    });
    const {source, icons} = map(
      [
        "import {TrashIcon} from '@acme/lines';",
        "import {TrashIcon as TrashSolid} from '@acme/lines/solid';",
        'export const A = () => <><TrashIcon /><TrashSolid /></>;',
        '',
      ].join('\n'),
      {TrashIcon: 'delete'},
      SELECTED,
      [SET, LINES],
    );
    expect(
      icons.mapped.map(each => [each.source.module, each.target.export]),
    ).toEqual([
      ['@acme/lines', 'TrashIcon'],
      ['@acme/lines/solid', 'TrashSolidIcon'],
    ]);
    expect(source).toContain(
      "import {TrashIcon, TrashSolidIcon} from '@acme/glyphs';",
    );
  });
});

describe('a main set with backups', () => {
  const BRAND = /** @type {any} */ ({
    name: 'brand',
    package: '@acme/brand',
    license: 'Apache-2.0',
    data: {
      schemaVersion: 1,
      module: '@acme/brand',
      default: {variant: 'outline'},
      map: {close: 'cross', edit: 'pen', delete: 'bin'},
      icons: [
        {id: 'cross', export: 'CrossIcon', words: ['close']},
        {id: 'pen', export: 'PenIcon', words: ['edit']},
        {
          id: 'bin',
          export: 'BinIcon',
          words: ['delete'],
          variants: [{variant: 'solid', export: 'BinSolidIcon'}],
        },
      ],
    },
  });
  /** @type {any} */
  const ORDERED = {
    status: 'selected',
    set: SET,
    configured: 'glyphs',
    order: [SET, BRAND],
    reason: 'list',
  };
  const SOURCE = [
    "import {CloseGlyph, PencilGlyph, ScissorsGlyph} from '@acme/library';",
    "import {Icon} from '@astryxdesign/core/Icon';",
    '',
    'export const A = () => <><Icon icon={CloseGlyph} /><Icon icon={PencilGlyph} /><Icon icon={ScissorsGlyph} /></>;',
    '',
  ].join('\n');
  const DECLARED = {
    CloseGlyph: 'close',
    PencilGlyph: 'edit',
    ScissorsGlyph: 'cut',
  };

  it('takes each icon from the first set in the list that has its meaning, and a placeholder when none has it', () => {
    const {source, icons} = map(SOURCE, DECLARED, ORDERED, [SET, BRAND]);
    // The main set has close; only the backup has edit; nobody has cut.
    expect(source).toContain("import {XIcon} from '@acme/glyphs';");
    expect(source).toContain("import {PenIcon} from '@acme/brand';");
    expect(source).not.toContain('CrossIcon');
    // The file's own import of Core's Icon entry stays as written.
    expect(source).toContain("import {Icon} from '@astryxdesign/core/Icon';");
    expect(source).not.toContain('@acme/library');
    expect(source).toContain(
      '<Icon icon={MissingIcon /* missing icon: cut */} />',
    );
    expect(
      icons?.mapped.map(each => [each.source.export, each.target.set]),
    ).toEqual([
      ['CloseGlyph', 'glyphs'],
      ['PencilGlyph', 'brand'],
    ]);
    expect(icons?.order).toEqual(['@acme/glyphs/glyphs', '@acme/brand/brand']);
    expect(icons?.placeholder.map(each => each.definitions)).toEqual([['cut']]);
    expect(icons?.sets).toEqual([
      {set: '@acme/glyphs/glyphs', license: 'MIT', icons: 1},
      {set: '@acme/brand/brand', license: 'Apache-2.0', icons: 1},
    ]);
  });

  it('with only a main set, an icon the main set lacks is a placeholder, never the original import', () => {
    const {source, icons} = map(SOURCE, DECLARED);
    expect(source).not.toContain('@acme/library');
    // Two meanings share one declaration; each use names its own meaning.
    expect(source.split('function MissingIcon(').length).toBe(2);
    expect(source).toContain('icon={MissingIcon /* missing icon: edit */}');
    expect(source).toContain('icon={MissingIcon /* missing icon: cut */}');
    expect(icons?.placeholder.map(each => each.source.export)).toEqual([
      'PencilGlyph',
      'ScissorsGlyph',
    ]);
  });

  it('keeps the look a source asks for when the set has it, and reports the default look when it does not', () => {
    const SOLID = /** @type {any} */ ({
      name: 'solidlib',
      package: '@acme/solidlib',
      license: 'MIT',
      data: {
        schemaVersion: 1,
        module: '@acme/solidlib',
        variants: ['outline', 'solid'],
        default: {variant: 'outline'},
        map: {delete: 'trash', close: 'x'},
        icons: [
          {
            id: 'trash',
            export: 'TrashIcon',
            words: ['delete'],
            variants: [{variant: 'solid', export: 'TrashSolidIcon'}],
          },
          {
            id: 'x',
            export: 'XIcon',
            words: ['close'],
            variants: [{variant: 'solid', export: 'XSolidIcon'}],
          },
        ],
      },
    });
    /** @type {any} */
    const choice = {
      status: 'selected',
      set: BRAND,
      configured: 'brand',
      order: [BRAND],
      reason: 'brand',
    };
    const {source, icons} = map(
      "import {TrashSolidIcon, XSolidIcon} from '@acme/solidlib';\nexport const A = () => <><TrashSolidIcon /><XSolidIcon /></>;\n",
      {},
      choice,
      [BRAND, SOLID],
    );
    // brand's bin has a solid look; its cross does not.
    expect(source).toContain(
      "import {BinSolidIcon, CrossIcon} from '@acme/brand';",
    );
    expect(icons?.mapped.map(each => each.variant)).toEqual([
      undefined,
      {asked: 'solid', used: 'outline'},
    ]);
  });

  it('leaves an import from a backup set alone', () => {
    const source =
      "import {PenIcon} from '@acme/brand';\nexport const A = () => <PenIcon />;\n";
    const {source: out, icons} = map(source, {PenIcon: 'edit'}, ORDERED, [
      SET,
      BRAND,
    ]);
    expect(out).toBe(source);
    expect(icons?.kept).toEqual([
      {
        module: '@acme/brand',
        export: 'PenIcon',
        reason: 'it is already imported from a set in your list',
      },
    ]);
  });
});

describe("a set that wraps the template's library", () => {
  /** A set generated from `@acme/library`, the library the template imports. */
  const WRAPPER = /** @type {any} */ ({
    name: 'wrapper',
    package: '@acme/wrapper',
    license: 'MIT',
    data: {
      schemaVersion: 1,
      module: '@acme/wrapper',
      source: {package: '@acme/library', version: '1.0.0'},
      map: {close: 'close'},
      icons: [{id: 'close', export: 'CloseIcon', words: ['close']}],
    },
  });
  const SOURCE = [
    "import {CloseGlyph, FrameGlyph, ScissorsGlyph} from '@acme/library';",
    '',
    'export const A = () => <><CloseGlyph /><FrameGlyph size={16} /><ScissorsGlyph /></>;',
    '',
  ].join('\n');
  const DECLARED = {
    CloseGlyph: 'close',
    FrameGlyph: 'frame',
    ScissorsGlyph: 'cut',
  };

  it('keeps an icon no set maps when a backup set wraps its library, instead of a placeholder', () => {
    /** @type {any} */
    const choice = {
      status: 'selected',
      set: SET,
      configured: 'glyphs',
      order: [SET, WRAPPER],
      reason: 'list',
    };
    const {source, icons} = map(SOURCE, DECLARED, choice, [SET, WRAPPER]);
    // glyphs maps close; nobody maps frame or cut, and wrapper wraps the library.
    expect(source).toContain("import {XIcon} from '@acme/glyphs';");
    expect(source).toContain(
      "import {FrameGlyph, ScissorsGlyph} from '@acme/library';",
    );
    expect(source).toContain('<FrameGlyph size={16} />');
    expect(source).not.toContain('MissingIcon');
    expect(icons?.placeholder).toEqual([]);
    expect(icons?.kept.map(each => [each.export, each.reason])).toEqual([
      [
        'FrameGlyph',
        'no set in your list maps its icon definition, and it already comes from @acme/library, which @acme/wrapper/wrapper wraps',
      ],
      [
        'ScissorsGlyph',
        'no set in your list maps its icon definition, and it already comes from @acme/library, which @acme/wrapper/wrapper wraps',
      ],
    ]);
  });

  it("keeps every icon from the main set's own library as written", () => {
    /** @type {any} */
    const choice = {
      status: 'selected',
      set: WRAPPER,
      configured: 'wrapper',
      order: [WRAPPER, SET],
      reason: 'list',
    };
    const {source, icons} = map(SOURCE, DECLARED, choice, [WRAPPER, SET]);
    expect(source).toBe(SOURCE);
    expect(icons?.mapped).toEqual([]);
    expect(icons?.placeholder).toEqual([]);
    expect(icons?.kept.map(each => each.export)).toEqual([
      'CloseGlyph',
      'FrameGlyph',
      'ScissorsGlyph',
    ]);
    expect(icons?.kept[0].reason).toBe(
      'it already comes from @acme/library, which @acme/wrapper/wrapper wraps',
    );
  });

  it('still draws a placeholder for an icon from a library no listed set wraps', () => {
    const {source} = map(
      SOURCE.replace("'@acme/library'", "'@acme/other'"),
      DECLARED,
      SELECTED,
      [SET, WRAPPER],
    );
    expect(source).toContain('MissingIcon /* missing icon: frame */');
  });
});

describe('the local placeholder', () => {
  const SOURCE = [
    "import {Text} from '@astryxdesign/core/Text';",
    "import {PencilGlyph} from '@acme/library';",
    '',
    'const MissingIcon = 1;',
    '',
    '/** The page. */',
    'export const A = () => <PencilGlyph aria-label="Edit" />;',
    '',
  ].join('\n');

  it('takes a free name when the file already uses MissingIcon, and goes after the leading comment of the first statement', () => {
    const {source, icons} = map(SOURCE, {PencilGlyph: 'edit'});
    expect(icons.placeholder[0].target).toEqual({local: 'MissingIcon2'});
    expect(source).toBe(
      [
        "import {Text} from '@astryxdesign/core/Text';",
        '',
        `${placeholderDeclaration('MissingIcon2')}`,
        '',
        'const MissingIcon = 1;',
        '',
        '/** The page. */',
        'export const A = () => <MissingIcon2 /* missing icon: edit */ aria-label="Edit" />;',
        '',
      ].join('\n'),
    );
  });

  it('goes after a comment that trails the last import on its line', () => {
    const {source} = map(
      "import {Text} from '@astryxdesign/core/Text'; // text\nimport {PencilGlyph} from '@acme/library';\nexport const A = () => <PencilGlyph />;\n",
      {PencilGlyph: 'edit'},
    );
    expect(source).toBe(
      `import {Text} from '@astryxdesign/core/Text'; // text\n${placeholderDeclaration('MissingIcon')}\n\nexport const A = () => <MissingIcon /* missing icon: edit */ />;\n`,
    );
  });

  it('sizes like an icon, in the current color, hidden unless a use labels it, with no data attributes', () => {
    const declaration = placeholderDeclaration('MissingIcon');
    expect(declaration).toContain('width="1em"');
    expect(declaration).toContain('height="1em"');
    expect(declaration).toContain('stroke="currentColor"');
    expect(declaration).toContain('aria-hidden={labelled ? undefined : true}');
    expect(declaration).toContain(
      "props['aria-label'] != null || props['aria-labelledby'] != null",
    );
    expect(declaration).not.toMatch(/data-/u);
  });

  it('placeholderUses reads each use of the written declaration and its meaning', () => {
    const {source} = map(SOURCE, {PencilGlyph: 'edit'});
    expect(placeholderUses(source)).toEqual([
      {local: 'MissingIcon2', meanings: ['edit']},
    ]);
  });

  it('placeholderUses still reads a reformatted declaration', () => {
    const declaration = placeholderDeclaration('MissingIcon')
      .replace("'img'", '"img"')
      .replace(
        '<rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2.33" />',
        '<rect\n        x="4"\n        y="4"\n        width="16"\n        height="16"\n        rx="2"\n        strokeDasharray="3 2.33"\n      />',
      );
    expect(
      placeholderUses(
        `${declaration}\nexport const A = () => <MissingIcon />;\n`,
      ),
    ).toEqual([{local: 'MissingIcon', meanings: null}]);
  });

  it('placeholderUses ignores a look-alike, a commented-out copy and a quoted copy', () => {
    const lookAlike = placeholderDeclaration('MissingIcon').replace(
      'width="1em"',
      'width="2em"',
    );
    expect(
      placeholderUses(
        `${lookAlike}\nexport const A = () => <MissingIcon /* missing icon: cut */ />;\n`,
      ),
    ).toEqual([]);
    const commented =
      `${placeholderDeclaration('MissingIcon')}\nexport const A = () => <MissingIcon /* missing icon: cut */ />;`
        .split('\n')
        .map(line => `// ${line}`)
        .join('\n');
    expect(placeholderUses(`${commented}\nexport const B = 1;\n`)).toEqual([]);
    expect(
      placeholderUses(
        `export const A = ${JSON.stringify(placeholderDeclaration('MissingIcon'))};\nexport const B = 'MissingIcon /* missing icon: cut */';\n`,
      ),
    ).toEqual([]);
  });
});

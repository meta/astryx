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
} from './template-icons.mjs';
import {glyphsData} from '../../test-utils/icon-set-fixture.mjs';

const SET = /** @type {any} */ ({
  name: 'glyphs',
  package: '@acme/glyphs',
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

  it('rewrites each declared icon the set maps, every reference too, and keeps the rest', () => {
    const {source, icons} = map(SOURCE, DECLARED);
    expect(source).toContain(
      "import {XIcon, HomeIcon, TrashIcon} from '@acme/glyphs';",
    );
    expect(source).toContain("import {PencilGlyph} from '@acme/library';");
    expect(source).not.toContain('@acme/library/solid');
    expect(source).toContain('<XIcon className="x" />');
    expect(source).toContain('<HomeIcon />');
    expect(source).toContain('<PencilGlyph />');
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
    expect(icons.kept).toEqual([
      expect.objectContaining({
        module: '@acme/library',
        export: 'PencilGlyph',
        reason: expect.stringContaining('"edit"'),
      }),
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
    // A kept icon keeps its props.
    expect(source).toContain('<PencilGlyph size={16} />');
    expect(icons.mapped[0].dropped).toEqual([
      'absoluteStrokeWidth',
      'size',
      'strokeWidth',
    ]);
    expect(icons.kept[0]).not.toHaveProperty('dropped');
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
    expect(source).toContain(
      "import {PencilGlyph /* pen */} from '@acme/library'; // tools",
    );
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
        kept: [],
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

  it('a default import the set cannot map is kept', () => {
    expect(
      map(
        "import PencilIcon from '@acme/library/pencil';\nexport const A = () => <PencilIcon />;\n",
        {PencilIcon: 'edit'},
      ).icons?.kept,
    ).toEqual([
      expect.objectContaining({
        module: '@acme/library/pencil',
        export: 'default',
        reason: expect.stringContaining('"edit"'),
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

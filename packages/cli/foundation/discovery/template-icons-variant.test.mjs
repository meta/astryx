// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon mapping with a project variant:
 * `experimental.iconVariant` names the look every icon draws. A mapped icon
 * draws its set's icon in that look when the icon has it, else the set's
 * default look, reported; an icon from the main set's own library and an
 * icon a template already imports from a set in the list in another look
 * move to that look; a missing look never moves an icon to a backup.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {mapTemplateIcons} from './template-icons.mjs';
import {glyphsData} from '../../test-utils/icon-set-fixture.mjs';

/** The main set: trash has a solid look, x does not. */
const GLYPHS = /** @type {any} */ ({
  name: 'glyphs',
  package: '@acme/glyphs',
  license: 'MIT',
  data: {
    ...glyphsData(),
    module: '@acme/glyphs',
    map: {close: 'x', search: 'search', delete: 'trash', home: 'home'},
  },
});

/** A backup set whose looks are outline and solid; only pen has solid. */
const BRAND = /** @type {any} */ ({
  name: 'brand',
  package: '@acme/brand',
  license: 'Apache-2.0',
  data: {
    schemaVersion: 1,
    module: '@acme/brand',
    variants: ['outline', 'solid'],
    default: {variant: 'outline'},
    map: {edit: 'pen', frame: 'frame', cut: 'scissors'},
    icons: [
      {
        id: 'pen',
        export: 'PenIcon',
        words: ['edit'],
        variants: [{variant: 'solid', export: 'PenSolidIcon'}],
      },
      {id: 'frame', export: 'FrameIcon', words: ['frame']},
      {id: 'scissors', export: 'ScissorsIcon', words: ['cut']},
    ],
  },
});

/** A set that wraps `@acme/library`, the library the templates import. */
const WRAPPER = /** @type {any} */ ({
  name: 'wrapper',
  package: '@acme/wrapper',
  license: 'MIT',
  data: {
    schemaVersion: 1,
    module: '@acme/wrapper',
    source: {package: '@acme/library', version: '1.0.0'},
    variants: ['outline', 'solid'],
    default: {variant: 'outline'},
    map: {close: 'close'},
    icons: [
      {
        id: 'close',
        export: 'CloseIcon',
        words: ['close'],
        variants: [{variant: 'solid', export: 'CloseSolidIcon'}],
      },
    ],
  },
});

/**
 * A project's choice: the sets in order, and the look they draw.
 * @param {any[]} order
 * @param {string} [variant]
 * @returns {any}
 */
const chosen = (order, variant) => ({
  status: 'selected',
  set: order[0],
  configured: order[0].name,
  backups: order.slice(1).map(set => ({
    selector: set.name,
    status: 'selected',
    set,
    reason: 'installed',
  })),
  order,
  ...(variant ? {variant} : {}),
  reason: 'list',
});

const LIBRARY = [
  "import {BinGlyph, CloseGlyph} from '@acme/library';",
  '',
  'export const A = () => <><BinGlyph /><CloseGlyph /></>;',
  '',
].join('\n');
const LIBRARY_ICONS = {BinGlyph: 'delete', CloseGlyph: 'close'};

describe('a project variant', () => {
  it("draws each mapped icon in the project's look where its icon has it, and reports the default look where it does not", () => {
    const {source, icons} = mapTemplateIcons(
      LIBRARY,
      {sets: [GLYPHS], choice: chosen([GLYPHS], 'solid')},
      LIBRARY_ICONS,
    );
    expect(source).toContain(
      "import {TrashSolidIcon, XIcon} from '@acme/glyphs';",
    );
    expect(source).toContain('<><TrashSolidIcon /><XIcon /></>');
    expect(icons?.variant).toBe('solid');
    expect(
      icons?.mapped.map(each => [each.target.export, each.variant]),
    ).toEqual([
      ['TrashSolidIcon', undefined],
      ['XIcon', {asked: 'solid', used: 'outline'}],
    ]);
  });

  it('without a variant draws the default look and adds no variant to the report', () => {
    const {source, icons} = mapTemplateIcons(
      LIBRARY,
      {sets: [GLYPHS], choice: chosen([GLYPHS])},
      LIBRARY_ICONS,
    );
    expect(source).toContain("import {TrashIcon, XIcon} from '@acme/glyphs';");
    expect(icons).not.toHaveProperty('variant');
  });

  it("asks for the project's look, not the look the template's icon draws", () => {
    const {source, icons} = mapTemplateIcons(
      "import {PenSolidIcon} from '@acme/brand';\nexport const A = () => <PenSolidIcon />;\n",
      {sets: [GLYPHS, BRAND], choice: chosen([GLYPHS], 'outline')},
      {PenSolidIcon: 'delete'},
    );
    // brand is installed but not listed: its solid pen maps to glyphs' trash,
    // in the project's look, outline.
    expect(source).toContain("import {TrashIcon} from '@acme/glyphs';");
    expect(icons?.mapped[0]).not.toHaveProperty('variant');
  });

  it('a backup without the look draws its default look, and never hands the icon to another set', () => {
    const {source, icons} = mapTemplateIcons(
      "import {PencilGlyph, FrameGlyph} from '@acme/library';\nexport const A = () => <><PencilGlyph /><FrameGlyph /></>;\n",
      {sets: [GLYPHS, BRAND], choice: chosen([GLYPHS, BRAND], 'solid')},
      {PencilGlyph: 'edit', FrameGlyph: 'frame'},
    );
    expect(source).toContain(
      "import {PenSolidIcon, FrameIcon} from '@acme/brand';",
    );
    expect(icons?.mapped.map(each => [each.target.set, each.variant])).toEqual([
      ['brand', undefined],
      ['brand', {asked: 'solid', used: 'outline'}],
    ]);
  });
});

describe("a project variant and the main set's own library", () => {
  const SOURCE = [
    "import {CloseGlyph, FrameGlyph} from '@acme/library';",
    '',
    'export const A = () => <><CloseGlyph size={16} /><FrameGlyph /></>;',
    '',
  ].join('\n');
  const DECLARED = {CloseGlyph: 'close', FrameGlyph: 'frame'};

  it("maps an icon the main set has to its icon in the project's look; an icon it lacks keeps its import, even when a backup has it", () => {
    const {source, icons} = mapTemplateIcons(
      SOURCE,
      {sets: [WRAPPER, BRAND], choice: chosen([WRAPPER, BRAND], 'solid')},
      DECLARED,
    );
    expect(source).toContain("import {CloseSolidIcon} from '@acme/wrapper';");
    expect(source).toContain("import {FrameGlyph} from '@acme/library';");
    expect(source).toContain('<CloseSolidIcon />');
    expect(source).not.toContain('FrameIcon');
    expect(icons?.mapped.map(each => [each.source.export, each.by])).toEqual([
      ['CloseGlyph', 'definition'],
    ]);
    expect(icons?.mapped[0].dropped).toEqual(['size']);
    expect(icons?.kept).toEqual([
      {
        module: '@acme/library',
        export: 'FrameGlyph',
        reason:
          'it already comes from @acme/library, which @acme/wrapper/wrapper wraps',
      },
    ]);
  });

  it('without a variant keeps every icon from that library as written', () => {
    const {source} = mapTemplateIcons(
      SOURCE,
      {sets: [WRAPPER, BRAND], choice: chosen([WRAPPER, BRAND])},
      DECLARED,
    );
    expect(source).toBe(SOURCE);
  });

  describe('an icon the main set re-exports but does not map', () => {
    const packageDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-wrapped-look-'),
    );
    afterAll(() => fs.rmSync(packageDir, {recursive: true, force: true}));
    fs.writeFileSync(
      path.join(packageDir, 'wrapper.generated.js'),
      [
        "export {CloseGlyph as CloseIcon} from '@acme/library';",
        "export {CloseGlyph as CloseSolidIcon} from '@acme/library/solid';",
        "export {BinGlyph as BinIcon} from '@acme/library';",
        "export {BinGlyph as BinSolidIcon} from '@acme/library/solid';",
        "export {FrameGlyph as FrameIcon} from '@acme/library';",
        '',
      ].join('\n'),
    );
    const READ = /** @type {any} */ ({
      ...WRAPPER,
      packageDir,
      data: {
        ...WRAPPER.data,
        generated: './wrapper.generated.js',
        icons: [
          ...WRAPPER.data.icons,
          {
            id: 'bin',
            export: 'BinIcon',
            words: ['bin'],
            variants: [{variant: 'solid', export: 'BinSolidIcon'}],
          },
          {id: 'frame', export: 'FrameIcon', words: ['frame']},
        ],
      },
    });
    const TEMPLATE = [
      "import {BinGlyph, FrameGlyph} from '@acme/library';",
      '',
      'export const A = () => <><BinGlyph /><FrameGlyph /></>;',
      '',
    ].join('\n');

    it("moves it to that icon's export in the project's look, and keeps one that lacks the look", () => {
      const {source, icons} = mapTemplateIcons(
        TEMPLATE,
        {sets: [READ, BRAND], choice: chosen([READ, BRAND], 'solid')},
        {BinGlyph: 'delete', FrameGlyph: 'frame'},
      );
      expect(source).toContain("import {BinSolidIcon} from '@acme/wrapper';");
      expect(source).toContain("import {FrameGlyph} from '@acme/library';");
      expect(source).toContain('<><BinSolidIcon /><FrameGlyph /></>');
      expect(
        icons?.mapped.map(each => [
          each.source.export,
          each.target.export,
          each.by,
          each.variant,
        ]),
      ).toEqual([['BinGlyph', 'BinSolidIcon', 'variant', undefined]]);
      expect(icons?.kept.map(each => each.export)).toEqual(['FrameGlyph']);
    });

    it('without a variant keeps it as written', () => {
      const {source} = mapTemplateIcons(
        TEMPLATE,
        {sets: [READ, BRAND], choice: chosen([READ, BRAND])},
        {BinGlyph: 'delete', FrameGlyph: 'frame'},
      );
      expect(source).toBe(TEMPLATE);
    });
  });
});

describe('a project variant and a placeholder', () => {
  it("keeps the list's backups and the look in the fix that adds a backup", () => {
    const {icons} = mapTemplateIcons(
      "import {FireGlyph} from '@acme/library';\nexport const A = () => <FireGlyph />;\n",
      {sets: [GLYPHS, BRAND], choice: chosen([GLYPHS, BRAND], 'solid')},
      {FireGlyph: 'fire'},
    );
    expect(icons?.placeholder.map(each => each.fixes)).toEqual([
      [
        'astryx experimental icon map fire <icon> --set glyphs',
        'astryx experimental icon use glyphs --backup brand --backup <set> --variant solid',
      ],
    ]);
  });
});

describe('a project variant and icons imported from a set in the list', () => {
  const SOURCE = [
    "import {TrashIcon, XIcon} from '@acme/glyphs';",
    '',
    'export const A = () => <><TrashIcon /><XIcon /></>;',
    '',
  ].join('\n');

  it("moves an icon in another look to its export for the project's look, and keeps one without that look", () => {
    const {source, icons} = mapTemplateIcons(
      SOURCE,
      {sets: [GLYPHS], choice: chosen([GLYPHS], 'solid')},
      {TrashIcon: 'delete', XIcon: 'close'},
    );
    expect(source).toBe(
      [
        "import {TrashSolidIcon} from '@acme/glyphs';",
        "import {XIcon} from '@acme/glyphs';",
        '',
        'export const A = () => <><TrashSolidIcon /><XIcon /></>;',
        '',
      ].join('\n'),
    );
    expect(icons?.mapped).toEqual([
      {
        source: {module: '@acme/glyphs', export: 'TrashIcon'},
        target: {
          set: 'glyphs',
          package: '@acme/glyphs',
          id: 'trash',
          module: '@acme/glyphs',
          export: 'TrashSolidIcon',
        },
        by: 'variant',
      },
    ]);
    expect(icons?.kept).toEqual([
      {
        module: '@acme/glyphs',
        export: 'XIcon',
        reason: 'it is already imported from @acme/glyphs/glyphs',
      },
    ]);
  });

  it('leaves an icon already in the project look alone', () => {
    const {source, icons} = mapTemplateIcons(
      SOURCE,
      {sets: [GLYPHS], choice: chosen([GLYPHS], 'outline')},
      {TrashIcon: 'delete', XIcon: 'close'},
    );
    expect(source).toBe(SOURCE);
    expect(icons?.mapped).toEqual([]);
  });
});

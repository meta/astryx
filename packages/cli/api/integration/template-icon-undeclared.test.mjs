// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `integration check` notes each icon a template imports but does not
 * declare in its `icons` (`template_icon_undeclared`), in a package whose
 * templates declare `icons`. An import counts when the template renders it as
 * a childless element or passes it as a value. Any other import from that
 * module, a generic renderer, and an import matched by its name only, are
 * listed as not checked instead. The note is marked `next`: it fails
 * `--strict --next` and leaves `--strict` as it was. A package that never
 * declares `icons` sees no change.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateIntegration} from './validate-integration.mjs';
import {integrationCheck} from './check/check.mjs';
import {undeclaredTemplateIcons} from '../../foundation/discovery/template-icons.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-undeclared-'));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
function write(rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
}

/**
 * A package with one block template.
 * @param {string} icons the doc's `icons` field, or '' for none
 * @param {string} source the template source
 */
function writePackage(icons, source) {
  write(
    'package.json',
    JSON.stringify({
      name: '@acme/blocks',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.7.4'},
      // A logo, so no listing note is drawn.
      marketplace: {logo: {light: 'logo.svg'}},
    }),
  );
  write(
    'logo.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>',
  );
  write(
    'astryx.integration.mjs',
    "export default {templates: './templates'};\n",
  );
  write('templates/acme-bar.tsx', source);
  write(
    'templates/acme-bar.doc.mjs',
    `export default {type: 'block', name: 'Acme bar', description: 'A bar.', aspectRatio: 2, componentsUsed: []${icons}};\n`,
  );
}

const SOURCE = [
  "import {TrashIcon, ScissorsIcon} from '@acme/glyphs';",
  "import {Button} from '@astryxdesign/core/Button';",
  'export default function AcmeBar() { return <Button icon={<TrashIcon />} label={<ScissorsIcon />} />; }',
  '',
].join('\n');

/** @returns {Promise<any>} */
async function validated() {
  return (await validateIntegration(undefined, {cwd: dir})).data;
}

/** @param {any} data */
function undeclaredNotes(data) {
  return (data.notes ?? []).filter(
    (/** @type {any} */ note) => note.code === 'template_icon_undeclared',
  );
}

describe('template_icon_undeclared', () => {
  it('notes an imported icon the template does not declare, as a next note that leaves --strict passing', async () => {
    writePackage(", icons: {TrashIcon: 'delete'}", SOURCE);
    const data = await validated();
    expect(JSON.stringify(data.issues)).not.toContain(
      'template_icon_undeclared',
    );
    expect(undeclaredNotes(data)).toEqual([
      {
        code: 'template_icon_undeclared',
        next: true,
        message: expect.stringContaining(
          'templates/acme-bar.tsx imports icon "ScissorsIcon" from @acme/glyphs, but templates/acme-bar.doc.mjs does not declare it',
        ),
      },
    ]);
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(JSON.stringify(strict.data.failures)).not.toContain(
      'template_icon_undeclared',
    );
    const strictNext = await integrationCheck({
      cwd: dir,
      strict: true,
      next: true,
    });
    expect(JSON.stringify(strictNext.data.failures)).toContain(
      'template_icon_undeclared',
    );
  }, 60_000);

  it('lists Icon and DynamicIcon from lucide-react, matched by name only, as not checked, and --strict --next passes', async () => {
    writePackage(
      ", icons: {TrashIcon: 'delete'}",
      [
        "import {Icon, DynamicIcon} from 'lucide-react';",
        "import {TrashIcon} from '@acme/glyphs';",
        'export default function AcmeBar() { return <><Icon iconNode={[]} /><DynamicIcon name="trash" /><TrashIcon /></>; }',
        '',
      ].join('\n'),
    );
    const data = await validated();
    expect(undeclaredNotes(data)).toEqual([]);
    expect(data.templateIcons).toEqual({
      status: 'checked',
      findings: [],
      unchecked: [
        expect.objectContaining({
          file: 'templates/acme-bar.tsx',
          icon: 'Icon',
          module: 'lucide-react',
          reason: expect.stringContaining('generic renderer'),
        }),
        expect.objectContaining({icon: 'DynamicIcon', module: 'lucide-react'}),
      ],
    });
    const strictNext = await integrationCheck({
      cwd: dir,
      strict: true,
      next: true,
    });
    // The temporary package has no TypeScript, so the doc-type check skips.
    expect(
      strictNext.data.failures.filter(
        (/** @type {{code: string}} */ each) =>
          each.code !== 'doc_types_skipped',
      ),
    ).toEqual([]);
    expect(strictNext.data.unchecked).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('notes a one-icon import from the module the package declares icons from, and lists its generic renderers as not checked', async () => {
    writePackage(
      ", icons: {Trash2: 'delete'}",
      [
        "import {Trash2, Scissors, Icon, DynamicIcon} from 'lucide-react';",
        'export default function AcmeBar() { return <><Trash2 /><Scissors /><Icon iconNode={[]} /><DynamicIcon name="x" /></>; }',
        '',
      ].join('\n'),
    );
    const data = await validated();
    expect(
      undeclaredNotes(data).map((/** @type {any} */ note) => note.message),
    ).toEqual([
      expect.stringContaining('imports icon "Scissors" from lucide-react'),
    ]);
    expect(data.templateIcons.unchecked).toEqual([
      expect.objectContaining({
        icon: 'Icon',
        module: 'lucide-react',
        reason: expect.stringContaining('generic renderer'),
      }),
      expect.objectContaining({
        icon: 'DynamicIcon',
        module: 'lucide-react',
        reason: expect.stringContaining('generic renderer'),
      }),
    ]);
  }, 60_000);

  it('notes an icon rendered as a childless element or passed as a value, and lists a type, a factory call, and a provider with children as not checked', async () => {
    writePackage(
      ", icons: {Trash2: 'delete'}",
      [
        "import {Trash2, Scissors, Copy, LucideIcon, createLucideIcon, LucideProvider} from 'lucide-react';",
        "import {Button} from '@astryxdesign/core/Button';",
        'interface ItemProps { icon: LucideIcon }',
        "const Custom = createLucideIcon('custom', []);",
        'export default function AcmeBar(props: ItemProps) { return <LucideProvider size={16}><Trash2 /><Scissors /><Button icon={Copy} /><Custom /></LucideProvider>; }',
        '',
      ].join('\n'),
    );
    const data = await validated();
    expect(
      undeclaredNotes(data).map((/** @type {any} */ note) => note.message),
    ).toEqual([
      expect.stringContaining('imports icon "Scissors" from lucide-react'),
      expect.stringContaining('imports icon "Copy" from lucide-react'),
    ]);
    expect(data.templateIcons.unchecked).toEqual(
      ['LucideIcon', 'createLucideIcon', 'LucideProvider'].map(icon =>
        expect.objectContaining({
          icon,
          module: 'lucide-react',
          reason: expect.stringContaining('not rendered as an icon'),
        }),
      ),
    );
  }, 60_000);

  it('says nothing in a package whose templates declare no icons', async () => {
    writePackage('', SOURCE);
    const data = await validated();
    expect(JSON.stringify(data)).not.toContain('template_icon_undeclared');
  }, 60_000);

  it('says nothing when every icon is declared', async () => {
    writePackage(", icons: {TrashIcon: 'delete', ScissorsIcon: 'cut'}", SOURCE);
    const data = await validated();
    expect(JSON.stringify(data)).not.toContain('template_icon_undeclared');
  }, 60_000);
});

describe('undeclaredTemplateIcons', () => {
  it('reads a module another template declares an icon from as an icon module, lists its unused imports as not checked, and lists a name ending in Icon from another module as not checked', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source:
            "import {Trash, Cut} from 'glyphs';\nimport {format} from 'date-fns';\nimport {useState} from 'react';\nimport {HomeIcon} from 'other';\n",
          declared: {Trash: 'delete'},
        },
        {
          id: 'b',
          source:
            "import {Scan} from 'glyphs';\nimport type {LinkIcon} from 'other';\nimport {Local} from './LocalIcon';\n",
          declared: {},
        },
      ]),
    ).toEqual({
      undeclared: [],
      unchecked: [
        {id: 'a', key: 'Cut', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'HomeIcon', module: 'other', why: 'name'},
        {id: 'b', key: 'Scan', module: 'glyphs', why: 'use'},
      ],
    });
  });

  it('counts an import from an icon module only when it renders as a childless element or passes as a value, never as a call argument or a spread', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source: [
            "import {Trash, Cut, Copy, Pin, Glyph, makeGlyph, Provider, Wrap, icons, Bag, Box} from 'glyphs';",
            'const names = Object.keys(icons);',
            'const all = {...icons};',
            'const set = new Set(Bag);',
            'const sized = [...Box];',
            'interface P { icon: Glyph }',
            "const Made = makeGlyph('made');",
            'const list = [Pin];',
            'const x = <Provider size={16}><Trash /><Cut></Cut><Wrap>text</Wrap><Made /><B icon={Copy} /></Provider>;',
            '',
          ].join('\n'),
          declared: {Trash: 'delete'},
        },
      ]),
    ).toEqual({
      undeclared: [
        {id: 'a', key: 'Cut', module: 'glyphs'},
        {id: 'a', key: 'Copy', module: 'glyphs'},
        {id: 'a', key: 'Pin', module: 'glyphs'},
      ],
      unchecked: [
        {id: 'a', key: 'Glyph', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'makeGlyph', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'Provider', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'Wrap', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'icons', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'Bag', module: 'glyphs', why: 'use'},
        {id: 'a', key: 'Box', module: 'glyphs', why: 'use'},
      ],
    });
  });

  it('lists a bare Icon, and a name every JSX use of which passes an icon prop, as not checked whatever its module', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source:
            'import {Trash, Cut, Icon, Dynamic, Pick} from \'glyphs\';\nconst x = <><Dynamic name="a" /><Dynamic src="b" /><Pick icon={Trash} /><Pick /><Cut /></>;\n',
          declared: {Trash: 'delete'},
        },
      ]),
    ).toEqual({
      undeclared: [
        {id: 'a', key: 'Cut', module: 'glyphs'},
        {id: 'a', key: 'Pick', module: 'glyphs'},
      ],
      unchecked: [
        {id: 'a', key: 'Icon', module: 'glyphs', why: 'renderer'},
        {id: 'a', key: 'Dynamic', module: 'glyphs', why: 'renderer'},
      ],
    });
  });

  it('never counts an import from an Astryx package', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source:
            "import {Icon, Table as TableIcon} from '@astryxdesign/core/Icon';\n",
          declared: {},
        },
      ]),
    ).toEqual({undeclared: [], unchecked: []});
  });
});

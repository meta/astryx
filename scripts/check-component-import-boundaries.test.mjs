// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-component-import-boundaries.test.mjs
 * @input Fixture import graphs in the shape the check reads from esbuild's
 *   metafile, fixture source trees built with the check's own build, and the
 *   import-boundaries record's allowlist
 * @output Pins the check's verdicts: an unlisted crossing fails and names its
 *   import chain, also through a re-export-only module of any name, a listed
 *   crossing passes, a stale row fails, an import() of
 *   a surface whose graph reaches touch modules passes, and an import() of a
 *   touch module or of a capability module fails
 * @position Node test beside scripts/check-component-import-boundaries.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  compareWithAllowlist,
  CORE_BOUNDARIES,
  findBoundaryViolations,
  formatReport,
  measureEntry,
  parseAllowlist,
  rowsByCrossing,
} from './check-component-import-boundaries.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const RECORD = path.join(
  REPO,
  'docs/architecture/component-import-boundaries.md',
);

const SRC = 'packages/core/src/';

/** A fixture graph: module paths under Core's source, with their imports. */
function graphOf(entry, modules) {
  const full = {};
  for (const [name, {bytes = 1, imports = []}] of Object.entries(modules)) {
    full[SRC + name] = {
      eagerBytes: bytes,
      imports: imports.map(([target, kind = 'import-statement']) => ({
        path: SRC + target,
        kind,
      })),
    };
  }
  return {entry: SRC + entry, modules: full};
}

/** Fixture boundaries: one surface folder, one capability, the touch core. */
const BOUNDARIES = {
  surfaceFolders: ['Tooltip', 'Layer'],
  baseModulesInSurfaceFolders: ['Layer/layerScopedContext'],
  touchModules: [/^gestures\//, /^Layer\/useTouchTrigger$/],
  capabilities: [
    {
      name: 'Table virtualization',
      modules: /^Table\/plugins\/virtualization\//,
      ownImport: [
        'Table/plugins/virtualization',
        'Table/plugins/virtualization/useTableRowsVirtualization',
      ],
    },
  ],
};

function violationsOf(entryName, graph) {
  return findBoundaryViolations({entryName, graph, boundaries: BOUNDARIES});
}

describe('a static import from an entry', () => {
  it('fails when it crosses into a surface module, and names the chain', () => {
    const graph = graphOf('Button/__entry__.mjs', {
      'Button/__entry__.mjs': {imports: [['Button/Button.tsx']]},
      'Button/Button.tsx': {imports: [['Button/ButtonLabel.tsx']]},
      'Button/ButtonLabel.tsx': {imports: [['Tooltip/useTooltip.tsx']]},
      'Tooltip/useTooltip.tsx': {imports: [['Layer/useLayer.tsx']]},
      'Layer/useLayer.tsx': {},
    });
    const {crossings, dynamicViolations} = violationsOf('Button', graph);
    expect(dynamicViolations).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toMatchObject({
      from: 'Button/ButtonLabel',
      to: 'Tooltip/useTooltip',
      invariant: 'INV1',
      chain: 'Button → Button/Button → Button/ButtonLabel → Tooltip/useTooltip',
    });

    const comparison = compareWithAllowlist(
      rowsByCrossing([{entryName: 'Button', crossings}]),
      [],
    );
    expect(comparison.ok).toBe(false);
    const report = formatReport(comparison);
    expect(report).toContain(
      '`Button/ButtonLabel` → `Tooltip/useTooltip` | Button',
    );
    expect(report).toContain(
      'Button: Button → Button/Button → Button/ButtonLabel → Tooltip/useTooltip',
    );
  });

  it('fails when it crosses into a capability module, but not into its own import', () => {
    const graph = graphOf('Table/__entry__.mjs', {
      'Table/__entry__.mjs': {imports: [['Table/Table.tsx']]},
      'Table/Table.tsx': {
        imports: [
          ['Table/plugins/virtualization/useTableRowsVirtualization.ts'],
          ['Table/plugins/virtualization/useTableWindow.ts'],
        ],
      },
      'Table/plugins/virtualization/useTableRowsVirtualization.ts': {},
      'Table/plugins/virtualization/useTableWindow.ts': {},
    });
    const {crossings} = violationsOf('Table', graph);
    expect(
      crossings.map(({from, to, invariant}) => ({from, to, invariant})),
    ).toEqual([
      {
        from: 'Table/Table',
        to: 'Table/plugins/virtualization/useTableWindow',
        invariant: 'INV7',
      },
    ]);
  });

  it('passes when the import is kept out of the eager build', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {imports: [['Tooltip/Tooltip.tsx']]},
      'Tooltip/Tooltip.tsx': {bytes: 0},
    });
    expect(violationsOf('Text', graph).crossings).toEqual([]);
  });

  it('fails when it crosses through a re-export-only module that is not a folder index', () => {
    const graph = graphOf('Button/__entry__.mjs', {
      'Button/__entry__.mjs': {imports: [['Button/Button.tsx']]},
      'Button/Button.tsx': {imports: [['internal/tooltipExports.ts']]},
      'internal/tooltipExports.ts': {
        bytes: 0,
        imports: [['Tooltip/useTooltip.tsx']],
      },
      'Tooltip/useTooltip.tsx': {},
    });
    expect(violationsOf('Button', graph).crossings).toEqual([
      expect.objectContaining({
        from: 'internal/tooltipExports',
        to: 'Tooltip/useTooltip',
        invariant: 'INV1',
        chain:
          'Button → Button/Button → internal/tooltipExports → Tooltip/useTooltip',
      }),
    ]);
  });

  it('passes for a module with no bytes whose imports carry no bytes either', () => {
    const graph = graphOf('Button/__entry__.mjs', {
      'Button/__entry__.mjs': {imports: [['Button/Button.tsx']]},
      'Button/Button.tsx': {imports: [['internal/tooltipExports.ts']]},
      'internal/tooltipExports.ts': {
        bytes: 0,
        imports: [['Tooltip/useTooltip.tsx']],
      },
      'Tooltip/useTooltip.tsx': {bytes: 0},
    });
    expect(violationsOf('Button', graph).crossings).toEqual([]);
  });

  it('passes for a base module that lives in a surface folder', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {imports: [['Layer/layerScopedContext.tsx']]},
      'Layer/layerScopedContext.tsx': {},
    });
    expect(violationsOf('Text', graph).crossings).toEqual([]);
  });

  it('fails into a touch module that a module deferring a surface imports', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {
        imports: [
          ['gestures/TapGestureRecognizer.ts'],
          ['Text/TruncationTooltip.tsx'],
        ],
      },
      'Text/TruncationTooltip.tsx': {
        imports: [
          ['gestures/TapGestureRecognizer.ts'],
          ['Tooltip/Tooltip.tsx', 'dynamic-import'],
        ],
      },
      'gestures/TapGestureRecognizer.ts': {},
      'Tooltip/Tooltip.tsx': {bytes: 0},
    });
    const {crossings} = violationsOf('Text', graph);
    // Text imports the touch core for its own use; that is not a crossing.
    expect(
      crossings.map(({from, to, invariant}) => ({from, to, invariant})),
    ).toEqual([
      {
        from: 'Text/TruncationTooltip',
        to: 'gestures/TapGestureRecognizer',
        invariant: 'INV8',
      },
    ]);
  });

  it('names both invariants for a touch module in a surface folder that a module deferring a surface imports', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/TruncationTooltip.tsx']]},
      'Text/TruncationTooltip.tsx': {
        imports: [
          ['Layer/useTouchTrigger.ts'],
          ['Tooltip/Tooltip.tsx', 'dynamic-import'],
        ],
      },
      'Layer/useTouchTrigger.ts': {},
      'Tooltip/Tooltip.tsx': {bytes: 0},
    });
    const {crossings} = violationsOf('Text', graph);
    expect(
      crossings.map(({from, to, invariant}) => ({from, to, invariant})),
    ).toEqual([
      {
        from: 'Text/TruncationTooltip',
        to: 'Layer/useTouchTrigger',
        invariant: 'INV1, INV8',
      },
    ]);
  });

  it('names only INV1 for a touch module in a surface folder that a module deferring no surface imports', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {imports: [['Layer/useTouchTrigger.ts']]},
      'Layer/useTouchTrigger.ts': {},
    });
    expect(
      violationsOf('Text', graph).crossings.map(({invariant}) => invariant),
    ).toEqual(['INV1']);
  });
});

describe('an import() from an entry', () => {
  it('passes when it targets a surface whose graph reaches touch modules', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {imports: [['Tooltip/Tooltip.tsx', 'dynamic-import']]},
      'Tooltip/Tooltip.tsx': {
        bytes: 0,
        imports: [['Layer/useTouchTrigger.ts'], ['gestures/GestureArena.ts']],
      },
      'Layer/useTouchTrigger.ts': {bytes: 0},
      'gestures/GestureArena.ts': {bytes: 0},
    });
    expect(violationsOf('Text', graph)).toEqual({
      crossings: [],
      dynamicViolations: [],
    });
  });

  it('fails when it targets a touch module itself', () => {
    const graph = graphOf('Text/__entry__.mjs', {
      'Text/__entry__.mjs': {imports: [['Text/Text.tsx']]},
      'Text/Text.tsx': {
        imports: [['gestures/GestureArena.ts', 'dynamic-import']],
      },
      'gestures/GestureArena.ts': {bytes: 0},
    });
    const {dynamicViolations} = violationsOf('Text', graph);
    expect(dynamicViolations).toEqual([
      expect.objectContaining({
        from: 'Text/Text',
        to: 'gestures/GestureArena',
        invariant: 'INV8',
        chain: 'Text → Text/Text ⇢ gestures/GestureArena',
      }),
    ]);
    const comparison = compareWithAllowlist(
      rowsByCrossing([{entryName: 'Text', crossings: [], dynamicViolations}]),
      [],
    );
    expect(comparison.ok).toBe(false);
    expect(formatReport(comparison)).toContain(
      'Text: Text → Text/Text ⇢ gestures/GestureArena',
    );
  });

  it('fails when a component targets a capability module', () => {
    const graph = graphOf('Table/__entry__.mjs', {
      'Table/__entry__.mjs': {imports: [['Table/Table.tsx']]},
      'Table/Table.tsx': {
        imports: [
          ['Table/plugins/virtualization/useTableWindow.ts', 'dynamic-import'],
        ],
      },
      'Table/plugins/virtualization/useTableWindow.ts': {bytes: 0},
    });
    expect(violationsOf('Table', graph).dynamicViolations).toEqual([
      expect.objectContaining({
        to: 'Table/plugins/virtualization/useTableWindow',
        invariant: 'INV7',
      }),
    ]);
  });
});

describe('the allowlist', () => {
  const crossing = (entryName, from, to) => ({
    entryName,
    crossings: [
      {from, to, invariant: 'INV1', chain: `${entryName} → ${from} → ${to}`},
    ],
  });

  it('passes a listed crossing and prints its cost', () => {
    const rows = rowsByCrossing([
      crossing('Button', 'Button/Button', 'Tooltip/useTooltip'),
      crossing('IconButton', 'Button/Button', 'Tooltip/useTooltip'),
    ]);
    const comparison = compareWithAllowlist(rows, [
      {
        from: 'Button/Button',
        to: 'Tooltip/useTooltip',
        entries: ['Button', 'IconButton'],
      },
    ]);
    expect(comparison.ok).toBe(true);
    const costs = new Map([
      ['Button/Button → Tooltip/useTooltip', {Button: 16_486, IconButton: 0}],
    ]);
    expect(formatReport(comparison, {costs})).toContain(
      '`Button/Button` → `Tooltip/useTooltip` | Button, IconButton | Button 16.1 KB, IconButton 0.0 KB',
    );
  });

  it('fails a row whose crossing no longer occurs', () => {
    const comparison = compareWithAllowlist(rowsByCrossing([]), [
      {from: 'Link/Link', to: 'Tooltip', entries: ['Link']},
    ]);
    expect(comparison.ok).toBe(false);
    expect(comparison.stale).toEqual([
      {from: 'Link/Link', to: 'Tooltip', entries: ['Link']},
    ]);
    expect(formatReport(comparison)).toContain(
      '`Link/Link` → `Tooltip` no longer crosses: delete its row from the Allowlist table in docs/architecture/component-import-boundaries.md in this pull request.',
    );
  });

  it('fails a listed crossing that an unlisted entry reaches, or a listed entry no longer reaches', () => {
    const rows = rowsByCrossing([
      crossing('Text', 'Text/TruncationTooltip', 'Layer/useTouchTrigger'),
      crossing('Table', 'Text/TruncationTooltip', 'Layer/useTouchTrigger'),
    ]);
    const comparison = compareWithAllowlist(rows, [
      {
        from: 'Text/TruncationTooltip',
        to: 'Layer/useTouchTrigger',
        entries: ['Text', 'Heading'],
      },
    ]);
    expect(comparison.ok).toBe(false);
    expect(comparison.entryDrift).toEqual([
      expect.objectContaining({
        key: 'Text/TruncationTooltip → Layer/useTouchTrigger',
        added: ['Table'],
        removed: ['Heading'],
      }),
    ]);
  });

  it("is read from the record's allowlist table", () => {
    const rows = parseAllowlist(fs.readFileSync(RECORD, 'utf8'));
    expect(rows).toEqual([
      {
        from: 'Text/TruncationTooltip',
        to: 'Layer/useTouchTrigger',
        entries: ['Text', 'Heading', 'Button', 'IconButton', 'Link', 'Table'],
      },
      {
        from: 'Button/Button',
        to: 'Tooltip/useTooltip',
        entries: ['Button', 'IconButton'],
      },
      {from: 'Link/Link', to: 'Tooltip', entries: ['Link']},
      {from: 'Table/tableContextMenu', to: 'ContextMenu', entries: ['Table']},
      {
        from: 'Table/BaseTable',
        to: 'Table/plugins/virtualization/useTableWindow',
        entries: ['Table'],
      },
    ]);
  });

  it('is empty when the record has no allowlist table', () => {
    expect(parseAllowlist('# A record\n\nNo table.\n')).toEqual([]);
  });
});

describe('the build', () => {
  // Fixture sources live under the repository's node_modules/.cache, never
  // the system temp directory: esbuild reads the listing of each directory
  // above a file it bundles.
  const CACHE = path.join(REPO, 'node_modules/.cache/astryx-import-gate-test');
  let root = '';
  beforeAll(() => {
    fs.mkdirSync(CACHE, {recursive: true});
    root = fs.mkdtempSync(path.join(CACHE, 'run-'));
    const write = (file, text) => {
      const full = path.join(root, 'packages/core/src', file);
      fs.mkdirSync(path.dirname(full), {recursive: true});
      fs.writeFileSync(full, text);
    };
    write(
      'Badge/Badge.ts',
      "import {showTip} from '../Tooltip/Tooltip';\nexport const Badge = () => showTip('badge');\n",
    );
    write(
      'Tooltip/Tooltip.ts',
      "import {track} from '../gestures/tap';\nexport const showTip = name => track(name);\n",
    );
    write('gestures/tap.ts', 'export const track = name => name.length;\n');
    write(
      'Card/Card.ts',
      "import {showTip} from '../internal/tipExports';\nexport const Card = () => showTip('card');\n",
    );
    write(
      'internal/tipExports.ts',
      "export {showTip} from '../Tooltip/Tooltip';\n",
    );
    write(
      'Chip/Chip.ts',
      "export const Chip = () => import('../Tooltip/Tooltip').then(m => m.showTip('chip'));\n",
    );
    write(
      'Grid/Grid.ts',
      "import {windowRows} from '../Table/plugins/virtualization/useTableWindow';\nexport const Grid = rows => windowRows(rows);\n",
    );
    write(
      'Table/plugins/virtualization/useTableWindow.ts',
      'export const windowRows = rows => rows.slice(0, 10);\n',
    );
  });
  afterAll(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  const entry = (name, file) => ({
    name,
    module: `packages/core/src/${file}`,
  });

  it('finds a static surface import in a real build (positive control)', async () => {
    const {crossings} = await measureEntry(entry('Badge', 'Badge/Badge.ts'), {
      root,
      boundaries: BOUNDARIES,
    });
    expect(crossings.map(({chain}) => chain)).toEqual([
      'Badge → Badge/Badge → Tooltip/Tooltip',
    ]);
  });

  it('finds a static surface import through a re-export-only module in a real build', async () => {
    const {crossings} = await measureEntry(entry('Card', 'Card/Card.ts'), {
      root,
      boundaries: BOUNDARIES,
    });
    expect(crossings.map(({chain}) => chain)).toEqual([
      'Card → Card/Card → internal/tipExports → Tooltip/Tooltip',
    ]);
  });

  it('finds a static capability import in a real build (positive control)', async () => {
    const {crossings} = await measureEntry(entry('Grid', 'Grid/Grid.ts'), {
      root,
      boundaries: BOUNDARIES,
    });
    expect(crossings.map(({chain}) => chain)).toEqual([
      'Grid → Grid/Grid → Table/plugins/virtualization/useTableWindow',
    ]);
  });

  it('passes an import() of a surface that reaches touch code in a real build', async () => {
    const result = await measureEntry(entry('Chip', 'Chip/Chip.ts'), {
      root,
      boundaries: BOUNDARIES,
    });
    expect(result.crossings).toEqual([]);
    expect(result.dynamicViolations).toEqual([]);
  });
});

describe("Core's boundaries", () => {
  it('name the shared touch modules and the deferred surfaces the record names', () => {
    expect(CORE_BOUNDARIES.surfaceFolders).toEqual(
      expect.arrayContaining([
        'Tooltip',
        'HoverCard',
        'Popover',
        'DropdownMenu',
        'ContextMenu',
        'Layer',
      ]),
    );
    expect(
      CORE_BOUNDARIES.touchModules.some(pattern =>
        pattern.test('gestures/GestureArena'),
      ),
    ).toBe(true);
  });
});

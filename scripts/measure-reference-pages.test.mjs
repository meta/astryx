// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measure-reference-pages.test.mjs
 * @input scripts/measure-reference-pages.mjs and the INV10 record
 * @output Tests for the reference-page parser, the delta and limit math, the
 *   report and the arguments
 * @position Testing (node project)
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  UNUSED_FEATURE_LIMIT_BYTES,
  chunkGraphStats,
  keptModuleCount,
  moduleGraphStats,
  comparePages,
  formatComparison,
  USAGE,
  parseArgs,
  parseReferencePages,
} from './measure-reference-pages.mjs';

const RECORD = path.resolve(
  import.meta.dirname,
  '../docs/architecture/component-import-boundaries.md',
);

describe('parseReferencePages', () => {
  it("reads INV10's four pages from the record, with exactly their components", () => {
    expect(parseReferencePages(fs.readFileSync(RECORD, 'utf8'))).toEqual({
      docs: ['Text', 'Heading', 'Link', 'Card', 'Divider', 'List'],
      form: [
        'Button',
        'IconButton',
        'TextInput',
        'CheckboxInput',
        'Text',
        'Heading',
        'Card',
      ],
      menu: ['DropdownMenu', 'ContextMenu', 'Button', 'Text'],
      table: ['Table', 'Text', 'Button'],
    });
  });

  it('follows the sentence across line breaks and stops at the invariant', () => {
    const record = [
      '- **INV10 — An optional feature costs nothing.** Each reference page',
      '  imports exactly these Core components: the docs page Text',
      '  and List; and the table page Table. Other text names the form page',
      '- **INV11 — Next.** the menu page Button.',
    ].join('\n');
    expect(parseReferencePages(record)).toEqual({
      docs: ['Text', 'List'],
      table: ['Table'],
    });
  });

  it('fails when the record has no INV10 or INV10 names no page', () => {
    expect(() => parseReferencePages('# Record')).toThrow(/no INV10/);
    expect(() =>
      parseReferencePages('- **INV10 — Costs.** No pages here.\n#'),
    ).toThrow(/no reference pages/);
  });
});

const sizes = (
  min,
  gzip,
  components = ['Text'],
  chunks = 1,
  depth = 1,
  modules = 10,
  moduleDepth = 3,
  keptModules = 8,
) => ({
  components,
  min,
  gzip,
  modules,
  keptModules,
  moduleDepth,
  chunks,
  depth,
});

describe('moduleGraphStats', () => {
  // esbuild metafile inputs: each module's imports.
  const input = (...imports) => ({
    imports: imports.map(([path, kind = 'import-statement', external]) => ({
      path,
      kind,
      ...(external ? {external: true} : {}),
    })),
  });

  it('counts the statically reached modules and their breadth-first levels', () => {
    const inputs = {
      entry: input(['Button.js'], ['Text.js'], ['lazy.js', 'dynamic-import']),
      'Button.js': input(
        ['Text.js'],
        ['useTooltip.js'],
        ['react', 'import-statement', true],
      ),
      'Text.js': input(['tokens.js']),
      'useTooltip.js': input(['layer.js']),
      'tokens.js': input(),
      'layer.js': input(['tokens.js']),
      'lazy.js': input(['big.js']),
      'big.js': input(),
    };
    expect(moduleGraphStats(inputs, 'entry')).toEqual({
      modules: 5,
      moduleDepth: 3,
    });
  });

  it('gives a page with no imports 0 modules at depth 0', () => {
    expect(moduleGraphStats({entry: input()}, 'entry')).toEqual({
      modules: 0,
      moduleDepth: 0,
    });
  });
});

describe('keptModuleCount', () => {
  it('counts the modules with output bytes in the first-load chunks', () => {
    const outputs = {
      'entry.js': {
        imports: [
          {path: 'shared.js', kind: 'import-statement'},
          {path: 'lazy.js', kind: 'dynamic-import'},
        ],
        inputs: {
          entry: {bytesInOutput: 40},
          'Chat/index.js': {bytesInOutput: 0},
          'Chat/useChatComposerContext.js': {bytesInOutput: 600},
        },
      },
      'shared.js': {
        imports: [],
        inputs: {'utils/context.js': {bytesInOutput: 23}},
      },
      'lazy.js': {imports: [], inputs: {'Chat/Chat.js': {bytesInOutput: 9000}}},
    };
    // The barrel keeps no bytes and the lazy chunk is not first load.
    expect(keptModuleCount(outputs, 'entry.js', 'entry')).toBe(2);
  });
});

describe('chunkGraphStats', () => {
  // esbuild metafile outputs: each chunk's static and dynamic imports.
  const chunk = (...imports) => ({
    imports: imports.map(([path, kind = 'import-statement']) => ({path, kind})),
  });

  it('counts the first-load chunks and the longest static chain', () => {
    const outputs = {
      'entry.js': chunk(['a.js'], ['b.js'], ['lazy.js', 'dynamic-import']),
      'a.js': chunk(['c.js']),
      'b.js': chunk(['c.js']),
      'c.js': chunk(['d.js']),
      'd.js': chunk(),
      'lazy.js': chunk(['e.js']),
      'e.js': chunk(),
    };
    expect(chunkGraphStats(outputs, 'entry.js')).toEqual({chunks: 5, depth: 4});
  });

  it('counts a lone entry as one chunk at depth 1, and skips externals', () => {
    const outputs = {
      'entry.js': {
        imports: [{path: 'react', kind: 'import-statement', external: true}],
      },
    };
    expect(chunkGraphStats(outputs, 'entry.js')).toEqual({chunks: 1, depth: 1});
  });

  it('ends a chain at a chunk cycle', () => {
    const outputs = {
      'entry.js': chunk(['a.js']),
      'a.js': chunk(['b.js']),
      'b.js': chunk(['a.js']),
    };
    expect(chunkGraphStats(outputs, 'entry.js')).toEqual({chunks: 3, depth: 3});
  });

  it('counts levels by the shortest chain, as a waterfall loads them', () => {
    const outputs = {
      'entry.js': chunk(['a.js'], ['c.js']),
      'a.js': chunk(['b.js']),
      'b.js': chunk(['c.js']),
      'c.js': chunk(),
    };
    expect(chunkGraphStats(outputs, 'entry.js')).toEqual({chunks: 4, depth: 3});
  });
});

describe('comparePages', () => {
  const base = {docs: sizes(1000, 400), table: sizes(5000, 2000)};
  const head = {docs: sizes(1000, 400), table: sizes(5900, 2330)};

  it('reports each page base, head and delta', () => {
    expect(comparePages(base, head).pages).toEqual([
      {
        page: 'docs',
        components: ['Text'],
        base: {
          min: 1000,
          gzip: 400,
          modules: 10,
          keptModules: 8,
          moduleDepth: 3,
          chunks: 1,
          depth: 1,
        },
        head: {
          min: 1000,
          gzip: 400,
          modules: 10,
          keptModules: 8,
          moduleDepth: 3,
          chunks: 1,
          depth: 1,
        },
        delta: {
          min: 0,
          gzip: 0,
          modules: 0,
          keptModules: 0,
          moduleDepth: 0,
          chunks: 0,
          depth: 0,
        },
      },
      {
        page: 'table',
        components: ['Text'],
        base: {
          min: 5000,
          gzip: 2000,
          modules: 10,
          keptModules: 8,
          moduleDepth: 3,
          chunks: 1,
          depth: 1,
        },
        head: {
          min: 5900,
          gzip: 2330,
          modules: 10,
          keptModules: 8,
          moduleDepth: 3,
          chunks: 1,
          depth: 1,
        },
        delta: {
          min: 900,
          gzip: 330,
          modules: 0,
          keptModules: 0,
          moduleDepth: 0,
          chunks: 0,
          depth: 0,
        },
      },
    ]);
  });

  it('passes at the 0.3 KB limit and fails above it', () => {
    expect(UNUSED_FEATURE_LIMIT_BYTES).toBe(307);
    const atLimit = {table: sizes(5000, 2000 + 307)};
    const over = {table: sizes(5000, 2000 + 308)};
    expect(
      comparePages({table: base.table}, atLimit, {unusedOn: ['table']})
        .verdicts[0].pass,
    ).toBe(true);
    expect(
      comparePages({table: base.table}, over, {unusedOn: ['table']}).verdicts,
    ).toEqual([{page: 'table', gzipDelta: 308, limit: 307, pass: false}]);
  });

  it('fails on a page the comparison does not have', () => {
    expect(() => comparePages(base, head, {unusedOn: ['form']})).toThrow(
      /No reference page named "form"/,
    );
  });
});

describe('formatComparison', () => {
  it("prints each page's module graph and chunks, with their changes, below the sizes", () => {
    const report = formatComparison(
      comparePages(
        {menu: sizes(1000, 400, ['DropdownMenu'], 9, 3, 180, 9, 150)},
        {menu: sizes(1100, 420, ['DropdownMenu'], 12, 5, 190, 11, 152)},
      ),
      {base: 'main', head: 'the working tree'},
    );
    expect(report).toContain(
      'Static module graph (modules reached / modules kept after tree shaking / module depth):',
    );
    expect(report).toContain(
      '| menu | 180 / 150 / 9 | 190 / 152 / 11 | +10 / +2 / +2 |',
    );
    expect(report).toContain('| menu | 9 / 3 | 12 / 5 | +3 / +2 |');
    // The size table keeps its columns, so readers of it are unchanged.
    expect(report).toContain(
      '| menu (DropdownMenu) | 1,000 / 400 | 1,100 / 420 | +100 / +20 |',
    );
  });

  it('prints a table row per page and a line per verdict', () => {
    const report = formatComparison(
      comparePages(
        {table: sizes(363982, 126477, ['Table', 'Text'])},
        {table: sizes(364883, 126807, ['Table', 'Text'])},
        {unusedOn: ['table']},
      ),
      {base: 'main', head: 'the working tree'},
    );
    expect(report).toContain(
      '| table (Table, Text) | 363,982 / 126,477 | 364,883 / 126,807 | +901 / +330 |',
    );
    expect(report).toContain(
      'FAIL: the table page grows +330 B gzip without the feature (INV10 limit: 307 B).',
    );
  });
});

describe('parseArgs', () => {
  it('needs a base and defaults the head to the working tree', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(
      parseArgs([
        '--base',
        'origin/main',
        '--unused-on',
        'table,menu',
        '--page',
        'shell=AppShell,Text',
        '--json',
      ]),
    ).toEqual({
      base: 'origin/main',
      head: '.',
      unusedOn: ['table', 'menu'],
      extraPages: {shell: ['AppShell', 'Text']},
      json: true,
      help: false,
    });
  });

  it('asks for help with --help or -h, before any other check', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h', '--fast']).help).toBe(true);
    expect(parseArgs(['--fast', '--help']).help).toBe(true);
    expect(parseArgs(['--base', 'main', '--fsat', '-h']).help).toBe(true);
    expect(parseArgs(['--base', 'main']).help).toBe(false);
  });

  it('documents every flag, the limit and an example', () => {
    for (const text of [
      '--base',
      '--head',
      '--unused-on',
      '--page',
      '--json',
      '--help',
      `0.3 KB gzip (${UNUSED_FEATURE_LIMIT_BYTES} B)`,
      'pnpm size:pages --base origin/main --unused-on table,menu',
    ]) {
      expect(USAGE).toContain(text);
    }
  });

  it('refuses an unknown argument', () => {
    expect(() => parseArgs(['--base', 'main', '--fast'])).toThrow(
      /Unknown argument: --fast/,
    );
  });
});

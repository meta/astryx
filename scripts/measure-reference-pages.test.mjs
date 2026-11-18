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
  comparePages,
  formatComparison,
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

const sizes = (min, gzip, components = ['Text']) => ({components, min, gzip});

describe('comparePages', () => {
  const base = {docs: sizes(1000, 400), table: sizes(5000, 2000)};
  const head = {docs: sizes(1000, 400), table: sizes(5900, 2330)};

  it('reports each page base, head and delta', () => {
    expect(comparePages(base, head).pages).toEqual([
      {
        page: 'docs',
        components: ['Text'],
        base: {min: 1000, gzip: 400},
        head: {min: 1000, gzip: 400},
        delta: {min: 0, gzip: 0},
      },
      {
        page: 'table',
        components: ['Text'],
        base: {min: 5000, gzip: 2000},
        head: {min: 5900, gzip: 2330},
        delta: {min: 900, gzip: 330},
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
    });
  });

  it('refuses an unknown argument', () => {
    expect(() => parseArgs(['--base', 'main', '--fast'])).toThrow(
      /Unknown argument: --fast/,
    );
  });
});

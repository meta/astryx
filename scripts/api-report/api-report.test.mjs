// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the API report generator and the API changes renderer.
 * @input  `__fixtures__/repo`: a built fixture package with every row kind, an
 *         `./internal/*` entry point, a stylesheet, a component doc with
 *         theming targets, a private package, and a public-attribute record
 * @output Vitest assertions on report content, order, determinism, and change rows
 * @position scripts/api-report — guards architecture:public-component-api INV24
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  computeChanges,
  diffReports,
  parseReport,
  renderChanges,
} from './changes.mjs';
import {publishedPackages} from './cli.mjs';
import {generateReport, readPublicAttributes} from './generate.mjs';

const FIXTURE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/repo',
);
const run = () =>
  generateReport({repoRoot: FIXTURE_ROOT, packageDir: 'packages/demo'});

// Building the TypeScript program is the slow part; build the report once.
let report = '';
beforeAll(async () => {
  report = await run();
}, 120_000);

const fencedRows = section =>
  report
    .split(`### ${section}`)[1]
    .split('```')[1]
    .split('\n')
    .slice(1)
    .filter(line => /^\S/.test(line));

describe('generateReport', () => {
  it('is byte-identical across runs', async () => {
    expect(await run()).toBe(report);
  }, 120_000);

  it('lists exports, props, hooks, types, custom properties, theme targets, and public attributes', () => {
    expect(report).toContain('component Chip(props: ChipProps)');
    expect(report).toContain("  prop size?: ChipSize = 'md'");
    expect(report).toContain('  prop label: string');
    expect(report).toContain('  prop onSelect?: (id: string) => void');
    expect(report).toContain(
      'hook useChipState: (initial?: boolean) => readonly [boolean, (next: boolean) => void]',
    );
    expect(report).toContain(
      '  overload (label: string, size: ChipSize) => string',
    );
    expect(report).toContain('const CHIP_SIZES: readonly ChipSize[]');
    expect(report).toContain("type ChipSize = 'sm' | 'md'");
    expect(report).toContain('interface ChipProps (props of Chip)');
    expect(report).toContain('var --demo-accent (./demo.css)');
    expect(report).toContain(
      'target chip (Chip) props [isSelected, size] states [pressed]',
    );
    expect(report).toContain(
      'attr data-is-selected (theme reflection on 1 target)',
    );
    expect(report).toContain('attr data-astryx-theme (public data attribute)');
  });

  it('reports a CommonJS entry and what a subpath pattern reaches', () => {
    expect(report).toContain('function greet: (name: string) => string');
    expect(report).toContain('pattern ./lib/locales/*.json\n  en-US\n  fr-FR');
  });

  it('marks reachable internal and experimental members instead of hiding them', () => {
    expect(report).toContain('function resetChips @internal: () => void');
    expect(report).toContain('internal resetChips via .');
    expect(report).toContain('interface ChipExperimentalOptions @experimental');
  });

  it('leaves out ./internal/*, private custom properties, and unlisted attributes', () => {
    expect(report).not.toContain('secret');
    expect(report).not.toContain('--_demo-private');
    expect(report).not.toContain('--commented-out');
    expect(report).not.toContain('data-astryx-unused');
    expect(report).not.toContain('data-astryx-private');
  });

  it('details a declaration once and points later entry points at it', () => {
    expect(report.match(/^component Chip\(/gm)).toHaveLength(1);
    expect(report).toContain('Chip (.)');
    expect(report).toContain('function chipOnly: () => number');
  });

  it('sorts entry points and rows', () => {
    const entries = [...report.matchAll(/^## `([^`]+)`/gm)].map(m => m[1]);
    expect(entries).toEqual([
      '.',
      './chip',
      './cjs',
      './demo.css',
      './locales/*.json',
    ]);
    const names = fencedRows('Types').map(line => line.split(' ')[1]);
    expect(names).toEqual([...names].sort());
  });

  it('reads the public attribute list from the record', () => {
    expect(readPublicAttributes(FIXTURE_ROOT)).toEqual([
      'data-astryx-theme',
      'data-astryx-unused',
    ]);
  });
});

describe('publishedPackages', () => {
  it('skips private packages', () => {
    expect(publishedPackages(FIXTURE_ROOT).map(p => p.name)).toEqual([
      '@fixture/demo',
    ]);
  });
});

describe('API changes', () => {
  const resize = text =>
    text.replace(
      "  prop size?: ChipSize = 'md'",
      "  prop size?: ChipSize = 'sm'",
    );

  it('keys rows by entry point, section, item, and member', () => {
    expect(
      parseReport(report).get('.\0Components\0component Chip\0size')?.line,
    ).toBe("prop size?: ChipSize = 'md'");
  });

  it('reports added, changed, and removed rows, folding a wholly removed item', () => {
    const head = resize(report)
      .replace(/^function formatChip\n(?: {2}overload .*\n)+/m, '')
      .replace(
        '### Types\n\n```text\n',
        "### Types\n\n```text\ntype ChipTone = 'neutral' | 'accent'\n",
      );
    const {added, changed, removed} = diffReports(report, head);
    expect(added.map(r => r.line)).toEqual([
      "type ChipTone = 'neutral' | 'accent'",
    ]);
    expect(changed.map(r => [r.before, r.line])).toEqual([
      ["prop size?: ChipSize = 'md'", "prop size?: ChipSize = 'sm'"],
    ]);
    expect(removed.map(r => r.item)).toEqual(['function formatChip']);
  });

  it('renders one summary line, keeps the rows in a closed disclosure, and flags a stale report', () => {
    const md = renderChanges(
      computeChanges([
        {
          pkg: '@fixture/demo',
          base: report,
          head: resize(report),
          committed: report,
        },
      ]),
    );
    expect(md.split('\n')[0]).toBe(
      '**API changes:** @fixture/demo +0 · ~1 · −0 (report stale: run `pnpm api:report`)',
    );
    expect(md).toContain('<details><summary>1 API change (advisory)</summary>');
    expect(md).toContain('`<Chip size="sm" />`');
  });

  it('renders nothing when the API is unchanged and the committed report is current', () => {
    const changes = computeChanges([
      {pkg: '@fixture/demo', base: report, head: report, committed: report},
    ]);
    expect(renderChanges(changes)).toBe('');
  });
});

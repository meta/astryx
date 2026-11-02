// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the API report generator and the API changes renderer.
 * @input  `__fixtures__/repo`: a built fixture package with every row kind, an
 *         `./internal/*` entry point, a stylesheet, a component doc with
 *         theming targets, a private package, and a public-attribute record
 * @output Vitest assertions on report content, order, determinism, and change rows
 * @position scripts/api-report — guards architecture:public-component-api INV24
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  computeChanges,
  diffReports,
  parseReport,
  renderChanges,
  usageFor,
} from './changes.mjs';
import {chooseBase, publishedPackages} from './cli.mjs';
import {generateReport} from './generate.mjs';

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
      './theme.css',
    ]);
    const names = fencedRows('Types').map(line => line.split(' ')[1]);
    expect(names).toEqual([...names].sort());
  });
});

describe('publishedPackages', () => {
  it('keeps the packages a stable release publishes', () => {
    expect(publishedPackages(FIXTURE_ROOT).map(p => p.name)).toEqual([
      '@astryxdesign/demo',
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

  it('tells apart one custom property declared in two stylesheets', () => {
    expect(report).toContain('var --demo-accent (./theme.css)');
    const head = report.replace('var --demo-accent (./demo.css)\n', '');
    const {added, changed, removed} = diffReports(report, head);
    expect([added, changed]).toEqual([[], []]);
    expect(removed.map(r => r.line)).toEqual([
      'var --demo-accent (./demo.css)',
    ]);
  });

  it('renders one summary line, keeps the rows in a closed disclosure, and flags a stale report in one line', () => {
    const md = renderChanges(
      computeChanges([
        {
          pkg: '@astryxdesign/demo',
          base: report,
          head: resize(report),
          committed: report,
          baseSource: 'build',
        },
      ]),
    );
    expect(md.split('\n').slice(0, 3)).toEqual([
      '**API changes:** `demo` +0 · ~1 · −0',
      '',
      'Committed API report behind this build: `demo` 1 row; run `pnpm api:report`.',
    ]);
    expect(md).toContain('<details><summary>1 API change (advisory)</summary>');
    expect(md).toContain('`<Chip size="sm" />`');
  });

  // Main changed the API without regenerating its report; this pull request
  // adds one type. Only the type is this pull request's.
  const addTone = text =>
    text.replace(
      '### Types\n\n```text\n',
      "### Types\n\n```text\ntype ChipTone = 'neutral' | 'accent'\n",
    );

  it("lists only the pull request's rows when the committed report is behind main", () => {
    const [change] = computeChanges([
      {
        pkg: '@astryxdesign/demo',
        base: resize(report),
        head: addTone(resize(report)),
        committed: report,
        baseSource: 'build',
      },
    ]);
    expect(change.rows.map(r => r.line)).toEqual([
      "type ChipTone = 'neutral' | 'accent'",
    ]);
    expect(change).toMatchObject({stale: true, staleRows: 2});
    const md = renderChanges([change]);
    expect(md).toContain('**API changes:** `demo` +1 · ~0 · −0\n');
    expect(md).toContain(
      'Committed API report behind this build: `demo` 2 rows; run `pnpm api:report`.',
    );
    expect(md).toContain('<details><summary>1 API change (advisory)</summary>');
    expect(md).not.toContain("prop size?: ChipSize = 'sm'");
  });

  it('renders a stale report with no API change as one line', () => {
    const md = renderChanges(
      computeChanges([
        {
          pkg: '@astryxdesign/demo',
          base: resize(report),
          head: resize(report),
          committed: report,
          baseSource: 'build',
        },
        {
          pkg: '@astryxdesign/other',
          base: report,
          head: report,
          committed: report,
          baseSource: 'build',
        },
      ]),
    );
    expect(md).toBe(
      '**API changes:** none in this pull request\n\nCommitted API report behind this build: `demo` 1 row; run `pnpm api:report`.\n',
    );
  });

  it("says when rows were compared with the merge base's committed report", () => {
    const md = renderChanges(
      computeChanges([
        {
          pkg: '@astryxdesign/demo',
          base: report,
          head: resize(report),
          committed: resize(report),
          baseSource: 'committed',
        },
      ]),
    );
    expect(md.split('\n')[0]).toBe(
      "**API changes:** `demo` +0 · ~1 · −0 (against the merge base's committed report)",
    );
    expect(md).not.toContain('Committed API report behind');
  });

  it('renders version 1 changes as before', () => {
    const md = renderChanges([
      {
        pkg: '@astryxdesign/demo',
        baseline: false,
        stale: true,
        missing: false,
        counts: {added: 0, changed: 0, removed: 0},
        rows: [],
      },
    ]);
    expect(md).toBe(
      '**API changes:** `demo` no changes (report stale: run `pnpm api:report`)\n',
    );
  });

  it('summarizes a package with no report at the merge base as a new report', () => {
    const [change] = computeChanges([
      {pkg: '@astryxdesign/demo', base: null, head: report, committed: report},
    ]);
    expect(change).toMatchObject({
      baseline: true,
      rows: [],
      counts: {added: 0, changed: 0, removed: 0},
    });
    expect(renderChanges([change])).toBe(
      '**API changes:** `demo` new report\n',
    );
  });

  it.each([
    [
      'its built surface',
      {surface: 'S', haveSurface: true, unchanged: false},
      {base: 'S', baseSource: 'build'},
    ],
    [
      'this build for a package the built merge base lacks and this pull request leaves unchanged',
      {surface: null, haveSurface: true, unchanged: true},
      {base: 'H', baseSource: 'head'},
    ],
    [
      'the committed report for a changed package the built merge base lacks',
      {surface: null, haveSurface: true, unchanged: false},
      {base: 'C', baseSource: 'committed'},
    ],
    [
      'the committed report when no build of the merge base was kept',
      {surface: null, haveSurface: false, unchanged: true},
      {base: 'C', baseSource: 'committed'},
    ],
  ])("takes the merge base's report from %s", (_label, input, expected) => {
    expect(chooseBase({...input, head: 'H', committedAtBase: 'C'})).toEqual(
      expected,
    );
  });

  it('gives package-level rows a usage example of their own kind', () => {
    const rows = [...parseReport(report).values()];
    const usage = item =>
      usageFor(
        '@astryxdesign/demo',
        rows.find(r => r.item === item),
      );
    expect(usage('var --demo-accent (./demo.css)')).toBe(
      '.my-scope { --demo-accent: …; }',
    );
    expect(usage('target chip (Chip)')).toBe(
      "defineTheme({components: {'chip': {…}}})",
    );
    expect(usage('attr data-astryx-theme')).toBe('[data-astryx-theme] { … }');
    expect(usage('internal resetChips')).toBe(
      "import {resetChips} from '@astryxdesign/demo'",
    );
    expect(usage('function chipOnly')).toBe(
      "import {chipOnly} from '@astryxdesign/demo/chip'; chipOnly(…)",
    );
  });

  it('renders nothing when the API is unchanged and the committed report is current', () => {
    const changes = computeChanges([
      {
        pkg: '@astryxdesign/demo',
        base: report,
        head: report,
        committed: report,
      },
    ]);
    expect(renderChanges(changes)).toBe('');
  });
});

describe('--surface', () => {
  const surface = (repoRoot, out) => {
    execFileSync(
      process.execPath,
      [
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs'),
        '--surface',
        out,
        '--root',
        repoRoot,
      ],
      {encoding: 'utf8'},
    );
    return JSON.parse(fs.readFileSync(path.join(out, 'surface.json'), 'utf8'));
  };

  it('writes each built package report under the directory and lists it', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-surface-'));
    try {
      // The fixture carries only what the report reads; complete its build.
      const repo = path.join(tmp, 'repo');
      fs.cpSync(FIXTURE_ROOT, repo, {recursive: true});
      for (const f of [
        'lib/index.js',
        'lib/chip.js',
        'lib/internal/secret.js',
        'src/demo.css.d.ts',
      ])
        fs.writeFileSync(path.join(repo, 'packages/demo', f), '');
      const out = path.join(tmp, 'surface');
      expect(surface(repo, out)).toMatchObject({
        packages: [{name: '@astryxdesign/demo', dir: 'packages/demo'}],
        skipped: [],
      });
      expect(
        fs.readFileSync(path.join(out, 'packages/demo/api-report.md'), 'utf8'),
      ).toBe(report);
      // The checkout's committed reports are left alone.
      expect(
        fs.existsSync(path.join(repo, 'packages/demo/api-report.md')),
      ).toBe(false);
    } finally {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  }, 120_000);

  it('lists a package whose build is incomplete as skipped, with no report', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'api-surface-'));
    try {
      const {packages, skipped} = surface(FIXTURE_ROOT, out);
      expect(packages).toEqual([]);
      expect(skipped).toMatchObject([
        {
          name: '@astryxdesign/demo',
          missing: expect.arrayContaining(['packages/demo/lib/index.js']),
        },
      ]);
      expect(fs.existsSync(path.join(out, 'packages/demo'))).toBe(false);
    } finally {
      fs.rmSync(out, {recursive: true, force: true});
    }
  }, 120_000);
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the API report generator and the API changes renderer.
 * @input  `__fixtures__/repo`: a built fixture package with every row kind,
 *         overloaded components, hooks and functions, an `./internal/*` entry
 *         point, a stylesheet, a component doc with theming targets, a
 *         private package, and a public-attribute record
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
import {
  chooseBase,
  publishedPackages,
  uncomparedChanges,
} from './cli.mjs';
import {generateReport} from './generate.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
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

  it('reads an overloaded component as ComponentProps does, and lists its other signatures as tagged overloads', () => {
    expect(report).toMatch(/^component Badge\(props: BadgeProps\)$/m);
    expect(report).toContain(
      '  overload (props: BadgeProps & { color: string }) => ReactNode @deprecated',
    );
    expect(report).toContain(
      "  overload (props: Omit<BadgeProps, 'tone'> & { experimental: { glow?: boolean } }) => ReactNode @experimental",
    );
    expect(report).toContain('interface BadgeProps (props of Badge)');
    expect(report).not.toContain('BadgeColorProps');
    expect(report).not.toContain('BadgeExperimentalProps');
  });

  it('keeps the statement tags of an overloaded component declared as a const', () => {
    expect(report).toMatch(/^component Tag\(props: TagProps\) @deprecated$/m);
    expect(report).toMatch(
      /^ {2}overload \(props: TagProps & \{color: string\}\) => ReactNode$/m,
    );
    expect(report).toContain('interface TagProps (props of Tag)');
  });

  it('lists an overloaded component as internal when its row is', () => {
    expect(report).toMatch(/^component Pill\(props: PillProps\) @internal$/m);
    expect(report).toContain('internal Pill via .');
  });

  it("tags each overload of a hook or a function with its own declaration's tags", () => {
    expect(report).toContain(
      [
        'hook useChipMode',
        "  overload (mode: 'a') => string",
        '  overload () => string @deprecated',
        "  overload (mode: 'b') => number",
      ].join('\n'),
    );
    expect(report).toContain(
      [
        'function parseChip',
        '  overload (label: string, legacy: true) => string @deprecated',
        '  overload (label: string) => string',
      ].join('\n'),
    );
  });

  it('tags the row of an overloaded hook or function only with the tags every overload has', () => {
    expect(report).toMatch(/^function parseChip$/m);
    expect(report).toContain(
      [
        'function legacyChip @deprecated',
        '  overload (label: string) => string @deprecated',
        '  overload (label: string, size: ChipSize) => string @deprecated',
      ].join('\n'),
    );
  });

  it('leaves out ./internal/*, commented-out custom properties, and unlisted attributes', () => {
    expect(report).not.toContain('secret');
    expect(report).not.toContain('--commented-out');
    expect(report).not.toContain('data-astryx-private');
  });

  it('leaves out a private --_* custom property', () => {
    expect(report).not.toContain('--_demo-private');
  });

  it('leaves out a custom property name that StyleX hashed', () => {
    expect(report).not.toContain('--x1ue0wla');
  });

  it('still lists a public --astryx-* custom property', () => {
    expect(report).toContain('var --astryx-demo-offset (./demo.css)');
  });

  it('still lists a short authored name in the StyleX prefix form', () => {
    expect(report).toContain('var --xl (./demo.css)');
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

  it('renders one summary line and keeps the rows in a closed disclosure', () => {
    const md = renderChanges(
      computeChanges([
        {
          pkg: '@astryxdesign/demo',
          base: report,
          head: resize(report),
          baseSource: 'build',
        },
      ]),
    );
    expect(md.split('\n')[0]).toBe('**API changes:** `demo` +0 · ~1 · −0');
    expect(md).toContain('<details><summary>1 API change (advisory)</summary>');
    expect(md).toContain('`<Chip size="sm" />`');
  });

  it('ignores the stale-report fields an older head wrote', () => {
    expect(
      renderChanges([
        {
          pkg: '@astryxdesign/demo',
          baseline: false,
          stale: true,
          missing: false,
          staleRows: 2,
          counts: {added: 0, changed: 0, removed: 0},
          rows: [],
        },
      ]),
    ).toBe('');
  });

  it("summarizes a package the merge base's surface lacks", () => {
    const [change] = computeChanges([
      {pkg: '@astryxdesign/demo', base: null, head: report},
    ]);
    expect(change).toMatchObject({
      baseline: true,
      rows: [],
      counts: {added: 0, changed: 0, removed: 0},
    });
    expect(renderChanges([change])).toBe(
      "**API changes:** `demo` not in the merge base's build\n",
    );
  });

  it.each([
    [
      'its built surface',
      {surface: 'S', unchanged: false},
      {base: 'S', baseSource: 'build'},
    ],
    [
      'this build for a package the built merge base lacks and this pull request leaves unchanged',
      {surface: null, unchanged: true},
      {base: 'H', baseSource: 'head'},
    ],
    [
      'nowhere for a changed package the built merge base lacks',
      {surface: null, unchanged: false},
      {base: null, baseSource: 'build'},
    ],
    [
      'no report for a changed package the surface lists but could not build',
      {surface: null, unchanged: false, listed: true},
      {base: null, baseSource: 'unknown', baseUnknown: true},
    ],
    [
      'this build for an unchanged package the surface lists but could not build',
      {surface: null, unchanged: true, listed: true},
      {base: 'H', baseSource: 'head'},
    ],
  ])("takes the merge base's report from %s", (_label, input, expected) => {
    expect(chooseBase({...input, head: 'H'})).toEqual(expected);
  });

  it('marks a package whose merge-base surface is unavailable as unknown, with no rows', () => {
    const [change] = computeChanges([
      {
        pkg: '@astryxdesign/demo',
        base: null,
        baseSource: 'unknown',
        head: report,
      },
    ]);
    // merge-guard reads `baseline` as an unknown base for a package the pull
    // request touches; `baseUnknown` says why it is unknown.
    expect(change).toMatchObject({
      baseline: true,
      baseUnknown: true,
      baseSource: 'unknown',
      rows: [],
      counts: {added: 0, changed: 0, removed: 0},
    });
    expect(renderChanges([change]).split('\n')[0]).toBe(
      '**API changes:** unknown (base surface unavailable): `demo`',
    );
    expect(
      renderChanges([
        change,
        computeChanges([
          {pkg: '@astryxdesign/other', base: report, head: resize(report)},
        ])[0],
      ]).split('\n')[0],
    ).toBe(
      '**API changes:** `other` +0 · ~1 · −0; unknown (base surface unavailable): `demo`',
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

  it("gives a component's overload line the component's usage example", () => {
    const overloads = [...parseReport(report).values()].filter(
      r => r.item === 'component Badge' && r.member?.startsWith('overload '),
    );
    expect(overloads).toHaveLength(2);
    for (const row of overloads)
      expect(usageFor('@astryxdesign/demo', row)).toBe('<Badge … />');
  });

  it('renders nothing when the API is unchanged', () => {
    const changes = computeChanges([
      {pkg: '@astryxdesign/demo', base: report, head: report},
    ]);
    expect(renderChanges(changes)).toBe('');
  });

  it('renders nothing when nothing was compared and no published package changed', () => {
    expect(renderChanges([], {compared: false})).toBe('');
  });

  it('names each changed package as unknown when nothing was compared', () => {
    const changes = uncomparedChanges(
      [
        {name: '@astryxdesign/demo', dir: 'packages/demo'},
        {name: '@astryxdesign/quiet', dir: 'packages/quiet'},
      ],
      dir => dir === 'packages/quiet',
    );
    expect(changes).toEqual([
      {
        pkg: '@astryxdesign/demo',
        baseline: true,
        baseUnknown: true,
        baseSource: 'unknown',
        counts: {added: 0, changed: 0, removed: 0},
        rows: [],
      },
    ]);
    expect(renderChanges(changes, {compared: false})).toBe(
      '**API changes:** not compared: no built surface of the merge base; unknown: `demo`\n',
    );
  });
});

describe('--changes without a merge-base surface', () => {
  const changes = (...args) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'api-changes-'));
    try {
      execFileSync(
        process.execPath,
        [
          path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs'),
          '--changes',
          ...args,
          '--out',
          out,
        ],
        {encoding: 'utf8'},
      );
      return {
        json: JSON.parse(
          fs.readFileSync(path.join(out, 'api-changes.json'), 'utf8'),
        ),
        md: fs.readFileSync(path.join(out, 'api-changes.md'), 'utf8'),
      };
    } finally {
      fs.rmSync(out, {recursive: true, force: true});
    }
  };

  it('writes no empty delta: with no merge base to read, every published package is unknown', () => {
    const {json, md} = changes();
    const published = publishedPackages(REPO_ROOT).map(p => p.name);
    expect(json.version).toBe(2);
    expect(json.baseRecord).toBeNull();
    expect(json.packages.map(p => p.pkg).sort()).toEqual(published.sort());
    for (const p of json.packages)
      expect(p).toMatchObject({
        baseline: true,
        baseUnknown: true,
        baseSource: 'unknown',
        rows: [],
      });
    expect(md.split('\n')[0]).toMatch(
      /^\*\*API changes:\*\* not compared: no built surface of the merge base; unknown: /,
    );
  }, 60_000);

  it('lists no package and renders nothing when no published package changed since the merge base', () => {
    const {json, md} = changes('--base', 'HEAD');
    expect(json).toMatchObject({version: 2, baseRecord: null, packages: []});
    expect(md).toBe('');
  }, 60_000);
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
      // Nothing is written into the checkout.
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

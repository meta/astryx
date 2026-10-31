// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pr-status.test.mjs
 * Pins the compact PR report: the preview line's states; one table of
 * modified components (the name linking its docs page, a Storybook link, JS
 * and CSS size and lines of code against main with growth in bold, and the
 * fixed-position Visual · A11y · RTL marks only when a suite ran), three rows
 * visible and the rest collapsed, most important first; the visual deltas
 * with frames for the published shots only; the package line; and the one
 * not-run or wide-change line.
 */

import {describe, expect, it} from 'vitest';
import status from './pr-status.js';

const {
  baseJobName,
  suiteRunState,
  sizeCell,
  locCell,
  checksCell,
  buildComponentTable,
  buildVisualDeltas,
  previewLine,
  packagesLine,
  notRunLine,
  SUITES,
  VISUAL_FRAME_LIMIT,
} = status;

const HEAD = 'a'.repeat(40);
const ORIGIN = 'https://astryx-abc123-fbopensource.vercel.app';
const size = (importGzipBytes, cssGzipBytes = 1024) => ({
  importGzipBytes,
  cssGzipBytes,
});

describe('previewLine', () => {
  it.each([
    [
      'ready',
      {state: 'ready', sha: HEAD, url: ORIGIN},
      `### 🔎 Preview · \`aaaaaaa\`\n\n**[Storybook](${ORIGIN}/storybook/) · [Sandbox](${ORIGIN}/sandbox/)** · built from this PR's head`,
    ],
    [
      'building',
      {state: 'building', sha: HEAD, aliasOrigin: ORIGIN},
      `⏳ Building… Until it's ready, **[Storybook](${ORIGIN}/storybook/)`,
    ],
    ['failed', {state: 'failed', sha: HEAD}, 'failed to build'],
    ['unknown', {state: 'unknown', sha: HEAD}, 'cannot be known in advance'],
  ])('says what a %s preview is', (_label, preview, text) => {
    expect(previewLine(preview)).toContain(text);
  });

  it('says nothing on a draft', () => {
    expect(previewLine(null)).toBe('');
  });
});

describe('sizeCell and locCell', () => {
  it('shows JS and CSS with their change, growth in bold', () => {
    expect(sizeCell(size(105_370, 25_600), size(105_062, 25_700))).toBe(
      '102.9 kB (**+308 B**) · 25.0 kB CSS (−100 B)',
    );
    expect(sizeCell(size(1024, 1024), size(1024, 1024))).toBe(
      '1.0 kB (0) · 1.0 kB CSS (0)',
    );
  });

  it('marks growth past the touch-only budget, JavaScript or CSS', () => {
    expect(sizeCell(size(5000), size(2000))).toMatch(/^🔴 /);
    expect(sizeCell(size(1000, 3000), size(1000, 1000))).toMatch(/^🔴 /);
    expect(sizeCell(size(4000), size(2000))).not.toMatch(/🔴/);
  });

  it('shows a new component as new, and an unmeasured one as a dash', () => {
    expect(sizeCell(size(1024), {})).toBe('1.0 kB (new) · 1.0 kB CSS (new)');
    expect(sizeCell({}, size(1))).toBe('—');
  });

  it('counts lines of code against main', () => {
    expect(locCell(124, 120)).toBe('124 (**+4**)');
    expect(locCell(120, 124)).toBe('120 (−4)');
    expect(locCell(120, undefined)).toBe('120 (new)');
    expect(locCell(undefined, 1)).toBe('—');
  });
});

describe('checksCell', () => {
  it('keeps Visual · A11y · RTL in fixed positions', () => {
    expect(checksCell({visual: 'pass', a11y: null, rtl: 'fail'})).toBe(
      '✓ · — · ✗',
    );
    expect(checksCell({visual: 'changed'})).toBe('✗ · — · —');
  });
});

describe('buildComponentTable', () => {
  const analysis = rows => ({
    componentSizes: Object.fromEntries(
      rows.map(([key, after]) => [key, size(after)]),
    ),
    baseComponentSizes: Object.fromEntries(
      rows.map(([key, , before]) => [key, size(before)]),
    ),
    componentStats: {B: {storyTitle: 'Core/B', linesOfCode: 50}},
    baseComponentStats: {B: {linesOfCode: 40}},
  });

  it('shows three rows, the most important first, and collapses the rest', () => {
    const table = buildComponentTable({
      analysis: analysis([
        ['core/A', 1000, 1000],
        ['core/B', 2000, 1500],
        ['core/C', 1200, 1100],
        ['core/D', 900, 1000],
      ]),
      origin: ORIGIN,
      a11yReport: {components: {D: {violations: [{id: 'x'}]}}},
    });
    const [visible, rest] = table.split('<details>');
    // D's failed accessibility result comes first, then the biggest growth.
    expect(visible.match(/^\| \[[A-D]\]/gm)).toEqual([
      '| [D]',
      '| [B]',
      '| [C]',
    ]);
    expect(visible).toContain('### Modified components');
    expect(visible).toContain(
      '| Component | Size | LoC | Visual · A11y · RTL |',
    );
    expect(rest).toContain('<summary>1 more component</summary>');
    expect(rest).toContain('| [A]');
    expect(table).toContain(
      `| [B](${ORIGIN}/components/B) · [Storybook](${ORIGIN}/storybook/?path=/docs/core-b--docs) | 2.0 kB (**+500 B**) · 1.0 kB CSS (0) | 50 (**+10**) | — · — · — |`,
    );
    expect(table).toContain('| — · ✗ · — |');
  });

  it('has no checks column when no suite ran, and no disclosure for three rows', () => {
    const table = buildComponentTable({
      analysis: analysis([['core/A', 1000, 1000]]),
      origin: '',
    });
    expect(table).toContain('| Component | Size | LoC |\n');
    expect(table).toContain('| A |');
    expect(table).not.toContain('<details>');
  });

  it('lists a modified component folder with no size', () => {
    const table = buildComponentTable({
      analysis: {
        baseSha: 'a'.repeat(40),
        modifiedComponents: ['Card'],
        componentStats: {Card: {package: '@astryxdesign/lab', linesOfCode: 9}},
      },
      origin: '',
    });
    expect(table).toContain('| lab/Card | — | 9 (new) |');
  });

  it('says not measured, never new, when main has no sizes for the merge base', () => {
    const table = buildComponentTable({
      analysis: {
        componentSizes: {
          'core/Card': {importGzipBytes: 2048, cssGzipBytes: null},
        },
        componentStats: {Card: {linesOfCode: 9}},
      },
      origin: '',
    });
    expect(table).toContain(
      '| Card | 2.0 kB (not measured) | 9 (not measured) |',
    );
  });

  it('never shows a pass for a visual run that failed', () => {
    const table = buildComponentTable({
      analysis: {
        baseSha: 'a'.repeat(40),
        componentSizes: {
          'core/Card': {importGzipBytes: 2048, cssGzipBytes: null},
        },
        baseComponentSizes: {
          'core/Card': {importGzipBytes: 2048, cssGzipBytes: null},
        },
      },
      origin: '',
      visualVerdict: {status: 'failed', changes: []},
    });
    expect(table).toContain('| ✗ · — · — |');
  });

  it('renders nothing when no component changed', () => {
    expect(buildComponentTable({analysis: {}, origin: ORIGIN})).toBe('');
  });
});

describe('buildVisualDeltas', () => {
  const change = (key, diffPixels, component = 'Card') => ({
    key,
    component,
    name: key,
    theme: 'neutral',
    mode: 'light',
    diffPixels,
  });

  it('collapses the changed shots under their count, largest change first', () => {
    const verdict = {
      status: 'changed',
      counts: {total: 20},
      changes: [change('a', 1), change('b', 1500), change('c', 9, 'Chip')],
      added: ['core-dialog--default__neutral-light'],
      removed: ['core-old--default__neutral-light'],
    };
    const section = buildVisualDeltas({verdict});
    expect(section).toMatch(
      /^<details>\n<summary>Visual changes: 5 snapshots in 4 components<\/summary>/,
    );
    expect(section.match(/^\| \S+ · [a-c] /gm)).toEqual([
      '| Card · b ',
      '| Chip · c ',
      '| Card · a ',
    ]);
    expect(section).toContain(
      '| Card · b (neutral, light) | changed (1,500 px) |',
    );
    expect(section).toContain(
      '| core-dialog--default\\_\\_neutral-light | added |',
    );
    expect(section).toContain(
      '| core-old--default\\_\\_neutral-light | removed |',
    );
  });

  it(`lists at most ${VISUAL_FRAME_LIMIT} shots and counts the rest`, () => {
    const changes = Array.from({length: VISUAL_FRAME_LIMIT + 3}, (_, i) =>
      change(`s${i}`, 100 - i),
    );
    const section = buildVisualDeltas({
      verdict: {status: 'changed', counts: {total: 99}, changes},
    });
    expect(section.match(/\| changed \(/g)).toHaveLength(VISUAL_FRAME_LIMIT);
    expect(section).toContain("3 more are in the run's visual report.");
  });

  it('shows thumbnails for the frames publish-frames.mjs published, and only those', () => {
    const section = buildVisualDeltas({
      verdict: {
        status: 'changed',
        changes: [change('b', 50), change('a', 1)],
        added: ['core-dialog--default__neutral-light'],
      },
      frames: {
        imageBase: 'https://raw.example/frames',
        published: [
          'before/b.png',
          'after/b.png',
          'diff/b.png',
          'after/core-dialog--default__neutral-light.png',
        ],
      },
    });
    expect(section).toContain('| Component · story | Before | After | Diff |');
    expect(section).toContain(
      '<img src="https://raw.example/frames/before/b.png" height="120" alt="before frame">',
    );
    expect(section).toContain(
      '| Card · a (neutral, light) | not published | not published | not published |',
    );
    // An added shot has an after frame only.
    expect(section).toContain(
      '| — | <img src="https://raw.example/frames/after/core-dialog--default__neutral-light.png" height="120" alt="after frame"> | — |',
    );
  });

  it('is absent without changes, or when the visual run failed', () => {
    expect(buildVisualDeltas({verdict: {status: 'ok', changes: []}})).toBe('');
    expect(buildVisualDeltas({verdict: null})).toBe('');
    expect(
      buildVisualDeltas({
        verdict: {status: 'failed', changes: [change('a', 1)]},
      }),
    ).toBe('');
  });
});

describe('packagesLine', () => {
  const entry = (name, before, after, overBudget = false) => ({
    name,
    base: {packedBytes: before},
    head: {packedBytes: after},
    overBudget,
  });

  it('puts one changed package on one line', () => {
    expect(
      packagesLine({
        verdict: 'pass',
        packages: [
          entry('@astryxdesign/core', 3_570_000, 3_574_096),
          entry('@astryxdesign/build', 5000, 5000),
        ],
        addedDependencies: [],
      }),
    ).toBe(
      '**Package size:** @astryxdesign/core 3.41 MB packed (**+4.0 kB**); no new dependencies.\n\n',
    );
  });

  it('lists several changed packages, three then the rest collapsed, unchanged ones left out', () => {
    const line = packagesLine({
      verdict: 'over-budget',
      packages: [
        entry('@astryxdesign/core', 100000, 120000, true),
        entry('@astryxdesign/richtext', 5000, 4000),
        entry('@astryxdesign/cli', 9000, 9100),
        entry('@astryxdesign/theme-neutral', 9000, 9000),
        entry('@astryxdesign/build', 9000, 9200),
      ],
      addedDependencies: [
        {
          package: '@astryxdesign/cli',
          field: 'dependencies',
          name: 'left-pad',
          range: '1',
        },
      ],
    });
    expect(line).toContain(
      '- @astryxdesign/core 117.2 kB packed (**+19.5 kB**) 🔴; no new dependencies',
    );
    expect(line).toContain(
      '- @astryxdesign/richtext 3.9 kB packed (−1000 B); no new dependencies',
    );
    expect(line).toContain(
      '- @astryxdesign/cli 8.9 kB packed (**+100 B**); new dependency: left-pad',
    );
    expect(line).toContain('<summary>1 more package</summary>');
    expect(line).not.toContain('theme-neutral');
  });

  it('says when nothing changed, and when main has no base yet', () => {
    expect(
      packagesLine({
        verdict: 'pass',
        packages: [entry('@astryxdesign/core', 1, 1)],
      }),
    ).toBe(
      '**Package size:** no published package changed; no new dependencies.\n\n',
    );
    expect(packagesLine({verdict: 'no-base', packages: []})).toContain(
      'no measurement of the merge base',
    );
    expect(packagesLine(null)).toBe('');
  });
});

describe('notRunLine', () => {
  const skipped = name => ({name, conclusion: 'skipped', steps: []});

  it('names the label for one suite', () => {
    expect(
      notRunLine({
        jobs: [
          skipped('pr-rtl'),
          {name: 'Stable visual regression', conclusion: 'success'},
          {name: 'pr-a11y', conclusion: 'success'},
        ],
      }),
    ).toBe('Not run on this PR: add `ci:run-rtl` to run it.\n\n');
  });

  it('names several suites in one line', () => {
    expect(
      notRunLine({
        jobs: [
          skipped(
            'Stable visual scout (${{ matrix.shard }}/${{ strategy.job-total }})',
          ),
          skipped('Accessibility spec-test contracts'),
          skipped('pr-rtl (core)'),
        ],
      }),
    ).toBe(
      'Not run on this PR: add `ci:run-visual`, `ci:run-a11y` or `ci:run-rtl` to run them.\n\n',
    );
  });

  it('leaves the line out when the Storybook build failed', () => {
    expect(
      notRunLine({
        jobs: [
          {name: 'build-storybook', conclusion: 'failure'},
          {name: 'pr-visual', conclusion: 'skipped'},
          {name: 'pr-a11y (full audit)', conclusion: 'skipped'},
        ],
      }),
    ).toBe('');
  });

  it('says nothing when every suite ran, and falls back to the reports without a job list', () => {
    expect(notRunLine({jobs: []})).toBe('');
    expect(notRunLine({jobs: null, a11yReport: {components: {}}})).toBe(
      'Not run on this PR: add `ci:run-visual` to run it.\n\n',
    );
  });
});

describe('job names', () => {
  it("folds a skipped matrix's unexpanded name, parentheses and all", () => {
    expect(
      baseJobName(
        "pr-rtl (${{ matrix.package }}${{ (((matrix.parts > 1) && format(' {0}/{1}', matrix.part, matrix.parts)) || '') }})",
      ),
    ).toBe('pr-rtl');
    const rtl = SUITES.find(suite => suite.id === 'rtl');
    expect(
      suiteRunState(rtl, [{name: 'pr-rtl (core)', conclusion: 'success'}]),
    ).toBe('ran');
    expect(suiteRunState(rtl, [])).toBeNull();
  });
});

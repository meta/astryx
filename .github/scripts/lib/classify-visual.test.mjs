// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file classify-visual.test.mjs
 * Tests for the static visual-diff classifier (#3667): signal detection,
 * file filtering, scoring buckets, and the review-signal loading contract.
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {
  classifyVisualDiff,
  JSX_CAP,
  styleContextLines,
  styleContextPaths,
} from './classify-visual.js';

// Build a minimal unified diff for a single file. Lines are raw content;
// they get prefixed with +/- here.
function makeDiff(file, added = [], removed = []) {
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,9 +1,9 @@',
    ...removed.map(l => `-${l}`),
    ...added.map(l => `+${l}`),
  ].join('\n');
}

function sourceBackedStyleChange(file, added, removed) {
  const prefix = [
    "import * as stylex from '@stylexjs/stylex';",
    'const styles = stylex.create({',
    '  root: {',
  ];
  const suffix = ['  },', '});'];
  const baseLines = [
    ...prefix,
    ...removed.map(line => `    ${line}`),
    ...suffix,
  ];
  const headLines = [...prefix, ...added.map(line => `    ${line}`), ...suffix];
  const diff = [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${baseLines.length} +1,${headLines.length} @@`,
    ...prefix.map(line => ` ${line}`),
    ...removed.map(line => `-    ${line}`),
    ...added.map(line => `+    ${line}`),
    ...suffix.map(line => ` ${line}`),
  ].join('\n');
  return {
    diff,
    sources: {
      [file]: {base: baseLines.join('\n'), head: headLines.join('\n')},
    },
  };
}

describe('classifyVisualDiff', () => {
  it('returns non-visual for an empty diff', () => {
    const result = classifyVisualDiff('');
    expect(result.score).toBe(0);
    expect(result.bucket).toBe('non-visual');
  });

  it('counts CSS property edits inside a component file', () => {
    const diff = makeDiff('packages/core/src/Button/Button.tsx', [
      'paddingBlock: spacingVars.sm,',
      "minHeight: '2.5rem',",
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(2);
    // 2×3 (props) + 1×2 (spacingVars token) = 8
    expect(result.score).toBe(8);
    expect(result.bucket).toBe('likely-visual');
  });

  it('counts removed lines as well as added lines', () => {
    const diff = makeDiff(
      'packages/core/src/Card/Card.tsx',
      [],
      ['boxShadow: shadowVars.raised,'],
    );
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(1);
    expect(result.signals.tokenReferences).toBe(1);
  });

  it('does not count TypeScript type members as CSS properties', () => {
    const diff = makeDiff('packages/core/src/Button/Button.tsx', [
      'width: number;',
      'height: string;',
      'color: string,',
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(0);
  });

  it('matches every token group via the generic *Vars. pattern', () => {
    const diff = makeDiff('packages/core/src/Card/Card.tsx', [
      'boxShadow: shadowVars.overlay,',
      'borderColor: borderVars.subtle,',
      'transitionDuration: durationVars.fast,',
      "fontSize: textSizeVars['--font-size-sm'],",
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.signals.tokenReferences).toBe(4);
  });

  it('flags style-surface files by path', () => {
    const diff = [
      makeDiff('packages/core/src/Field/inputStyles.stylex.ts', [
        'const x = 1;',
      ]),
      makeDiff('apps/docsite/src/app/globals.css', ['--brand-accent: #f00;']),
      makeDiff('packages/themes/matcha/src/theme.ts', ['const y = 2;']),
    ].join('\n');
    const result = classifyVisualDiff(diff);
    expect(result.signals.styleSurfaceFiles).toBe(3);
    expect(result.styleSurfacePaths).toContain(
      'packages/core/src/Field/inputStyles.stylex.ts',
    );
  });

  it('does not flag marker stylex files as style surfaces', () => {
    const diff = makeDiff(
      'packages/core/src/CheckboxInput/checkbox.markers.stylex.ts',
      ['export const hoverMarker = stylex.defineMarker();'],
    );
    const result = classifyVisualDiff(diff);
    expect(result.signals.styleSurfaceFiles).toBe(0);
  });

  it('counts kebab-case properties and custom properties in .css files', () => {
    const diff = makeDiff('apps/docsite/src/app/globals.css', [
      'background-color: #fff;',
      '--sidebar-width: 240px;',
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(2);
    expect(result.signals.styleSurfaceFiles).toBe(1);
  });

  it('still flags deleted style-surface files', () => {
    const diff = [
      'diff --git a/packages/core/src/Layout/padding.stylex.ts b/packages/core/src/Layout/padding.stylex.ts',
      'deleted file mode 100644',
      '--- a/packages/core/src/Layout/padding.stylex.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const padding = stylex.create({',
      '-  root: {padding: spacingVars.md},',
    ].join('\n');
    const result = classifyVisualDiff(diff);
    expect(result.signals.styleSurfaceFiles).toBe(1);
    expect(result.signals.tokenReferences).toBe(1);
  });

  it('ignores test, story, doc, and markdown files entirely', () => {
    const styleLine = 'padding: spacingVars.md,';
    const diff = [
      makeDiff('packages/core/src/Button/Button.test.tsx', [styleLine]),
      makeDiff('apps/storybook/stories/Button.stories.tsx', [styleLine]),
      makeDiff('packages/core/src/Button/Button.doc.mjs', [styleLine]),
      makeDiff('packages/core/src/__tests__/TestIcon.tsx', [
        '<svg viewBox="0 0 24 24">',
      ]),
      // ESLint-plugin fixture of intentional style violations
      makeDiff('packages/core/src/Badge/Badge.test-violations.tsx', [
        "fontSize: '14px',",
        "color: '#ff0000',",
      ]),
      makeDiff('CONTRIBUTING.md', [styleLine]),
    ].join('\n');
    const result = classifyVisualDiff(diff);
    expect(result.score).toBe(0);
    expect(result.bucket).toBe('non-visual');
  });

  it('does not scan YAML/JSON files for property-like keys', () => {
    const diff = makeDiff('apps/docsite/config.yml', ['width: 100']);
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(0);
  });

  it('scans only product surfaces — tooling files never count', () => {
    const diff = [
      makeDiff('.github/scripts/test-pr-enrichment.js', [
        "{ file: 'packages/core/src/Button/Button.tsx', line: 'paddingBlock: spacingVars.sm,' },",
      ]),
      makeDiff('vitest.config.ts', ["fontSize: '14px',"]),
      makeDiff('scripts/build-css.mjs', ['padding: spacingVars.md,']),
    ].join('\n');
    const result = classifyVisualDiff(diff);
    expect(result.score).toBe(0);
    expect(result.bucket).toBe('non-visual');
  });

  it('skips comment lines', () => {
    const diff = makeDiff('packages/core/src/Button/Button.tsx', [
      '// padding: spacingVars.md,',
      '* color: colorVars.accent',
      '/* opacity: 0.5 */',
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.score).toBe(0);
  });

  it('skips lines inside multi-line block comments', () => {
    const diff = makeDiff('packages/core/src/Button/Button.tsx', [
      '/*',
      'padding: spacingVars.md,',
      'opacity: 0.5,',
      '*/',
      'gap: spacingVars.sm,',
    ]);
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(1);
    expect(result.signals.tokenReferences).toBe(1);
    expect(result.evidence.cssProperties[0].line).toBe('gap: spacingVars.sm,');
  });

  it('tracks block-comment state per diff side', () => {
    // A removed `/*` must not silence added lines.
    const diff = [
      'diff --git a/packages/core/src/Button/Button.tsx b/packages/core/src/Button/Button.tsx',
      'index 1111111..2222222 100644',
      '--- a/packages/core/src/Button/Button.tsx',
      '+++ b/packages/core/src/Button/Button.tsx',
      '@@ -1,3 +1,3 @@',
      '-/*',
      '+opacity: 0.5,',
      '-*/',
    ].join('\n');
    const result = classifyVisualDiff(diff);
    expect(result.signals.cssProperties).toBe(1);
  });

  it('counts JSX structural changes only in packages/**/*.tsx', () => {
    const jsxLines = ['<VisuallyHidden>', '</VisuallyHidden>'];
    const inPackages = classifyVisualDiff(
      makeDiff('packages/core/src/Banner/Banner.tsx', jsxLines),
    );
    expect(inPackages.signals.jsxStructuralChanges).toBe(2);

    const inApps = classifyVisualDiff(
      makeDiff('apps/docsite/src/app/page.tsx', jsxLines),
    );
    expect(inApps.signals.jsxStructuralChanges).toBe(0);
  });

  it('excludes JSX fragments from the structural signal', () => {
    const diff = makeDiff('packages/core/src/Banner/Banner.tsx', ['<>', '</>']);
    const result = classifyVisualDiff(diff);
    expect(result.signals.jsxStructuralChanges).toBe(0);
  });

  it('caps the JSX contribution to the score', () => {
    const lines = Array.from(
      {length: JSX_CAP + 5},
      (_, i) => `<div data-i={${i}}>`,
    );
    const result = classifyVisualDiff(
      makeDiff('packages/core/src/Table/Table.tsx', lines),
    );
    expect(result.signals.jsxStructuralChanges).toBe(JSX_CAP + 5);
    expect(result.score).toBe(JSX_CAP);
  });

  it('buckets scores per the #3667 thresholds', () => {
    // 4 props + 4 token refs + 1 style file in a stylex file: 12+8+3 → visual
    const visual = classifyVisualDiff(
      makeDiff('packages/core/src/Field/inputStyles.stylex.ts', [
        'padding: spacingVars.md,',
        'color: colorVars.accent,',
        'borderRadius: radiusVars.lg,',
        'gap: spacingVars.xs,',
      ]),
    );
    expect(visual.bucket).toBe('visual');

    // A lone token-reference swap: 2 → maybe
    const maybe = classifyVisualDiff(
      makeDiff('packages/core/src/Button/Button.tsx', [
        'const tone = colorVars.accent;',
      ]),
    );
    expect(maybe.score).toBe(2);
    expect(maybe.bucket).toBe('maybe-visual');

    // Pure logic change → non-visual
    const logic = classifyVisualDiff(
      makeDiff('packages/core/src/Table/useSort.ts', [
        'const sorted = useMemo(() => rows.sort(compare), [rows, compare]);',
      ]),
    );
    expect(logic.bucket).toBe('non-visual');
  });

  it('collects capped evidence samples with file attribution', () => {
    const result = classifyVisualDiff(
      makeDiff('packages/core/src/Button/Button.tsx', ['opacity: 0.5,']),
    );
    expect(result.evidence.cssProperties).toEqual([
      {file: 'packages/core/src/Button/Button.tsx', line: 'opacity: 0.5,'},
    ]);
  });

  it('honors opts.ignorePath for caller-defined exclusions (review-signal safe spaces)', () => {
    const isSafeSpace = p =>
      /^packages\/lab\//.test(p) || /^apps\/(sandbox|storybook)\//.test(p);
    const diff = [
      makeDiff('packages/lab/src/Rating/Rating.tsx', [
        'padding: spacingVars.md,',
      ]),
      makeDiff('apps/sandbox/src/page.tsx', ['opacity: 0.5,']),
      makeDiff('packages/core/src/Button/Button.tsx', ['gap: spacingVars.sm,']),
    ].join('\n');
    const result = classifyVisualDiff(diff, {ignorePath: isSafeSpace});
    // Only the core Button line counts: 1 prop + 1 token ref
    expect(result.signals.cssProperties).toBe(1);
    expect(result.signals.tokenReferences).toBe(1);
  });

  describe('appearanceOnly', () => {
    it('accepts source-proven declaration-only edits in an existing Core runtime file', () => {
      const change = sourceBackedStyleChange(
        'packages/core/src/Button/Button.tsx',
        ['paddingBlock: spacingVars.md,', 'opacity: 0.9,'],
        ['paddingBlock: spacingVars.sm,', 'opacity: 1,'],
      );
      const result = classifyVisualDiff(change.diff, {sources: change.sources});
      expect(result.appearanceOnly).toBe(true);
      expect(result.appearanceReasons).toEqual([]);
    });

    it('allows component-local authority and visual evidence beside the pixels', () => {
      const change = sourceBackedStyleChange(
        'packages/core/src/Button/Button.tsx',
        ['color: colorVars.accent,'],
        ['color: colorVars.primary,'],
      );
      const result = classifyVisualDiff(
        [
          change.diff,
          makeDiff('docs/specs/components/Button/Button.spec.md', [
            '| DD1 | Keep the label quiet. | Preserve emphasis. | Label | Theme tokens may vary. |',
          ]),
          makeDiff('evidence/button-after.png', ['binary evidence']),
        ].join('\n'),
        {sources: change.sources},
      );
      expect(result.appearanceOnly).toBe(true);
    });

    it('fails closed without both trusted source versions', () => {
      const change = sourceBackedStyleChange(
        'packages/core/src/Button/Button.tsx',
        ['opacity: 0.9,'],
        ['opacity: 1,'],
      );
      expect(classifyVisualDiff(change.diff).appearanceOnly).toBe(false);
      expect(
        classifyVisualDiff(change.diff, {
          sources: {
            'packages/core/src/Button/Button.tsx': {
              base: change.sources['packages/core/src/Button/Button.tsx'].base,
            },
          },
        }).appearanceOnly,
      ).toBe(false);
    });

    it('does not accept a commented or locally shadowed stylex.create shape', () => {
      const file = 'packages/core/src/Button/Button.tsx';
      const commentedSource = [
        "import * as stylex from '@stylexjs/stylex';",
        '/*',
        'const styles = stylex.create({',
        '  root: {',
        '    width: sizeVars.control,',
        '  },',
        '});',
        '*/',
      ].join('\n');
      const commentedDiff = [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        '@@ -5 +5 @@',
        '-    width: sizeVars.control,',
        '+    width: sizeVars.compact,',
      ].join('\n');
      const commentedHead = commentedSource.replace(
        'width: sizeVars.control',
        'width: sizeVars.compact',
      );
      expect(
        classifyVisualDiff(commentedDiff, {
          sources: {[file]: {base: commentedSource, head: commentedHead}},
        }).appearanceOnly,
      ).toBe(false);

      const localChange = sourceBackedStyleChange(
        file,
        ['width: sizeVars.compact,'],
        ['width: sizeVars.control,'],
      );
      for (const side of ['base', 'head']) {
        localChange.sources[file][side] = localChange.sources[file][
          side
        ].replace(
          "import * as stylex from '@stylexjs/stylex';",
          'const stylex = localStyleRuntime;',
        );
      }
      expect(
        classifyVisualDiff(localChange.diff, {sources: localChange.sources})
          .appearanceOnly,
      ).toBe(false);
    });

    it.each([
      ['display', "'none'"],
      ['visibility', "'hidden'"],
      ['pointerEvents', "'none'"],
      ['touchAction', "'none'"],
      ['userSelect', "'none'"],
      ['resize', "'none'"],
      ['cursor', "'pointer'"],
      ['overflow', "'hidden'"],
      ['overflowX', "'auto'"],
      ['overflowY', "'scroll'"],
      ['overscrollBehavior', "'contain'"],
      ['scrollBehavior', "'smooth'"],
      ['scrollMargin', "'8px'"],
      ['scrollPadding', "'8px'"],
      ['scrollSnapType', "'x mandatory'"],
      ['scrollSnapAlign', "'center'"],
      ['scrollbarWidth', "'none'"],
    ])(
      'rejects added and removed interaction-affecting %s declarations',
      (property, value) => {
        for (const side of ['added', 'removed']) {
          const unsafe = `${property}: ${value},`;
          const change = sourceBackedStyleChange(
            'packages/core/src/Button/Button.tsx',
            side === 'added' ? [unsafe] : ['opacity: 0.9,'],
            side === 'removed' ? [unsafe] : ['opacity: 1,'],
          );
          const result = classifyVisualDiff(change.diff, {
            sources: change.sources,
          });
          expect(result.appearanceOnly, `${property} ${side}`).toBe(false);
          expect(result.appearanceReasons).toContain(
            'interaction-affecting style property',
          );
        }
      },
    );

    it.each([
      'width: runBehaviorAndReturnWidth(value),',
      'width: (value = nextWidth),',
      'width: counter++,',
      'width: --counter,',
      'width: behaviorVars.width,',
    ])('rejects executable declaration value %s', addedLine => {
      const change = sourceBackedStyleChange(
        'packages/core/src/Button/Button.tsx',
        [addedLine],
        ['width: sizeVars.control,'],
      );
      const result = classifyVisualDiff(change.diff, {sources: change.sources});
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain('non-style Core runtime line');
    });

    it('rejects a CSS-shaped key in an unrelated object in the same hunk', () => {
      const file = 'packages/core/src/Button/Button.tsx';
      const base = [
        "import * as stylex from '@stylexjs/stylex';",
        'const styles = stylex.create({',
        '  root: {',
        '    color: colorVars.primary,',
        '  },',
        '});',
        'const dimensions = {',
        '  width: sizeVars.control,',
        '};',
      ];
      const head = [...base];
      head[3] = '    color: colorVars.accent,';
      head[7] = '  width: sizeVars.compact,';
      const diff = [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        '@@ -1,9 +1,9 @@',
        " import * as stylex from '@stylexjs/stylex';",
        ' const styles = stylex.create({',
        '   root: {',
        '-    color: colorVars.primary,',
        '+    color: colorVars.accent,',
        '   },',
        ' });',
        ' const dimensions = {',
        '-  width: sizeVars.control,',
        '+  width: sizeVars.compact,',
        ' };',
      ].join('\n');
      const result = classifyVisualDiff(diff, {
        sources: {[file]: {base: base.join('\n'), head: head.join('\n')}},
      });
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain(
        'changed line lacks source-backed stylex.create proof',
      );
    });

    it('does not mistake spaced update expressions for file headers after a hunk starts', () => {
      const file = 'packages/core/src/Button/Button.tsx';
      const base = [
        "import * as stylex from '@stylexjs/stylex';",
        'const styles = stylex.create({',
        '  root: {',
        '    opacity: 1,',
        '  },',
        '});',
        '-- counter;',
      ];
      const head = [...base];
      head[3] = '    opacity: 0.9,';
      head[6] = '++ counter;';
      const diff = [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        '@@ -1,7 +1,7 @@',
        " import * as stylex from '@stylexjs/stylex';",
        ' const styles = stylex.create({',
        '   root: {',
        '-    opacity: 1,',
        '+    opacity: 0.9,',
        '   },',
        ' });',
        '--- counter;',
        '+++ counter;',
      ].join('\n');
      const result = classifyVisualDiff(diff, {
        sources: {[file]: {base: base.join('\n'), head: head.join('\n')}},
      });
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain(
        'changed line lacks source-backed stylex.create proof',
      );
    });

    it('rejects an imported runtime dependency beside a visual declaration', () => {
      const file = 'packages/core/src/Button/Button.tsx';
      const base = [
        "import * as stylex from '@stylexjs/stylex';",
        'const styles = stylex.create({',
        '  root: {',
        '    opacity: 1,',
        '  },',
        '});',
      ];
      const head = [
        base[0],
        'import {runBehavior} from "./behavior";',
        ...base.slice(1),
      ];
      head[4] = '    opacity: 0.9,';
      const diff = [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        '@@ -1,2 +1,3 @@',
        ` ${base[0]}`,
        '+import {runBehavior} from "./behavior";',
        ` ${base[1]}`,
        '@@ -3,4 +4,4 @@',
        ` ${base[2]}`,
        `-${base[3]}`,
        `+${head[4]}`,
        ` ${base[4]}`,
        ` ${base[5]}`,
      ].join('\n');
      const result = classifyVisualDiff(diff, {
        sources: {[file]: {base: base.join('\n'), head: head.join('\n')}},
      });
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain(
        'changed line lacks source-backed stylex.create proof',
      );
    });

    it.each([
      {
        name: 'JSX structure',
        added: ['<span>Label</span>'],
        removed: ['opacity: 1,'],
        reason: 'JSX structure',
      },
      {
        name: 'an imported symbol',
        added: ['import {runBehavior} from "./behavior";'],
        removed: ['opacity: 1,'],
        reason: 'non-style Core runtime line',
      },
      {
        name: 'runtime logic',
        added: ['const pressed = state === "pressed";'],
        removed: ['opacity: 1,'],
        reason: 'non-style Core runtime line',
      },
    ])(
      'rejects $name even inside a stylex.create range',
      ({added, removed, reason}) => {
        const change = sourceBackedStyleChange(
          'packages/core/src/Button/Button.tsx',
          added,
          removed,
        );
        const result = classifyVisualDiff(change.diff, {
          sources: change.sources,
        });
        expect(result.appearanceOnly).toBe(false);
        expect(result.appearanceReasons.length).toBeGreaterThan(0);
        if (reason !== 'JSX structure') {
          expect(result.appearanceReasons).toContain(reason);
        }
      },
    );

    it.each([
      {
        name: 'Core to lab',
        oldPath: 'packages/core/src/Button/Button.tsx',
        newPath: 'packages/lab/src/Button/Button.tsx',
      },
      {
        name: 'unsafe to sandbox',
        oldPath: 'packages/build/src/Button.ts',
        newPath: 'apps/sandbox/src/Button.ts',
      },
    ])('fails closed for a $name rename', ({oldPath, newPath}) => {
      const diff = [
        `diff --git a/${oldPath} b/${newPath}`,
        'similarity index 99%',
        `rename from ${oldPath}`,
        `rename to ${newPath}`,
        `--- a/${oldPath}`,
        `+++ b/${newPath}`,
        '@@ -1 +1 @@',
        '-export const value = 1;',
        '+export const value = 2;',
      ].join('\n');
      const result = classifyVisualDiff(diff, {
        ignorePath: file =>
          /^packages\/lab\//.test(file) ||
          /^apps\/(sandbox|storybook)\//.test(file),
      });
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain('renamed path');
    });

    it.each([
      {
        name: 'a new runtime file',
        diff: `${makeDiff('packages/core/src/NewThing/NewThing.tsx', [
          'color: colorVars.accent,',
        ])}\nnew file mode 100644`,
        reason: 'new or deleted Core runtime file',
      },
      {
        name: 'a renamed runtime file',
        diff: makeDiff('packages/core/src/Button/Button.tsx', [
          'color: colorVars.accent,',
        ]).replace(
          'a/packages/core/src/Button/Button.tsx b/packages/core/src/Button/Button.tsx',
          'a/packages/core/src/Button/Button.tsx b/packages/core/src/Action/Action.tsx',
        ),
        reason: 'renamed path',
      },
      {
        name: 'a public barrel',
        diff: makeDiff('packages/core/src/Button/index.ts', [
          'color: colorVars.accent,',
        ]),
        reason: 'public API or package path',
      },
      {
        name: 'an unknown Core source path',
        diff: makeDiff('packages/core/src/Button/styles.json', ['color: red']),
        reason: 'unknown runtime path',
      },
    ])('rejects $name', ({diff, reason}) => {
      const result = classifyVisualDiff(diff);
      expect(result.appearanceOnly).toBe(false);
      expect(result.appearanceReasons).toContain(reason);
    });

    it('rejects mixed runtime or tooling paths', () => {
      const change = sourceBackedStyleChange(
        'packages/core/src/Button/Button.tsx',
        ['color: colorVars.accent,'],
        ['color: colorVars.primary,'],
      );
      for (const otherDiff of [
        makeDiff('packages/build/src/compile.ts', [
          'return compileWithNewBehavior(input);',
        ]),
        makeDiff('scripts/release.mjs', ['publishRelease();']),
      ]) {
        const result = classifyVisualDiff(`${change.diff}\n${otherDiff}`, {
          sources: change.sources,
        });
        expect(result.appearanceOnly).toBe(false);
        expect(result.appearanceReasons).toContain('unknown runtime path');
      }
    });
  });
});

// A diff that adds a whole file, with the bytes the style-context test reads.
function addedFile(file, lines) {
  return {
    diff: [
      `diff --git a/${file} b/${file}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${file}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map(l => `+${l}`),
    ].join('\n'),
    styleSources: {[file]: {head: lines.join('\n')}},
  };
}

// A diff that removes `removed` (0-based line indexes) from a file.
function removedLines(file, lines, removed) {
  const hunks = removed.map((at, i) =>
    [`@@ -${at + 1},1 +${at + 1 - i},0 @@`, `-${lines[at]}`].join('\n'),
  );
  return {
    diff: [
      `diff --git a/${file} b/${file}`,
      'index 1111111..2222222 100644',
      `--- a/${file}`,
      `+++ b/${file}`,
      ...hunks,
    ].join('\n'),
    styleSources: {[file]: {base: lines.join('\n')}},
  };
}

const cssCount = ({diff, styleSources}) =>
  classifyVisualDiff(diff, {styleSources}).signals.cssProperties;

describe('CSS-named keys count only in a style context', () => {
  it('scores a route that removes data objects with a `content` key at 0', () => {
    // The docs site's old MCP route built its results as
    // `{content: [{type: 'text', text}]}`.
    const route = [
      "import {createMcpHandler} from 'mcp-handler';",
      '',
      'const handler = createMcpHandler(server => {',
      "  server.tool('search', 'Search', {query: z.string()}, async ({query}) => {",
      '    const results = search(query);',
      '    return {',
      "      content: [{type: 'text' as const, text: JSON.stringify(results)}],",
      '    };',
      '  });',
      "  server.tool('get', 'Get', {name: z.string()}, async ({name}) => {",
      '    const result = get(name);',
      '    if (!result) {',
      '      return {',
      '        content: [',
      "          {type: 'text' as const, text: `No match for ${name}`},",
      '        ],',
      '        isError: true,',
      '      };',
      '    }',
      "    return {content: [{type: 'text' as const, text: JSON.stringify(result)}]};",
      '  });',
      '});',
      '',
      'export {handler as GET, handler as POST};',
    ];
    const file = 'apps/docsite/src/app/mcp/route.ts';
    const change = removedLines(file, route, [6, 13]);
    const result = classifyVisualDiff(change.diff, {
      styleSources: change.styleSources,
    });
    expect(result.signals.cssProperties).toBe(0);
    expect(result.score).toBe(0);
    expect(result.bucket).toBe('non-visual');
    // The same diff without the file's bytes counts as before.
    expect(classifyVisualDiff(change.diff).signals.cssProperties).toBe(2);
  });

  it('scores a stylex.create declaration as before', () => {
    const lines = [
      "import * as stylex from '@stylexjs/stylex';",
      'const styles = stylex.create({',
      '  root: {',
      "    padding: '8px',",
      '    opacity: 0.5,',
      '  },',
      '});',
    ];
    expect(cssCount(addedFile('packages/core/src/A/A.tsx', lines))).toBe(2);
  });

  it('scores the other stylex style calls, a theme and Web Animations keyframes', () => {
    const lines = [
      "const vars = stylex.defineVars({color: 'red'});",
      'const fade = stylex.keyframes({',
      '  from: {opacity: 0},',
      '  to: {',
      '    opacity: 1,',
      '  },',
      '});',
      'export const theme = defineTheme({',
      '  components: {',
      '    button: {',
      "      borderRadius: 'var(--radius-full)',",
      '    },',
      '  },',
      '});',
      'element.animate(',
      '  [',
      '    {',
      '      opacity: 0,',
      '    },',
      '  ],',
      '  {duration: 200},',
      ');',
    ];
    expect(cssCount(addedFile('packages/core/src/A/motion.ts', lines))).toBe(3);
  });

  it('scores a JSX style, xstyle or named style attribute, and a style property', () => {
    const lines = [
      'export function A() {',
      '  return (',
      "    <div style={{color: 'red',",
      '      padding: 4}} title="don\'t">',
      '      <B',
      '        xstyle={{',
      '          margin: 0,',
      '        }}',
      '        contentStyle={{',
      '          width: 10,',
      '        }}',
      '      />',
      '    </div>',
      '  );',
      '}',
      'const props = {',
      '  style: {',
      "    height: '1em',",
      '  },',
      '};',
    ];
    expect(cssCount(addedFile('packages/core/src/A/A.tsx', lines))).toBe(4);
  });

  it('scores Object.assign onto an element style', () => {
    const lines = [
      'Object.assign(shield.style, {',
      "  position: 'fixed',",
      "  inset: '0',",
      '});',
      'Object.assign(options, {',
      '  width: 10,',
      '});',
    ];
    expect(cssCount(addedFile('packages/core/src/A/shield.ts', lines))).toBe(2);
  });

  it('scores a named object typed as style, or read inside a style context, and a function whose result is', () => {
    const lines = [
      "import type {CSSProperties} from 'react';",
      'const root: CSSProperties = {',
      "  height: '100dvh',",
      '};',
      'const SECONDARY = {',
      "  backgroundColor: 'transparent',",
      '};',
      'const sizing = (width: number) => ({',
      '  width: `${width}px`,',
      '});',
      'const rect = {',
      '  left: 0,',
      '};',
      'export const theme = defineTheme({',
      '  button: {secondary: SECONDARY},',
      '});',
      'export function A() {',
      '  return <div style={{...root, ...sizing(4)}} />;',
      '}',
      'measure(rect);',
    ];
    expect(cssCount(addedFile('packages/core/src/A/A.tsx', lines))).toBe(3);
  });

  it('scores motion targets, SVG presentation props spread onto an intrinsic element, and values passed to a dynamic style', () => {
    const lines = [
      "import * as stylex from '@stylexjs/stylex';",
      'panel.play({',
      '  opacity: between(progress, 0, 1),',
      '});',
      'const svgProps = {',
      "  fill: 'none',",
      '};',
      'export const Icon = () => <svg {...svgProps} />;',
      'const sheet = stylex.create({',
      '  size: (width: string) => ({width}),',
      '});',
      'function resolveSizing(width: number) {',
      '  return {',
      '    width: `${width}px`,',
      '  };',
      '}',
      'const sizing = resolveSizing(4);',
      'export const A = () => <div {...stylex.props(sheet.size(sizing.width))} />;',
      'const data = {',
      '  height: 3,',
      '};',
      'export const B = () => <Chart {...data} />;',
    ];
    const covered = styleContextLines(lines.join('\n'), true);
    // The motion target, the spread props, the dynamic style's own body and
    // the helper whose result it is given; not a data object spread onto a
    // component.
    for (const at of [3, 6, 10, 14])
      expect(covered.has(at), String(at)).toBe(true);
    expect(covered.has(20)).toBe(false);
  });

  it('scores a .css file and a .stylex.ts file throughout', () => {
    expect(
      cssCount(
        addedFile('packages/core/src/A/A.css', ['.a {', '  color: red;', '}']),
      ),
    ).toBe(1);
    expect(
      cssCount(
        addedFile('packages/core/src/A/tokens.stylex.ts', [
          'export const sizes = {',
          '  width: 4,',
          '};',
        ]),
      ),
    ).toBe(1);
  });

  it('ignores a CSS-named key in a data object, a type and a geometry helper', () => {
    const lines = [
      'type Rect = {left: number; top: number};',
      'export function grow(rect: Rect, by: number): Rect {',
      '  return {',
      '    left: rect.left - by,',
      '    top: rect.top - by,',
      '  };',
      '}',
      'const column = {',
      '  position: 3,',
      '};',
    ];
    expect(cssCount(addedFile('packages/core/src/A/geometry.ts', lines))).toBe(
      0,
    );
  });

  it('keeps counting when the bytes do not hold the line or do not lex', () => {
    const lines = ['const x = {', '  opacity: 1,', '};'];
    const file = 'packages/core/src/A/a.ts';
    const {diff} = addedFile(file, lines);
    // Bytes of another revision: the line is not where the diff puts it.
    expect(
      classifyVisualDiff(diff, {
        styleSources: {[file]: {head: ['', ...lines].join('\n')}},
      }).signals.cssProperties,
    ).toBe(1);
    // An unclosed string: the file does not lex.
    expect(styleContextLines("const a = 'open\n", false)).toBeNull();
    expect(
      classifyVisualDiff(diff, {
        styleSources: {[file]: {head: `${lines.join('\n')}\nconst a = '`}},
      }).signals.cssProperties,
    ).toBe(1);
  });

  it('reads JSX text, comments, strings, regular expressions and generics without moving a boundary', () => {
    const lines = [
      'const pattern = /[{(]/g;',
      'const quote = "}";',
      '// a stray brace }',
      'const pick = <T,>(value: T) => value;',
      'export function A() {',
      '  return (',
      "    <p>Don't {'move'} }</p>",
      '  );',
      '}',
      'const styles = stylex.create({',
      '  a: {',
      '    color: `${pattern}`,',
      '  },',
      '});',
    ];
    const covered = styleContextLines(lines.join('\n'), true);
    expect(covered).not.toBeNull();
    expect([...covered]).toEqual([10, 11, 12, 13, 14]);
  });

  it('names the file revisions a diff needs', () => {
    const file = 'packages/core/src/A/A.tsx';
    const diff = [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      '@@ -1,2 +1,2 @@',
      '-  width: 1,',
      '+  width: 2,',
      `diff --git a/packages/core/src/A/A.css b/packages/core/src/A/A.css`,
      '@@ -1,1 +1,1 @@',
      '+  color: red;',
      'diff --git a/packages/core/src/A/plain.ts b/packages/core/src/A/plain.ts',
      '@@ -1,1 +1,1 @@',
      '+  label: 2,',
    ].join('\n');
    expect(styleContextPaths(diff)).toEqual({[file]: {base: true, head: true}});
  });
});

// The style-context test reads a pull request's files inside the review job,
// so its cost must grow with the file, never faster, for every construct it
// walks. Each case builds an input of size n and 10n and compares the times,
// not a fixed limit: a linear pass grows about 10 times, a quadratic one about
// 100 times. The best of three runs keeps a slow moment from deciding.
describe('style-context limits', () => {
  it('reads a style context with more names than a call can take as arguments', () => {
    // Names are queued one at a time; spreading them into one call would
    // overflow the call stack past about 120,000.
    const source = [
      'const styles = stylex.create({',
      ...Array.from({length: 130000}, (_, i) => `  n${i}: {width: 1},`),
      '});',
    ].join('\n');
    expect(styleContextLines(source, false)).not.toBeNull();
  });
});

describe('style-context cost grows with the file', () => {
  const best = source => {
    let fastest = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      styleContextLines(source, true);
      fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
  };
  const lines = (count, each) => Array.from({length: count}, (_, i) => each(i));
  // Each construct the test walks, as an input of size n.
  const CONSTRUCTS = {
    'plain code': n =>
      lines(n, i => `const value${i} = compute(${i}) + 1;`).join('\n'),
    'strings, templates, comments and regular expressions': n =>
      lines(
        n,
        i => `const s${i} = '}' + \`\${a}{\` + /[{(]/.test(b); // } {`,
      ).join('\n'),
    'nested brackets and style contexts': n =>
      [
        'const styles = stylex.create({',
        ...lines(n, () => 'a: {'),
        'width: 1',
        ...lines(n, () => '}'),
        '});',
      ].join('\n'),
    'nested style-named properties': n =>
      [
        'const props = {',
        ...lines(n, () => 'style: {'),
        'width: 1',
        ...lines(n, () => '}'),
        '};',
      ].join('\n'),
    'nested functions': n =>
      [
        ...lines(n, i => `function f${i}() {`),
        'return {width: 1};',
        ...lines(n, () => '}'),
        'const styles = stylex.create({x: f0()});',
      ].join('\n'),
    'many names in one style context (fan-out)': n =>
      [
        'const styles = stylex.create({',
        ...lines(n, i => `  n${i}: {width: 1},`),
        '});',
      ].join('\n'),
    'a chain of named objects': n =>
      [
        ...lines(n, i => `const o${i} = {a: o${i + 1}};`),
        `const o${n} = {color: 1};`,
        'const styles = stylex.create({x: o0});',
      ].join('\n'),
    'many bindings of one name, read many times': n =>
      [
        ...lines(n, () => '{ const s = {width: 1}; }'),
        ...lines(n * 6, () => 'use(s);'),
        'const styles = stylex.create({x: s});',
      ].join('\n'),
    'call results and the functions they call': n =>
      [
        ...lines(n, () => 'function make() { return {width: 1}; }'),
        ...lines(n, i => `const r${i} = make();`),
        `const styles = stylex.create({${lines(n, i => `a${i}: r${i}`).join(', ')}});`,
      ].join('\n'),
    'spreads onto intrinsic elements': n =>
      [
        'const svgProps = {fill: "none"};',
        'export const A = () => (',
        '  <div>',
        ...lines(n, () => '    <svg {...svgProps} />'),
        '  </div>',
        ');',
      ].join('\n'),
    'deep JSX with style attributes': n =>
      [
        'export const A = () => (',
        ...lines(n, () => '<div style={{color: "red"}}>text\'s {"x"}'),
        ...lines(n, () => '</div>'),
        ');',
      ].join('\n'),
    'generic arrows and type arguments': n =>
      lines(
        n,
        i =>
          `const p${i} = <T,>(v: T) => v; const t${i} = <Table<Row> rows={r} />;`,
      ).join('\n'),
    'declarations with conditional calls': n =>
      lines(
        n,
        i =>
          `const sizing${i} = ready ? ${'?'.repeat(60)} : resolve${i}(${i});`,
      ).join('\n'),
  };

  for (const [construct, build] of Object.entries(CONSTRUCTS)) {
    it(`grows about linearly for ${construct}`, () => {
      const n = 6000;
      const small = build(n);
      const large = build(n * 10);
      // Warm the function so the first run's compile time is not measured.
      styleContextLines(small, true);
      const ratio = best(large) / Math.max(best(small), 1);
      // Linear is about 10; quadratic is about 100.
      expect(
        ratio,
        `${construct}: ${ratio.toFixed(1)}x for 10x the input`,
      ).toBeLessThan(30);
    });
  }
});

describe('review-signal loading contract', () => {
  // review-signal.yml has no checkout: it fetches this file from the base ref
  // via the API and instantiates it with new Function(module, exports, require).
  // Pin that contract so a refactor (ESM syntax, a require of another module)
  // fails here instead of silently breaking the workflow's content signal.
  it('instantiates via new Function without a real require', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./classify-visual.js', import.meta.url)),
      'utf8',
    );
    const mod = {exports: {}};
    new Function('module', 'exports', 'require', src)(mod, mod.exports, () => {
      throw new Error('classify-visual.js must stay dependency-free');
    });
    const result = mod.exports.classifyVisualDiff(
      makeDiff('packages/core/src/Button/Button.tsx', ['opacity: 0.5,']),
    );
    expect(result.signals.cssProperties).toBe(1);
  });

  it('is given the bytes of every file the style-context test needs', () => {
    const workflow = readFileSync(
      fileURLToPath(
        new URL('../../workflows/review-signal.yml', import.meta.url),
      ),
      'utf8',
    );
    // A classifier loaded from an older base has no styleContextPaths.
    expect(workflow).toContain(
      "typeof mod.exports.styleContextPaths === 'function'",
    );
    expect(workflow).toMatch(
      /classifyVisualDiff\(String\(diff\), \{[^}]*styleSources,/,
    );
  });
});
